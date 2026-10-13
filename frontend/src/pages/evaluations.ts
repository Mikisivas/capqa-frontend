import { ApiError } from "../api/client";
import { isUuid, knownStaff, staffName, userName, loadDirectory } from "../api/directory";
import { evaluations } from "../api/services";
import type { EvaluationSource, EvaluationTrend, StaffEvaluation } from "../api/types";
import { R } from "../routes";
import type { Route, RouteContext } from "../router";
import { alert, badge, bindCounters, bindForm, dataTable, emptyState, fieldError, formAlert, icon, needsApiBanner, pageHead, skeletonRows, starRating, bindStars, textarea, toast, backLink } from "../ui/components";
import { $, $$, fmtDate, fmtDateTime, html, label, mount, Safe } from "../ui/html";

const ROLES = ["ADMIN", "DIRECTOR", "ACADEMIC-OFFICER", "QUALITY-INSPECTOR"] as const;
const SOURCES: EvaluationSource[] = ["STUDENT", "PEER", "MANAGEMENT"];
const CRITERIA = [{ key: "teaching_quality", n: "Teaching quality", d: "Preparation, delivery and clarity of lectures" }, { key: "student_engagement", n: "Student engagement", d: "Interaction, availability and responsiveness" }, { key: "assessment_quality", n: "Assessment quality", d: "Fair, timely and well-designed assessment" }] as const;
const avg = (e: { teaching_quality: number; student_engagement: number; assessment_quality: number }) => Math.round(((e.teaching_quality + e.student_engagement + e.assessment_quality) / 3) * 10) / 10;
const conf = (): Safe => html`<span class="tag tag-conf">${icon("lock", 12)}Confidential</span>`;
const currentSession = () => { const y = new Date().getFullYear(), m = new Date().getMonth(); return m >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`; };

function restricted(): Safe {
  return html`<div style="margin:auto;max-width:560px;width:100%" class="card"><div class="empty" style="padding:40px 28px"><span class="e-icon" style="width:72px;height:72px;background:#0f172a;color:#fff">${icon("lock", 30)}</span><span class="tag tag-conf">Confidential</span>
    <h1 class="h2">Staff evaluations are restricted</h1><p>Evaluation records are visible only to Admins, the Director and authorised officers. Your role can't open this record.</p><p class="t-sm">If you're on the evaluation committee, ask the CAPQA administrator to review your role. This attempt may be recorded in the audit log.</p>
    <div class="row" style="justify-content:center"><a class="btn btn-primary" href="${R.dashboard}">Back to dashboard</a></div></div></div>`;
}
/** Run an evaluation call; show the restricted screen on 403 instead of a generic error. */
async function guard<T>(root: HTMLElement, fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch (e) { if (e instanceof ApiError && e.status === 403) { mount(root, restricted()); return null; } throw e; }
}

/** Searchable staff picker: names known to this browser plus pasted staff IDs. */
function staffPicker(name: string, value = ""): Safe {
  const staff = knownStaff();
  return html`<div class="field"><label class="label" for="f-${name}">Staff member <span class="req" aria-hidden="true">*</span></label><div class="input-wrap"><span class="lead">${icon("search", 18)}</span>
    <input id="f-${name}" name="${name}" class="input" list="staff-list" value="${value}" placeholder="Search by name or paste a staff ID" required autocomplete="off"></div>
    <datalist id="staff-list">${staff.map((s) => html`<option value="${s.full_name}" label="${s.id}"></option>`)}</datalist>
    <span class="help">${staff.length ? "Staff added in this browser are listed. " : "No staff are listed because the API has no staff list yet. "}You can also paste a staff ID.</span><div class="err" data-err="${name}" hidden></div></div>`;
}
function resolveStaff(input: string): string | null {
  const v = input.trim(); if (isUuid(v)) return v;
  return knownStaff().find((s) => s.full_name.toLowerCase() === v.toLowerCase())?.id ?? null;
}

// ============ NEW ============
async function newPage({ root, query }: RouteContext): Promise<void> {
  mount(root, html`<div class="page-narrow stack-lg" style="width:100%"><div class="page-head"><div><div class="row">${conf()}</div><h1 class="h1" style="margin-top:8px">New staff evaluation</h1><p class="sub">Only authorised roles can see evaluations.</p></div></div>
    <form class="stack-lg" id="f" novalidate>${formAlert()}
      <section class="card"><div class="card-head"><h2 class="h3">Who and when</h2></div><div class="card-body grid-form"><div class="span-2">${staffPicker("staff", query.get("staff") ? staffName(query.get("staff")!) : "")}</div>
        <fieldset class="field span-2" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Source <span class="req" aria-hidden="true">*</span></legend><div class="radio-cards">${SOURCES.map((s, i) => html`<label class="radio-card ${i === 0 ? "is-on" : ""}"><input type="radio" name="source" value="${s}" ${i === 0 ? "checked" : ""}>${badge("src", s)}</label>`)}</div></fieldset>
        <div class="field"><label class="label" for="f-session">Session <span class="req" aria-hidden="true">*</span></label><input class="input num" id="f-session" name="session" value="${currentSession()}" inputmode="numeric" required pattern="\\d{4}/\\d{4}"><span class="help">Format: 2025/2026</span><div class="err" data-err="session" hidden></div></div>
        <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Semester <span class="req" aria-hidden="true">*</span></legend><div class="radio-cards"><label class="radio-card is-on"><input type="radio" name="semester" value="1" checked>1</label><label class="radio-card"><input type="radio" name="semester" value="2">2</label></div></fieldset></div></section>
      <section class="card"><div class="card-head"><h2 class="h3">Ratings</h2><span class="t-xs muted">1 = very poor · 5 = excellent</span></div><div class="card-body stack">${CRITERIA.map((c) => html`<div style="display:flex;flex-wrap:wrap;gap:8px 24px;align-items:center;justify-content:space-between"><div style="flex:1 1 200px"><div class="strong">${c.n}</div><div class="t-xs muted">${c.d}</div></div><div>${starRating(c.key, c.n)}</div></div>`)}</div></section>
      <section class="card card-body">${textarea("comments", "Comments", { optional: true, max: 3000 })}</section>
      <div class="action-bar"><a class="btn btn-secondary" href="${R.evals}">Cancel</a><button type="submit" class="btn btn-primary">Save evaluation</button></div></form></div>`);
  const form = $<HTMLFormElement>("#f", root)!; bindStars(form); bindCounters(form);
  $$("input[type=radio][name=source],input[type=radio][name=semester]", form).forEach((r) => r.addEventListener("change", () => { const g = (r as HTMLInputElement).name; $$(`input[name=${g}]`, form).forEach((x) => (x.closest(".radio-card") as HTMLElement).classList.toggle("is-on", (x as HTMLInputElement).checked)); }));
  bindForm(form, async (v) => {
    const staffId = resolveStaff(v.staff!); if (!staffId) { fieldError(form, "staff", "Choose a staff member from the list, or paste a valid staff ID."); return; }
    const m = /^(\d{4})\/(\d{4})$/.exec(v.session!); if (!m || Number(m[2]) !== Number(m[1]) + 1) { fieldError(form, "session", "Use the format 2025/2026 (consecutive years)."); return; }
    const e = await guard(root, () => evaluations.create({ staff_id: staffId, source: v.source, session: v.session, semester: Number(v.semester), teaching_quality: Number(v.teaching_quality), student_engagement: Number(v.student_engagement), assessment_quality: Number(v.assessment_quality), comments: v.comments || undefined })); if (!e) return;
    toast("success", "Evaluation saved", `${label(e.source)} evaluation, ${e.session} semester ${e.semester}.`); location.hash = `${R.evalTrends}?staff=${staffId}`;
  });
}

// ============ HISTORY ============
async function historyPage({ root, query }: RouteContext): Promise<void> {
  const staffId = query.get("staff") ?? "";
  if (!isUuid(staffId)) { mount(root, html`${pageHead("Staff evaluation history", "Pick a staff member to see their evaluations.")}<div class="card card-body">${staffPickForm(R.evalHistory)}</div>`); bindPick(root); return; }
  const [list, dir] = await Promise.all([guard(root, () => evaluations.forStaff(staffId)), loadDirectory()]); if (!list) return;
  const name = staffName(staffId);
  mount(root, html`<section class="card"><div class="card-body" style="display:flex;flex-wrap:wrap;gap:16px 24px;align-items:center"><span class="avatar avatar-lg">${name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("")}</span>
    <div style="flex:1 1 260px" class="stack-sm"><div class="row"><h1 class="h1">${name}</h1>${conf()}</div><p class="muted t-sm mono">${staffId}</p></div>
    <div class="row" style="gap:24px"><div><div class="t-xs muted">Average, all time</div><div class="t-2xl strong num">${list.length ? (list.reduce((s, e) => s + avg(e), 0) / list.length).toFixed(1) : "-"} <span class="t-sm muted">/ 5</span></div></div><div><div class="t-xs muted">Evaluations</div><div class="t-2xl strong num">${list.length}</div></div></div>
    <div class="row"><a class="btn btn-secondary" href="${R.evalTrends}?staff=${staffId}">${icon("trend", 16)}Trends</a><a class="btn btn-primary" href="${R.evalNew}?staff=${staffId}">${icon("plus", 16)}New evaluation</a></div></div></section>
    ${alert("info", "Viewing is logged", "Do not share screenshots or exports outside the evaluation committee.", "shield")}
    <section class="card"><form class="filter-bar" id="f"><label class="field"><span class="label">Session</span><select class="select" name="session"><option value="">All sessions</option>${[...new Set(list.map((e) => e.session))].sort().reverse().map((s) => html`<option>${s}</option>`)}</select></label>
      <label class="field"><span class="label">Semester</span><select class="select" name="sem"><option value="">Both</option><option>1</option><option>2</option></select></label>
      <label class="field"><span class="label">Source</span><select class="select" name="src"><option value="">All sources</option>${SOURCES.map((s) => html`<option value="${s}">${label(s)}</option>`)}</select></label></form><div id="rows"></div></section>`);
  const form = $<HTMLFormElement>("#f", root)!;
  const paint = () => { const d = new FormData(form); const rows = list.filter((e) => (!d.get("session") || e.session === d.get("session")) && (!d.get("sem") || String(e.semester) === d.get("sem")) && (!d.get("src") || e.source === d.get("src"))).sort((a, b) => b.created_at.localeCompare(a.created_at));
    $("#rows", root)!.innerHTML = dataTable<StaffEvaluation>([{ header: "Date", lead: true, cls: "num", cell: (e) => fmtDate(e.created_at) }, { header: "Session", cls: "num", cell: (e) => e.session }, { header: "Sem.", cell: (e) => e.semester }, { header: "Source", cell: (e) => badge("src", e.source) },
      { header: "Teaching", right: true, cls: "num", cell: (e) => e.teaching_quality }, { header: "Engagement", right: true, cls: "num", cell: (e) => e.student_engagement }, { header: "Assessment", right: true, cls: "num", cell: (e) => e.assessment_quality }, { header: "Average", right: true, cls: "num strong", cell: (e) => avg(e) },
      { header: "Open", right: true, cls: "td-actions", cell: (e) => html`<a class="btn btn-ghost btn-sm" href="${R.evalDetail(e.id)}?staff=${staffId}">Open</a>` }], rows, emptyState("No evaluations", "Nothing matches these filters.")).value + `<div class="pagination"><span>${rows.length} evaluation${rows.length === 1 ? "" : "s"}</span></div>`; };
  form.addEventListener("input", paint); paint(); void dir;
}
function staffPickForm(target: string): Safe {
  return html`<form id="pick" class="stack" novalidate>${staffPicker("staff")}<div class="row"><button type="submit" class="btn btn-primary">Open</button></div><input type="hidden" name="target" value="${target}"></form>`;
}
function bindPick(root: HTMLElement): void {
  const form = $<HTMLFormElement>("#pick", root)!;
  form.addEventListener("submit", (e) => { e.preventDefault(); const id = resolveStaff(String(new FormData(form).get("staff") ?? "")); if (!id) { fieldError(form, "staff", "Choose a staff member from the list, or paste a valid staff ID."); return; } location.hash = `${String(new FormData(form).get("target"))}?staff=${id}`; });
}

// ============ TRENDS ============
const SERIES = [{ k: "overall", n: "Overall", c: "#0f3d22", w: 4, dash: "" }, { k: "teaching_quality", n: "Teaching quality", c: "#2563eb", w: 2, dash: "6 4" }, { k: "student_engagement", n: "Student engagement", c: "#d97706", w: 2, dash: "2 4" }, { k: "assessment_quality", n: "Assessment quality", c: "#94a3b8", w: 2, dash: "" }] as const;
async function trendsPage({ root, query }: RouteContext): Promise<void> {
  const staffId = query.get("staff") ?? "";
  if (!isUuid(staffId)) { mount(root, html`${pageHead("Semester trends", "Pick a staff member to see their trend.")}<div class="card card-body">${staffPickForm(R.evalTrends)}</div>`); bindPick(root); return; }
  const trends = await guard<EvaluationTrend[]>(root, () => evaluations.trends(staffId)); if (!trends) return;
  const name = staffName(staffId); const rows = trends.map((t) => ({ ...t, overall: Math.round(((t.teaching_quality + t.student_engagement + t.assessment_quality) / 3) * 100) / 100, p: `${t.session} · Sem ${t.semester}` }));
  const W = 640, x0 = 80, x1 = 580; const x = (i: number) => rows.length === 1 ? 330 : x0 + (i * (x1 - x0)) / (rows.length - 1); const y = (v: number) => 220 - ((v - 3) / 2) * 160; const yc = (v: number) => y(Math.min(5, Math.max(3, v)));
  const line = (k: (typeof SERIES)[number]) => rows.length ? `<polyline points="${rows.map((r, i) => `${x(i)},${yc(r[k.k as "overall"])}`).join(" ")}" fill="none" stroke="${k.c}" stroke-width="${k.w}" ${k.dash ? `stroke-dasharray="${k.dash}"` : ""} stroke-linejoin="round"></polyline>` : "";
  mount(root, html`${backLink(`${R.evalHistory}?staff=${staffId}`, "Evaluation history")}<div class="page-head"><div><div class="row">${conf()}</div><h1 class="h1" style="margin-top:8px">Semester trends</h1><p class="sub">${name} · average rating (1–5) by session and semester</p></div><a class="btn btn-primary" href="${R.evalNew}?staff=${staffId}">${icon("plus", 16)}New evaluation</a></div>
    <section class="card" aria-labelledby="tr-h"><div class="card-head"><h2 class="h3" id="tr-h">${name}</h2><div class="legend">${SERIES.map((s) => html`<span><i style="background:${s.c};${s.k === "overall" ? "height:4px;width:18px;vertical-align:3px" : ""}"></i>${s.n}</span>`)}</div></div>
      <div class="card-body">${rows.length ? html`<svg viewBox="0 0 ${W} 290" width="100%" role="img" aria-label="Overall average ${rows[0]!.overall} in ${rows[0]!.p} to ${rows[rows.length - 1]!.overall} in ${rows[rows.length - 1]!.p}. Full values in the table below." style="display:block;max-height:420px"><g font-family="IBM Plex Sans, sans-serif" font-size="12" fill="#475569">
        ${[3, 3.5, 4, 4.5, 5].map((v) => `<line x1="50" y1="${y(v)}" x2="620" y2="${y(v)}" stroke="${v === 3 ? "#cbd5e1" : "#eef2f6"}"></line><text x="40" y="${y(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`).join("") as unknown as Safe}
        ${SERIES.slice().reverse().map((s) => line(s)).join("") as unknown as Safe}${rows.map((r, i) => `<circle cx="${x(i)}" cy="${yc(r.overall)}" r="${i === rows.length - 1 ? 6 : 5}" fill="#0f3d22"><title>${r.p}: ${r.overall}</title></circle><text x="${x(i)}" y="242" text-anchor="middle">Sem ${r.semester}</text>`).join("") as unknown as Safe}
        ${rows.map((r, i) => (i === 0 || rows[i - 1]!.session !== r.session) ? `<text x="${x(i)}" y="264" fill="#334155" font-weight="600">${r.session}</text>` : "").join("") as unknown as Safe}</g></svg>` : emptyState("No trend data yet", "Ratings appear here once evaluations are recorded for this staff member.")}</div>
      ${rows.length ? html`<div class="table-wrap" style="border-top:1px solid #e2e8f0"><table class="table"><caption class="sr-only">Average ratings by session and semester</caption><thead><tr><th scope="col">Session · semester</th><th scope="col" class="r">Overall</th><th scope="col" class="r">Teaching</th><th scope="col" class="r">Engagement</th><th scope="col" class="r">Assessment</th><th scope="col" class="r">Evaluations</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr><td class="num">${r.p}</td><td class="r num strong">${r.overall.toFixed(2)}</td><td class="r num">${r.teaching_quality.toFixed(2)}</td><td class="r num">${r.student_engagement.toFixed(2)}</td><td class="r num">${r.assessment_quality.toFixed(2)}</td><td class="r num">${r.evaluation_count}</td></tr>`)}</tbody></table></div>` : ""}</section>`);
}

// ============ ALL EVALUATIONS (aggregated over staff known to this browser) ============
async function listPage({ root }: RouteContext): Promise<void> {
  const staff = knownStaff();
  mount(root, html`${pageHead("Staff evaluations", "", html`<a class="btn btn-primary" href="${R.evalNew}">${icon("plus", 16)}New evaluation</a>`)}
    ${needsApiBanner("The API has no \"all evaluations\" or staff list endpoint. This view combines the evaluations of staff known to this browser; open any staff member by name or ID to see their history.")}
    <section class="card card-body">${staffPickForm(R.evalHistory)}</section><section class="card"><div id="rows">${skeletonRows(3)}</div></section>`);
  bindPick(root);
  if (!staff.length) { $("#rows", root)!.innerHTML = emptyState("No staff known yet", "Add staff under Departments, or open a staff member above by ID.").value; return; }
  const results = await Promise.allSettled(staff.map((s) => evaluations.forStaff(s.id)));
  if (results.every((r) => r.status === "rejected" && r.reason instanceof ApiError && r.reason.status === 403)) { mount(root, restricted()); return; }
  const all = results.flatMap((r) => r.status === "fulfilled" ? r.value : []).sort((a, b) => b.created_at.localeCompare(a.created_at));
  $("#rows", root)!.innerHTML = dataTable<StaffEvaluation>([{ header: "Staff member", lead: true, cell: (e) => html`<a class="strong" href="${R.evalHistory}?staff=${e.staff_id}">${staffName(e.staff_id)}</a>` }, { header: "Session", cls: "num", cell: (e) => `${e.session} · S${e.semester}` }, { header: "Source", cell: (e) => badge("src", e.source) },
    { header: "Average", right: true, cls: "num strong", cell: (e) => avg(e) }, { header: "Date", cls: "num", cell: (e) => fmtDate(e.created_at) }, { header: "Open", right: true, cls: "td-actions", cell: (e) => html`<a class="btn btn-ghost btn-sm" href="${R.evalDetail(e.id)}?staff=${e.staff_id}">Open</a>` }], all, emptyState("No evaluations yet", "Evaluations you enter will appear here.")).value;
}

async function detailPage({ root, params, query }: RouteContext): Promise<void> {
  const staffId = query.get("staff") ?? ""; if (!isUuid(staffId)) throw new ApiError(404, "NOT_FOUND", "Open this evaluation from a staff member's history.");
  const [list, dir] = await Promise.all([guard(root, () => evaluations.forStaff(staffId)), loadDirectory()]); if (!list) return;
  const e = list.find((x) => x.id === params.id); if (!e) throw new ApiError(404, "NOT_FOUND", "That evaluation was not found.");
  const color = (v: number) => (v >= 4 ? "#166534" : v === 3 ? "#d97706" : "#dc2626"); const WORDS = ["Very poor", "Poor", "Fair", "Good", "Excellent"];
  mount(root, html`${backLink(`${R.evalHistory}?staff=${staffId}`, "Back to history")}<div style="max-width:960px;width:100%;display:flex;flex-direction:column;gap:20px"><div class="page-head"><div class="stack-sm" style="gap:6px"><div class="row"><span class="mono t-sm muted">EVL-${new Date(e.created_at).getFullYear()}-${e.id.slice(0, 4).toUpperCase()}</span>${conf()}${badge("src", e.source)}</div>
      <h1 class="h1">Evaluation of ${staffName(staffId)}</h1><p class="muted">${e.session} · Semester ${e.semester} · entered ${fmtDateTime(e.created_at)} by ${userName(e.evaluator_id, dir)}</p></div><button type="button" class="btn btn-secondary" onclick="window.print()">${icon("printer", 16)}Print</button></div>
    <section class="grid-3" aria-label="Ratings">${CRITERIA.map((c) => { const v = e[c.key]; return html`<div class="card card-body stack-sm"><span class="t-sm muted strong">${c.n}</span><div class="row" style="gap:10px"><span class="t-3xl strong num">${v}</span><span class="muted">/ 5</span></div>
      <span class="stars-sm" aria-hidden="true">${[1, 2, 3, 4, 5].map((n) => html`<span style="color:${n <= v ? color(v) : "#cbd5e1"};display:flex">${icon("star", 18)}</span>`)}</span><span class="t-xs muted">${WORDS[v - 1]}</span></div>`; })}</section>
    ${e.comments ? html`<section class="card card-body stack-sm"><h2 class="h3">Comments</h2><p style="line-height:22px">${e.comments}</p></section>` : ""}
    <section class="card"><dl class="dl card-body" style="margin:0"><div><dt>Staff member</dt><dd><a href="${R.evalHistory}?staff=${staffId}">${staffName(staffId)}</a></dd></div><div><dt>Session · semester</dt><dd>${e.session} · ${e.semester}</dd></div><div><dt>Average</dt><dd class="num">${avg(e)} / 5</dd></div><div><dt>Entered by</dt><dd>${userName(e.evaluator_id, dir)}</dd></div></dl></section></div>`);
}

export const evaluationRoutes: Route[] = [
  { path: "/evaluations", title: "Staff evaluations", roles: [...ROLES], render: listPage },
  { path: "/evaluations/new", title: "New evaluation", roles: [...ROLES], render: newPage },
  { path: "/evaluations/history", title: "Evaluation history", roles: [...ROLES], render: historyPage },
  { path: "/evaluations/trends", title: "Semester trends", roles: [...ROLES], render: trendsPage },
  { path: "/evaluations/:id", title: "Evaluation detail", roles: [...ROLES], render: detailPage },
];
