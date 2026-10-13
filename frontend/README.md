# ALABATT-HUB CAPQA frontend

Web app for the Centre for Academic Planning and Quality Assurance (CAPQA), part of ALABATT-HUB at
Rev. Fr. Moses Orshio Adasu University, Makurdi. Plain TypeScript, Tailwind CSS and Vite. It calls the
FastAPI backend (`CAPQA-system-backend`) and implements the design in `alabatt-hub-capqa-design/`.

## Run it

```bash
cd frontend
npm install
cp .env.example .env        # set VITE_API_BASE_URL if the API is not on http://127.0.0.1:8000/api/v1
npm run dev                 # http://localhost:3000 (the backend allows this origin by default)
```

Start the backend first (`start.bat` in the backend repo). The first Admin comes from the backend's
`BOOTSTRAP_ADMIN_*` values in its `.env`.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with live reload on port 3000 |
| `npm run build` | Type-check, then build static files into `dist/` (host `dist/` on any web server) |
| `npm run typecheck` | TypeScript only |

## How it is organised

```
src/
  main.ts            router wiring, live-event toasts
  routes.ts          every hash route in one table
  router.ts          tiny hash router with role checks and 403/404 pages
  shell.ts           sidebar, top bar, notification bell, user menu
  session.ts         sign-in state, WebSocket live updates, 15-minute inactivity logout
  api/               typed client (token refresh), response types, one service per backend module
  ui/                html template tag (auto-escapes), components, icons
  pages/             one file per module
  styles/capqa.css   design tokens and component classes, copied from the design handoff
```

The brand colour is a single ramp: edit `--brand-*` in `src/styles/capqa.css` and `colors.brand` in
`tailwind.config.js`.

## Screens that wait for the backend

Invoices, receipts, audits, staff, courses, the user directory, mail attachments and audit-log
entries now come from the API. The screens below are still built but marked with a
"backend endpoint pending" banner. The missing endpoints, in the order that matters most:

1. Mail comments, due date, description, archive and delete.
2. Edit profile, change password, create user, get one user.
3. Edit or delete a department; a departments list for roles other than Admin, Director and Academic Officer.
4. Notification delete, mark-all-read and preferences; a tasks endpoint.
5. Hall edit and delete, hall type and equipment, edit or cancel an allocation.
6. In-page report preview; a receipt PDF.
7. A payment-history view for managers (today `/payments/history` returns only the caller's own payments).

Backend fix still open: `PATCH /dispatch/{id}` accepts `tracking_status: APPROVED/REJECTED`, which
skips the Director's approval and digital stamp. The UI only approves through `POST /dispatch/{id}/approval`.

## Backend features the design did not show

These exist in the API but had no screen in the design, so they were added afterwards:
the dashboard session filter, live refresh of mail, payment and dashboard pages from WebSocket events,
sending a notification (`POST /notifications`), and linking a staff record to a user account.

## Other notes for the team

- The backend allows only `http://localhost:3000` in CORS by default. Add the deployed origin to
  `allowed_origins` in the backend `.env` before deploying.
- Department names are only listable by Admin, Director and Academic Officer, so other roles see
  department IDs. People are named for every role through `/users/directory`.
- Registration has no department picker because the departments list needs a signed-in role.
- Password rules in the UI follow the design (8+ characters, mixed case, number, symbol). The backend
  itself only requires 6 to 128 characters.
- The sidebar follows the design's role table. The server decides what each role can actually call, and
  a few rules differ (for example staff evaluations are open to Admin, Director and Academic Officer on
  the server but shown to Admin, Director and Quality Inspector in the design).
