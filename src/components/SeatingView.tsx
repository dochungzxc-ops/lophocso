import { useState } from 'react';
import { UserCog } from 'lucide-react';
import type {
  AuthUser,
  StudentPublicView,
  StudentRecord,
  TeamName,
  UserRole,
} from '../types/classroom';
import { canManageStudents, ROLE_LABELS, TEAM_LABELS } from '../utils/classroomLogic';
import { classroomApi } from '../lib/api';

interface SeatingViewProps {
  students: (StudentPublicView | StudentRecord)[];
  user: AuthUser | null;
  onRefresh: () => Promise<void>;
}

const ROWS = 6;
const COLS = 6;

export function SeatingView({ students, user, onRefresh }: SeatingViewProps) {
  const isTeacher = user ? canManageStudents(user.role) : false;

  const [selectedSeat, setSelectedSeat] = useState<{ row: number; col: number } | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [editRole, setEditRole] = useState<Exclude<UserRole, 'teacher' | 'guest'>>('student');
  const [editTeam, setEditTeam] = useState<TeamName>('To 1');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSeatClick = (row: number, col: number, occupant?: StudentPublicView | StudentRecord) => {
    setSelectedSeat({ row, col });
    setMessage('');
    if (occupant) {
      setSelectedStudentId(occupant.id);
      setEditRole(occupant.role);
      setEditTeam(occupant.team);
    } else if (students.length > 0) {
      setSelectedStudentId(students[0].id);
      setEditRole(students[0].role);
      setEditTeam(students[0].team);
    }
  };

  const handleSaveSeatAndRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !selectedSeat) return;
    setSaving(true);
    setMessage('');
    try {
      await classroomApi.updateSeatingAndRole({
        studentId: selectedStudentId,
        seatRow: selectedSeat.row,
        seatCol: selectedSeat.col,
        role: editRole,
        team: editTeam,
      });
      await onRefresh();
      setMessage('Đã cập nhật vị trí chỗ ngồi và phân quyền chức vụ.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Lỗi khi cập nhật sơ đồ.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Sơ đồ chỗ ngồi &amp; phân quyền ban cán sự
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isTeacher
            ? 'Nhấp vào bất kỳ chỗ ngồi nào để xếp vị trí, hoán đổi bàn hoặc cấp quyền chức vụ (Lớp trưởng, Lớp phó, Bí thư, Tổ trưởng).'
            : 'Sơ đồ vị trí ngồi của lớp học.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Classroom Grid */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-8">
          <div className="mb-5 flex justify-center">
            <div className="w-64 rounded-lg border border-slate-300 bg-slate-100 py-2 text-center text-xs font-semibold text-slate-700">
              Bục giảng &amp; Bàn giáo viên
            </div>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-3 text-center text-xs font-medium text-slate-500">
            <span>Dãy 1 (Cột 1–2)</span>
            <span>Dãy 2 (Cột 3–4)</span>
            <span>Dãy 3 (Cột 5–6)</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
            {Array.from({ length: ROWS }).map((_, rowIdx) =>
              Array.from({ length: COLS }).map((__, colIdx) => {
                const occupant = students.find(
                  (s) => s.seatRow === rowIdx && s.seatCol === colIdx
                );
                const isSelected =
                  selectedSeat?.row === rowIdx && selectedSeat?.col === colIdx;
                const isOfficer = occupant && occupant.role !== 'student';

                return (
                  <button
                    key={`${rowIdx}-${colIdx}`}
                    type="button"
                    onClick={() => handleSeatClick(rowIdx, colIdx, occupant)}
                    aria-label={
                      occupant
                        ? `Ghế hàng ${rowIdx + 1} cột ${colIdx + 1}: ${occupant.fullName}, ${ROLE_LABELS[occupant.role]}`
                        : `Ghế trống hàng ${rowIdx + 1} cột ${colIdx + 1}`
                    }
                    className={`flex min-h-[76px] flex-col justify-between rounded-lg border p-2.5 text-left transition-colors ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50'
                        : occupant
                        ? 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        : 'border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-100/70'
                    }`}
                  >
                    <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                      H{rowIdx + 1}-C{colIdx + 1}
                    </span>
                    {occupant ? (
                      <div className="mt-1">
                        <p className="text-xs font-semibold text-slate-900 line-clamp-2 leading-tight">
                          {occupant.fullName}
                        </p>
                        <p
                          className={`mt-0.5 text-[10px] truncate ${
                            isOfficer ? 'font-semibold text-blue-700' : 'text-slate-500'
                          }`}
                        >
                          {ROLE_LABELS[occupant.role]} · {TEAM_LABELS[occupant.team]}
                        </p>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">Trống</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Inspector & Teacher Role Assignment Panel */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <UserCog className="h-4 w-4 text-blue-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              {isTeacher ? 'Xếp chỗ & Phân quyền học sinh' : 'Thông tin vị trí'}
            </h2>
          </div>

          {students.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Chưa có học sinh trong lớp. Giáo viên chủ nhiệm hãy thêm học sinh trước để xếp chỗ ngồi.
            </p>
          ) : !selectedSeat ? (
            <p className="mt-4 text-sm text-slate-500">
              Chọn một vị trí trên sơ đồ lớp bên trái để xem chi tiết hoặc phân công chức vụ.
            </p>
          ) : isTeacher ? (
            <form onSubmit={handleSaveSeatAndRole} className="mt-4 space-y-4">
              <p className="font-mono text-xs text-slate-600">
                Vị trí đang chọn: Hàng {selectedSeat.row + 1}, Cột {selectedSeat.col + 1}
              </p>

              <div>
                <label htmlFor="seat-student" className="block text-xs font-medium text-slate-700 mb-1">
                  Học sinh ngồi vị trí này
                </label>
                <select
                  id="seat-student"
                  value={selectedStudentId}
                  onChange={(e) => {
                    const st = students.find((s) => s.id === e.target.value);
                    setSelectedStudentId(e.target.value);
                    if (st) {
                      setEditRole(st.role);
                      setEditTeam(st.team);
                    }
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {students.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.fullName} ({st.studentCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="seat-role" className="block text-xs font-medium text-slate-700 mb-1">
                  Cấp chức vụ (Phân quyền)
                </label>
                <select
                  id="seat-role"
                  value={editRole}
                  onChange={(e) =>
                    setEditRole(e.target.value as Exclude<UserRole, 'teacher' | 'guest'>)
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="student">Học sinh</option>
                  <option value="team_leader">Tổ trưởng</option>
                  <option value="vice_monitor">Lớp phó</option>
                  <option value="secretary">Bí thư</option>
                  <option value="monitor">Lớp trưởng</option>
                </select>
              </div>

              <div>
                <label htmlFor="seat-team" className="block text-xs font-medium text-slate-700 mb-1">
                  Thuộc tổ
                </label>
                <select
                  id="seat-team"
                  value={editTeam}
                  onChange={(e) => setEditTeam(e.target.value as TeamName)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="To 1">Tổ 1</option>
                  <option value="To 2">Tổ 2</option>
                  <option value="To 3">Tổ 3</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="h-10 w-full rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : 'Lưu vị trí & Chức vụ'}
              </button>

              {message && <p className="text-xs font-medium text-blue-800">{message}</p>}
            </form>
          ) : (
            (() => {
              const occ = students.find(
                (s) => s.seatRow === selectedSeat.row && s.seatCol === selectedSeat.col
              );
              return occ ? (
                <div className="mt-4 space-y-2 text-sm">
                  <p className="font-semibold text-slate-900">{occ.fullName}</p>
                  <p className="text-xs text-slate-600 font-mono">Mã HS: {occ.studentCode}</p>
                  <p className="text-xs text-slate-600">Chức vụ: {ROLE_LABELS[occ.role]}</p>
                  <p className="text-xs text-slate-600">Tổ: {TEAM_LABELS[occ.team]}</p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">Vị trí này hiện chưa có học sinh ngồi.</p>
              );
            })()
          )}
        </section>
      </div>
    </div>
  );
}
