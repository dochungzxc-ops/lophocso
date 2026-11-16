import { useMemo, useState } from 'react';
import { BarChart3, PieChart as PieChartIcon, Sparkles, ArrowRight, FileText, Trash2 } from 'lucide-react';
import type {
  AttendanceRecord,
  AuthUser,
  ClassPost,
  ConductLog,
  DutySchedule,
  StudentPublicView,
  StudentRecord,
} from '../types/classroom';
import {
  computeDailyAttendanceSummary,
  computeWeeklyRankings,
  getTodayISO,
  getWeekDates,
  TEAM_LABELS,
} from '../utils/classroomLogic';
import { classroomApi } from '../lib/api';

interface DashboardViewProps {
  classroomName: string;
  schoolYear: string;
  students: (StudentPublicView | StudentRecord)[];
  attendance: AttendanceRecord[];
  conductLogs: ConductLog[];
  dutySchedules: DutySchedule[];
  posts: ClassPost[];
  user: AuthUser | null;
  onNavigateTab: (tab: 'attendance' | 'duty' | 'conduct' | 'seating' | 'admin') => void;
  onRefresh: () => Promise<void>;
}

export function DashboardView({
  classroomName,
  schoolYear,
  students,
  attendance,
  conductLogs,
  dutySchedules,
  posts,
  user,
  onNavigateTab,
  onRefresh,
}: DashboardViewProps) {
  const today = getTodayISO();
  const weekDates = useMemo(() => getWeekDates(today), [today]);

  const todayStats = useMemo(
    () => computeDailyAttendanceSummary(students, attendance, today),
    [students, attendance, today]
  );

  const { teamRankings } = useMemo(
    () => computeWeeklyRankings(students, conductLogs, weekDates),
    [students, conductLogs, weekDates]
  );

  const todayDuties = useMemo(
    () => dutySchedules.filter((d) => d.date === today),
    [dutySchedules, today]
  );

  // Teacher AI Deep Diagnostic State
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [aiQuestion, setAiQuestion] = useState<string>('');
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string>('');

  const handleRunAIAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiError('');
    setAiLoading(true);
    try {
      const res = await classroomApi.analyzeStudentAI({
        studentId: selectedStudentId || undefined,
        question: aiQuestion.trim(),
      });
      setAiAnalysis(res.analysis);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Không thể phân tích lúc này.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await classroomApi.deletePost(postId);
      await onRefresh();
    } catch {
      // handled silently
    }
  };

  // Pie chart geometry for Today's Attendance breakdown
  const totalPop = students.length;
  const pieSegments = useMemo(() => {
    if (totalPop === 0) return [];
    const items = [
      { label: 'Có mặt', count: todayStats.present, color: '#059669' },
      { label: 'Nghỉ có phép', count: todayStats.excused, color: '#D97706' },
      { label: 'Nghỉ không phép', count: todayStats.unexcused, color: '#DC2626' },
      { label: 'Đi muộn', count: todayStats.late, color: '#2563EB' },
      { label: 'Chưa điểm danh', count: todayStats.unmarked, color: '#CBD5E1' },
    ].filter((x) => x.count > 0);

    let cumulative = 0;
    return items.map((item) => {
      const pct = item.count / totalPop;
      const start = cumulative;
      cumulative += pct;
      return { ...item, pct, start, end: cumulative };
    });
  }, [totalPop, todayStats]);

  // Bar chart max scale for Team Weekly Points
  const maxAbsTeamScore = useMemo(() => {
    const maxVal = Math.max(
      10,
      ...teamRankings.map((t) => Math.max(t.totalMerit, t.totalDeduction, Math.abs(t.totalNetScore)))
    );
    return maxVal;
  }, [teamRankings]);

  return (
    <div className="space-y-8">
      {/* Page Hero Header */}
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Năm học {schoolYear} · Ngày {today}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {classroomName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {user
              ? `Đang đăng nhập với vai trò ${user.fullName}. Theo dõi chuyên cần, trực nhật và thi đua theo thời gian thực.`
              : 'Chế độ xem công khai dành cho học sinh và phụ huynh. Đăng nhập để thực hiện tác vụ theo phân quyền.'}
          </p>
        </div>

        {user?.role === 'teacher' && (
          <button
            type="button"
            onClick={() => onNavigateTab('admin')}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
          >
            <span>Quản trị học sinh &amp; Excel</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </section>

      {/* 4-column KPI Strip */}
      <section aria-label="Thống kê nhanh" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Tổng sĩ số</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {students.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Học sinh trong danh sách</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Có mặt hôm nay</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {todayStats.present}
            <span className="text-sm font-normal text-slate-400">/{students.length}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Vắng: {todayStats.excused + todayStats.unexcused} · Muộn: {todayStats.late}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Trực nhật hôm nay</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-900">
            {todayDuties.length > 0 ? TEAM_LABELS[todayDuties[0].assignedTeam] : 'Chưa xếp'}
          </p>
          <p className="mt-1 text-xs text-slate-500 truncate">
            {todayDuties.length > 0 ? todayDuties[0].task : 'Chưa có lịch phân công hôm nay'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Hoạt động &amp; Thông báo</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {posts.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Bài viết và sự kiện lớp</p>
        </div>
      </section>

      {/* Visual Charts Row: Pie Chart + Bar Chart */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pie Chart (Biểu đồ quạt) - Chuyên cần hôm nay */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-blue-700" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Biểu đồ chuyên cần hôm nay
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('attendance')}
              className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
            >
              Xem điểm danh tuần
            </button>
          </div>

          {totalPop === 0 ? (
            <div className="flex h-52 flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-slate-700">Chưa có dữ liệu học sinh</p>
              <p className="mt-1 max-w-xs text-xs text-slate-500">
                Biểu đồ tỷ lệ chuyên cần sẽ hiển thị tự động khi giáo viên thêm học sinh vào lớp.
              </p>
            </div>
          ) : (
            <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
              <div className="relative h-44 w-44 shrink-0">
                <svg viewBox="-1.1 -1.1 2.2 2.2" className="h-full w-full -rotate-90" aria-label="Biểu đồ quạt chuyên cần">
                  {pieSegments.map((seg) => {
                    if (seg.pct >= 0.999) {
                      return <circle key={seg.label} cx="0" cy="0" r="1" fill={seg.color} />;
                    }
                    const startAngle = seg.start * 2 * Math.PI;
                    const endAngle = seg.end * 2 * Math.PI;
                    const x1 = Math.cos(startAngle);
                    const y1 = Math.sin(startAngle);
                    const x2 = Math.cos(endAngle);
                    const y2 = Math.sin(endAngle);
                    const largeArc = seg.pct > 0.5 ? 1 : 0;
                    const d = `M 0 0 L ${x1} ${y1} A 1 1 0 ${largeArc} 1 ${x2} ${y2} Z`;
                    return <path key={seg.label} d={d} fill={seg.color} stroke="#ffffff" strokeWidth="0.03" />;
                  })}
                  <circle cx="0" cy="0" r="0.54" fill="#ffffff" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
                    {totalPop > 0 ? Math.round((todayStats.present / totalPop) * 100) : 0}%
                  </span>
                  <span className="text-[11px] text-slate-500">Có mặt</span>
                </div>
              </div>

              <div className="w-full space-y-2.5">
                {[
                  { label: 'Có mặt', count: todayStats.present, colorClass: 'bg-emerald-600' },
                  { label: 'Nghỉ có phép', count: todayStats.excused, colorClass: 'bg-amber-600' },
                  { label: 'Nghỉ không phép', count: todayStats.unexcused, colorClass: 'bg-red-600' },
                  { label: 'Đi muộn', count: todayStats.late, colorClass: 'bg-blue-600' },
                  { label: 'Chưa điểm danh', count: todayStats.unmarked, colorClass: 'bg-slate-300' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-sm ${row.colorClass}`} aria-hidden="true" />
                      <span className="text-slate-700">{row.label}</span>
                    </div>
                    <span className="font-mono font-medium text-slate-900 tabular-nums">
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bar Chart (Biểu đồ cột) - Thi đua 3 Tổ theo tuần */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-700" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Biểu đồ thi đua các tổ trong tuần
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('conduct')}
              className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
            >
              Chi tiết xếp hạng
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {teamRankings.map((t) => {
              const meritWidth = Math.round((t.totalMerit / maxAbsTeamScore) * 100);
              const deductWidth = Math.round((t.totalDeduction / maxAbsTeamScore) * 100);
              return (
                <div key={t.team} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900">
                      Hạng {t.rank} · {TEAM_LABELS[t.team]}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        ({t.memberCount} thành viên)
                      </span>
                    </span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {t.totalNetScore >= 0 ? `+${t.totalNetScore}` : t.totalNetScore} điểm
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-3 overflow-hidden rounded bg-slate-100" title={`Điểm tốt: +${t.totalMerit}`}>
                      <div
                        className="h-full bg-emerald-600 transition-all"
                        style={{ width: `${meritWidth}%` }}
                      />
                    </div>
                    <div className="h-3 overflow-hidden rounded bg-slate-100" title={`Điểm trừ: -${t.totalDeduction}`}>
                      <div
                        className="h-full bg-red-600 transition-all"
                        style={{ width: `${deductWidth}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 font-mono tabular-nums">
                    <span>Điểm tốt: +{t.totalMerit}</span>
                    <span>Điểm trừ: -{t.totalDeduction}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Teacher-Only Deep AI Student Diagnostic Panel */}
      {user?.role === 'teacher' && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <Sparkles className="h-4 w-4 text-blue-700" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Phân tích chuyên sâu học sinh bằng AI
              </h2>
              <p className="text-xs text-slate-500">
                Hỏi về từng học sinh để xem thông tin năm sinh, đánh giá rèn luyện, chuyên cần, lỗi vi phạm và kỹ năng cần cải thiện.
              </p>
            </div>
          </div>

          <form onSubmit={handleRunAIAnalysis} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-4">
              <label htmlFor="ai-student-select" className="block text-xs font-medium text-slate-700 mb-1">
                Chọn học sinh
              </label>
              <select
                id="ai-student-select"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="">Tự động nhận diện từ câu hỏi hoặc cả lớp</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({s.studentCode})
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-6">
              <label htmlFor="ai-student-question" className="block text-xs font-medium text-slate-700 mb-1">
                Câu hỏi phân tích
              </label>
              <input
                id="ai-student-question"
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder="Ví dụ: Học sinh này rèn luyện thế nào, đi học có đều không, cần cải thiện kỹ năng gì?"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2 flex items-end">
              <button
                type="submit"
                disabled={aiLoading}
                className="h-10 w-full rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {aiLoading ? 'Đang phân tích...' : 'Phân tích AI'}
              </button>
            </div>
          </form>

          {aiError && (
            <p className="mt-3 text-sm text-red-600">{aiError}</p>
          )}

          {aiAnalysis && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
              {aiAnalysis}
            </div>
          )}
        </section>
      )}

      {/* Class Activities, Events & Announcements */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Hoạt động lớn &amp; Thông báo lớp học
            </h2>
          </div>
          {user?.role === 'teacher' && (
            <button
              type="button"
              onClick={() => onNavigateTab('admin')}
              className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
            >
              Đăng bài / Thêm hoạt động
            </button>
          )}
        </div>

        {posts.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-slate-700">Chưa có thông báo hay hoạt động nào</p>
            <p className="mt-1 text-xs text-slate-500">
              Giáo viên chủ nhiệm hoặc Ban cán sự có thể đăng bài viết, lịch ngoại khóa hoặc dùng Trợ lý AI để phát thông báo.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {posts.map((post) => (
              <article key={post.id} className="py-4 first:pt-4 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">
                      <span>{post.category === 'Hoat dong lon' ? 'Hoạt động lớn' : post.category === 'Thong bao' ? 'Thông báo' : 'Bài viết'}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{post.authorName}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono tabular-nums">
                        {new Date(post.createdAt).toLocaleString('vi-VN')}
                      </span>
                    </p>
                    <h3 className="mt-1 font-display text-base font-semibold text-slate-900">
                      {post.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                      {post.content}
                    </p>
                  </div>
                  {user?.role === 'teacher' && (
                    <button
                      type="button"
                      onClick={() => handleDeletePost(post.id)}
                      aria-label={`Xóa bài viết ${post.title}`}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
