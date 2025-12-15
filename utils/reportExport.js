import XLSX from 'xlsx';

export function buildClassReportWorkbook({ classId, schedule, results, includeAnswers = false }) {
  const rows = results.map(r => ({
    'Mã HS': r.id,
    'Họ tên': r.name,
    'Lớp': r.classId,
    'Điểm': r.score ?? '',
    'Trạng thái': r.status,
    'Giờ nộp': r.submittedAt ? new Date(r.submittedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '',
    ...(includeAnswers ? { 'Đáp án': r.answers ?? '' } : {})
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, `Lop_${classId}`);

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `Bao_cao_lop_${classId}.xlsx`;
  return { buffer, filename };
}
