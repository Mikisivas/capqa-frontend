import { ApiError } from "../api/client";
import { activeUsers, deptName, isUuid, loadCourses, loadDepartments, loadDirectory, loadStaff, resetDepartments, userName } from "../api/directory";
import { academic } from "../api/services";
import type { AccreditationStatus, BenchmarkSource, Course, Department, DepartmentCompliance, Staff } from "../api/types";
import { R } from "../routes";
import type { Route, RouteContext } from "../router";
import { hasRole } from "../session";
import { backLink, badge, bindCounters, bindForm, confirmDialog, dataTable, emptyState, errorState, field, fieldError, formAlert, hbar, icon, needsApiBanner, onPage, pageHead, pagination, select, skeletonRows, textarea, toast } from "../ui/components";
import { $, $$, fmtDate, html, label, mount, Safe } from "../ui/html";
import { dashboard } from "../api/services";

const ACADEMIC = ["ADMIN", "DIRECTOR", "ACADEMIC-OFFICER"] as const;
const VIEW = ["ADMIN", "DIRECTOR", "ACADEMIC-OFFICER", "QUALITY-INSPECTOR", "VIEWER"] as const;
const INSPECT = ["ADMIN", "QUALITY-INSPECTOR"] as const;
const canAcademic = () => hasRole(...ACADEMIC);
const sessions = () => { const y = new Date().getFullYear(); const s = new Date().getMonth() >= 8 ? y : y - 1; return [0, 1, 2].map((i) => `${s - i}/${s - i + 1}`); };
const LEVELS = [100, 200, 300, 400, 500, 600];
const FACILITIES = ["Classrooms", "Laboratories", "Library", "ICT facilities", "Staff offices", "General"];
const band = (v: number) => v >= 70 ? { t: "Meets target", c: "#1a763f" } : v >= 50 ? { t: "Watch", c: "#d97706" } : { t: "Action needed", c: "#dc2626" };

function deptSelect(depts: Department[], name = "department_id", value?: string | number, text = "Department"): Safe {
  return depts.length ? select(name, text, depts.map((d) => ({ value: d.id, text: d.name })), { required: true, blank: "Choose a department", value })
    : field(name, `${text} ID`, { required: true, type: "number", value: value ?? "", help: "Department names are visible to Admin, Director and Academic Officer.", attrs: 'min="1"' });
}
const sessionSelect = (name = "session", value = sessions()[0]) => select(name, "Session", sessions().map((s) => ({ value: s, text: s })), { required: true, value });

/** Shared shell for the small "record something" forms. */
function formPage(root: HTMLElement, opts: { title: string; sub?: string; back: string; body: Safe; submit: string; run: (v: Record<string, string>, form: HTMLFormElement) => Promise<void>; after?: (form: HTMLFormElement) => void; backText?: string }): void {
  mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${opts.backText ? backLink(opts.back, opts.backText) : ""}${pageHead(opts.title, opts.sub ?? "")}<form class="stack-lg" id="f" novalidate>${formAlert()}<div class="card"><div class="card-body grid-form">${opts.body}</div></div>
    <div class="action-bar"><a class="btn btn-secondary" href="${opts.back}">Cancel</a><button type="submit" class="btn btn-primary">${opts.submit}</button></div></form></div>`);
  const form = $<HTMLFormElement>("#f", root)!; bindCounters(form); opts.after?.(form);
  bindForm(form, async (v) => { try { await opts.run(v, form); } catch (e) { if (e instanceof ApiError && e.status === 409) { fieldError(form, "name", e.message); return; } throw e; } });
}

const ACC: AccreditationStatus[] = ["FULL", "INTERIM", "DENIED"];
const accRadios = (value: AccreditationStatus = "INTERIM") => html`<fieldset class="field span-2" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Accreditation status</legend><div class="radio-cards">${ACC.map((s) => html`<label class="radio-card ${s === value ? "is-on" : ""}"><input type="radio" name="accreditation_status" value="${s}" ${s === value ? "checked" : ""}>${badge("acc", s)}</label>`)}</div></fieldset>`;
const bindRadioCards = (f: HTMLFormElement, name: string) => $$(`input[name=${name}]`, f).forEach((r) => r.addEventListener("change", () => $$(".radio-card", f).forEach((c) => c.classList.toggle("is-on", (c.querySelector("input") as HTMLInputElement).checked))));
/** Optional link from a staff record to a CAPQA login, picked from the user directory. */
async function userLinkField(value = ""): Promise<Safe> {
  const dir = await loadDirectory(); const users = activeUsers(dir);
  if (value && !users.some((u) => u.id === value)) users.unshift({ id: value, full_name: userName(value, dir), role: "VIEWER" });
  return select("user_id", "Linked user account", users.map((u) => ({ value: u.id, text: `${u.full_name}${u.username ? ` · ${u.username}` : ""}` })), { optional: true, blank: "— No CAPQA account —", value, help: "Link this staff record to a CAPQA login so their evaluations and tasks line up." });
}
const courseConflict = (root: HTMLElement) => (e: unknown) => { if (e instanceof ApiError && e.status === 409) { fieldError($<HTMLFormElement>("#f", root)!, "code", e.message); return; } throw e; };

// ============ LIST ============
async function listPage({ root }: RouteContext): Promise<void> {
  const [depts] = await Promise.all([loadDepartments()]);
  let session = sessions()[0]!;
  mount(root, html`${pageHead("Departments and accreditation", "", html`<a class="btn btn-secondary" href="${R.complianceDashboard}">${icon("shield", 16)}Compliance dashboard</a>${canAcademic() ? html`<a class="btn btn-secondary" href="${R.nuc}">NUC benchmarks</a><a class="btn btn-primary" href="${R.deptNew}">${icon("plus", 16)}Add department</a>` : ""}`)}
    <section class="card"><form class="filter-bar" id="f"><label class="field grow"><span class="label">Search</span><span class="input-wrap"><span class="lead">${icon("search", 18)}</span><input class="input" type="search" name="q" placeholder="Department name"></span></label>
      <label class="field"><span class="label">Faculty</span><select class="select" name="fac"><option value="">All faculties</option>${[...new Set(depts.map((d) => d.faculty))].sort().map((f) => html`<option>${f}</option>`)}</select></label>
      <label class="field"><span class="label">Compliance</span><select class="select" name="comp"><option value="">All</option><option value="yes">Meets NUC ratio</option><option value="no">Below NUC ratio</option></select></label>
      <label class="field"><span class="label">Session</span><select class="select" name="session">${sessions().map((s) => html`<option>${s}</option>`)}</select></label></form><div id="rows">${skeletonRows()}</div></section>`);
  if (!depts.length) { $("#rows", root)!.innerHTML = (await academic.departments().then((d) => d.length ? emptyState("", "") : emptyState("No departments yet", "Add departments to record staff, students, courses and accreditation.", canAcademic() ? { href: R.deptNew, text: "Add department" } : undefined), (e) => errorState(e))).value; $("[data-retry]", root)?.addEventListener("click", () => location.reload()); return; }
  const form = $<HTMLFormElement>("#f", root)!; let data = new Map<number, DepartmentCompliance | null>();
  const load = async () => { data = new Map(); $("#rows", root)!.innerHTML = skeletonRows().value;
    await Promise.all(depts.map((d) => academic.compliance(d.id, session).then((c) => data.set(d.id, c), () => data.set(d.id, null)))); paint(); };
  const paint = () => { const f = new FormData(form); const q = String(f.get("q")).toLowerCase(); const fac = String(f.get("fac")); const comp = String(f.get("comp"));
    const rows = depts.filter((d) => (!q || d.name.toLowerCase().includes(q)) && (!fac || d.faculty === fac) && (!comp || (comp === "yes" ? data.get(d.id)?.staffing_compliant === true : data.get(d.id)?.staffing_compliant === false)));
    $("#rows", root)!.innerHTML = dataTable<Department>([{ header: "Department", lead: true, cell: (d) => html`<a class="strong" href="${R.deptDetail(d.id)}">${d.name}</a><br><span class="t-xs muted">${d.faculty}</span>` },
      { header: "Staff", right: true, cls: "num", cell: (d) => data.get(d.id)?.staff_count ?? "-" }, { header: "Students", right: true, cls: "num", cell: (d) => data.get(d.id)?.student_count ?? "-" },
      { header: "Ratio", right: true, cls: "num", cell: (d) => { const r = data.get(d.id)?.students_per_staff; return r != null ? `1 : ${r.toFixed(0)}` : "-"; } },
      { header: "Quality score", cell: (d) => { const q = data.get(d.id)?.departmental_quality_score; return q == null ? "-" : html`<div style="display:flex;gap:10px;align-items:center;min-width:140px"><div class="progress" style="flex:1 1 auto"><span style="width:${q}%;background:${band(q).c}"></span></div><span class="num strong">${Math.round(q)}</span></div>`; } },
      { header: "Compliance", cell: (d) => { const c = data.get(d.id); return !c || c.staffing_compliant == null ? html`<span class="badge no-glyph">No data</span>` : c.staffing_compliant ? html`<span class="badge" data-s="pass">Meets NUC ratio</span>` : html`<span class="badge" data-s="fail">Below NUC ratio</span>`; } },
      { header: "Open", right: true, cls: "td-actions", cell: (d) => html`<a class="btn btn-ghost btn-sm" href="${R.deptDetail(d.id)}">Open${icon("chev-right", 14)}</a>` }], rows, emptyState("No departments match", "Try clearing a filter.")).value; };
  form.addEventListener("input", (e) => { if ((e.target as HTMLElement).getAttribute("name") === "session") { session = String(new FormData(form).get("session")); void load(); } else paint(); });
  form.addEventListener("submit", (e) => e.preventDefault()); await load();
}

// ============ ADD / RECORD FORMS ============
const addDept = ({ root }: RouteContext) => formPage(root, { title: "Add department", sub: "Departments hold staff, students, courses and accreditation.", back: R.depts, submit: "Add department",
  body: html`<div class="span-2">${field("name", "Department name", { required: true, attrs: 'minlength="2" maxlength="120"' })}</div><div class="span-2">${field("faculty", "Faculty", { required: true, attrs: 'minlength="2" maxlength="120"' })}</div>`,
  run: async (v) => { const d = await academic.createDepartment({ name: v.name!, faculty: v.faculty! }); resetDepartments(); toast("success", "Department added", d.name); location.hash = R.deptDetail(d.id); } });

async function addStaff({ root, query }: RouteContext): Promise<void> {
  const [depts, link] = await Promise.all([loadDepartments(), userLinkField()]);
  formPage(root, { title: "Add staff member", sub: "Staff are counted in the staff-to-student ratio.", back: R.staffList, submit: "Add staff member",
    body: html`<div class="span-2">${deptSelect(depts, "department_id", query.get("dept") ?? "")}</div><div class="span-2">${field("full_name", "Full name", { required: true, attrs: 'minlength="2" maxlength="120"' })}</div><div class="span-2">${field("staff_rank", "Rank", { optional: true, placeholder: "e.g. Senior Lecturer", attrs: 'maxlength="60"' })}</div>
      <div class="span-2">${link}</div>`,
    run: async (v, form) => { if (v.user_id && !isUuid(v.user_id)) { fieldError(form, "user_id", "Choose a user account."); return; }
      const s = await academic.createStaff({ department_id: Number(v.department_id), full_name: v.full_name!, staff_rank: v.staff_rank || undefined, user_id: v.user_id || undefined }); await loadStaff(true); toast("success", "Staff member added", s.full_name); location.hash = `${R.deptDetail(s.department_id)}?tab=staff`; } });
}
async function editStaff({ root, params }: RouteContext): Promise<void> {
  const s = await academic.staff(params.id!); const [depts, link] = await Promise.all([loadDepartments(), userLinkField(s.user_id ?? "")]);
  formPage(root, { title: `Edit ${s.full_name}`, sub: "Changes are recorded in the audit log.", back: R.staffList, backText: "Back to staff", submit: "Save changes",
    body: html`<div class="span-2">${deptSelect(depts, "department_id", s.department_id)}</div><div class="span-2">${field("full_name", "Full name", { required: true, value: s.full_name, attrs: 'minlength="2" maxlength="120"' })}</div><div class="span-2">${field("staff_rank", "Rank", { optional: true, value: s.staff_rank ?? "", placeholder: "e.g. Senior Lecturer", attrs: 'maxlength="60"' })}</div>
      <div class="span-2">${link}</div><label class="check span-2"><input type="checkbox" name="is_active" value="1" ${s.is_active ? "checked" : ""}><span>Active staff member <span class="t-xs muted">(inactive staff are left out of pickers; their evaluations are kept)</span></span></label>`,
    run: async (v, form) => { if (v.user_id && !isUuid(v.user_id)) { fieldError(form, "user_id", "Choose a user account."); return; }
      const u = await academic.updateStaff(s.id, { department_id: Number(v.department_id), full_name: v.full_name, staff_rank: v.staff_rank || null, user_id: v.user_id || null, is_active: (form.elements.namedItem("is_active") as HTMLInputElement).checked }); await loadStaff(true); toast("success", "Staff member updated", u.full_name); location.hash = R.staffList; } });
}
async function addCourse({ root, query }: RouteContext): Promise<void> {
  const depts = await loadDepartments();
  formPage(root, { title: "Add course", sub: "Record a course and its accreditation status.", back: R.courseList, submit: "Add course",
    body: html`<div class="span-2">${deptSelect(depts, "department_id", query.get("dept") ?? "")}</div>${field("code", "Course code", { required: true, mono: true, placeholder: "CMP 411", attrs: 'minlength="2" maxlength="20"' })}${select("level", "Level", LEVELS.map((l) => ({ value: l, text: String(l) })), { required: true, value: 100 })}
      <div class="span-2">${field("title", "Course title", { required: true, attrs: 'minlength="2" maxlength="150"' })}</div>${accRadios()}`,
    after: (f) => bindRadioCards(f, "accreditation_status"),
    run: async (v) => { try { const c = await academic.createCourse({ department_id: Number(v.department_id), code: v.code, title: v.title, level: Number(v.level), accreditation_status: v.accreditation_status }); await loadCourses(true); toast("success", "Course added", `${c.code} ${c.title}`); location.hash = `${R.deptDetail(c.department_id)}?tab=courses`; } catch (e) { courseConflict(root)(e); } } });
}
async function editCourse({ root, params }: RouteContext): Promise<void> {
  const [c, depts] = await Promise.all([academic.course(params.id!), loadDepartments()]);
  formPage(root, { title: `Edit ${c.code}`, sub: c.title, back: R.courseList, backText: "Back to courses", submit: "Save changes",
    body: html`<div class="span-2">${deptSelect(depts, "department_id", c.department_id)}</div>${field("code", "Course code", { required: true, mono: true, value: c.code, attrs: 'minlength="2" maxlength="20"' })}${select("level", "Level", LEVELS.map((l) => ({ value: l, text: String(l) })), { required: true, value: c.level })}
      <div class="span-2">${field("title", "Course title", { required: true, value: c.title, attrs: 'minlength="2" maxlength="150"' })}</div>${accRadios(c.accreditation_status)}`,
    after: (f) => bindRadioCards(f, "accreditation_status"),
    run: async (v) => { try { const u = await academic.updateCourse(c.id, { department_id: Number(v.department_id), code: v.code, title: v.title, level: Number(v.level), accreditation_status: v.accreditation_status }); await loadCourses(true); toast("success", "Course updated", `${u.code} ${u.title}`); location.hash = R.courseList; } catch (e) { courseConflict(root)(e); } } });
}
async function courseAccreditation({ root, params }: RouteContext): Promise<void> {
  const c = await academic.course(params.id!);
  formPage(root, { title: "Change accreditation status", sub: `${c.code} ${c.title}${c.accreditation_updated_at ? ` · last changed ${fmtDate(c.accreditation_updated_at)}` : ""}`, back: R.courseList, backText: "Back to courses", submit: "Save status",
    body: accRadios(c.accreditation_status), after: (f) => bindRadioCards(f, "accreditation_status"),
    run: async (v) => { const u = await academic.updateCourse(c.id, { accreditation_status: v.accreditation_status }); await loadCourses(true); toast("success", "Accreditation updated", `${u.code}: ${label(u.accreditation_status)}`); location.hash = R.courseList; } });
}
async function stats({ root, query }: RouteContext): Promise<void> {
  const depts = await loadDepartments();
  formPage(root, { title: "Update department statistics", sub: "Staff and student numbers drive the NUC staff-to-student ratio.", back: R.depts, submit: "Save statistics",
    body: html`<div class="span-2">${deptSelect(depts, "department_id", query.get("dept") ?? "")}</div><div class="span-2">${sessionSelect()}</div>${field("professor_count", "Professors", { required: true, type: "number", attrs: 'min="0" class="input num"' })}${field("staff_count", "Academic staff (total)", { required: true, type: "number", attrs: 'min="0"' })}<div class="span-2">${field("student_count", "Students enrolled", { required: true, type: "number", attrs: 'min="0"' })}</div>`,
    run: async (v, form) => { const p = Number(v.professor_count), s = Number(v.staff_count); if (p > s) { fieldError(form, "staff_count", "Total academic staff must include the professors."); return; }
      await academic.upsertStats(Number(v.department_id), { session: v.session, professor_count: p, staff_count: s, student_count: Number(v.student_count) }); toast("success", "Statistics saved", `Session ${v.session}`); location.hash = `${R.compliance}?dept=${v.department_id}&session=${encodeURIComponent(v.session!)}`; } });
}
const nuc = ({ root }: RouteContext) => formPage(root, { title: "Record NUC benchmark", sub: "The maximum students per academic staff member that NUC allows for a discipline.", back: R.depts, submit: "Save benchmark",
  body: html`<div class="span-2">${field("discipline", "Discipline", { required: true, help: "Must match the department name to be used in the compliance check.", attrs: 'minlength="2" maxlength="120"' })}</div>
    <div class="field"><label class="label" for="f-max">Maximum students per staff <span class="req" aria-hidden="true">*</span></label><div class="addon"><span class="pre">1 :</span><input class="input num" id="f-max" name="max_students_per_staff" type="number" min="1" step="0.01" required></div><div class="err" data-err="max_students_per_staff" hidden></div></div>
    ${field("effective_year", "Effective year", { required: true, type: "number", value: new Date().getFullYear(), attrs: 'min="2000" max="2200"' })}
    <fieldset class="field span-2" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Source <span class="req" aria-hidden="true">*</span></legend><div class="radio-cards">${([["MANUAL", "edit"], ["FILE", "file"], ["API", "database"]] as [BenchmarkSource, string][]).map(([s, i]) => html`<label class="radio-card ${s === "MANUAL" ? "is-on" : ""}"><input type="radio" name="source" value="${s}" ${s === "MANUAL" ? "checked" : ""}>${icon(i, 18)}<span>${label(s)}</span></label>`)}</div></fieldset>`,
  after: (f) => $$("input[name=source]", f).forEach((r) => r.addEventListener("change", () => $$(".radio-card", f).forEach((c) => c.classList.toggle("is-on", (c.querySelector("input") as HTMLInputElement).checked)))),
  run: async (v) => { await academic.createBenchmark({ discipline: v.discipline, max_students_per_staff: v.max_students_per_staff, source: v.source, effective_year: Number(v.effective_year) }); toast("success", "Benchmark saved", `${v.discipline}: 1 : ${v.max_students_per_staff}`); location.hash = R.depts; } });

async function qualityScore({ root, query }: RouteContext): Promise<void> {
  const depts = await loadDepartments();
  formPage(root, { title: "Record quality score", sub: "A 1–100 score for a department's facilities and quality.", back: R.depts, submit: "Save score",
    body: html`<div class="span-2">${deptSelect(depts, "department_id", query.get("dept") ?? "")}</div>${select("facility_type", "Facility type", FACILITIES.map((f) => ({ value: f, text: f })), { required: true, value: "General" })}${sessionSelect()}
      <div class="field span-2"><div class="row-between"><label class="label" for="qs-score">Quality score <span class="req" aria-hidden="true">*</span></label><output for="qs-score" id="qs-out" class="t-3xl strong num">50</output></div><input class="range" id="qs-score" name="score" type="range" min="1" max="100" value="50"><div class="row-between t-xs muted"><span>1</span><span id="qs-band" class="strong"></span><span>100</span></div></div>
      <div class="span-2">${textarea("remarks", "Notes", { optional: true, max: 2000 })}</div>`,
    after: (f) => { const r = f.elements.namedItem("score") as HTMLInputElement; const upd = () => { const v = Number(r.value); const b = band(v); $("#qs-out", f)!.textContent = String(v); $("#qs-out", f)!.style.color = b.c; $("#qs-band", f)!.textContent = b.t; $("#qs-band", f)!.style.color = b.c; }; r.addEventListener("input", upd); upd(); },
    run: async (v) => { await academic.createQualityScore({ department_id: Number(v.department_id), facility_type: v.facility_type, session: v.session, score: Number(v.score), remarks: v.remarks || undefined }); toast("success", "Quality score saved"); location.hash = `${R.compliance}?dept=${v.department_id}&session=${encodeURIComponent(v.session!)}`; } });
}

// ============ COMPLIANCE ============
async function compliancePage({ root, query }: RouteContext): Promise<void> {
  const depts = await loadDepartments();
  mount(root, html`${pageHead("Department compliance", "Staff-to-student ratio against the NUC benchmark, and the Departmental Quality Score.")}
    <section class="card filter-bar" style="border-radius:8px"><form id="f" style="display:contents">${deptSelect(depts, "department_id", query.get("dept") ?? depts[0]?.id ?? "")}${sessionSelect("session", query.get("session") ?? sessions()[0])}<button type="submit" class="btn btn-primary" style="align-self:flex-end">Show</button></form></section><div id="out"></div>`);
  const form = $<HTMLFormElement>("#f", root)!; const out = $("#out", root)!;
  const run = async () => { const f = new FormData(form); const id = Number(f.get("department_id")); const s = String(f.get("session")); if (!id) { out.innerHTML = ""; return; } out.innerHTML = skeletonRows(3).value;
    try { const c = await academic.compliance(id, s); const ok = c.staffing_compliant; const tone = !c.data_complete ? { bg: "#f1f5f9", bd: "#cbd5e1", fg: "#334155", ic: "info", v: "Not enough data", m: "Record the department's staff and student numbers, and an NUC benchmark, to see the verdict." } : ok ? { bg: "#ecfdf3", bd: "#abefc6", fg: "#15703c", ic: "check-circle", v: "Meets the NUC ratio", m: "The department is within the maximum students per academic staff member." } : { bg: "#fef3f2", bd: "#fecdca", fg: "#b42318", ic: "x-circle", v: "Below the NUC ratio", m: "There are more students per staff member than NUC allows." };
      const ratio = c.students_per_staff, max = c.nuc_max_students_per_staff; const top = Math.max(ratio ?? 0, max ?? 0, 1) * 1.25; const qs = c.departmental_quality_score;
      out.innerHTML = html`<div class="stack-lg"><section role="status" style="border-radius:12px;padding:20px 24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;background:${tone.bg};border:1px solid ${tone.bd};color:${tone.fg}"><span style="display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:${tone.fg};color:#fff">${icon(tone.ic, 24)}</span><div style="flex:1 1 280px"><div class="eyebrow" style="color:inherit">NUC staff-to-student ratio</div><h2 class="h2" style="color:inherit">${tone.v}</h2><p class="t-sm">${tone.m}</p></div></section>
        <div class="grid-3"><section class="card card-body stack"><h3 class="h3">Staff-to-student ratio</h3><div class="row" style="gap:24px;align-items:flex-end"><div><div class="t-xs muted">Actual</div><div class="t-3xl strong num">${ratio != null ? `1 : ${ratio.toFixed(0)}` : "-"}</div></div><div><div class="t-xs muted">NUC maximum</div><div class="t-3xl strong num muted">${max != null ? `1 : ${max}` : "-"}</div></div></div>
          ${ratio != null && max != null ? html`<div style="position:relative;height:16px;border-radius:9999px;background:#f1f5f9" role="img" aria-label="Actual ratio 1 to ${ratio.toFixed(0)} against maximum 1 to ${max}"><span style="position:absolute;left:0;top:0;bottom:0;width:${(ratio / top) * 100}%;border-radius:9999px;background:${ok ? "#166534" : "#dc2626"}"></span><span style="position:absolute;top:-6px;bottom:-6px;left:${(max / top) * 100}%;width:3px;background:#0f172a" title="NUC maximum"></span></div><div class="t-xs muted">Black line = NUC maximum (${max})</div>` : ""}</section>
          <section class="card card-body stack"><h3 class="h3">Inputs · ${c.session}</h3><dl class="dl" style="grid-template-columns:1fr 1fr;margin:0"><div><dt>Academic staff</dt><dd class="num">${c.staff_count ?? "-"}</dd></div><div><dt>Students</dt><dd class="num">${c.student_count ?? "-"}</dd></div></dl>${canAcademic() ? html`<a class="t-sm strong" href="${R.deptStats}?dept=${id}">Update statistics</a>` : ""}</section>
          <section class="card card-body stack"><h3 class="h3">Departmental Quality Score</h3>${qs != null ? html`<div class="row" style="gap:8px;align-items:baseline"><span class="t-3xl strong num">${Math.round(qs)}</span><span class="muted">/ 100</span></div><div class="progress" role="img" aria-label="Quality score ${Math.round(qs)} of 100"><span style="width:${qs}%;background:${band(qs).c}"></span></div><span class="t-sm strong" style="color:${band(qs).c}">${band(qs).t}</span>` : html`<p class="muted">No quality scores recorded yet.</p>`}${hasRole(...INSPECT) ? html`<a class="t-sm strong" href="${R.qualityScore}?dept=${id}">Record new score</a>` : ""}</section></div></div>`.value;
    } catch (e) { out.innerHTML = errorState(e).value; $("[data-retry]", out)?.addEventListener("click", () => void run()); } };
  form.addEventListener("submit", (e) => { e.preventDefault(); location.hash = `${R.compliance}?dept=${new FormData(form).get("department_id")}&session=${encodeURIComponent(String(new FormData(form).get("session")))}`; void run(); });
  await run();
}

// ============ COMPLIANCE DASHBOARD ============
async function complianceDashboard({ root }: RouteContext): Promise<void> {
  const session = sessions()[0]!; const [depts, d] = await Promise.all([loadDepartments(), dashboard.get()]);
  const comps = (await Promise.all(depts.map((x) => academic.compliance(x.id, session).catch(() => null)))).filter((c): c is DepartmentCompliance => !!c);
  const green = comps.filter((c) => c.staffing_compliant === true && (c.departmental_quality_score ?? 100) >= 70), red = comps.filter((c) => c.staffing_compliant === false || (c.departmental_quality_score ?? 100) < 50), amber = comps.filter((c) => !green.includes(c) && !red.includes(c));
  const acc = (k: string) => d.accreditation_status.find((x) => x.label === k)?.value ?? 0;
  const courses = await loadCourses(); const faculties = [...new Set(depts.map((x) => x.faculty))].sort();
  const byFaculty = faculties.map((f) => { const ids = new Set(depts.filter((x) => x.faculty === f).map((x) => x.id)); const cs = courses.filter((c) => ids.has(c.department_id)); return { f, n: (s: AccreditationStatus) => cs.filter((c) => c.accreditation_status === s).length, total: cs.length }; }).filter((x) => x.total);
  const col = (t: string, c: string, fg: string, ic: string, rule: string, list: DepartmentCompliance[]) => html`<div class="card" style="border-top:4px solid ${c}"><div class="card-body stack-sm"><div class="row-between"><span class="row" style="gap:8px;color:${fg}">${icon(ic, 20)}<span class="strong">${t}</span></span><span class="t-3xl strong num">${list.length}</span></div><span class="t-xs muted">${rule}</span>
    <ul style="list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px" class="t-sm">${list.slice(0, 6).map((x) => html`<li class="row-between"><a href="${R.compliance}?dept=${x.department_id}&session=${encodeURIComponent(session)}">${x.department_name}</a><span class="num muted">${x.departmental_quality_score != null ? Math.round(x.departmental_quality_score) : "-"}</span></li>`)}</ul></div></div>`;
  mount(root, html`${pageHead("Compliance dashboard", `Session ${session} · ${depts.length} departments`, html`<a class="btn btn-secondary" href="${R.reportNew}">${icon("report", 16)}Build report</a>`)}
    <section class="grid-3" aria-label="Departments by rating">${col("On track", "#166534", "#15703c", "check-circle", "Meets NUC ratio and quality ≥ 70", green)}${col("Watch", "#d97706", "#93370d", "alert", "Missing data, or quality 50–69", amber)}${col("Action needed", "#b42318", "#b42318", "x-circle", "Below NUC ratio or quality < 50", red)}</section>
    <div class="grid-2"><section class="card" aria-labelledby="acc-h"><div class="card-head"><h2 class="h3" id="acc-h">Accreditation</h2><div class="legend"><span><i style="background:#166534"></i>Full</span><span><i style="background:#d97706"></i>Interim</span><span><i style="background:#b42318"></i>Denied</span></div></div>
      <div class="card-body stack"><div style="display:flex;height:22px;border-radius:4px;overflow:hidden;background:#f1f5f9" role="img" aria-label="Full ${acc("FULL")}, Interim ${acc("INTERIM")}, Denied ${acc("DENIED")}">${[["FULL", "#166534"], ["INTERIM", "#d97706"], ["DENIED", "#b42318"]].map(([k, c]) => html`<span style="width:${(acc(k!) / Math.max(1, acc("FULL") + acc("INTERIM") + acc("DENIED"))) * 100}%;background:${c}"></span>`)}</div>
        <div class="row" style="gap:16px">${badge("acc", "FULL")}<span class="num strong">${acc("FULL")}</span>${badge("acc", "INTERIM")}<span class="num strong">${acc("INTERIM")}</span>${badge("acc", "DENIED")}<span class="num strong">${acc("DENIED")}</span></div>
        ${byFaculty.length ? html`<table class="table"><thead><tr><th>Faculty</th>${ACC.map((s) => html`<th class="num" style="text-align:right">${label(s)}</th>`)}</tr></thead><tbody>${byFaculty.map((x) => html`<tr><td>${x.f}</td>${ACC.map((s) => html`<td class="num" style="text-align:right">${x.n(s)}</td>`)}</tr>`)}</tbody></table>` : ""}</div></section>
      <section class="card" aria-labelledby="qs-h"><div class="card-head"><h2 class="h3" id="qs-h">Departmental Quality Scores</h2><span class="t-xs muted">0–100 · target 70</span></div><div class="card-body">${d.quality_scores.length ? hbar(d.quality_scores.map((q) => ({ label: q.department_name, value: Math.round(q.score) }))) : emptyState("No scores yet", "Quality scores recorded by inspectors appear here.")}</div></section></div>`);
}

// ============ DETAIL / PENDING SCREENS ============
async function detailPage({ root, params, query }: RouteContext): Promise<void> {
  const depts = await loadDepartments(); const id = Number(params.id); const dept = depts.find((d) => d.id === id); if (!dept) throw new ApiError(404, "NOT_FOUND", "That department does not exist (or your role cannot list departments).");
  const session = sessions()[0]!; const c = await academic.compliance(id, session).catch(() => null);
  const [staffPage, coursePage] = await Promise.all([academic.staffList({ department_id: id, is_active: true, limit: 100 }), academic.courses({ department_id: id, limit: 100 })]);
  const staff = staffPage.items, courses = coursePage.items;
  let tab = query.get("tab") ?? "overview";
  const tabs = [["overview", "Overview"], ["staff", "Staff"], ["ratio", "Ratio and benchmark"], ["courses", "Courses and accreditation"], ["quality", "Quality scores"]];
  const panel = (): Safe => tab === "overview" ? html`<section class="card card-body stack-sm"><h2 class="h3">Courses by accreditation</h2><div class="row" style="gap:16px">${(["FULL", "INTERIM", "DENIED"] as AccreditationStatus[]).map((s) => html`${badge("acc", s)}<span class="num strong">${courses.filter((x) => x.accreditation_status === s).length}</span>`)}</div><p class="t-sm muted">${coursePage.total} course${coursePage.total === 1 ? "" : "s"} · ${staffPage.total} active staff</p></section>`
    : tab === "staff" ? html`<section class="card"><div class="card-head"><h2 class="h3">Staff (${staffPage.total})</h2>${canAcademic() ? html`<a class="btn btn-primary btn-sm" href="${R.staffNew}?dept=${id}">${icon("plus", 14)}Add staff</a>` : ""}</div>${staffTable(staff, depts, false)}</section>`
    : tab === "ratio" ? html`<section class="card card-body stack"><h2 class="h3">Ratio and benchmark</h2>${c?.data_complete ? html`<p>NUC maximum <strong>1 : ${c.nuc_max_students_per_staff}</strong>. Current ratio <strong>1 : ${c.students_per_staff?.toFixed(0)}</strong>: ${c.staffing_compliant ? "within the benchmark." : "above the benchmark."}</p>` : html`<p class="muted">Not enough data yet for ${session}.</p>`}<a class="btn btn-secondary" href="${R.compliance}?dept=${id}">Open compliance view</a></section>`
    : tab === "courses" ? html`<section class="card"><div class="card-head"><h2 class="h3">Courses and accreditation (${coursePage.total})</h2>${canAcademic() ? html`<a class="btn btn-primary btn-sm" href="${R.courseNew}?dept=${id}">${icon("plus", 14)}Add course</a>` : ""}</div>${courseTable(courses, depts, false)}</section>`
    : html`<section class="card card-body stack"><h2 class="h3">Quality scores</h2><div class="row" style="gap:8px;align-items:baseline"><span class="t-3xl strong num">${c?.departmental_quality_score != null ? Math.round(c.departmental_quality_score) : "-"}</span><span class="muted">/ 100 · ${session}</span></div>${hasRole(...INSPECT) ? html`<a class="btn btn-secondary" href="${R.qualityScore}?dept=${id}">Record new score</a>` : ""}${needsApiBanner("A history of recorded scores needs a backend endpoint.")}</section>`;
  const draw = () => { mount(root, html`${backLink(R.depts, "Back to departments")}<div class="page-head"><div class="stack-sm" style="gap:6px"><div class="row">${c?.staffing_compliant === true ? html`<span class="badge" data-s="pass">Meets NUC ratio</span>` : c?.staffing_compliant === false ? html`<span class="badge" data-s="fail">Below NUC ratio</span>` : html`<span class="badge no-glyph">No ratio data</span>`}</div><h1 class="h1">${dept.name}</h1><p class="muted">${dept.faculty}</p></div>
      <div class="row">${canAcademic() ? html`<a class="btn btn-secondary" href="${R.deptEdit(id)}">${icon("edit", 16)}Edit</a><a class="btn btn-secondary" href="${R.deptStats}?dept=${id}">Update statistics</a>` : ""}</div></div>
      <div class="tabs" role="tablist" aria-label="Department sections">${tabs.map(([k, t]) => html`<button type="button" class="tab" role="tab" data-tab="${k}" aria-selected="${k === tab}">${t}</button>`)}</div><div class="stack-lg" role="tabpanel">${panel()}</div>`);
    $$("[data-tab]", root).forEach((b) => b.addEventListener("click", () => { tab = (b as HTMLElement).dataset.tab!; draw(); }));
    bindRowActions(root, () => void detailPage({ root, params, query: new URLSearchParams({ tab }) } as RouteContext)); };
  draw();
}
const pending = (title: string, back: string, note: string) => ({ root }: RouteContext) => mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${backLink(back, "Back")}${pageHead(title)}${needsApiBanner(note)}</div>`);
function staffTable(rows: Staff[], depts: Department[], showDept = true): Safe {
  return dataTable<Staff>([{ header: "Name", lead: true, cell: (s) => html`<a href="${R.evalHistory}?staff=${s.id}" class="strong">${s.full_name}</a>` }, { header: "Rank", cell: (s) => s.staff_rank ?? "-" },
    ...(showDept ? [{ header: "Department", cell: (s: Staff) => deptName(s.department_id, depts) }] : []), { header: "Status", cell: (s) => s.is_active ? html`<span class="badge" data-s="acct-ACTIVE">Active</span>` : html`<span class="badge" data-s="acct-DISABLED">Inactive</span>` },
    { header: "Actions", right: true, cls: "td-actions", cell: (s) => canAcademic() ? html`<a class="btn btn-ghost btn-sm" href="${R.staffEdit(s.id)}">${icon("edit", 14)}Edit</a>${s.is_active ? html`<button type="button" class="btn btn-ghost btn-sm" data-deactivate="${s.id}" data-name="${s.full_name}">Deactivate</button>` : ""}` : html`<a class="btn btn-ghost btn-sm" href="${R.evalHistory}?staff=${s.id}">Evaluations</a>` }],
    rows, emptyState("No staff found", canAcademic() ? "Add staff to count them in the staff-to-student ratio." : "Staff added by the academic office appear here.", canAcademic() ? { href: R.staffNew, text: "Add staff" } : undefined));
}
function courseTable(rows: Course[], depts: Department[], showDept = true): Safe {
  return dataTable<Course>([{ header: "Code", lead: true, cls: "mono", cell: (x) => x.code }, { header: "Course", cell: (x) => x.title }, ...(showDept ? [{ header: "Department", cell: (x: Course) => deptName(x.department_id, depts) }] : []), { header: "Level", cls: "num", cell: (x) => x.level },
    { header: "Accreditation", cell: (x) => badge("acc", x.accreditation_status) },
    ...(canAcademic() ? [{ header: "Actions", right: true, cls: "td-actions", cell: (x: Course) => html`<a class="btn btn-ghost btn-sm" href="${R.courseAccreditation(x.id)}">Accreditation</a><a class="btn btn-ghost btn-sm" href="${R.courseEdit(x.id)}">${icon("edit", 14)}Edit</a><button type="button" class="btn btn-ghost btn-sm" style="color:#b42318" data-delete-course="${x.id}" data-name="${x.code}">Delete</button>` }] : [])],
    rows, emptyState("No courses found", canAcademic() ? "Add courses to record their accreditation." : "Courses added by the academic office appear here.", canAcademic() ? { href: R.courseNew, text: "Add course" } : undefined));
}
/** Deactivate-staff and delete-course buttons rendered by the tables above. */
function bindRowActions(root: HTMLElement, refresh: () => void): void {
  $$<HTMLButtonElement>("[data-deactivate]", root).forEach((b) => b.addEventListener("click", async () => {
    if (!(await confirmDialog({ title: `Deactivate ${b.dataset.name}?`, text: "They are left out of staff pickers and counts. Their evaluations are kept, and you can reactivate them from Edit.", confirm: "Deactivate", danger: true, icon: "alert" }))) return;
    try { await academic.deactivateStaff(b.dataset.deactivate!); await loadStaff(true); toast("success", "Staff member deactivated", b.dataset.name); refresh(); } catch (e) { toast("error", "Could not deactivate", e instanceof ApiError ? e.message : ""); }
  }));
  $$<HTMLButtonElement>("[data-delete-course]", root).forEach((b) => b.addEventListener("click", async () => {
    if (!(await confirmDialog({ title: `Delete ${b.dataset.name}?`, text: "The course is removed permanently. Courses used by hall allocations cannot be deleted.", confirm: "Delete course", danger: true, icon: "trash" }))) return;
    try { await academic.deleteCourse(b.dataset.deleteCourse!); await loadCourses(true); toast("success", "Course deleted", b.dataset.name); refresh(); } catch (e) { toast("error", "Could not delete the course", e instanceof ApiError ? e.message : ""); }
  }));
}
/** Shared shell for the paginated staff and course lists: a filter form plus server-side paging. */
function serverList<T>(root: HTMLElement, opts: { fetch: (f: FormData, offset: number, limit: number) => Promise<{ items: T[]; total: number }>; table: (rows: T[]) => Safe }): Promise<void> {
  const form = $<HTMLFormElement>("#f", root)!; const el = $("#rows", root)!; let offset = 0; const limit = 20; let timer = 0;
  const paint = async () => { let page; try { page = await opts.fetch(new FormData(form), offset, limit); } catch (e) { el.innerHTML = errorState(e).value; $("[data-retry]", el)?.addEventListener("click", () => void paint()); return; }
    el.innerHTML = html`${opts.table(page.items)}${pagination(page.total, offset, limit)}`.value; onPage(el, (o) => { offset = Math.max(0, o); void paint(); }); bindRowActions(el, () => void paint()); };
  form.addEventListener("input", (e) => { offset = 0; clearTimeout(timer); timer = window.setTimeout(() => void paint(), (e.target as HTMLElement).tagName === "INPUT" ? 300 : 0); });
  form.addEventListener("submit", (e) => e.preventDefault()); return paint();
}
const deptFilter = (depts: Department[]) => depts.length ? html`<label class="field"><span class="label">Department</span><select class="select" name="dept"><option value="">All departments</option>${depts.map((d) => html`<option value="${d.id}">${d.name}</option>`)}</select></label>` : "";
const searchBox = (ph: string) => html`<label class="field grow"><span class="label">Search</span><span class="input-wrap"><span class="lead">${icon("search", 18)}</span><input class="input" type="search" name="q" placeholder="${ph}"></span></label>`;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

async function staffList({ root }: RouteContext): Promise<void> {
  const depts = await loadDepartments();
  mount(root, html`${pageHead("Staff", "Academic staff counted in each department's staff-to-student ratio.", canAcademic() ? html`<a class="btn btn-primary" href="${R.staffNew}">${icon("plus", 16)}Add staff</a>` : "")}
    <section class="card"><form class="filter-bar" id="f">${searchBox("Staff name")}${deptFilter(depts)}<label class="field"><span class="label">Status</span><select class="select" name="active"><option value="true">Active</option><option value="false">Inactive</option><option value="">All</option></select></label></form><div id="rows">${skeletonRows()}</div></section>`);
  await serverList<Staff>(root, { table: (rows) => staffTable(rows, depts),
    fetch: (f, offset, limit) => academic.staffList({ search: str(f, "q").trim() || undefined, department_id: str(f, "dept") ? Number(str(f, "dept")) : undefined, is_active: str(f, "active") ? str(f, "active") === "true" : undefined, offset, limit }) });
}
async function courseList({ root }: RouteContext): Promise<void> {
  const depts = await loadDepartments();
  mount(root, html`${pageHead("Courses", "Courses and their accreditation status.", canAcademic() ? html`<a class="btn btn-primary" href="${R.courseNew}">${icon("plus", 16)}Add course</a>` : "")}
    <section class="card"><form class="filter-bar" id="f">${searchBox("Course code or title")}${deptFilter(depts)}
      <label class="field"><span class="label">Level</span><select class="select" name="level"><option value="">All levels</option>${LEVELS.map((l) => html`<option>${l}</option>`)}</select></label>
      <label class="field"><span class="label">Accreditation</span><select class="select" name="acc"><option value="">All</option>${ACC.map((s) => html`<option value="${s}">${label(s)}</option>`)}</select></label></form><div id="rows">${skeletonRows()}</div></section>`);
  await serverList<Course>(root, { table: (rows) => courseTable(rows, depts),
    fetch: (f, offset, limit) => academic.courses({ search: str(f, "q").trim() || undefined, department_id: str(f, "dept") ? Number(str(f, "dept")) : undefined, level: str(f, "level") ? Number(str(f, "level")) : undefined, accreditation_status: str(f, "acc") || undefined, offset, limit }) });
}

export const departmentRoutes: Route[] = [
  { path: "/departments", title: "Departments and accreditation", roles: [...VIEW], render: listPage },
  { path: "/departments/new", title: "Add department", roles: [...ACADEMIC], render: addDept },
  { path: "/departments/staff", title: "Staff", roles: [...VIEW], render: staffList },
  { path: "/departments/staff/new", title: "Add staff member", roles: [...ACADEMIC], render: addStaff },
  { path: "/departments/staff/:id/edit", title: "Edit staff member", roles: [...ACADEMIC], render: editStaff },
  { path: "/departments/courses", title: "Courses", roles: [...VIEW], render: courseList },
  { path: "/departments/courses/new", title: "Add course", roles: [...ACADEMIC], render: addCourse },
  { path: "/departments/courses/:id/accreditation", title: "Change accreditation", roles: [...ACADEMIC], render: courseAccreditation },
  { path: "/departments/courses/:id/edit", title: "Edit course", roles: [...ACADEMIC], render: editCourse },
  { path: "/departments/stats", title: "Update statistics", roles: [...ACADEMIC], render: stats },
  { path: "/departments/benchmark", title: "NUC benchmark", roles: [...ACADEMIC], render: nuc },
  { path: "/departments/quality-score", title: "Record quality score", roles: [...INSPECT], render: qualityScore },
  { path: "/departments/compliance", title: "Department compliance", roles: [...VIEW], render: compliancePage },
  { path: "/departments/compliance-dashboard", title: "Compliance dashboard", roles: [...VIEW], render: complianceDashboard },
  { path: "/departments/:id", title: "Department detail", roles: [...VIEW], render: detailPage },
  { path: "/departments/:id/edit", title: "Edit department", roles: [...ACADEMIC], render: pending("Edit or delete department", R.depts, "Editing and deleting departments needs backend endpoints. Staff and courses can be edited from their own lists.") },
];
