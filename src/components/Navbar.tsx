import { Bell, LogIn, LogOut, KeyRound, Menu, X } from 'lucide-react';
import { useState } from 'react';
import type { AuthUser } from '../types/classroom';
import { ROLE_LABELS } from '../utils/classroomLogic';

export type NavTab =
  | 'overview'
  | 'attendance'
  | 'duty'
  | 'conduct'
  | 'seating'
  | 'reports'
  | 'admin';

interface NavbarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: AuthUser | null;
  unreadNotifications: number;
  onOpenNotifications: () => void;
  onOpenLogin: () => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
}

export function Navbar({
  activeTab,
  onSelectTab,
  user,
  unreadNotifications,
  onOpenNotifications,
  onOpenLogin,
  onOpenChangePassword,
  onLogout,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: { id: NavTab; label: string; authOnly?: boolean; teacherOnly?: boolean }[] = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'attendance', label: 'Điểm danh' },
    { id: 'duty', label: 'Trực nhật' },
    { id: 'conduct', label: 'Thi đua' },
    { id: 'seating', label: 'Sơ đồ lớp' },
    { id: 'reports', label: 'Báo cáo', authOnly: true },
    { id: 'admin', label: 'Quản trị', teacherOnly: true },
  ];

  const visibleItems = navItems.filter((item) => {
    if (item.teacherOnly) return user?.role === 'teacher';
    if (item.authOnly) return user !== null;
    return true;
  });

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm no-print">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
        {/* Zone 1: Brand wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('overview')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Lớp Học Số
        </button>

        {/* Zone 2: Single-line navigation links */}
        <nav aria-label="Điều hướng chính" className="hidden md:flex h-full items-center gap-6">
          {visibleItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative flex h-full items-center text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-blue-700'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-700"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary action / User controls */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <>
              <button
                type="button"
                onClick={onOpenNotifications}
                aria-label={`Thông báo (${unreadNotifications} chưa đọc)`}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Bell className="h-4 w-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white tabular-nums">
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                )}
              </button>

              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-sm font-semibold text-slate-900 max-w-[160px] truncate">
                  {user.fullName}
                </span>
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  {ROLE_LABELS[user.role]}
                </span>
              </div>

              <button
                type="button"
                onClick={onOpenChangePassword}
                aria-label="Cài đặt tài khoản (Email & Mật khẩu)"
                title="Cài đặt Email & Mật khẩu"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Tài khoản</span>
              </button>

              <button
                type="button"
                onClick={onLogout}
                aria-label="Đăng xuất"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenLogin}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              <LogIn className="h-4 w-4" />
              <span>Đăng nhập</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav
          aria-label="Menu di động"
          className="border-t border-slate-200 bg-white px-4 py-3 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {visibleItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
