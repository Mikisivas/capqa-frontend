import "./styles/main.css";
import { forbiddenPage, match, notFoundPage, register, safeRender } from "./router";
import { canSee, refreshUnread, renderShell, updateChrome } from "./shell";
import { isLoggedIn, onSessionEvent, restoreSession } from "./session";
import { loading, toast } from "./ui/components";
import { authRoutes } from "./pages/auth";
import { dashboardRoutes } from "./pages/dashboard";
import { dispatchRoutes } from "./pages/dispatch";
import { hallRoutes } from "./pages/halls";
import { auditRoutes } from "./pages/audits";
import { evaluationRoutes } from "./pages/evaluations";
import { departmentRoutes } from "./pages/departments";
import { reportRoutes } from "./pages/reports";
import { paymentRoutes } from "./pages/payments";
import { notificationRoutes } from "./pages/notifications";
import { adminRoutes } from "./pages/admin";

register(...authRoutes, ...dashboardRoutes, ...dispatchRoutes, ...hallRoutes, ...auditRoutes, ...evaluationRoutes,
  ...departmentRoutes, ...reportRoutes, ...paymentRoutes, ...notificationRoutes, ...adminRoutes);

const app = document.getElementById("app")!;
let shellMounted = false;
let main: HTMLElement | null = null;
let navToken = 0;

async function navigate(): Promise<void> {
  const token = ++navToken;
  const found = match(location.hash || "#/");
  const loggedIn = isLoggedIn();
  if (found && !found.route.public && !loggedIn) { location.hash = "#/login"; return; }
  if (found?.route.public && loggedIn && ["/login", "/register"].includes(found.route.path)) { location.hash = "#/"; return; }

  const bare = !loggedIn || !!found?.route.bare;
  if (bare) { shellMounted = false; main = app; app.className = "capqa"; }
  else if (!shellMounted) { main = renderShell(app); shellMounted = true; }
  const root = main!;
  if (!found) { if (!bare) updateChrome(location.hash, "Page not found"); root.innerHTML = notFoundPage().value; return; }
  if (!bare) updateChrome(location.hash, found.route.title);
  if (!bare && !canSee(found.route.roles)) { root.innerHTML = forbiddenPage(found.route.title).value; return; }
  root.innerHTML = `<div class="card">${loading().value}</div>`;
  await safeRender({ root, params: found.params, query: found.query }, found.route);
  if (token !== navToken) return;
  if (!bare) root.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

const LIVE_TITLES: Record<string, string> = {
  NOTIFICATION_CREATED: "New notification", APPROVAL_UPDATED: "Approval update", ASSIGNMENT_UPDATED: "New assignment", PAYMENT_UPDATED: "Payment update",
};
onSessionEvent((event, payload) => {
  const title = LIVE_TITLES[event];
  if (title) { toast("live", title, typeof payload.message === "string" ? payload.message : ""); void refreshUnread(); }
  window.dispatchEvent(new CustomEvent("capqa:live", { detail: { event, payload } }));
});

window.addEventListener("hashchange", () => void navigate());
void restoreSession().then(() => { shellMounted = false; return navigate(); });
