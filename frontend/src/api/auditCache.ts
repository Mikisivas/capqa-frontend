import type { ExamHallAudit } from "./types";

/**
 * The API can create and finalise audits but cannot list or fetch them yet.
 * Until it can, audits this browser created are remembered locally so the list,
 * detail and history screens have something real to show.
 * TODO(backend): replace with GET /facilities/audits and GET /facilities/audits/{id}.
 */
const KEY = "capqa.audits.v1";
export function cachedAudits(): ExamHallAudit[] { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as ExamHallAudit[]; } catch { return []; } }
export function rememberAudit(a: ExamHallAudit): void {
  const all = cachedAudits().filter((x) => x.id !== a.id); all.unshift(a);
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(0, 200))); } catch { /* storage full or blocked */ }
}
export const findAudit = (id: string) => cachedAudits().find((a) => a.id === id);
export const auditNumber = (a: ExamHallAudit) => `AUD-${new Date(a.created_at).getFullYear()}-${a.id.slice(0, 4).toUpperCase()}`;
export const average = (a: ExamHallAudit) => Math.round(((a.ventilation + a.lighting + a.seating + a.audio_system + a.cleanliness) / 5) * 10) / 10;
