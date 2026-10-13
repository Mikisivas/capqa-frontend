import { API_BASE, setUnauthorizedHandler, tokens } from "./api/client";
import { auth } from "./api/services";
import type { RoleCode, User } from "./api/types";
import { icon, modal, toast } from "./ui/components";
import { html } from "./ui/html";

type Listener = () => void;
let current: User | null = null;
const listeners = new Set<Listener>();
export const onSessionEvent = (fn: (event: string, payload: Record<string, unknown>) => void) => { eventHandlers.add(fn); };
const eventHandlers = new Set<(event: string, payload: Record<string, unknown>) => void>();

export const getUser = () => current;
export const isLoggedIn = () => current !== null;
export const hasRole = (...roles: RoleCode[]) => !!current && (roles.length === 0 || roles.includes(current.role));
export function subscribe(fn: Listener) { listeners.add(fn); return () => listeners.delete(fn); }

export async function restoreSession(): Promise<boolean> {
  if (!tokens.access && !tokens.refresh) return false;
  try { current = await auth.me(); startRealtime(); startIdleTimer(); return true; }
  catch { tokens.clear(); current = null; return false; }
}
export async function signIn(username: string, password: string): Promise<User> {
  await auth.login(username, password);
  current = await auth.me(); startRealtime(); startIdleTimer(); listeners.forEach((l) => l());
  return current;
}
export async function signOut(): Promise<void> {
  await auth.logout(); current = null; stopRealtime(); stopIdleTimer(); listeners.forEach((l) => l());
  location.hash = "#/login";
}
setUnauthorizedHandler(() => { current = null; stopRealtime(); stopIdleTimer(); if (!location.hash.startsWith("#/login")) { location.hash = "#/login"; toast("error", "Session expired", "Please sign in again."); } });

// ---- live updates (WebSocket) ----
let ws: WebSocket | null = null; let ping: number | undefined; let reconnect: number | undefined; let wantRealtime = false;
function startRealtime(): void {
  wantRealtime = true; if (ws || !tokens.access) return;
  const url = API_BASE.replace(/^http/, "ws") + "/ws";
  ws = new WebSocket(url);
  ws.onopen = () => { ws?.send(JSON.stringify({ type: "AUTH", token: tokens.access })); ping = window.setInterval(() => ws?.send(JSON.stringify({ type: "PING" })), 25000); };
  ws.onmessage = (m) => {
    try { const data = JSON.parse(m.data as string) as { event: string; payload?: Record<string, unknown> }; eventHandlers.forEach((h) => h(data.event, data.payload ?? {})); } catch { /* ignore */ }
  };
  ws.onclose = () => { clearInterval(ping); ws = null; if (wantRealtime && current) reconnect = window.setTimeout(startRealtime, 5000); };
}
function stopRealtime(): void { wantRealtime = false; clearTimeout(reconnect); clearInterval(ping); ws?.close(); ws = null; }

// ---- inactivity logout (design: warn 60 s before logging out) ----
const IDLE_MS = 15 * 60 * 1000; const WARN_MS = 60 * 1000;
let idleTimer: number | undefined; let warnOpen = false;
const reset = () => { if (warnOpen) return; clearTimeout(idleTimer); idleTimer = window.setTimeout(warn, IDLE_MS - WARN_MS); };
function warn(): void {
  warnOpen = true; let left = WARN_MS / 1000; let tick = 0;
  const closeModal = modal({ title: "", icon: undefined,
    body: html`<div style="align-items:center;text-align:center;display:flex;flex-direction:column;gap:12px"><span class="modal-icon warn">${icon("clock", 22)}</span>
      <h2 class="h2">You will be logged out in <span id="idle-left">${left}</span> seconds</h2><p class="muted">Stay signed in? You have been inactive. Unsaved changes will be lost if you are logged out.</p>
      <div class="progress" style="width:100%" role="progressbar" aria-label="Time remaining" aria-valuemin="0" aria-valuemax="60"><span id="idle-bar" style="width:100%;background:#d97706"></span></div></div>`,
    footer: html`<button type="button" class="btn btn-secondary" data-out>Log out now</button><button type="button" class="btn btn-primary" data-stay>Stay signed in</button>` },
  (root) => {
    root.querySelector(".modal")?.setAttribute("role", "alertdialog");
    root.querySelector(".modal-head")?.remove();
    const end = () => { clearInterval(tick); closeModal(); warnOpen = false; };
    tick = window.setInterval(() => { left -= 1; const el = root.querySelector("#idle-left"); if (el) el.textContent = String(left); const bar = root.querySelector<HTMLElement>("#idle-bar"); if (bar) bar.style.width = `${(left / 60) * 100}%`; if (left <= 0) { end(); void signOut(); } }, 1000);
    root.querySelector("[data-stay]")!.addEventListener("click", () => { end(); void auth.me().catch(() => {}); reset(); });
    root.querySelector("[data-out]")!.addEventListener("click", () => { end(); void signOut(); });
  });
}
const ACTIVITY = ["click", "keydown", "mousemove", "touchstart"];
function startIdleTimer(): void { ACTIVITY.forEach((e) => window.addEventListener(e, reset, { passive: true })); reset(); }
function stopIdleTimer(): void { clearTimeout(idleTimer); ACTIVITY.forEach((e) => window.removeEventListener(e, reset)); }
