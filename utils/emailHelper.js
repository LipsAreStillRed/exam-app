import nodemailer from 'nodemailer';

export async function sendEmail({ to, subject, html, attachments = [] }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: {
      user: process.env.MAIL_USER,
      pass: (process.env.MAIL_PASS || '').trim(),
    },
  });

  return transporter.sendMail({
    from: process.env.MAIL_USER,
    to: to || process.env.EMAIL_TO || process.env.MAIL_USER,
    subject,
    html,
    attachments, // hỗ trợ gửi file đính kèm
  });
}
