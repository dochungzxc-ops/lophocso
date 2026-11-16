import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthlyParentReport,
  buildPeriodDisciplineExcelRows,
  buildStudentCredentialsExcelRows,
  canCreateAnnouncements,
  canEditConductPoints,
  canManagePointRules,
  canManageStudents,
  canTakeAttendance,
  canUseChatbotDispatch,
  canViewClassReports,
  computeDailyAttendanceSummary,
  computeWeeklyRankings,
  getWeekDates,
  hasPermission,
  parseImportedStudentRows,
  validateEmailFormat,
} from './classroomLogic';
import type { AttendanceRecord, ConductLog, StudentRecord } from '../types/classroom';

const sampleStudents: StudentRecord[] = [
  {
    id: 's1',
    studentCode: 'HS001',
    fullName: 'Nguyễn Văn An',
    schoolEmail: 'an.hs001@school.edu.vn',
    birthYear: 2008,
    team: 'To 1',
    role: 'monitor',
    seatRow: 0,
    seatCol: 0,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
  {
    id: 's2',
    studentCode: 'HS002',
    fullName: 'Trần Thị Bình',
    schoolEmail: 'binh.hs002@school.edu.vn',
    birthYear: 2008,
    team: 'To 2',
    role: 'student',
    seatRow: 0,
    seatCol: 1,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
];

test('RBAC permission matrix enforces strict role boundaries', () => {
  assert.equal(canTakeAttendance('teacher'), true);
  assert.equal(canTakeAttendance('monitor'), true);
  assert.equal(canTakeAttendance('secretary'), true);
  assert.equal(canTakeAttendance('vice_monitor'), false);
  assert.equal(canTakeAttendance('team_leader'), false);
  assert.equal(canTakeAttendance('student'), false);
  assert.equal(canTakeAttendance('guest'), false);

  assert.equal(canEditConductPoints('team_leader'), true);
  assert.equal(canEditConductPoints('vice_monitor'), true);
  assert.equal(canEditConductPoints('student'), false);

  assert.equal(canManagePointRules('teacher'), true);
  assert.equal(canManagePointRules('monitor'), true);
  assert.equal(canManagePointRules('secretary'), true);
  assert.equal(canManagePointRules('team_leader'), false);
  assert.equal(canManagePointRules('vice_monitor'), false);

  assert.equal(canManageStudents('teacher'), true);
  assert.equal(canManageStudents('monitor'), false);
  assert.equal(hasPermission('teacher', 'seating:manage'), true);
  assert.equal(hasPermission('monitor', 'seating:manage'), false);

  assert.equal(canCreateAnnouncements('teacher'), true);
  assert.equal(canCreateAnnouncements('monitor'), true);
  assert.equal(canCreateAnnouncements('secretary'), true);
  assert.equal(canCreateAnnouncements('team_leader'), false);
  assert.equal(canCreateAnnouncements('student'), false);

  assert.equal(canViewClassReports('teacher'), true);
  assert.equal(canViewClassReports('monitor'), true);
  assert.equal(canViewClassReports('secretary'), true);
  assert.equal(canViewClassReports('student'), false);
  assert.equal(hasPermission('student', 'reports:view_own'), true);
  assert.equal(hasPermission('guest', 'reports:view_own'), false);

  assert.equal(canUseChatbotDispatch('teacher'), true);
  assert.equal(canUseChatbotDispatch('monitor'), true);
  assert.equal(canUseChatbotDispatch('secretary'), true);
  assert.equal(canUseChatbotDispatch('team_leader'), true);
  assert.equal(canUseChatbotDispatch('student'), false);
  assert.equal(canUseChatbotDispatch('guest'), false);
});

test('computeDailyAttendanceSummary counts statuses accurately', () => {
  const attendance: AttendanceRecord[] = [
    {
      id: 'a1',
      date: '2026-11-16',
      studentId: 's1',
      status: 'present',
      recordedBy: 'teacher',
      updatedAt: '2026-11-16T07:00:00Z',
    },
    {
      id: 'a2',
      date: '2026-11-16',
      studentId: 's2',
      status: 'excused',
      reason: 'Bị sốt',
      recordedBy: 'teacher',
      updatedAt: '2026-11-16T07:00:00Z',
    },
  ];
  const summary = computeDailyAttendanceSummary(sampleStudents, attendance, '2026-11-16');
  assert.equal(summary.totalStudents, 2);
  assert.equal(summary.present, 1);
  assert.equal(summary.excused, 1);
  assert.equal(summary.unexcused, 0);
  assert.equal(summary.unmarked, 0);
});

test('computeWeeklyRankings ranks individuals and teams accurately', () => {
  const weekDates = getWeekDates('2026-11-16');
  assert.equal(weekDates.length, 6);
  assert.equal(weekDates[0], '2026-11-16');

  const logs: ConductLog[] = [
    {
      id: 'c1',
      date: '2026-11-16',
      session: 'Sang',
      studentId: 's1',
      category: 'Phát biểu tốt',
      points: 5,
      recordedBy: 'teacher',
      recordedByName: 'Cô Thủy',
      createdAt: '2026-11-16T08:00:00Z',
    },
    {
      id: 'c2',
      date: '2026-11-17',
      session: 'Chieu',
      studentId: 's2',
      category: 'Đi học muộn',
      points: -2,
      recordedBy: 'teacher',
      recordedByName: 'Cô Thủy',
      createdAt: '2026-11-17T08:00:00Z',
    },
  ];

  const { individualRankings, teamRankings } = computeWeeklyRankings(sampleStudents, logs, weekDates);
  assert.equal(individualRankings[0].studentId, 's1');
  assert.equal(individualRankings[0].netScore, 5);
  assert.equal(individualRankings[0].rank, 1);
  assert.equal(individualRankings[1].studentId, 's2');
  assert.equal(individualRankings[1].netScore, -2);
  assert.equal(teamRankings[0].team, 'To 1');
  assert.equal(teamRankings[0].totalNetScore, 5);
});

test('buildMonthlyParentReport and Excel builders produce accurate parent and period reports', () => {
  const attendance: AttendanceRecord[] = [
    {
      id: 'a1',
      date: '2026-11-10',
      studentId: 's2',
      status: 'unexcused',
      recordedBy: 'teacher',
      updatedAt: '2026-11-10T07:00:00Z',
    },
  ];
  const logs: ConductLog[] = [
    {
      id: 'c1',
      date: '2026-11-12',
      session: 'Sang',
      studentId: 's2',
      category: 'Quên đồng phục',
      points: -3,
      recordedBy: 'teacher',
      recordedByName: 'Cô Thủy',
      createdAt: '2026-11-12T08:00:00Z',
    },
  ];

  const report = buildMonthlyParentReport(sampleStudents[1], attendance, logs, '2026-11');
  assert.equal(report.unexcusedDays, 1);
  assert.equal(report.totalDeduction, 3);
  assert.equal(report.netScore, -3);
  assert.equal(report.rating, 'Trung bình');

  const excelRows = buildPeriodDisciplineExcelRows(
    sampleStudents,
    attendance,
    logs,
    '2026-11-01',
    '2026-11-30'
  );
  assert.equal(excelRows.length, 2);
  assert.equal(excelRows[1].NghiKhongPhep, 1);
  assert.equal(excelRows[1].TongDiemThiDua, -3);
});

test('parseImportedStudentRows validates required fields and normalizes teams/roles', () => {
  const { valid, errors } = parseImportedStudentRows([
    {
      MaHS: 'HS101',
      HoTen: 'Lê Minh Khôi',
      EmailTruong: 'khoi@school.edu.vn',
      NamSinh: 2009,
      To: 'Tổ 2',
      ChucVu: 'Bí thư',
      MatKhau: 'abc123',
    },
    {
      MaHS: '',
      HoTen: 'Thiếu Mã',
      EmailTruong: '',
    },
  ]);

  assert.equal(valid.length, 1);
  assert.equal(errors.length, 1);
  assert.equal(valid[0].team, 'To 2');
  assert.equal(valid[0].role, 'secretary');
});

test('validateEmailFormat and buildStudentCredentialsExcelRows handle account credential exports cleanly', () => {
  assert.equal(validateEmailFormat('nguyenthithuy@gmail.com'), true);
  assert.equal(validateEmailFormat('hs001@school.edu.vn'), true);
  assert.equal(validateEmailFormat('invalid-email'), false);
  assert.equal(validateEmailFormat(''), false);

  const exportRows = buildStudentCredentialsExcelRows([
    {
      studentCode: 'HS001',
      fullName: 'Nguyễn Văn An',
      schoolEmail: 'an@school.edu.vn',
      team: 'To 1',
      role: 'student',
      provisionedPassword: 'hs001pass',
      hasChangedPassword: false,
    },
    {
      studentCode: 'HS002',
      fullName: 'Trần Thị Bình',
      schoolEmail: 'binh@school.edu.vn',
      team: 'To 2',
      role: 'secretary',
      provisionedPassword: null,
      hasChangedPassword: true,
    },
  ]);

  assert.equal(exportRows.length, 2);
  assert.equal(exportRows[0].MatKhau, 'hs001pass');
  assert.equal(exportRows[0].TrangThaiMatKhau, 'Mật khẩu được cấp ban đầu');
  assert.equal(exportRows[1].MatKhau, 'Đã tự đổi mật khẩu cá nhân');
  assert.equal(exportRows[1].TrangThaiMatKhau, 'Học sinh đã đổi mật khẩu');
});
