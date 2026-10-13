import { ApiError } from "../api/client";
import { activeUsers, canListUsers, isUuid, loadDirectory, userName } from "../api/directory";
import { payments } from "../api/services";
import type { Invoice, Payment, PaymentVerification } from "../api/types";
import { R } from "../routes";
import type { Route, RouteContext } from "../router";
import { getUser, hasRole } from "../session";
import { alert, backLink, badge, bindForm, dataTable, emptyState, errorState, field, fieldError, formAlert, icon, needsApiBanner, onPage, pageHead, pagination, select, skeletonRows, statCard, toast } from "../ui/components";
import { $, fmtDate, fmtDateTime, fmtMoney, html, mount } from "../ui/html";

const MANAGE = ["ADMIN", "ACADEMIC-OFFICER"] as const;
const PAY_ROLES = ["ADMIN", "DIRECTOR", "ACADEMIC-OFFICER"] as const;

// ---- invoices and verifications remembered in this browser (the API cannot list/get invoices or receipts yet) ----
// TODO(backend): GET /payments/invoices, GET /payments/invoices/{id}, GET /payments/{id}/receipt.
const INV = "capqa.invoices.v1"; const VER = "capqa.verifications.v1";
const read = <T,>(k: string): T[] => { try { return JSON.parse(localStorage.getItem(k) ?? "[]") as T[]; } catch { return []; } };
const write = (k: string, v: unknown[]) => { try { localStorage.setItem(k, JSON.stringify(v.slice(0, 200))); } catch { /* ignore */ } };
const invoices = () => read<Invoice>(INV);
const rememberInvoice = (i: Invoice) => write(INV, [i, ...invoices().filter((x) => x.id !== i.id)]);
const verifications = () => read<PaymentVerification>(VER);
const rememberVerification = (v: PaymentVerification) => write(VER, [v, ...verifications().filter((x) => x.payment.id !== v.payment.id)]);
const invNo = (i: { id: string; created_at: string }) => `INV-${new Date(i.created_at).getFullYear()}-${i.id.slice(0, 4).toUpperCase()}`;
const PAYSTORE = "capqa.pending-payment";

const testBanner = html`<div class="banner-test" role="note">TEST MODE · no real money is moved</div>`;

// ============ HISTORY ============
async function history({ root }: RouteContext): Promise<void> {
  mount(root, html`${pageHead("Payment history", "All amounts in NGN", html`<a class="btn btn-secondary" href="${R.invoices}">${icon("receipt", 16)}Invoices</a><a class="btn btn-secondary" href="${R.payStart}">${icon("card", 16)}Pay an invoice</a>${hasRole(...MANAGE) ? html`<a class="btn btn-primary" href="${R.invoiceNew}">${icon("plus", 16)}Generate invoice</a>` : ""}`)}<div id="body">${skeletonRows()}</div>`);
  let list: Payment[]; try { list = await payments.history(); } catch (e) { $("#body", root)!.innerHTML = errorState(e).value; $("[data-retry]", root)?.addEventListener("click", () => location.reload()); return; }
  const month = new Date().getMonth(); const inMonth = list.filter((p) => new Date(p.created_at).getMonth() === month);
  const ok = inMonth.filter((p) => p.status === "SUCCESSFUL"), pend = list.filter((p) => p.status === "PENDING"), bad = inMonth.filter((p) => p.status === "FAILED");
  const sum = (xs: Payment[]) => xs.reduce((s, p) => s + Number(p.amount), 0);
  $("#body", root)!.innerHTML = html`<section class="grid-stats" aria-label="Totals">${statCard({ label: "Received this month", value: fmtMoney(sum(ok)), foot: `${ok.length} successful payment${ok.length === 1 ? "" : "s"}`, icon: "card" })}${statCard({ label: "Pending", value: fmtMoney(sum(pend)), foot: `${pend.length} awaiting verification`, icon: "clock" })}${statCard({ label: "Failed", value: bad.length, foot: "this month", icon: "alert" })}</section>
    <section class="card" style="margin-top:20px"><form class="filter-bar" id="f"><label class="field grow"><span class="label">Search</span><span class="input-wrap"><span class="lead">${icon("search", 18)}</span><input class="input" type="search" name="q" placeholder="Reference or invoice"></span></label>
      <label class="field"><span class="label">Status</span><select class="select" name="s"><option value="">All statuses</option><option value="PENDING">Pending</option><option value="SUCCESSFUL">Successful</option><option value="FAILED">Failed</option></select></label>
      <label class="field"><span class="label">From</span><input class="input" type="date" name="from"></label><label class="field"><span class="label">To</span><input class="input" type="date" name="to"></label></form><div id="rows"></div></section>
    ${needsApiBanner("Export and a payer column need backend support. This history shows payments for invoices addressed to you.")}`.value;
  const form = $<HTMLFormElement>("#f", root)!; let offset = 0; const limit = 10;
  const paint = () => { const f = new FormData(form); const q = String(f.get("q")).toLowerCase(); const rows = list.filter((p) => (!q || p.provider_reference.toLowerCase().includes(q) || p.invoice_id.toLowerCase().includes(q)) && (!f.get("s") || p.status === f.get("s")) && (!f.get("from") || p.created_at.slice(0, 10) >= String(f.get("from"))) && (!f.get("to") || p.created_at.slice(0, 10) <= String(f.get("to")))).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const el = $("#rows", root)!; el.innerHTML = html`${dataTable<Payment>([{ header: "Reference", lead: true, cls: "mono t-sm", cell: (p) => p.provider_reference }, { header: "Invoice", cls: "mono t-sm", cell: (p) => html`<a href="${R.invoiceDetail(p.invoice_id)}">${p.invoice_id.slice(0, 8)}</a>` },
      { header: "Amount", right: true, cls: "num strong", cell: (p) => fmtMoney(p.amount) }, { header: "Status", cell: (p) => badge("pay", p.status) }, { header: "Date", cls: "num", cell: (p) => fmtDateTime(p.created_at) },
      { header: "Receipt", right: true, cls: "td-actions", cell: (p) => p.status === "SUCCESSFUL" ? html`<a class="btn btn-ghost btn-sm" href="${R.receipt(p.id)}">Receipt</a>` : p.status === "PENDING" ? html`<a class="btn btn-ghost btn-sm" href="${R.checkout(p.id)}">Continue</a>` : "" }], rows.slice(offset, offset + limit),
      emptyState("No payments in this period", "Payments appear here once a payer completes checkout.", hasRole(...MANAGE) ? { href: R.invoiceNew, text: "Generate invoice" } : undefined))}${pagination(rows.length, offset, limit)}`.value; onPage(el, (o) => { offset = Math.max(0, o); paint(); }); };
  form.addEventListener("input", () => { offset = 0; paint(); }); paint();
}

// ============ INVOICES ============
async function invoiceNew({ root }: RouteContext): Promise<void> {
  const dir = await loadDirectory();
  mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${pageHead("Generate invoice", "The payer can pay it from Pay an invoice using the invoice ID.")}<form class="stack-lg" id="f" novalidate>${formAlert()}<div class="card"><div class="card-body grid-form">
    <div class="span-2">${canListUsers() ? select("user_id", "Payer", activeUsers(dir).map((u) => ({ value: u.id, text: `${u.full_name} · ${u.email}` })), { required: true, blank: "Choose a payer" }) : field("user_id", "Payer user ID", { required: true, mono: true, placeholder: "User ID (UUID)", help: "Only Admins can browse users. Paste the payer's user ID." })}</div>
    <div class="span-2">${field("description", "Description", { required: true, placeholder: "e.g. Hall booking fee, departmental seminar", attrs: 'minlength="2" maxlength="200"' })}</div>
    <div class="field"><label class="label" for="f-amount">Amount <span class="req" aria-hidden="true">*</span></label><div class="addon"><span class="pre">₦</span><input class="input num" id="f-amount" name="amount" inputmode="decimal" required placeholder="25000.00"></div><div class="err" data-err="amount" hidden></div></div>
    <div class="field"><label class="label" for="f-cur">Currency</label><select class="select" id="f-cur" name="currency"><option value="NGN">NGN: Nigerian naira</option></select></div></div></div>
    <section class="card card-body row-between" aria-live="polite"><span class="muted">Invoice total</span><span class="t-2xl strong num" id="total">NGN 0.00</span></section>
    <div class="action-bar"><a class="btn btn-secondary" href="${R.invoices}">Cancel</a><button type="submit" class="btn btn-primary">${icon("receipt", 16)}Generate invoice</button></div></form></div>`);
  const form = $<HTMLFormElement>("#f", root)!; (form.elements.namedItem("amount") as HTMLInputElement).addEventListener("input", (e) => { const n = Number((e.target as HTMLInputElement).value.replace(/,/g, "")); $("#total", root)!.textContent = Number.isFinite(n) && n > 0 ? fmtMoney(n).replace("₦", "NGN ") : "NGN 0.00"; });
  bindForm(form, async (v) => {
    const amt = v.amount!.replace(/,/g, ""); if (!/^\d{1,10}(\.\d{1,2})?$/.test(amt) || Number(amt) <= 0) { fieldError(form, "amount", "Enter an amount greater than 0 with at most 2 decimal places."); return; }
    if (!isUuid(v.user_id ?? "")) { fieldError(form, "user_id", "Choose a payer (a valid user ID)."); return; }
    try { const inv = await payments.createInvoice({ user_id: v.user_id!, description: v.description!, amount: amt, currency: v.currency || "NGN" }); rememberInvoice(inv); toast("success", "Invoice generated", invNo(inv)); location.hash = R.invoiceDetail(inv.id); }
    catch (e) { if (e instanceof ApiError && e.status === 404) { fieldError(form, "user_id", "No such user."); return; } throw e; }
  });
}

async function invoiceList({ root }: RouteContext): Promise<void> {
  const dir = await loadDirectory(); const list = invoices();
  mount(root, html`${pageHead("Invoices", "", html`<a class="btn btn-secondary" href="${R.payStart}">${icon("card", 16)}Pay an invoice</a>${hasRole(...MANAGE) ? html`<a class="btn btn-primary" href="${R.invoiceNew}">${icon("plus", 16)}Generate invoice</a>` : ""}`)}
    ${needsApiBanner("The server cannot list invoices yet. This list shows invoices generated in this browser; a shared list needs GET /payments/invoices.")}
    <section class="card">${dataTable<Invoice>([{ header: "Invoice", lead: true, cls: "mono", cell: (i) => html`<a href="${R.invoiceDetail(i.id)}" class="strong">${invNo(i)}</a>` }, { header: "Payer", cell: (i) => userName(i.user_id, dir) }, { header: "Description", cell: (i) => i.description },
      { header: "Amount", right: true, cls: "num strong", cell: (i) => fmtMoney(i.amount, i.currency) }, { header: "Status", cell: (i) => badge("inv", i.status) }, { header: "Created", cls: "num", cell: (i) => fmtDate(i.created_at) }], list, emptyState("No invoices yet", "Generate an invoice to start.", hasRole(...MANAGE) ? { href: R.invoiceNew, text: "Generate invoice" } : undefined))}</section>`);
}

async function invoiceDetail({ root, params }: RouteContext): Promise<void> {
  const dir = await loadDirectory(); const inv = invoices().find((i) => i.id === params.id); const me = getUser()!;
  mount(root, html`${backLink(R.invoices, "Back to invoices")}<div style="max-width:640px;width:100%;display:flex;flex-direction:column;gap:16px">
    ${inv ? html`<div class="page-head"><div class="stack-sm" style="gap:6px"><div class="row"><span class="mono strong muted">${invNo(inv)}</span>${badge("inv", inv.status)}</div><h1 class="h1">${fmtMoney(inv.amount, inv.currency)}</h1><p class="muted">${inv.description}</p></div>${inv.user_id === me.id && inv.status === "UNPAID" ? html`<a class="btn btn-primary" href="${R.payStart}?invoice=${inv.id}">${icon("card", 16)}Pay now</a>` : ""}</div>
      <section class="card"><dl class="dl card-body" style="margin:0"><div><dt>Payer</dt><dd>${userName(inv.user_id, dir)}</dd></div><div><dt>Created</dt><dd>${fmtDateTime(inv.created_at)}</dd></div><div style="grid-column:1/-1"><dt>Invoice ID (share with the payer)</dt><dd class="mono" style="word-break:break-all">${inv.id}</dd></div></dl></section>`
      : html`<div class="page-head"><div><h1 class="h1">Invoice</h1><p class="mono muted">${params.id}</p></div></div>${needsApiBanner("This invoice is not stored in this browser and the server cannot fetch a single invoice yet.")}<a class="btn btn-primary" href="${R.payStart}?invoice=${params.id}">${icon("card", 16)}Pay this invoice</a>`}</div>`);
}

// ============ PAY FLOW ============
async function payStart({ root, query }: RouteContext): Promise<void> {
  const id = query.get("invoice") ?? ""; const inv = invoices().find((i) => i.id === id);
  mount(root, html`<div style="max-width:560px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:16px"><div><h1 class="h1">Pay invoice</h1><p class="muted" style="margin-top:4px">You'll confirm the payment on the next screen.</p></div>
    <form class="stack" id="f" novalidate>${formAlert()}${inv ? html`<section class="card"><div class="card-body stack-sm"><div class="row-between"><span class="mono strong">${invNo(inv)}</span>${badge("inv", inv.status)}</div><span>${inv.description}</span></div><div class="card-foot" style="justify-content:space-between;background:#fff"><span class="strong">Amount</span><span class="t-2xl strong num">${fmtMoney(inv.amount, inv.currency)}</span></div></section><input type="hidden" name="invoice" value="${inv.id}">` : field("invoice", "Invoice ID", { required: true, mono: true, value: id, placeholder: "Invoice ID (UUID)", help: "Ask the person who generated the invoice for its ID." })}
      <fieldset class="card card-body" style="margin:0"><legend class="sr-only">Payment method</legend><span class="label" style="display:block;margin-bottom:8px" aria-hidden="true">Payment method</span><label class="radio-card is-on" style="min-height:56px"><input type="radio" name="pm" checked>${icon("card", 20)}<span><span class="strong">Test gateway</span><br><span class="t-xs muted">Simulated payment, no card needed</span></span></label></fieldset>
      <div class="action-bar"><a class="btn btn-secondary btn-lg" href="${R.payments}">Cancel</a><button type="submit" class="btn btn-primary btn-lg">${inv ? `Continue · ${fmtMoney(inv.amount, inv.currency)}` : "Continue"}</button></div></form>
    <p class="t-xs muted row" style="justify-content:center;gap:6px">${icon("lock", 14)}Payments are processed by the university's payment gateway. CAPQA never stores card details.</p></div>`);
  const form = $<HTMLFormElement>("#f", root)!;
  bindForm(form, async (v) => {
    if (!isUuid(v.invoice ?? "")) { fieldError(form, "invoice", "Enter a valid invoice ID."); return; }
    try { const p = await payments.initiate(v.invoice!); try { sessionStorage.setItem(`${PAYSTORE}.${p.id}`, JSON.stringify(p)); } catch { /* ignore */ } location.hash = R.checkout(p.id); }
    catch (e) { if (e instanceof ApiError && e.status === 409) throw new ApiError(409, e.code, "This invoice has already been paid or cancelled."); if (e instanceof ApiError && e.status === 403) throw new ApiError(403, e.code, "You can only pay invoices addressed to you."); throw e; }
  });
}

async function checkout({ root, params }: RouteContext): Promise<void> {
  const raw = sessionStorage.getItem(`${PAYSTORE}.${params.id}`); const p = raw ? (JSON.parse(raw) as Payment) : (await payments.history()).find((x) => x.id === params.id);
  if (!p) throw new ApiError(404, "NOT_FOUND", "This payment was not found. Start again from Pay an invoice.");
  const inv = invoices().find((i) => i.id === p.invoice_id);
  mount(root, html`${testBanner}<div style="flex:1 1 auto;display:flex;justify-content:center;padding:32px 16px 48px"><div style="width:100%;max-width:480px;display:flex;flex-direction:column;gap:16px">
    <div class="row" style="gap:12px"><div class="logo-slot on-light" style="width:40px;height:40px;font-size:7px">RFMOAUM</div><div><div class="strong">ALABATT-HUB CAPQA payments</div><div class="t-xs muted">Test gateway</div></div></div>
    <section class="card" aria-labelledby="tc-sum"><div class="card-head"><h1 class="h3" id="tc-sum">Order summary</h1><span class="mono t-xs muted">REF ${p.provider_reference.slice(0, 14)}</span></div><dl class="card-body" style="margin:0;display:grid;gap:10px">
      <div class="row-between"><dt class="muted">Invoice</dt><dd class="mono strong" style="margin:0">${inv ? invNo(inv) : p.invoice_id.slice(0, 8)}</dd></div>${inv ? html`<div class="row-between" style="align-items:flex-start"><dt class="muted">Description</dt><dd style="margin:0;text-align:right;max-width:260px">${inv.description}</dd></div>` : ""}<hr class="divider"><div class="row-between"><dt class="strong">Total</dt><dd class="t-2xl strong num" style="margin:0">${fmtMoney(p.amount)}</dd></div></dl></section>
    <section class="card card-body stack" aria-labelledby="tc-sim"><h2 class="h3" id="tc-sim">Simulate the gateway response</h2><p class="t-sm muted">Choose an outcome to test how CAPQA verifies and records the payment.</p><div id="msg"></div>
      <button type="button" class="btn btn-primary btn-lg btn-block" data-sim="SUCCESSFUL">${icon("check-circle", 18)}Simulate success</button><button type="button" class="btn btn-secondary btn-lg btn-block" data-sim="FAILED" style="color:#b42318;border-color:#fecdca">${icon("x-circle", 18)}Simulate failure</button><a class="t-sm strong" href="${R.payments}" style="text-align:center">Cancel</a></section></div></div>`);
  root.querySelectorAll<HTMLButtonElement>("[data-sim]").forEach((b) => b.addEventListener("click", async () => {
    const result = b.dataset.sim as "SUCCESSFUL" | "FAILED";
    mount(root, html`${testBanner}<div style="flex:1 1 auto;display:flex;align-items:center;justify-content:center;padding:32px 16px"><section class="card" style="width:100%;max-width:440px" aria-live="polite" aria-busy="true"><div class="card-body stack" style="padding:32px;align-items:center;text-align:center"><span class="spin" style="width:44px;height:44px;border-width:4px;color:#166534" aria-hidden="true"></span><h1 class="h2">Verifying payment…</h1><p class="muted">Don't close this page. Reference <span class="mono">${p.provider_reference.slice(0, 14)}</span></p></div></section></div>`);
    try { const v = await payments.verify(p.id, p.provider_reference, result); rememberVerification(v); location.hash = R.payResult(p.id, v.payment.status === "SUCCESSFUL"); }
    catch (e) { const msg = e instanceof ApiError ? e.message : "Could not verify the payment."; mount(root, html`<div class="page" style="max-width:520px;margin:auto">${alert("danger", "Verification failed", msg, "alert-circle")}${e instanceof ApiError && e.status === 403 ? alert("info", "Test gateway", "The test gateway is disabled in production. A real payment provider callback replaces it before real money is accepted.") : ""}<a class="btn btn-primary" href="${R.payments}">Back to payment history</a></div>`); }
  }));
}

async function result({ root, params }: RouteContext): Promise<void> {
  const ok = params.outcome === "success"; const v = verifications().find((x) => x.payment.id === params.id); const p = v?.payment; const inv = p ? invoices().find((i) => i.id === p.invoice_id) : undefined;
  mount(root, html`<div style="flex:1 1 auto;display:flex;align-items:center;justify-content:center"><section class="card" style="width:100%;max-width:480px">${ok ? html`<div class="card-body stack" role="status" style="padding:32px;align-items:center;text-align:center"><span style="display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:#ecfdf3;color:#15703c">${icon("check-circle", 32)}</span>${badge("pay", "SUCCESSFUL")}<h1 class="h2">Payment successful</h1><p class="t-3xl strong num">${p ? fmtMoney(p.amount) : ""}</p>
        <dl style="margin:0;width:100%;display:grid;gap:8px;text-align:left" class="t-sm"><div class="row-between"><dt class="muted">Invoice</dt><dd class="mono" style="margin:0">${inv ? invNo(inv) : p?.invoice_id.slice(0, 8)} · ${badge("inv", "PAID")}</dd></div><div class="row-between"><dt class="muted">Reference</dt><dd class="mono" style="margin:0">${p?.provider_reference.slice(0, 18)}</dd></div><div class="row-between"><dt class="muted">Date</dt><dd style="margin:0">${fmtDateTime(p?.paid_at)}</dd></div>${v?.receipt ? html`<div class="row-between"><dt class="muted">Receipt</dt><dd class="mono" style="margin:0">${v.receipt.receipt_number}</dd></div>` : ""}</dl>
        <div class="row" style="width:100%"><a class="btn btn-secondary" style="flex:1 1 0" href="${R.receipt(params.id!)}">${icon("receipt", 16)}View receipt</a><a class="btn btn-primary" style="flex:1 1 0" href="${R.payments}">Payment history</a></div></div>`
      : html`<div class="card-body stack" role="alert" style="padding:32px;align-items:center;text-align:center"><span style="display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:#fef3f2;color:#b42318">${icon("x-circle", 32)}</span>${badge("pay", "FAILED")}<h1 class="h2">Payment failed</h1><p class="muted">The gateway declined the test transaction. You were not charged. The invoice is still ${badge("inv", "UNPAID")}</p>
        <div class="row" style="width:100%"><a class="btn btn-secondary" style="flex:1 1 0" href="${R.payments}">Back to history</a><a class="btn btn-primary" style="flex:1 1 0" href="${R.payStart}${p ? `?invoice=${p.invoice_id}` : ""}">${icon("refresh", 16)}Retry payment</a></div><span class="t-xs muted mono">${p?.provider_reference ?? ""}</span></div>`}</section></div>`);
}

async function receipt({ root, params }: RouteContext): Promise<void> {
  const v = verifications().find((x) => x.payment.id === params.id && x.receipt);
  if (!v?.receipt) throw new ApiError(404, "NOT_FOUND", "This receipt is not stored in this browser. A server receipt endpoint is needed to open it elsewhere.");
  const dir = await loadDirectory(); const p = v.payment, r = v.receipt; const inv = invoices().find((i) => i.id === p.invoice_id);
  mount(root, html`<div style="max-width:760px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:16px"><div class="row-between"><h1 class="h1">Receipt</h1><div class="row"><button type="button" class="btn btn-secondary" onclick="window.print()">${icon("printer", 16)}Print</button></div></div>
    <article class="card" style="padding:0" aria-label="Receipt ${r.receipt_number}"><div class="banner-test" style="border-radius:8px 8px 0 0">TEST MODE RECEIPT · NOT A VALID PROOF OF PAYMENT</div><div class="card-body stack-lg" style="padding:32px">
      <header class="row-between" style="align-items:flex-start"><div class="row" style="gap:12px;flex-wrap:nowrap"><div class="logo-slot on-light" style="width:52px;height:52px;font-size:8px">RFMOAUM</div><div><div class="t-xs strong" style="letter-spacing:.04em">REV. FR. MOSES ORSHIO ADASU UNIVERSITY, MAKURDI</div><div class="brand-hub">ALABATT-HUB CAPQA</div></div></div>${badge("pay", "SUCCESSFUL")}</header>
      <div style="text-align:center;padding:16px;background:#f8fafc;border-radius:8px"><div class="t-sm muted">Amount paid</div><div class="t-3xl strong num">${fmtMoney(p.amount)}</div></div>
      <dl class="dl" style="margin:0"><div><dt>Receipt no.</dt><dd class="mono">${r.receipt_number}</dd></div><div><dt>Payment reference</dt><dd class="mono" style="word-break:break-all">${p.provider_reference}</dd></div><div><dt>Payer</dt><dd>${inv ? userName(inv.user_id, dir) : "You"}</dd></div><div><dt>Date paid</dt><dd>${fmtDateTime(p.paid_at)}</dd></div><div><dt>Invoice</dt><dd class="mono">${inv ? invNo(inv) : p.invoice_id.slice(0, 8)}</dd></div>${inv ? html`<div style="grid-column:1/-1"><dt>Description</dt><dd>${inv.description}</dd></div>` : ""}</dl>
      <footer class="t-xs muted" style="border-top:1px dashed #cbd5e1;padding-top:12px">Issued electronically by CAPQA. Verify at the CAPQA office with the receipt number.</footer></div></article></div>`);
}

export const paymentRoutes: Route[] = [
  { path: "/payments", title: "Payment history", roles: [...PAY_ROLES], render: history },
  { path: "/payments/invoices", title: "Invoices", roles: [...PAY_ROLES], render: invoiceList },
  { path: "/payments/invoices/new", title: "Generate invoice", roles: [...MANAGE], render: invoiceNew },
  { path: "/payments/invoices/:id", title: "Invoice", roles: [...PAY_ROLES], render: invoiceDetail },
  { path: "/payments/start", title: "Pay invoice", roles: [...PAY_ROLES], render: payStart },
  { path: "/payments/checkout/:id", title: "Checkout", roles: [...PAY_ROLES], bare: true, render: checkout },
  { path: "/payments/result/:id/:outcome", title: "Payment result", roles: [...PAY_ROLES], render: result },
  { path: "/payments/receipt/:id", title: "Receipt", roles: [...PAY_ROLES], render: receipt },
];
