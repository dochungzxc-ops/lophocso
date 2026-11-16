import * as XLSX from 'xlsx';
import {
  buildPeriodDisciplineExcelRows,
  buildStudentCredentialsExcelRows,
  parseImportedStudentRows,
  ROLE_LABELS,
  TEAM_LABELS,
  type ImportedStudentInput,
  type MonthlyParentReport,
  type StudentCredentialExportItem,
} from './classroomLogic';
import type {
  AttendanceRecord,
  ConductLog,
  StudentPublicView,
  StudentRecord,
} from '../types/classroom';

export function downloadStudentTemplateExcel() {
  const sampleHeader = [
    {
      MaHS: 'HS001',
      HoTen: 'Nguyễn Văn A',
      EmailTruong: 'nguyenvana@school.edu.vn',
      NamSinh: 2008,
      To: 'Tổ 1',
      ChucVu: 'Học sinh',
      MatKhau: '123456',
      SDTPhuHuynh: '0901234567',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(sampleHeader);
  ws['!cols'] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 28 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MauDanhSachHocSinh');
  XLSX.writeFile(wb, 'mau-nhap-hoc-sinh.xlsx');
}

export async function readStudentImportExcel(
  file: File
): Promise<{ valid: ImportedStudentInput[]; errors: string[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
  return parseImportedStudentRows(rows);
}

export function exportDisciplineReportExcel(params: {
  students: (StudentPublicView | StudentRecord)[];
  attendance: AttendanceRecord[];
  conductLogs: ConductLog[];
  startDate: string;
  endDate: string;
  fileName: string;
}) {
  const summaryRows = buildPeriodDisciplineExcelRows(
    params.students,
    params.attendance,
    params.conductLogs,
    params.startDate,
    params.endDate
  );
  const wsSummary = XLSX.utils.json_to_sheet(
    summaryRows.length > 0
      ? summaryRows
      : [{ ThongBao: 'Chưa có học sinh trong danh sách lớp.' }]
  );
  wsSummary['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 24 },
    { wch: 10 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 42 },
  ];

  // Sheet 2: Detailed incident & merit log entries in the selected period
  const studentMap = new Map(params.students.map((s) => [s.id, s]));
  const detailRows = params.conductLogs
    .filter((c) => c.date >= params.startDate && c.date <= params.endDate)
    .map((c, idx) => {
      const st = studentMap.get(c.studentId);
      return {
        STT: idx + 1,
        Ngay: c.date,
        Buoi: c.session === 'Sang' ? 'Sáng' : c.session === 'Chieu' ? 'Chiều' : 'Sinh hoạt',
        MaHocSinh: st?.studentCode || c.studentId,
        HoVaTen: st?.fullName || c.studentId,
        To: st ? TEAM_LABELS[st.team] : '',
        ChucVu: st ? ROLE_LABELS[st.role] : '',
        Loai: c.points >= 0 ? 'Điểm tốt' : 'Vi phạm',
        NoiDung: c.category,
        Diem: c.points,
        NguoiGhiNhan: c.recordedByName,
        GhiChu: c.note || '',
      };
    });

  const wsDetails = XLSX.utils.json_to_sheet(
    detailRows.length > 0
      ? detailRows
      : [{ ThongBao: 'Không có ghi nhận điểm tốt hoặc vi phạm nào trong kỳ báo cáo.' }]
  );
  wsDetails['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 24 },
    { wch: 10 },
    { wch: 18 },
    { wch: 12 },
    { wch: 28 },
    { wch: 10 },
    { wch: 22 },
    { wch: 28 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, 'TongHopKyLuat');
  XLSX.utils.book_append_sheet(wb, wsDetails, 'ChiTietGhiNhan');
  XLSX.writeFile(wb, params.fileName);
}

export function exportIndividualParentReportExcel(
  report: MonthlyParentReport,
  classroomName: string
) {
  const overviewRows = [
    {
      Lop: classroomName,
      Thang: report.month,
      MaHocSinh: report.studentCode,
      HoVaTen: report.fullName,
      To: TEAM_LABELS[report.team],
      NamSinh: report.birthYear ?? 'Theo hồ sơ lớp',
      BuoiCoMat: report.presentDays,
      NghiCoPhep: report.excusedDays,
      NghiKhongPhep: report.unexcusedDays,
      DiMuon: report.lateDays,
      DiemTot: report.totalMerit,
      DiemTru: report.totalDeduction,
      TongDiemRenLuyen: report.netScore,
      XepLoaiThang: report.rating,
    },
  ];
  const wsOverview = XLSX.utils.json_to_sheet(overviewRows);
  wsOverview['!cols'] = Array(14).fill({ wch: 16 });

  const detailRows = [
    ...report.absentDates.map((a) => ({
      Ngay: a.date,
      PhanLoai: a.status,
      NoiDung: a.reason,
      Diem: 0,
    })),
    ...report.merits.map((m) => ({
      Ngay: m.date,
      PhanLoai: 'Điểm tốt',
      NoiDung: m.category,
      Diem: m.points,
    })),
    ...report.violations.map((v) => ({
      Ngay: v.date,
      PhanLoai: 'Vi phạm',
      NoiDung: v.category,
      Diem: v.points,
    })),
  ];

  const wsDetails = XLSX.utils.json_to_sheet(
    detailRows.length > 0
      ? detailRows
      : [{ Ngay: report.month, PhanLoai: 'Tổng hợp', NoiDung: 'Chuyên cần đầy đủ, không vi phạm', Diem: 0 }]
  );
  wsDetails['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 36 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsOverview, 'PhieuBaoPhuHuynh');
  XLSX.utils.book_append_sheet(wb, wsDetails, 'ChiTietThang');
  XLSX.writeFile(wb, `phieu-ky-luat-${report.studentCode}-${report.month}.xlsx`);
}

export function exportStudentCredentialsExcel(
  credentials: StudentCredentialExportItem[],
  classroomName: string
) {
  const rows = buildStudentCredentialsExcelRows(credentials);
  const ws = XLSX.utils.json_to_sheet(
    rows.length > 0
      ? rows
      : [{ ThongBao: `Lớp ${classroomName} chưa có học sinh để xuất tài khoản.` }]
  );
  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 24 },
    { wch: 10 },
    { wch: 16 },
    { wch: 28 },
    { wch: 26 },
    { wch: 26 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'TaiKhoanHocSinh');
  XLSX.writeFile(wb, 'tai-khoan-mat-khau-hoc-sinh.xlsx');
}
