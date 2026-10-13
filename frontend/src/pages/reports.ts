import { ApiError } from "../api/client";
import { deptName, loadDepartments, userName, loadDirectory } from "../api/directory";
import { reports } from "../api/services";
import type { ExportFormat, Report, ReportType } from "../api/types";
import { R } from "../routes";
import type { Route, RouteContext } from "../router";
import { hasRole } from "../session";
import { alert, backLink, badge, bindForm, confirmDialog, dataTable, emptyState, errorState, formAlert, icon, needsApiBanner, pageHead, select, skeletonRows, toast } from "../ui/components";
import { $, $$, fmtDate, fmtDateTime, html, label, mount, Safe } from "../ui/html";

const ROLES = ["ADMIN", "DIRECTOR", "ACADEMIC-OFFICER"] as const;
const TYPES: { v: ReportType; n: string; d: string; i: string }[] = [
  { v: "DISPATCH", n: "Dispatch", d: "Incoming mail, priority and approval status", i: "mail" }, { v: "CLASSROOM_USAGE", n: "Classroom usage", d: "Allocations, utilisation and overcrowding", i: "building" },
  { v: "DEPARTMENTAL_AUDIT", n: "Departmental audit", d: "Staff ratios, accreditation and quality scores", i: "landmark" }, { v: "STAFF_EVALUATION", n: "Staff evaluation", d: "Ratings by session and semester (confidential)", i: "star" },
  { v: "PAYMENT_HISTORY", n: "Payment history", d: "Invoices, payments and receipts", i: "card" },
];
const typeName = (t: ReportType) => TYPES.find((x) => x.v === t)?.n ?? label(t);
const ext = (f: ExportFormat) => (f === "PDF" ? "pdf" : "xlsx");
const sessions = () => { const y = new Date().getFullYear(); const s = new Date().getMonth() >= 8 ? y : y - 1; return [0, 1, 2].map((i) => `${s - i}/${s - i + 1}`); };
const repName = (r: Report) => `${typeName(r.report_type)}${r.session ? ` ${r.session}` : ""}`;
const fileName = (r: Report) => `CAPQA_${typeName(r.report_type).replace(/\s+/g, "_")}${r.session ? "_" + r.session.replace("/", "-") : ""}.${ext(r.export_format)}`;
const fmtBadge = (f: ExportFormat) => html`<span class="f-ico" style="width:32px;height:32px;border-radius:6px;display:inline-grid;place-items:center;font-size:10px;font-weight:700;${f === "PDF" ? "background:#fef3f2;color:#b42318" : "background:#ecfdf3;color:#15703c"}">${f === "PDF" ? "PDF" : "XLS"}</span>`;

async function builder({ root }: RouteContext): Promise<void> {
  const depts = await loadDepartments(); let type: ReportType = "DISPATCH";
  mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${pageHead("Build a report", "Reports are saved as drafts. Finalise one to lock it for circulation.")}
    <form class="stack-lg" id="f" novalidate>${formAlert()}<section class="card card-body stack"><fieldset style="border:0;padding:0;margin:0" class="field"><legend class="label" style="margin-bottom:8px">Report type <span class="req" aria-hidden="true">*</span></legend>
      <div class="radio-cards" style="grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))">${TYPES.map((t) => html`<label class="radio-card ${t.v === type ? "is-on" : ""}" style="align-items:flex-start;padding:14px"><input type="radio" name="report_type" value="${t.v}" ${t.v === type ? "checked" : ""} style="margin-top:2px"><span class="stack-sm" style="gap:4px"><span class="row" style="gap:6px">${icon(t.i, 18)}<span class="strong">${t.n}</span></span><span class="t-xs muted">${t.d}</span></span></label>`)}</div></fieldset></section>
      <section class="card"><div class="card-head"><h2 class="h3">Scope</h2></div><div class="card-body grid-form">
        ${depts.length ? select("department_id", "Department", depts.map((d) => ({ value: d.id, text: d.name })), { optional: true, blank: "All departments" }) : html`<div class="field"><label class="label">Department <span class="opt">(optional)</span></label><select class="select" disabled><option>All departments</option></select><span class="help">Department names are visible to Admin, Director and Academic Officer.</span></div>`}
        ${select("session", "Session", sessions().map((s) => ({ value: s, text: s })), { optional: true, blank: "All sessions", value: sessions()[0] })}
        <fieldset class="field span-2" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Export format <span class="req" aria-hidden="true">*</span></legend><div class="radio-cards">
          <label class="radio-card is-on"><input type="radio" name="export_format" value="PDF" checked>${fmtBadge("PDF")}PDF document</label><label class="radio-card"><input type="radio" name="export_format" value="EXCEL">${fmtBadge("EXCEL")}Excel workbook with charts</label></div></fieldset></div></section>
      ${needsApiBanner("The server applies the report type, department and session. Status, priority, date-range and grouping filters are not applied yet, and an in-page preview needs a backend endpoint.")}
      <div class="action-bar"><a class="btn btn-secondary" href="${R.reports}">Cancel</a><button type="submit" class="btn btn-primary">Generate report</button></div></form></div>`);
  const form = $<HTMLFormElement>("#f", root)!;
  $$("input[type=radio]", form).forEach((r) => r.addEventListener("change", () => { $$(`input[name=${(r as HTMLInputElement).name}]`, form).forEach((x) => (x.closest(".radio-card") as HTMLElement).classList.toggle("is-on", (x as HTMLInputElement).checked)); type = (form.querySelector("input[name=report_type]:checked") as HTMLInputElement).value as ReportType; }));
  bindForm(form, async (v) => {
    const rep = await reports.generate({ report_type: v.report_type, department_id: v.department_id ? Number(v.department_id) : undefined, session: v.session || undefined, export_format: v.export_format, filters: {} });
    toast("success", "Report generated", repName(rep)); location.hash = R.reportDetail(rep.id);
  });
}

async function list({ root }: RouteContext): Promise<void> {
  const [dir] = await Promise.all([loadDirectory()]);
  mount(root, html`${pageHead("Reports", "Drafts can be regenerated. Finalised reports are locked.", hasRole(...ROLES) ? html`<a class="btn btn-primary" href="${R.reportNew}">${icon("plus", 16)}Build report</a>` : "")}
    <section class="card"><form class="filter-bar" id="f"><label class="field"><span class="label">Type</span><select class="select" name="t"><option value="">All types</option>${TYPES.map((t) => html`<option value="${t.v}">${t.n}</option>`)}</select></label>
      <label class="field"><span class="label">Status</span><select class="select" name="s"><option value="">Draft and finalised</option><option value="d">Draft</option><option value="f">Finalised</option></select></label></form><div id="rows">${skeletonRows()}</div></section>`);
  let all: Report[]; try { all = await reports.list(); } catch (e) { $("#rows", root)!.innerHTML = errorState(e).value; $("[data-retry]", root)?.addEventListener("click", () => location.reload()); return; }
  const form = $<HTMLFormElement>("#f", root)!;
  const paint = () => { const f = new FormData(form); const rows = all.filter((r) => (!f.get("t") || r.report_type === f.get("t")) && (!f.get("s") || (f.get("s") === "f") === r.is_finalised));
    $("#rows", root)!.innerHTML = html`${dataTable<Report>([{ header: "Report", lead: true, cell: (r) => html`<a class="strong" href="${R.reportDetail(r.id)}">${repName(r)}</a>` }, { header: "Type", cell: (r) => typeName(r.report_type) }, { header: "Created by", cell: (r) => userName(r.generated_by, dir) },
      { header: "Date", cls: "num", cell: (r) => fmtDate(r.created_at) }, { header: "Format", cell: (r) => r.export_format === "PDF" ? "PDF" : "Excel" }, { header: "Status", cell: (r) => badge("life", r.is_finalised ? "FINALISED" : "DRAFT") },
      { header: "Open", right: true, cls: "td-actions", cell: (r) => html`<div class="row" style="flex-wrap:nowrap;justify-content:flex-end;gap:4px"><a class="btn btn-ghost btn-sm" href="${R.reportDetail(r.id)}">Open${icon("chev-right", 14)}</a></div>` }], rows,
      emptyState("No reports yet", "Build a dispatch, classroom usage, audit, evaluation or payment report.", hasRole(...ROLES) ? { href: R.reportNew, text: "Build report" } : undefined))}<div class="pagination"><span>${rows.length} report${rows.length === 1 ? "" : "s"}</span></div>`.value; };
  form.addEventListener("input", paint); paint();
}

async function detail({ root, params }: RouteContext): Promise<void> {
  const [all, depts, dir] = await Promise.all([reports.list(), loadDepartments(), loadDirectory()]);
  const r = all.find((x) => x.id === params.id); if (!r) throw new ApiError(404, "NOT_FOUND", "That report was not found.");
  const fin = r.is_finalised;
  mount(root, html`${backLink(R.reports, "Back to reports")}<div style="max-width:560px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:16px">
    ${fin ? html`<div class="banner-locked" role="status">${icon("lock", 18)}<span class="strong">Finalised, read-only</span><span class="muted">Locked for circulation</span></div>` : ""}
    <section class="card" aria-live="polite"><div class="card-body stack" style="padding:32px;align-items:center;text-align:center">
      ${r.download_available ? html`<span class="e-icon" style="display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:#ecfdf3;color:#15703c">${icon("check-circle", 30)}</span><h1 class="h2">Report ready</h1>` : html`<span class="e-icon bad" style="display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:#fef3f2;color:#b42318">${icon("alert-circle", 30)}</span><h1 class="h2">File not available</h1><p class="muted">The export file is missing on the server. Build the report again.</p>`}
      <div class="file-row" style="width:100%;text-align:left"><span class="f-ico" style="${r.export_format === "EXCEL" ? "background:#ecfdf3;color:#15703c" : ""}">${r.export_format === "PDF" ? "PDF" : "XLS"}</span><div class="f-main"><span class="f-name">${fileName(r)}</span><span class="t-xs muted">${typeName(r.report_type)} · ${r.session ?? "All sessions"} · ${badge("life", fin ? "FINALISED" : "DRAFT")}</span></div></div>
      <dl class="dl" style="grid-template-columns:1fr 1fr;width:100%;text-align:left;margin:0"><div><dt>Department</dt><dd>${r.department_id ? deptName(r.department_id, depts) : "All departments"}</dd></div><div><dt>Created</dt><dd>${fmtDateTime(r.created_at)}</dd></div><div><dt>Created by</dt><dd>${userName(r.generated_by, dir)}</dd></div></dl>
      ${r.download_available ? html`<button type="button" class="btn btn-primary btn-lg btn-block" id="dl">${icon("download", 18)}Download ${r.export_format === "PDF" ? "PDF" : "Excel"}</button>` : ""}
      <div class="row" style="justify-content:center"><a class="btn btn-ghost btn-sm" href="${R.reportPrint(r.id)}">${icon("printer", 16)}Print layout</a>${!fin && hasRole(...ROLES) ? html`<button type="button" class="btn btn-secondary btn-sm" id="fin">${icon("lock", 14)}Finalise</button>` : ""}</div></div></section>
    ${needsApiBanner("An in-page preview with tables and charts needs a backend endpoint; the downloaded file holds the full report.")}</div>`);
  $("#dl", root)?.addEventListener("click", async (e) => { const b = e.currentTarget as HTMLButtonElement; b.disabled = true; try { await reports.download(r.id, fileName(r)); } catch (err) { toast("error", "Download failed", err instanceof ApiError ? err.message : ""); } b.disabled = false; });
  $("#fin", root)?.addEventListener("click", async () => {
    if (!(await confirmDialog({ title: "Finalise this report?", text: "A finalised report is locked and can't be regenerated or changed. It stays available to download.", confirm: "Finalise report", icon: "lock" }))) return;
    try { await reports.finalise(r.id); toast("success", "Report finalised"); await detail({ root, params, query: new URLSearchParams() }); } catch (err) { toast("error", "Could not finalise", err instanceof ApiError ? err.message : ""); }
  });
}

async function printPage({ root, params }: RouteContext): Promise<void> {
  const [all, depts] = await Promise.all([reports.list(), loadDepartments()]); const r = all.find((x) => x.id === params.id); if (!r) throw new ApiError(404, "NOT_FOUND", "That report was not found.");
  mount(root, html`<div class="row" style="justify-content:space-between" data-noprint>${backLink(R.reportDetail(r.id), "Back")}<button class="btn btn-primary" onclick="window.print()">${icon("printer", 16)}Print</button></div>
    <div class="print-page" style="max-width:794px;margin:0 auto;width:100%;padding:56px 60px;display:flex;flex-direction:column;gap:22px;font-size:16px;line-height:24px;background:#fff;border:1px solid #e2e8f0">
      <header style="display:flex;gap:16px;align-items:center;border-bottom:3px solid #166534;padding-bottom:16px"><div class="logo-slot on-light" style="width:64px;height:64px;font-size:10px">RFMOAUM</div><div style="flex:1 1 auto"><div style="font-size:13px;font-weight:700;letter-spacing:.04em">REV. FR. MOSES ORSHIO ADASU UNIVERSITY, MAKURDI</div><div style="font-size:11px;font-weight:600;letter-spacing:.14em;color:#b45309">ALABATT-HUB CAPQA</div><div style="font-size:18px;font-weight:700;color:#166534">Centre for Academic Planning and Quality Assurance</div></div>
        <div style="flex:none;white-space:nowrap;text-align:right;font-size:13px;line-height:18px;color:#334155">Printed ${fmtDate(new Date().toISOString())}<br>Ref. ${r.id.slice(0, 8).toUpperCase()}</div></header>
      <div><h1 style="margin:0;font-size:26px;line-height:32px">${typeName(r.report_type)} Report</h1><p style="margin:4px 0 0;color:#334155">${r.session ? `Session ${r.session}` : "All sessions"} · ${r.department_id ? deptName(r.department_id, depts) : "All departments"} · ${r.is_finalised ? "Finalised" : "Draft"}</p></div>
      ${alert("info", "Report data", "The detailed tables and charts are in the downloaded file. This page is the cover sheet; an in-page report body needs a backend endpoint.")}
      <footer style="margin-top:auto;border-top:1px solid #cbd5e1;padding-top:10px;font-size:12px;color:#475569">Generated ${fmtDateTime(r.created_at)} · CAPQA, RFMOAUM</footer></div>`);
}

export const reportRoutes: Route[] = [
  { path: "/reports", title: "Reports", roles: ["ADMIN", "DIRECTOR", "ACADEMIC-OFFICER", "QUALITY-INSPECTOR", "VIEWER"], render: list },
  { path: "/reports/new", title: "Build report", roles: [...ROLES], render: builder },
  { path: "/reports/:id", title: "Report", roles: [...ROLES], render: detail },
  { path: "/reports/:id/print", title: "Print layout", roles: [...ROLES], render: printPage },
];
void ((_: Safe) => 0);
