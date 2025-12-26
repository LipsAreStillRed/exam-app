import nodemailer from 'nodemailer';
import path from 'path';

// Hàm tạo transporter dùng Gmail SMTP
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: {
      user: process.env.MAIL_USER,
      pass: (process.env.MAIL_PASS || '').trim(),
    },
  });
}
// ✅ Hàm gửi email chung
export async function sendEmail({ to, subject, html, attachments = [] }) {
  const transporter = createTransporter();

  return transporter.sendMail({
    from: process.env.MAIL_USER,
    to: to || process.env.EMAIL_TO || process.env.MAIL_USER,
    subject,
    html,
    attachments, // hỗ trợ gửi file đính kèm
  });
}
// ✅ Hàm gửi báo cáo lớp
export async function sendClassEmail(className, filename, examId) {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    console.log('Email not configured');
    return;
  }

  const subject = `📊 Kết quả lớp ${className} - ${new Date().toLocaleDateString('vi-VN')}`;
  const html = `<p>Kính gửi Thầy/Cô,</p>
                <p>Đính kèm file kết quả thi của lớp <b>${className}</b>.</p>
                <p>Mã đề: ${examId || '(không có)'}</p>
                <p>Trân trọng.</p>`;

  return sendEmail({
    subject,
    html,
    attachments: [{ filename: path.basename(filename), path: filename }]
  });
}
