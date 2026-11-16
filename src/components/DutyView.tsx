import { useState } from 'react';
import { Check, AlertTriangle, Clock, Plus, Trash2 } from 'lucide-react';
import type { AuthUser, DutySchedule, DutyStatus } from '../types/classroom';
import { canManageDutySchedule, getTodayISO, getWeekdayLabelVi, TEAM_LABELS } from '../utils/classroomLogic';
import { classroomApi } from '../lib/api';

interface DutyViewProps {
  dutySchedules: DutySchedule[];
  user: AuthUser | null;
  onRefresh: () => Promise<void>;
}

const DUTY_STATUS_LABEL: Record<DutyStatus, string> = {
  pending: 'Chưa trực',
  completed: 'Đã hoàn thành',
  issue: 'Cần nhắc nhở',
};

export function DutyView({ dutySchedules, user, onRefresh }: DutyViewProps) {
  const canEdit = user ? canManageDutySchedule(user.role) : false;

  const [date, setDate] = useState(getTodayISO());
  const [assignedTeam, setAssignedTeam] = useState<DutySchedule['assignedTeam']>('To 1');
  const [task, setTask] = useState('Quét lớp, lau bảng, đổ rác và sắp xếp bàn ghế');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAddDuty = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await classroomApi.createDuty({ date, assignedTeam, task, note });
      setNote('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể thêm phân công trực nhật.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: DutyStatus) => {
    try {
      await classroomApi.updateDuty(id, { status });
      await onRefresh();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await classroomApi.deleteDuty(id);
      await onRefresh();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Theo dõi &amp; phân công trực nhật theo ngày
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Lịch trực nhật vệ sinh lớp học hàng ngày. Mọi học sinh đều có thể xem lịch phân công công khai.
        </p>
      </div>

      {canEdit && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-display text-base font-semibold text-slate-900 mb-4">
            Phân công trực nhật mới
          </h2>
          <form onSubmit={handleAddDuty} className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="sm:col-span-3">
              <label htmlFor="duty-date" className="block text-xs font-medium text-slate-700 mb-1">
                Ngày trực nhật
              </label>
              <input
                id="duty-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="duty-team" className="block text-xs font-medium text-slate-700 mb-1">
                Phân công
              </label>
              <select
                id="duty-team"
                value={assignedTeam}
                onChange={(e) => setAssignedTeam(e.target.value as DutySchedule['assignedTeam'])}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="To 1">Tổ 1</option>
                <option value="To 2">Tổ 2</option>
                <option value="To 3">Tổ 3</option>
                <option value="Ca lop">Cả lớp</option>
              </select>
            </div>

            <div className="sm:col-span-4">
              <label htmlFor="duty-task" className="block text-xs font-medium text-slate-700 mb-1">
                Công việc cụ thể
              </label>
              <input
                id="duty-task"
                type="text"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                required
                placeholder="Ví dụ: Quét lớp, lau bảng, kiểm tra điện quạt"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>

            <div className="sm:col-span-3 flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                <span>{submitting ? 'Đang lưu...' : 'Thêm lịch trực'}</span>
              </button>
            </div>
          </form>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Danh sách lịch vệ sinh lớp học
          </h2>
        </div>

        {dutySchedules.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-slate-700">Chưa có lịch trực nhật nào</p>
            <p className="mt-1 text-xs text-slate-500">
              Giáo viên hoặc Ban cán sự lớp có thể tạo phân công trực nhật theo ngày ở khung trên.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {dutySchedules.map((duty) => (
              <div
                key={duty.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-xs text-slate-500 font-mono tabular-nums">
                    {getWeekdayLabelVi(duty.date)} · {duty.date} · {TEAM_LABELS[duty.assignedTeam]}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{duty.task}</p>
                  {duty.note && <p className="mt-0.5 text-xs text-slate-500">Ghi chú: {duty.note}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {canEdit ? (
                    <>
                      {(['pending', 'completed', 'issue'] as DutyStatus[]).map((st) => {
                        const active = duty.status === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleStatusChange(duty.id, st)}
                            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                              active
                                ? st === 'completed'
                                  ? 'bg-emerald-600 text-white'
                                  : st === 'issue'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-slate-800 text-white'
                                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {st === 'completed' && <Check className="h-3 w-3" />}
                            {st === 'issue' && <AlertTriangle className="h-3 w-3" />}
                            {st === 'pending' && <Clock className="h-3 w-3" />}
                            <span>{DUTY_STATUS_LABEL[st]}</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => handleDelete(duty.id)}
                        aria-label={`Xóa lịch trực ${duty.date}`}
                        className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <span
                      className={`text-xs font-semibold ${
                        duty.status === 'completed'
                          ? 'text-emerald-700'
                          : duty.status === 'issue'
                          ? 'text-amber-700'
                          : 'text-slate-600'
                      }`}
                    >
                      {DUTY_STATUS_LABEL[duty.status]}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
