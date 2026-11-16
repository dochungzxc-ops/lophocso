import { useState } from 'react';
import { ArrowLeft, KeyRound, Mail } from 'lucide-react';
import { classroomApi } from '../lib/api';
import type { AuthUser } from '../types/classroom';
import { ROLE_LABELS } from '../utils/classroomLogic';

interface ChangePasswordViewProps {
  user: AuthUser;
  onBack: () => void;
  onSuccess: (updatedUser: AuthUser) => void;
}

export function ChangePasswordView({ user, onBack, onSuccess }: ChangePasswordViewProps) {
  // Password Form (3 simple fields)
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwDone, setPwDone] = useState('');

  // Email Form
  const [newEmail, setNewEmail] = useState(user.email);
  const [emailPassword, setEmailPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailDone, setEmailDone] = useState('');

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwDone('');

    if (newPassword !== confirmPassword) {
      setPwError('Mật khẩu mới và xác nhận mật khẩu không khớp.');
      return;
    }

    setPwLoading(true);
    try {
      const res = await classroomApi.changePassword({
        oldPassword,
        newPassword,
        confirmPassword,
      });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwDone('Đã đổi mật khẩu thành công. Tài khoản của bạn đã được bảo mật.');
      onSuccess(res.user);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Không thể đổi mật khẩu.');
    } finally {
      setPwLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailDone('');
    setEmailLoading(true);
    try {
      const res = await classroomApi.changeEmail({
        newEmail: newEmail.trim(),
        currentPassword: emailPassword,
      });
      setEmailPassword('');
      setNewEmail(res.user.email);
      setEmailDone(`Đã cập nhật email đăng nhập mới thành ${res.user.email}.`);
      onSuccess(res.user);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Không thể cập nhật email.');
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Quay lại bảng điều khiển</span>
          </button>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Cài đặt tài khoản &amp; bảo mật
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            {user.fullName} · {ROLE_LABELS[user.role]} · Email hiện tại:{' '}
            <span className="font-mono font-medium text-slate-800">{user.email}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Card 1: Change Password (3 clean fields) */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <KeyRound className="h-5 w-5 text-blue-700" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Đổi mật khẩu
              </h2>
              <p className="text-xs text-slate-500">
                Nhập mật khẩu cũ, mật khẩu mới và xác nhận mật khẩu.
              </p>
            </div>
          </div>

          <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="old-password" className="block text-xs font-medium text-slate-700 mb-1">
                Mật khẩu cũ
              </label>
              <input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="new-password" className="block text-xs font-medium text-slate-700 mb-1">
                Mật khẩu mới
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-xs font-medium text-slate-700 mb-1">
                Xác nhận mật khẩu
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            {pwError && <p className="text-xs font-medium text-red-600">{pwError}</p>}
            {pwDone && <p className="text-xs font-medium text-emerald-700">{pwDone}</p>}

            <button
              type="submit"
              disabled={pwLoading}
              className="h-10 w-full rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {pwLoading ? 'Đang cập nhật...' : 'Xác nhận đổi mật khẩu'}
            </button>
          </form>
        </section>

        {/* Card 2: Change Login Email */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <Mail className="h-5 w-5 text-blue-700" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Đổi Email đăng nhập
              </h2>
              <p className="text-xs text-slate-500">
                Cập nhật địa chỉ email dùng để đăng nhập vào hệ thống lớp học.
              </p>
            </div>
          </div>

          <form onSubmit={handleEmailSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="current-email-display" className="block text-xs font-medium text-slate-700 mb-1">
                Email hiện tại
              </label>
              <input
                id="current-email-display"
                type="text"
                value={user.email}
                disabled
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-mono text-slate-500"
              />
            </div>

            <div>
              <label htmlFor="new-email" className="block text-xs font-medium text-slate-700 mb-1">
                Email mới
              </label>
              <input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                placeholder="email.moi@school.edu.vn"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="email-confirm-password" className="block text-xs font-medium text-slate-700 mb-1">
                Mật khẩu hiện tại (để xác thực)
              </label>
              <input
                id="email-confirm-password"
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                required
                placeholder="Nhập mật khẩu hiện tại"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            {emailError && <p className="text-xs font-medium text-red-600">{emailError}</p>}
            {emailDone && <p className="text-xs font-medium text-emerald-700">{emailDone}</p>}

            <button
              type="submit"
              disabled={emailLoading}
              className="h-10 w-full rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {emailLoading ? 'Đang cập nhật...' : 'Lưu email mới'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
