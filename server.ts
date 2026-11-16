import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import type {
  AppNotification,
  AttendanceRecord,
  AttendanceStatus,
  AuthUser,
  ClassPost,
  ConductLog,
  ConductSession,
  DutySchedule,
  PointRule,
  StudentPublicView,
  StudentRecord,
  TeamName,
  UserRole,
} from './src/types/classroom';
import {
  buildStudentDiagnosticContext,
  canCreateAnnouncements,
  canEditConductPoints,
  canManageDutySchedule,
  canManagePointRules,
  canManageStudents,
  canTakeAttendance,
  canUseChatbotDispatch,
  getTodayISO,
  hasPermission,
  ROLE_LABELS,
  validateEmailFormat,
  type StudentCredentialExportItem,
} from './src/utils/classroomLogic';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'classroom_db.json');
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(process.env.GEMINI_API_KEY || 'lophocso-local-secret-2026').digest('hex');

interface StoredUserCredential {
  id: string;
  email: string;
  studentCode?: string;
  fullName: string;
  role: Exclude<UserRole, 'guest'>;
  team: TeamName | '';
  passwordSalt: string;
  passwordHash: string;
  provisionedPassword?: string;
  hasChangedPassword?: boolean;
  mustPromptPasswordChange: boolean;
}

interface ClassroomDatabase {
  classroomName: string;
  schoolYear: string;
  users: StoredUserCredential[];
  students: StudentRecord[];
  attendance: AttendanceRecord[];
  conductLogs: ConductLog[];
  pointRules: PointRule[];
  dutySchedules: DutySchedule[];
  posts: ClassPost[];
  notifications: AppNotification[];
}

function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { salt: actualSalt, hash: derived };
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createInitialDatabase(): ClassroomDatabase {
  const teacherPw = hashPassword('123456');
  return {
    classroomName: 'Lớp Học Trực Tuyến',
    schoolYear: '2026 - 2027',
    users: [
      {
        id: 'teacher_thuy',
        email: 'nguyenthithuy@gmail.com',
        fullName: 'Cô Nguyễn Thị Thủy',
        role: 'teacher',
        team: '',
        passwordSalt: teacherPw.salt,
        passwordHash: teacherPw.hash,
        mustPromptPasswordChange: true,
      },
    ],
    // Dữ liệu trắng - không tạo dữ liệu giả
    students: [],
    attendance: [],
    conductLogs: [],
    pointRules: [],
    dutySchedules: [],
    posts: [],
    notifications: [],
  };
}

let dbCache: ClassroomDatabase;

// Fast O(1) lookup indices rebuilt on load/mutation
const userByIdIdx = new Map<string, StoredUserCredential>();
const userByEmailIdx = new Map<string, StoredUserCredential>();
const userByCodeIdx = new Map<string, StoredUserCredential>();
const studentByIdIdx = new Map<string, StudentRecord>();

function rebuildIndices() {
  userByIdIdx.clear();
  userByEmailIdx.clear();
  userByCodeIdx.clear();
  studentByIdIdx.clear();

  for (const u of dbCache.users) {
    userByIdIdx.set(u.id, u);
    userByEmailIdx.set(u.email.toLowerCase(), u);
    if (u.studentCode) {
      userByCodeIdx.set(u.studentCode.toLowerCase(), u);
    }
  }
  for (const s of dbCache.students) {
    studentByIdIdx.set(s.id, s);
  }
}

function loadDatabase(): ClassroomDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    dbCache = initial;
  } else {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      dbCache = JSON.parse(raw) as ClassroomDatabase;
    } catch {
      dbCache = createInitialDatabase();
      fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf8');
    }
  }
  rebuildIndices();
  return dbCache;
}

function saveDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(dbCache, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
  rebuildIndices();
}

loadDatabase();

function signToken(payload: { uid: string; exp: number }): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token: string): { uid: string; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      uid: string;
      exp: number;
    };
    if (!parsed.uid || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function toAuthUser(u: StoredUserCredential): AuthUser {
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    studentCode: u.studentCode,
    role: u.role,
    team: u.team,
    mustPromptPasswordChange: u.mustPromptPasswordChange,
  };
}

function toPublicStudent(s: StudentRecord): StudentPublicView {
  return {
    id: s.id,
    studentCode: s.studentCode,
    fullName: s.fullName,
    team: s.team,
    role: s.role,
    seatRow: s.seatRow,
    seatCol: s.seatCol,
  };
}

interface AuthedRequest extends Request {
  currentUser?: StoredUserCredential;
}

function attachOptionalUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    const verified = verifyToken(token);
    if (verified) {
      const user = userByIdIdx.get(verified.uid);
      if (user) req.currentUser = user;
    }
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    res.status(401).json({ error: 'Vui lòng đăng nhập để thực hiện thao tác này.' });
    return;
  }
  next();
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function findNextFreeSeat(): { seatRow: number; seatCol: number } {
  const occupied = new Set(dbCache.students.map((s) => `${s.seatRow}:${s.seatCol}`));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 6; c++) {
      if (!occupied.has(`${r}:${c}`)) {
        return { seatRow: r, seatCol: c };
      }
    }
  }
  return { seatRow: Math.floor(dbCache.students.length / 6), seatCol: dbCache.students.length % 6 };
}

function createNotification(params: {
  title: string;
  message: string;
  type: AppNotification['type'];
  targetUserId: string;
  studentId?: string;
  createdBy: string;
}) {
  const notif: AppNotification = {
    id: `notif_${crypto.randomUUID().slice(0, 8)}`,
    title: params.title,
    message: params.message,
    type: params.type,
    targetUserId: params.targetUserId,
    studentId: params.studentId,
    createdBy: params.createdBy,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  dbCache.notifications.unshift(notif);
  if (dbCache.notifications.length > 300) {
    dbCache.notifications.length = 300;
  }
  return notif;
}

function findBestStudentMatch(queryName: string): StudentRecord | null {
  const normalized = queryName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
  if (!normalized) return null;

  // Exact full name or student code match first
  for (const st of dbCache.students) {
    const fullNorm = st.fullName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
    if (fullNorm === normalized || st.studentCode.toLowerCase() === normalized) {
      return st;
    }
  }
  // Substring match (e.g. "bạn A" or "An")
  const cleanTokens = normalized.replace(/^(ban|hoc sinh|em)\s+/i, '').trim();
  const candidates = dbCache.students.filter((st) => {
    const fullNorm = st.fullName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
    return fullNorm.includes(cleanTokens) || cleanTokens.includes(fullNorm);
  });
  return candidates.length >= 1 ? candidates[0] : null;
}

function deterministicFallbackCommand(message: string): {
  intent:
    | 'general_chat'
    | 'dispatch_announcement'
    | 'attendance_all_present'
    | 'attendance_with_absences'
    | 'conduct_point'
    | 'admin_setting';
  title?: string;
  content?: string;
  absentStudentName?: string;
  absentReason?: string;
  absentStatus?: 'excused' | 'unexcused';
  pointStudentName?: string;
  points?: number;
  pointCategory?: string;
  replyText: string;
} {
  const lower = message.toLowerCase();

  // Check for attendance full ratio like "45/45" or "đủ sĩ số" or "đi học đủ"
  const ratioMatch = message.match(/(\d+)\s*\/\s*(\d+)/);
  if (
    (lower.includes('điểm danh') || lower.includes('sĩ số') || lower.includes('đi học đủ') || ratioMatch) &&
    (lower.includes('vắng') || lower.includes('nghỉ'))
  ) {
    const nameMatch = message.match(/(?:vắng|nghỉ)\s+(?:bạn\s+|học sinh\s+|em\s+)?([^\n,.]+?)(?:\s+(?:lý do|vì|do)\s+(.+))?$/i);
    const reasonMatch = message.match(/(?:lý do|vì|do)\s+(.+)$/i);
    return {
      intent: 'attendance_with_absences',
      absentStudentName: nameMatch?.[1]?.trim() || '',
      absentReason: reasonMatch?.[1]?.trim() || 'Nghỉ học',
      absentStatus: lower.includes('không phép') ? 'unexcused' : 'excused',
      replyText: 'Đã ghi nhận thông tin điểm danh vắng.',
    };
  }

  if (
    (ratioMatch && ratioMatch[1] === ratioMatch[2]) ||
    lower.includes('đi học đủ') ||
    lower.includes('có mặt đủ') ||
    lower.includes('đủ lớp')
  ) {
    return {
      intent: 'attendance_all_present',
      replyText: 'Đã tự động điểm danh toàn bộ học sinh có mặt.',
    };
  }

  if (lower.includes('vắng') || (lower.includes('nghỉ') && (lower.includes('bạn') || lower.includes('học sinh')))) {
    const nameMatch = message.match(/(?:vắng|nghỉ(?:\s+phép)?)\s+(?:bạn\s+|học sinh\s+|em\s+)?([^\n,.]+?)(?:\s+(?:lý do|vì|do)\s+(.+))?$/i);
    const reasonMatch = message.match(/(?:lý do|vì|do)\s+(.+)$/i);
    return {
      intent: 'attendance_with_absences',
      absentStudentName: nameMatch?.[1]?.trim() || '',
      absentReason: reasonMatch?.[1]?.trim() || 'Nghỉ học',
      absentStatus: lower.includes('không phép') ? 'unexcused' : 'excused',
      replyText: 'Đã cập nhật học sinh nghỉ học kèm lý do.',
    };
  }

  // Announcement / dispatch
  if (
    lower.includes('báo ') ||
    lower.includes('thông báo') ||
    lower.includes('tập trung') ||
    lower.includes('dã ngoại') ||
    lower.includes('họp lớp') ||
    lower.includes('lịch ')
  ) {
    return {
      intent: 'dispatch_announcement',
      title: 'Thông báo điều phối lớp học',
      content: message.trim(),
      replyText: 'Đã phát thông báo tới toàn bộ lớp học.',
    };
  }

  // Conduct points
  const pointMatch = message.match(/(cộng|trừ)\s+(\d+)\s*điểm\s*(?:cho\s+(?:bạn\s+)?([^,.\n]+?))?(?:\s+(?:vì|do|lý do)\s+(.+))?$/i);
  if (pointMatch) {
    const sign = pointMatch[1].toLowerCase() === 'trừ' ? -1 : 1;
    const pts = Number(pointMatch[2]) * sign;
    return {
      intent: 'conduct_point',
      pointStudentName: pointMatch[3]?.trim() || '',
      points: pts,
      pointCategory: pointMatch[4]?.trim() || (pts >= 0 ? 'Điểm cộng qua trợ lý AI' : 'Vi phạm qua trợ lý AI'),
      replyText: 'Đã cập nhật điểm rèn luyện.',
    };
  }

  if (lower.includes('đổi cài đặt') || lower.includes('cấp quyền') || lower.includes('quản trị')) {
    return {
      intent: 'admin_setting',
      replyText: 'Yêu cầu thay đổi cài đặt quản trị.',
    };
  }

  return {
    intent: 'general_chat',
    replyText:
      'Tôi là trợ lý lớp học. Bạn có thể hỏi về lịch trực nhật, hoạt động lớp, xếp hạng tuần hoặc sử dụng lệnh điều phối nếu có chức vụ.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use(attachOptionalUser);

  // --- Health ---
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  // --- Public Overview (No login required - non-PII only) ---
  app.get('/api/public/overview', (_req, res) => {
    const today = getTodayISO();
    const todayAttendance = dbCache.attendance.filter((a) => a.date === today);
    const presentCount = todayAttendance.filter((a) => a.status === 'present').length;
    const absentCount = todayAttendance.filter(
      (a) => a.status === 'excused' || a.status === 'unexcused'
    ).length;

    res.json({
      classroomName: dbCache.classroomName,
      schoolYear: dbCache.schoolYear,
      students: dbCache.students.map(toPublicStudent),
      attendance: dbCache.attendance.map((a) => ({
        ...a,
        // Mask private absence reason for unauthenticated guests
        reason: undefined,
      })),
      todaySummary: {
        date: today,
        totalStudents: dbCache.students.length,
        presentCount,
        absentCount,
      },
      conductLogs: dbCache.conductLogs,
      pointRules: dbCache.pointRules,
      dutySchedules: dbCache.dutySchedules,
      posts: dbCache.posts,
      notifications: [],
    });
  });

  // --- Auth Endpoints ---
  app.post('/api/auth/login', (req, res) => {
    const identifier = String(req.body?.identifier ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!identifier || !password) {
      res.status(400).json({ error: 'Vui lòng nhập tài khoản (email hoặc mã học sinh) và mật khẩu.' });
      return;
    }

    const user = userByEmailIdx.get(identifier) || userByCodeIdx.get(identifier);
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      res.status(401).json({ error: 'Email/Mã học sinh hoặc mật khẩu không chính xác.' });
      return;
    }

    const token = signToken({
      uid: user.id,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });
    res.json({ token, user: toAuthUser(user) });
  });

  app.post('/api/auth/google', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const displayName = String(req.body?.displayName ?? '').trim();
    const uid = String(req.body?.uid ?? '').trim();

    if (!email || !uid) {
      res.status(400).json({ error: 'Thông tin Google Sign-In không hợp lệ.' });
      return;
    }

    let user = userByEmailIdx.get(email);
    if (!user) {
      // If the app owner or teacher email signs in with Google
      const isTeacherEmail = email === 'nguyenthithuy@gmail.com' || email === 'dochungzxc@gmail.com';
      if (isTeacherEmail) {
        const pw = hashPassword(crypto.randomBytes(12).toString('hex'));
        user = {
          id: `google_${uid}`,
          email,
          fullName: displayName || 'Giáo viên chủ nhiệm',
          role: 'teacher',
          team: '',
          passwordSalt: pw.salt,
          passwordHash: pw.hash,
          mustPromptPasswordChange: false,
        };
        dbCache.users.push(user);
        saveDatabase();
      } else {
        res.status(403).json({
          error:
            'Email Google này chưa được giáo viên chủ nhiệm cấp trong danh sách lớp. Vui lòng đăng nhập bằng Email trường hoặc Mã học sinh.',
        });
        return;
      }
    }

    const token = signToken({
      uid: user.id,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });
    res.json({ token, user: toAuthUser(user) });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: toAuthUser(req.currentUser!) });
  });

  app.post('/api/auth/dismiss-password-prompt', requireAuth, (req: AuthedRequest, res) => {
    req.currentUser!.mustPromptPasswordChange = false;
    saveDatabase();
    res.json({ ok: true, user: toAuthUser(req.currentUser!) });
  });

  app.post('/api/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
    const oldPassword = String(req.body?.oldPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');
    const confirmPassword = String(req.body?.confirmPassword ?? '');

    if (!oldPassword || !newPassword || !confirmPassword) {
      res.status(400).json({ error: 'Vui lòng nhập đầy đủ mật khẩu cũ, mật khẩu mới và xác nhận mật khẩu.' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'Mật khẩu mới và xác nhận mật khẩu không khớp.' });
      return;
    }
    if (!verifyPassword(oldPassword, req.currentUser!.passwordSalt, req.currentUser!.passwordHash)) {
      res.status(400).json({ error: 'Mật khẩu cũ không chính xác.' });
      return;
    }

    const updated = hashPassword(newPassword);
    req.currentUser!.passwordSalt = updated.salt;
    req.currentUser!.passwordHash = updated.hash;
    req.currentUser!.provisionedPassword = undefined;
    req.currentUser!.hasChangedPassword = true;
    req.currentUser!.mustPromptPasswordChange = false;
    saveDatabase();
    res.json({ ok: true, user: toAuthUser(req.currentUser!) });
  });

  app.post('/api/auth/change-email', requireAuth, (req: AuthedRequest, res) => {
    const newEmail = String(req.body?.newEmail ?? '').trim().toLowerCase();
    const currentPassword = String(req.body?.currentPassword ?? '');

    if (!newEmail || !currentPassword) {
      res.status(400).json({ error: 'Vui lòng nhập email mới và mật khẩu hiện tại để xác thực.' });
      return;
    }
    if (!validateEmailFormat(newEmail)) {
      res.status(400).json({ error: 'Định dạng email không hợp lệ.' });
      return;
    }
    if (!verifyPassword(currentPassword, req.currentUser!.passwordSalt, req.currentUser!.passwordHash)) {
      res.status(400).json({ error: 'Mật khẩu hiện tại không chính xác.' });
      return;
    }
    const conflict = userByEmailIdx.get(newEmail);
    if (conflict && conflict.id !== req.currentUser!.id) {
      res.status(409).json({ error: 'Email này đã được sử dụng bởi tài khoản khác.' });
      return;
    }

    req.currentUser!.email = newEmail;
    const student = studentByIdIdx.get(req.currentUser!.id);
    if (student) {
      student.schoolEmail = newEmail;
      student.updatedAt = new Date().toISOString();
    }
    saveDatabase();
    res.json({ ok: true, user: toAuthUser(req.currentUser!) });
  });

  // --- Authenticated Classroom State ---
  app.get('/api/classroom/state', requireAuth, (req: AuthedRequest, res) => {
    const user = req.currentUser!;
    const isTeacher = canManageStudents(user.role);
    const canReadAllAttendance = hasPermission(user.role, 'attendance:read_all');
    const isSeniorOfficer = hasPermission(user.role, 'reports:view_class');

    const students = isTeacher ? dbCache.students : dbCache.students.map(toPublicStudent);
    const attendance = canReadAllAttendance
      ? dbCache.attendance
      : dbCache.attendance.filter((a) => a.studentId === user.id || a.status === 'present');

    const notifications = isSeniorOfficer
      ? dbCache.notifications
      : dbCache.notifications.filter(
          (n) => n.targetUserId === 'all' || n.targetUserId === user.id || n.studentId === user.id
        );

    res.json({
      classroomName: dbCache.classroomName,
      schoolYear: dbCache.schoolYear,
      students,
      attendance,
      conductLogs: dbCache.conductLogs,
      pointRules: dbCache.pointRules,
      dutySchedules: dbCache.dutySchedules,
      posts: dbCache.posts,
      notifications,
    });
  });

  app.post('/api/classroom/settings', requireAuth, (req: AuthedRequest, res) => {
    if (!canManageStudents(req.currentUser!.role)) {
      res.status(403).json({ error: 'Chỉ giáo viên chủ nhiệm mới có quyền cập nhật thông tin lớp.' });
      return;
    }
    const classroomName = String(req.body?.classroomName ?? '').trim();
    const schoolYear = String(req.body?.schoolYear ?? '').trim();
    if (classroomName) dbCache.classroomName = classroomName.slice(0, 100);
    if (schoolYear) dbCache.schoolYear = schoolYear.slice(0, 30);
    saveDatabase();
    res.json({ classroomName: dbCache.classroomName, schoolYear: dbCache.schoolYear });
  });

  // --- Student Management (Teacher Only) ---
  app.get('/api/students/credentials', requireAuth, (req: AuthedRequest, res) => {
    if (!canManageStudents(req.currentUser!.role)) {
      res.status(403).json({ error: 'Chỉ giáo viên chủ nhiệm mới có quyền xuất danh sách tài khoản và mật khẩu.' });
      return;
    }
    const credentials: StudentCredentialExportItem[] = dbCache.students.map((s) => {
      const cred = userByIdIdx.get(s.id);
      return {
        studentCode: s.studentCode,
        fullName: s.fullName,
        schoolEmail: s.schoolEmail,
        team: s.team,
        role: s.role,
        provisionedPassword: cred?.provisionedPassword ?? null,
        hasChangedPassword: Boolean(cred?.hasChangedPassword),
      };
    });
    res.json({ credentials });
  });

  app.post('/api/students', requireAuth, (req: AuthedRequest, res) => {
    if (!canManageStudents(req.currentUser!.role)) {
      res.status(403).json({ error: 'Chỉ giáo viên chủ nhiệm mới có quyền thêm học sinh.' });
      return;
    }

    const studentCode = String(req.body?.studentCode ?? '').trim();
    const fullName = String(req.body?.fullName ?? '').trim();
    const schoolEmail = String(req.body?.schoolEmail ?? '').trim().toLowerCase();
    const birthYear = Number(req.body?.birthYear ?? 2008);
    const team = (req.body?.team || 'To 1') as TeamName;
    const role = (req.body?.role || 'student') as Exclude<UserRole, 'teacher' | 'guest'>;
    const password = String(req.body?.password ?? studentCode ?? '123456').trim() || '123456';
    const parentPhone = String(req.body?.parentPhone ?? '').trim();

    if (!studentCode || !fullName || !schoolEmail) {
      res.status(400).json({ error: 'Vui lòng nhập Mã học sinh, Họ tên và Email trường.' });
      return;
    }
    if (!validateEmailFormat(schoolEmail)) {
      res.status(400).json({ error: 'Email trường không đúng định dạng.' });
      return;
    }
    if (userByCodeIdx.has(studentCode.toLowerCase()) || userByEmailIdx.has(schoolEmail)) {
      res.status(409).json({ error: 'Mã học sinh hoặc Email trường đã tồn tại.' });
      return;
    }

    const id = `stu_${crypto.randomUUID().slice(0, 8)}`;
    const seat = findNextFreeSeat();
    const now = new Date().toISOString();
    const student: StudentRecord = {
      id,
      studentCode,
      fullName,
      schoolEmail,
      birthYear: Number.isFinite(birthYear) ? Math.trunc(birthYear) : 2008,
      team,
      role,
      seatRow: typeof req.body?.seatRow === 'number' ? req.body.seatRow : seat.seatRow,
      seatCol: typeof req.body?.seatCol === 'number' ? req.body.seatCol : seat.seatCol,
      parentPhone,
      createdAt: now,
      updatedAt: now,
    };

    const pw = hashPassword(password);
    const cred: StoredUserCredential = {
      id,
      email: schoolEmail,
      studentCode,
      fullName,
      role,
      team,
      passwordSalt: pw.salt,
      passwordHash: pw.hash,
      provisionedPassword: password,
      hasChangedPassword: false,
      mustPromptPasswordChange: true,
    };

    dbCache.students.push(student);
    dbCache.users.push(cred);
    saveDatabase();
    res.status(201).json({ student });
  });

  app.put('/api/students/:id', requireAuth, (req: AuthedRequest, res) => {
    if (!canManageStudents(req.currentUser!.role)) {
      res.status(403).json({ error: 'Chỉ giáo viên chủ nhiệm mới có quyền sửa thông tin học sinh.' });
      return;
    }
    const student = studentByIdIdx.get(req.params.id);
    const user = userByIdIdx.get(req.params.id);
    if (!student || !user) {
      res.status(404).json({ error: 'Không tìm thấy học sinh.' });
      return;
    }

    if (req.body?.fullName) {
      student.fullName = String(req.body.fullName).trim();
      user.fullName = student.fullName;
    }
    if (req.body?.team) {
      student.team = req.body.team as TeamName;
      user.team = student.team;
    }
    if (req.body?.role) {
      student.role = req.body.role as Exclude<UserRole, 'teacher' | 'guest'>;
      user.role = student.role;
    }
    if (req.body?.birthYear) {
      student.birthYear = Number(req.body.birthYear);
    }
    if (req.body?.parentPhone !== undefined) {
      student.parentPhone = String(req.body.parentPhone).trim();
    }
    if (req.body?.schoolEmail) {
      const nextEmail = String(req.body.schoolEmail).trim().toLowerCase();
      if (!validateEmailFormat(nextEmail)) {
        res.status(400).json({ error: 'Định dạng email không hợp lệ.' });
        return;
      }
      const conflict = userByEmailIdx.get(nextEmail);
      if (conflict && conflict.id !== req.params.id) {
        res.status(409).json({ error: 'Email này đã tồn tại trên tài khoản khác.' });
        return;
      }
      student.schoolEmail = nextEmail;
      user.email = nextEmail;
    }
    if (req.body?.newPassword) {
      const nextPw = String(req.body.newPassword).trim();
      if (nextPw.length < 6) {
        res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
        return;
      }
      const pw = hashPassword(nextPw);
      user.passwordSalt = pw.salt;
      user.passwordHash = pw.hash;
      user.provisionedPassword = nextPw;
      user.hasChangedPassword = false;
      user.mustPromptPasswordChange = true;
    }
    student.updatedAt = new Date().toISOString();
    saveDatabase();
    res.json({ student });
  });

  app.delete('/api/students/:id', requireAuth, (req: AuthedRequest, res) => {
    if (!canManageStudents(req.currentUser!.role)) {
      res.status(403).json({ error: 'Chỉ giáo viên chủ nhiệm mới có quyền xóa học sinh.' });
      return;
    }
    dbCache.students = dbCache.students.filter((s) => s.id !== req.params.id);
    dbCache.users = dbCache.users.filter((u) => u.id !== req.params.id);
    dbCache.attendance = dbCache.attendance.filter((a) => a.studentId !== req.params.id);
    dbCache.conductLogs = dbCache.conductLogs.filter((c) => c.studentId !== req.params.id);
    saveDatabase();
    res.json({ ok: true });
  });

  app.post('/api/students/import', requireAuth, (req: AuthedRequest, res) => {
    if (!canManageStudents(req.currentUser!.role)) {
      res.status(403).json({ error: 'Chỉ giáo viên chủ nhiệm mới có quyền nhập danh sách Excel.' });
      return;
    }
    const rows = Array.isArray(req.body?.students) ? req.body.students : [];
    let importedCount = 0;
    let skippedCount = 0;
    const now = new Date().toISOString();

    for (const row of rows) {
      const studentCode = String(row.studentCode ?? '').trim();
      const fullName = String(row.fullName ?? '').trim();
      const schoolEmail = String(row.schoolEmail ?? '').trim().toLowerCase();
      if (!studentCode || !fullName || !schoolEmail) {
        skippedCount += 1;
        continue;
      }
      if (userByCodeIdx.has(studentCode.toLowerCase()) || userByEmailIdx.has(schoolEmail)) {
        skippedCount += 1;
        continue;
      }

      const id = `stu_${crypto.randomUUID().slice(0, 8)}`;
      const seat = findNextFreeSeat();
      const team = (row.team || 'To 1') as TeamName;
      const role = (row.role || 'student') as Exclude<UserRole, 'teacher' | 'guest'>;
      const student: StudentRecord = {
        id,
        studentCode,
        fullName,
        schoolEmail,
        birthYear: Number(row.birthYear) || 2008,
        team,
        role,
        seatRow: seat.seatRow,
        seatCol: seat.seatCol,
        parentPhone: String(row.parentPhone ?? '').trim(),
        createdAt: now,
        updatedAt: now,
      };
      const rawPw = String(row.password || studentCode || '123456').trim() || '123456';
      const pw = hashPassword(rawPw);
      const cred: StoredUserCredential = {
        id,
        email: schoolEmail,
        studentCode,
        fullName,
        role,
        team,
        passwordSalt: pw.salt,
        passwordHash: pw.hash,
        provisionedPassword: rawPw,
        hasChangedPassword: false,
        mustPromptPasswordChange: true,
      };
      dbCache.students.push(student);
      dbCache.users.push(cred);
      rebuildIndices();
      importedCount += 1;
    }

    saveDatabase();
    res.json({ importedCount, skippedCount });
  });

  app.post('/api/students/seating', requireAuth, (req: AuthedRequest, res) => {
    if (!canManageStudents(req.currentUser!.role)) {
      res.status(403).json({ error: 'Chỉ giáo viên chủ nhiệm mới có quyền xếp chỗ ngồi và phân chức vụ.' });
      return;
    }
    const studentId = String(req.body?.studentId ?? '');
    const student = studentByIdIdx.get(studentId);
    const user = userByIdIdx.get(studentId);
    if (!student || !user) {
      res.status(404).json({ error: 'Không tìm thấy học sinh.' });
      return;
    }

    if (typeof req.body?.seatRow === 'number' && typeof req.body?.seatCol === 'number') {
      const targetRow = req.body.seatRow;
      const targetCol = req.body.seatCol;
      const occupant = dbCache.students.find(
        (s) => s.id !== student.id && s.seatRow === targetRow && s.seatCol === targetCol
      );
      if (occupant) {
        // Swap seats cleanly
        occupant.seatRow = student.seatRow;
        occupant.seatCol = student.seatCol;
        occupant.updatedAt = new Date().toISOString();
      }
      student.seatRow = targetRow;
      student.seatCol = targetCol;
    }
    if (req.body?.role) {
      student.role = req.body.role as Exclude<UserRole, 'teacher' | 'guest'>;
      user.role = student.role;
    }
    if (req.body?.team) {
      student.team = req.body.team as TeamName;
      user.team = student.team;
    }
    student.updatedAt = new Date().toISOString();
    saveDatabase();
    res.json({ student });
  });

  // --- Attendance ---
  app.post('/api/attendance/bulk', requireAuth, (req: AuthedRequest, res) => {
    if (!canTakeAttendance(req.currentUser!.role)) {
      res.status(403).json({ error: 'Chỉ Giáo viên, Lớp trưởng và Bí thư mới được phép điểm danh.' });
      return;
    }
    const date = String(req.body?.date ?? getTodayISO());
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const now = new Date().toISOString();

    for (const item of entries) {
      const studentId = String(item.studentId ?? '');
      const status = item.status as AttendanceStatus;
      const reason = String(item.reason ?? '').trim();
      const student = studentByIdIdx.get(studentId);
      if (!student || !['present', 'excused', 'unexcused', 'late'].includes(status)) continue;

      const existingIdx = dbCache.attendance.findIndex(
        (a) => a.date === date && a.studentId === studentId
      );
      const record: AttendanceRecord = {
        id: existingIdx >= 0 ? dbCache.attendance[existingIdx].id : `att_${date}_${studentId}`,
        date,
        studentId,
        status,
        reason: reason || undefined,
        recordedBy: req.currentUser!.id,
        recordedByName: req.currentUser!.fullName,
        updatedAt: now,
      };
      if (existingIdx >= 0) {
        dbCache.attendance[existingIdx] = record;
      } else {
        dbCache.attendance.push(record);
      }

      if (status === 'excused' || status === 'unexcused') {
        createNotification({
          title: `Điểm danh vắng: ${student.fullName}`,
          message: `Ngày ${date}: ${status === 'excused' ? 'Nghỉ có phép' : 'Nghỉ không phép'}${
            reason ? ` (${reason})` : ''
          }. Ghi nhận bởi ${req.currentUser!.fullName}.`,
          type: 'absence',
          targetUserId: 'teacher_thuy',
          studentId: student.id,
          createdBy: req.currentUser!.id,
        });
      }
    }

    saveDatabase();
    res.json({ ok: true });
  });

  // --- Point Rules (Teacher, Monitor, Secretary) ---
  app.post('/api/point-rules', requireAuth, (req: AuthedRequest, res) => {
    if (!canManagePointRules(req.currentUser!.role)) {
      res.status(403).json({
        error: 'Chỉ Giáo viên, Lớp trưởng và Bí thư mới được thêm quy tắc điểm cộng/trừ.',
      });
      return;
    }
    const label = String(req.body?.label ?? '').trim();
    const points = Number(req.body?.points ?? 0);
    const type = points >= 0 ? 'merit' : 'violation';
    if (!label || !Number.isFinite(points) || points === 0) {
      res.status(400).json({ error: 'Vui lòng nhập tên tiêu chí và số điểm khác 0.' });
      return;
    }

    const rule: PointRule = {
      id: `rule_${crypto.randomUUID().slice(0, 8)}`,
      label,
      points: Math.trunc(points),
      type,
      createdBy: req.currentUser!.id,
      updatedAt: new Date().toISOString(),
    };
    dbCache.pointRules.push(rule);
    saveDatabase();
    res.status(201).json({ rule });
  });

  app.put('/api/point-rules/:id', requireAuth, (req: AuthedRequest, res) => {
    if (!canManagePointRules(req.currentUser!.role)) {
      res.status(403).json({ error: 'Không có quyền sửa quy tắc điểm.' });
      return;
    }
    const rule = dbCache.pointRules.find((r) => r.id === req.params.id);
    if (!rule) {
      res.status(404).json({ error: 'Không tìm thấy quy tắc.' });
      return;
    }
    if (req.body?.label) rule.label = String(req.body.label).trim();
    if (req.body?.points !== undefined) {
      rule.points = Math.trunc(Number(req.body.points));
      rule.type = rule.points >= 0 ? 'merit' : 'violation';
    }
    rule.updatedAt = new Date().toISOString();
    saveDatabase();
    res.json({ rule });
  });

  app.delete('/api/point-rules/:id', requireAuth, (req: AuthedRequest, res) => {
    if (!canManagePointRules(req.currentUser!.role)) {
      res.status(403).json({ error: 'Không có quyền xóa quy tắc điểm.' });
      return;
    }
    dbCache.pointRules = dbCache.pointRules.filter((r) => r.id !== req.params.id);
    saveDatabase();
    res.json({ ok: true });
  });

  // --- Conduct Logs (Merits & Deductions) ---
  app.post('/api/conduct', requireAuth, (req: AuthedRequest, res) => {
    if (!canEditConductPoints(req.currentUser!.role)) {
      res.status(403).json({
        error: 'Chỉ Giáo viên, Lớp trưởng, Lớp phó, Bí thư và Tổ trưởng mới được ghi nhận điểm rèn luyện.',
      });
      return;
    }

    const studentId = String(req.body?.studentId ?? '');
    const student = studentByIdIdx.get(studentId);
    if (!student) {
      res.status(404).json({ error: 'Không tìm thấy học sinh.' });
      return;
    }
    const date = String(req.body?.date ?? getTodayISO());
    const session = (req.body?.session || 'Sang') as ConductSession;
    const category = String(req.body?.category ?? '').trim();
    const points = Math.trunc(Number(req.body?.points ?? 0));
    const note = String(req.body?.note ?? '').trim();

    if (!category || !Number.isFinite(points) || points === 0) {
      res.status(400).json({ error: 'Vui lòng nhập nội dung và số điểm hợp lệ.' });
      return;
    }

    const log: ConductLog = {
      id: `log_${crypto.randomUUID().slice(0, 8)}`,
      date,
      session,
      studentId,
      category,
      points,
      note: note || undefined,
      recordedBy: req.currentUser!.id,
      recordedByName: req.currentUser!.fullName,
      createdAt: new Date().toISOString(),
    };
    dbCache.conductLogs.unshift(log);

    // Requirement 6: Automated notification on point deduction
    if (points < 0) {
      createNotification({
        title: `Thông báo trừ điểm: ${student.fullName}`,
        message: `${student.fullName} (${student.studentCode}) bị trừ ${Math.abs(
          points
        )} điểm vào buổi ${session} ngày ${date}. Lý do: ${category}${note ? ` - ${note}` : ''}.`,
        type: 'deduction',
        targetUserId: student.id,
        studentId: student.id,
        createdBy: req.currentUser!.id,
      });
    }

    saveDatabase();
    res.status(201).json({ log });
  });

  app.put('/api/conduct/:id', requireAuth, (req: AuthedRequest, res) => {
    if (!canEditConductPoints(req.currentUser!.role)) {
      res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa điểm rèn luyện.' });
      return;
    }
    const log = dbCache.conductLogs.find((c) => c.id === req.params.id);
    if (!log) {
      res.status(404).json({ error: 'Không tìm thấy bản ghi điểm.' });
      return;
    }
    if (req.body?.category) log.category = String(req.body.category).trim();
    if (req.body?.points !== undefined) log.points = Math.trunc(Number(req.body.points));
    if (req.body?.session) log.session = req.body.session as ConductSession;
    if (req.body?.note !== undefined) log.note = String(req.body.note).trim();
    saveDatabase();
    res.json({ log });
  });

  app.delete('/api/conduct/:id', requireAuth, (req: AuthedRequest, res) => {
    if (!canEditConductPoints(req.currentUser!.role)) {
      res.status(403).json({ error: 'Bạn không có quyền xóa bản ghi điểm.' });
      return;
    }
    dbCache.conductLogs = dbCache.conductLogs.filter((c) => c.id !== req.params.id);
    saveDatabase();
    res.json({ ok: true });
  });

  // --- Duty Schedules ---
  app.post('/api/duty', requireAuth, (req: AuthedRequest, res) => {
    if (!canManageDutySchedule(req.currentUser!.role)) {
      res.status(403).json({ error: 'Bạn không có quyền phân công lịch trực nhật.' });
      return;
    }
    const date = String(req.body?.date ?? getTodayISO());
    const assignedTeam = (req.body?.assignedTeam || 'To 1') as DutySchedule['assignedTeam'];
    const task = String(req.body?.task ?? '').trim();
    const status = (req.body?.status || 'pending') as DutySchedule['status'];
    const note = String(req.body?.note ?? '').trim();

    if (!task) {
      res.status(400).json({ error: 'Vui lòng nhập nội dung trực nhật.' });
      return;
    }

    const duty: DutySchedule = {
      id: `duty_${crypto.randomUUID().slice(0, 8)}`,
      date,
      assignedTeam,
      task,
      status,
      note: note || undefined,
      updatedBy: req.currentUser!.fullName,
      updatedAt: new Date().toISOString(),
    };
    dbCache.dutySchedules.unshift(duty);
    saveDatabase();
    res.status(201).json({ duty });
  });

  app.put('/api/duty/:id', requireAuth, (req: AuthedRequest, res) => {
    if (!canManageDutySchedule(req.currentUser!.role)) {
      res.status(403).json({ error: 'Bạn không có quyền cập nhật lịch trực nhật.' });
      return;
    }
    const duty = dbCache.dutySchedules.find((d) => d.id === req.params.id);
    if (!duty) {
      res.status(404).json({ error: 'Không tìm thấy lịch trực nhật.' });
      return;
    }
    if (req.body?.status) duty.status = req.body.status as DutySchedule['status'];
    if (req.body?.assignedTeam) duty.assignedTeam = req.body.assignedTeam;
    if (req.body?.task) duty.task = String(req.body.task).trim();
    if (req.body?.note !== undefined) duty.note = String(req.body.note).trim();
    duty.updatedBy = req.currentUser!.fullName;
    duty.updatedAt = new Date().toISOString();
    saveDatabase();
    res.json({ duty });
  });

  app.delete('/api/duty/:id', requireAuth, (req: AuthedRequest, res) => {
    if (!canManageDutySchedule(req.currentUser!.role)) {
      res.status(403).json({ error: 'Không có quyền xóa lịch trực nhật.' });
      return;
    }
    dbCache.dutySchedules = dbCache.dutySchedules.filter((d) => d.id !== req.params.id);
    saveDatabase();
    res.json({ ok: true });
  });

  // --- Class Posts & Major Activities ---
  app.post('/api/posts', requireAuth, (req: AuthedRequest, res) => {
    if (!canCreateAnnouncements(req.currentUser!.role)) {
      res.status(403).json({ error: 'Chỉ Giáo viên chủ nhiệm, Lớp trưởng và Bí thư mới được đăng bài hoặc hoạt động lớn.' });
      return;
    }
    const title = String(req.body?.title ?? '').trim();
    const content = String(req.body?.content ?? '').trim();
    const category = (req.body?.category || 'Thong bao') as ClassPost['category'];
    if (!title || !content) {
      res.status(400).json({ error: 'Vui lòng nhập tiêu đề và nội dung bài viết.' });
      return;
    }
    const post: ClassPost = {
      id: `post_${crypto.randomUUID().slice(0, 8)}`,
      title,
      content,
      category,
      authorId: req.currentUser!.id,
      authorName: req.currentUser!.fullName,
      createdAt: new Date().toISOString(),
    };
    dbCache.posts.unshift(post);
    saveDatabase();
    res.status(201).json({ post });
  });

  app.delete('/api/posts/:id', requireAuth, (req: AuthedRequest, res) => {
    if (!canManageStudents(req.currentUser!.role)) {
      res.status(403).json({ error: 'Chỉ giáo viên chủ nhiệm mới có quyền xóa bài viết.' });
      return;
    }
    dbCache.posts = dbCache.posts.filter((p) => p.id !== req.params.id);
    saveDatabase();
    res.json({ ok: true });
  });

  // --- Notifications ---
  app.post('/api/notifications/read', requireAuth, (req: AuthedRequest, res) => {
    const id = req.body?.id ? String(req.body.id) : null;
    for (const n of dbCache.notifications) {
      if (!id || n.id === id) {
        n.isRead = true;
      }
    }
    saveDatabase();
    res.json({ ok: true });
  });

  // --- AI Chatbot Dispatch & Conversation ---
  app.post('/api/ai/chat', async (req: AuthedRequest, res) => {
    const message = String(req.body?.message ?? '').trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const today = String(req.body?.currentDate || getTodayISO());

    if (!message) {
      res.status(400).json({ error: 'Vui lòng nhập nội dung tin nhắn.' });
      return;
    }

    const userRole: UserRole = req.currentUser?.role || 'guest';
    const userName = req.currentUser?.fullName || 'Khách xem';
    const hasDispatchPermission = canUseChatbotDispatch(userRole);

    const rosterSummary =
      dbCache.students.length > 0
        ? dbCache.students.map((s) => `${s.fullName} (${s.studentCode}, ${s.team})`).join(', ')
        : 'Chưa có học sinh trong danh sách.';

    const postsSummary =
      dbCache.posts.length > 0
        ? dbCache.posts
            .slice(0, 5)
            .map((p) => `- ${p.title}: ${p.content}`)
            .join('\n')
        : 'Chưa có thông báo hoạt động nào.';

    let parsed = deterministicFallbackCommand(message);
    const ai = getGeminiClient();

    if (ai) {
      try {
        const promptContext = [
          `Người dùng hiện tại: ${userName} (Chức vụ: ${ROLE_LABELS[userRole]})`,
          `Ngày hiện tại: ${today}`,
          `Tổng sĩ số lớp: ${dbCache.students.length}`,
          `Danh sách học sinh: ${rosterSummary}`,
          `Hoạt động gần đây:\n${postsSummary}`,
          history.length > 0
            ? `Lịch sử hội thoại gần nhất:\n${history
                .slice(-6)
                .map((h: { sender: string; text: string }) => `${h.sender}: ${h.text}`)
                .join('\n')}`
            : '',
          `Tin nhắn mới từ người dùng: "${message}"`,
        ]
          .filter(Boolean)
          .join('\n\n');

        const aiResponse = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: promptContext,
          config: {
            systemInstruction:
              'Bạn là trợ lý điều phối thông minh của hệ thống quản lý lớp học tiếng Việt. Hãy phân tích ý định người dùng và trả về JSON đúng cấu trúc. ' +
              'Phân loại intent: "general_chat" nếu là hỏi đáp thông thường; "dispatch_announcement" nếu thông báo sự kiện/dã ngoại/họp lớp; ' +
              '"attendance_all_present" nếu báo cả lớp đi học đủ (ví dụ 45/45 học sinh); "attendance_with_absences" nếu báo có học sinh vắng/nghỉ kèm lý do; ' +
              '"conduct_point" nếu yêu cầu cộng/trừ điểm cho học sinh; "admin_setting" nếu yêu cầu đổi cài đặt quản trị hoặc phân quyền. ' +
              'Trả lời ngắn gọn, lịch sự, chuyên nghiệp, không dùng emoji.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                intent: {
                  type: Type.STRING,
                  enum: [
                    'general_chat',
                    'dispatch_announcement',
                    'attendance_all_present',
                    'attendance_with_absences',
                    'conduct_point',
                    'admin_setting',
                  ],
                },
                title: { type: Type.STRING },
                content: { type: Type.STRING },
                absentStudentName: { type: Type.STRING },
                absentReason: { type: Type.STRING },
                absentStatus: { type: Type.STRING, enum: ['excused', 'unexcused'] },
                pointStudentName: { type: Type.STRING },
                points: { type: Type.INTEGER },
                pointCategory: { type: Type.STRING },
                replyText: { type: Type.STRING },
              },
              required: ['intent', 'replyText'],
            },
          },
        });

        const rawJson = (aiResponse.text ?? '').trim();
        if (rawJson) {
          parsed = JSON.parse(rawJson);
        }
      } catch (err) {
        console.warn('Gemini chat fallback used:', err instanceof Error ? err.message : err);
      }
    }

    // Strict RBAC check for any operational / dispatch command
    if (parsed.intent !== 'general_chat' && !hasDispatchPermission) {
      res.json({
        reply:
          'Bạn không đủ quyền gửi lệnh điều phối, điểm danh tự động hoặc thay đổi cài đặt quản trị. Chỉ Giáo viên chủ nhiệm, Lớp trưởng, Bí thư và Tổ trưởng mới có quyền thực hiện thao tác này.',
        denied: true,
        updated: false,
      });
      return;
    }

    // Execute authorized action
    if (parsed.intent === 'dispatch_announcement') {
      const title = (parsed.title || `Thông báo từ ${ROLE_LABELS[userRole]}`).slice(0, 160);
      const content = (parsed.content || message).slice(0, 4000);
      const post: ClassPost = {
        id: `post_${crypto.randomUUID().slice(0, 8)}`,
        title,
        content,
        category: 'Thong bao',
        authorId: req.currentUser!.id,
        authorName: req.currentUser!.fullName,
        createdAt: new Date().toISOString(),
      };
      dbCache.posts.unshift(post);
      createNotification({
        title,
        message: content,
        type: 'dispatch',
        targetUserId: 'all',
        createdBy: req.currentUser!.id,
      });
      saveDatabase();
      res.json({
        reply: `Đã đăng thông báo ngay lập tức tới toàn lớp: "${content}"`,
        actionPerformed: 'Đã phát thông báo lớp',
        updated: true,
      });
      return;
    }

    if (parsed.intent === 'attendance_all_present') {
      if (dbCache.students.length === 0) {
        res.json({
          reply: 'Danh sách lớp hiện đang trống (0 học sinh). Vui lòng thêm hoặc nhập danh sách học sinh trước khi điểm danh.',
          updated: false,
        });
        return;
      }
      const now = new Date().toISOString();
      for (const st of dbCache.students) {
        const idx = dbCache.attendance.findIndex((a) => a.date === today && a.studentId === st.id);
        const rec: AttendanceRecord = {
          id: idx >= 0 ? dbCache.attendance[idx].id : `att_${today}_${st.id}`,
          date: today,
          studentId: st.id,
          status: 'present',
          recordedBy: req.currentUser!.id,
          recordedByName: req.currentUser!.fullName,
          updatedAt: now,
        };
        if (idx >= 0) dbCache.attendance[idx] = rec;
        else dbCache.attendance.push(rec);
      }
      saveDatabase();
      res.json({
        reply: `Đã tự động điền điểm danh ngày ${today}: ${dbCache.students.length}/${dbCache.students.length} học sinh có mặt đầy đủ.`,
        actionPerformed: `Điểm danh đủ ${dbCache.students.length}/${dbCache.students.length}`,
        updated: true,
      });
      return;
    }

    if (parsed.intent === 'attendance_with_absences') {
      if (dbCache.students.length === 0) {
        res.json({
          reply: 'Danh sách lớp hiện đang trống (0 học sinh). Vui lòng thêm học sinh trước khi ghi nhận vắng.',
          updated: false,
        });
        return;
      }
      const target = findBestStudentMatch(parsed.absentStudentName || '');
      if (!target) {
        res.json({
          reply: `Không tìm thấy học sinh "${parsed.absentStudentName || ''}" trong danh sách lớp. Vui lòng nêu rõ họ tên hoặc mã học sinh.`,
          updated: false,
        });
        return;
      }
      const now = new Date().toISOString();
      const absentStatus: AttendanceStatus = parsed.absentStatus === 'unexcused' ? 'unexcused' : 'excused';
      const reason = (parsed.absentReason || 'Nghỉ học').trim();

      for (const st of dbCache.students) {
        const isAbsent = st.id === target.id;
        const idx = dbCache.attendance.findIndex((a) => a.date === today && a.studentId === st.id);
        const rec: AttendanceRecord = {
          id: idx >= 0 ? dbCache.attendance[idx].id : `att_${today}_${st.id}`,
          date: today,
          studentId: st.id,
          status: isAbsent ? absentStatus : 'present',
          reason: isAbsent ? reason : undefined,
          recordedBy: req.currentUser!.id,
          recordedByName: req.currentUser!.fullName,
          updatedAt: now,
        };
        if (idx >= 0) dbCache.attendance[idx] = rec;
        else dbCache.attendance.push(rec);
      }

      createNotification({
        title: `Báo vắng tự động: ${target.fullName}`,
        message: `Ngày ${today}: ${target.fullName} nghỉ học (${
          absentStatus === 'excused' ? 'Có phép' : 'Không phép'
        }) - Lý do: ${reason}. Báo bởi ${req.currentUser!.fullName}.`,
        type: 'absence',
        targetUserId: 'teacher_thuy',
        studentId: target.id,
        createdBy: req.currentUser!.id,
      });
      saveDatabase();
      res.json({
        reply: `Đã tự động cập nhật điểm danh ngày ${today}: ${dbCache.students.length - 1}/${
          dbCache.students.length
        } có mặt. Học sinh ${target.fullName} được ghi nhận nghỉ (${reason}) và đã gửi báo cáo cho Giáo viên chủ nhiệm.`,
        actionPerformed: `Cập nhật vắng: ${target.fullName}`,
        updated: true,
      });
      return;
    }

    if (parsed.intent === 'conduct_point') {
      const target = findBestStudentMatch(parsed.pointStudentName || '');
      const pts = Math.trunc(Number(parsed.points || 0));
      if (!target || pts === 0) {
        res.json({
          reply: 'Vui lòng nêu rõ tên học sinh có trong lớp và số điểm cần cộng/trừ.',
          updated: false,
        });
        return;
      }
      const category = (parsed.pointCategory || 'Ghi nhận qua trợ lý').trim();
      const log: ConductLog = {
        id: `log_${crypto.randomUUID().slice(0, 8)}`,
        date: today,
        session: 'Sang',
        studentId: target.id,
        category,
        points: pts,
        recordedBy: req.currentUser!.id,
        recordedByName: req.currentUser!.fullName,
        createdAt: new Date().toISOString(),
      };
      dbCache.conductLogs.unshift(log);
      if (pts < 0) {
        createNotification({
          title: `Thông báo trừ điểm: ${target.fullName}`,
          message: `${target.fullName} bị trừ ${Math.abs(pts)} điểm. Lý do: ${category}.`,
          type: 'deduction',
          targetUserId: target.id,
          studentId: target.id,
          createdBy: req.currentUser!.id,
        });
      }
      saveDatabase();
      res.json({
        reply: `Đã ${pts >= 0 ? 'cộng' : 'trừ'} ${Math.abs(pts)} điểm cho học sinh ${target.fullName} (${category}).`,
        actionPerformed: `${pts >= 0 ? '+' : ''}${pts} điểm · ${target.fullName}`,
        updated: true,
      });
      return;
    }

    if (parsed.intent === 'admin_setting') {
      if (userRole !== 'teacher') {
        res.json({
          reply: 'Chỉ Giáo viên chủ nhiệm mới có quyền thay đổi cài đặt quản trị và phân quyền hệ thống.',
          denied: true,
          updated: false,
        });
        return;
      }
      res.json({
        reply: 'Bạn có thể điều chỉnh phân quyền vai trò tại mục Sơ đồ chỗ ngồi hoặc Quản trị học sinh.',
        updated: false,
      });
      return;
    }

    res.json({
      reply: parsed.replyText,
      updated: false,
    });
  });

  // --- Teacher AI Deep Student Analysis (ThinkingLevel.HIGH, no maxOutputTokens) ---
  app.post('/api/ai/analyze-student', requireAuth, async (req: AuthedRequest, res) => {
    if (req.currentUser!.role !== 'teacher') {
      res.status(403).json({ error: 'Chỉ giáo viên chủ nhiệm mới được sử dụng phân tích chuyên sâu AI.' });
      return;
    }

    const studentId = req.body?.studentId ? String(req.body.studentId) : '';
    const question = String(req.body?.question ?? '').trim();

    let targetStudent = studentId ? studentByIdIdx.get(studentId) || null : null;
    if (!targetStudent && question) {
      targetStudent = findBestStudentMatch(question);
    }

    if (dbCache.students.length === 0) {
      res.json({
        analysis:
          'Hiện tại lớp học chưa có dữ liệu học sinh. Vui lòng thêm học sinh hoặc nhập danh sách Excel để hệ thống AI có dữ liệu thực tế phân tích.',
      });
      return;
    }

    const contextBlock = targetStudent
      ? buildStudentDiagnosticContext(targetStudent, dbCache.attendance, dbCache.conductLogs)
      : dbCache.students
          .map((s) => buildStudentDiagnosticContext(s, dbCache.attendance, dbCache.conductLogs))
          .join('\n\n---\n\n');

    const ai = getGeminiClient();
    const buildFallbackAnalysis = (note?: string) => {
      const prefix = note ? `${note}\n\n` : '';
      if (targetStudent) {
        return `${contextBlock}\n\nNhận xét tổng hợp: ${prefix}Hệ thống đang hiển thị hồ sơ dữ liệu trực tiếp từ sổ điểm danh và thi đua của học sinh ${targetStudent.fullName}.`;
      }
      return `Tổng quan ${dbCache.students.length} học sinh đã được tổng hợp.\n\n${prefix}Hãy chọn một học sinh cụ thể để xem báo cáo rèn luyện và chuyên cần chi tiết.`;
    };

    if (!ai) {
      res.json({
        analysis: buildFallbackAnalysis(
          'Hiện chưa cấu hình GEMINI_API_KEY trong Settings > Secrets của AI Studio (hoặc biến môi trường máy chủ).'
        ),
        studentName: targetStudent?.fullName,
      });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Câu hỏi của giáo viên chủ nhiệm: "${
          question || 'Hãy phân tích toàn diện tình hình rèn luyện, chuyên cần và kỹ năng cần cải thiện của học sinh này.'
        }"\n\nDữ liệu thực tế từ hệ thống (không suy diễn ngoài dữ liệu):\n${contextBlock}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          systemInstruction:
            'Bạn là chuyên gia tư vấn sư phạm hỗ trợ Giáo viên chủ nhiệm. Dựa hoàn toàn trên dữ liệu thực tế được cung cấp (tuyệt đối không bịa đặt thông tin), hãy trả lời rõ ràng các nội dung: 1) Họ tên, mã học sinh và năm sinh; 2) Đánh giá mức độ rèn luyện (tốt/khá/cần cố gắng) dựa trên điểm cộng/trừ thực tế; 3) Mức độ đi học chuyên cần (có đều không, nghỉ phép/không phép/muộn bao nhiêu buổi); 4) Các lỗi vi phạm cụ thể (nếu có); 5) Đề xuất các kỹ năng cần cải thiện và hướng phối hợp với phụ huynh. Trình bày mạch lạc, chuyên nghiệp, không sử dụng emoji.',
        },
      });
      res.json({
        analysis: response.text || 'Không nhận được nội dung phân tích từ AI.',
        studentName: targetStudent?.fullName,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn('Gemini analyze-student fallback used:', errMsg);
      res.json({
        analysis: buildFallbackAnalysis(
          `Không thể kết nối mô hình AI miễn phí (gemini-4-hydrogen). Vui lòng kiểm tra GEMINI_API_KEY tại Settings > Secrets (${errMsg}).`
        ),
        studentName: targetStudent?.fullName,
      });
    }
  });

  // --- Vite Dev / Production Static Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
