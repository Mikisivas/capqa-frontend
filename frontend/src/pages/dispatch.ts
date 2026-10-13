import { ApiError } from "../api/client";
import { activeUsers, canListUsers, loadDirectory, userName } from "../api/directory";
import { dispatch } from "../api/services";
import type { Attachment, Dispatch, DispatchPriority, DispatchTrackingStatus } from "../api/types";
import { R } from "../routes";
import type { Route, RouteContext } from "../router";
import { getUser, hasRole } from "../session";
import { alert, backLink, badge, bindCounters, bindForm, confirmDialog, dataTable, emptyState, field, fieldError, formAlert, icon, modal, needsApiBanner, onPage, pageHead, pagination, select, showFormError, textarea, toast, errorState, skeletonRows } from "../ui/components";
import { $, $$, fmtDate, fmtDateTime, html, initials, label, mount, raw, Safe } from "../ui/html";

const EDITORS = ["ADMIN", "ACADEMIC-OFFICER"] as const;
const PRIORITIES: DispatchPriority[] = ["HIGH", "MEDIUM", "LOW"];
const PRI_NOTE: Record<string, string> = { HIGH: "Same day", MEDIUM: "Within 3 days", LOW: "Routine" };
const SORTS: { value: string; text: string; field: string; dir: string }[] = [
  { value: "date-desc", text: "Date received · newest first", field: "DATE_RECEIVED", dir: "DESC" }, { value: "date-asc", text: "Date received · oldest first", field: "DATE_RECEIVED", dir: "ASC" },
  { value: "pri-desc", text: "Priority · high to low", field: "PRIORITY", dir: "ASC" }, { value: "pri-asc", text: "Priority · low to high", field: "PRIORITY", dir: "DESC" },
  { value: "sender-asc", text: "Sender · A–Z", field: "SENDER", dir: "ASC" }, { value: "sender-desc", text: "Sender · Z–A", field: "SENDER", dir: "DESC" },
  { value: "status-asc", text: "Status · A–Z", field: "STATUS", dir: "ASC" }, { value: "status-desc", text: "Status · Z–A", field: "STATUS", dir: "DESC" },
];
const today = () => new Date().toISOString().slice(0, 10);

// ---- attachments uploaded from this browser (the API has no "list attachments" endpoint yet) ----
const attKey = (id: string) => `capqa.att.${id}`;
const loadAtt = (id: string): Attachment[] => { try { return JSON.parse(sessionStorage.getItem(attKey(id)) ?? "[]") as Attachment[]; } catch { return []; } };
const saveAtt = (id: string, a: Attachment[]) => { try { sessionStorage.setItem(attKey(id), JSON.stringify(a)); } catch { /* ignore */ } };
const fileKind = (name: string) => /\.pdf$/i.test(name) ? { t: "PDF", style: "" } : /\.docx?$/i.test(name) ? { t: "DOC", style: "background:#eff6ff;color:#1d4ed8" } : { t: /\.png$/i.test(name) ? "PNG" : "JPG", style: "" };
const fmtSize = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

function assigneeField(dir: Map<string, import("../api/types").User>, value = ""): Safe {
  if (canListUsers()) return select("assigned_to", "Assign to staff", activeUsers(dir).map((u) => ({ value: u.id, text: `${u.full_name} · ${label(u.role)}` })), { optional: true, blank: "— Leave unassigned —", value });
  return field("assigned_to", "Assign to staff", { optional: true, value, mono: true, placeholder: "Staff user ID (UUID)", help: "Only Admins can browse staff names. Paste the staff member's user ID." });
}
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ============ LIST ============
async function listPage({ root, query }: RouteContext): Promise<void> {
  const canRecord = hasRole(...EDITORS);
  const st = { q: query.get("q") ?? "", status: query.get("status") ?? "", sort: query.get("sort") ?? "date-desc", priority: query.get("priority") ?? "", from: query.get("from") ?? "", to: query.get("to") ?? "", offset: 0, limit: 10 };
  mount(root, html`${pageHead("Mail list", "Incoming mail recorded by CAPQA.", html`<a class="btn btn-secondary" href="${R.mailArchive}">${icon("archive", 16)}Archive</a>${canRecord ? html`<a class="btn btn-primary" href="${R.mailNew}">${icon("plus", 16)}Record mail</a>` : ""}`)}
    <section class="card" aria-label="Mail"><form class="filter-bar" role="search" id="filters">
      <label class="field grow"><span class="label">Search</span><span class="input-wrap"><span class="lead">${icon("search", 18)}</span><input class="input" type="search" name="q" value="${st.q}" placeholder="Reference, sender or subject"></span></label>
      <label class="field"><span class="label">Status</span><select class="select" name="status"><option value="">All statuses</option>${(["DRAFT", "PENDING", "FORWARDED", "REVIEWED", "APPROVED", "REJECTED"] as const).map((s) => html`<option value="${s}" ${raw(st.status === s ? "selected" : "")}>${label(s)}</option>`)}</select></label>
      <label class="field"><span class="label">Priority <span class="opt">(this page)</span></span><select class="select" name="priority"><option value="">All priorities</option>${PRIORITIES.map((p) => html`<option value="${p}" ${raw(st.priority === p ? "selected" : "")}>${label(p)}</option>`)}</select></label>
      <fieldset class="field" style="flex:2 1 300px;border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Date received <span class="opt">(this page)</span></legend><div class="row" style="gap:8px"><input class="input" style="flex:1 1 130px;min-width:0" type="date" name="from" value="${st.from}" aria-label="From"><span class="muted">to</span><input class="input" style="flex:1 1 130px;min-width:0" type="date" name="to" value="${st.to}" aria-label="To"></div></fieldset>
      <label class="field"><span class="label">Sort by</span><select class="select" name="sort">${SORTS.map((s) => html`<option value="${s.value}" ${raw(st.sort === s.value ? "selected" : "")}>${s.text}</option>`)}</select></label>
      <button type="button" class="btn btn-ghost" id="clear">Clear</button></form>
      <div id="results" style="margin-top:12px"></div></section>`);
  const results = $("#results", root)!; const form = $<HTMLFormElement>("#filters", root)!;
  const dir = await loadDirectory();

  async function load(): Promise<void> {
    results.innerHTML = skeletonRows().value;
    const sort = SORTS.find((s) => s.value === st.sort) ?? SORTS[0]!;
    try {
      const page = await dispatch.list({ query: st.q || undefined, tracking_status: st.status || undefined, sort_field: sort.field, sort_direction: sort.dir, offset: st.offset, limit: st.limit });
      let rows = page.items;
      if (st.priority) rows = rows.filter((r) => r.priority === st.priority);
      if (st.from) rows = rows.filter((r) => r.date_received >= st.from);
      if (st.to) rows = rows.filter((r) => r.date_received <= st.to);
      const empty = st.q || st.status || st.priority || st.from || st.to
        ? emptyState("No mail matches these filters", "Try clearing a filter or searching for something else.")
        : emptyState("No mail recorded yet", "When the Registry or a department sends mail to CAPQA, record it here so it can be assigned, reviewed and approved.", canRecord ? { href: R.mailNew, text: "Record mail" } : undefined);
      results.innerHTML = html`${dataTable<Dispatch>([
        { header: "Subject and reference no.", lead: true, cls: "", cell: (r) => html`<a href="${R.mailDetail(r.id)}" class="strong" style="color:#0f172a;text-decoration:none">${r.subject}</a><span class="cell-sub mono">${r.reference_number}</span>` },
        { header: "Sender", cell: (r) => r.sender }, { header: "Priority", cell: (r) => badge("pri", r.priority) }, { header: "Status", cell: (r) => badge("mail", r.tracking_status) },
        { header: "Assigned to", cell: (r) => userName(r.assigned_to, dir) }, { header: "Received", cls: "num", cell: (r) => fmtDate(r.date_received) },
        { header: "Open", right: true, cls: "td-actions", cell: (r) => html`<a class="btn btn-ghost btn-sm" href="${R.mailDetail(r.id)}" aria-label="Open ${r.reference_number}">Open${icon("chev-right", 14)}</a>` }], rows, empty)}${pagination(page.total, page.offset, page.limit)}`.value;
      onPage(results, (o) => { st.offset = Math.max(0, o); void load(); });
    } catch (err) { results.innerHTML = errorState(err).value; $("[data-retry]", results)?.addEventListener("click", () => void load()); }
  }
  const sync = () => { const d = new FormData(form); st.q = String(d.get("q") ?? "").trim(); st.status = String(d.get("status")); st.priority = String(d.get("priority")); st.from = String(d.get("from")); st.to = String(d.get("to")); st.sort = String(d.get("sort")); st.offset = 0; void load(); };
  form.addEventListener("submit", (e) => { e.preventDefault(); sync(); });
  $$("select,input[type=date]", form).forEach((el) => el.addEventListener("change", sync));
  let timer = 0; $("input[name=q]", form)!.addEventListener("input", () => { clearTimeout(timer); timer = window.setTimeout(sync, 350); });
  $("#clear", root)!.addEventListener("click", () => { form.reset(); $<HTMLInputElement>("input[name=q]", form)!.value = ""; sync(); });
  await load();
}

// ============ RECORD (step 1) ============
async function recordPage({ root }: RouteContext): Promise<void> {
  const dir = await loadDirectory();
  mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${pageHead("Record incoming mail", "Step 1 of 2: mail details. You'll attach the scanned documents next.")}
    <ol class="stepper" aria-label="Progress"><li class="step current" aria-current="step"><span class="bar"></span>1 · Mail details</li><li class="step"><span class="bar"></span>2 · Upload documents</li></ol>
    <form class="stack-lg" id="f" aria-label="Mail details" novalidate>${formAlert()}<div class="card"><div class="card-body grid-form">
      ${field("reference_number", "Reference number", { required: true, mono: true, placeholder: `CAPQA/DSP/${new Date().getFullYear()}/0001`, help: "Format: CAPQA/DSP/YYYY/NNNN", attrs: 'minlength="2" maxlength="50"' })}
      ${field("date_received", "Date received", { required: true, type: "date", value: today() })}
      <div class="span-2">${field("sender", "Sender", { required: true, help: "Office, department or external body", attrs: 'minlength="2" maxlength="150"' })}</div>
      <div class="span-2">${field("subject", "Subject", { required: true, attrs: 'minlength="2" maxlength="255"' })}</div>
      <fieldset class="field span-2" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Priority</legend><div class="radio-cards">${PRIORITIES.map((p) => html`<label class="radio-card ${p === "MEDIUM" ? "is-on" : ""}"><input type="radio" name="priority" value="${p}" ${raw(p === "MEDIUM" ? "checked" : "")}>${badge("pri", p)}<span class="t-xs muted">${PRI_NOTE[p]}</span></label>`)}</div></fieldset>
      ${assigneeField(dir)}
      <div class="field"><label class="label" for="f-due">Due date <span class="opt">(optional)</span></label><input class="input" id="f-due" type="date" disabled><span class="help">Coming soon: the backend has no due date field yet.</span></div>
      <div class="span-2 field"><label class="label" for="f-desc">Description <span class="opt">(optional)</span></label><textarea class="textarea" id="f-desc" disabled placeholder="Coming soon"></textarea><span class="help">Coming soon: the backend has no description field yet.</span></div>
    </div></div>
    <div class="action-bar"><a class="btn btn-secondary" href="${R.mail}">Cancel</a><button type="submit" class="btn btn-primary">Save and continue${icon("arrow-right", 16)}</button></div></form></div>`);
  const form = $<HTMLFormElement>("#f", root)!;
  $$("input[name=priority]", form).forEach((r) => r.addEventListener("change", () => $$(".radio-card", form).forEach((c) => c.classList.toggle("is-on", (c.querySelector("input") as HTMLInputElement).checked))));
  bindForm(form, async (v) => {
    if (v.assigned_to && !isUuid(v.assigned_to)) { fieldError(form, "assigned_to", "Enter a valid staff user ID."); return; }
    try {
      const rec = await dispatch.create({ reference_number: v.reference_number!, sender: v.sender!, subject: v.subject!, date_received: v.date_received!, priority: v.priority || "MEDIUM", assigned_to: v.assigned_to || undefined });
      toast("success", "Mail details saved", rec.reference_number); location.hash = R.mailUpload(rec.id);
    } catch (err) { if (err instanceof ApiError && err.status === 409) { fieldError(form, "reference_number", `${v.reference_number} is already used by another mail item.`); return; } throw err; }
  });
}

// ============ UPLOAD (step 2) ============
async function uploadPage({ root, params }: RouteContext): Promise<void> {
  const rec = await dispatch.get(params.id!);
  const MAX = 10 * 1024 * 1024; const OK = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png"];
  type Item = { file: File; state: "ready" | "uploading" | "done" | "error"; error?: string };
  const items: Item[] = [];
  mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${pageHead("Upload documents", "")}
    <p class="sub" style="margin-top:-12px">Step 2 of 2: attach scans to <span class="mono strong">${rec.reference_number}</span></p>
    <ol class="stepper" aria-label="Progress"><li class="step done"><span class="bar"></span>1 · Mail details</li><li class="step current" aria-current="step"><span class="bar"></span>2 · Upload documents</li></ol>
    ${alert("success", "Mail details saved", `${rec.subject} · ${rec.sender}`, "check-circle")}
    <div class="stack-lg"><section class="card card-body stack" aria-labelledby="up-h"><h2 class="h3" id="up-h">Documents</h2>
      <label class="uploader" id="drop">${html`<span class="ico-box" style="width:48px;height:48px">${icon("upload", 22)}</span>`}<span><span class="strong">Drag and drop files here</span> or <span style="color:#166534;font-weight:600;text-decoration:underline">browse your device</span></span>
        <span class="help">PDF, DOCX, JPG or PNG · up to 10 MB each</span><input type="file" id="pick" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" class="sr-only"></label>
      <ul id="files" style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px" aria-label="Files" aria-live="polite"></ul></section>
      <div class="action-bar"><a class="btn btn-secondary" href="${R.mailNew}">${icon("arrow-left", 16)}Back</a><button type="button" class="btn btn-primary" id="finish">Finish${icon("check", 16)}</button></div></div></div>`);
  const list = $("#files", root)!;
  const paint = () => { list.innerHTML = items.map((it, i) => { const k = fileKind(it.file.name); return html`<li class="file-row" ${raw(it.state === "error" ? 'style="border-color:#fecdca"' : "")}><span class="f-ico" style="${k.style}">${k.t}</span>
    <div class="f-main"><span class="f-name">${it.file.name}</span>${it.state === "error" ? html`<span class="err">${icon("alert-circle", 14)}${it.error}</span>` : it.state === "done" ? html`<span class="t-xs" style="color:#15703c;display:flex;gap:4px;align-items:center">${icon("check-circle", 14)}Uploaded · ${fmtSize(it.file.size)}</span>`
      : it.state === "uploading" ? html`<div class="progress" role="progressbar" aria-label="Uploading ${it.file.name}"><span style="width:60%"></span></div><span class="t-xs muted">Uploading…</span>` : html`<span class="t-xs muted">${fmtSize(it.file.size)} · ready</span>`}</div>
    ${it.state !== "done" && it.state !== "uploading" ? html`<button type="button" class="btn btn-ghost btn-icon btn-sm" data-rm="${i}" aria-label="Remove ${it.file.name}">${icon("trash", 16)}</button>` : ""}</li>`.value; }).join(""); $$("[data-rm]", list).forEach((b) => b.addEventListener("click", () => { items.splice(Number((b as HTMLElement).dataset.rm), 1); paint(); })); };
  const add = (files: FileList | File[]) => { for (const f of files) { const bad = !OK.includes(f.type) ? "Only PDF, DOCX, JPG or PNG files are allowed" : f.size > MAX ? `${fmtSize(f.size)}: larger than the 10 MB limit` : f.size === 0 ? "The file is empty" : undefined; items.push({ file: f, state: bad ? "error" : "ready", error: bad }); } paint(); };
  $<HTMLInputElement>("#pick", root)!.addEventListener("change", (e) => { add((e.target as HTMLInputElement).files ?? []); (e.target as HTMLInputElement).value = ""; });
  const drop = $("#drop", root)!;
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-drag"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-drag"); }));
  drop.addEventListener("drop", (e) => add((e as DragEvent).dataTransfer?.files ?? []));
  $("#finish", root)!.addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement; btn.disabled = true;
    const saved = loadAtt(rec.id); let failed = 0;
    for (const it of items.filter((x) => x.state === "ready")) {
      it.state = "uploading"; paint();
      try { saved.push(await dispatch.upload(rec.id, it.file)); it.state = "done"; } catch (err) { it.state = "error"; it.error = err instanceof ApiError ? err.message : "Upload failed"; failed++; }
      paint();
    }
    saveAtt(rec.id, saved);
    if (failed) { btn.disabled = false; toast("error", "Some files did not upload", "Remove them or try again."); return; }
    try { if (rec.tracking_status === "DRAFT" && saved.length) await dispatch.update(rec.id, { tracking_status: "PENDING" }); } catch { /* status change is best effort */ }
    toast("success", "Mail recorded", rec.reference_number); location.hash = R.mailDetail(rec.id);
  });
}

// ============ DETAIL ============
function stampBlock(r: Dispatch, dir: Map<string, import("../api/types").User>): Safe {
  const by = userName(r.approved_by, dir).replace(" (you)", ""); const when = r.stamped_at ?? r.approved_at;
  const d = when ? new Date(when) : null; const short = d ? d.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }) + " · " + d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }) : "";
  return html`<section class="card" aria-labelledby="stamp-h" style="border-color:#fde68a;background:#fffbeb"><div class="card-body" style="display:flex;flex-wrap:wrap;gap:24px;align-items:center">
    <div class="stamp" role="img" aria-label="Digital approval stamp: Approved, ${r.reference_number}, ${short}, ${by}"><div class="stamp-in"><span class="st-top">CAPQA · RFMOAUM</span><span class="st-main">APPROVED</span><span class="st-line mono">${r.reference_number}</span><span class="st-line">${short}</span><span class="st-line">${by}, Director</span></div></div>
    <div class="stack-sm" style="flex:1 1 240px"><h2 class="h3" id="stamp-h">Digitally approved</h2><p class="t-sm" style="color:#7a2e0e">Approved by <strong>${by}</strong> on ${fmtDateTime(when)}.</p><p class="t-xs mono" style="color:#92400e;word-break:break-all">Stamp ${r.digital_stamp?.slice(0, 32) ?? ""}…</p></div></div></section>`;
}

async function detailPage({ root, params }: RouteContext): Promise<void> {
  const [rec, dir] = await Promise.all([dispatch.get(params.id!), loadDirectory()]);
  const me = getUser()!; const canEdit = hasRole(...EDITORS); const approved = rec.tracking_status === "APPROVED"; const finalised = approved || rec.tracking_status === "REJECTED";
  const canApprove = me.role === "DIRECTOR" && !approved;
  const atts = loadAtt(rec.id);
  const next: { status: DispatchTrackingStatus; text: string } | null = rec.tracking_status === "DRAFT" ? { status: "PENDING", text: "Submit" } : rec.tracking_status === "PENDING" || rec.tracking_status === "FORWARDED" ? { status: "REVIEWED", text: "Mark reviewed" } : null;
  const tl: { icon: string; tone: string; title: string; meta: string }[] = [{ icon: "inbox", tone: "", title: "Recorded as Draft", meta: `${userName(rec.created_by, dir)} · ${fmtDateTime(rec.created_at)}` }];
  if (rec.tracking_status !== "DRAFT") tl.push({ icon: rec.tracking_status === "FORWARDED" ? "forward" : "clock", tone: rec.tracking_status === "FORWARDED" ? "info" : "warn", title: `Status: ${label(rec.tracking_status)}${rec.assigned_to && rec.tracking_status === "FORWARDED" ? ` to ${userName(rec.assigned_to, dir)}` : ""}`, meta: `Last updated ${fmtDateTime(rec.updated_at)}` });
  if (approved) tl.push({ icon: "stamp", tone: "gold", title: "Approved and stamped", meta: `${userName(rec.approved_by, dir)} · ${fmtDateTime(rec.approved_at)}` });
  if (rec.tracking_status === "REJECTED") tl.push({ icon: "x-circle", tone: "bad", title: "Rejected", meta: `${userName(rec.approved_by, dir)} · ${fmtDateTime(rec.approved_at)}` });

  mount(root, html`${backLink(R.mail, "Back to mail list")}
    <div class="page-head"><div class="stack-sm" style="gap:6px"><div class="row"><span class="mono strong muted">${rec.reference_number}</span>${badge("mail", rec.tracking_status)}${badge("pri", rec.priority)}</div><h1 class="h1">${rec.subject}</h1></div>
      <div class="row">${canEdit && !finalised ? html`<a class="btn btn-secondary" href="${R.mailEdit(rec.id)}">${icon("edit", 16)}Edit</a><button type="button" class="btn btn-secondary" id="assign">${icon("forward", 16)}Assign / forward</button>${next ? html`<button type="button" class="btn btn-secondary" id="advance">${icon("send", 16)}${next.text}</button>` : ""}` : ""}
        ${canApprove ? html`<a class="btn btn-danger" href="${R.mailApproval(rec.id)}">Reject</a><a class="btn btn-gold" href="${R.mailApproval(rec.id)}">${icon("stamp", 16)}Approve</a>` : ""}
        ${approved ? html`<button type="button" class="btn btn-secondary" id="print">${icon("printer", 16)}Print</button>` : ""}</div></div>
    ${rec.tracking_status === "REJECTED" && rec.rejection_reason ? alert("danger", "Rejected", rec.rejection_reason, "x-circle") : ""}
    <div class="split"><div class="stack-lg" style="min-width:0">
      ${approved ? stampBlock(rec, dir) : ""}
      <section class="card" aria-labelledby="md-h"><div class="card-head"><h2 class="h3" id="md-h">Details</h2></div><dl class="dl card-body" style="margin:0">
        <div><dt>Reference number</dt><dd class="mono">${rec.reference_number}</dd></div><div><dt>Date received</dt><dd>${fmtDate(rec.date_received)}</dd></div><div><dt>Sender</dt><dd>${rec.sender}</dd></div>
        <div><dt>Recorded by</dt><dd>${userName(rec.created_by, dir)}</dd></div><div><dt>Priority</dt><dd>${badge("pri", rec.priority)}</dd></div><div><dt>Workflow</dt><dd>${label(rec.workflow_status)}</dd></div></dl></section>
      <section class="card" aria-labelledby="att-h"><div class="card-head"><h2 class="h3" id="att-h">Attachments (${atts.length})</h2>${canEdit && !finalised ? html`<a class="btn btn-secondary btn-sm" href="${R.mailUpload(rec.id)}">${icon("upload", 16)}Upload</a>` : ""}</div>
        <div class="card-body stack">${needsApiBanner("The server stores uploaded documents but has no endpoint to list, preview or download them yet. Only files uploaded from this browser session are shown.")}
          ${atts.map((a) => { const k = fileKind(a.original_name); return html`<div class="file-row"><span class="f-ico" style="${k.style}">${k.t}</span><div class="f-main"><span class="f-name">${a.original_name}</span><span class="t-xs muted">${fmtSize(a.size_bytes)} · uploaded ${fmtDate(a.created_at)}</span></div></div>`; })}</div></section>
      <section class="card" aria-labelledby="cm-h"><div class="card-head"><h2 class="h3" id="cm-h">Comments</h2></div><div class="card-body stack">${needsApiBanner("Comments on mail need a backend endpoint. Rejection reasons are shown above.")}
        <div class="field"><label class="label" for="cm-new">Add a comment</label><textarea id="cm-new" class="textarea" style="min-height:80px" disabled placeholder="Coming soon"></textarea></div></div></section></div>
      <aside class="stack-lg" aria-label="Assignment and history"><section class="card card-body stack"><h2 class="h3">Assigned to</h2>
        ${rec.assigned_to ? html`<div class="row" style="flex-wrap:nowrap;gap:12px"><span class="avatar">${initials(userName(rec.assigned_to, dir))}</span><div><div class="strong">${userName(rec.assigned_to, dir)}</div><div class="t-xs muted">${dir.get(rec.assigned_to) ? label(dir.get(rec.assigned_to)!.role) : ""}</div></div></div>` : html`<p class="muted">Not assigned yet.</p>`}
        ${canEdit && !finalised ? html`<button type="button" class="btn btn-secondary btn-sm" id="assign2" style="align-self:flex-start">${rec.assigned_to ? "Reassign" : "Assign"}</button>` : ""}</section>
      <section class="card card-body"><h2 class="h3" style="margin-bottom:16px">Status timeline</h2><ol class="timeline">${tl.map((t) => html`<li class="tl-item"><span class="tl-dot ${t.tone}">${icon(t.icon, 16)}</span><div><div class="t-sm strong">${t.title}</div><div class="tl-meta">${t.meta}</div></div></li>`)}
        ${!finalised ? html`<li class="tl-item"><span class="tl-dot" style="border-style:dashed;background:#fff">${icon("stamp", 16)}</span><div><div class="t-sm muted">Awaiting Director's approval</div></div></li>` : ""}</ol></section></aside></div>`);

  const reload = () => detailPage({ root, params, query: new URLSearchParams() });
  $("#advance", root)?.addEventListener("click", async () => { try { await dispatch.update(rec.id, { tracking_status: next!.status }); toast("success", `Status set to ${label(next!.status)}`); await reload(); } catch (e) { toast("error", "Could not update", e instanceof ApiError ? e.message : ""); } });
  $("#print", root)?.addEventListener("click", () => window.print());
  const openAssign = () => assignModal(rec, dir, reload);
  $("#assign", root)?.addEventListener("click", openAssign); $("#assign2", root)?.addEventListener("click", openAssign);
}

function assignModal(rec: Dispatch, dir: Map<string, import("../api/types").User>, done: () => Promise<void>): void {
  modal({ title: "Assign or forward", large: true, body: html`<p class="t-sm muted" style="margin-top:-8px"><span class="mono">${rec.reference_number}</span> · ${rec.assigned_to ? `assigned to ${userName(rec.assigned_to, dir)}` : "currently unassigned"}</p>
    <form id="af" class="stack" novalidate><div id="form-alert" class="alert alert-danger" role="alert" hidden><span class="a-icon">${icon("alert-circle", 18)}</span><div><span id="form-alert-text"></span></div></div>
      <fieldset style="border:0;padding:0;margin:0" class="field"><legend class="label" style="margin-bottom:6px">Action</legend><div class="radio-cards">
        <label class="radio-card is-on"><input type="radio" name="mode" value="forward" checked><span><span class="strong">Forward</span><br><span class="t-xs muted">Assign and set status to Forwarded</span></span></label>
        <label class="radio-card"><input type="radio" name="mode" value="assign"><span><span class="strong">Assign only</span><br><span class="t-xs muted">Keep the current status</span></span></label></div></fieldset>
      ${canListUsers() ? select("assigned_to", "Staff member", activeUsers(dir).map((u) => ({ value: u.id, text: `${u.full_name} · ${label(u.role)}` })), { required: true, blank: "Choose a staff member", value: rec.assigned_to ?? "" }) : field("assigned_to", "Staff member", { required: true, mono: true, value: rec.assigned_to ?? "", placeholder: "Staff user ID (UUID)", help: "Only Admins can browse staff names. Paste the staff member's user ID." })}
      <div class="modal-foot" style="padding:0;border:0"><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="submit" class="btn btn-primary">${icon("forward", 16)}Forward</button></div></form>`,
  }, (layer, close) => {
    const form = $<HTMLFormElement>("#af", layer)!;
    $$("input[name=mode]", form).forEach((r) => r.addEventListener("change", () => { $$(".radio-card", form).forEach((c) => c.classList.toggle("is-on", (c.querySelector("input") as HTMLInputElement).checked)); const fwd = (form.querySelector("input[name=mode]:checked") as HTMLInputElement).value === "forward"; form.querySelector("button[type=submit]")!.lastChild!.textContent = fwd ? "Forward" : "Assign"; }));
    bindForm(form, async (v) => {
      if (!isUuid(v.assigned_to ?? "")) { fieldError(form, "assigned_to", "Choose a staff member (a valid user ID)."); return; }
      const body: Record<string, unknown> = { assigned_to: v.assigned_to }; if (v.mode === "forward") body.tracking_status = "FORWARDED";
      try { await dispatch.update(rec.id, body); } catch (e) { showFormError(form, e); return; }
      close(); toast("success", v.mode === "forward" ? "Mail forwarded" : "Mail assigned"); await done();
    });
  });
}

// ============ EDIT ============
async function editPage({ root, params }: RouteContext): Promise<void> {
  const [rec, dir] = await Promise.all([dispatch.get(params.id!), loadDirectory()]);
  mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${backLink(R.mailDetail(rec.id), "Back to mail")}<div class="page-head"><div><h1 class="h1">Edit mail</h1><p class="sub"><span class="mono">${rec.reference_number}</span> · ${badge("mail", rec.tracking_status)}</p></div></div>
    <form class="stack-lg" id="f" novalidate>${formAlert()}<div class="card"><div class="card-body grid-form">
      <div class="field"><label class="label">Reference number</label><input class="input mono" value="${rec.reference_number}" readonly><span class="help">Reference numbers can't be changed after recording</span></div>
      <div class="field"><label class="label">Date received</label><input class="input" type="date" value="${rec.date_received}" readonly><span class="help">Can't be changed after recording</span></div>
      <div class="span-2">${field("sender", "Sender", { required: true, value: rec.sender, attrs: 'minlength="2" maxlength="150"' })}</div>
      <div class="span-2">${field("subject", "Subject", { required: true, value: rec.subject, attrs: 'minlength="2" maxlength="255"' })}</div>
      ${select("priority", "Priority", PRIORITIES.map((p) => ({ value: p, text: label(p) })), { value: rec.priority })}
      ${select("tracking_status", "Status", (["DRAFT", "PENDING", "FORWARDED", "REVIEWED"] as const).map((s) => ({ value: s, text: label(s) })), { value: rec.tracking_status })}
      ${assigneeField(dir, rec.assigned_to ?? "")}</div></div>
    <div class="action-bar"><a class="btn btn-secondary" href="${R.mailDetail(rec.id)}">Cancel</a><button type="submit" class="btn btn-primary">${icon("save", 16)}Save changes</button></div></form></div>`);
  const form = $<HTMLFormElement>("#f", root)!;
  bindForm(form, async (v) => {
    if (v.assigned_to && !isUuid(v.assigned_to)) { fieldError(form, "assigned_to", "Enter a valid staff user ID."); return; }
    const body: Record<string, unknown> = { sender: v.sender, subject: v.subject, priority: v.priority, tracking_status: v.tracking_status };
    if ((v.assigned_to || null) !== rec.assigned_to) body.assigned_to = v.assigned_to || null;
    await dispatch.update(rec.id, body); toast("success", "Changes saved", "The change is recorded in the audit log."); location.hash = R.mailDetail(rec.id);
  });
}

// ============ APPROVAL ============
async function approvalPage({ root, params }: RouteContext): Promise<void> {
  const [rec, dir] = await Promise.all([dispatch.get(params.id!), loadDirectory()]);
  const me = getUser()!;
  mount(root, html`${pageHead("Approve or reject", "Your decision is final and is recorded in the audit log.")}
    <div class="split"><form class="stack-lg" style="min-width:0" id="f" novalidate>${formAlert()}
      <section class="card"><div class="card-head"><div class="row"><span class="mono strong">${rec.reference_number}</span>${badge("mail", rec.tracking_status)}${badge("pri", rec.priority)}</div><a class="t-sm strong" href="${R.mailDetail(rec.id)}">Open full detail</a></div>
        <dl class="dl card-body" style="margin:0"><div style="grid-column:1/-1"><dt>Subject</dt><dd>${rec.subject}</dd></div><div><dt>Sender</dt><dd>${rec.sender}</dd></div><div><dt>Date received</dt><dd>${fmtDate(rec.date_received)}</dd></div><div><dt>Recorded by</dt><dd>${userName(rec.created_by, dir)}</dd></div></dl></section>
      <section class="card card-body stack" aria-labelledby="dec-h"><h2 class="h3" id="dec-h">Decision</h2><div class="radio-cards" role="radiogroup" aria-labelledby="dec-h">
        <label class="radio-card is-on" id="c-ap"><input type="radio" name="dec" value="APPROVED" checked><span style="color:#15703c;display:flex">${icon("check-circle", 20)}</span><span class="strong">Approve</span></label>
        <label class="radio-card" id="c-rj"><input type="radio" name="dec" value="REJECTED"><span style="color:#b42318;display:flex">${icon("x-circle", 20)}</span><span class="strong">Reject</span></label></div>
        <div id="reason" hidden>${textarea("rejection_reason", "Reason for rejection", { required: true, max: 1000, placeholder: "Explain what needs to change. The recorder will see this." })}</div></section>
      <div class="action-bar"><a class="btn btn-secondary" href="${R.mailDetail(rec.id)}">Cancel</a><button type="submit" class="btn btn-gold" id="go">${icon("stamp", 16)}Approve and stamp</button></div></form>
      <aside class="card card-body stack" aria-labelledby="sp-h" style="align-self:start;align-items:center;text-align:center"><h2 class="h3" id="sp-h" style="align-self:stretch;text-align:left">Stamp preview</h2><div id="stamp"></div></aside></div>`);
  const form = $<HTMLFormElement>("#f", root)!; bindCounters(form);
  const now = new Date().toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
  const paint = () => {
    const rej = (form.querySelector("input[name=dec]:checked") as HTMLInputElement).value === "REJECTED";
    $("#reason", form)!.hidden = !rej; $("#c-ap")!.classList.toggle("is-on", !rej); $("#c-rj")!.classList.toggle("is-on", rej);
    const go = $<HTMLButtonElement>("#go", form)!; go.className = `btn ${rej ? "btn-danger" : "btn-gold"}`; go.innerHTML = rej ? "Reject mail" : `${icon("stamp", 16).value}Approve and stamp`;
    const ta = form.querySelector("textarea[name=rejection_reason]") as HTMLTextAreaElement; if (rej) ta.setAttribute("required", ""); else ta.removeAttribute("required");
    $("#stamp", root)!.innerHTML = rej ? html`<div class="empty" style="padding:24px 8px"><span class="e-icon">${icon("ban", 24)}</span><p class="t-sm">No stamp is added to rejected mail. The status changes to ${badge("mail", "REJECTED")}</p></div>`.value
      : html`<div class="stamp is-preview" role="img" aria-label="Stamp preview"><div class="stamp-in"><span class="st-top">CAPQA · RFMOAUM</span><span class="st-main">APPROVED</span><span class="st-line mono">${rec.reference_number}</span><span class="st-line">${now} · on approval</span><span class="st-line">${me.full_name}, Director</span></div></div><p class="t-sm muted">Date and time are set when you approve.</p>`.value;
  };
  $$("input[name=dec]", form).forEach((r) => r.addEventListener("change", paint)); paint();
  bindForm(form, async (v) => {
    const rej = v.dec === "REJECTED";
    if (rej && !v.rejection_reason) { fieldError(form, "rejection_reason", "A reason is required when rejecting."); return; }
    if (!(await confirmDialog({ title: rej ? "Reject this mail?" : "Approve and stamp this mail?", text: rej ? "The status changes to Rejected and the reason is sent to the recorder." : "A digital stamp is added with today's date and time. This can't be undone.", confirm: rej ? "Reject mail" : "Approve and stamp", danger: rej }))) return;
    await dispatch.decide(rec.id, rej ? "REJECTED" : "APPROVED", rej ? v.rejection_reason : undefined);
    toast("success", rej ? "Mail rejected" : "Mail approved and stamped", rec.reference_number); location.hash = R.mailDetail(rec.id);
  });
}

// ============ ARCHIVE (finalised mail; archive/restore/delete need API) ============
async function archivePage({ root }: RouteContext): Promise<void> {
  const dir = await loadDirectory();
  mount(root, html`${pageHead("Mail archive", "Approved and rejected mail, kept for records.", html`<a class="btn btn-secondary" href="${R.mail}">${icon("arrow-left", 16)}Back to mail list</a>`)}
    ${needsApiBanner("Archiving, restoring and permanently deleting mail need backend endpoints. Until then this list shows all finalised (Approved and Rejected) mail.")}
    <section class="card"><div id="rows">${skeletonRows().value}</div></section>`);
  const [a, r] = await Promise.all([dispatch.list({ tracking_status: "APPROVED", limit: 50 }), dispatch.list({ tracking_status: "REJECTED", limit: 50 })]);
  const rows = [...a.items, ...r.items].sort((x, y) => (y.approved_at ?? "").localeCompare(x.approved_at ?? ""));
  $("#rows", root)!.innerHTML = dataTable<Dispatch>([
    { header: "Reference no.", lead: true, cls: "mono", cell: (m) => html`<a href="${R.mailDetail(m.id)}">${m.reference_number}</a>` }, { header: "Subject", cell: (m) => m.subject },
    { header: "Final status", cell: (m) => badge("mail", m.tracking_status) }, { header: "Decided by", cell: (m) => userName(m.approved_by, dir) }, { header: "Decided on", cls: "num", cell: (m) => fmtDate(m.approved_at) }], rows,
    emptyState("Nothing archived yet", "Approved and rejected mail appears here.")).value;
}

export const dispatchRoutes: Route[] = [
  { path: "/dispatch", title: "Mail list", roles: ["ADMIN", "DIRECTOR", "ACADEMIC-OFFICER", "QUALITY-INSPECTOR", "VIEWER"], render: listPage },
  { path: "/dispatch/new", title: "Record mail", roles: [...EDITORS], render: recordPage },
  { path: "/dispatch/archive", title: "Mail archive", roles: ["ADMIN", "DIRECTOR", "ACADEMIC-OFFICER", "VIEWER"], render: archivePage },
  { path: "/dispatch/:id", title: "Mail detail", roles: ["ADMIN", "DIRECTOR", "ACADEMIC-OFFICER", "QUALITY-INSPECTOR", "VIEWER"], render: detailPage },
  { path: "/dispatch/:id/upload", title: "Upload documents", roles: [...EDITORS], render: uploadPage },
  { path: "/dispatch/:id/edit", title: "Edit mail", roles: [...EDITORS], render: editPage },
  { path: "/dispatch/:id/approval", title: "Approve or reject", roles: ["DIRECTOR"], render: approvalPage },
];
