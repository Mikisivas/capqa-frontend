import { ApiError } from "../api/client";
import { auditNumber, average, cachedAudits, findAudit, rememberAudit } from "../api/auditCache";
import { loadClassrooms, loadDirectory, hallName } from "../api/directory";
import { userName } from "../api/directory";
import { facilities } from "../api/services";
import type { AuditResultStatus, ExamHallAudit } from "../api/types";
import { R } from "../routes";
import type { Route, RouteContext } from "../router";
import { hasRole } from "../session";
import { alert, backLink, badge, bindCounters, confirmDialog, dataTable, emptyState, icon, needsApiBanner, pageHead, toast } from "../ui/components";
import { $, $$, fmtDateTime, html, label, mount, Safe } from "../ui/html";

const INSPECT = ["ADMIN", "QUALITY-INSPECTOR"] as const;
const ITEMS = [
  { key: "ventilation", n: "Ventilation", i: "wind", q: "Are fans, windows and air flow adequate for a full hall?" }, { key: "lighting", n: "Lighting", i: "sun", q: "Can every seat read an exam script comfortably?" },
  { key: "seating", n: "Seating", i: "seat", q: "Are chairs and desks enough, intact and spaced for invigilation?" }, { key: "audio_system", n: "Audio system", i: "volume", q: "Can announcements be heard clearly at the back of the hall?" },
  { key: "cleanliness", n: "Cleanliness", i: "sparkles", q: "Are floors, desks and toilets clean and free of litter?" },
] as const;
const WORDS = ["Very poor", "Poor", "Fair", "Good", "Excellent"];
const RESULTS: { v: AuditResultStatus; d: string }[] = [{ v: "SUITABLE", d: "Ready for examinations" }, { v: "NEEDS_ATTENTION", d: "Usable after listed fixes" }, { v: "NOT_SUITABLE", d: "Do not use for examinations" }];
const starColor = (v: number) => v >= 4 ? "#166534" : v === 3 ? "#d97706" : "#dc2626";
const stars = (v: number, size = 16) => html`<span class="stars-sm" aria-hidden="true">${[1, 2, 3, 4, 5].map((n) => html`<span style="color:${n <= v ? starColor(v) : "#cbd5e1"};display:flex">${icon("star", size)}</span>`)}</span>`;
type Rec = Record<(typeof ITEMS)[number]["key"], number>;

// ============ WIZARD ============
async function wizard({ root, query }: RouteContext): Promise<void> {
  const halls = await loadClassrooms(true);
  const st = { step: 0, hall: Number(query.get("hall")) || 0, r: { ventilation: 0, lighting: 0, seating: 0, audio_system: 0, cleanliness: 0 } as Rec, comments: "", result: "" as AuditResultStatus | "", search: "", saving: false };
  if (st.hall && !halls.some((h) => h.id === st.hall)) st.hall = 0;
  const names = ["Hall", ...ITEMS.map((i) => i.n), "Comments and result"];

  const draw = (): void => {
    const idx = st.step - 1; const hall = halls.find((h) => h.id === st.hall);
    const body: Safe = st.step === 0 ? html`<section class="stack" aria-labelledby="w-hall"><h1 class="h1" id="w-hall">Which hall are you auditing?</h1>
        <label class="input-wrap"><span class="sr-only">Search halls</span><span class="lead">${icon("search", 18)}</span><input class="input" type="search" id="hs" value="${st.search}" placeholder="Search halls"></label>
        <div class="stack-sm" role="radiogroup" aria-label="Hall">${halls.filter((h) => !st.search || h.name.toLowerCase().includes(st.search.toLowerCase())).map((h) => html`<label class="radio-card ${h.id === st.hall ? "is-on" : ""}" style="min-height:64px"><input type="radio" name="hall" value="${h.id}" ${h.id === st.hall ? "checked" : ""}><span style="flex:1 1 auto"><span class="strong">${h.name}</span><br><span class="t-xs muted">${h.building ?? "No building"} · ${h.capacity} seats</span></span></label>`)}
        ${halls.length ? "" : emptyState("No halls yet", "An administrator or academic officer must add halls first.")}</div></section>`
      : st.step <= 5 ? html`<section class="stack" aria-labelledby="w-item"><div class="row" style="gap:12px;flex-wrap:nowrap"><span class="ico-box" style="width:48px;height:48px">${icon(ITEMS[idx]!.i, 24)}</span><div><span class="t-xs muted">${hall?.name ?? ""}</span><h1 class="h1" id="w-item">${ITEMS[idx]!.n}</h1></div></div>
        <p class="muted">${ITEMS[idx]!.q}</p><fieldset style="border:0;padding:0;margin:0"><legend class="sr-only">${ITEMS[idx]!.n} rating, 1 to 5</legend>
          <div class="stars" role="radiogroup" style="justify-content:space-between;max-width:340px">${[1, 2, 3, 4, 5].map((n) => html`<button type="button" class="star ${n <= st.r[ITEMS[idx]!.key] ? "on" : ""}" role="radio" aria-checked="${n === st.r[ITEMS[idx]!.key]}" aria-label="${n} — ${WORDS[n - 1]}" data-rate="${n}" style="width:56px;height:56px">${icon("star", 36).value.replace('fill="none"', n <= st.r[ITEMS[idx]!.key] ? 'fill="currentColor"' : 'fill="none"')}</button>`)}</div>
          <p class="t-base strong" style="margin-top:8px" aria-live="polite">${st.r[ITEMS[idx]!.key] ? `${st.r[ITEMS[idx]!.key]} of 5 — ${WORDS[st.r[ITEMS[idx]!.key] - 1]}` : "Tap a star to rate"}</p></fieldset>
        <div class="card card-flat card-body stack-sm" style="padding:14px"><span class="label">Photo evidence <span class="opt">(optional)</span></span><div class="row"><button type="button" class="btn btn-secondary btn-lg" disabled>${icon("camera", 18)}Take or add photo</button></div><span class="help">Photo upload needs backend support and is not available yet.</span></div></section>`
      : html`<section class="stack" aria-labelledby="w-res"><h1 class="h1" id="w-res">Comments and result</h1><div class="card card-flat card-body stack-sm" style="padding:14px"><span class="t-sm strong">Your ratings</span>
          ${ITEMS.map((i) => html`<div class="row-between t-sm"><span>${i.n}</span><span class="row" style="gap:6px">${stars(st.r[i.key], 14)}<span class="strong num">${st.r[i.key]} / 5</span></span></div>`)}</div>
        <div class="field"><label class="label" for="w-cm">Comments <span class="opt">(optional)</span></label><textarea id="w-cm" name="comments" class="textarea" maxlength="2000">${st.comments}</textarea><div class="counter" data-counter="comments" data-max="2000">0 / 2000</div></div>
        <fieldset style="border:0;padding:0;margin:0" class="field"><legend class="label" style="margin-bottom:6px">Final result <span class="req" aria-hidden="true">*</span></legend><div class="stack-sm">${RESULTS.map((r) => html`<label class="radio-card ${r.v === st.result ? "is-on" : ""}" style="min-height:56px"><input type="radio" name="res" value="${r.v}" ${r.v === st.result ? "checked" : ""}>${badge("aud", r.v)}<span class="t-xs muted">${r.d}</span></label>`)}</div></fieldset>
        <div id="step-err"></div></section>`;
    const canNext = st.step === 0 ? !!st.hall : st.step <= 5 ? st.r[ITEMS[idx]!.key] > 0 : !!st.result;
    mount(root, html`<div style="max-width:600px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:20px"><div class="stack-sm"><div class="row-between"><span class="t-sm strong">Step ${st.step + 1} of 7 · ${names[st.step]}</span><span class="t-sm muted">${Math.round(((st.step + 1) / 7) * 100)}%</span></div>
      <div class="progress" role="progressbar" aria-label="Audit progress" aria-valuemin="1" aria-valuemax="7" aria-valuenow="${st.step + 1}"><span style="width:${((st.step + 1) / 7) * 100}%"></span></div></div>${body}
      <div class="action-bar"><button type="button" class="btn btn-secondary btn-lg" id="back" ${st.step === 0 ? "disabled" : ""}>${icon("arrow-left", 18)}Back</button>
        ${st.step < 6 ? html`<button type="button" class="btn btn-primary btn-lg" id="next" ${canNext ? "" : "disabled"}>Next${icon("arrow-right", 18)}</button>` : html`<button type="button" class="btn btn-primary btn-lg" id="save" ${st.result && !st.saving ? "" : "disabled"}>${st.saving ? "Saving…" : "Save audit"}</button>`}</div></div>`);
    $("#back", root)!.addEventListener("click", () => { st.step = Math.max(0, st.step - 1); draw(); });
    $("#next", root)?.addEventListener("click", () => { st.step += 1; draw(); });
    $<HTMLInputElement>("#hs", root)?.addEventListener("input", (e) => { st.search = (e.target as HTMLInputElement).value; draw(); $<HTMLInputElement>("#hs", root)!.focus(); });
    $$("input[name=hall]", root).forEach((r) => r.addEventListener("change", () => { st.hall = Number((r as HTMLInputElement).value); draw(); }));
    $$("[data-rate]", root).forEach((b) => b.addEventListener("click", () => { st.r[ITEMS[idx]!.key] = Number((b as HTMLElement).dataset.rate); draw(); }));
    $$("input[name=res]", root).forEach((r) => r.addEventListener("change", () => { st.result = (r as HTMLInputElement).value as AuditResultStatus; draw(); }));
    $<HTMLTextAreaElement>("#w-cm", root)?.addEventListener("input", (e) => { st.comments = (e.target as HTMLTextAreaElement).value; });
    bindCounters(root);
    $("#save", root)?.addEventListener("click", async () => {
      st.saving = true; draw();
      try {
        const a = await facilities.createAudit({ classroom_id: st.hall, ...st.r, comments: st.comments.trim() || undefined, result_status: st.result });
        rememberAudit(a); toast("success", "Audit saved as draft", "Review it, then finalise."); location.hash = R.auditFinalise(a.id);
      } catch (err) { st.saving = false; draw(); $("#step-err", root)!.innerHTML = alert("danger", "We couldn't save this audit", err instanceof ApiError ? err.message : "Please try again.", "alert-circle").value; }
    });
    // Keyboard: allow 1-5 to rate quickly.
  };
  draw();
}

// ============ FINALISE ============
async function finalisePage({ root, params }: RouteContext): Promise<void> {
  const [halls, dir] = await Promise.all([loadClassrooms(), loadDirectory()]);
  const a = findAudit(params.id!); if (!a) throw new ApiError(404, "NOT_FOUND", "This audit is not stored in this browser. The server cannot fetch a single audit yet.");
  const locked = a.lifecycle_status === "FINALISED";
  mount(root, html`<div style="max-width:600px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:20px">
    ${locked ? html`<div class="banner-locked" role="status">${icon("lock", 18)}<span class="strong">Finalised, read-only</span><span class="muted">${fmtDateTime(a.finalised_at)}</span></div>` : alert("success", "Audit saved as draft", "Review it, then finalise to lock the result.", "check-circle")}
    <div class="stack-sm"><div class="row"><span class="mono t-sm muted">${auditNumber(a)}</span>${badge("life", a.lifecycle_status)}</div><h1 class="h1">${hallName(a.classroom_id, halls)}</h1><p class="muted">Audited ${fmtDateTime(a.created_at)} by ${userName(a.inspector_id, dir)}</p></div>
    <section class="card ${locked ? "readonly" : ""}"><div class="card-body stack-sm">${ITEMS.map((i) => html`<div class="row-between"><span>${i.n}</span><span class="row" style="gap:8px">${stars(a[i.key])}<span class="strong num">${a[i.key]}/5</span></span></div>`)}<hr class="divider" style="margin:8px 0"><div class="row-between"><span class="strong">Result</span>${badge("aud", a.result_status)}</div></div></section>
    ${a.comments ? html`<section class="card card-body stack-sm"><h2 class="h3">Comments</h2><p>${a.comments}</p></section>` : ""}
    <div class="action-bar">${locked ? html`<a class="btn btn-primary btn-lg" href="${R.auditSummary(a.id)}">View result summary</a>` : html`<a class="btn btn-secondary btn-lg" href="${R.audits}">Done for now</a><button type="button" class="btn btn-primary btn-lg" id="fin">${icon("lock", 18)}Finalise</button>`}</div></div>`);
  $("#fin", root)?.addEventListener("click", async () => {
    if (!(await confirmDialog({ title: "Finalise this audit?", text: `Finalised audits become read-only. The result is shared with the Director and the hall's department.`, confirm: "Finalise audit", icon: "lock" }))) return;
    try { const f = await facilities.finaliseAudit(a.id); rememberAudit(f); toast("success", "Audit finalised"); location.hash = R.auditSummary(a.id); }
    catch (err) { toast("error", "Could not finalise", err instanceof ApiError ? err.message : ""); }
  });
}

// ============ SUMMARY ============
async function summaryPage({ root, params }: RouteContext): Promise<void> {
  const [halls, dir] = await Promise.all([loadClassrooms(), loadDirectory()]);
  const a = findAudit(params.id!); if (!a) throw new ApiError(404, "NOT_FOUND", "This audit is not stored in this browser. The server cannot fetch a single audit yet.");
  const hall = halls.find((h) => h.id === a.classroom_id);
  const tone = { SUITABLE: { bg: "#ecfdf3", bd: "#abefc6", fg: "#15703c", ic: "check-circle", msg: "This hall is ready for examinations." }, NEEDS_ATTENTION: { bg: "#fffaeb", bd: "#fedf89", fg: "#93370d", ic: "alert", msg: "Usable after the listed fixes are made." }, NOT_SUITABLE: { bg: "#fef3f2", bd: "#fecdca", fg: "#b42318", ic: "x-circle", msg: "Do not use this hall for examinations until it is repaired." } }[a.result_status];
  mount(root, html`<div style="max-width:760px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:20px">
    <section role="status" style="border-radius:12px;padding:24px;background:${tone.bg};border:1px solid ${tone.bd};color:${tone.fg};display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap"><span style="display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:${tone.fg};color:#fff;flex:none">${icon(tone.ic, 28)}</span>
      <div style="flex:1 1 240px"><span class="eyebrow" style="color:inherit">Audit result</span><h1 class="h1" style="color:inherit">${label(a.result_status)}</h1><p style="margin-top:4px">${tone.msg}</p></div><div style="text-align:right"><div class="t-3xl strong num">${average(a)}</div><div class="t-xs">average of 5 items</div></div></section>
    ${a.lifecycle_status === "FINALISED" ? html`<div class="banner-locked">${icon("lock", 18)}<span class="strong">Finalised, read-only</span><span class="muted">${auditNumber(a)} · ${fmtDateTime(a.finalised_at)}</span></div>` : alert("warning", "Not finalised yet", html`<a href="${R.auditFinalise(a.id)}">Finalise this audit</a> to lock the result.`)}
    <section class="card"><div class="card-head"><div><h2 class="h3">${hall?.name ?? `Hall #${a.classroom_id}`}</h2><p class="t-sm muted">${hall?.building ?? ""} · ${hall?.capacity ?? "?"} seats · audited by ${userName(a.inspector_id, dir)}</p></div></div>
      <div class="card-body stack">${ITEMS.map((i) => html`<div style="display:grid;grid-template-columns:28px 1fr auto;gap:12px;align-items:center"><span style="color:#475569;display:flex">${icon(i.i, 20)}</span><div class="stack-sm" style="gap:4px"><span class="strong">${i.n}</span><div class="progress" style="height:6px" role="img" aria-label="${i.n} ${a[i.key]} of 5"><span style="width:${(a[i.key] / 5) * 100}%;background:${starColor(a[i.key])}"></span></div></div><span class="num strong">${a[i.key]} / 5</span></div>`)}</div></section>
    ${a.comments ? html`<section class="card card-body stack-sm"><h2 class="h3">Comments</h2><p>${a.comments}</p></section>` : ""}
    <div class="action-bar"><a class="btn btn-secondary btn-lg" href="${R.hallAudits(a.classroom_id)}">${icon("history", 18)}Hall history</a><button type="button" class="btn btn-secondary btn-lg" onclick="window.print()">${icon("printer", 18)}Print</button><a class="btn btn-primary btn-lg" href="${R.audits}">Done</a></div></div>`);
}

// ============ LIST / DETAIL / HISTORY (local cache until endpoints exist) ============
async function listPage({ root }: RouteContext): Promise<void> {
  const [halls, dir] = await Promise.all([loadClassrooms(), loadDirectory()]);
  mount(root, html`${pageHead("Exam hall audits", "", hasRole(...INSPECT) ? html`<a class="btn btn-primary" href="${R.auditNew}">${icon("plus", 16)}Start audit</a>` : "")}
    ${needsApiBanner("The server cannot list audits yet. This list shows audits created in this browser; a shared list needs GET /facilities/audits.")}
    <section class="card"><form class="filter-bar" id="f"><label class="field grow"><span class="label">Search</span><span class="input-wrap"><span class="lead">${icon("search", 18)}</span><input class="input" type="search" name="q" placeholder="Hall or audit number"></span></label>
      <label class="field"><span class="label">Result</span><select class="select" name="res"><option value="">All results</option>${RESULTS.map((r) => html`<option value="${r.v}">${label(r.v)}</option>`)}</select></label>
      <label class="field"><span class="label">Status</span><select class="select" name="st"><option value="">Draft and finalised</option><option value="DRAFT">Draft</option><option value="FINALISED">Finalised</option></select></label></form><div id="rows"></div></section>`);
  const form = $<HTMLFormElement>("#f", root)!;
  const paint = () => { const d = new FormData(form); const q = String(d.get("q")).toLowerCase(); const res = String(d.get("res")); const st = String(d.get("st"));
    const rows = cachedAudits().filter((a) => (!q || hallName(a.classroom_id, halls).toLowerCase().includes(q) || auditNumber(a).toLowerCase().includes(q)) && (!res || a.result_status === res) && (!st || a.lifecycle_status === st));
    $("#rows", root)!.innerHTML = html`${dataTable<ExamHallAudit>([{ header: "Audit", cls: "mono t-sm", cell: (a) => auditNumber(a) }, { header: "Hall", lead: true, cell: (a) => html`<a class="strong" href="${R.auditDetail(a.id)}">${hallName(a.classroom_id, halls)}</a>` },
      { header: "Inspector", cell: (a) => userName(a.inspector_id, dir) }, { header: "Date", cls: "num", cell: (a) => fmtDateTime(a.created_at) }, { header: "Average", right: true, cls: "num strong", cell: (a) => average(a) },
      { header: "Result", cell: (a) => badge("aud", a.result_status) }, { header: "Status", cell: (a) => badge("life", a.lifecycle_status) }, { header: "Open", right: true, cls: "td-actions", cell: (a) => html`<a class="btn btn-ghost btn-sm" href="${R.auditDetail(a.id)}">Open${icon("chev-right", 14)}</a>` }], rows,
      emptyState("No audits yet", "Start an audit from your phone while walking the hall.", hasRole(...INSPECT) ? { href: R.auditNew, text: "Start audit" } : undefined))}`.value; };
  form.addEventListener("input", paint); form.addEventListener("submit", (e) => e.preventDefault()); paint();
}

async function detailPage({ root, params }: RouteContext): Promise<void> {
  const [halls, dir] = await Promise.all([loadClassrooms(), loadDirectory()]);
  const a = findAudit(params.id!); if (!a) throw new ApiError(404, "NOT_FOUND", "This audit is not stored in this browser. The server cannot fetch a single audit yet.");
  const hall = halls.find((h) => h.id === a.classroom_id); const done = a.lifecycle_status === "FINALISED";
  mount(root, html`${backLink(R.audits, "Back to audits")}<div class="page-head"><div class="stack-sm" style="gap:6px"><div class="row"><span class="mono t-sm muted">${auditNumber(a)}</span>${badge("life", a.lifecycle_status)}${badge("aud", a.result_status)}</div><h1 class="h1">${hall?.name ?? `Hall #${a.classroom_id}`}</h1></div>
      <div class="row"><button type="button" class="btn btn-secondary" onclick="window.print()">${icon("printer", 16)}Print</button><a class="btn btn-secondary" href="${R.hallAudits(a.classroom_id)}">${icon("history", 16)}Hall history</a></div></div>
    ${done ? html`<div class="banner-locked">${icon("lock", 18)}<span class="strong">Read-only.</span><span class="muted">Finalised ${fmtDateTime(a.finalised_at)}. Start a new audit to record changes.</span></div>` : alert("warning", "Draft", html`<a href="${R.auditFinalise(a.id)}">Finalise this audit</a> to lock it.`)}
    <div class="split"><div class="stack-lg" style="min-width:0"><section class="card readonly"><div class="card-head"><h2 class="h3">Ratings</h2><span class="t-sm"><span class="strong num">${average(a)}</span> average</span></div>
      ${dataTable<(typeof ITEMS)[number]>([{ header: "Item", cell: (i) => html`<span class="row" style="gap:8px;flex-wrap:nowrap">${icon(i.i, 18)}<span class="strong">${i.n}</span></span>` }, { header: "Rating", cell: (i) => html`<span class="row" style="gap:8px;flex-wrap:nowrap">${stars(a[i.key])}<span class="num strong">${a[i.key]} / 5</span></span>` }], [...ITEMS])}</section>
      ${a.comments ? html`<section class="card card-body stack-sm readonly"><h2 class="h3">Comments</h2><p>${a.comments}</p></section>` : ""}</div>
      <aside class="card card-body stack" style="align-self:start"><h2 class="h3">Audit information</h2><dl class="dl" style="grid-template-columns:1fr;margin:0"><div><dt>Hall</dt><dd><a href="${R.hallDetail(a.classroom_id)}">${hall?.name ?? a.classroom_id}</a>${hall ? ` · ${hall.capacity} seats` : ""}</dd></div>
        <div><dt>Inspector</dt><dd>${userName(a.inspector_id, dir)}</dd></div><div><dt>Audited</dt><dd>${fmtDateTime(a.created_at)}</dd></div><div><dt>Finalised</dt><dd>${fmtDateTime(a.finalised_at)}</dd></div><div><dt>Result</dt><dd>${badge("aud", a.result_status)}</dd></div></dl>
        ${hasRole(...INSPECT) ? html`<a class="btn btn-primary" href="${R.auditNew}?hall=${a.classroom_id}">Schedule re-audit</a>` : ""}</aside></div>`);
}

async function historyPage({ root, params }: RouteContext): Promise<void> {
  const [halls, dir] = await Promise.all([loadClassrooms(), loadDirectory()]);
  const id = Number(params.id); const hall = halls.find((h) => h.id === id);
  const list = cachedAudits().filter((a) => a.classroom_id === id).sort((x, y) => y.created_at.localeCompare(x.created_at));
  mount(root, html`${backLink(R.hallDetail(id), "Back to hall")}${pageHead("Audit history", `${hall?.name ?? `Hall #${id}`} · ${list.length} audit${list.length === 1 ? "" : "s"} in this browser`, hasRole(...INSPECT) ? html`<a class="btn btn-primary" href="${R.auditNew}?hall=${id}">${icon("plus", 16)}New audit</a>` : "")}
    ${needsApiBanner("A per-hall history from the server needs a backend endpoint. Showing audits created in this browser.")}
    <section class="card card-body">${list.length ? html`<ol class="timeline">${list.map((a) => html`<li class="tl-item"><span class="tl-dot ${a.result_status === "SUITABLE" ? "ok" : a.result_status === "NEEDS_ATTENTION" ? "warn" : "bad"}">${icon("clipboard", 16)}</span><div><div class="t-sm strong"><a href="${R.auditDetail(a.id)}">${fmtDateTime(a.created_at)}</a> · ${badge("aud", a.result_status)} · ${average(a)} / 5</div><div class="tl-meta">${userName(a.inspector_id, dir)}${a.comments ? ` · ${a.comments}` : ""}</div></div></li>`)}</ol>` : emptyState("No audits yet", "Audits of this hall will appear here.")}</section>`);
}

export const auditRoutes: Route[] = [
  { path: "/audits", title: "Exam hall audits", roles: ["ADMIN", "DIRECTOR", "QUALITY-INSPECTOR"], render: listPage },
  { path: "/audits/new", title: "Start audit", roles: [...INSPECT], render: wizard },
  { path: "/audits/:id", title: "Audit detail", roles: ["ADMIN", "DIRECTOR", "QUALITY-INSPECTOR"], render: detailPage },
  { path: "/audits/:id/finalise", title: "Finalise audit", roles: [...INSPECT], render: finalisePage },
  { path: "/audits/:id/summary", title: "Audit result", roles: ["ADMIN", "DIRECTOR", "QUALITY-INSPECTOR"], render: summaryPage },
  { path: "/halls/:id/audits", title: "Audit history", roles: ["ADMIN", "DIRECTOR", "QUALITY-INSPECTOR"], render: historyPage },
];
