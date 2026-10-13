import { ApiError } from "../api/client";
import { ICON_PATHS } from "./icons";
import { $, html, label, raw, Safe } from "./html";

export function icon(name: string, size = 18): Safe {
  const d = ICON_PATHS[name] ?? ICON_PATHS.info!;
  return raw(`<span style="display:inline-flex;flex:none;line-height:0;color:inherit"><svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"></path></svg></span>`);
}

/** Badge groups from the design: mail, pri, hall, pur, aud, acc, inv, pay, life, acct, src, ntf. */
export type BadgeGroup = "mail" | "pri" | "hall" | "pur" | "aud" | "acc" | "inv" | "pay" | "life" | "acct" | "src" | "ntf";
export function badge(group: BadgeGroup, value: string): Safe {
  const text = label(value);
  return html`<span class="badge" data-s="${group}-${text}">${text}</span>`;
}

// ---------- list states ----------
export function skeletonRows(n = 6): Safe {
  const w = [["60%", "80%"], ["75%", "55%"], ["50%", "70%"], ["68%", "85%"], ["58%", "62%"], ["72%", "50%"]];
  return html`<div role="status" aria-live="polite" aria-busy="true"><span class="sr-only">Loading…</span>${w.slice(0, n).map((r) => html`
    <div style="display:grid;grid-template-columns:2fr 3fr 2fr 1fr;gap:24px;align-items:center;padding:16px;border-bottom:1px solid #e2e8f0">
      <span class="sk" style="height:12px;width:${r[0]}"></span><span class="sk" style="height:12px;width:${r[1]}"></span><span class="sk" style="height:12px;width:70%"></span><span class="sk" style="height:22px;width:72px;border-radius:9999px"></span></div>`)}</div>`;
}
export function emptyState(title: string, text: string, cta?: { href: string; text: string }): Safe {
  return html`<div class="empty"><span class="e-icon">${icon("inbox", 26)}</span><h3 class="h3">${title}</h3><p>${text}</p>
    ${cta ? html`<a class="btn btn-primary" href="${cta.href}">${icon("plus", 16)}${cta.text}</a>` : ""}</div>`;
}
export function errorState(err: unknown, retry = true): Safe {
  const e = err instanceof ApiError ? err : null;
  const denied = e?.status === 403;
  const title = denied ? "You don't have access to this" : e?.status === 0 ? "We couldn't reach the server" : "We couldn't load this";
  const text = e?.message ?? "Something went wrong. Please try again.";
  return html`<div class="empty" role="alert"><span class="e-icon bad">${icon("alert-circle", 26)}</span><h3 class="h3">${title}</h3><p>${text}</p>
    ${retry && !denied ? html`<div class="row" style="justify-content:center"><button type="button" class="btn btn-secondary" data-retry>${icon("refresh", 16)}Try again</button></div>` : ""}</div>`;
}
export const loading = (): Safe => skeletonRows();

/** Needs-API banner shown above screens whose backend endpoint does not exist yet. */
export function needsApiBanner(what: string): Safe {
  return html`<div class="alert alert-warning" role="note"><span class="a-icon">${icon("info", 18)}</span><div><div class="a-title">Preview data · backend endpoint pending</div>${what}</div></div>`;
}

// ---------- layout ----------
export function pageHead(title: string, sub = "", actions: Safe | "" = ""): Safe {
  return html`<div class="page-head"><div><h1 class="h1">${title}</h1>${sub ? html`<p class="sub">${sub}</p>` : ""}</div>${actions ? html`<div class="row">${actions}</div>` : ""}</div>`;
}
export function backLink(href: string, text: string): Safe {
  return html`<a href="${href}" class="row t-sm strong" style="gap:6px;text-decoration:none">${icon("arrow-left", 16)}${text}</a>`;
}
export function statCard(opts: { label: string; value: string | number; foot?: string; icon: string; href?: string }): Safe {
  const inner = html`<span class="s-label"><span class="ico-box">${icon(opts.icon, 18)}</span>${opts.label}</span><span class="s-value">${opts.value}</span>${opts.foot ? html`<span class="s-foot">${opts.foot}</span>` : ""}`;
  return opts.href ? html`<a href="${opts.href}" class="card stat" style="text-decoration:none;color:inherit">${inner}</a>` : html`<div class="card stat">${inner}</div>`;
}
export function alert(kind: "info" | "success" | "warning" | "danger", title: string, text: Safe | string = "", ic = "info"): Safe {
  return html`<div class="alert alert-${kind}" role="${kind === "danger" ? "alert" : "note"}"><span class="a-icon">${icon(ic, 18)}</span><div><div class="a-title">${title}</div>${text}</div></div>`;
}

// ---------- tables ----------
export interface Col<T> { header: string; cell: (row: T) => unknown; lead?: boolean; cls?: string; right?: boolean }
export function dataTable<T>(cols: Col<T>[], rows: T[], empty?: Safe): Safe {
  if (!rows.length) return empty ?? emptyState("Nothing here yet", "Records will appear here.");
  return html`<div class="table-wrap"><table class="table table-stack"><thead><tr>${cols.map((c) => html`<th scope="col" class="${c.right ? "r" : ""}">${c.header}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${cols.map((c) => html`<td class="${c.lead ? "td-lead" : ""} ${c.cls ?? ""} ${c.right ? "r" : ""}" data-label="${c.header}">${c.cell(r) as Safe}</td>`)}</tr>`)}</tbody></table></div>`;
}
export function pagination(total: number, offset: number, limit: number): Safe {
  if (total === 0) return raw("");
  const pages = Math.max(1, Math.ceil(total / limit)); const page = Math.floor(offset / limit) + 1;
  const from = offset + 1, to = Math.min(total, offset + limit);
  const nums: number[] = []; for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) nums.push(p);
  return html`<nav class="pagination" aria-label="Pagination"><span>Showing ${from}–${to} of ${total}</span><span class="pager">
    <button type="button" data-page="${offset - limit}" ${raw(page === 1 ? "disabled" : "")} aria-label="Previous page">${icon("chev-left", 16)}</button>
    ${nums.map((p) => html`<button type="button" data-page="${(p - 1) * limit}" ${raw(p === page ? 'aria-current="page"' : "")}>${p}</button>`)}
    <button type="button" data-page="${offset + limit}" ${raw(page === pages ? "disabled" : "")} aria-label="Next page">${icon("chev-right", 16)}</button></span></nav>`;
}
export function onPage(root: ParentNode, cb: (offset: number) => void): void {
  root.querySelectorAll<HTMLButtonElement>("button[data-page]").forEach((b) => b.addEventListener("click", () => cb(Number(b.dataset.page))));
}

// ---------- forms ----------
interface FieldOpts { type?: string; required?: boolean; optional?: boolean; placeholder?: string; value?: string | number; help?: string; attrs?: string; mono?: boolean }
export function field(name: string, text: string, o: FieldOpts = {}): Safe {
  return html`<div class="field"><label class="label" for="f-${name}">${text}${o.required ? html`<span class="req" aria-hidden="true">*</span>` : ""}${o.optional ? html`<span class="opt">(optional)</span>` : ""}</label>
    <input class="input${o.mono ? " mono" : ""}" id="f-${name}" name="${name}" type="${o.type ?? "text"}" ${raw(o.required ? "required" : "")} placeholder="${o.placeholder ?? ""}" value="${o.value ?? ""}" ${raw(o.attrs ?? "")} />
    ${o.help ? html`<p class="help">${o.help}</p>` : ""}<div class="err" data-err="${name}" hidden></div></div>`;
}
export function textarea(name: string, text: string, o: { required?: boolean; optional?: boolean; max?: number; placeholder?: string; value?: string; help?: string } = {}): Safe {
  return html`<div class="field"><label class="label" for="f-${name}">${text}${o.required ? html`<span class="req" aria-hidden="true">*</span>` : ""}${o.optional ? html`<span class="opt">(optional)</span>` : ""}</label>
    <textarea class="textarea" id="f-${name}" name="${name}" ${raw(o.max ? `maxlength="${o.max}"` : "")} ${raw(o.required ? "required" : "")} placeholder="${o.placeholder ?? ""}">${o.value ?? ""}</textarea>
    ${o.max ? html`<div class="counter" data-counter="${name}" data-max="${o.max}">0 / ${o.max}</div>` : ""}${o.help ? html`<p class="help">${o.help}</p>` : ""}<div class="err" data-err="${name}" hidden></div></div>`;
}
export interface Opt { value: string | number; text: string }
export function select(name: string, text: string, options: Opt[], o: { required?: boolean; optional?: boolean; blank?: string; value?: string | number; help?: string } = {}): Safe {
  return html`<div class="field"><label class="label" for="f-${name}">${text}${o.required ? html`<span class="req" aria-hidden="true">*</span>` : ""}${o.optional ? html`<span class="opt">(optional)</span>` : ""}</label>
    <select class="select" id="f-${name}" name="${name}" ${raw(o.required ? "required" : "")}>${o.blank !== undefined ? html`<option value="">${o.blank}</option>` : ""}
    ${options.map((x) => html`<option value="${x.value}" ${raw(String(x.value) === String(o.value ?? "") ? "selected" : "")}>${x.text}</option>`)}</select>${o.help ? html`<p class="help">${o.help}</p>` : ""}<div class="err" data-err="${name}" hidden></div></div>`;
}
export function starRating(name: string, text: string, required = true): Safe {
  return html`<fieldset style="border:0;padding:0;margin:0"><legend class="label">${text}${required ? html`<span class="req" aria-hidden="true">*</span>` : ""}</legend>
    <div class="stars" role="radiogroup" aria-label="${text}">${[1, 2, 3, 4, 5].map((n) => html`<label class="star" title="${n} of 5"><input class="sr-only" type="radio" name="${name}" value="${n}" ${raw(required && n === 1 ? "required" : "")} />
    <span data-star="${n}" aria-hidden="true">${icon("star", 26)}</span><span class="sr-only">${n} of 5</span></label>`)}</div><div class="err" data-err="${name}" hidden></div></fieldset>`;
}
/** Makes the star radios light up up to the chosen value. */
export function bindStars(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".stars").forEach((group) => {
    const paint = () => { const v = Number((group.querySelector<HTMLInputElement>("input:checked")?.value) ?? 0); group.querySelectorAll<HTMLElement>(".star").forEach((s, i) => { s.classList.toggle("on", i < v); (s.querySelector("svg") as SVGElement | null)?.setAttribute("fill", i < v ? "currentColor" : "none"); }); };
    group.addEventListener("change", paint); paint();
  });
}
export function bindCounters(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-counter]").forEach((c) => {
    const ta = root.querySelector<HTMLTextAreaElement>(`textarea[name="${c.dataset.counter}"]`); if (!ta) return;
    const upd = () => { c.textContent = `${ta.value.length} / ${c.dataset.max}`; }; ta.addEventListener("input", upd); upd();
  });
}
export const formAlert = (): Safe => html`<div id="form-alert" class="alert alert-danger" role="alert" hidden><span class="a-icon">${icon("alert-circle", 18)}</span><div><div class="a-title">We couldn't save this</div><span id="form-alert-text"></span></div></div>`;
export function actionBar(submit: string, cancelHref?: string): Safe {
  return html`<div class="action-bar">${cancelHref ? html`<a class="btn btn-secondary" href="${cancelHref}">Cancel</a>` : ""}<button type="submit" class="btn btn-primary">${submit}</button></div>`;
}

export function showFormError(form: HTMLElement, err: unknown): void {
  const box = form.querySelector<HTMLElement>("#form-alert"); const text = form.querySelector<HTMLElement>("#form-alert-text");
  const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Something went wrong. Please try again.";
  if (box && text) { text.textContent = msg; box.hidden = false; box.scrollIntoView({ block: "nearest" }); } else toast("error", "Could not save", msg);
}
export function clearFormErrors(form: HTMLElement): void {
  const box = form.querySelector<HTMLElement>("#form-alert"); if (box) box.hidden = true;
  form.querySelectorAll<HTMLElement>("[data-err]").forEach((e) => { e.hidden = true; e.textContent = ""; });
  form.querySelectorAll(".is-invalid").forEach((e) => e.classList.remove("is-invalid"));
}
export function fieldError(form: HTMLElement, name: string, message: string): void {
  const e = form.querySelector<HTMLElement>(`[data-err="${name}"]`); const input = form.querySelector<HTMLElement>(`[name="${name}"]`);
  if (e) { e.innerHTML = icon("alert-circle", 14).value + " "; e.append(message); e.hidden = false; }
  input?.classList.add("is-invalid"); input?.setAttribute("aria-invalid", "true");
}
/** Wire a form. `submit` gets trimmed string values; it throws ApiError to show the inline alert. */
export function bindForm(form: HTMLFormElement, submit: (v: Record<string, string>, data: FormData) => Promise<void>): void {
  form.noValidate = true;
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); clearFormErrors(form);
    let firstBad: HTMLElement | null = null;
    form.querySelectorAll<HTMLInputElement>("input[required],select[required],textarea[required]").forEach((el) => {
      const radioMissing = el.type === "radio" && !form.querySelector(`input[name="${el.name}"]:checked`);
      if ((el.type !== "radio" && !el.value.trim()) || radioMissing) { fieldError(form, el.name, "This field is required."); firstBad ??= el; }
      else if (el.type !== "radio" && !el.checkValidity()) { fieldError(form, el.name, el.validationMessage || "Check this value."); firstBad ??= el; }
    });
    if (firstBad) { (firstBad as HTMLElement).focus(); return; }
    const btn = form.querySelector<HTMLButtonElement>("button[type=submit]");
    const original = btn?.innerHTML ?? ""; if (btn) { btn.disabled = true; btn.classList.add("is-loading"); btn.innerHTML = `<span class="spin"></span> Saving…`; }
    try {
      const data = new FormData(form); const v: Record<string, string> = {};
      data.forEach((val, k) => { if (typeof val === "string") v[k] = val.trim(); });
      await submit(v, data);
    } catch (err) { showFormError(form, err); }
    finally { if (btn?.isConnected) { btn.disabled = false; btn.classList.remove("is-loading"); btn.innerHTML = original; } }
  });
}

// ---------- toasts / modals / drawers ----------
export function toast(kind: "success" | "error" | "live", title: string, text = ""): void {
  let host = document.querySelector<HTMLElement>(".toasts");
  if (!host) { host = document.createElement("div"); host.className = "toasts capqa"; host.setAttribute("aria-live", "polite"); document.body.appendChild(host); }
  const ic = kind === "success" ? "check" : kind === "error" ? "alert-circle" : "bell";
  const el = document.createElement("div"); el.className = `toast toast-${kind}`; el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.innerHTML = html`<span class="t-icon">${icon(ic, 16)}</span><div class="t-body"><div class="t-title">${title}</div>${text ? html`<div class="t-text">${text}</div>` : ""}</div>
    <button type="button" class="tb-icon" style="width:28px;height:28px" aria-label="Dismiss">${icon("x", 14)}</button>`.value;
  el.querySelector("button")!.addEventListener("click", () => el.remove());
  host.appendChild(el); setTimeout(() => el.remove(), 6000);
}

export function modal(opts: { title: string; body: Safe; footer?: Safe; icon?: { name: string; tone: "danger" | "warn" | "brand" }; large?: boolean }, onMount?: (root: HTMLElement, close: () => void) => void): () => void {
  const prev = document.activeElement as HTMLElement | null;
  const layer = document.createElement("div"); layer.className = "modal-layer capqa";
  layer.innerHTML = html`<div class="modal ${opts.large ? "modal-lg" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-head"><div class="row" style="flex-wrap:nowrap;gap:12px">${opts.icon ? html`<span class="modal-icon ${opts.icon.tone}">${icon(opts.icon.name, 22)}</span>` : ""}<h2 class="h2" id="modal-title">${opts.title}</h2></div>
      <button type="button" class="tb-icon" data-close aria-label="Close">${icon("x", 20)}</button></div>
    <div class="modal-body">${opts.body}</div>${opts.footer ? html`<div class="modal-foot">${opts.footer}</div>` : ""}</div>`.value;
  const close = () => { layer.remove(); document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  layer.addEventListener("mousedown", (e) => { if (e.target === layer) close(); });
  layer.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  document.body.appendChild(layer);
  (layer.querySelector("input,select,textarea,.btn-primary,.btn-danger,.btn-secondary") as HTMLElement | null)?.focus();
  onMount?.(layer, close);
  return close;
}

export function confirmDialog(opts: { title: string; text: string; confirm: string; danger?: boolean; icon?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v: boolean) => { if (!answered) { answered = true; resolve(v); } };
    modal({ title: opts.title, icon: { name: opts.icon ?? (opts.danger ? "alert" : "info"), tone: opts.danger ? "danger" : "brand" },
      body: html`<p class="muted">${opts.text}</p>`,
      footer: html`<button type="button" class="btn btn-secondary" data-no>Cancel</button><button type="button" class="btn ${opts.danger ? "btn-danger" : "btn-primary"}" data-yes>${opts.confirm}</button>` },
    (root, close) => {
      root.querySelector("[data-yes]")!.addEventListener("click", () => { done(true); close(); });
      root.querySelector("[data-no]")!.addEventListener("click", () => { done(false); close(); });
      root.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => done(false)));
      new MutationObserver(() => { if (!root.isConnected) done(false); }).observe(document.body, { childList: true });
    });
  });
}

// ---------- charts (dependency-free SVG/CSS, matching the design) ----------
export function hbar(items: { label: string; value: number; max?: number }[], unit = ""): Safe {
  return html`<div class="stack-sm">${items.map((d) => { const max = d.max ?? 100; const pct = Math.max(0, Math.min(100, (d.value / max) * 100));
    const tone = d.value >= 70 ? "" : d.value >= 50 ? "warn" : "bad";
    return html`<div class="hbar"><span>${d.label}</span><span class="track" role="img" aria-label="${d.label} ${d.value}${unit} of ${max}"><span class="fill ${tone}" style="width:${pct}%"></span></span><span class="num strong" style="text-align:right">${d.value}</span></div>`; })}</div>`;
}
export function trendChart(points: { label: string; group: string; value: number }[], min = 1, max = 5): Safe {
  if (!points.length) return emptyState("No trend data yet", "Ratings will appear here once evaluations are recorded.");
  const w = 600, h = 250, left = 48, right = 580, top = 40, bottom = 200;
  const x = (i: number) => points.length === 1 ? (left + right) / 2 : 80 + (i * (560 - 80)) / (points.length - 1);
  const y = (v: number) => bottom - ((v - min) / (max - min)) * (bottom - top);
  const ticks = [min, min + (max - min) / 4, min + (max - min) / 2, min + (3 * (max - min)) / 4, max];
  const poly = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  return html`<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Average rating trend from ${points[0]!.value} to ${points[points.length - 1]!.value}" style="display:block">
    <g font-family="IBM Plex Sans, sans-serif" font-size="12" fill="#475569">
    ${ticks.map((t) => raw(`<line x1="${left}" y1="${y(t)}" x2="${right}" y2="${y(t)}" stroke="${t === min ? "#cbd5e1" : "#eef2f6"}"></line><text x="38" y="${y(t) + 4}" text-anchor="end">${t.toFixed(1)}</text>`))}
    <polyline points="${poly}" fill="none" stroke="#166534" stroke-width="3" stroke-linejoin="round"></polyline>
    ${points.map((p, i) => raw(`<circle cx="${x(i)}" cy="${y(p.value)}" r="${i === points.length - 1 ? 6 : 5}" fill="${i === points.length - 1 ? "#166534" : "#fff"}" stroke="#166534" stroke-width="2.5"><title>${p.group} ${p.label}: ${p.value}</title></circle><text x="${x(i)}" y="222" text-anchor="middle">${p.label}</text>`))}
    ${points.filter((p, i) => i === 0 || points[i - 1]!.group !== p.group).map((p) => { const i = points.indexOf(p); return raw(`<text x="${x(i)}" y="242" fill="#334155">${p.group}</text>`); })}
    <text x="${x(points.length - 1)}" y="${y(points[points.length - 1]!.value) - 12}" text-anchor="middle" font-weight="600" fill="#0f172a">${points[points.length - 1]!.value}</text></g></svg>`;
}
export function donut(parts: { label: string; value: number; color: string }[], centre: string, sub: string): Safe {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const C = 2 * Math.PI * 60; let offset = 0;
  const arcs = parts.filter((p) => p.value > 0).map((p) => { const len = total ? (p.value / total) * C : 0; const el = `<circle cx="80" cy="80" r="60" stroke="${p.color}" stroke-dasharray="${len.toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}"></circle>`; offset += len; return el; });
  const aria = parts.map((p) => `${p.label} ${p.value}`).join(", ");
  return html`<svg width="180" height="180" viewBox="0 0 160 160" role="img" aria-label="Donut chart: ${aria}"><g transform="rotate(-90 80 80)" fill="none" stroke-width="22">${raw(total ? arcs.join("") : `<circle cx="80" cy="80" r="60" stroke="#e2e8f0"></circle>`)}</g>
    <text x="80" y="78" text-anchor="middle" font-size="26" font-weight="600" fill="#0f172a" font-family="IBM Plex Sans, sans-serif">${centre}</text><text x="80" y="98" text-anchor="middle" font-size="11" fill="#475569" font-family="IBM Plex Sans, sans-serif">${sub}</text></svg>`;
}
export const q = $;
