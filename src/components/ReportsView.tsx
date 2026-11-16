import { useMemo, useState } from 'react';
import { CalendarDays, FileSpreadsheet, Printer, UserCheck } from 'lucide-react';
import type {
  AttendanceRecord,
  AuthUser,
  ConductLog,
  StudentPublicView,
  StudentRecord,
} from '../types/classroom';
import {
  buildMonthlyParentReport,
  canViewClassReports,
  computeStudentPeriodSummaries,
  getCurrentMonthISO,
  getTodayISO,
  getWeekDates,
  ROLE_LABELS,
  TEAM_LABELS,
} from '../utils/classroomLogic';
import {
  exportDisciplineReportExcel,
  exportIndividualParentReportExcel,
} from '../utils/excelHelper';

interface ReportsViewProps {
  classroomName: string;
  schoolYear: string;
  students: (StudentPublicView | StudentRecord)[];
  attendance: AttendanceRecord[];
  conductLogs: ConductLog[];
  user: AuthUser;
}

export function ReportsView({
  classroomName,
  schoolYear,
  students,
  attendance,
  conductLogs,
  user,
}: ReportsViewProps) {
  const canViewAll = canViewClassReports(user.role);

  const [periodMode, setPeriodMode] = useState<'week' | 'month'>('week');
  const [weekAnchor, setWeekAnchor] = useState<string>(getTodayISO());
  const [reportMonth, setReportMonth] = useState<string>(getCurrentMonthISO());
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  const { startDate, endDate, periodLabel } = useMemo(() => {
    if (periodMode === 'week') {
      const dates = getWeekDates(weekAnchor);
      return {
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        periodLabel: `Tuần (${dates[0]} đến ${dates[dates.length - 1]})`,
      };
    }
    return {
      startDate: `${reportMonth}-01`,
      endDate: `${reportMonth}-31`,
      periodLabel: `Tháng ${reportMonth}`,
    };
  }, [periodMode, weekAnchor, reportMonth]);

  const periodSummaries = useMemo(
    () =>
      canViewAll
        ? computeStudentPeriodSummaries(students, attendance, conductLogs, startDate, endDate)
        : [],
    [canViewAll, students, attendance, conductLogs, startDate, endDate]
  );

  const classTotals = useMemo(() => {
    const totalMerit = periodSummaries.reduce((s, r) => s + r.merit, 0);
    const totalDeduction = periodSummaries.reduce((s, r) => s + r.deduction, 0);
    const totalAbsences = periodSummaries.reduce((s, r) => s + r.excused + r.unexcused, 0);
    const totalPresent = periodSummaries.reduce((s, r) => s + r.present, 0);
    const totalAttRecords = totalPresent + totalAbsences + periodSummaries.reduce((s, r) => s + r.late, 0);
    const attendanceRate =
      totalAttRecords > 0 ? Math.round((totalPresent / totalAttRecords) * 100) : 100;

    return {
      totalMerit,
      totalDeduction,
      totalAbsences,
      attendanceRate,
    };
  }, [periodSummaries]);

  const targetStudentForParent = useMemo(() => {
    if (students.length === 0) return null;
    if (canViewAll) {
      return students.find((s) => s.id === selectedStudentId) || students[0];
    }
    return students.find((s) => s.id === user.id) || null;
  }, [students, canViewAll, selectedStudentId, user.id]);

  const parentReport = useMemo(() => {
    if (!targetStudentForParent) return null;
    return buildMonthlyParentReport(
      targetStudentForParent,
      attendance,
      conductLogs,
      reportMonth
    );
  }, [targetStudentForParent, attendance, conductLogs, reportMonth]);

  const handleExportPeriodExcel = () => {
    const fileName =
      periodMode === 'week'
        ? `bao-cao-ky-luat-tuan-${startDate}.xlsx`
        : `bao-cao-ky-luat-thang-${reportMonth}.xlsx`;
    exportDisciplineReportExcel({
      students,
      attendance,
      conductLogs,
      startDate,
      endDate,
      fileName,
    });
  };

  const getRatingStyle = (rating: string) => {
    if (rating === 'Tốt') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (rating === 'Khá') return 'text-blue-700 bg-blue-50 border-blue-200';
    if (rating === 'Trung bình') return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-red-700 bg-red-50 border-red-200';
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5 no-print">
        <p className="text-xs font-medium text-slate-500">
          {classroomName} · Năm học {schoolYear}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
          Báo cáo kỷ luật &amp; Phiếu gửi phụ huynh
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {canViewAll
            ? 'Tổng hợp tình hình chuyên cần, điểm cộng/trừ toàn lớp theo tuần và tháng, xuất Excel và tạo phiếu báo phụ huynh.'
            : 'Xem phiếu tổng hợp tình hình chuyên cần và kỷ luật hàng tháng dành cho phụ huynh.'}
        </p>
      </div>

      {/* Section 1: Weekly / Monthly Overall Class Discipline Report (Teacher, Class President, Secretary) */}
      {canViewAll && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 no-print">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Báo cáo tổng hợp kỷ luật cả lớp
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Kỳ thống kê: {periodLabel} · Xuất file Excel gồm 2 trang tính (Bảng tổng hợp &amp; Chi tiết ghi nhận).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap lg:shrink-0">
              {/* Segmented Control */}
              <div
                role="group"
                aria-label="Chọn kỳ báo cáo"
                className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setPeriodMode('week')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    periodMode === 'week'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Theo tuần
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodMode('month')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    periodMode === 'month'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Theo tháng
                </button>
              </div>

              {periodMode === 'week' ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    aria-label="Chọn ngày trong tuần báo cáo"
                    value={weekAnchor}
                    onChange={(e) => setWeekAnchor(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs font-mono text-slate-800"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <input
                    type="month"
                    aria-label="Chọn tháng báo cáo lớp"
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs font-mono text-slate-800"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handleExportPeriodExcel}
                disabled={students.length === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>
                  {periodMode === 'week' ? 'Xuất Excel Tuần (.xlsx)' : 'Xuất Excel Tháng (.xlsx)'}
                </span>
              </button>
            </div>
          </div>

          {/* 4-column Class Discipline Summary Strip */}
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-xs text-slate-500">Tổng điểm cộng toàn lớp</p>
              <p className="mt-1 font-mono text-xl font-semibold text-emerald-700 tabular-nums">
                +{classTotals.totalMerit}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-xs text-slate-500">Tổng điểm trừ toàn lớp</p>
              <p className="mt-1 font-mono text-xl font-semibold text-red-600 tabular-nums">
                {classTotals.totalDeduction > 0 ? `-${classTotals.totalDeduction}` : '0'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-xs text-slate-500">Tổng lượt vắng học</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {classTotals.totalAbsences}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-xs text-slate-500">Tỷ lệ chuyên cần kỳ</p>
              <p className="mt-1 font-mono text-xl font-semibold text-blue-700 tabular-nums">
                {classTotals.attendanceRate}%
              </p>
            </div>
          </div>

          {/* Class Discipline Table */}
          <div className="mt-5 overflow-x-auto">
            {periodSummaries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">Chưa có dữ liệu học sinh</p>
                <p className="mt-1 text-xs text-slate-500">
                  Bảng tổng hợp kỷ luật tuần và tháng sẽ tự động hiển thị sau khi Giáo viên thêm học sinh vào lớp.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="px-3 py-2.5">STT</th>
                    <th className="px-3 py-2.5">Mã HS</th>
                    <th className="px-3 py-2.5">Họ và tên</th>
                    <th className="px-3 py-2.5">Tổ · Chức vụ</th>
                    <th className="px-3 py-2.5 text-right">Có mặt</th>
                    <th className="px-3 py-2.5 text-right">Vắng (CP/KP)</th>
                    <th className="px-3 py-2.5 text-right">Đi muộn</th>
                    <th className="px-3 py-2.5 text-right">Điểm tốt</th>
                    <th className="px-3 py-2.5 text-right">Điểm trừ</th>
                    <th className="px-3 py-2.5 text-right">Tổng điểm</th>
                    <th className="px-3 py-2.5 text-right">Xếp loại</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {periodSummaries.map((row, idx) => (
                    <tr key={row.studentId} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700">
                        {row.studentCode}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">{row.fullName}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {TEAM_LABELS[row.team]} · {ROLE_LABELS[row.role]}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-emerald-700 tabular-nums">
                        {row.present}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-700 tabular-nums">
                        {row.excused}/{row.unexcused}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-700 tabular-nums">
                        {row.late}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-emerald-700 tabular-nums">
                        +{row.merit}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-red-600 tabular-nums">
                        {row.deduction > 0 ? `-${row.deduction}` : '0'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums">
                        {row.net >= 0 ? `+${row.net}` : row.net}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${getRatingStyle(
                            row.rating
                          )}`}
                        >
                          {row.rating}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* Section 2: Monthly Individual Student Disciplinary Report for Parents */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between no-print">
          <div>
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-blue-700" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Báo cáo kỷ luật cá nhân hàng tháng gửi phụ huynh
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Phiếu đánh giá chuyên cần, điểm cộng, vi phạm kỷ luật và xếp loại rèn luyện tháng của từng học sinh.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2.5 lg:flex-nowrap lg:shrink-0">
            <div>
              <label htmlFor="parent-month-select" className="block text-xs font-medium text-slate-700 mb-1">
                Tháng báo cáo
              </label>
              <input
                id="parent-month-select"
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs font-mono text-slate-800"
              />
            </div>

            {canViewAll && (
              <div>
                <label htmlFor="parent-student-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Học sinh
                </label>
                <select
                  id="parent-student-select"
                  value={targetStudentForParent?.id || ''}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="h-9 min-w-[200px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900"
                >
                  {students.length === 0 && <option value="">Chưa có học sinh</option>}
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.studentCode})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              disabled={!parentReport}
              onClick={() => parentReport && exportIndividualParentReportExcel(parentReport, classroomName)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
              <span>Xuất Excel cá nhân</span>
            </button>

            <button
              type="button"
              disabled={!parentReport}
              onClick={() => window.print()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>In phiếu phụ huynh</span>
            </button>
          </div>
        </div>

        {parentReport ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-6">
            {/* Printable Report Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Phiếu thông báo tình hình rèn luyện &amp; kỷ luật tháng {parentReport.month}
                </p>
                <h3 className="mt-1.5 font-display text-xl font-bold text-slate-900">
                  {parentReport.fullName}
                  <span className="ml-2 font-mono text-sm font-medium text-slate-500">
                    ({parentReport.studentCode})
                  </span>
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Lớp: {classroomName} · Năm học {schoolYear} · {TEAM_LABELS[parentReport.team]} ·{' '}
                  {ROLE_LABELS[parentReport.role]}
                  {parentReport.birthYear ? ` · Năm sinh: ${parentReport.birthYear}` : ''}
                </p>
              </div>

              <div className="text-left sm:text-right">
                <p className="text-xs text-slate-500">Xếp loại hạnh kiểm tháng</p>
                <span
                  className={`mt-1 inline-block rounded-md border px-3 py-1 font-display text-sm font-bold ${getRatingStyle(
                    parentReport.rating
                  )}`}
                >
                  {parentReport.rating}
                </span>
              </div>
            </div>

            {/* 4 Key Metrics */}
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                <p className="text-xs text-slate-500">Số buổi có mặt</p>
                <p className="mt-1 font-mono text-xl font-semibold text-emerald-700 tabular-nums">
                  {parentReport.presentDays}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Đi muộn: {parentReport.lateDays} buổi</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                <p className="text-xs text-slate-500">Vắng (Có phép / Không phép)</p>
                <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                  {parentReport.excusedDays} / {parentReport.unexcusedDays}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Buổi nghỉ học</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                <p className="text-xs text-slate-500">Điểm tốt / Điểm trừ</p>
                <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                  <span className="text-emerald-700">+{parentReport.totalMerit}</span>
                  <span className="text-slate-400"> / </span>
                  <span className="text-red-600">
                    {parentReport.totalDeduction > 0 ? `-${parentReport.totalDeduction}` : '0'}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Trong tháng {parentReport.month}</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                <p className="text-xs text-slate-500">Tổng điểm rèn luyện</p>
                <p className="mt-1 font-mono text-xl font-semibold text-blue-700 tabular-nums">
                  {parentReport.netScore >= 0 ? `+${parentReport.netScore}` : parentReport.netScore}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Điểm ròng tích lũy</p>
              </div>
            </div>

            {/* Detailed Absence, Merit & Violation Breakdown */}
            <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-200 pt-5 md:grid-cols-3 text-xs">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="font-semibold text-slate-900 mb-2">Chi tiết ngày vắng mặt</h4>
                {parentReport.absentDates.length === 0 ? (
                  <p className="text-slate-500">Đi học chuyên cần đầy đủ, không nghỉ buổi nào trong tháng.</p>
                ) : (
                  <ul className="space-y-1.5 text-slate-700">
                    {parentReport.absentDates.map((a, idx) => (
                      <li key={idx} className="flex justify-between gap-2 border-b border-slate-100 pb-1 last:border-0">
                        <span className="font-mono">{a.date}</span>
                        <span className="text-right">
                          {a.status} ({a.reason})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="font-semibold text-slate-900 mb-2">Ghi nhận điểm tốt &amp; khen thưởng</h4>
                {parentReport.merits.length === 0 ? (
                  <p className="text-slate-500">Chưa có ghi nhận điểm cộng trong tháng.</p>
                ) : (
                  <ul className="space-y-1.5 text-emerald-800">
                    {parentReport.merits.map((m) => (
                      <li key={m.id} className="flex justify-between gap-2 border-b border-slate-100 pb-1 last:border-0">
                        <span>
                          <span className="font-mono text-slate-500">{m.date}</span> · {m.category}
                        </span>
                        <span className="font-mono font-semibold shrink-0">+{m.points}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="font-semibold text-slate-900 mb-2">Chi tiết vi phạm kỷ luật</h4>
                {parentReport.violations.length === 0 ? (
                  <p className="text-slate-500">Không có vi phạm kỷ luật nào được ghi nhận trong tháng.</p>
                ) : (
                  <ul className="space-y-1.5 text-red-700">
                    {parentReport.violations.map((v) => (
                      <li key={v.id} className="flex justify-between gap-2 border-b border-slate-100 pb-1 last:border-0">
                        <span>
                          <span className="font-mono text-slate-500">{v.date}</span> · {v.category}
                        </span>
                        <span className="font-mono font-semibold shrink-0">{v.points}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-slate-200 py-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              {canViewAll
                ? 'Chưa có học sinh trong lớp để tạo phiếu phụ huynh'
                : 'Chưa tìm thấy hồ sơ học sinh tương ứng với tài khoản này'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {canViewAll
                ? 'Giáo viên chủ nhiệm vui lòng thêm học sinh ở mục Quản trị để xuất báo cáo.'
                : 'Vui lòng liên hệ Giáo viên chủ nhiệm nếu cần cập nhật hồ sơ cá nhân.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
