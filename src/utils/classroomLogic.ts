import type {
  AttendanceRecord,
  ConductLog,
  IndividualRanking,
  StudentPublicView,
  StudentRecord,
  TeamName,
  TeamRanking,
  UserRole,
} from '../types/classroom';

export const TEAMS: TeamName[] = ['To 1', 'To 2', 'To 3'];

export const ROLE_LABELS: Record<UserRole, string> = {
  teacher: 'Giáo viên chủ nhiệm',
  monitor: 'Lớp trưởng',
  vice_monitor: 'Lớp phó',
  secretary: 'Bí thư',
  team_leader: 'Tổ trưởng',
  student: 'Học sinh',
  guest: 'Khách xem công khai',
};

export const TEAM_LABELS: Record<TeamName | 'Ca lop', string> = {
  'To 1': 'Tổ 1',
  'To 2': 'Tổ 2',
  'To 3': 'Tổ 3',
  'Ca lop': 'Cả lớp',
};

export type Permission =
  | 'attendance:read_all'
  | 'attendance:write'
  | 'conduct:write'
  | 'conduct:configure_rules'
  | 'duty:manage'
  | 'seating:view'
  | 'seating:manage'
  | 'announcements:create'
  | 'announcements:delete'
  | 'students:manage'
  | 'reports:view_class'
  | 'reports:export_excel'
  | 'reports:view_own'
  | 'chatbot:dispatch';

export const ROLE_PERMISSION_MATRIX: Record<UserRole, Permission[]> = {
  teacher: [
    'attendance:read_all',
    'attendance:write',
    'conduct:write',
    'conduct:configure_rules',
    'duty:manage',
    'seating:view',
    'seating:manage',
    'announcements:create',
    'announcements:delete',
    'students:manage',
    'reports:view_class',
    'reports:export_excel',
    'reports:view_own',
    'chatbot:dispatch',
  ],
  monitor: [
    'attendance:read_all',
    'attendance:write',
    'conduct:write',
    'conduct:configure_rules',
    'duty:manage',
    'seating:view',
    'announcements:create',
    'reports:view_class',
    'reports:export_excel',
    'reports:view_own',
    'chatbot:dispatch',
  ],
  secretary: [
    'attendance:read_all',
    'attendance:write',
    'conduct:write',
    'conduct:configure_rules',
    'duty:manage',
    'seating:view',
    'announcements:create',
    'reports:view_class',
    'reports:export_excel',
    'reports:view_own',
    'chatbot:dispatch',
  ],
  team_leader: [
    'attendance:read_all',
    'conduct:write',
    'duty:manage',
    'seating:view',
    'reports:view_own',
    'chatbot:dispatch',
  ],
  vice_monitor: [
    'attendance:read_all',
    'conduct:write',
    'duty:manage',
    'seating:view',
    'reports:view_own',
  ],
  student: ['seating:view', 'reports:view_own'],
  guest: ['seating:view'],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSION_MATRIX[role]?.includes(permission) ?? false;
}

export function canTakeAttendance(role: UserRole): boolean {
  return hasPermission(role, 'attendance:write');
}

export function canEditConductPoints(role: UserRole): boolean {
  return hasPermission(role, 'conduct:write');
}

export function canManagePointRules(role: UserRole): boolean {
  return hasPermission(role, 'conduct:configure_rules');
}

export function canManageDutySchedule(role: UserRole): boolean {
  return hasPermission(role, 'duty:manage');
}

export function canManageStudents(role: UserRole): boolean {
  return hasPermission(role, 'students:manage');
}

export function canCreateAnnouncements(role: UserRole): boolean {
  return hasPermission(role, 'announcements:create');
}

export function canViewClassReports(role: UserRole): boolean {
  return hasPermission(role, 'reports:view_class');
}

export function canUseChatbotDispatch(role: UserRole): boolean {
  return hasPermission(role, 'chatbot:dispatch');
}

export function getTodayISO(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentMonthISO(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns Monday-Saturday dates (YYYY-MM-DD) for the week containing `anchorISO`.
 */
export function getWeekDates(anchorISO: string): string[] {
  const [y, m, d] = anchorISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dayOfWeek = date.getDay(); // 0 = Sun, 1 = Mon...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);

  const dates: string[] = [];
  for (let i = 0; i < 6; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    dates.push(getTodayISO(cur));
  }
  return dates;
}

export function getWeekdayLabelVi(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const labels = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return labels[dt.getDay()];
}

export interface DailyAttendanceSummary {
  date: string;
  totalStudents: number;
  present: number;
  excused: number;
  unexcused: number;
  late: number;
  unmarked: number;
}

export function computeDailyAttendanceSummary(
  students: Pick<StudentPublicView, 'id'>[],
  attendance: AttendanceRecord[],
  dateISO: string
): DailyAttendanceSummary {
  const dayMap = new Map<string, AttendanceRecord>();
  for (const rec of attendance) {
    if (rec.date === dateISO) {
      dayMap.set(rec.studentId, rec);
    }
  }

  let present = 0;
  let excused = 0;
  let unexcused = 0;
  let late = 0;
  let unmarked = 0;

  for (const st of students) {
    const rec = dayMap.get(st.id);
    if (!rec) {
      unmarked += 1;
    } else if (rec.status === 'present') {
      present += 1;
    } else if (rec.status === 'excused') {
      excused += 1;
    } else if (rec.status === 'unexcused') {
      unexcused += 1;
    } else if (rec.status === 'late') {
      late += 1;
    }
  }

  return {
    date: dateISO,
    totalStudents: students.length,
    present,
    excused,
    unexcused,
    late,
    unmarked,
  };
}

export function computeWeeklyRankings(
  students: StudentPublicView[],
  conductLogs: ConductLog[],
  weekDates: string[]
): {
  individualRankings: IndividualRanking[];
  teamRankings: TeamRanking[];
} {
  const dateSet = new Set(weekDates);
  const meritByStudent = new Map<string, number>();
  const deductByStudent = new Map<string, number>();

  for (const log of conductLogs) {
    if (!dateSet.has(log.date)) continue;
    if (log.points >= 0) {
      meritByStudent.set(log.studentId, (meritByStudent.get(log.studentId) ?? 0) + log.points);
    } else {
      deductByStudent.set(
        log.studentId,
        (deductByStudent.get(log.studentId) ?? 0) + Math.abs(log.points)
      );
    }
  }

  const individualRaw: IndividualRanking[] = students.map((s) => {
    const meritPoints = meritByStudent.get(s.id) ?? 0;
    const deductionPoints = deductByStudent.get(s.id) ?? 0;
    const netScore = meritPoints - deductionPoints;
    return {
      studentId: s.id,
      studentCode: s.studentCode,
      fullName: s.fullName,
      team: s.team,
      role: s.role,
      meritPoints,
      deductionPoints,
      netScore,
      rank: 1,
    };
  });

  individualRaw.sort((a, b) => {
    if (b.netScore !== a.netScore) return b.netScore - a.netScore;
    if (a.deductionPoints !== b.deductionPoints) return a.deductionPoints - b.deductionPoints;
    return a.fullName.localeCompare(b.fullName, 'vi');
  });

  individualRaw.forEach((item, index) => {
    if (index > 0 && item.netScore === individualRaw[index - 1].netScore) {
      item.rank = individualRaw[index - 1].rank;
    } else {
      item.rank = index + 1;
    }
  });

  const teamRankings: TeamRanking[] = TEAMS.map((team) => {
    const members = individualRaw.filter((i) => i.team === team);
    const totalMerit = members.reduce((sum, m) => sum + m.meritPoints, 0);
    const totalDeduction = members.reduce((sum, m) => sum + m.deductionPoints, 0);
    const totalNetScore = members.reduce((sum, m) => sum + m.netScore, 0);
    const averageScore =
      members.length > 0 ? Math.round((totalNetScore / members.length) * 10) / 10 : 0;
    return {
      team,
      memberCount: members.length,
      totalMerit,
      totalDeduction,
      totalNetScore,
      averageScore,
      rank: 1,
    };
  });

  teamRankings.sort((a, b) => {
    if (b.totalNetScore !== a.totalNetScore) return b.totalNetScore - a.totalNetScore;
    return b.averageScore - a.averageScore;
  });

  teamRankings.forEach((t, idx) => {
    if (idx > 0 && t.totalNetScore === teamRankings[idx - 1].totalNetScore) {
      t.rank = teamRankings[idx - 1].rank;
    } else {
      t.rank = idx + 1;
    }
  });

  return {
    individualRankings: individualRaw,
    teamRankings,
  };
}

export const PERMISSION_DESCRIPTIONS: { permission: Permission; label: string }[] = [
  { permission: 'attendance:write', label: 'Điểm danh tuần & cập nhật chuyên cần' },
  { permission: 'conduct:write', label: 'Ghi nhận điểm cộng / điểm trừ theo buổi' },
  { permission: 'conduct:configure_rules', label: 'Thiết lập thang điểm & tiêu chí thi đua' },
  { permission: 'duty:manage', label: 'Phân công & xác nhận trực nhật lớp' },
  { permission: 'seating:manage', label: 'Xếp sơ đồ chỗ ngồi & phân quyền vai trò' },
  { permission: 'announcements:create', label: 'Đăng thông báo & hoạt động lớp' },
  { permission: 'students:manage', label: 'Quản trị hồ sơ học sinh & nhập Excel' },
  { permission: 'reports:view_class', label: 'Xem báo cáo kỷ luật cả lớp & xuất Excel' },
  { permission: 'reports:view_own', label: 'Xem phiếu rèn luyện cá nhân gửi phụ huynh' },
  { permission: 'chatbot:dispatch', label: 'Gửi lệnh điều phối & điểm danh qua Trợ lý AI' },
];

export interface MonthlyParentReport {
  month: string; // YYYY-MM
  studentId: string;
  studentCode: string;
  fullName: string;
  team: TeamName;
  role: Exclude<UserRole, 'teacher' | 'guest'>;
  birthYear: number | null;
  presentDays: number;
  excusedDays: number;
  unexcusedDays: number;
  lateDays: number;
  totalMerit: number;
  totalDeduction: number;
  netScore: number;
  rating: 'Tốt' | 'Khá' | 'Trung bình' | 'Cần cải thiện';
  violations: ConductLog[];
  merits: ConductLog[];
  absentDates: { date: string; status: string; reason: string }[];
}

export function buildMonthlyParentReport(
  student: StudentPublicView | StudentRecord,
  attendance: AttendanceRecord[],
  conductLogs: ConductLog[],
  monthISO: string
): MonthlyParentReport {
  const monthAtt = attendance.filter(
    (a) => a.studentId === student.id && a.date.startsWith(monthISO)
  );
  const monthConduct = conductLogs.filter(
    (c) => c.studentId === student.id && c.date.startsWith(monthISO)
  );

  let presentDays = 0;
  let excusedDays = 0;
  let unexcusedDays = 0;
  let lateDays = 0;
  const absentDates: { date: string; status: string; reason: string }[] = [];

  for (const rec of monthAtt) {
    if (rec.status === 'present') presentDays += 1;
    else if (rec.status === 'late') lateDays += 1;
    else if (rec.status === 'excused') {
      excusedDays += 1;
      absentDates.push({
        date: rec.date,
        status: 'Nghỉ có phép',
        reason: rec.reason || 'Không ghi rõ lý do',
      });
    } else if (rec.status === 'unexcused') {
      unexcusedDays += 1;
      absentDates.push({
        date: rec.date,
        status: 'Nghỉ không phép',
        reason: rec.reason || 'Không có lý do',
      });
    }
  }

  const merits = monthConduct.filter((c) => c.points >= 0);
  const violations = monthConduct.filter((c) => c.points < 0);
  const totalMerit = merits.reduce((s, c) => s + c.points, 0);
  const totalDeduction = violations.reduce((s, c) => s + Math.abs(c.points), 0);
  const netScore = totalMerit - totalDeduction;

  let rating: MonthlyParentReport['rating'] = 'Tốt';
  if (unexcusedDays >= 2 || netScore <= -10) {
    rating = 'Cần cải thiện';
  } else if (unexcusedDays === 1 || netScore < 0) {
    rating = 'Trung bình';
  } else if (totalDeduction > 0 || lateDays > 1) {
    rating = 'Khá';
  }

  return {
    month: monthISO,
    studentId: student.id,
    studentCode: student.studentCode,
    fullName: student.fullName,
    team: student.team,
    role: student.role,
    birthYear: 'birthYear' in student ? student.birthYear : null,
    presentDays,
    excusedDays,
    unexcusedDays,
    lateDays,
    totalMerit,
    totalDeduction,
    netScore,
    rating,
    violations,
    merits,
    absentDates,
  };
}

export interface ImportedStudentInput {
  studentCode: string;
  fullName: string;
  schoolEmail: string;
  birthYear: number;
  team: TeamName;
  role: Exclude<UserRole, 'teacher' | 'guest'>;
  password: string;
  parentPhone?: string;
}

export function normalizeTeamName(raw: unknown): TeamName {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s.includes('2')) return 'To 2';
  if (s.includes('3')) return 'To 3';
  return 'To 1';
}

export function normalizeStudentRole(raw: unknown): Exclude<UserRole, 'teacher' | 'guest'> {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s.includes('lớp trưởng') || s === 'lop truong' || s === 'monitor') return 'monitor';
  if (s.includes('lớp phó') || s === 'lop pho' || s === 'vice_monitor') return 'vice_monitor';
  if (s.includes('bí thư') || s === 'bi thu' || s === 'secretary') return 'secretary';
  if (s.includes('tổ trưởng') || s === 'to truong' || s === 'team_leader') return 'team_leader';
  return 'student';
}

export function parseImportedStudentRows(
  rows: Record<string, unknown>[]
): { valid: ImportedStudentInput[]; errors: string[] } {
  const valid: ImportedStudentInput[] = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    const studentCode = String(
      row['MaHS'] ?? row['Mã học sinh'] ?? row['Mã sinh viên'] ?? row['studentCode'] ?? ''
    ).trim();
    const fullName = String(row['HoTen'] ?? row['Họ và tên'] ?? row['fullName'] ?? '').trim();
    const schoolEmail = String(
      row['EmailTruong'] ?? row['Email trường'] ?? row['Email'] ?? row['schoolEmail'] ?? ''
    ).trim();
    const birthYearRaw = Number(row['NamSinh'] ?? row['Năm sinh'] ?? row['birthYear'] ?? 2008);
    const birthYear =
      Number.isFinite(birthYearRaw) && birthYearRaw >= 1995 && birthYearRaw <= 2025
        ? Math.trunc(birthYearRaw)
        : 2008;
    const team = normalizeTeamName(row['To'] ?? row['Tổ'] ?? row['team']);
    const role = normalizeStudentRole(row['ChucVu'] ?? row['Chức vụ'] ?? row['role']);
    const password = String(
      row['MatKhau'] ?? row['Mật khẩu'] ?? row['password'] ?? studentCode ?? '123456'
    ).trim();
    const parentPhone = String(
      row['SDTPhuHuynh'] ?? row['SĐT phụ huynh'] ?? row['parentPhone'] ?? ''
    ).trim();

    if (!studentCode || !fullName || !schoolEmail) {
      errors.push(`Dòng ${rowNum}: Thiếu Mã HS, Họ tên hoặc Email trường.`);
      return;
    }

    valid.push({
      studentCode,
      fullName,
      schoolEmail,
      birthYear,
      team,
      role,
      password: password || '123456',
      parentPhone,
    });
  });

  return { valid, errors };
}

export interface StudentPeriodDisciplineSummary {
  studentId: string;
  studentCode: string;
  fullName: string;
  team: TeamName;
  role: Exclude<UserRole, 'teacher' | 'guest'>;
  present: number;
  excused: number;
  unexcused: number;
  late: number;
  merit: number;
  deduction: number;
  net: number;
  rating: 'Tốt' | 'Khá' | 'Trung bình' | 'Cần cải thiện';
  violationSummary: string;
}

export function computeStudentPeriodSummaries(
  students: (StudentPublicView | StudentRecord)[],
  attendance: AttendanceRecord[],
  conductLogs: ConductLog[],
  startDate: string,
  endDate: string
): StudentPeriodDisciplineSummary[] {
  return students.map((student) => {
    const att = attendance.filter(
      (a) => a.studentId === student.id && a.date >= startDate && a.date <= endDate
    );
    const logs = conductLogs.filter(
      (c) => c.studentId === student.id && c.date >= startDate && c.date <= endDate
    );

    const present = att.filter((a) => a.status === 'present').length;
    const excused = att.filter((a) => a.status === 'excused').length;
    const unexcused = att.filter((a) => a.status === 'unexcused').length;
    const late = att.filter((a) => a.status === 'late').length;

    const merit = logs.filter((l) => l.points >= 0).reduce((s, l) => s + l.points, 0);
    const deduction = logs
      .filter((l) => l.points < 0)
      .reduce((s, l) => s + Math.abs(l.points), 0);
    const net = merit - deduction;

    let rating: StudentPeriodDisciplineSummary['rating'] = 'Tốt';
    if (unexcused >= 2 || net <= -10) {
      rating = 'Cần cải thiện';
    } else if (unexcused === 1 || net < 0) {
      rating = 'Trung bình';
    } else if (deduction > 0 || late > 1) {
      rating = 'Khá';
    }

    const violationSummary = logs
      .filter((l) => l.points < 0)
      .map((l) => `${l.date}: ${l.category} (${l.points})`)
      .join('; ');

    return {
      studentId: student.id,
      studentCode: student.studentCode,
      fullName: student.fullName,
      team: student.team,
      role: student.role,
      present,
      excused,
      unexcused,
      late,
      merit,
      deduction,
      net,
      rating,
      violationSummary: violationSummary || 'Không có vi phạm',
    };
  });
}

export function buildPeriodDisciplineExcelRows(
  students: (StudentPublicView | StudentRecord)[],
  attendance: AttendanceRecord[],
  conductLogs: ConductLog[],
  startDate: string,
  endDate: string
): Record<string, string | number>[] {
  return computeStudentPeriodSummaries(students, attendance, conductLogs, startDate, endDate).map(
    (item, idx) => ({
      STT: idx + 1,
      MaHocSinh: item.studentCode,
      HoVaTen: item.fullName,
      To: TEAM_LABELS[item.team],
      ChucVu: ROLE_LABELS[item.role],
      BuoiCoMat: item.present,
      NghiCoPhep: item.excused,
      NghiKhongPhep: item.unexcused,
      DiMuon: item.late,
      DiemCong: item.merit,
      DiemTru: item.deduction,
      TongDiemThiDua: item.net,
      XepLoai: item.rating,
      ChiTietViPham: item.violationSummary,
    })
  );
}

export function buildStudentDiagnosticContext(
  student: StudentRecord,
  attendance: AttendanceRecord[],
  conductLogs: ConductLog[]
): string {
  const stAtt = attendance.filter((a) => a.studentId === student.id);
  const stLogs = conductLogs.filter((c) => c.studentId === student.id);

  const present = stAtt.filter((a) => a.status === 'present').length;
  const excused = stAtt.filter((a) => a.status === 'excused').length;
  const unexcused = stAtt.filter((a) => a.status === 'unexcused').length;
  const late = stAtt.filter((a) => a.status === 'late').length;

  const merits = stLogs.filter((l) => l.points >= 0);
  const violations = stLogs.filter((l) => l.points < 0);
  const totalMerit = merits.reduce((s, l) => s + l.points, 0);
  const totalDeduct = violations.reduce((s, l) => s + Math.abs(l.points), 0);

  return [
    `Họ tên: ${student.fullName}`,
    `Mã học sinh: ${student.studentCode}`,
    `Năm sinh: ${student.birthYear}`,
    `Tổ: ${TEAM_LABELS[student.team]}`,
    `Chức vụ: ${ROLE_LABELS[student.role]}`,
    `Điểm danh đã ghi nhận: ${stAtt.length} buổi (Có mặt: ${present}, Nghỉ có phép: ${excused}, Nghỉ không phép: ${unexcused}, Đi muộn: ${late})`,
    `Điểm thi đua: +${totalMerit} điểm tốt, -${totalDeduct} điểm trừ, Tổng ròng: ${totalMerit - totalDeduct}`,
    `Chi tiết điểm tốt: ${merits.length ? merits.map((m) => `${m.date} [${m.session}]: ${m.category} (+${m.points})`).join('; ') : 'Chưa ghi nhận'}`,
    `Chi tiết vi phạm: ${violations.length ? violations.map((v) => `${v.date} [${v.session}]: ${v.category} (${v.points})`).join('; ') : 'Không có vi phạm'}`,
  ].join('\n');
}

export function validateEmailFormat(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 150) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export interface StudentCredentialExportItem {
  studentCode: string;
  fullName: string;
  schoolEmail: string;
  team: TeamName;
  role: Exclude<UserRole, 'teacher' | 'guest'>;
  provisionedPassword: string | null;
  hasChangedPassword: boolean;
}

export function buildStudentCredentialsExcelRows(
  items: StudentCredentialExportItem[]
): Record<string, string | number>[] {
  return items.map((item, idx) => ({
    STT: idx + 1,
    MaHocSinh: item.studentCode,
    HoVaTen: item.fullName,
    To: TEAM_LABELS[item.team],
    ChucVu: ROLE_LABELS[item.role],
    EmailDangNhap: item.schoolEmail,
    MatKhau: item.provisionedPassword
      ? item.provisionedPassword
      : item.hasChangedPassword
      ? 'Đã tự đổi mật khẩu cá nhân'
      : 'Chưa lưu (nhấn Email / MK để cấp lại)',
    TrangThaiMatKhau: item.hasChangedPassword
      ? 'Học sinh đã đổi mật khẩu'
      : item.provisionedPassword
      ? 'Mật khẩu được cấp ban đầu'
      : 'Tài khoản tạo trước khi bật lưu mật khẩu cấp',
  }));
}

