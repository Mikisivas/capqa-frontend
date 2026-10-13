import { users } from "./services";
import type { User } from "./types";
import { getUser } from "../session";

/**
 * The API only lets Admins list users, but every role sees user ids (assignee, recorder, approver).
 * Admins get a name directory; everyone else gets "You" or a short id.
 */
let cache: Map<string, User> | null = null;
let loading: Promise<Map<string, User>> | null = null;

export function loadDirectory(): Promise<Map<string, User>> {
  if (cache) return Promise.resolve(cache);
  loading ??= (async () => {
    const map = new Map<string, User>(); const me = getUser();
    if (me) map.set(me.id, me);
    if (me?.role === "ADMIN") {
      try { for (let offset = 0; offset < 500; offset += 100) { const p = await users.list({ offset, limit: 100 }); p.items.forEach((u) => map.set(u.id, u)); if (offset + 100 >= p.total) break; } }
      catch { /* directory is best effort */ }
    }
    cache = map; return map;
  })();
  return loading;
}
export const resetDirectory = () => { cache = null; loading = null; };
export const canListUsers = () => getUser()?.role === "ADMIN";

export function userName(id: string | null | undefined, dir: Map<string, User>): string {
  if (!id) return "Unassigned";
  const u = dir.get(id); if (u) return id === getUser()?.id ? `${u.full_name} (you)` : u.full_name;
  return `Staff ${id.slice(0, 8)}`;
}
export const activeUsers = (dir: Map<string, User>) => [...dir.values()].filter((u) => u.account_status === "ACTIVE").sort((a, b) => a.full_name.localeCompare(b.full_name));

import { academic } from "./services";
import type { Department, Classroom } from "./types";
let depts: Department[] | null = null;
/** Departments list is limited to Admin/Director/Academic Officer; other roles get an empty list. */
export async function loadDepartments(): Promise<Department[]> {
  if (depts) return depts;
  try { depts = await academic.departments(); } catch { depts = []; }
  return depts;
}
export const resetDepartments = () => { depts = null; };
export const deptName = (id: number | null | undefined, list: Department[]) => (id == null ? "No department" : list.find((d) => d.id === id)?.name ?? `Department ${id}`);

import { facilities } from "./services";
let rooms: Classroom[] | null = null;
export async function loadClassrooms(force = false): Promise<Classroom[]> {
  if (!rooms || force) rooms = await facilities.classrooms();
  return rooms;
}
export const hallName = (id: number, list: Classroom[]) => list.find((h) => h.id === id)?.name ?? `Hall #${id}`;

// ---- staff registry: the API has no "list staff" endpoint, so remember staff seen in this browser ----
// TODO(backend): replace with GET /academic/staff.
import type { Staff } from "./types";
const STAFF_KEY = "capqa.staff.v1";
export function knownStaff(): Staff[] { try { return JSON.parse(localStorage.getItem(STAFF_KEY) ?? "[]") as Staff[]; } catch { return []; } }
export function rememberStaff(s: Staff): void {
  const all = knownStaff().filter((x) => x.id !== s.id); all.unshift(s);
  try { localStorage.setItem(STAFF_KEY, JSON.stringify(all.slice(0, 500))); } catch { /* ignore */ }
}
export const staffName = (id: string) => knownStaff().find((s) => s.id === id)?.full_name ?? `Staff ${id.slice(0, 8)}`;
export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ---- courses created in this browser (no "list courses" endpoint yet; TODO(backend): GET /academic/courses) ----
import type { Course } from "./types";
const COURSE_KEY = "capqa.courses.v1";
export function knownCourses(): Course[] { try { return JSON.parse(localStorage.getItem(COURSE_KEY) ?? "[]") as Course[]; } catch { return []; } }
export function rememberCourse(c: Course): void { const all = knownCourses().filter((x) => x.id !== c.id); all.unshift(c); try { localStorage.setItem(COURSE_KEY, JSON.stringify(all.slice(0, 500))); } catch { /* ignore */ } }
