import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CalendarDays } from 'lucide-react';
import type {
  AttendanceRecord,
  AttendanceStatus,
  AuthUser,
  StudentPublicView,
  StudentRecord,
} from '../types/classroom';
import {
  canTakeAttendance,
  computeDailyAttendanceSummary,
  getTodayISO,
  getWeekDates,
  getWeekdayLabelVi,
  TEAM_LABELS,
} from '../utils/classroomLogic';
import { classroomApi } from '../lib/api';

interface AttendanceViewProps {
  students: (StudentPublicView | StudentRecord)[];
  attendance: AttendanceRecord[];
  user: AuthUser | null;
  onRefresh: () => Promise<void>;
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Có mặt',
  excused: 'Nghỉ có phép',
  unexcused: 'Nghỉ không phép',
  late: 'Đi muộn',
};

export function AttendanceView({ students, attendance, user, onRefresh }: AttendanceViewProps) {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayISO());
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const canEdit = user ? canTakeAttendance(user.role) : false;

  const [draftMap, setDraftMap] = useState<
    Record<string, { status: AttendanceStatus; reason: string }>
  >({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string>('');

  // Sync draft when date or attendance changes
  useEffect(() => {
    const next: Record<string, { status: AttendanceStatus; reason: string }> = {};
    for (const st of students) {
      const existing = attendance.find(
        (a) => a.date === selectedDate && a.studentId === st.id
      );
      next[st.id] = {
        status: existing?.status || 'present',
        reason: existing?.reason || '',
      };
    }
    setDraftMap(next);
  }, [selectedDate, students, attendance]);

  const weeklySummaries = useMemo(
    () => weekDates.map((d) => computeDailyAttendanceSummary(students, attendance, d)),
    [weekDates, students, attendance]
  );

  const selectedSummary = useMemo(
    () => computeDailyAttendanceSummary(students, attendance, selectedDate),
    [students, attendance, selectedDate]
  );

  const handleMarkAllPresent = () => {
    const next: Record<string, { status: AttendanceStatus; reason: string }> = {};
    for (const st of students) {
      next[st.id] = { status: 'present', reason: '' };
    }
    setDraftMap(next);
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback('');
    try {
      const entries = students.map((st) => ({
        studentId: st.id,
        status: draftMap[st.id]?.status || 'present',
        reason: draftMap[st.id]?.reason || '',
      }));
      await classroomApi.saveBulkAttendance(selectedDate, entries);
      await onRefresh();
      setFeedback(`Đã lưu điểm danh ngày ${selectedDate}.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Lỗi khi lưu điểm danh.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Điểm danh theo tuần
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {canEdit
              ? 'Giáo viên chủ nhiệm, Lớp trưởng và Bí thư có quyền điểm danh từng ngày và ghi lý do vắng.'
              : 'Chế độ chỉ xem thống kê chuyên cần. Chỉ Giáo viên chủ nhiệm, Lớp trưởng và Bí thư được phép điểm danh.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="attendance-date-picker" className="text-xs font-medium text-slate-600 whitespace-nowrap">
            Chọn ngày
          </label>
          <input
            id="attendance-date-picker"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 font-mono"
          />
        </div>
      </div>

      {/* Weekly Visual Bar Summary */}
      <section aria-label="Thống kê tuần" className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="h-4 w-4 text-blue-700" />
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Tổng hợp chuyên cần trong tuần ({weekDates[0]} đến {weekDates[weekDates.length - 1]})
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {weeklySummaries.map((day) => {
            const isSelected = day.date === selectedDate;
            const total = day.totalStudents || 1;
            const presentPct = day.totalStudents > 0 ? Math.round((day.present / total) * 100) : 0;
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDate(day.date)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/60'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <p className="text-xs font-semibold text-slate-900">
                  {getWeekdayLabelVi(day.date)}
                </p>
                <p className="font-mono text-[11px] text-slate-500 tabular-nums">{day.date}</p>
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-emerald-600 transition-all"
                    style={{ width: `${presentPct}%` }}
                  />
                </div>
                <p className="mt-2 font-mono text-xs text-slate-700 tabular-nums">
                  Có mặt: {day.present}/{day.totalStudents}
                </p>
                <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                  Vắng: {day.excused + day.unexcused} · Muộn: {day.late}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Selected Day Action & Roster Table */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Danh sách điểm danh · {getWeekdayLabelVi(selectedDate)} ({selectedDate})
            </h2>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
              Có mặt: {selectedSummary.present} · Có phép: {selectedSummary.excused} · Không phép: {selectedSummary.unexcused} · Muộn: {selectedSummary.late}
            </p>
          </div>

          {canEdit && students.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleMarkAllPresent}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Đánh dấu đủ sĩ số</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex h-9 items-center rounded-lg bg-blue-700 px-4 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
              >
                {saving ? 'Đang lưu...' : 'Lưu điểm danh'}
              </button>
            </div>
          )}
        </div>

        {feedback && (
          <div className="border-b border-slate-200 bg-blue-50 px-5 py-2.5 text-xs font-medium text-blue-800">
            {feedback}
          </div>
        )}

        {students.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-slate-700">Chưa có học sinh trong lớp</p>
            <p className="mt-1 text-xs text-slate-500">
              Giáo viên chủ nhiệm cần thêm hoặc nhập danh sách học sinh từ Excel trước khi điểm danh.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="px-5 py-3">Mã HS</th>
                  <th className="px-5 py-3">Họ và tên</th>
                  <th className="px-5 py-3">Tổ</th>
                  <th className="px-5 py-3">Trạng thái</th>
                  <th className="px-5 py-3">Lý do (nếu vắng/muộn)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((st) => {
                  const rec = attendance.find(
                    (a) => a.date === selectedDate && a.studentId === st.id
                  );
                  const currentStatus = canEdit
                    ? draftMap[st.id]?.status || 'present'
                    : rec?.status;
                  const currentReason = canEdit
                    ? draftMap[st.id]?.reason || ''
                    : rec?.reason || '';

                  return (
                    <tr key={st.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-mono text-xs text-slate-600 tabular-nums">
                        {st.studentCode}
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900">{st.fullName}</td>
                      <td className="px-5 py-3 text-slate-600">{TEAM_LABELS[st.team]}</td>
                      <td className="px-5 py-3">
                        {canEdit ? (
                          <div className="flex flex-wrap gap-1.5">
                            {(['present', 'excused', 'unexcused', 'late'] as AttendanceStatus[]).map(
                              (statusOpt) => {
                                const active = currentStatus === statusOpt;
                                return (
                                  <button
                                    key={statusOpt}
                                    type="button"
                                    onClick={() =>
                                      setDraftMap((prev) => ({
                                        ...prev,
                                        [st.id]: {
                                          status: statusOpt,
                                          reason: prev[st.id]?.reason || '',
                                        },
                                      }))
                                    }
                                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                                      active
                                        ? statusOpt === 'present'
                                          ? 'bg-emerald-600 text-white'
                                          : statusOpt === 'excused'
                                          ? 'bg-amber-600 text-white'
                                          : statusOpt === 'unexcused'
                                          ? 'bg-red-600 text-white'
                                          : 'bg-blue-600 text-white'
                                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    {STATUS_LABELS[statusOpt]}
                                  </button>
                                );
                              }
                            )}
                          </div>
                        ) : (
                          <span
                            className={`text-xs font-medium ${
                              currentStatus === 'present'
                                ? 'text-emerald-700'
                                : currentStatus === 'excused'
                                ? 'text-amber-700'
                                : currentStatus === 'unexcused'
                                ? 'text-red-700'
                                : currentStatus === 'late'
                                ? 'text-blue-700'
                                : 'text-slate-400'
                            }`}
                          >
                            {currentStatus ? STATUS_LABELS[currentStatus] : 'Chưa ghi nhận'}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {canEdit ? (
                          <input
                            type="text"
                            aria-label={`Lý do của ${st.fullName}`}
                            value={currentReason}
                            onChange={(e) =>
                              setDraftMap((prev) => ({
                                ...prev,
                                [st.id]: {
                                  status: prev[st.id]?.status || 'present',
                                  reason: e.target.value,
                                },
                              }))
                            }
                            placeholder="Ghi lý do nếu có..."
                            className="h-8 w-full min-w-[180px] rounded-md border border-slate-200 px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                          />
                        ) : (
                          <span className="text-xs text-slate-500">
                            {user ? currentReason || '—' : 'Ẩn theo quyền riêng tư'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
