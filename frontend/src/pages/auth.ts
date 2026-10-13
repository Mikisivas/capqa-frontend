import { ApiError } from "../api/client";
import { auth } from "../api/services";
import { R } from "../routes";
import type { Route } from "../router";
import { getUser, signIn } from "../session";
import { alert, bindForm, field, fieldError, formAlert, icon, needsApiBanner, pageHead, toast } from "../ui/components";
import { $, fmtDateTime, html, initials, label, mount, Safe } from "../ui/html";

const brandLink = (sub = true): Safe => html`<a href="${R.login}" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:#0f172a"><div class="logo-slot on-light" style="width:44px;height:44px;font-size:8px">RFMOAUM</div>
  <div class="brand"><span class="brand-hub">ALABATT-HUB</span><span class="brand-name">CAPQA</span>${sub ? html`<span class="t-xs muted">Rev. Fr. Moses Orshio Adasu University, Makurdi</span>` : ""}</div></a>`;
const centred = (inner: Safe, width: number, top = 48): Safe => html`<div style="min-height:100vh;background:#f8fafc;display:flex;flex-direction:column;align-items:center;padding:${top}px 16px 48px;gap:24px">${brandLink()}<main class="card" style="width:100%;max-width:${width}px">${inner}</main></div>`;

// Password rules from the design checklist (the backend itself only requires 6 to 128 characters).
const RULES: [string, (p: string) => boolean][] = [
  ["At least 8 characters", (p) => p.length >= 8], ["An uppercase and a lowercase letter", (p) => /[A-Z]/.test(p) && /[a-z]/.test(p)],
  ["A number", (p) => /\d/.test(p)], ["A symbol (e.g. ! @ # $)", (p) => /[^A-Za-z0-9]/.test(p)],
];
const passwordOk = (p: string) => p.length >= 8 && p.length <= 128 && RULES.every(([, ok]) => ok(p));
function bindPasswordMeter(form: HTMLFormElement, name: string): void {
  const input = form.elements.namedItem(name) as HTMLInputElement; const meter = $(".meter", form); const list = $(".pw-checklist", form); const text = $("[data-strength]", form);
  if (!input || !list) return;
  const draw = () => {
    const v = input.value; const passed = RULES.filter(([, ok]) => ok(v)).length;
    list.innerHTML = RULES.map(([t, ok]) => `<li class="${ok(v) ? "ok" : ""}">${icon(ok(v) ? "check-circle" : "minus", 16).value}${t}<span class="sr-only">${ok(v) ? " (met)" : " (not met)"}</span></li>`).join("");
    const lv = v ? Math.max(1, passed) : 0; if (meter) meter.className = `meter ${lv ? "lv" + lv : ""}`;
    if (text) text.textContent = !v ? "" : ["", "Weak", "Fair", "Good", "Strong"][lv] ?? "";
  };
  input.addEventListener("input", draw); draw();
}
const strengthBlock = html`<div class="meter" aria-hidden="true"><span></span><span></span><span></span><span></span></div><div class="row-between t-xs"><span class="muted">Strength</span><span class="strong" data-strength></span></div><ul class="pw-checklist" aria-live="polite"></ul>`;

function pwToggle(root: HTMLElement): void {
  $("#pw-toggle", root)?.addEventListener("click", (e) => {
    const i = $<HTMLInputElement>("#lg-pw", root)!; const show = i.type === "password"; i.type = show ? "text" : "password";
    const b = e.currentTarget as HTMLElement; b.setAttribute("aria-pressed", String(show)); b.setAttribute("aria-label", show ? "Hide password" : "Show password"); b.innerHTML = icon(show ? "eye-off" : "eye", 18).value;
  });
}

export const authRoutes: Route[] = [
  { path: "/login", title: "Sign in", public: true, bare: true, render({ root, query }) {
    mount(root, html`<div style="min-height:100vh;display:flex;background:#fff">
      <aside class="only-lg" style="flex:0 0 44%;background:#0f3d22;color:#d7f2df;flex-direction:column;justify-content:space-between;padding:48px">
        <div style="display:flex;align-items:center;gap:14px"><div class="logo-slot" style="width:56px;height:56px;font-size:10px">RFMOAUM</div><div class="brand"><span class="brand-hub" style="color:#fcd34d">ALABATT-HUB</span><span class="brand-name" style="color:#fff;font-size:22px">CAPQA</span><span style="font-size:13px;color:#b0e4c0;margin-top:4px">Rev. Fr. Moses Orshio Adasu University, Makurdi</span></div></div>
        <div style="display:flex;flex-direction:column;gap:16px;max-width:460px"><h1 style="margin:0;font-size:32px;line-height:40px;font-weight:600;color:#fff">Centre for Academic Planning and Quality Assurance</h1>
          <p style="margin:0;font-size:16px;line-height:26px">Digital mail, hall allocation, exam hall audits, staff evaluation and accreditation, in one place.</p></div>
        <div style="font-size:12px;color:#7dce98">ALABATT-HUB · the university digital hub</div></aside>
      <main style="flex:1 1 auto;display:flex;align-items:center;justify-content:center;padding:32px 20px"><div style="width:100%;max-width:400px;display:flex;flex-direction:column;gap:24px">
        <div class="lt-lg" style="align-items:center;gap:12px"><div class="logo-slot on-light" style="width:44px;height:44px;font-size:8px">RFMOAUM</div><div class="brand"><span class="brand-hub">ALABATT-HUB</span><span class="brand-name">CAPQA</span><span class="t-xs muted">Rev. Fr. Moses Orshio Adasu University</span></div></div>
        <div><h2 class="h1">Sign in</h2><p class="muted" style="margin-top:4px">Use your CAPQA username or university email.</p></div>
        ${query.get("registered") ? alert("success", "Account created", "An administrator needs to approve it before you can sign in.", "check-circle") : ""}
        <div id="login-alert"></div>
        <form class="stack" id="f" novalidate>
          <div class="field"><label class="label" for="lg-user">Username or email</label><input id="lg-user" name="username" class="input" autocomplete="username" required placeholder="e.g. n.okafor or n.okafor@moau.edu.ng"><div class="err" data-err="username" hidden></div></div>
          <div class="field"><div class="row-between"><label class="label" for="lg-pw">Password</label><a href="${R.forgot}" class="t-sm strong">Forgot password?</a></div>
            <div class="input-wrap has-trail"><span class="lead">${icon("lock", 18)}</span><input id="lg-pw" name="password" class="input" type="password" autocomplete="current-password" required><span class="trail"><button type="button" id="pw-toggle" class="btn btn-ghost btn-icon btn-sm" aria-label="Show password" aria-pressed="false">${icon("eye", 18)}</button></span></div><div class="err" data-err="password" hidden></div></div>
          <button type="submit" class="btn btn-primary btn-lg btn-block">Sign in</button></form>
        <p class="t-sm muted" style="text-align:center">New staff member? <a href="${R.register}" class="strong">Register</a>. An administrator approves new accounts.</p></div></main></div>`);
    pwToggle(root);
    const form = $<HTMLFormElement>("#f", root)!; const slot = $("#login-alert", root)!;
    bindForm(form, async (v, data) => {
      slot.innerHTML = "";
      try { await signIn(v.username!, String(data.get("password") ?? "")); location.hash = R.dashboard; }
      catch (err) {
        const e = err instanceof ApiError ? err : null;
        const locked = e?.status === 429 || /lock/i.test(e?.message ?? "");
        const pending = e?.status === 403;
        slot.innerHTML = (locked ? alert("warning", "Account temporarily locked", "Too many failed attempts. Try again later, or reset your password.", "lock")
          : pending ? alert("warning", "Account not active", e?.message || "Your account is waiting for administrator approval.", "clock")
          : e?.status === 0 ? alert("danger", "Cannot reach the server", e.message, "alert-circle")
          : alert("danger", "Incorrect username or password", "Check your details and try again.", "alert-circle")).value;
        const pw = form.elements.namedItem("password") as HTMLInputElement; pw.value = ""; pw.focus();
      }
    });
  } },

  { path: "/register", title: "Register", public: true, bare: true, render({ root }) {
    mount(root, centred(html`<div id="done" hidden class="card-body empty" role="status" style="padding:48px 28px"><span class="e-icon" style="background:#ecfdf3;color:#15703c">${icon("check-circle", 28)}</span>
        <h1 class="h2">Account created. Waiting for admin approval.</h1><p>An administrator will approve your account and assign your role. Until then you cannot sign in.</p>
        <a class="btn btn-secondary" href="${R.login}">${icon("arrow-left", 16)}Back to sign in</a></div>
      <div id="reg"><div class="card-head" style="display:block"><h1 class="h2">Create your CAPQA account</h1><p class="muted t-sm" style="margin-top:4px">An administrator assigns your role after approval. You don't choose it here.</p></div>
      <form class="card-body stack" id="f" novalidate>${formAlert()}
        ${field("full_name", "Full name", { required: true, attrs: 'autocomplete="name" minlength="2" maxlength="120"' })}
        ${field("username", "Username", { required: true, help: "3 to 50 characters: letters, numbers, . _ -", attrs: 'minlength="3" maxlength="50" autocomplete="username" pattern="[A-Za-z0-9_.\\-]+"' })}
        ${field("email", "Email", { type: "email", required: true, attrs: 'autocomplete="email"' })}
        ${field("password", "Password", { type: "password", required: true, attrs: 'autocomplete="new-password" maxlength="128"' })}${strengthBlock}
        <div class="action-bar" style="margin:8px 0 0;position:static;padding:0;border:0;box-shadow:none;background:none"><button type="submit" class="btn btn-primary btn-lg btn-block">Create account</button></div>
        <p class="t-sm muted" style="text-align:center">Already registered? <a href="${R.login}" class="strong">Sign in</a></p></form></div>`, 560, 32));
    const form = $<HTMLFormElement>("#f", root)!; bindPasswordMeter(form, "password");
    bindForm(form, async (v, data) => {
      const pw = String(data.get("password") ?? "");
      if (!passwordOk(pw)) { fieldError(form, "password", "Use at least 8 characters with upper and lower case letters, a number and a symbol."); return; }
      try { await auth.register({ full_name: v.full_name!, username: v.username!, email: v.email!, password: pw }); }
      catch (err) {
        if (err instanceof ApiError && err.status === 409) { fieldError(form, /email/i.test(err.message) ? "email" : "username", err.message); return; }
        throw err;
      }
      $("#reg", root)!.hidden = true; $("#done", root)!.hidden = false;
    });
  } },

  { path: "/forgot-password", title: "Forgot password", public: true, bare: true, render({ root }) {
    mount(root, centred(html`<div id="sent" hidden class="card-body empty" role="status" style="padding:40px 28px"><span class="e-icon" style="background:#effaf2;color:#166534">${icon("mail", 26)}</span>
        <h1 class="h2">Check your email</h1><p>If an account exists for <strong id="sent-email"></strong>, we have sent a link to reset your password. The link expires in 30 minutes.</p>
        <div id="dev-link"></div><a class="btn btn-secondary" href="${R.login}">${icon("arrow-left", 16)}Back to sign in</a></div>
      <form class="card-body stack" id="f" style="padding:28px" novalidate>${formAlert()}<div><h1 class="h2">Forgot your password?</h1><p class="muted t-sm" style="margin-top:4px">Enter the email on your CAPQA account and we'll send you a reset link.</p></div>
        ${field("email", "Email", { type: "email", required: true, attrs: 'autocomplete="email"' })}<button type="submit" class="btn btn-primary btn-lg btn-block">Send reset link</button>
        <a href="${R.login}" class="t-sm strong" style="text-align:center">Back to sign in</a></form>`, 440));
    const form = $<HTMLFormElement>("#f", root)!;
    bindForm(form, async (v) => {
      const res = await auth.requestReset(v.email!);
      form.hidden = true; $("#sent", root)!.hidden = false; $("#sent-email", root)!.textContent = v.email!;
      if (res.development_token) { // The backend returns the token in development only.
        const a = document.createElement("a"); a.className = "btn btn-primary"; a.href = `${R.reset}?token=${encodeURIComponent(res.development_token)}`; a.textContent = "Development mode: open the reset form"; $("#dev-link", root)!.appendChild(a);
      }
    });
  } },

  { path: "/reset-password", title: "Reset password", public: true, bare: true, render({ root, query }) {
    const token = query.get("token") ?? "";
    mount(root, centred(html`<div id="done" hidden class="card-body empty" role="status" style="padding:40px 28px"><span class="e-icon" style="background:#ecfdf3;color:#15703c">${icon("check-circle", 26)}</span>
        <h1 class="h2">Password updated</h1><p>You can now sign in with your new password.</p><a class="btn btn-primary" href="${R.login}">Sign in</a></div>
      <div id="expired" hidden class="card-body empty" role="alert" style="padding:40px 28px"><span class="e-icon bad">${icon("clock", 26)}</span><h1 class="h2">This link has expired or was already used</h1>
        <p>Reset links work once and expire after 30 minutes. Request a new one to continue.</p><a class="btn btn-primary" href="${R.forgot}">Request a new link</a><a class="t-sm strong" href="${R.login}">Back to sign in</a></div>
      <form class="card-body stack" id="f" style="padding:28px" novalidate>${formAlert()}<div><h1 class="h2">Set a new password</h1></div>
        ${token ? "" : field("token", "Reset token", { required: true, help: "Paste the token from your reset email." })}
        ${field("password", "New password", { type: "password", required: true, attrs: 'autocomplete="new-password" maxlength="128"' })}${strengthBlock}
        ${field("confirm", "Confirm new password", { type: "password", required: true, attrs: 'autocomplete="new-password"' })}
        <button type="submit" class="btn btn-primary btn-lg btn-block">Update password</button></form>`, 460));
    const form = $<HTMLFormElement>("#f", root)!; bindPasswordMeter(form, "password");
    bindForm(form, async (v, data) => {
      const pw = String(data.get("password") ?? ""); const conf = String(data.get("confirm") ?? "");
      if (!passwordOk(pw)) { fieldError(form, "password", "Use at least 8 characters with upper and lower case letters, a number and a symbol."); return; }
      if (pw !== conf) { fieldError(form, "confirm", "Passwords don't match."); return; }
      try { await auth.confirmReset(token || v.token!, pw); }
      catch (err) { if (err instanceof ApiError && (err.status === 400 || err.status === 401 || err.status === 404 || err.status === 422)) { form.hidden = true; $("#expired", root)!.hidden = false; return; } throw err; }
      form.hidden = true; $("#done", root)!.hidden = false;
    });
  } },

  { path: "/profile", title: "My profile", render({ root }) {
    const u = getUser()!;
    mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${pageHead("My profile", "Your account details as held by CAPQA.", html`<a class="btn btn-secondary" href="${R.editProfile}">${icon("edit", 16)}Edit profile</a>`)}
      <section class="card"><div class="card-body" style="display:flex;flex-wrap:wrap;gap:16px;align-items:center"><span class="avatar avatar-lg">${initials(u.full_name)}</span>
        <div style="flex:1 1 200px"><h2 class="h2">${u.full_name}</h2><p class="muted">${label(u.role)}${u.department_id ? ` · Department ${u.department_id}` : ""}</p></div><span class="badge" data-s="acct-${label(u.account_status)}">${label(u.account_status)}</span></div>
        <hr class="divider"><dl class="dl card-body" style="margin:0"><div><dt>Full name</dt><dd>${u.full_name}</dd></div><div><dt>Username</dt><dd class="mono">${u.username}</dd></div><div><dt>Email</dt><dd>${u.email}</dd></div>
          <div><dt>Role</dt><dd>${label(u.role)}</dd></div><div><dt>Department</dt><dd>${u.department_id ?? "Not set"}</dd></div><div><dt>Last login</dt><dd>${fmtDateTime(u.last_login_at)}</dd></div></dl></section>
      ${alert("info", "Role changes", "Your role is set by an administrator. Contact the CAPQA Admin office if it is wrong.")}</div>`);
  } },

  { path: "/profile/edit", title: "Edit profile", render({ root }) {
    const u = getUser()!;
    mount(root, html`<div class="page-narrow stack-lg" style="width:100%">${pageHead("Edit profile", "Update your name and department, or change your password.")}
      ${needsApiBanner("Editing your profile and changing your password while signed in has no backend endpoint yet. The forms below are ready but saving is disabled until it exists. Use Forgot password to reset a password for now.")}
      <form class="card" id="pf" novalidate><div class="card-head"><h2 class="h3">Profile details</h2></div><div class="card-body grid-form">
        <div class="span-2">${field("full_name", "Full name", { required: true, value: u.full_name })}</div>
        <div class="field"><label class="label">Username</label><input class="input" value="${u.username}" readonly><span class="help">Can't be changed</span></div>
        <div class="field"><label class="label">Email</label><input class="input" value="${u.email}" readonly><span class="help">Ask an admin to change your email</span></div></div>
        <div class="card-foot"><a class="btn btn-secondary" href="${R.profile}">Cancel</a><button type="submit" class="btn btn-primary">Save changes</button></div></form>
      <form class="card" id="pw" novalidate><div class="card-head"><h2 class="h3">Change password</h2></div><div class="card-body stack">
        ${field("current", "Current password", { type: "password", required: true, attrs: 'autocomplete="current-password"' })}
        <div class="grid-form">${field("password", "New password", { type: "password", required: true, attrs: 'autocomplete="new-password"' })}${field("confirm", "Confirm new password", { type: "password", required: true, attrs: 'autocomplete="new-password"' })}</div>${strengthBlock}</div>
        <div class="card-foot"><button type="submit" class="btn btn-primary">Update password</button></div></form></div>`);
    bindPasswordMeter($<HTMLFormElement>("#pw", root)!, "password");
    // TODO(backend): PATCH /auth/me and POST /auth/change-password once they exist.
    for (const id of ["#pf", "#pw"]) bindForm($<HTMLFormElement>(id, root)!, async () => { toast("error", "Not available yet", "The backend does not support this change yet."); });
  } },
];
