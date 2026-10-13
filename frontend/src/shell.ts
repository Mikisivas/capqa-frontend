import { notifications as notificationsApi } from "./api/services";
import type { Notification, RoleCode } from "./api/types";
import { R } from "./routes";
import { getUser, hasRole, signOut } from "./session";
import { icon } from "./ui/components";
import { $, html, initials, label, raw, timeAgo } from "./ui/html";

interface Item { key: string; label: string; icon: string; href: string; roles: RoleCode[] }
const A: RoleCode = "ADMIN", D: RoleCode = "DIRECTOR", O: RoleCode = "ACADEMIC-OFFICER", Q: RoleCode = "QUALITY-INSPECTOR", V: RoleCode = "VIEWER";
/** Sidebar groups and per-role visibility exactly as in the design's Sidebar.dc.html. */
export const GROUPS: { label: string; items: Item[] }[] = [
  { label: "Overview", items: [
    { key: "dashboard", label: "Dashboard", icon: "dashboard", href: R.dashboard, roles: [A, D, O, Q, V] },
    { key: "tasks", label: "My tasks", icon: "tasks", href: R.tasks, roles: [A, D, O, Q] }] },
  { label: "Operations", items: [
    { key: "dispatch", label: "E-Dispatch", icon: "mail", href: R.mail, roles: [A, D, O, V] },
    { key: "halls", label: "Classrooms and Halls", icon: "building", href: R.halls, roles: [A, D, O, Q, V] },
    { key: "audits", label: "Exam Hall Audit", icon: "clipboard", href: R.audits, roles: [A, D, Q] }] },
  { label: "Quality", items: [
    { key: "evaluations", label: "Staff Evaluation", icon: "star", href: R.evals, roles: [A, D, Q] },
    { key: "departments", label: "Departments and Accreditation", icon: "landmark", href: R.depts, roles: [A, D, O, Q, V] },
    { key: "reports", label: "Reports", icon: "report", href: R.reports, roles: [A, D, O, Q, V] }] },
  { label: "Finance and alerts", items: [
    { key: "payments", label: "Payments", icon: "card", href: R.payments, roles: [A, D, O] },
    { key: "notifications", label: "Notifications", icon: "bell", href: R.notifications, roles: [A, D, O, Q, V] }] },
  { label: "Administration", items: [
    { key: "users", label: "Users", icon: "users", href: R.users, roles: [A] },
    { key: "audit-log", label: "Audit log", icon: "log", href: R.auditLog, roles: [A] },
    { key: "security", label: "Security and backup", icon: "shield", href: R.security, roles: [A] }] },
];

/** Which top-level module a hash belongs to (for sidebar highlight + breadcrumb). */
export function moduleOf(hash: string): { key: string; label: string; href: string } | null {
  const path = hash.replace(/^#/, "").split("?")[0]!;
  const seg = path.split("/")[1] ?? "";
  const map: Record<string, string> = { "": "dashboard", tasks: "tasks", dispatch: "dispatch", halls: "halls", allocate: "halls", allocations: "halls", timetable: "halls",
    audits: "audits", evaluations: "evaluations", departments: "departments", reports: "reports", payments: "payments", notifications: "notifications", profile: "dashboard" };
  let key = map[seg];
  if (seg === "admin") key = path.split("/")[2] === "audit-log" ? "audit-log" : path.split("/")[2] === "users" ? "users" : "security";
  for (const g of GROUPS) for (const i of g.items) if (i.key === key) return { key: i.key, label: i.label, href: i.href };
  return null;
}
export const canSee = (roles?: RoleCode[]) => !roles || hasRole(...roles);

function sidebar(mode: "rail" | "drawer", activeKey: string, collapsed: boolean, unread: number): string {
  const role = label(getUser()!.role); const wide = mode === "drawer" || !collapsed;
  return html`<nav class="sb capqa sb-${mode} ${collapsed && mode === "rail" ? "is-collapsed" : ""}" aria-label="Main navigation"><div class="sb-inner">
    <div class="sb-brand"><div class="logo-slot">RFMOAUM</div>
      ${wide ? html`<div style="display:flex;flex-direction:column;min-width:0;flex:1 1 auto"><span class="brand-hub" style="color:#fcd34d">ALABATT-HUB</span><span class="sb-name">CAPQA</span><span class="sb-sub">Centre for Academic Planning and Quality Assurance</span></div>` : ""}
      ${mode === "drawer" ? html`<button type="button" class="tb-icon" data-drawer-close aria-label="Close menu" style="color:#d7f2df;margin-left:auto">${icon("x", 20)}</button>` : ""}</div>
    ${GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canSee(i.roles)) })).filter((g) => g.items.length).map((g) => html`<div style="display:flex;flex-direction:column;gap:2px">
      ${wide ? html`<div class="sb-group">${g.label}</div>` : html`<hr class="divider" style="background:rgba(255,255,255,.12);margin:8px 6px">`}
      ${g.items.map((i) => html`<a class="sb-item ${i.key === activeKey ? "is-active" : ""}" href="${i.href}" ${raw(i.key === activeKey ? 'aria-current="page"' : "")} aria-label="${i.label}" title="${i.label}">${icon(i.icon, 20)}${wide ? html`<span>${i.label}</span>` : ""}${i.key === "notifications" && unread > 0 && wide ? html`<span class="count" data-unread-count>${unread}</span>` : ""}</a>`)}</div>`)}
    <div class="sb-foot">${wide ? html`<div style="padding:4px 10px 10px;font-size:12px;color:#b0e4c0">Signed in as <strong style="color:#fff">${role}</strong></div>` : ""}
      ${mode === "rail" ? html`<button type="button" class="sb-collapse" data-collapse aria-expanded="${!collapsed}" aria-label="${collapsed ? "Expand sidebar" : "Collapse sidebar"}">${icon("panel", 20)}${wide ? html`<span>Collapse sidebar</span>` : ""}</button>` : ""}</div></div></nav>`.value;
}

let unreadCount = 0;
let collapsed = (() => { try { return localStorage.getItem("capqa.sb") === "1"; } catch { return false; } })();

export function renderShell(app: HTMLElement): HTMLElement {
  app.innerHTML = html`<div class="app capqa"><div class="sb-rail" id="sb-rail"></div><div class="app-main"><header class="topbar" id="topbar"></header><div id="main-wrap" style="flex:1 1 auto;display:flex;flex-direction:column"><main class="page" id="main" tabindex="-1"></main></div></div></div>`.value;
  paintSidebar("dashboard"); paintTopbar("Dashboard", null);
  void refreshUnread();
  return $("#main")!;
}

let activeKey = "dashboard";
function paintSidebar(key: string): void {
  activeKey = key; const rail = $("#sb-rail"); if (!rail) return;
  rail.innerHTML = sidebar("rail", key, collapsed, unreadCount);
  $("[data-collapse]", rail)?.addEventListener("click", () => { collapsed = !collapsed; try { localStorage.setItem("capqa.sb", collapsed ? "1" : "0"); } catch { /* ignore */ } paintSidebar(activeKey); });
}

function openDrawer(): void {
  const layer = document.createElement("div"); layer.className = "overlay"; layer.style.cssText = "position:fixed;inset:0;z-index:80;background:rgba(15,23,42,.5);display:flex";
  layer.innerHTML = sidebar("drawer", activeKey, false, unreadCount) + `<button type="button" aria-label="Close menu" style="flex:1 1 auto;border:0;background:transparent;cursor:pointer"></button>`;
  const close = () => { layer.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  layer.querySelectorAll("a.sb-item").forEach((a) => a.addEventListener("click", close));
  layer.querySelector("[data-drawer-close]")?.addEventListener("click", close);
  layer.querySelector(":scope > button")?.addEventListener("click", close);
  document.body.appendChild(layer);
}

let closeAll: () => void = () => {};
function paintTopbar(current: string, parent: { label: string; href: string } | null): void {
  const bar = $("#topbar"); if (!bar) return; const user = getUser()!;
  bar.innerHTML = html`
    <button type="button" class="tb-icon lt-lg" id="open-drawer" aria-label="Open menu">${icon("menu", 22)}</button>
    <div class="lt-md" style="align-items:center;gap:10px;min-width:0;flex:1 1 auto"><div class="logo-slot on-light" style="width:32px;height:32px;font-size:6px">RFMOAUM</div>
      <span style="display:flex;flex-direction:column;min-width:0;line-height:1.15"><span class="brand-hub" style="font-size:10px">ALABATT-HUB CAPQA</span><span style="font-weight:600;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${current}</span></span></div>
    <nav class="crumbs only-md" aria-label="Breadcrumb" style="flex:1 1 auto"><a href="${R.dashboard}">ALABATT-HUB CAPQA</a>
      ${parent && parent.label !== current ? html`${icon("chev-right", 14)}<a href="${parent.href}">${parent.label}</a>` : ""}${current !== "Dashboard" ? html`${icon("chev-right", 14)}<span aria-current="page">${current}</span>` : ""}</nav>
    <form class="only-md tb-search" id="tb-search" role="search"><label class="input-wrap" style="width:100%"><span class="sr-only">Search mail</span><span class="lead">${icon("search", 18)}</span>
      <input class="input" type="search" name="q" placeholder="Search mail by subject, sender or reference…" style="background:#f8fafc" /></label></form>
    <div style="position:relative"><button type="button" class="tb-icon" id="bell-btn" aria-haspopup="true" aria-expanded="false" aria-label="Notifications">${icon("bell", 22)}<span class="badge-count" id="bell-count" aria-hidden="true" ${raw(unreadCount ? "" : "hidden")}>${unreadCount > 99 ? "99+" : unreadCount}</span></button><div id="bell-panel"></div></div>
    <div style="position:relative"><button type="button" class="tb-user" id="user-btn" aria-haspopup="true" aria-expanded="false" aria-label="Account menu for ${user.full_name}"><span class="avatar">${initials(user.full_name)}</span>
      <span class="only-md" style="flex-direction:column;line-height:16px"><span class="t-sm strong" style="color:#0f172a;white-space:nowrap">${user.full_name}</span><span class="t-xs muted">${label(user.role)}</span></span><span class="only-md" style="color:#475569">${icon("chev-down", 16)}</span></button><div id="user-panel"></div></div>`.value;

  $("#open-drawer", bar)!.addEventListener("click", openDrawer);
  $("#tb-search", bar)?.addEventListener("submit", (e) => { e.preventDefault(); const q = (new FormData(e.target as HTMLFormElement).get("q") as string).trim(); location.hash = q ? `${R.mail}?q=${encodeURIComponent(q)}` : R.mail; });
  closeAll = () => { $("#bell-panel")!.innerHTML = ""; $("#user-panel")!.innerHTML = ""; $("#bell-btn")?.setAttribute("aria-expanded", "false"); $("#user-btn")?.setAttribute("aria-expanded", "false"); };
  $("#bell-btn", bar)!.addEventListener("click", (e) => { e.stopPropagation(); const open = $("#bell-panel")!.innerHTML !== ""; closeAll(); if (!open) { $("#bell-btn")!.setAttribute("aria-expanded", "true"); void showBell(); } });
  $("#user-btn", bar)!.addEventListener("click", (e) => { e.stopPropagation(); const open = $("#user-panel")!.innerHTML !== ""; closeAll(); if (!open) { $("#user-btn")!.setAttribute("aria-expanded", "true"); showUserMenu(); } });
  if (!docListeners) {
    docListeners = true;
    document.addEventListener("click", (e) => { if (!(e.target as HTMLElement).closest("#bell-panel,#user-panel")) closeAll(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });
  }
}
let docListeners = false;

function showUserMenu(): void {
  const user = getUser()!; const panel = $("#user-panel")!;
  panel.innerHTML = html`<div class="menu" role="menu"><div style="padding:8px 10px 10px;border-bottom:1px solid #e2e8f0;margin-bottom:6px"><div class="strong">${user.full_name}</div><div class="t-xs muted">${label(user.role)}${user.department_id ? ` · Department ${user.department_id}` : ""}</div></div>
    <a class="menu-item" role="menuitem" href="${R.profile}">${icon("user", 18)}My profile</a><a class="menu-item" role="menuitem" href="${R.editProfile}">${icon("key", 18)}Edit profile and password</a>
    <a class="menu-item" role="menuitem" href="${R.notifPrefs}">${icon("settings", 18)}Notification preferences</a><hr class="divider" style="margin:6px 0">
    <button type="button" class="menu-item" role="menuitem" id="logout" style="color:#b42318">${icon("logout", 18)}Log out</button></div>`.value;
  $("#logout", panel)!.addEventListener("click", () => void signOut());
  panel.querySelectorAll("a.menu-item").forEach((a) => a.addEventListener("click", () => { panel.innerHTML = ""; }));
}

const NOTE_STYLE: Record<string, { icon: string; fg: string; bg: string }> = {
  PENDING_APPROVAL: { icon: "clock", fg: "#93370d", bg: "#fffaeb" }, ASSIGNED_TASK: { icon: "tasks", fg: "#1d4ed8", bg: "#eff6ff" },
  DEADLINE: { icon: "alert", fg: "#b42318", bg: "#fef3f2" }, SYSTEM_UPDATE: { icon: "info", fg: "#334155", bg: "#f1f5f9" },
};
export const noteStyle = (t: string) => NOTE_STYLE[t] ?? NOTE_STYLE.SYSTEM_UPDATE!;
/** Backend links look like "/dispatch/<id>"; the app uses hash routes. */
export function noteHref(n: Notification): string {
  if (!n.link) return R.notifications;
  return n.link.startsWith("#/") ? n.link : n.link.startsWith("/") ? `#${n.link}` : R.notifications;
}

async function showBell(): Promise<void> {
  const panel = $("#bell-panel")!;
  panel.innerHTML = `<div class="menu" style="width:min(380px,calc(100vw - 24px));right:-52px;padding:14px" role="dialog" aria-label="Latest notifications">Loading…</div>`;
  try {
    const page = await notificationsApi.list({ limit: 5 });
    panel.innerHTML = html`<div class="menu" role="dialog" aria-label="Latest notifications" style="width:min(380px,calc(100vw - 24px));right:-52px;padding:0">
      <div class="row-between" style="padding:12px 14px;border-bottom:1px solid #e2e8f0"><span class="strong">Notifications</span><span class="t-xs muted">${unreadCount} unread</span></div>
      <div style="display:flex;flex-direction:column;padding:6px;gap:2px">${page.items.length ? page.items.map((n) => { const s = noteStyle(n.notification_type); return html`
        <a href="${noteHref(n)}" data-note="${n.id}" class="notif-item ${n.is_read ? "" : "unread"}"><span class="notif-ico" style="background:${s.bg};color:${s.fg}">${icon(s.icon, 18)}</span>
        <span style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto"><span class="t-xs strong" style="color:${s.fg}">${label(n.notification_type)}</span><span class="t-sm" style="color:#1e293b">${n.message}</span><span class="t-xs muted">${timeAgo(n.created_at)}${n.is_read ? "" : " · Unread"}</span></span>${n.is_read ? "" : html`<span class="dot-unread" aria-hidden="true"></span>`}</a>`; }) : html`<p class="muted" style="padding:16px">You are all caught up.</p>`}</div>
      <div style="padding:10px 14px;border-top:1px solid #e2e8f0;text-align:right"><a href="${R.notifications}" class="t-sm strong">View all</a></div></div>`.value;
    panel.querySelectorAll<HTMLAnchorElement>("a[data-note]").forEach((a) => a.addEventListener("click", () => { void notificationsApi.markRead(a.dataset.note!).then(refreshUnread).catch(() => {}); panel.innerHTML = ""; }));
  } catch { panel.innerHTML = `<div class="menu" style="padding:14px;width:280px;right:0">Could not load notifications.</div>`; }
}

export async function refreshUnread(): Promise<void> {
  try { unreadCount = (await notificationsApi.list({ unread_only: true, limit: 1 })).total; } catch { return; }
  const c = $("#bell-count"); if (c) { c.textContent = unreadCount > 99 ? "99+" : String(unreadCount); c.hidden = unreadCount === 0; }
  paintSidebar(activeKey);
}

/** Called on every navigation to update the highlighted module and breadcrumb. */
export function updateChrome(hash: string, pageTitle: string): void {
  const mod = moduleOf(hash); paintSidebar(mod?.key ?? "dashboard");
  const crumbTitle = mod && pageTitle !== mod.label ? pageTitle : mod?.label ?? pageTitle;
  paintTopbar(crumbTitle, mod && crumbTitle !== mod.label ? { label: mod.label, href: mod.href } : null);
  document.title = `${pageTitle} · ALABATT-HUB CAPQA`;
}
