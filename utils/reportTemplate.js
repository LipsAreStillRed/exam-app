function formatTime(tzDateString) {
  if (!tzDateString) return '';
  const d = new Date(tzDateString);
  // Hiển thị giờ địa phương theo Asia/Ho_Chi_Minh
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export function renderClassReportHTML({ classId, schedule, results }) {
  const total = results.length;
  const submitted = results.filter(r => r.status === 'submitted').length;
  const absent = results.filter(r => r.status === 'absent').length;

  const rows = results.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${r.name}</td>
      <td style="text-align:center">${r.score ?? ''}</td>
      <td>${r.status}</td>
      <td>${formatTime(r.submittedAt)}</td>
    </tr>
  `).join('');

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
    <h2 style="margin:0 0 8px">Báo cáo lớp ${classId}</h2>
    <p style="margin:0 0 16px;color:#555">Khung giờ: ${schedule ?? '—'}</p>

    <div style="margin-bottom:12px">
      <strong>Tổng số:</strong> ${total} |
      <strong>Đã nộp:</strong> ${submitted} |
      <strong>Vắng:</strong> ${absent}
    </div>

    <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;width:100%">
      <thead style="background:#f5f5f5">
        <tr>
          <th>Mã HS</th>
          <th>Họ tên</th>
          <th>Điểm</th>
          <th>Trạng thái</th>
          <th>Giờ nộp</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <p style="margin-top:12px;color:#777;font-size:12px">
      Email tự động từ ExamApp.
    </p>
  </div>
  `;
}
