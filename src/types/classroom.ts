export type UserRole =
  | 'teacher'
  | 'monitor'
  | 'vice_monitor'
  | 'secretary'
  | 'team_leader'
  | 'student'
  | 'guest';

export type TeamName = 'To 1' | 'To 2' | 'To 3';

export type AttendanceStatus = 'present' | 'excused' | 'unexcused' | 'late';

export type ConductSession = 'Sang' | 'Chieu' | 'Sinh hoat';

export type DutyStatus = 'pending' | 'completed' | 'issue';

export type PostCategory = 'Hoat dong lon' | 'Thong bao' | 'Bai viet';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  studentCode?: string;
  role: UserRole;
  team?: TeamName | '';
  mustPromptPasswordChange?: boolean;
}

export interface StudentRecord {
  id: string;
  studentCode: string;
  fullName: string;
  schoolEmail: string;
  birthYear: number;
  team: TeamName;
  role: Exclude<UserRole, 'teacher' | 'guest'>;
  seatRow: number;
  seatCol: number;
  parentPhone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentPublicView {
  id: string;
  studentCode: string;
  fullName: string;
  team: TeamName;
  role: Exclude<UserRole, 'teacher' | 'guest'>;
  seatRow: number;
  seatCol: number;
}

export interface AttendanceRecord {
  id: string;
  date: string; // YYYY-MM-DD
  studentId: string;
  status: AttendanceStatus;
  reason?: string;
  recordedBy: string;
  recordedByName?: string;
  updatedAt: string;
}

export interface PointRule {
  id: string;
  label: string;
  points: number;
  type: 'merit' | 'violation';
  createdBy: string;
  updatedAt: string;
}

export interface ConductLog {
  id: string;
  date: string; // YYYY-MM-DD
  session: ConductSession;
  studentId: string;
  category: string;
  points: number;
  note?: string;
  recordedBy: string;
  recordedByName: string;
  createdAt: string;
}

export interface DutySchedule {
  id: string;
  date: string; // YYYY-MM-DD
  assignedTeam: TeamName | 'Ca lop';
  task: string;
  status: DutyStatus;
  note?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ClassPost {
  id: string;
  title: string;
  content: string;
  category: PostCategory;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'deduction' | 'dispatch' | 'absence';
  targetUserId: string; // 'all' or studentId or 'teacher'
  studentId?: string;
  createdBy: string;
  isRead: boolean;
  createdAt: string;
}

export interface IndividualRanking {
  studentId: string;
  studentCode: string;
  fullName: string;
  team: TeamName;
  role: Exclude<UserRole, 'teacher' | 'guest'>;
  meritPoints: number;
  deductionPoints: number;
  netScore: number;
  rank: number;
}

export interface TeamRanking {
  team: TeamName;
  memberCount: number;
  totalMerit: number;
  totalDeduction: number;
  totalNetScore: number;
  averageScore: number;
  rank: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actionPerformed?: string;
  denied?: boolean;
}

export interface ClassroomStatePayload {
  classroomName: string;
  schoolYear: string;
  students: StudentPublicView[] | StudentRecord[];
  attendance: AttendanceRecord[];
  conductLogs: ConductLog[];
  pointRules: PointRule[];
  dutySchedules: DutySchedule[];
  posts: ClassPost[];
  notifications: AppNotification[];
}
