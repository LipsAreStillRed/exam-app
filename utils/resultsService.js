export async function getClassResults(classId) {
  // TODO: thay bằng dữ liệu thật từ DB hoặc file
  return [
    { id: 'S001', name: 'Nguyễn A', classId, score: 8.5, submittedAt: '2025-12-15T08:58:00+07:00', status: 'submitted', answers: '{"Q1":"A","Q2":"C"}' },
    { id: 'S002', name: 'Trần B', classId, score: 7.0, submittedAt: '2025-12-15T09:02:00+07:00', status: 'submitted', answers: '{"Q1":"D","Q2":"C"}' },
    { id: 'S003', name: 'Lê C', classId, score: null, submittedAt: null, status: 'absent', answers: null },
  ];
}
