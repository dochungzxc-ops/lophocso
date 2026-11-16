import { useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Download,
  FileSpreadsheet,
  KeyRound,
  Minus,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  PostCategory,
  StudentRecord,
  TeamName,
  UserRole,
} from '../types/classroom';
import {
  hasPermission,
  PERMISSION_DESCRIPTIONS,
  ROLE_LABELS,
  TEAM_LABELS,
} from '../utils/classroomLogic';
import {
  downloadStudentTemplateExcel,
  exportStudentCredentialsExcel,
  readStudentImportExcel,
} from '../utils/excelHelper';
import { classroomApi } from '../lib/api';

interface AdminStudentsViewProps {
  classroomName: string;
  schoolYear: string;
  students: StudentRecord[];
  onOpenReports: () => void;
  onRefresh: () => Promise<void>;
}

const RBAC_DISPLAY_ROLES: UserRole[] = [
  'teacher',
  'monitor',
  'secretary',
  'team_leader',
  'vice_monitor',
  'student',
];

export function AdminStudentsView({
  classroomName,
  schoolYear,
  students,
  onOpenReports,
  onRefresh,
}: AdminStudentsViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Add Student Form
  const [studentCode, setStudentCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [schoolEmail, setSchoolEmail] = useState('');
  const [birthYear, setBirthYear] = useState(2008);
  const [team, setTeam] = useState<TeamName>('To 1');
  const [role, setRole] = useState<Exclude<UserRole, 'teacher' | 'guest'>>('student');
  const [password, setPassword] = useState('123456');
  const [parentPhone, setParentPhone] = useState('');
  const [studentFeedback, setStudentFeedback] = useState('');
  const [savingStudent, setSavingStudent] = useState(false);

  // Post / Major Activity Form
  const [postTitle, setPostTitle] = useState('');
  const [postCategory, setPostCategory] = useState<PostCategory>('Hoat dong lon');
  const [postContent, setPostContent] = useState('');
  const [postFeedback, setPostFeedback] = useState('');

  // Inline role update & account edit modal state
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [exportingCreds, setExportingCreds] = useState(false);
  const [editingAccount, setEditingAccount] = useState<StudentRecord | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editAccountError, setEditAccountError] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);

  // Classroom metadata edit
  const [editClassName, setEditClassName] = useState(classroomName);
  const [editSchoolYear, setEditSchoolYear] = useState(schoolYear);
  const [classFeedback, setClassFeedback] = useState('');

  const handleSaveClassInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await classroomApi.updateClassSettings(editClassName, editSchoolYear);
      await onRefresh();
      setClassFeedback('Đã cập nhật tên lớp và năm học.');
    } catch (err) {
      setClassFeedback(err instanceof Error ? err.message : 'Lỗi cập nhật.');
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentFeedback('');
    setSavingStudent(true);
    try {
      await classroomApi.createStudent({
        studentCode,
        fullName,
        schoolEmail,
        birthYear: Number(birthYear),
        team,
        role,
        password,
        parentPhone,
      });
      setStudentCode('');
      setFullName('');
      setSchoolEmail('');
      setParentPhone('');
      await onRefresh();
      setStudentFeedback('Đã tạo tài khoản học sinh mới.');
    } catch (err) {
      setStudentFeedback(err instanceof Error ? err.message : 'Lỗi tạo học sinh.');
    } finally {
      setSavingStudent(false);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStudentFeedback('');
    try {
      const { valid, errors } = await readStudentImportExcel(file);
      if (valid.length === 0) {
        setStudentFeedback(errors[0] || 'File Excel không có dòng dữ liệu hợp lệ.');
        return;
      }
      const res = await classroomApi.importStudents(valid);
      await onRefresh();
      setStudentFeedback(
        `Đã nhập ${res.importedCount} học sinh từ Excel (bỏ qua ${res.skippedCount} dòng trùng hoặc thiếu thông tin).`
      );
    } catch (err) {
      setStudentFeedback(err instanceof Error ? err.message : 'Không thể đọc file Excel.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleInlineRoleChange = async (
    studentId: string,
    newRole: Exclude<UserRole, 'teacher' | 'guest'>
  ) => {
    setUpdatingRoleId(studentId);
    setStudentFeedback('');
    try {
      await classroomApi.updateStudent(studentId, { role: newRole });
      await onRefresh();
      setStudentFeedback(`Đã cập nhật chức vụ mới (${ROLE_LABELS[newRole]}).`);
    } catch (err) {
      setStudentFeedback(err instanceof Error ? err.message : 'Lỗi cập nhật chức vụ.');
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    try {
      await classroomApi.deleteStudent(id);
      await onRefresh();
    } catch {
      // ignore
    }
  };

  const handleExportCredentialsExcel = async () => {
    setExportingCreds(true);
    setStudentFeedback('');
    try {
      const res = await classroomApi.fetchStudentCredentials();
      exportStudentCredentialsExcel(res.credentials, classroomName);
      setStudentFeedback(
        `Đã xuất file Excel tài khoản & mật khẩu cho ${res.credentials.length} học sinh.`
      );
    } catch (err) {
      setStudentFeedback(
        err instanceof Error ? err.message : 'Không thể xuất danh sách tài khoản.'
      );
    } finally {
      setExportingCreds(false);
    }
  };

  const openAccountEditor = (student: StudentRecord) => {
    setEditingAccount(student);
    setEditEmail(student.schoolEmail);
    setEditPassword('');
    setEditAccountError('');
  };

  const handleSaveStudentAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setEditAccountError('');
    setSavingAccount(true);
    try {
      const payload: { schoolEmail?: string; newPassword?: string } = {};
      const normalizedEmail = editEmail.trim().toLowerCase();
      if (normalizedEmail && normalizedEmail !== editingAccount.schoolEmail) {
        payload.schoolEmail = normalizedEmail;
      }
      if (editPassword.trim()) {
        if (editPassword.trim().length < 6) {
          setEditAccountError('Mật khẩu mới phải có ít nhất 6 ký tự.');
          setSavingAccount(false);
          return;
        }
        payload.newPassword = editPassword.trim();
      }
      if (!payload.schoolEmail && !payload.newPassword) {
        setEditAccountError('Vui lòng thay đổi Email hoặc nhập Mật khẩu mới.');
        setSavingAccount(false);
        return;
      }
      await classroomApi.updateStudent(editingAccount.id, payload);
      await onRefresh();
      setStudentFeedback(`Đã cập nhật thông tin tài khoản cho ${editingAccount.fullName}.`);
      setEditingAccount(null);
    } catch (err) {
      setEditAccountError(
        err instanceof Error ? err.message : 'Không thể cập nhật tài khoản.'
      );
    } finally {
      setSavingAccount(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostFeedback('');
    try {
      await classroomApi.createPost({
        title: postTitle,
        category: postCategory,
        content: postContent,
      });
      setPostTitle('');
      setPostContent('');
      await onRefresh();
      setPostFeedback('Đã đăng hoạt động/bài viết lên bảng tin lớp.');
    } catch (err) {
      setPostFeedback(err instanceof Error ? err.message : 'Lỗi khi đăng bài.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-5 no-print">
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Trung tâm quản trị giáo viên chủ nhiệm
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Cấp tài khoản học sinh (email trường / mã sinh viên), nhập xuất Excel, đăng hoạt động lớn và xuất báo cáo phụ huynh.
        </p>
      </div>

      {/* Classroom Metadata */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 no-print">
        <h2 className="font-display text-base font-semibold text-slate-900 mb-3">
          Thông tin lớp học
        </h2>
        <form onSubmit={handleSaveClassInfo} className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <label htmlFor="admin-class-name" className="block text-xs font-medium text-slate-700 mb-1">
              Tên lớp học
            </label>
            <input
              id="admin-class-name"
              type="text"
              value={editClassName}
              onChange={(e) => setEditClassName(e.target.value)}
              required
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />
          </div>
          <div className="sm:col-span-4">
            <label htmlFor="admin-school-year" className="block text-xs font-medium text-slate-700 mb-1">
              Niên khóa
            </label>
            <input
              id="admin-school-year"
              type="text"
              value={editSchoolYear}
              onChange={(e) => setEditSchoolYear(e.target.value)}
              required
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />
          </div>
          <div className="sm:col-span-3 flex items-end">
            <button
              type="submit"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            >
              Cập nhật thông tin
            </button>
          </div>
        </form>
        {classFeedback && <p className="mt-2 text-xs text-blue-700">{classFeedback}</p>}
      </section>

      {/* Excel Import & Manual Student Creation */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 no-print">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Cấp tài khoản học sinh &amp; Nhập danh sách Excel
            </h2>
            <p className="text-xs text-slate-500">
              Học sinh đăng nhập bằng Email trường hoặc Mã học sinh kết hợp mật khẩu được cấp.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCredentialsExcel}
              disabled={students.length === 0 || exportingCreds}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>{exportingCreds ? 'Đang xuất...' : 'Xuất tài khoản & mật khẩu (.xlsx)'}</span>
            </button>

            <button
              type="button"
              onClick={downloadStudentTemplateExcel}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Tải mẫu Excel (.xlsx)</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportExcel}
              className="hidden"
              id="excel-upload-input"
            />
            <label
              htmlFor="excel-upload-input"
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-medium text-white hover:bg-emerald-800 whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Nhập từ Excel</span>
            </label>
          </div>
        </div>

        <form onSubmit={handleCreateStudent} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-2">
            <label htmlFor="stu-code" className="block text-xs font-medium text-slate-700 mb-1">
              Mã HS / MSV
            </label>
            <input
              id="stu-code"
              type="text"
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value)}
              required
              placeholder="HS001"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-mono"
            />
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="stu-name" className="block text-xs font-medium text-slate-700 mb-1">
              Họ và tên
            </label>
            <input
              id="stu-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Nguyễn Văn An"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="stu-email" className="block text-xs font-medium text-slate-700 mb-1">
              Email trường
            </label>
            <input
              id="stu-email"
              type="email"
              value={schoolEmail}
              onChange={(e) => setSchoolEmail(e.target.value)}
              required
              placeholder="an@school.edu.vn"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="stu-birth" className="block text-xs font-medium text-slate-700 mb-1">
              Năm sinh
            </label>
            <input
              id="stu-birth"
              type="number"
              value={birthYear}
              onChange={(e) => setBirthYear(Number(e.target.value))}
              required
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-mono"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="stu-team" className="block text-xs font-medium text-slate-700 mb-1">
              Tổ
            </label>
            <select
              id="stu-team"
              value={team}
              onChange={(e) => setTeam(e.target.value as TeamName)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="To 1">Tổ 1</option>
              <option value="To 2">Tổ 2</option>
              <option value="To 3">Tổ 3</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="stu-role" className="block text-xs font-medium text-slate-700 mb-1">
              Chức vụ
            </label>
            <select
              id="stu-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Exclude<UserRole, 'teacher' | 'guest'>)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="student">Học sinh</option>
              <option value="team_leader">Tổ trưởng</option>
              <option value="vice_monitor">Lớp phó</option>
              <option value="secretary">Bí thư</option>
              <option value="monitor">Lớp trưởng</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="stu-pass" className="block text-xs font-medium text-slate-700 mb-1">
              Mật khẩu cấp
            </label>
            <input
              id="stu-pass"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-mono"
            />
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="stu-phone" className="block text-xs font-medium text-slate-700 mb-1">
              SĐT Phụ huynh
            </label>
            <input
              id="stu-phone"
              type="text"
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
              placeholder="090..."
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-mono"
            />
          </div>

          <div className="sm:col-span-3 flex items-end">
            <button
              type="submit"
              disabled={savingStudent}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>{savingStudent ? 'Đang thêm...' : 'Thêm học sinh'}</span>
            </button>
          </div>
        </form>

        {studentFeedback && (
          <p className="mt-3 text-xs font-medium text-blue-800">{studentFeedback}</p>
        )}

        {/* Roster Table */}
        <div className="mt-5 overflow-x-auto border-t border-slate-100 pt-4">
          {students.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Danh sách lớp hiện đang trống. Hãy thêm học sinh hoặc nhập từ file Excel mẫu.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="px-4 py-2.5">Mã HS</th>
                  <th className="px-4 py-2.5">Họ tên</th>
                  <th className="px-4 py-2.5">Email trường</th>
                  <th className="px-4 py-2.5">Năm sinh</th>
                  <th className="px-4 py-2.5">Tổ · Chức vụ</th>
                  <th className="px-4 py-2.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-mono text-xs">{s.studentCode}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{s.fullName}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{s.schoolEmail}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{s.birthYear}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 whitespace-nowrap">{TEAM_LABELS[s.team]}</span>
                        <select
                          aria-label={`Chức vụ của ${s.fullName}`}
                          value={s.role}
                          disabled={updatingRoleId === s.id}
                          onChange={(e) =>
                            handleInlineRoleChange(
                              s.id,
                              e.target.value as Exclude<UserRole, 'teacher' | 'guest'>
                            )
                          }
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none disabled:opacity-50"
                        >
                          <option value="student">Học sinh</option>
                          <option value="team_leader">Tổ trưởng</option>
                          <option value="vice_monitor">Lớp phó</option>
                          <option value="secretary">Bí thư</option>
                          <option value="monitor">Lớp trưởng</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openAccountEditor(s)}
                          aria-label={`Đổi email và mật khẩu cho ${s.fullName}`}
                          title="Đổi email / mật khẩu"
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <KeyRound className="h-3.5 w-3.5 text-blue-700" />
                          <span>Email / MK</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStudent(s.id)}
                          aria-label={`Xóa học sinh ${s.fullName}`}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Role-Based Access Control (RBAC) Matrix */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 no-print">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <ShieldCheck className="h-4 w-4 text-blue-700" />
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Ma trận phân quyền vai trò (RBAC)
            </h2>
            <p className="text-xs text-slate-500">
              Quyền hạn được kiểm soát đồng bộ giữa giao diện và máy chủ theo từng chức vụ trong lớp.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <th className="px-3 py-2.5">Chức năng hệ thống</th>
                {RBAC_DISPLAY_ROLES.map((r) => (
                  <th key={r} className="px-3 py-2.5 text-center whitespace-nowrap">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PERMISSION_DESCRIPTIONS.map((item) => (
                <tr key={item.permission} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2.5 font-medium text-slate-800">{item.label}</td>
                  {RBAC_DISPLAY_ROLES.map((r) => {
                    const allowed = hasPermission(r, item.permission);
                    return (
                      <td key={r} className="px-3 py-2.5 text-center">
                        {allowed ? (
                          <span
                            aria-label={`${ROLE_LABELS[r]}: Có quyền`}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span
                            aria-label={`${ROLE_LABELS[r]}: Không có quyền`}
                            className="inline-flex h-5 w-5 items-center justify-center text-slate-300"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Publish Major Class Activities & Posts */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 no-print">
        <h2 className="font-display text-base font-semibold text-slate-900 mb-3">
          Thêm hoạt động lớn &amp; viết bài cho lớp
        </h2>
        <form onSubmit={handleCreatePost} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-8">
              <label htmlFor="post-title" className="block text-xs font-medium text-slate-700 mb-1">
                Tiêu đề bài viết / Hoạt động
              </label>
              <input
                id="post-title"
                type="text"
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
                required
                placeholder="Ví dụ: Kế hoạch dã ngoại học kỳ I"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>
            <div className="sm:col-span-4">
              <label htmlFor="post-category" className="block text-xs font-medium text-slate-700 mb-1">
                Phân loại
              </label>
              <select
                id="post-category"
                value={postCategory}
                onChange={(e) => setPostCategory(e.target.value as PostCategory)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="Hoat dong lon">Hoạt động lớn</option>
                <option value="Thong bao">Thông báo</option>
                <option value="Bai viet">Bài viết</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="post-content" className="block text-xs font-medium text-slate-700 mb-1">
              Nội dung chi tiết
            </label>
            <textarea
              id="post-content"
              rows={3}
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              required
              placeholder="Nhập nội dung thông báo, thời gian, địa điểm tập trung..."
              className="w-full rounded-lg border border-slate-200 p-3 text-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-blue-700">{postFeedback}</p>
            <button
              type="submit"
              className="h-10 rounded-lg bg-blue-700 px-5 text-sm font-medium text-white hover:bg-blue-800"
            >
              Đăng bài viết
            </button>
          </div>
        </form>
      </section>

      {/* Quick Navigation to Comprehensive Reports View */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 no-print">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 h-5 w-5 text-emerald-700 shrink-0" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Báo cáo kỷ luật tuần/tháng &amp; Phiếu gửi phụ huynh
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Xem bảng thống kê kỷ luật toàn lớp theo tuần/tháng, xuất Excel nhiều trang tính và in phiếu báo cáo từng học sinh.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenReports}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <span>Mở trang Báo cáo chi tiết</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Edit Student Email & Password Modal */}
      {editingAccount && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-stu-account-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 id="edit-stu-account-title" className="font-display text-base font-bold text-slate-900">
                  Cập nhật Email &amp; Mật khẩu học sinh
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {editingAccount.fullName} ({editingAccount.studentCode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                aria-label="Đóng cửa sổ cập nhật tài khoản"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStudentAccount} className="mt-4 space-y-4">
              <div>
                <label htmlFor="edit-stu-email" className="block text-xs font-medium text-slate-700 mb-1">
                  Email đăng nhập
                </label>
                <input
                  id="edit-stu-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>

              <div>
                <label htmlFor="edit-stu-pw" className="block text-xs font-medium text-slate-700 mb-1">
                  Mật khẩu mới (bỏ trống nếu không đổi)
                </label>
                <input
                  id="edit-stu-pw"
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-mono"
                />
              </div>

              {editAccountError && (
                <p className="text-xs font-medium text-red-600">{editAccountError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingAccount}
                  className="h-9 rounded-lg bg-blue-700 px-4 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {savingAccount ? 'Đang lưu...' : 'Lưu thông tin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
