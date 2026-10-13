import { ApiError } from "../api/client";
import { deptName, hallName, loadClassrooms, loadDepartments } from "../api/directory";
import { facilities } from "../api/services";
import type { Allocation, AllocationPurpose, Classroom } from "../api/types";
import { R } from "../routes";
import type { Route, RouteContext } from "../router";
import { hasRole } from "../session";
import { alert, backLink, badge, bindForm, dataTable, emptyState, errorState, field, fieldError, formAlert, icon, needsApiBanner, onPage, pageHead, pagination, select, skeletonRows, statCard, toast } from "../ui/components";
import { $, $$, fmtDate, fmtDateTime, html, label, mount, raw, Safe } from "../ui/html";

const MANAGE = ["ADMIN", "ACADEMIC-OFFICER"] as const;
const READ = ["ADMIN", "DIRECTOR", "ACADEMIC-OFFICER", "QUALITY-INSPECTOR", "VIEWER"] as const;
const PURPOSES: AllocationPurpose[] = ["CLASS", "EXAM", "EVENT"];
const LEVELS = [100, 200, 300, 400, 500, 600];
const iso = (local: string) => new Date(local).toISOString();
const pad = (n: number) => String(n).padStart(2, "0");
const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const hhmm = (s: string) => new Date(s).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false });
const dayLabel = (s: string) => new Date(s).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });
const whenRange = (a: Allocation) => `${dayLabel(a.start_time)} · ${hhmm(a.start_time)}–${hhmm(a.end_time)}`;

function hallTabs(active: "halls" | "alloc" | "tt" | "cap"): Safe {
  const t = (k: string, href: string, text: string) => html`<a class="tab" role="tab" aria-selected="${active === k}" href="${href}" style="display:inline-flex;align-items:center;text-decoration:none">${text}</a>`;
  return html`<div class="tabs" role="tablist" aria-label="Halls views">${t("halls", R.halls, "Halls")}${t("alloc", R.allocations, "Allocations")}${t("tt", R.timetable, "Timetable")}${t("cap", R.capacity, "Capacity analysis")}</div>`;
}

// ============ HALLS LIST ============
async function hallsList({ root }: RouteContext): Promise<void> {
  const canManage = hasRole(...MANAGE);
  mount(root, html`${pageHead("Classrooms and halls", "", html`<a class="btn btn-secondary" href="${R.timetable}">${icon("calendar", 16)}Timetable</a>${canManage ? html`<a class="btn btn-secondary" href="${R.allocate}">${icon("calendar", 16)}Allocate hall</a><a class="btn btn-primary" href="${R.hallNew}">${icon("plus", 16)}Add hall</a>` : ""}`)}
    ${hallTabs("halls")}<section class="card"><form class="filter-bar" role="search" id="filters">
      <label class="field grow"><span class="label">Search</span><span class="input-wrap"><span class="lead">${icon("search", 18)}</span><input class="input" type="search" name="q" placeholder="Hall name or building"></span></label>
      <label class="field"><span class="label">Department</span><select class="select" name="dept" id="dept"><option value="">All departments</option></select></label>
      <label class="field"><span class="label">Status</span><select class="select" name="status"><option value="">All statuses</option>${(["SUITABLE", "FULL", "OVERCROWDED"] as const).map((s) => html`<option value="${s}">${label(s)}</option>`)}</select></label>
      <button type="button" class="btn btn-ghost" id="clear">Clear</button></form><div id="results">${skeletonRows()}</div></section>`);
  const [halls, depts] = await Promise.all([loadClassrooms(true), loadDepartments()]);
  const sub = root.querySelector(".page-head .sub"); if (!sub) root.querySelector(".page-head > div")!.insertAdjacentHTML("beforeend", `<p class="sub">${halls.length} halls · ${halls.reduce((s, h) => s + h.capacity, 0).toLocaleString("en-NG")} seats in total</p>`);
  const sel = $<HTMLSelectElement>("#dept", root)!; depts.forEach((d) => sel.add(new Option(d.name, String(d.id))));
  if (!depts.length) { sel.disabled = true; sel.title = "Department names are visible to Admin, Director and Academic Officer"; }
  const form = $<HTMLFormElement>("#filters", root)!; const results = $("#results", root)!; let offset = 0; const limit = 10;
  const paint = () => {
    const d = new FormData(form); const q = String(d.get("q") ?? "").toLowerCase(); const st = String(d.get("status")); const dept = String(d.get("dept"));
    const rows = halls.filter((h) => (!q || h.name.toLowerCase().includes(q) || (h.building ?? "").toLowerCase().includes(q)) && (!st || h.status === st) && (!dept || String(h.department_id) === dept)).sort((a, b) => a.name.localeCompare(b.name));
    const slice = rows.slice(offset, offset + limit);
    results.innerHTML = html`${dataTable<Classroom>([
      { header: "Name", lead: true, cell: (h) => html`<a href="${R.hallDetail(h.id)}" class="strong">${h.name}</a>` }, { header: "Building", cell: (h) => h.building ?? "-" },
      { header: "Department", cell: (h) => deptName(h.department_id, depts) }, { header: "Capacity", right: true, cls: "num strong", cell: (h) => h.capacity.toLocaleString("en-NG") },
      { header: "Status", cell: (h) => badge("hall", h.status) }, { header: "Open", right: true, cls: "td-actions", cell: (h) => html`<a class="btn btn-ghost btn-sm" href="${R.hallDetail(h.id)}">Open${icon("chev-right", 14)}</a>` }], slice,
      halls.length ? emptyState("No halls match", "Try clearing a filter.") : emptyState("No halls added yet", "Add lecture theatres, rooms and labs so CAPQA can allocate them and check for overcrowding.", canManage ? { href: R.hallNew, text: "Add hall" } : undefined))}${pagination(rows.length, offset, limit)}`.value;
    onPage(results, (o) => { offset = Math.max(0, o); paint(); });
  };
  form.addEventListener("input", () => { offset = 0; paint(); }); form.addEventListener("submit", (e) => e.preventDefault());
  $("#clear", root)!.addEventListener("click", () => { form.reset(); offset = 0; paint(); });
  paint();
}

// ============ ADD HALL ============
async function hallAdd({ root }: RouteContext): Promise<void> {
  const depts = await loadDepartments();
  mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${pageHead("Add hall", "Add a lecture theatre, room or lab that can be allocated.")}
    <form class="stack-lg" id="f" novalidate>${formAlert()}<div class="card"><div class="card-body grid-form">
      <div class="span-2">${field("name", "Hall name", { required: true, attrs: 'minlength="2" maxlength="80"' })}</div>
      ${field("building", "Building", { optional: true, attrs: 'maxlength="80"' })}
      ${depts.length ? select("department_id", "Department", depts.map((d) => ({ value: d.id, text: d.name })), { optional: true, blank: "— Shared, no department —" }) : field("department_id", "Department ID", { optional: true, type: "number", help: "Department names are visible to Admin, Director and Academic Officer.", attrs: 'min="1"' })}
      ${field("capacity", "Capacity", { required: true, type: "number", help: "Seats available, 1 to 10,000", attrs: 'min="1" max="10000"' })}
      <div class="field"><label class="label">Hall type <span class="opt">(optional)</span></label><select class="select" disabled><option>Coming soon</option></select><span class="help">Backend support pending</span></div>
      <fieldset class="field span-2" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Equipment <span class="opt">(optional)</span></legend><div class="radio-cards">
        ${[["volume", "Audio system"], ["monitor", "Projector"], ["snow", "Air conditioning"]].map(([i, t]) => html`<label class="radio-card" style="opacity:.6"><input type="checkbox" disabled style="width:18px;height:18px">${icon(i!, 18)}${t}</label>`)}</div><span class="help">Equipment tracking needs backend support and is not saved yet.</span></fieldset></div></div>
    <div class="action-bar"><a class="btn btn-secondary" href="${R.halls}">Cancel</a><button type="submit" class="btn btn-primary">Add hall</button></div></form></div>`);
  const form = $<HTMLFormElement>("#f", root)!;
  bindForm(form, async (v) => {
    const cap = Number(v.capacity); if (!Number.isInteger(cap) || cap < 1 || cap > 10000) { fieldError(form, "capacity", "Capacity must be between 1 and 10,000 seats."); return; }
    try {
      const h = await facilities.createClassroom({ name: v.name!, building: v.building || undefined, department_id: v.department_id ? Number(v.department_id) : undefined, capacity: cap });
      await loadClassrooms(true); toast("success", "Hall added", h.name); location.hash = R.hallDetail(h.id);
    } catch (err) { if (err instanceof ApiError && err.status === 409) { fieldError(form, "name", "A hall with this name already exists."); return; } throw err; }
  });
}

// ============ HALL DETAIL ============
async function hallDetail({ root, params }: RouteContext): Promise<void> {
  const [halls, depts, allocs] = await Promise.all([loadClassrooms(true), loadDepartments(), facilities.allocations({})]);
  const hall = halls.find((h) => String(h.id) === params.id); if (!hall) throw new ApiError(404, "NOT_FOUND", "That hall does not exist.");
  const mine = allocs.filter((a) => a.classroom_id === hall.id).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const upcoming = mine.filter((a) => new Date(a.end_time) >= new Date()).slice(0, 8);
  const now = new Date(); const wkStart = new Date(now); wkStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); wkStart.setHours(0, 0, 0, 0); const wkEnd = new Date(wkStart.getTime() + 7 * 86400000);
  const hours = mine.filter((a) => new Date(a.start_time) >= wkStart && new Date(a.start_time) < wkEnd).reduce((s, a) => s + (new Date(a.end_time).getTime() - new Date(a.start_time).getTime()) / 3600000, 0);
  mount(root, html`${backLink(R.halls, "Back to halls")}<div class="page-head"><div class="stack-sm" style="gap:6px"><div class="row">${badge("hall", hall.status)}</div><h1 class="h1">${hall.name}</h1>
      <p class="muted row" style="gap:6px">${icon("pin", 16)}${hall.building ?? "No building"} · ${deptName(hall.department_id, depts)}</p></div>
      <div class="row">${hasRole(...MANAGE) ? html`<a class="btn btn-secondary" href="${R.hallEdit(hall.id)}">${icon("edit", 16)}Edit</a>` : ""}${hasRole("ADMIN", "QUALITY-INSPECTOR") ? html`<a class="btn btn-secondary" href="${R.auditNew}?hall=${hall.id}">${icon("clipboard", 16)}Start audit</a>` : ""}${hasRole(...MANAGE) ? html`<a class="btn btn-primary" href="${R.allocate}?hall=${hall.id}">${icon("calendar", 16)}Allocate</a>` : ""}</div></div>
    <section class="grid-stats" aria-label="Key figures">${statCard({ label: "Capacity", value: hall.capacity.toLocaleString("en-NG"), foot: "seats", icon: "seat" })}${statCard({ label: "Booked this week", value: `${Math.round(hours * 10) / 10} h`, foot: "from allocations", icon: "calendar" })}
      ${statCard({ label: "Latest audit", value: "-", foot: "Per-hall audit history needs a backend endpoint", icon: "clipboard" })}</section>
    <section class="card"><div class="card-head"><h2 class="h3">Upcoming allocations</h2><a class="t-sm strong" href="${R.allocations}">All allocations</a></div>
      ${dataTable<Allocation>([{ header: "When", lead: true, cell: (a) => whenRange(a) }, { header: "Course / event", cell: (a) => a.course_id ? `Course #${a.course_id}` : label(a.purpose) }, { header: "Purpose", cell: (a) => badge("pur", a.purpose) },
        { header: "Level", cell: (a) => a.level ?? "-" }, { header: "Students", right: true, cls: "num", cell: (a) => html`<span class="strong">${a.student_count}</span>${a.student_count > hall.capacity ? html` ${badge("hall", "OVERCROWDED")}` : ""}` }], upcoming, emptyState("No upcoming allocations", "This hall is free."))}</section>`);
}

function hallEdit({ root, params }: RouteContext): Promise<void> {
  return loadClassrooms().then((halls) => {
    const hall = halls.find((h) => String(h.id) === params.id); if (!hall) throw new ApiError(404, "NOT_FOUND", "That hall does not exist.");
    mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${backLink(R.hallDetail(hall.id), "Back to hall")}${pageHead("Edit hall", hall.name)}
      ${needsApiBanner("Editing and deleting halls has no backend endpoint yet. The form is ready; saving is disabled until it exists.")}
      <form class="card" novalidate><div class="card-body grid-form"><div class="span-2">${field("name", "Hall name", { value: hall.name })}</div>${field("building", "Building", { value: hall.building ?? "" })}${field("capacity", "Capacity", { type: "number", value: hall.capacity })}</div>
        <div class="card-foot"><button type="button" class="btn btn-danger" disabled>Delete hall</button><a class="btn btn-secondary" href="${R.hallDetail(hall.id)}">Cancel</a><button type="button" class="btn btn-primary" disabled>Save changes</button></div></form></div>`);
  });
}

// ============ ALLOCATE ============
interface AllocReq { classroom_id: number; course_id?: number; purpose: AllocationPurpose; student_count: number; level: number; start_time: string; end_time: string }

async function allocatePage({ root, query }: RouteContext): Promise<void> {
  const halls = await loadClassrooms(true);
  const pre = query.get("hall"); const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(9, 0, 0, 0); const end = new Date(start.getTime() + 2 * 3600000);
  mount(root, html`<div class="page-narrow stack-lg" style="width:100%" id="alloc-view">${pageHead("Allocate hall", "We check capacity and clashes before saving.", html`<a class="btn btn-ghost" href="${R.alternatives}">${icon("search", 16)}Find a free hall instead</a>`)}
    <form class="stack-lg" id="f" novalidate>${formAlert()}<div class="card"><div class="card-body grid-form">
      <div class="span-2">${select("classroom_id", "Hall", halls.map((h) => ({ value: h.id, text: `${h.name} · ${h.capacity.toLocaleString("en-NG")} seats` })), { required: true, blank: "Choose a hall", value: pre ?? "" })}</div>
      ${field("course_id", "Course ID", { optional: true, type: "number", help: "A course list needs a backend endpoint; enter the numeric course ID if you have it.", attrs: 'min="1"' })}
      ${select("level", "Level", LEVELS.map((l) => ({ value: l, text: String(l) })), { required: true, value: 100 })}
      <fieldset class="field span-2" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Purpose <span class="req" aria-hidden="true">*</span></legend><div class="radio-cards">${PURPOSES.map((p) => html`<label class="radio-card ${p === "CLASS" ? "is-on" : ""}"><input type="radio" name="purpose" value="${p}" ${raw(p === "CLASS" ? "checked" : "")}>${badge("pur", p)}</label>`)}</div></fieldset>
      <div class="field span-2">${field("student_count", "Expected students", { required: true, type: "number", attrs: 'min="0" max="10000" style="max-width:240px"' })}<div id="fit"></div></div>
      ${field("start", "Start", { required: true, type: "datetime-local", value: toLocal(start) })}${field("end", "End", { required: true, type: "datetime-local", value: toLocal(end) })}</div></div>
    <div class="action-bar"><a class="btn btn-secondary" href="${R.halls}">Cancel</a><button type="submit" class="btn btn-primary">Check and allocate</button></div></form></div>`);
  const form = $<HTMLFormElement>("#f", root)!; const fit = $("#fit", root)!;
  $$("input[name=purpose]", form).forEach((r) => r.addEventListener("change", () => $$(".radio-card", form).forEach((c) => c.classList.toggle("is-on", (c.querySelector("input") as HTMLInputElement).checked))));
  const check = () => {
    const hall = halls.find((h) => String(h.id) === (form.elements.namedItem("classroom_id") as HTMLSelectElement).value); const n = Number((form.elements.namedItem("student_count") as HTMLInputElement).value);
    if (!hall || !n) { fit.innerHTML = ""; return; } const pct = Math.round((n / hall.capacity) * 100);
    fit.innerHTML = n > hall.capacity ? alert("warning", `Overcrowding: ${n} students for ${hall.capacity} seats`, html`${n - hall.capacity} more than capacity (${pct}%). You can still save, but the hall will be flagged ${badge("hall", "OVERCROWDED")}. <a href="${R.alternatives}?students=${n}">Find a bigger hall</a>`, "alert").value
      : html`<span class="help" style="color:#15703c;display:flex;gap:6px;align-items:center;margin-top:6px">${icon("check-circle", 16)}${n === hall.capacity ? "Exactly full" : "Fits"}: ${pct}% of ${hall.capacity} seats</span>`.value;
  };
  form.addEventListener("input", check);
  bindForm(form, async (v) => {
    if (new Date(v.end!) <= new Date(v.start!)) { fieldError(form, "end", "End must be later than start."); return; }
    const req: AllocReq = { classroom_id: Number(v.classroom_id), course_id: v.course_id ? Number(v.course_id) : undefined, purpose: v.purpose as AllocationPurpose, student_count: Number(v.student_count), level: Number(v.level), start_time: iso(v.start!), end_time: iso(v.end!) };
    try { const a = await facilities.allocate(req as unknown as Record<string, unknown>); toast("success", "Hall allocated", `${hallName(a.classroom_id, halls)} · ${whenRange(a)}`); location.hash = R.allocations; }
    catch (err) { if (err instanceof ApiError && err.status === 409) { await showClash(root, req, halls); return; } throw err; }
  });
}

async function showClash(root: HTMLElement, req: AllocReq, halls: Classroom[]): Promise<void> {
  const hall = halls.find((h) => h.id === req.classroom_id);
  const found = (await facilities.allocations({ starts_after: new Date(new Date(req.start_time).getTime() - 86400000).toISOString(), ends_before: new Date(new Date(req.end_time).getTime() + 86400000).toISOString() }))
    .find((a) => a.classroom_id === req.classroom_id && new Date(a.start_time) < new Date(req.end_time) && new Date(a.end_time) > new Date(req.start_time));
  const qs = new URLSearchParams({ students: String(req.student_count), start: req.start_time, end: req.end_time, purpose: req.purpose, level: String(req.level) }); if (req.course_id) qs.set("course", String(req.course_id));
  const total = (new Date(req.end_time).getTime() - new Date(req.start_time).getTime()); const ov = found ? Math.min(+new Date(req.end_time), +new Date(found.end_time)) - Math.max(+new Date(req.start_time), +new Date(found.start_time)) : 0;
  root.innerHTML = html`<div class="page-narrow stack-lg" style="width:100%"><div class="alert alert-danger" role="alert" style="padding:16px 20px"><span class="a-icon">${icon("alert-circle", 22)}</span><div><h1 class="h2" style="color:inherit">Clash detected</h1><p style="margin-top:4px">${hall?.name ?? "This hall"} is already booked for part of this time. Nothing has been saved.</p></div></div>
    <div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))"><section class="card"><div class="card-head"><h2 class="h3">Your request</h2>${badge("pur", req.purpose)}</div><dl class="dl card-body" style="grid-template-columns:1fr;margin:0">
      <div><dt>Time</dt><dd>${fmtDateTime(req.start_time)} to ${hhmm(req.end_time)}</dd></div><div><dt>Expected students</dt><dd>${req.student_count}</dd></div><div><dt>Level</dt><dd>${req.level}</dd></div></dl></section>
      <section class="card" style="border-color:#fecdca"><div class="card-head" style="background:#fef3f2;border-radius:8px 8px 0 0"><h2 class="h3">Conflicting booking</h2>${found ? badge("pur", found.purpose) : ""}</div>
      ${found ? html`<dl class="dl card-body" style="grid-template-columns:1fr;margin:0"><div><dt>Time</dt><dd>${fmtDateTime(found.start_time)} to ${hhmm(found.end_time)}</dd></div><div><dt>Students</dt><dd>${found.student_count}</dd></div><div><dt>Level</dt><dd>${found.level ?? "-"}</dd></div></dl>` : html`<div class="card-body muted">The conflicting booking is not visible to your account.</div>`}</section></div>
    ${found ? html`<section class="card card-body stack-sm"><h2 class="h3">Overlap · ${Math.round(ov / 60000)} minutes of your ${Math.round(total / 60000)}-minute request</h2></section>` : ""}
    <div class="action-bar"><button type="button" class="btn btn-secondary" id="back">${icon("arrow-left", 16)}Change time</button><a class="btn btn-primary" href="${R.alternatives}?${qs.toString()}">${icon("sparkles", 16)}Suggest alternatives</a></div></div>`.value;
  $("#back", root)!.addEventListener("click", () => { void allocatePage({ root, params: {}, query: new URLSearchParams({ hall: String(req.classroom_id) }) }); });
}

// ============ ALTERNATIVES ============
async function alternativesPage({ root, query }: RouteContext): Promise<void> {
  const [halls, depts] = await Promise.all([loadClassrooms(), loadDepartments()]);
  const start = query.get("start") ? toLocal(new Date(query.get("start")!)) : toLocal(new Date(Date.now() + 86400000)); const end = query.get("end") ? toLocal(new Date(query.get("end")!)) : toLocal(new Date(Date.now() + 86400000 + 2 * 3600000));
  mount(root, html`${pageHead("Alternative halls", "Free halls that fit your students, best fit first.")}
    <form class="card filter-bar" style="border-radius:8px" aria-label="Search criteria" id="f"><div style="display:contents">${field("student_count", "Students", { required: true, type: "number", value: query.get("students") ?? "", attrs: 'min="0" max="10000"' })}
      ${field("start", "Start", { required: true, type: "datetime-local", value: start })}${field("end", "End", { required: true, type: "datetime-local", value: end })}
      ${depts.length ? select("department_id", "Department", depts.map((d) => ({ value: d.id, text: d.name })), { optional: true, blank: "Any department" }) : ""}
      <button type="submit" class="btn btn-primary">${icon("search", 16)}Find halls</button></div></form><div id="out" aria-live="polite"></div>`);
  const form = $<HTMLFormElement>("#f", root)!; const out = $("#out", root)!;
  const canUse = hasRole(...MANAGE);
  async function run(): Promise<void> {
    const d = new FormData(form); const n = Number(d.get("student_count")); const s = String(d.get("start")); const e = String(d.get("end"));
    if (!s || !e || new Date(e) <= new Date(s) || Number.isNaN(n) || !d.get("student_count")) { out.innerHTML = alert("warning", "Check your search", "Enter the number of students and a start time that is before the end time.").value; return; }
    out.innerHTML = skeletonRows(3).value;
    try {
      const res = await facilities.suggestions({ student_count: n, start_time: iso(s), end_time: iso(e), department_id: d.get("department_id") ? Number(d.get("department_id")) : undefined });
      out.innerHTML = html`<p class="t-sm muted" style="margin-bottom:12px">${res.length} hall${res.length === 1 ? "" : "s"} available ${fmtDateTime(iso(s))} to ${hhmm(iso(e))} for ${n} students</p>
        ${res.length ? html`<ol style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px" aria-label="Suggested halls">${res.map((h, i) => { const fitPct = Math.round((n / h.capacity) * 100); return html`<li class="card" style="${i === 0 ? "border-color:#7dce98;box-shadow:0 0 0 1px #7dce98" : ""}"><div class="card-body" style="display:flex;flex-wrap:wrap;gap:16px 24px;align-items:center">
          <span style="display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:${i === 0 ? "#166534" : "#f1f5f9"};color:${i === 0 ? "#fff" : "#334155"};font-weight:700;flex:none" aria-label="Rank ${i + 1}">${i + 1}</span>
          <div style="flex:1 1 260px;min-width:0" class="stack-sm"><div class="row"><h2 class="h3">${h.name}</h2>${i === 0 ? html`<span class="badge tone-success">Best fit</span>` : ""}</div><span class="t-sm muted">${h.building ?? "No building"}</span></div>
          <div style="flex:0 1 240px;min-width:180px" class="stack-sm"><div class="row-between t-sm"><span><span class="strong num">${h.capacity}</span> seats</span><span class="muted">${fitPct}% used</span></div><div class="progress" role="img" aria-label="${n} students use ${fitPct}% of ${h.capacity} seats"><span style="width:${fitPct}%"></span></div><span class="t-xs muted">${h.capacity - n} spare seats</span></div>
          ${canUse ? html`<button type="button" class="btn ${i === 0 ? "btn-primary" : "btn-secondary"}" data-use="${h.classroom_id}">Use this hall</button>` : ""}</div></li>`; })}</ol>` : emptyState("No free hall fits", "Try a different time or fewer students.")}`.value;
      $$("[data-use]", out).forEach((b) => b.addEventListener("click", async () => {
        (b as HTMLButtonElement).disabled = true;
        try {
          await facilities.allocate({ classroom_id: Number((b as HTMLElement).dataset.use), course_id: query.get("course") ? Number(query.get("course")) : undefined, purpose: query.get("purpose") ?? "CLASS", student_count: n, level: query.get("level") ? Number(query.get("level")) : undefined, start_time: iso(s), end_time: iso(e) });
          toast("success", "Hall allocated", `${hallName(Number((b as HTMLElement).dataset.use), halls)}`); location.hash = R.allocations;
        } catch (err) { (b as HTMLButtonElement).disabled = false; toast("error", "Could not allocate", err instanceof ApiError ? err.message : ""); }
      }));
    } catch (err) { out.innerHTML = errorState(err).value; $("[data-retry]", out)?.addEventListener("click", () => void run()); }
  }
  form.addEventListener("submit", (ev) => { ev.preventDefault(); void run(); });
  if (query.get("students")) await run();
}

// ============ ALLOCATIONS LIST ============
async function allocationsList({ root }: RouteContext): Promise<void> {
  const [halls, depts] = await Promise.all([loadClassrooms(), loadDepartments()]);
  mount(root, html`${pageHead("Allocations", "Hall bookings for classes, exams and events.", html`<a class="btn btn-secondary" href="${R.timetable}">${icon("calendar", 16)}Timetable view</a>${hasRole(...MANAGE) ? html`<a class="btn btn-primary" href="${R.allocate}">${icon("plus", 16)}Allocate hall</a>` : ""}`)}${hallTabs("alloc")}
    <section class="card"><form class="filter-bar" id="f">
      <label class="field"><span class="label">Department</span><select class="select" name="department_id" ${raw(depts.length ? "" : "disabled")}><option value="">All departments</option>${depts.map((d) => html`<option value="${d.id}">${d.name}</option>`)}</select></label>
      <label class="field"><span class="label">Level</span><select class="select" name="level"><option value="">All levels</option>${LEVELS.map((l) => html`<option value="${l}">${l}</option>`)}</select></label>
      <label class="field"><span class="label">From</span><input class="input" type="datetime-local" name="from"></label><label class="field"><span class="label">To</span><input class="input" type="datetime-local" name="to"></label>
      <button type="submit" class="btn btn-secondary">Apply</button></form><div id="results">${skeletonRows()}</div></section>`);
  const form = $<HTMLFormElement>("#f", root)!; const results = $("#results", root)!; let offset = 0; const limit = 10;
  async function load(): Promise<void> {
    const d = new FormData(form); results.innerHTML = skeletonRows().value;
    try {
      const all = await facilities.allocations({ department_id: d.get("department_id") ? Number(d.get("department_id")) : undefined, level: d.get("level") ? Number(d.get("level")) : undefined, starts_after: d.get("from") ? iso(String(d.get("from"))) : undefined, ends_before: d.get("to") ? iso(String(d.get("to"))) : undefined });
      const slice = all.slice(offset, offset + limit);
      results.innerHTML = html`${dataTable<Allocation>([
        { header: "Hall", lead: true, cell: (a) => html`<a class="strong" href="${R.hallDetail(a.classroom_id)}">${hallName(a.classroom_id, halls)}</a>` }, { header: "Course / event", cell: (a) => a.course_id ? `Course #${a.course_id}` : label(a.purpose) },
        { header: "Purpose", cell: (a) => badge("pur", a.purpose) }, { header: "Level", cell: (a) => a.level ?? "-" },
        { header: "Students", right: true, cls: "num", cell: (a) => { const cap = halls.find((h) => h.id === a.classroom_id)?.capacity; return html`<span class="strong">${a.student_count}</span>${cap ? html` <span class="muted">/ ${cap}</span>${a.student_count > cap ? html`<br>${badge("hall", "OVERCROWDED")}` : ""}` : ""}`; } },
        { header: "Start", cls: "num", cell: (a) => fmtDateTime(a.start_time) }, { header: "End", cls: "num", cell: (a) => hhmm(a.end_time) },
        { header: "Edit", right: true, cls: "td-actions", cell: (a) => hasRole(...MANAGE) ? html`<a class="btn btn-ghost btn-sm" href="${R.allocationEdit(a.id)}">Edit</a>` : "" }], slice,
        emptyState("No allocations in this time window", "Widen the dates or clear the filters.", hasRole(...MANAGE) ? { href: R.allocate, text: "Allocate hall" } : undefined))}${pagination(all.length, offset, limit)}`.value;
      onPage(results, (o) => { offset = Math.max(0, o); void load(); });
    } catch (err) { results.innerHTML = errorState(err).value; $("[data-retry]", results)?.addEventListener("click", () => void load()); }
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); offset = 0; void load(); }); await load();
}

function allocationEdit({ root, params }: RouteContext): void {
  mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${backLink(R.allocations, "Back to allocations")}${pageHead("Edit or cancel allocation", `Allocation ${params.id!.slice(0, 8)}`)}
    ${needsApiBanner("Editing and cancelling allocations needs backend endpoints. This screen is a placeholder until they exist.")}
    <div class="card card-body"><div class="row"><button class="btn btn-secondary" disabled>Edit</button><button class="btn btn-danger" disabled>Cancel booking</button></div></div></div>`);
}

// ============ TIMETABLE ============
async function timetablePage({ root, query }: RouteContext): Promise<void> {
  const [halls, allocs] = await Promise.all([loadClassrooms(), facilities.allocations({})]);
  const base = query.get("week") ? new Date(query.get("week")!) : new Date(); const mon = new Date(base); mon.setDate(base.getDate() - ((base.getDay() + 6) % 7)); mon.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 5 }, (_, i) => new Date(mon.getTime() + i * 86400000)); const fri = days[4]!;
  const weekAllocs = allocs.filter((a) => { const s = new Date(a.start_time); return s >= mon && s < new Date(fri.getTime() + 86400000); });
  const usedHalls = halls.filter((h) => weekAllocs.some((a) => a.classroom_id === h.id));
  const wk = (d: Date) => toLocal(d).slice(0, 10); const prev = new Date(mon.getTime() - 7 * 86400000), next = new Date(mon.getTime() + 7 * 86400000);
  const slot = (a: Allocation) => html`<button type="button" class="slot slot-${a.purpose.toLowerCase()}" data-alloc="${a.id}" aria-label="${label(a.purpose)}: ${hallName(a.classroom_id, halls)}, ${hhmm(a.start_time)}–${hhmm(a.end_time)}"><b>${a.course_id ? `Course #${a.course_id}` : label(a.purpose)}</b><span>${hhmm(a.start_time)}–${hhmm(a.end_time)}</span><span class="t-xs">${label(a.purpose)} · ${a.student_count}</span></button>`;
  mount(root, html`${pageHead("Timetable", `Week of ${fmtDate(mon.toISOString())} to ${fmtDate(fri.toISOString())} · built from allocations`, html`<div class="row" style="gap:4px"><a class="btn btn-secondary btn-icon" href="${R.timetable}?week=${wk(prev)}" aria-label="Previous week">${icon("chev-left", 18)}</a><a class="btn btn-secondary" href="${R.timetable}">This week</a><a class="btn btn-secondary btn-icon" href="${R.timetable}?week=${wk(next)}" aria-label="Next week">${icon("chev-right", 18)}</a></div>${hasRole(...MANAGE) ? html`<a class="btn btn-primary" href="${R.allocate}">${icon("plus", 16)}Allocate</a>` : ""}`)}${hallTabs("tt")}
    <div class="legend" aria-label="Legend">${badge("pur", "CLASS")}${badge("pur", "EXAM")}${badge("pur", "EVENT")}</div>
    ${usedHalls.length ? html`<section class="card only-md" style="overflow-x:auto;display:block" aria-label="Weekly timetable grid"><div class="tt" role="grid"><div class="tt-h" role="columnheader">Hall</div>${days.map((d) => html`<div class="tt-h" role="columnheader">${d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })}</div>`)}
      ${usedHalls.map((h) => html`<div class="tt-hall" role="rowheader">${h.name}<div class="t-xs muted" style="font-weight:400">${h.capacity} seats</div></div>${days.map((d) => html`<div class="tt-cell" role="gridcell">${weekAllocs.filter((a) => a.classroom_id === h.id && new Date(a.start_time).toDateString() === d.toDateString()).sort((a, b) => a.start_time.localeCompare(b.start_time)).map(slot)}</div>`)}`)}</div></section>
      <section class="lt-md" style="flex-direction:column;gap:12px" aria-label="Day agenda"><div class="tabs" role="tablist">${days.map((d, i) => html`<button type="button" class="tab" role="tab" data-day="${i}" aria-selected="${i === Math.min(4, (new Date().getDay() + 6) % 7)}">${d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric" })}</button>`)}</div><div id="agenda" style="display:flex;flex-direction:column;gap:12px"></div></section>`
      : html`<div class="card">${emptyState("Nothing booked this week", "Allocations for this week will appear here.", hasRole(...MANAGE) ? { href: R.allocate, text: "Allocate hall" } : undefined)}</div>`}`);
  const open = (id: string) => {
    const a = allocs.find((x) => x.id === id); if (!a) return; const hall = halls.find((h) => h.id === a.classroom_id);
    const layer = document.createElement("div"); layer.className = "drawer-layer";
    layer.innerHTML = html`<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="tt-d"><div class="drawer-head"><div class="stack-sm" style="gap:4px">${badge("pur", a.purpose)}<h2 class="h3" id="tt-d">${a.course_id ? `Course #${a.course_id}` : label(a.purpose)}</h2></div><button type="button" class="btn btn-ghost btn-icon" aria-label="Close" data-x>${icon("x", 18)}</button></div>
      <div class="drawer-body"><dl class="dl" style="grid-template-columns:1fr;margin:0"><div><dt>Hall</dt><dd>${hall?.name ?? a.classroom_id}</dd></div><div><dt>When</dt><dd>${whenRange(a)}</dd></div><div><dt>Expected students</dt><dd>${a.student_count}${hall ? ` of ${hall.capacity} seats` : ""}</dd></div><div><dt>Level</dt><dd>${a.level ?? "-"}</dd></div></dl></div>
      <div class="drawer-foot">${hasRole(...MANAGE) ? html`<a class="btn btn-primary" href="${R.allocationEdit(a.id)}">Edit or cancel</a>` : ""}</div></aside>`.value;
    const close = () => { layer.remove(); document.removeEventListener("keydown", esc); }; const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    layer.addEventListener("mousedown", (e) => { if (e.target === layer) close(); }); layer.querySelector("[data-x]")!.addEventListener("click", close); document.addEventListener("keydown", esc); document.body.appendChild(layer);
  };
  root.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-alloc]"); if (b) open(b.dataset.alloc!); });
  const agenda = $("#agenda", root);
  if (agenda) { const show = (i: number) => { $$("[data-day]", root).forEach((t) => t.setAttribute("aria-selected", String(Number(t.dataset.day) === i))); const d = days[i]!;
    const items = weekAllocs.filter((a) => new Date(a.start_time).toDateString() === d.toDateString()).sort((a, b) => a.start_time.localeCompare(b.start_time));
    agenda.innerHTML = items.length ? items.map((a) => html`<button type="button" class="slot slot-${a.purpose.toLowerCase()}" data-alloc="${a.id}" style="padding:12px;gap:4px"><b style="font-size:14px">${a.course_id ? `Course #${a.course_id}` : label(a.purpose)}</b><span>${hhmm(a.start_time)}–${hhmm(a.end_time)} · ${hallName(a.classroom_id, halls)}</span><span>${label(a.purpose)} · ${a.student_count} students</span></button>`.value).join("") : `<p class="muted">Nothing booked.</p>`; };
    $$("[data-day]", root).forEach((t) => t.addEventListener("click", () => show(Number(t.dataset.day)))); show(Math.min(4, (new Date().getDay() + 6) % 7)); }
}

// ============ CAPACITY ANALYSIS (computed from allocations and hall capacity) ============
async function capacityPage({ root }: RouteContext): Promise<void> {
  const [halls, allocs] = await Promise.all([loadClassrooms(), facilities.allocations({})]);
  const rows = allocs.filter((a) => a.purpose !== "EVENT").map((a) => { const h = halls.find((x) => x.id === a.classroom_id); return { a, h, pct: h ? Math.round((a.student_count / h.capacity) * 100) : 0 }; }).filter((r) => r.h).sort((x, y) => y.pct - x.pct);
  const over = rows.filter((r) => r.pct > 100); const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : 0;
  mount(root, html`${pageHead("Capacity vs enrolment", "Class and exam allocations compared with hall capacity.")}${hallTabs("cap")}
    <section class="grid-stats" aria-label="Summary">${statCard({ label: "Allocations checked", value: rows.length, icon: "calendar" })}
      <div class="card stat" style="border-color:#fecdca"><span class="s-label" style="color:#b42318">${icon("alert", 16)}Overcrowded</span><span class="s-value" style="color:#b42318">${over.length}</span><span class="s-foot">${rows.length ? Math.round((over.length / rows.length) * 100) : 0}% of allocations</span></div>
      ${statCard({ label: "Average utilisation", value: `${avg}%`, foot: "target 60–90%", icon: "percent" })}</section>
    <section class="card"><div class="filter-bar"><label class="field"><span class="label">Show</span><select class="select" id="show"><option value="all">All allocations</option><option value="over">Overcrowded only</option><option value="low">Under 40% used</option></select></label></div><div id="tbl"></div></section>`);
  const paint = () => { const f = ($("#show", root) as HTMLSelectElement).value; const list = rows.filter((r) => f === "all" || (f === "over" && r.pct > 100) || (f === "low" && r.pct < 40));
    $("#tbl", root)!.innerHTML = dataTable<(typeof rows)[number]>([{ header: "Course", lead: true, cell: (r) => html`<span class="strong">${r.a.course_id ? `Course #${r.a.course_id}` : label(r.a.purpose)}</span><br><span class="t-xs muted">${r.a.level ?? "-"} level · ${whenRange(r.a)}</span>` }, { header: "Hall", cell: (r) => r.h!.name },
      { header: "Students", right: true, cls: "num strong", cell: (r) => r.a.student_count }, { header: "Capacity", right: true, cls: "num", cell: (r) => r.h!.capacity },
      { header: "Utilisation", cell: (r) => html`<div style="display:flex;align-items:center;gap:10px;min-width:160px"><div class="progress" style="flex:1 1 auto"><span style="width:${Math.min(100, r.pct)}%;background:${r.pct > 100 ? "#dc2626" : r.pct >= 90 ? "#d97706" : "#166534"}"></span></div><span class="num strong">${r.pct}%</span></div>` },
      { header: "Status", cell: (r) => r.pct > 100 ? badge("hall", "OVERCROWDED") : r.pct === 100 ? badge("hall", "FULL") : badge("hall", "SUITABLE") }], list, emptyState("Nothing to show", "No allocations match this view.")).value; };
  $("#show", root)!.addEventListener("change", paint); paint();
}

export const hallRoutes: Route[] = [
  { path: "/halls", title: "Classrooms and halls", roles: [...READ], render: hallsList },
  { path: "/halls/new", title: "Add hall", roles: [...MANAGE], render: hallAdd },
  { path: "/halls/capacity", title: "Capacity analysis", roles: [...READ], render: capacityPage },
  { path: "/halls/:id", title: "Hall detail", roles: [...READ], render: hallDetail },
  { path: "/halls/:id/edit", title: "Edit hall", roles: [...MANAGE], render: hallEdit },
  { path: "/allocate", title: "Allocate hall", roles: [...MANAGE], render: allocatePage },
  { path: "/allocate/alternatives", title: "Alternative halls", roles: [...READ], render: alternativesPage },
  { path: "/allocations", title: "Allocations", roles: [...READ], render: allocationsList },
  { path: "/allocations/:id/edit", title: "Edit allocation", roles: [...MANAGE], render: allocationEdit },
  { path: "/timetable", title: "Timetable", roles: [...READ], render: timetablePage },
];
