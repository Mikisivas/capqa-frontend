/** Tiny auto-escaping template tag so dynamic data can never inject markup. */
export class Safe { constructor(public value: string) {} toString() { return this.value; } }

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function render(value: unknown): string {
  if (value instanceof Safe) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(value);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Safe {
  let out = strings[0]!;
  values.forEach((v, i) => { out += render(v) + strings[i + 1]!; });
  return new Safe(out);
}

export const raw = (s: string) => new Safe(s);
export const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

export function mount(el: HTMLElement, content: Safe): void { el.innerHTML = content.value; }

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export const fmtMoney = (amount: string | number, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(Number(amount));
export const label = (s: string) => s.replace(/[_-]/g, " ").toLowerCase().replace(/^\w|\s\w/g, (c) => c.toUpperCase());

export const initials = (name: string) => name.replace(/^(Mr|Mrs|Ms|Dr|Prof)\.?\s+/i, "").split(/\s+/).map((p) => p[0] ?? "").slice(0, 2).join("").toUpperCase();
/** Seconds-aware "5 min ago" style label. */
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`; if (s < 172800) return "Yesterday";
  return fmtDate(iso);
}
