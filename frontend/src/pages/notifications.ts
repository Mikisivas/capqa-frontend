import { ApiError } from "../api/client";
import { notifications } from "../api/services";
import type { Notification, NotificationType } from "../api/types";
import { R } from "../routes";
import type { Route, RouteContext } from "../router";
import { noteHref, noteStyle, refreshUnread } from "../shell";
import { badge, emptyState, errorState, icon, needsApiBanner, onPage, pageHead, pagination, skeletonRows, toast, backLink } from "../ui/components";
import { $, $$, html, label, mount, timeAgo } from "../ui/html";

const TABS: { k: NotificationType | ""; t: string }[] = [{ k: "", t: "All" }, { k: "PENDING_APPROVAL", t: "Approvals" }, { k: "ASSIGNED_TASK", t: "Tasks" }, { k: "DEADLINE", t: "Deadlines" }, { k: "SYSTEM_UPDATE", t: "System" }];

async function centre({ root }: RouteContext): Promise<void> {
  let tab: NotificationType | "" = ""; let unreadOnly = false; let offset = 0; const limit = 10;
  mount(root, html`<div style="max-width:960px;width:100%;display:flex;flex-direction:column;gap:20px"><div class="page-head"><div><h1 class="h1">Notifications</h1><p class="sub" id="sub"></p></div>
    <div class="row"><a class="btn btn-ghost" href="${R.notifPrefs}">${icon("settings", 16)}Preferences</a><button type="button" class="btn btn-secondary" id="all">${icon("check", 16)}Mark all read</button></div></div>
    <div class="tabs" role="tablist" id="tabs">${TABS.map((t) => html`<button type="button" class="tab" role="tab" data-tab="${t.k}" aria-selected="${t.k === tab}">${t.t}</button>`)}</div>
    <label class="check"><input type="checkbox" id="unread">Show unread only</label><section class="card" id="list">${skeletonRows(4)}</section></div>`);
  const list = $("#list", root)!;
  async function load(): Promise<void> {
    list.innerHTML = skeletonRows(4).value;
    try {
      const page = await notifications.list({ unread_only: unreadOnly, offset, limit: unreadOnly || !tab ? limit : 100 });
      const items = tab ? page.items.filter((n) => n.notification_type === tab) : page.items;
      const unread = (await notifications.list({ unread_only: true, limit: 1 })).total;
      $("#sub", root)!.textContent = unread ? `${unread} unread` : "You are all caught up"; ($("#all", root) as HTMLButtonElement).disabled = unread === 0;
      list.innerHTML = items.length ? html`<ul style="list-style:none;margin:0;padding:0">${items.map((n) => { const s = noteStyle(n.notification_type); return html`<li style="display:flex;gap:12px;align-items:flex-start;padding:16px 20px;border-bottom:1px solid #e2e8f0;background:${n.is_read ? "#fff" : "#effaf2"}">
        <span class="notif-ico" style="background:${s.bg};color:${s.fg}">${icon(s.icon, 18)}</span><div style="flex:1 1 auto;min-width:0" class="stack-sm"><div class="row" style="gap:8px"><span class="badge" data-s="ntf-${label(n.notification_type)}">${label(n.notification_type)}</span><span class="t-xs muted">${timeAgo(n.created_at)}</span>${n.is_read ? "" : html`<span class="t-xs strong" style="color:#166534;display:inline-flex;align-items:center;gap:4px"><span class="dot-unread" style="margin:0"></span>Unread</span>`}</div>
        <span class="${n.is_read ? "" : "strong"}">${n.message}</span>${n.link ? html`<a class="t-sm strong" href="${noteHref(n)}" data-read="${n.id}">Open</a>` : ""}</div>
        <div class="row" style="gap:2px;flex-wrap:nowrap">${n.is_read ? "" : html`<button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Mark as read" data-mark="${n.id}">${icon("check", 16)}</button>`}<button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Delete notification" disabled title="Deleting needs a backend endpoint">${icon("trash", 16)}</button></div></li>`; })}</ul>${pagination(page.total, page.offset, page.limit)}`.value
        : emptyState("You're all caught up", "Approval requests, assigned tasks, deadlines and system updates appear here.").value;
      $$("[data-mark]", list).forEach((b) => b.addEventListener("click", async () => { await notifications.markRead(b.dataset.mark!).catch(() => {}); void refreshUnread(); void load(); }));
      $$("[data-read]", list).forEach((a) => a.addEventListener("click", () => { void notifications.markRead(a.dataset.read!).then(refreshUnread).catch(() => {}); }));
      onPage(list, (o) => { offset = Math.max(0, o); void load(); });
    } catch (e) { list.innerHTML = errorState(e).value; $("[data-retry]", list)?.addEventListener("click", () => void load()); }
  }
  $$("[data-tab]", root).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab as NotificationType | ""; offset = 0; $$("[data-tab]", root).forEach((x) => x.setAttribute("aria-selected", String(x === b))); void load(); }));
  $("#unread", root)!.addEventListener("change", (e) => { unreadOnly = (e.target as HTMLInputElement).checked; offset = 0; void load(); });
  $("#all", root)!.addEventListener("click", async (e) => {
    const b = e.currentTarget as HTMLButtonElement; b.disabled = true;
    try { // No bulk endpoint exists yet, so mark each unread item in turn.
      const unread = await notifications.list({ unread_only: true, limit: 100 }); await Promise.all(unread.items.map((n: Notification) => notifications.markRead(n.id)));
      toast("success", "All notifications marked as read"); void refreshUnread(); void load();
    } catch (err) { toast("error", "Could not mark all as read", err instanceof ApiError ? err.message : ""); b.disabled = false; }
  });
  window.addEventListener("capqa:live", () => { if (location.hash.startsWith(R.notifications)) void load(); }, { once: true });
  await load();
}

function prefs({ root }: RouteContext): void {
  const KEY = "capqa.notif-prefs"; let saved: Record<string, boolean> = {}; try { saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>; } catch { /* ignore */ }
  const types: { k: NotificationType; d: string }[] = [{ k: "PENDING_APPROVAL", d: "When mail is waiting for your approval" }, { k: "ASSIGNED_TASK", d: "When mail or a task is assigned to you" }, { k: "DEADLINE", d: "Reminders before due dates" }, { k: "SYSTEM_UPDATE", d: "Maintenance and system updates" }];
  mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${backLink(R.notifications, "Back to notifications")}${pageHead("Notification preferences", "Choose which notifications you want to see.")}${needsApiBanner("Preferences are not stored on the server yet. These switches are saved in this browser only and do not change what the server sends.")}
    <section class="card"><ul style="list-style:none;margin:0;padding:0">${types.map((t) => html`<li class="row-between" style="padding:16px 20px;border-bottom:1px solid #e2e8f0"><div>${badge("ntf", t.k)}<div class="t-sm muted" style="margin-top:4px">${t.d}</div></div><label class="switch"><span class="sr-only">${label(t.k)}</span><input type="checkbox" data-k="${t.k}" ${saved[t.k] === false ? "" : "checked"}></label></li>`)}</ul></section></div>`);
  $$("input[data-k]", root).forEach((i) => i.addEventListener("change", () => { saved[(i as HTMLInputElement).dataset.k!] = (i as HTMLInputElement).checked; try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* ignore */ } }));
}

export const notificationRoutes: Route[] = [
  { path: "/notifications", title: "Notifications", render: centre },
  { path: "/notifications/preferences", title: "Notification preferences", render: prefs },
];
