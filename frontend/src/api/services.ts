import { downloadFile, get, patch, post, put, request, tokens } from "./client";
import type * as T from "./types";

export const auth = {
  async login(username: string, password: string): Promise<T.TokenPair> {
    const form = new URLSearchParams({ username, password });
    const pair = await request<T.TokenPair>("/auth/login", { method: "POST", form, auth: false });
    tokens.set(pair); return pair;
  },
  register: (body: { full_name: string; username: string; email: string; password: string; department_id?: number }) =>
    request<T.User>("/auth/register", { method: "POST", json: body, auth: false }),
  me: () => get<T.User>("/auth/me"),
  async logout(): Promise<void> {
    const refresh = tokens.refresh;
    try { if (refresh) await post("/auth/logout", { refresh_token: refresh }); } catch { /* already invalid */ }
    tokens.clear();
  },
  requestReset: (email: string) => request<T.PasswordResetRequested>("/auth/password-reset/request", { method: "POST", json: { email }, auth: false }),
  confirmReset: (token: string, new_password: string) => request<T.Message>("/auth/password-reset/confirm", { method: "POST", json: { token, new_password }, auth: false }),
};

export const users = {
  list: (q: { account_status?: string; offset?: number; limit?: number }) => get<T.Page<T.User>>("/users", q),
  update: (id: string, body: { role?: string; account_status?: string; department_id?: number }) => patch<T.User>(`/users/${id}`, body),
  /** Active users only, minimal fields; open to every signed-in role. */
  directory: (q: { search?: string; role?: string; limit?: number } = {}) => get<T.DirectoryEntry[]>("/users/directory", { limit: 100, ...q }),
};

export const dashboard = { get: (session_name?: string) => get<T.Dashboard>("/dashboard", { session_name }) };

export const dispatch = {
  list: (q: { query?: string; tracking_status?: string; sort_field?: string; sort_direction?: string; offset?: number; limit?: number }) => get<T.Page<T.Dispatch>>("/dispatch", q),
  get: (id: string) => get<T.Dispatch>(`/dispatch/${id}`),
  create: (body: { reference_number: string; sender: string; subject: string; date_received: string; priority: string; assigned_to?: string }) => post<T.Dispatch>("/dispatch", body),
  update: (id: string, body: Record<string, unknown>) => patch<T.Dispatch>(`/dispatch/${id}`, body),
  decide: (id: string, decision: "APPROVED" | "REJECTED", rejection_reason?: string) => post<T.Dispatch>(`/dispatch/${id}/approval`, { decision, rejection_reason }),
  attachments: (id: string) => get<T.Attachment[]>(`/dispatch/${id}/attachments`),
  attachmentBlob: async (id: string, attachmentId: string): Promise<Blob> => (await request<Response>(`/dispatch/${id}/attachments/${attachmentId}/download`, { raw: true })).blob(),
  upload: (id: string, file: File) => { const form = new FormData(); form.append("document", file); return request<T.Attachment>(`/dispatch/${id}/attachments`, { method: "POST", form }); },
};

export const facilities = {
  classrooms: () => get<T.Classroom[]>("/facilities/classrooms"),
  createClassroom: (body: { name: string; building?: string; department_id?: number; capacity: number }) => post<T.Classroom>("/facilities/classrooms", body),
  allocations: (q: { department_id?: number; level?: number; starts_after?: string; ends_before?: string }) => get<T.Allocation[]>("/facilities/allocations", q),
  allocate: (body: Record<string, unknown>) => post<T.Allocation>("/facilities/allocations", body),
  suggestions: (q: { student_count: number; start_time: string; end_time: string; department_id?: number }) => get<T.HallSuggestion[]>("/facilities/suggestions", q),
  createAudit: (body: Record<string, unknown>) => post<T.ExamHallAudit>("/facilities/audits", body),
  finaliseAudit: (id: string) => post<T.ExamHallAudit>(`/facilities/audits/${id}/finalise`),
  audits: (q: { classroom_id?: number; inspector_id?: string; result_status?: string; lifecycle_status?: string; offset?: number; limit?: number }) => get<T.Page<T.ExamHallAudit>>("/facilities/audits", q),
  audit: (id: string) => get<T.ExamHallAudit>(`/facilities/audits/${id}`),
};

export const academic = {
  departments: () => get<T.Department[]>("/academic/departments"),
  createDepartment: (body: { name: string; faculty: string }) => post<T.Department>("/academic/departments", body),
  createStaff: (body: { department_id: number; full_name: string; staff_rank?: string; user_id?: string }) => post<T.Staff>("/academic/staff", body),
  staffList: (q: { search?: string; department_id?: number; is_active?: boolean; offset?: number; limit?: number }) => get<T.Page<T.Staff>>("/academic/staff", q),
  staff: (id: string) => get<T.Staff>(`/academic/staff/${id}`),
  updateStaff: (id: string, body: Record<string, unknown>) => patch<T.Staff>(`/academic/staff/${id}`, body),
  deactivateStaff: (id: string) => request<void>(`/academic/staff/${id}`, { method: "DELETE" }),
  courses: (q: { search?: string; department_id?: number; level?: number; accreditation_status?: string; offset?: number; limit?: number }) => get<T.Page<T.Course>>("/academic/courses", q),
  course: (id: number | string) => get<T.Course>(`/academic/courses/${id}`),
  updateCourse: (id: number | string, body: Record<string, unknown>) => patch<T.Course>(`/academic/courses/${id}`, body),
  deleteCourse: (id: number | string) => request<void>(`/academic/courses/${id}`, { method: "DELETE" }),
  createCourse: (body: Record<string, unknown>) => post<T.Course>("/academic/courses", body),
  upsertStats: (departmentId: number, body: Record<string, unknown>) => put<T.DepartmentStats>(`/academic/departments/${departmentId}/stats`, body),
  createBenchmark: (body: Record<string, unknown>) => post<T.Benchmark>("/academic/benchmarks", body),
  createQualityScore: (body: Record<string, unknown>) => post<T.QualityScore>("/academic/quality-scores", body),
  compliance: (departmentId: number, session: string) => get<T.DepartmentCompliance>(`/academic/departments/${departmentId}/compliance/${encodeURIComponent(session)}`),
};

export const evaluations = {
  create: (body: Record<string, unknown>) => post<T.StaffEvaluation>("/evaluations", body),
  forStaff: (staffId: string) => get<T.StaffEvaluation[]>(`/evaluations/staff/${staffId}`),
  trends: (staffId: string) => get<T.EvaluationTrend[]>(`/evaluations/staff/${staffId}/trends`),
};

export const payments = {
  createInvoice: (body: { user_id: string; description: string; amount: string; currency: string }) => post<T.Invoice>("/payments/invoices", body),
  initiate: (invoiceId: string) => post<T.Payment>(`/payments/invoices/${invoiceId}/initiate`),
  verify: (paymentId: string, provider_reference: string, result: "SUCCESSFUL" | "FAILED") => post<T.PaymentVerification>(`/payments/${paymentId}/verify-test`, { provider_reference, result }),
  history: () => get<T.Payment[]>("/payments/history"),
  invoices: (q: { invoice_status?: string; offset?: number; limit?: number }) => get<T.Page<T.Invoice>>("/payments/invoices", q),
  invoice: (id: string) => get<T.Invoice>(`/payments/invoices/${id}`),
  receipts: (q: { offset?: number; limit?: number }) => get<T.Page<T.Receipt>>("/payments/receipts", q),
  receipt: (id: string) => get<T.Receipt>(`/payments/receipts/${id}`),
  paymentReceipt: (paymentId: string) => get<T.Receipt>(`/payments/${paymentId}/receipt`),
};

export const reports = {
  list: () => get<T.Report[]>("/reports"),
  generate: (body: Record<string, unknown>) => post<T.Report>("/reports", body),
  finalise: (id: string) => post<T.Report>(`/reports/${id}/finalise`),
  download: (id: string, name: string) => downloadFile(`/reports/${id}/download`, name),
};

export const notifications = {
  list: (q: { unread_only?: boolean; offset?: number; limit?: number }) => get<T.Page<T.Notification>>("/notifications", q),
  markRead: (id: string) => patch<T.Message>(`/notifications/${id}/read`, {}),
  create: (body: { user_id: string; notification_type: string; message: string; link?: string }) => post<T.Notification>("/notifications", body),
};

export const auditLogs = {
  list: (q: { user_id?: string; resource_type?: string; offset?: number; limit?: number }) => get<T.Page<T.AuditLog>>("/audit-logs", q),
  get: (id: number | string) => get<T.AuditLog>(`/audit-logs/${id}`),
};
