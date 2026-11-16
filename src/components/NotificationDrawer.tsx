import { CheckCheck, X } from 'lucide-react';
import type { AppNotification } from '../types/classroom';
import { classroomApi } from '../lib/api';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onRefresh: () => Promise<void>;
}

export function NotificationDrawer({
  open,
  onClose,
  notifications,
  onRefresh,
}: NotificationDrawerProps) {
  if (!open) return null;

  const handleMarkAllRead = async () => {
    try {
      await classroomApi.markNotificationsRead();
      await onRefresh();
    } catch {
      // ignore
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifications-title"
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30"
    >
      <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="notifications-title" className="font-display text-base font-bold text-slate-900">
              Thông báo tự động
            </h2>
            <p className="text-xs text-slate-500">
              Cảnh báo trừ điểm, báo vắng và lệnh điều phối lớp.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Đã đọc hết</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng thông báo"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">Chưa có thông báo nào</p>
              <p className="mt-1 text-xs text-slate-500">
                Khi có học sinh bị trừ điểm hoặc vắng mặt, thông báo sẽ hiển thị tự động tại đây.
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`px-5 py-4 ${n.isRead ? 'bg-white' : 'bg-blue-50/40'}`}
              >
                <p className="text-xs font-medium text-slate-500 font-mono tabular-nums">
                  {n.type === 'deduction'
                    ? 'Trừ điểm kỷ luật'
                    : n.type === 'absence'
                    ? 'Báo vắng học'
                    : 'Điều phối lớp'}{' '}
                  · {new Date(n.createdAt).toLocaleString('vi-VN')}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{n.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-700">{n.message}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
