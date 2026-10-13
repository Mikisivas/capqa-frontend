import { dashboard, dispatch, notifications } from "../api/services";
import type { Dashboard, Dispatch } from "../api/types";
import { R } from "../routes";
import type { Route } from "../router";
import { getUser, hasRole } from "../session";
import { badge, dataTable, donut, emptyState, hbar, icon, needsApiBanner, pageHead, statCard, trendChart, alert } from "../ui/components";
import { fmtDate, html, label, mount, Safe, timeAgo } from "../ui/html";
import { noteHref, noteStyle } from "../shell";

const MAIL_COLORS: Record<string, string> = { DRAFT: "#cbd5e1", PENDING: "#d97706", FORWARDED: "#2563eb", REVIEWED: "#93c5fd", APPROVED: "#166534", REJECTED: "#dc2626" };
const ORDER = ["APPROVED", "PENDING", "FORWARDED", "REVIEWED", "DRAFT", "REJECTED"];
const sum = (xs: { value: number }[]) => xs.reduce((s, x) => s + x.value, 0);
const count = (xs: { label: string; value: number }[], k: string) => xs.find((x) => x.label === k)?.value ?? 0;

function greeting(): string { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }

function segBar(parts: { label: string; value: number; color: string }[], aria: string): Safe {
  const total = sum(parts) || 1;
  return html`<div style="display:flex;height:28px;border-radius:6px;overflow:hidden;background:#f1f5f9" role="img" aria-label="${aria}">${parts.filter((p) => p.value > 0).map((p) => html`<span style="width:${(p.value / total) * 100}%;background:${p.color}"></span>`)}</div>`;
}

function mailCard(d: Dashboard): Safe {
  const items = ORDER.map((k) => ({ label: k, value: count(d.mail_status, k) })); const total = sum(items);
  return html`<section class="card" aria-labelledby="mbs-h"><div class="card-head"><h2 class="h3" id="mbs-h">Mail by status</h2><span class="t-xs muted">${total} item${total === 1 ? "" : "s"}</span></div>
    <div class="card-body" style="display:flex;flex-wrap:wrap;gap:24px;align-items:center">${donut(items.map((m) => ({ label: label(m.label), value: m.value, color: MAIL_COLORS[m.label]! })), String(total), "mail items")}
    <ul style="list-style:none;margin:0;padding:0;display:grid;gap:8px;flex:1 1 200px">${items.map((m) => html`<li class="row-between" style="flex-wrap:nowrap"><span class="row" style="flex-wrap:nowrap"><i style="width:12px;height:12px;border-radius:3px;background:${MAIL_COLORS[m.label]};display:inline-block"></i>${badge("mail", m.label)}</span>
      <span class="num strong">${m.value} <span class="muted" style="font-weight:400">· ${total ? Math.round((m.value / total) * 100) : 0}%</span></span></li>`)}</ul></div></section>`;
}

function facilityCard(d: Dashboard): Safe {
  const h = { S: count(d.classroom_status, "SUITABLE"), F: count(d.classroom_status, "FULL"), O: count(d.classroom_status, "OVERCROWDED") };
  const a = { F: count(d.accreditation_status, "FULL"), I: count(d.accreditation_status, "INTERIM"), D: count(d.accreditation_status, "DENIED") };
  const cell = (b: Safe, n: number) => html`<div class="stack-sm">${b}<span class="t-2xl strong num">${n}</span></div>`;
  const grid = `grid-template-columns:repeat(auto-fit,minmax(min(112px,100%),1fr));gap:12px`;
  return html`<section class="card" aria-labelledby="hs-h"><div class="card-head"><h2 class="h3" id="hs-h">Classroom and hall status</h2><a href="${R.halls}" class="t-sm strong">${h.S + h.F + h.O} halls</a></div>
    <div class="card-body stack">${segBar([{ label: "Suitable", value: h.S, color: "#166534" }, { label: "Full", value: h.F, color: "#d97706" }, { label: "Overcrowded", value: h.O, color: "#b42318" }], `Suitable ${h.S}, Full ${h.F}, Overcrowded ${h.O}`)}
      <div class="grid-3" style="${grid}">${cell(badge("hall", "SUITABLE"), h.S)}${cell(badge("hall", "FULL"), h.F)}${cell(badge("hall", "OVERCROWDED"), h.O)}</div><hr class="divider">
      <div class="row-between"><h3 class="h3">Accreditation · ${a.F + a.I + a.D} courses</h3><a href="${R.complianceDashboard}" class="t-sm strong">Compliance</a></div>
      ${segBar([{ label: "Full", value: a.F, color: "#166534" }, { label: "Interim", value: a.I, color: "#d97706" }, { label: "Denied", value: a.D, color: "#b42318" }], `Full ${a.F}, Interim ${a.I}, Denied ${a.D}`)}
      <div class="grid-3" style="${grid}">${cell(badge("acc", "FULL"), a.F)}${cell(badge("acc", "INTERIM"), a.I)}${cell(badge("acc", "DENIED"), a.D)}</div></div></section>`;
}

function approvalQueue(rows: Dispatch[]): Safe {
  return html`<section class="card" aria-labelledby="aq-h" style="border-color:#fde68a"><div class="card-head" style="background:#fffbeb;border-radius:8px 8px 0 0"><div class="row">${icon("stamp", 20)}<h2 class="h3" id="aq-h">Approval queue</h2><span class="badge tone-warning">${rows.length} waiting</span></div><a href="${R.mail}" class="t-sm strong">View all mail</a></div>
    ${dataTable<Dispatch>([
      { header: "Reference", lead: true, cls: "mono", cell: (r) => r.reference_number }, { header: "Subject", cell: (r) => r.subject }, { header: "Sender", cell: (r) => r.sender },
      { header: "Priority", cell: (r) => badge("pri", r.priority) }, { header: "Received", cell: (r) => fmtDate(r.date_received) },
      { header: "Action", right: true, cls: "td-actions", cell: (r) => html`<a class="btn btn-gold btn-sm" href="${R.mailApproval(r.id)}">Review</a>` }], rows,
      emptyState("Nothing waiting", "No mail is waiting for your approval."))}</section>`;
}

async function assignedPanel(): Promise<Safe> {
  const page = await notifications.list({ limit: 20 }).catch(() => null);
  const rows = (page?.items ?? []).filter((n) => n.notification_type === "ASSIGNED_TASK").slice(0, 5);
  return html`<section class="card" aria-labelledby="as-h"><div class="card-head"><div class="row">${icon("clipboard", 20)}<h2 class="h3" id="as-h">Assigned to you</h2><span class="badge tone-info">${rows.length} recent</span></div><a href="${R.tasks}" class="t-sm strong">All my tasks</a></div>
    ${rows.length ? html`<div class="card-body stack-sm">${rows.map((n) => html`<a class="notif-item" href="${noteHref(n)}"><span class="notif-ico" style="background:${noteStyle(n.notification_type).bg};color:${noteStyle(n.notification_type).fg}">${icon("tasks", 18)}</span><span style="display:flex;flex-direction:column;gap:2px"><span class="t-sm">${n.message}</span><span class="t-xs muted">${timeAgo(n.created_at)}</span></span></a>`)}</div>` : emptyState("No assignments yet", "Tasks assigned to you will appear here.")}</section>`;
}

export const dashboardRoutes: Route[] = [
  { path: "/", title: "Dashboard", async render({ root, query }) {
    const user = getUser()!;
    const session = query.get("session") ?? "";
    const isDirector = user.role === "DIRECTOR", isInspector = user.role === "QUALITY-INSPECTOR", isViewer = user.role === "VIEWER";
    const canMail = hasRole("ADMIN", "ACADEMIC-OFFICER");
    const [d, queue, assigned] = await Promise.all([
      dashboard.get(session || undefined),
      isDirector ? dispatch.list({ tracking_status: "PENDING", limit: 10 }).catch(() => null) : Promise.resolve(null),
      isInspector ? assignedPanel() : Promise.resolve(null),
    ]);
    const first = user.full_name.replace(/^(Mr|Mrs|Ms|Dr|Prof)\.?\s+/i, "").split(/\s+/)[0];
    const trend = d.evaluation_trends.map((t) => ({ label: `S${t.semester}`, group: t.session, value: Math.round(t.average_rating * 100) / 100 }));
    const y = new Date().getFullYear(); const cur = new Date().getMonth() >= 8 ? y : y - 1; const sessions = [0, 1, 2].map((i) => `${cur - i}/${cur - i + 1}`);
    const picker = html`<label class="row t-sm" style="gap:8px">Session <select class="select" style="width:160px" id="dash-session" aria-label="Session filter for quality scores and evaluation trend"><option value="">All sessions</option>${sessions.map((s) => html`<option ${s === session ? "selected" : ""}>${s}</option>`)}</select></label>`;
    mount(root, html`${pageHead(`${greeting()}, ${first}`, new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      html`${picker}${!isViewer && !isDirector && !isInspector ? html`${hasRole("ADMIN", "ACADEMIC-OFFICER") ? html`<a class="btn btn-secondary" href="${R.allocate}">${icon("building", 16)}Allocate hall</a>` : ""}${canMail ? html`<a class="btn btn-primary" href="${R.mailNew}">${icon("plus", 16)}Record mail</a>` : ""}` : ""}`)}
      ${isViewer ? alert("info", "Read-only access", "You can view dashboards and download finalised reports. Actions are hidden for the Viewer role.", "eye") : ""}
      ${isDirector && queue ? approvalQueue(queue.items) : ""}${assigned ?? ""}
      <section class="grid-stats" aria-label="Summary">
        ${statCard({ label: "Pending tasks", value: d.pending_tasks, foot: "Mail assigned to you and not yet done", icon: "tasks", href: R.tasks })}
        ${statCard({ label: "Unread notifications", value: d.unread_notifications, icon: "bell", href: R.notifications })}
        ${!isViewer ? html`<div class="card card-body stack-sm"><span class="s-label t-sm muted strong">Quick actions</span><div class="row">
          ${hasRole("ADMIN", "QUALITY-INSPECTOR") ? html`<a class="btn btn-secondary btn-sm" href="${R.auditNew}">Start audit</a>` : ""}${hasRole("ADMIN", "DIRECTOR", "ACADEMIC-OFFICER") ? html`<a class="btn btn-secondary btn-sm" href="${R.evalNew}">New evaluation</a><a class="btn btn-secondary btn-sm" href="${R.reportNew}">Build report</a>` : ""}
          ${hasRole("ADMIN", "QUALITY-INSPECTOR") ? html`<a class="btn btn-secondary btn-sm" href="${R.qualityScore}">Record quality score</a>` : ""}</div></div>` : ""}</section>
      <div class="grid-2">${mailCard(d)}${facilityCard(d)}
        <section class="card" aria-labelledby="dq-h"><div class="card-head"><h2 class="h3" id="dq-h">Department quality scores</h2><span class="t-xs muted">0–100</span></div>
          <div class="card-body stack-sm">${d.quality_scores.length ? html`${hbar(d.quality_scores.map((q) => ({ label: q.department_name, value: Math.round(q.score) })))}
            <div class="legend" style="margin-top:8px"><span><i style="background:#1a763f"></i>70+ meets target</span><span><i style="background:#d97706"></i>50–69 watch</span><span><i style="background:#dc2626"></i>below 50 action</span></div>` : emptyState("No scores yet", "Quality scores recorded by inspectors will appear here.")}</div></section>
        <section class="card" aria-labelledby="et-h"><div class="card-head"><h2 class="h3" id="et-h">Staff evaluation trend</h2>${hasRole("ADMIN", "DIRECTOR", "QUALITY-INSPECTOR") ? html`<a href="${R.evalTrends}" class="t-sm strong">Details</a>` : ""}</div>
          <div class="card-body">${trendChart(trend)}<p class="t-sm muted" style="margin-top:8px">Average rating (1–5) across Student, Peer and Management evaluations.</p></div></section></div>`);
    root.querySelector<HTMLSelectElement>("#dash-session")?.addEventListener("change", (e) => { const v = (e.target as HTMLSelectElement).value; location.hash = v ? `${R.dashboard}?session=${encodeURIComponent(v)}` : R.dashboard; });
  } },

  { path: "/tasks", title: "My tasks", roles: ["ADMIN", "DIRECTOR", "ACADEMIC-OFFICER", "QUALITY-INSPECTOR"], async render({ root }) {
    const me = getUser()!;
    // The API has no "assigned to me" filter yet, so fetch recent mail and filter in the browser.
    const page = await dispatch.list({ limit: 100 });
    const mine = page.items.filter((m) => m.assigned_to === me.id && (m.tracking_status === "DRAFT" || m.tracking_status === "PENDING" || m.tracking_status === "FORWARDED"));
    const PRI: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    mine.sort((a, b) => (PRI[a.priority]! - PRI[b.priority]!) || a.date_received.localeCompare(b.date_received));
    mount(root, html`${pageHead("My tasks", "Mail assigned to you, highest priority first.")}
      ${needsApiBanner("Only mail assignments exist today. Audit, evaluation and quality-score tasks, due dates and \"assigned by\" need a tasks endpoint.")}
      <div class="card">${dataTable<Dispatch>([
        { header: "Task", lead: true, cell: (r) => html`<span class="strong">${r.subject}</span><br><span class="t-xs muted mono">${r.reference_number}</span>` }, { header: "Module", cell: () => "E-Dispatch" },
        { header: "Status", cell: (r) => badge("mail", r.tracking_status) }, { header: "Received", cell: (r) => fmtDate(r.date_received) }, { header: "Priority", cell: (r) => badge("pri", r.priority) },
        { header: "Action", right: true, cls: "td-actions", cell: (r) => html`<a class="btn btn-secondary btn-sm" href="${R.mailDetail(r.id)}">Open</a>` }], mine,
        emptyState("You're all caught up", "No open tasks are assigned to you."))}
        <div class="pagination"><span>${mine.length} open task${mine.length === 1 ? "" : "s"}</span></div></div>`);
  } },
];
