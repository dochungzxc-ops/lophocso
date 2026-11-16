import { useCallback, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Navbar, type NavTab } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { AttendanceView } from './components/AttendanceView';
import { DutyView } from './components/DutyView';
import { ConductView } from './components/ConductView';
import { SeatingView } from './components/SeatingView';
import { ReportsView } from './components/ReportsView';
import { AdminStudentsView } from './components/AdminStudentsView';
import { LoginModal } from './components/LoginModal';
import { ChangePasswordView } from './components/ChangePasswordView';
import { NotificationDrawer } from './components/NotificationDrawer';
import { ChatbotWidget } from './components/ChatbotWidget';
import { classroomApi, getStoredToken, setStoredToken } from './lib/api';
import { firebaseSignOut, testFirestoreConnection } from './lib/firebase';
import type { AuthUser, ClassroomStatePayload, StudentRecord } from './types/classroom';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [changePasswordMode, setChangePasswordMode] = useState(false);
  const [showPasswordPromptModal, setShowPasswordPromptModal] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const [state, setState] = useState<ClassroomStatePayload>({
    classroomName: 'Lớp Học Trực Tuyến',
    schoolYear: '2026 - 2027',
    students: [],
    attendance: [],
    conductLogs: [],
    pointRules: [],
    dutySchedules: [],
    posts: [],
    notifications: [],
  });

  const refreshData = useCallback(async (authedUser?: AuthUser | null) => {
    const targetUser = authedUser !== undefined ? authedUser : user;
    try {
      const data = targetUser
        ? await classroomApi.fetchState()
        : await classroomApi.fetchPublicOverview();
      setState(data);
    } catch {
      const pub = await classroomApi.fetchPublicOverview();
      setState(pub);
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      // Verify Firestore connectivity on initial boot
      void testFirestoreConnection();

      const token = getStoredToken();
      let currentUser: AuthUser | null = null;
      if (token) {
        try {
          const me = await classroomApi.getMe();
          currentUser = me.user;
          if (mounted) {
            setUser(currentUser);
            if (currentUser.mustPromptPasswordChange) {
              setShowPasswordPromptModal(true);
            }
          }
        } catch {
          setStoredToken(null);
        }
      }
      if (mounted) {
        await refreshData(currentUser);
        setLoading(false);
      }
    }
    void boot();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLoginSuccess = async (token: string, loggedUser: AuthUser) => {
    setStoredToken(token);
    setUser(loggedUser);
    setLoginOpen(false);
    setChangePasswordMode(false);
    if (loggedUser.mustPromptPasswordChange) {
      setShowPasswordPromptModal(true);
    }
    await refreshData(loggedUser);
  };

  const handleLogout = async () => {
    setStoredToken(null);
    await firebaseSignOut();
    setUser(null);
    setChangePasswordMode(false);
    setShowPasswordPromptModal(false);
    setActiveTab('overview');
    await refreshData(null);
  };

  const handleDismissPasswordPrompt = async () => {
    setShowPasswordPromptModal(false);
    try {
      const res = await classroomApi.dismissPasswordPrompt();
      setUser(res.user);
    } catch {
      // ignore
    }
  };

  const handleAcceptPasswordPrompt = () => {
    setShowPasswordPromptModal(false);
    setChangePasswordMode(true);
  };

  const unreadCount = state.notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setChangePasswordMode(false);
          setActiveTab(tab);
        }}
        user={user}
        unreadNotifications={unreadCount}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenLogin={() => setLoginOpen(true)}
        onOpenChangePassword={() => setChangePasswordMode(true)}
        onLogout={handleLogout}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pt-8">
        {loading ? (
          <div className="space-y-4 py-8">
            <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200" />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="h-28 animate-pulse rounded-xl bg-slate-200" />
              <div className="h-28 animate-pulse rounded-xl bg-slate-200" />
              <div className="h-28 animate-pulse rounded-xl bg-slate-200" />
              <div className="h-28 animate-pulse rounded-xl bg-slate-200" />
            </div>
          </div>
        ) : changePasswordMode && user ? (
          <ChangePasswordView
            user={user}
            onBack={() => setChangePasswordMode(false)}
            onSuccess={(updatedUser) => {
              setUser(updatedUser);
              void refreshData(updatedUser);
            }}
          />
        ) : activeTab === 'overview' ? (
          <DashboardView
            classroomName={state.classroomName}
            schoolYear={state.schoolYear}
            students={state.students}
            attendance={state.attendance}
            conductLogs={state.conductLogs}
            dutySchedules={state.dutySchedules}
            posts={state.posts}
            user={user}
            onNavigateTab={(t) => setActiveTab(t)}
            onRefresh={() => refreshData()}
          />
        ) : activeTab === 'attendance' ? (
          <AttendanceView
            students={state.students}
            attendance={state.attendance}
            user={user}
            onRefresh={() => refreshData()}
          />
        ) : activeTab === 'duty' ? (
          <DutyView
            dutySchedules={state.dutySchedules}
            user={user}
            onRefresh={() => refreshData()}
          />
        ) : activeTab === 'conduct' ? (
          <ConductView
            students={state.students}
            conductLogs={state.conductLogs}
            pointRules={state.pointRules}
            user={user}
            onRefresh={() => refreshData()}
          />
        ) : activeTab === 'seating' ? (
          <SeatingView
            students={state.students}
            user={user}
            onRefresh={() => refreshData()}
          />
        ) : activeTab === 'reports' && user ? (
          <ReportsView
            classroomName={state.classroomName}
            schoolYear={state.schoolYear}
            students={state.students}
            attendance={state.attendance}
            conductLogs={state.conductLogs}
            user={user}
          />
        ) : activeTab === 'admin' && user?.role === 'teacher' ? (
          <AdminStudentsView
            classroomName={state.classroomName}
            schoolYear={state.schoolYear}
            students={state.students as StudentRecord[]}
            onOpenReports={() => setActiveTab('reports')}
            onRefresh={() => refreshData()}
          />
        ) : (
          <DashboardView
            classroomName={state.classroomName}
            schoolYear={state.schoolYear}
            students={state.students}
            attendance={state.attendance}
            conductLogs={state.conductLogs}
            dutySchedules={state.dutySchedules}
            posts={state.posts}
            user={user}
            onNavigateTab={(t) => setActiveTab(t)}
            onRefresh={() => refreshData()}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500 no-print">
        <span>Lớp Học Số · Hệ thống quản lý lớp học trực tuyến</span>
      </footer>

      {/* First-Login Password Security Prompt (Teacher & Newly Provisioned Students) */}
      {showPasswordPromptModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pw-prompt-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center gap-2.5">
              <KeyRound className="h-5 w-5 text-blue-700" />
              <h2 id="pw-prompt-title" className="font-display text-base font-bold text-slate-900">
                Tăng cường bảo mật tài khoản
              </h2>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Bạn đang đăng nhập bằng mật khẩu được cấp ban đầu. Bạn có muốn đổi mật khẩu ngay bây giờ để bảo mật tài khoản không?
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleDismissPasswordPrompt}
                className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Không, để sau
              </button>
              <button
                type="button"
                onClick={handleAcceptPasswordPrompt}
                className="h-9 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800"
              >
                Có, đổi mật khẩu
              </button>
            </div>
          </div>
        </div>
      )}

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={handleLoginSuccess}
      />

      <NotificationDrawer
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={state.notifications}
        onRefresh={() => refreshData()}
      />

      <ChatbotWidget user={user} onDataMutated={() => refreshData()} />
    </div>
  );
}
