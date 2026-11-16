import type {
  AuthUser,
  ClassroomStatePayload,
  ConductSession,
  DutySchedule,
  PostCategory,
  StudentRecord,
  TeamName,
  UserRole,
} from '../types/classroom';
import type {
  ImportedStudentInput,
  StudentCredentialExportItem,
} from '../utils/classroomLogic';

const TOKEN_KEY = 'lophocso_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Lỗi kết nối (${res.status})`);
  }
  return data as T;
}

export const classroomApi = {
  fetchPublicOverview: () => apiRequest<ClassroomStatePayload>('/api/public/overview'),
  fetchState: () => apiRequest<ClassroomStatePayload>('/api/classroom/state'),
  getMe: () => apiRequest<{ user: AuthUser }>('/api/auth/me'),

  login: (identifier: string, password: string) =>
    apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),

  googleLogin: (payload: { uid: string; email: string; displayName: string }) =>
    apiRequest<{ token: string; user: AuthUser }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  dismissPasswordPrompt: () =>
    apiRequest<{ ok: boolean; user: AuthUser }>('/api/auth/dismiss-password-prompt', {
      method: 'POST',
    }),

  changePassword: (payload: {
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) =>
    apiRequest<{ ok: boolean; user: AuthUser }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  changeEmail: (payload: { newEmail: string; currentPassword: string }) =>
    apiRequest<{ ok: boolean; user: AuthUser }>('/api/auth/change-email', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  fetchStudentCredentials: () =>
    apiRequest<{ credentials: StudentCredentialExportItem[] }>('/api/students/credentials'),

  updateClassSettings: (classroomName: string, schoolYear: string) =>
    apiRequest<{ classroomName: string; schoolYear: string }>('/api/classroom/settings', {
      method: 'POST',
      body: JSON.stringify({ classroomName, schoolYear }),
    }),

  createStudent: (payload: {
    studentCode: string;
    fullName: string;
    schoolEmail: string;
    birthYear: number;
    team: TeamName;
    role: Exclude<UserRole, 'teacher' | 'guest'>;
    password: string;
    parentPhone?: string;
  }) =>
    apiRequest<{ student: StudentRecord }>('/api/students', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateStudent: (
    id: string,
    payload: Partial<StudentRecord> & { newPassword?: string }
  ) =>
    apiRequest<{ student: StudentRecord }>(`/api/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteStudent: (id: string) =>
    apiRequest<{ ok: boolean }>(`/api/students/${id}`, { method: 'DELETE' }),

  importStudents: (students: ImportedStudentInput[]) =>
    apiRequest<{ importedCount: number; skippedCount: number }>('/api/students/import', {
      method: 'POST',
      body: JSON.stringify({ students }),
    }),

  updateSeatingAndRole: (payload: {
    studentId: string;
    seatRow?: number;
    seatCol?: number;
    team?: TeamName;
    role?: Exclude<UserRole, 'teacher' | 'guest'>;
  }) =>
    apiRequest<{ student: StudentRecord }>('/api/students/seating', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  saveBulkAttendance: (
    date: string,
    entries: { studentId: string; status: string; reason?: string }[]
  ) =>
    apiRequest<{ ok: boolean }>('/api/attendance/bulk', {
      method: 'POST',
      body: JSON.stringify({ date, entries }),
    }),

  createPointRule: (label: string, points: number) =>
    apiRequest('/api/point-rules', {
      method: 'POST',
      body: JSON.stringify({ label, points }),
    }),

  deletePointRule: (id: string) =>
    apiRequest(`/api/point-rules/${id}`, { method: 'DELETE' }),

  addConductLog: (payload: {
    date: string;
    session: ConductSession;
    studentId: string;
    category: string;
    points: number;
    note?: string;
  }) =>
    apiRequest('/api/conduct', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteConductLog: (id: string) =>
    apiRequest(`/api/conduct/${id}`, { method: 'DELETE' }),

  createDuty: (payload: {
    date: string;
    assignedTeam: DutySchedule['assignedTeam'];
    task: string;
    status?: DutySchedule['status'];
    note?: string;
  }) =>
    apiRequest('/api/duty', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateDuty: (id: string, payload: Partial<DutySchedule>) =>
    apiRequest(`/api/duty/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteDuty: (id: string) =>
    apiRequest(`/api/duty/${id}`, { method: 'DELETE' }),

  createPost: (payload: { title: string; content: string; category: PostCategory }) =>
    apiRequest('/api/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deletePost: (id: string) =>
    apiRequest(`/api/posts/${id}`, { method: 'DELETE' }),

  markNotificationsRead: (id?: string) =>
    apiRequest('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),

  sendChatMessage: (payload: {
    message: string;
    history: { sender: string; text: string }[];
    currentDate: string;
  }) =>
    apiRequest<{
      reply: string;
      actionPerformed?: string;
      denied?: boolean;
      updated?: boolean;
    }>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  analyzeStudentAI: (payload: { studentId?: string; question: string }) =>
    apiRequest<{ analysis: string; studentName?: string }>('/api/ai/analyze-student', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
