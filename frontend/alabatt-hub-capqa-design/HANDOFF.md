# ALABATT-HUB CAPQA frontend — design handoff for Claude Code

This folder is the complete UI design for **ALABATT-HUB CAPQA** — the Centre for Academic Planning and Quality Assurance web app, part of the ALABATT-HUB university digital hub (Rev. Fr. Moses Orshio Adasu University, Makurdi).
Build it as **HTML + Tailwind CSS + TypeScript** pages that call the existing **FastAPI** backend.

## Product name and brand lockup

- Site name: **ALABATT-HUB CAPQA**. Browser titles: `<Page> · ALABATT-HUB CAPQA`.
- Lockup (see `Sidebar.dc.html`, `Login.dc.html`): logo slot ("RFMOAUM" placeholder) + two lines — `ALABATT-HUB` (small, uppercase, gold, `.brand-hub`) above `CAPQA` (bold, `.brand-name`). On the dark sidebar the gold is `gold-300`; on light backgrounds `gold-700`.
- Breadcrumb root reads "ALABATT-HUB CAPQA"; the phone top bar shows "ALABATT-HUB CAPQA" above the page title.

## Screenshots — look at these first

`screenshots/desktop/<Screen>.jpg` (1440 px) and `screenshots/phone/<Screen>.jpg` (390 px) show every screen as it should look. Match them. When a screenshot and a `.dc.html` file disagree, the `.dc.html` markup + `capqa.css` win.

## What's in `design/`

| File | What it is |
|---|---|
| `capqa.css` | **Source of truth for the look.** All tokens (CSS variables) and component classes. Map tokens to `tailwind.config.js` and rebuild each class with `@apply` in `@layer components`. |
| `Main.dc.html` | Screen index: every screen, its module, and its `BACKEND READY` / `NEEDS API` tag. |
| `DesignSystem.dc.html` | Tokens, type scale, buttons/inputs in every state, badges, table, list states, toasts, modals, drawer, and a ready `tailwind.config.js`. |
| `Sidebar.dc.html`, `Topbar.dc.html` | App shell. Sidebar items are filtered by role (see the `G` array in its script). |
| `ListState.dc.html` | Shared loading skeleton / empty / error block used by every list. |
| `Icon.dc.html` | Every icon as an SVG path string (24×24, stroke 2). Turn it into an `icon(name)` helper. |
| `<Screen>.dc.html` | One file per screen (desktop design; the page is responsive). |
| `<Screen>-m.dc.html`, `-t.dc.html` | Mobile (390) / tablet (768) frames. They only wrap the main screen — **ignore them when building**; one responsive page per screen. |
| `canvas.json` | Canvas layout only. Ignore. |

## How to read a `.dc.html` file

These are prototype files for the design canvas, not production code:

- Take the **markup structure and class names** (`btn btn-primary`, `card`, `field`, `badge`, `table table-stack`…). They are the spec.
- `{{name}}` holes, `<sc-for list="…">` (loop) and `<sc-if value="…">` (conditional) are template syntax. Replace them with real TypeScript rendering from API data.
- The `<script type="text/x-dc">` block at the bottom holds **sample data** (Nigerian names, NGN amounts, session 2025/2026) and simple UI state. Use it as fixtures/mock data; replace it with API calls.
- `data-props` → `view` options (`default | loading | empty | error | invalid | saving`) list the states each screen must support.
- `<dc-import name="X">` means "render component X here" (Sidebar, Topbar, Icon, ListState).
- Ignore `support.js`, `<x-dc>` and `<helmet>`.

## Key conventions

- **Status badges:** `<span class="badge" data-s="mail-Approved">Approved</span>`. The prefix picks the group (`mail-`, `pri-`, `hall-`, `pur-`, `aud-`, `acc-`, `inv-`, `pay-`, `life-`, `acct-`, `src-`, `ntf-`). The CSS adds colour and a glyph, so status never relies on colour alone.
- **Responsive tables:** `table.table-stack` + `data-label` on each `<td>` → rows become cards under 768px.
- **Forms:** end with `.action-bar` (sticky bottom bar on mobile, right-aligned buttons from md).
- **Visibility helpers:** `.only-md`, `.only-lg`, `.lt-md`, `.lt-lg` → Tailwind `hidden md:flex`, `lg:hidden`, etc.
- **Breakpoints:** Tailwind defaults. The sidebar shows from `lg` (1024); below that the hamburger opens it as a drawer.
- **Font:** IBM Plex Sans + IBM Plex Mono (Google Fonts).

## Roles (sidebar visibility)

| Role | Hidden modules |
|---|---|
| Admin | none |
| Director | Administration |
| Academic Officer | Exam Hall Audit, Staff Evaluation |
| Quality Inspector | E-Dispatch, Payments |
| Viewer | My tasks, Audit, Evaluation, Payments, Administration; read-only, no action buttons |

Show `Error403.dc.html` when a role opens a page it can't access.

## Suggested build order

1. Tailwind config + `components.css` from `capqa.css`; icon helper.
2. App shell (sidebar, top bar, bell dropdown, user menu, toasts, session-timeout modal) and the auth pages.
3. Shared pieces: data table + pagination, filter bar, list states, modal, drawer, star rating, file uploader.
4. Modules in this order: Dashboard → E-Dispatch → Halls → Audit → Evaluation → Departments → Reports → Payments → Notifications → Admin.
5. For `NEEDS API` screens, build the page with mock data behind a clearly named service function, so the endpoint can be wired up later.
