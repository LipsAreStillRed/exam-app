// Đây là hàm giả lập dữ liệu kết quả học sinh.
// Sau này bạn thay bằng truy vấn DB hoặc đọc file thật.

export async function getClassResults(classId) {
  return [
    { id: 'S001', name: 'Nguyễn A', classId, score: 8.5, submittedAt: '2025-12-15T08:58:00+07:00', status: 'submitted' },
    { id: 'S002', name: 'Trần B', classId, score: 7.0, submittedAt: '2025-12-15T09:02:00+07:00', status: 'submitted' },
    { id: 'S003', name: 'Lê C', classId, score: null, submittedAt: null, status: 'absent' },
  ];
}
