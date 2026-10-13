import type { RoleCode } from "./api/types";
import { R } from "./routes";
import { getUser } from "./session";
import { errorState, icon } from "./ui/components";
import { html, label } from "./ui/html";

export interface RouteContext { root: HTMLElement; params: Record<string, string>; query: URLSearchParams }
export interface Route {
  path: string; title: string; roles?: RoleCode[]; public?: boolean; bare?: boolean;
  render: (ctx: RouteContext) => Promise<void> | void;
}

const routes: Route[] = [];
export function register(...r: Route[]): void { routes.push(...r); }

export function match(hash: string): { route: Route; params: Record<string, string>; query: URLSearchParams } | null {
  const [pathPart, queryPart = ""] = hash.replace(/^#/, "").split("?");
  const path = (pathPart || "/").replace(/\/+$/, "") || "/";
  // Static paths win over parameterised ones (e.g. /dispatch/new vs /dispatch/:id).
  const ordered = [...routes].sort((a, b) => Number(a.path.includes(":")) - Number(b.path.includes(":")));
  for (const route of ordered) {
    const keys: string[] = [];
    const re = new RegExp("^" + route.path.replace(/:([a-z_]+)/gi, (_, k: string) => { keys.push(k); return "([^/]+)"; }) + "$");
    const m = re.exec(path);
    if (m) return { route, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)])), query: new URLSearchParams(queryPart) };
  }
  return null;
}

export async function safeRender(ctx: RouteContext, route: Route): Promise<void> {
  try { await route.render(ctx); }
  catch (err) {
    console.error(err);
    ctx.root.innerHTML = html`<div class="card">${errorState(err)}</div>`.value;
    ctx.root.querySelector("[data-retry]")?.addEventListener("click", () => { void safeRender(ctx, route); });
  }
}

export const notFoundPage = () => html`<div class="empty" style="margin:auto;max-width:520px"><span class="mono t-xs strong" style="color:#475569;letter-spacing:.1em">ERROR 404</span>
  <span class="e-icon" style="width:72px;height:72px">${icon("search", 32)}</span><h1 class="h1">We can't find that page</h1><p>The page may have moved, or the link is wrong.</p>
  <div class="row" style="justify-content:center"><a class="btn btn-primary" href="${R.dashboard}">${icon("dashboard", 16)}Go to dashboard</a></div></div>`;

export function forbiddenPage(what: string) {
  const u = getUser();
  return html`<div class="empty" style="margin:auto;max-width:520px"><span class="mono t-xs strong" style="color:#b42318;letter-spacing:.1em">ERROR 403</span>
    <span class="e-icon bad" style="width:72px;height:72px">${icon("lock", 32)}</span><h1 class="h1">You don't have access to this page</h1>
    <p>${what} is not available to your role.${u ? html` You are signed in as <strong>${u.full_name} (${label(u.role)})</strong>.` : ""} If you need access, ask the CAPQA administrator to change your role.</p>
    <div class="row" style="justify-content:center"><a class="btn btn-primary" href="${R.dashboard}">${icon("dashboard", 16)}Go to dashboard</a></div></div>`;
}
