import { useMemo, useState } from 'react';
import { Plus, Settings2, Trash2, Award } from 'lucide-react';
import type {
  AuthUser,
  ConductLog,
  ConductSession,
  PointRule,
  StudentPublicView,
  StudentRecord,
} from '../types/classroom';
import {
  canEditConductPoints,
  canManagePointRules,
  computeWeeklyRankings,
  getTodayISO,
  getWeekDates,
  ROLE_LABELS,
  TEAM_LABELS,
} from '../utils/classroomLogic';
import { classroomApi } from '../lib/api';

interface ConductViewProps {
  students: (StudentPublicView | StudentRecord)[];
  conductLogs: ConductLog[];
  pointRules: PointRule[];
  user: AuthUser | null;
  onRefresh: () => Promise<void>;
}

export function ConductView({
  students,
  conductLogs,
  pointRules,
  user,
  onRefresh,
}: ConductViewProps) {
  const canEditPoints = user ? canEditConductPoints(user.role) : false;
  const canEditRules = user ? canManagePointRules(user.role) : false;

  const [anchorDate, setAnchorDate] = useState(getTodayISO());
  const weekDates = useMemo(() => getWeekDates(anchorDate), [anchorDate]);

  const { individualRankings, teamRankings } = useMemo(
    () => computeWeeklyRankings(students, conductLogs, weekDates),
    [students, conductLogs, weekDates]
  );

  // Form state for adding merit/deduction
  const [studentId, setStudentId] = useState('');
  const [session, setSession] = useState<ConductSession>('Sang');
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [category, setCategory] = useState('');
  const [points, setPoints] = useState<number>(2);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Form state for Point Rules (Teacher, Monitor, Secretary)
  const [showRulePanel, setShowRulePanel] = useState(false);
  const [ruleLabel, setRuleLabel] = useState('');
  const [rulePoints, setRulePoints] = useState<number>(2);

  const handleRuleSelect = (ruleId: string) => {
    setSelectedRuleId(ruleId);
    const found = pointRules.find((r) => r.id === ruleId);
    if (found) {
      setCategory(found.label);
      setPoints(found.points);
    }
  };

  const handleAddConduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('');
    const targetStudentId = studentId || students[0]?.id;
    if (!targetStudentId) {
      setFeedback('Vui lòng chọn học sinh.');
      return;
    }
    setSubmitting(true);
    try {
      await classroomApi.addConductLog({
        date: anchorDate,
        session,
        studentId: targetStudentId,
        category: category.trim(),
        points: Number(points),
        note: note.trim(),
      });
      setCategory('');
      setNote('');
      setSelectedRuleId('');
      await onRefresh();
      setFeedback(
        Number(points) < 0
          ? 'Đã ghi nhận điểm trừ và tự động gửi thông báo ứng dụng.'
          : 'Đã ghi nhận điểm tốt.'
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Lỗi khi cập nhật điểm.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleLabel.trim() || rulePoints === 0) return;
    try {
      await classroomApi.createPointRule(ruleLabel.trim(), Number(rulePoints));
      setRuleLabel('');
      await onRefresh();
    } catch {
      // ignore
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await classroomApi.deletePointRule(id);
      await onRefresh();
    } catch {
      // ignore
    }
  };

  const handleDeleteLog = async (id: string) => {
    try {
      await classroomApi.deleteConductLog(id);
      await onRefresh();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Thi đua, điểm tốt &amp; vi phạm theo tuần
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Giáo viên, Lớp trưởng, Lớp phó, Bí thư và 3 Tổ trưởng được phép cộng/trừ điểm. Giáo viên, Lớp trưởng, Bí thư cấu hình quy tắc điểm.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canEditRules && (
            <button
              type="button"
              onClick={() => setShowRulePanel((v) => !v)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>Cài đặt thang điểm ({pointRules.length})</span>
            </button>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="conduct-week-date" className="text-xs font-medium text-slate-600">
              Tuần chứa ngày
            </label>
            <input
              id="conduct-week-date"
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono"
            />
          </div>
        </div>
      </div>

      {/* Point Rules Settings (Teacher / Monitor / Secretary) */}
      {canEditRules && showRulePanel && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Cài đặt danh mục điểm tốt &amp; vi phạm
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Nhập số dương cho điểm tốt (ví dụ +2, +5) hoặc số âm cho vi phạm (ví dụ -2, -5).
          </p>

          <form onSubmit={handleAddRule} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              aria-label="Tên tiêu chí điểm"
              value={ruleLabel}
              onChange={(e) => setRuleLabel(e.target.value)}
              placeholder="Ví dụ: Phát biểu xây dựng bài hoặc Đi học muộn"
              required
              className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
            />
            <input
              type="number"
              aria-label="Số điểm quy định"
              value={rulePoints}
              onChange={(e) => setRulePoints(Number(e.target.value))}
              required
              className="h-10 w-full sm:w-32 rounded-lg border border-slate-200 px-3 text-sm font-mono tabular-nums"
            />
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>Thêm quy tắc</span>
            </button>
          </form>

          {pointRules.length > 0 && (
            <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
              {pointRules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        rule.points >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {rule.points >= 0 ? `+${rule.points}` : rule.points}
                    </span>
                    <span className="text-slate-800">{rule.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteRule(rule.id)}
                    aria-label={`Xóa quy tắc ${rule.label}`}
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Record Conduct Points Form */}
      {canEditPoints && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-display text-base font-semibold text-slate-900 mb-4">
            Cập nhật điểm tốt / điểm trừ theo buổi học
          </h2>
          {students.length === 0 ? (
            <p className="text-sm text-slate-500">
              Chưa có học sinh trong lớp để chấm điểm thi đua.
            </p>
          ) : (
            <form onSubmit={handleAddConduct} className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <label htmlFor="conduct-student" className="block text-xs font-medium text-slate-700 mb-1">
                  Học sinh
                </label>
                <select
                  id="conduct-student"
                  value={studentId || students[0]?.id || ''}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {students.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.fullName} ({TEAM_LABELS[st.team]})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="conduct-session" className="block text-xs font-medium text-slate-700 mb-1">
                  Buổi học
                </label>
                <select
                  id="conduct-session"
                  value={session}
                  onChange={(e) => setSession(e.target.value as ConductSession)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="Sang">Sáng</option>
                  <option value="Chieu">Chiều</option>
                  <option value="Sinh hoat">Sinh hoạt</option>
                </select>
              </div>

              {pointRules.length > 0 && (
                <div className="sm:col-span-3">
                  <label htmlFor="conduct-preset" className="block text-xs font-medium text-slate-700 mb-1">
                    Chọn nhanh tiêu chí
                  </label>
                  <select
                    id="conduct-preset"
                    value={selectedRuleId}
                    onChange={(e) => handleRuleSelect(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="">Tự nhập nội dung</option>
                    {pointRules.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} ({r.points >= 0 ? `+${r.points}` : r.points})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={pointRules.length > 0 ? 'sm:col-span-4' : 'sm:col-span-4'}>
                <label htmlFor="conduct-category" className="block text-xs font-medium text-slate-700 mb-1">
                  Nội dung ghi nhận
                </label>
                <input
                  id="conduct-category"
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                  placeholder="Ví dụ: Phát biểu tích cực hoặc Nói chuyện riêng"
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="conduct-points" className="block text-xs font-medium text-slate-700 mb-1">
                  Số điểm (+/-)
                </label>
                <input
                  id="conduct-points"
                  type="number"
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value))}
                  required
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-mono tabular-nums"
                />
              </div>

              <div className="sm:col-span-7">
                <label htmlFor="conduct-note" className="block text-xs font-medium text-slate-700 mb-1">
                  Ghi chú thêm (không bắt buộc)
                </label>
                <input
                  id="conduct-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Chi tiết môn học hoặc bối cảnh..."
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>

              <div className="sm:col-span-3 flex items-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-10 w-full rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : 'Ghi nhận điểm'}
                </button>
              </div>
            </form>
          )}
          {feedback && (
            <p className="mt-3 text-xs font-medium text-blue-800">{feedback}</p>
          )}
        </section>
      )}

      {/* Weekly Rankings: Team & Individual */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Team Leaderboard */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Award className="h-4 w-4 text-blue-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Xếp hạng toàn tổ (Tuần)
            </h2>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {teamRankings.map((t) => (
              <div key={t.team} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Hạng {t.rank} · {TEAM_LABELS[t.team]}
                  </p>
                  <p className="text-xs text-slate-500 font-mono tabular-nums">
                    {t.memberCount} HS · Tốt +{t.totalMerit} · Trừ -{t.totalDeduction}
                  </p>
                </div>
                <span
                  className={`font-mono text-base font-bold tabular-nums ${
                    t.totalNetScore >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {t.totalNetScore >= 0 ? `+${t.totalNetScore}` : t.totalNetScore}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Individual Weekly Leaderboard */}
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-8">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Xếp hạng cá nhân theo tuần ({weekDates[0]} – {weekDates[weekDates.length - 1]})
            </h2>
          </div>

          {individualRankings.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Chưa có học sinh để xếp hạng tuần này.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="px-4 py-3">Hạng</th>
                    <th className="px-4 py-3">Học sinh</th>
                    <th className="px-4 py-3">Tổ · Chức vụ</th>
                    <th className="px-4 py-3 text-right">Điểm tốt</th>
                    <th className="px-4 py-3 text-right">Điểm trừ</th>
                    <th className="px-4 py-3 text-right">Tổng tuần</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {individualRankings.map((r) => (
                    <tr key={r.studentId} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900 tabular-nums">
                        #{r.rank}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{r.fullName}</p>
                        <p className="font-mono text-xs text-slate-500">{r.studentCode}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {TEAM_LABELS[r.team]} · {ROLE_LABELS[r.role]}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-700 tabular-nums">
                        +{r.meritPoints}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-red-700 tabular-nums">
                        -{r.deductionPoints}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {r.netScore >= 0 ? `+${r.netScore}` : r.netScore}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Conduct Logs History */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Nhật ký điểm tốt &amp; vi phạm gần đây
          </h2>
        </div>

        {conductLogs.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Chưa có lượt ghi nhận điểm tốt hay vi phạm nào.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {conductLogs.slice(0, 30).map((log) => {
              const st = students.find((s) => s.id === log.studentId);
              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {st ? st.fullName : log.studentId}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {log.category}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
                      {log.date} · Buổi {log.session === 'Sang' ? 'Sáng' : log.session === 'Chieu' ? 'Chiều' : 'Sinh hoạt'} · Ghi bởi {log.recordedByName}
                      {log.note ? ` · ${log.note}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`font-mono text-sm font-bold tabular-nums ${
                        log.points >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {log.points >= 0 ? `+${log.points}` : log.points}
                    </span>
                    {canEditPoints && (
                      <button
                        type="button"
                        onClick={() => handleDeleteLog(log.id)}
                        aria-label={`Xóa ghi nhận điểm ${log.category}`}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
