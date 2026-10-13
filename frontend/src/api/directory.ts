import { academic, facilities, users } from "./services";
import type { Classroom, Course, Department, RoleCode, Staff } from "./types";
import { getUser } from "../session";

/** A person the app can name: from GET /users/directory (all roles) or, for Admins, GET /users. */
export interface Person { id: string; full_name: string; role: RoleCode; username?: string; email?: string; department_name?: string | null; account_status?: string }

let cache: Map<string, Person> | null = null;
let loading: Promise<Map<string, Person>> | null = null;

export function loadDirectory(): Promise<Map<string, Person>> {
  if (cache) return Promise.resolve(cache);
  loading ??= (async () => {
    const map = new Map<string, Person>(); const me = getUser();
    if (me) map.set(me.id, me);
    try { (await users.directory()).forEach((u) => map.set(u.id, u)); } catch { /* names are best effort */ }
    // Admins can also see pending and disabled accounts, which the directory leaves out.
    if (me?.role === "ADMIN") {
      try { for (let offset = 0; offset < 500; offset += 100) { const p = await users.list({ offset, limit: 100 }); p.items.forEach((u) => map.set(u.id, { ...map.get(u.id), ...u })); if (offset + 100 >= p.total) break; } }
      catch { /* best effort */ }
    }
    cache = map; return map;
  })();
  return loading;
}
export const resetDirectory = () => { cache = null; loading = null; };
/** Every signed-in role can pick people now that /users/directory exists. */
export const canListUsers = () => !!getUser();

export function userName(id: string | null | undefined, dir: Map<string, Person>): string {
  if (!id) return "Unassigned";
  const u = dir.get(id); if (u) return id === getUser()?.id ? `${u.full_name} (you)` : u.full_name;
  return `Staff ${id.slice(0, 8)}`;
}
export const activeUsers = (dir: Map<string, Person>) => [...dir.values()].filter((u) => !u.account_status || u.account_status === "ACTIVE").sort((a, b) => a.full_name.localeCompare(b.full_name));

let depts: Department[] | null = null;
/** Departments list is limited to Admin/Director/Academic Officer; other roles get an empty list. */
export async function loadDepartments(): Promise<Department[]> {
  if (depts) return depts;
  try { depts = await academic.departments(); } catch { depts = []; }
  return depts;
}
export const resetDepartments = () => { depts = null; };
export const deptName = (id: number | null | undefined, list: Department[]) => (id == null ? "No department" : list.find((d) => d.id === id)?.name ?? `Department ${id}`);

let rooms: Classroom[] | null = null;
export async function loadClassrooms(force = false): Promise<Classroom[]> {
  if (!rooms || force) rooms = await facilities.classrooms();
  return rooms;
}
export const hallName = (id: number, list: Classroom[]) => list.find((h) => h.id === id)?.name ?? `Hall #${id}`;

// ---- staff and courses: cached copies of GET /academic/staff and GET /academic/courses (first 100 each) ----
let staffCache: Staff[] = [];
let staffLoaded = false;
export async function loadStaff(force = false): Promise<Staff[]> {
  if (staffLoaded && !force) return staffCache;
  try { staffCache = (await academic.staffList({ limit: 100 })).items; staffLoaded = true; } catch { staffCache = []; }
  return staffCache;
}
export const knownStaff = (): Staff[] => staffCache;
export function rememberStaff(s: Staff): void { staffCache = [s, ...staffCache.filter((x) => x.id !== s.id)]; }
/** Make sure one staff member's name is known, fetching it when it is outside the cached first page. */
export async function ensureStaff(id: string): Promise<void> {
  await loadStaff(); if (staffCache.some((s) => s.id === id)) return;
  try { rememberStaff(await academic.staff(id)); } catch { /* the fallback name is used */ }
}
export const staffName = (id: string) => staffCache.find((s) => s.id === id)?.full_name ?? `Staff ${id.slice(0, 8)}`;
export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

let courseCache: Course[] = [];
let coursesLoaded = false;
export async function loadCourses(force = false): Promise<Course[]> {
  if (coursesLoaded && !force) return courseCache;
  try { courseCache = (await academic.courses({ limit: 100 })).items; coursesLoaded = true; } catch { courseCache = []; }
  return courseCache;
}
export const knownCourses = (): Course[] => courseCache;
export function rememberCourse(c: Course): void { courseCache = [c, ...courseCache.filter((x) => x.id !== c.id)]; }
export const courseLabel = (id: number | null | undefined) => { if (id == null) return ""; const c = courseCache.find((x) => x.id === id); return c ? `${c.code} ${c.title}` : `Course #${id}`; };
