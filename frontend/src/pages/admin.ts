import { ApiError } from "../api/client";
import { loadDepartments, resetDirectory, deptName, userName, loadDirectory } from "../api/directory";
import { auditLogs, users } from "../api/services";
import type { AccountStatus, AuditLog, RoleCode, User } from "../api/types";
import { R } from "../routes";
import type { Route, RouteContext } from "../router";
import { getUser } from "../session";
import { alert, backLink, badge, bindForm, dataTable, emptyState, errorState, field, formAlert, icon, needsApiBanner, onPage, pageHead, pagination, select, skeletonRows, toast } from "../ui/components";
import { $, $$, fmtDateTime, html, initials, label, mount } from "../ui/html";

const ADMIN = ["ADMIN"] as const;
const ROLE_LIST: RoleCode[] = ["ADMIN", "DIRECTOR", "ACADEMIC-OFFICER", "QUALITY-INSPECTOR", "VIEWER"];
const STATUS_TABS: { k: AccountStatus | ""; t: string }[] = [{ k: "PENDING", t: "Pending approval" }, { k: "ACTIVE", t: "Active" }, { k: "DISABLED", t: "Disabled" }, { k: "", t: "All" }];

// ============ USERS ============
async function usersPage({ root }: RouteContext): Promise<void> {
  let tab: AccountStatus | "" = "PENDING"; let offset = 0; const limit = 20; let q = ""; let role = "";
  const depts = await loadDepartments();
  mount(root, html`${pageHead("Users", "Approve new accounts and set each user's role and department.", html`<a class="btn btn-secondary" href="${R.rolePerms}">${icon("shield", 16)}Role permissions</a><a class="btn btn-primary" href="${R.userNew}">${icon("user-plus", 16)}Add user</a>`)}
    <div class="tabs" role="tablist" aria-label="Account status" id="tabs">${STATUS_TABS.map((t) => html`<button type="button" class="tab" role="tab" data-tab="${t.k}" aria-selected="${t.k === tab}">${t.t} <span class="tag" style="height:20px;margin-left:4px" data-count="${t.k}">-</span></button>`)}</div>
    <section class="card"><form class="filter-bar" id="f"><label class="field grow"><span class="label">Search <span class="opt">(this page)</span></span><span class="input-wrap"><span class="lead">${icon("search", 18)}</span><input class="input" type="search" name="q" placeholder="Name, username or email"></span></label>
      <label class="field"><span class="label">Role <span class="opt">(this page)</span></span><select class="select" name="role"><option value="">All roles</option>${ROLE_LIST.map((r) => html`<option value="${r}">${label(r)}</option>`)}</select></label></form><div id="rows"></div></section>`);
  const rows = $("#rows", root)!;
  void Promise.all(STATUS_TABS.map(async (t) => { try { const p = await users.list({ account_status: t.k || undefined, limit: 1 }); const el = $(`[data-count="${t.k}"]`, root); if (el) el.textContent = String(p.total); } catch { /* count is best effort */ } }));
  async function load(): Promise<void> {
    rows.innerHTML = skeletonRows().value;
    try {
      const page = await users.list({ account_status: tab || undefined, offset, limit });
      const list = page.items.filter((u) => (!q || `${u.full_name} ${u.username} ${u.email}`.toLowerCase().includes(q)) && (!role || u.role === role));
      rows.innerHTML = html`${dataTable<User>([{ header: "User", lead: true, cell: (u) => html`<span class="row" style="flex-wrap:nowrap;gap:10px"><span class="avatar avatar-sm">${initials(u.full_name)}</span><span><span class="strong">${u.full_name}</span><br><span class="t-xs muted">${u.email}</span></span></span>` },
        { header: "Username", cls: "mono", cell: (u) => u.username }, { header: "Role", cell: (u) => label(u.role) }, { header: "Department", cell: (u) => u.department_id ? deptName(u.department_id, depts) : "-" },
        { header: "Status", cell: (u) => badge("acct", u.account_status) }, { header: "Registered", cls: "num", cell: (u) => fmtDateTime(u.created_at) },
        { header: "Action", right: true, cls: "td-actions", cell: (u) => html`<a class="btn ${u.account_status === "PENDING" ? "btn-primary" : "btn-secondary"} btn-sm" href="${R.userReview(u.id)}">${u.account_status === "PENDING" ? "Review" : "Manage"}</a>` }], list,
        emptyState(tab === "PENDING" ? "No accounts waiting for approval" : "No users here", tab === "PENDING" ? "New registrations appear here for you to approve, reject or assign a role." : "Nothing matches."))}${pagination(page.total, page.offset, page.limit)}`.value;
      onPage(rows, (o) => { offset = Math.max(0, o); void load(); });
    } catch (e) { rows.innerHTML = errorState(e).value; $("[data-retry]", rows)?.addEventListener("click", () => void load()); }
  }
  $$("[data-tab]", root).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab as AccountStatus | ""; offset = 0; $$("[data-tab]", root).forEach((x) => x.setAttribute("aria-selected", String(x === b))); void load(); }));
  const f = $<HTMLFormElement>("#f", root)!; f.addEventListener("input", () => { const d = new FormData(f); q = String(d.get("q")).toLowerCase(); role = String(d.get("role")); void load(); }); f.addEventListener("submit", (e) => e.preventDefault());
  await load();
}

async function userReview({ root, params }: RouteContext): Promise<void> {
  const depts = await loadDepartments();
  // There is no "get one user" endpoint; find the user by paging the list.
  let user: User | undefined; for (let offset = 0; offset < 1000 && !user; offset += 100) { const p = await users.list({ offset, limit: 100 }); user = p.items.find((u) => u.id === params.id); if (offset + 100 >= p.total) break; }
  if (!user) throw new ApiError(404, "NOT_FOUND", "That user was not found.");
  const me = getUser()!; const u = user; let dec: "approve" | "reject" | "disable" = u.account_status === "ACTIVE" ? "disable" : "approve";
  const draw = () => {
    const isActive = u.account_status === "ACTIVE";
    mount(root, html`${backLink(R.users, "Back to users")}<div class="page-narrow stack-lg" style="width:100%"><form class="card" id="f" novalidate><div class="card-head"><h1 class="h3">Review account</h1></div><div class="card-body stack">${formAlert()}
      <div class="row" style="flex-wrap:nowrap;gap:12px"><span class="avatar avatar-lg">${initials(u.full_name)}</span><div><div class="strong t-lg">${u.full_name}</div><div class="t-sm muted">${u.username} · ${u.email}</div><div class="row" style="margin-top:6px">${badge("acct", u.account_status)}<span class="t-xs muted">Registered ${fmtDateTime(u.created_at)}</span></div></div></div>
      <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Decision <span class="req" aria-hidden="true">*</span></legend><div class="stack-sm">
        ${[["approve", "ACTIVE", isActive ? "Keep active and update role" : "Activate the account and assign a role"], ["reject", "DISABLED", "Reject the application (the account is disabled)"], ["disable", "DISABLED", "Stop this user from signing in"]].map(([k, s, t]) => k === "reject" && isActive ? "" : html`<label class="radio-card ${dec === k ? "is-on" : ""}"><input type="radio" name="dec" value="${k}" ${dec === k ? "checked" : ""}>${badge("acct", s!)}<span class="t-sm">${t}</span></label>`)}</div></fieldset>
      ${dec === "approve" ? html`${select("role", "Role", ROLE_LIST.map((r) => ({ value: r, text: label(r) })), { required: true, value: u.role })}${depts.length ? select("department_id", "Department", depts.map((d) => ({ value: d.id, text: d.name })), { optional: true, blank: "— None —", value: u.department_id ?? "" }) : field("department_id", "Department ID", { optional: true, type: "number", value: u.department_id ?? "" })}` : ""}
      ${dec === "reject" ? alert("info", "Reason not sent", "Sending a reason to the applicant needs backend support. The account is disabled.") : ""}${dec === "disable" ? alert("warning", "Disabled accounts can't sign in", "Their records and history are kept.", "ban") : ""}
      ${u.id === me.id ? alert("warning", "This is your own account", "You can't disable yourself here.") : ""}</div>
      <div class="card-foot"><a class="btn btn-secondary" href="${R.users}">Cancel</a><button type="submit" class="btn ${dec === "approve" ? "btn-primary" : "btn-danger"}" ${u.id === me.id && dec !== "approve" ? "disabled" : ""}>${dec === "approve" ? (isActive ? "Save changes" : "Approve account") : dec === "reject" ? "Reject application" : "Disable account"}</button></div></form></div>`);
    const form = $<HTMLFormElement>("#f", root)!;
    $$("input[name=dec]", form).forEach((r) => r.addEventListener("change", () => { dec = (r as HTMLInputElement).value as typeof dec; draw(); }));
    bindForm(form, async (v) => {
      const body: Record<string, unknown> = dec === "approve" ? { account_status: "ACTIVE", role: v.role, ...(v.department_id ? { department_id: Number(v.department_id) } : {}) } : { account_status: "DISABLED" };
      const upd = await users.update(u.id, body); resetDirectory(); toast("success", dec === "approve" ? "Account approved" : dec === "reject" ? "Application rejected" : "Account disabled", upd.full_name); location.hash = R.users;
    });
  };
  draw();
}

// ============ AUDIT LOG ============
const KNOWN_RESOURCES = ["DISPATCH", "DISPATCH_ATTACHMENT", "CLASS_ALLOCATION", "CLASSROOM", "EXAM_HALL_AUDIT", "QUALITY_SCORE", "STAFF_EVALUATION", "DEPARTMENT", "REPORT", "INVOICE", "PAYMENT", "USER"];
const ACTION_TONE: Record<string, [string, string]> = { CREATE: ["#ecfdf3", "#15703c"], UPDATE: ["#eff6ff", "#1d4ed8"], DELETE: ["#fef3f2", "#b42318"], APPROVED: ["#ecfdf3", "#15703c"], REJECTED: ["#fef3f2", "#b42318"], DOWNLOAD: ["#f1f5f9", "#334155"], EXPORT: ["#f1f5f9", "#334155"] };
const actionTag = (a: string) => { const [bg, fg] = ACTION_TONE[a] ?? ["#f1f5f9", "#334155"]; return html`<span class="tag" style="background:${bg};color:${fg};border-color:transparent;font-weight:600">${a}</span>`; };

async function auditLogPage({ root }: RouteContext): Promise<void> {
  const dir = await loadDirectory(); let offset = 0; const limit = 50;
  mount(root, html`${pageHead("Audit log", "Every create, update, delete, approval and download. Entries can't be edited.")}<section class="card"><form class="filter-bar" id="f">
    <label class="field"><span class="label">User</span><select class="select" name="user_id"><option value="">All users</option>${[...dir.values()].sort((a, b) => a.full_name.localeCompare(b.full_name)).map((u) => html`<option value="${u.id}">${u.full_name}</option>`)}</select></label>
    <label class="field"><span class="label">Resource type</span><select class="select" name="resource_type"><option value="">All resources</option>${KNOWN_RESOURCES.map((r) => html`<option value="${r}">${label(r)}</option>`)}</select></label><button type="submit" class="btn btn-secondary">Apply</button></form><div id="rows"></div></section>`);
  const f = $<HTMLFormElement>("#f", root)!; const rows = $("#rows", root)!;
  async function load(): Promise<void> {
    rows.innerHTML = skeletonRows().value; const d = new FormData(f);
    try {
      const page = await auditLogs.list({ user_id: String(d.get("user_id")) || undefined, resource_type: String(d.get("resource_type")) || undefined, offset, limit });
      rows.innerHTML = html`${dataTable<AuditLog>([{ header: "Date and time", lead: true, cls: "num mono t-sm", cell: (l) => fmtDateTime(l.created_at) }, { header: "Who", cell: (l) => l.user_id ? userName(l.user_id, dir) : "System" }, { header: "Action", cell: (l) => actionTag(l.action) },
        { header: "Resource type", cell: (l) => l.resource_type ? label(l.resource_type) : "-" }, { header: "Record ID", cls: "mono t-sm", cell: (l) => l.resource_id ? l.resource_id.slice(0, 13) : "-" }, { header: "Details", right: true, cls: "td-actions", cell: (l) => html`<a class="btn btn-ghost btn-sm" href="${R.auditLogDetail(l.id)}">Details</a>` }],
        page.items, emptyState("No activity for these filters", "Try another user or resource type."))}${pagination(page.total, page.offset, page.limit)}`.value;
      onPage(rows, (o) => { offset = Math.max(0, o); void load(); });
    } catch (e) { rows.innerHTML = errorState(e).value; $("[data-retry]", rows)?.addEventListener("click", () => void load()); }
  }
  f.addEventListener("submit", (e) => { e.preventDefault(); offset = 0; void load(); }); await load();
}

async function auditLogDetail({ root, params }: RouteContext): Promise<void> {
  const [dir, l] = await Promise.all([loadDirectory(), auditLogs.get(params.id!)]);
  const json = (o: Record<string, unknown> | null) => o ? JSON.stringify(o, null, 2) : "No data recorded";
  mount(root, html`${backLink(R.auditLog, "Back to audit log")}${pageHead("Audit log entry", `${l.action} · ${l.resource_type ? label(l.resource_type) : "General"} · ${fmtDateTime(l.created_at)}`)}
    <div class="grid-2"><section class="card"><div class="card-head"><h2 class="h3">Before</h2></div><pre class="card-body mono" style="margin:0;white-space:pre-wrap;word-break:break-word">${json(l.old_value)}</pre></section><section class="card"><div class="card-head"><h2 class="h3">After</h2></div><pre class="card-body mono" style="margin:0;white-space:pre-wrap;word-break:break-word">${json(l.new_value)}</pre></section></div>
    <section class="card"><dl class="dl card-body" style="margin:0"><div><dt>Who</dt><dd>${l.user_id ? userName(l.user_id, dir) : "System"}</dd></div><div><dt>Action</dt><dd>${actionTag(l.action)}</dd></div><div><dt>Record ID</dt><dd class="mono">${l.resource_id ?? "-"}</dd></div><div><dt>IP address</dt><dd class="mono">${l.ip_address ?? "-"}</dd></div><div><dt>Request ID</dt><dd class="mono">${l.request_id ?? "-"}</dd></div></dl></section>`);
}

// ============ NEEDS-API SCREENS ============
const pend = (title: string, note: string, back: string = R.users) => ({ root }: RouteContext) => mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${backLink(back, "Back")}${pageHead(title)}${needsApiBanner(note)}</div>`);
const rolePerms = ({ root }: RouteContext) => {
  const Y = "Full", Rd = "Read-only", N = "-"; const rows: [string, string, string, string, string, string][] = [["Dashboard", Y, Y, Y, Y, Rd], ["E-Dispatch", Y, "Approve / reject", "Record, edit, assign", N, Rd], ["Classrooms and Halls", Y, Y, "Allocate, edit", Rd, Rd], ["Exam Hall Audit", Y, Rd, N, "Create, finalise", N], ["Staff Evaluation", Y, Y, N, "Create", N], ["Departments", Y, Y, "Stats, courses", "Quality score", Rd], ["Reports", Y, "Build, finalise", "Build", "Build", "Download"], ["Payments", "Invoices", Rd, "Pay own", N, N], ["Notifications", Y, Y, Y, Y, Y], ["Administration", Y, N, N, N, N]];
  mount(root, html`<div class="stack-lg" style="width:100%">${backLink(R.users, "Back to users")}${pageHead("Role permissions", "What each role can see and do (from the design). The server enforces the real rules.")}${needsApiBanner("This matrix is documentation only. Editing permissions needs backend support. The server's own checks can differ in places.")}
    <section class="card">${dataTable<(typeof rows)[number]>([{ header: "Module", lead: true, cell: (r) => r[0] }, { header: "Admin", cell: (r) => r[1] }, { header: "Director", cell: (r) => r[2] }, { header: "Academic Officer", cell: (r) => r[3] }, { header: "Quality Inspector", cell: (r) => r[4] }, { header: "Viewer", cell: (r) => r[5] }], rows)}</section></div>`);
};

export const adminRoutes: Route[] = [
  { path: "/admin/users", title: "Users", roles: [...ADMIN], render: usersPage },
  { path: "/admin/users/new", title: "Add user", roles: [...ADMIN], render: pend("Create user directly", "Creating a user without self-registration needs a backend endpoint. For now ask the person to register, then approve them under Users.") },
  { path: "/admin/users/:id", title: "Review account", roles: [...ADMIN], render: userReview },
  { path: "/admin/audit-log", title: "Audit log", roles: [...ADMIN], render: auditLogPage },
  { path: "/admin/audit-log/:id", title: "Audit log entry", roles: [...ADMIN], render: auditLogDetail },
  { path: "/admin/roles", title: "Role permissions", roles: [...ADMIN], render: rolePerms },
  { path: "/admin/security", title: "Security and backup", roles: [...ADMIN], render: pend("Security settings and backups", "Password rules, session timeout and backup status are server settings with no API yet. The backend takes a database backup every 6 hours through a scheduled task (install_backup_task.bat), and the session timeout is set in its .env file.", R.dashboard) },
  { path: "/admin/backup", title: "Backup status", roles: [...ADMIN], render: pend("Backup status", "Backup status and a Backup now action need backend endpoints.", R.dashboard) },
];
