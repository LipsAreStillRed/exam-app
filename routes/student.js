import express from 'express';
import fs from 'fs';
import path from 'path';
import { create } from 'xmlbuilder2';
import nodemailer from 'nodemailer';

const router = express.Router();

router.post('/submit', async (req, res) => {
  try {
    const { name, className, dob, answers, score, examId } = req.body;
    const doc = create({ version: '1.0' })
      .ele('ketqua')
        .ele('hoten').txt(name || '').up()
        .ele('lop').txt(className || '').up()
        .ele('ngaysinh').txt(dob || '').up()
        .ele('diem').txt(score !== undefined && score !== null ? String(score) : '').up()
        .ele('examId').txt(examId || '').up()
        .ele('traloi').txt(JSON.stringify(answers || [])).up()
      .up();
    const xml = doc.end({ prettyPrint: true });
    const dir = path.join(process.cwd(), 'data', 'submissions');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = path.join(dir, `${Date.now()}_${(className || 'unknown')}.xml`);
    fs.writeFileSync(filename, xml, 'utf8');

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE === 'true' ? true : false,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
    });

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: process.env.EMAIL_TO || process.env.MAIL_USER,
      subject: `Bài làm: ${name || 'unknown'}`,
      text: `Kết quả thi của ${name || 'unknown'}.`,
      attachments: [{ filename: path.basename(filename), path: filename }]
    });

    res.json({ ok:true, file: filename });
  } catch(e){ console.error(e); res.status(500).json({ ok:false, error: e.message }); }
});

export default router;
