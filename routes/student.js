import express from 'express';
import fs from 'fs';
import path from 'path';
import { create } from 'xmlbuilder2';
import nodemailer from 'nodemailer';

const router = express.Router();

// Tính điểm tự động
function calculateScore(answers, correctAnswers) {
  if (!correctAnswers || Object.keys(correctAnswers).length === 0) {
    return null;
  }
  
  let correct = 0;
  let total = Object.keys(correctAnswers).length;
  
  for (const [questionId, correctAnswer] of Object.entries(correctAnswers)) {
    const studentAnswer = answers[questionId];
    if (studentAnswer && studentAnswer.toString().toUpperCase() === correctAnswer.toString().toUpperCase()) {
      correct++;
    }
  }
  
  return Math.round((correct / total) * 10 * 10) / 10; // Làm tròn 1 chữ số
}

router.post('/submit', async (req, res) => {
  try {
    const { name, className, dob, answers, examId, violations } = req.body;
    
    // Lưu bài làm trước, gửi email sau (async)
    const doc = create({ version: '1.0' })
      .ele('ketqua')
        .ele('hoten').txt(name || '').up()
        .ele('lop').txt(className || '').up()
        .ele('ngaysinh').txt(dob || '').up()
        .ele('examId').txt(examId || '').up()
        .ele('violations').txt(violations || 0).up()
        .ele('traloi').txt(JSON.stringify(answers || {})).up()
      .up();
    
    const xml = doc.end({ prettyPrint: true });
    const dir = path.join(process.cwd(), 'data', 'submissions');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const timestamp = Date.now();
    const filename = path.join(dir, `${timestamp}_${className || 'unknown'}.xml`);
    fs.writeFileSync(filename, xml, 'utf8');
    
    // Tính điểm nếu có đáp án
    let score = null;
    if (examId) {
      try {
        const examPath = path.join(process.cwd(), 'data', 'exams', `${examId}.json`);
        if (fs.existsSync(examPath)) {
          const examData = JSON.parse(fs.readFileSync(examPath, 'utf8'));
          score = calculateScore(answers, examData.answers);
        }
      } catch (e) {
        console.error('Error calculating score:', e);
      }
    }
    
    // Trả response ngay lập tức
    res.json({ ok: true, file: path.basename(filename), score });
    
    // Gửi email bất đồng bộ (không chờ)
    setImmediate(async () => {
      try {
        if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
          console.log('Email not configured, skipping...');
          return;
        }
        
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || 465),
          secure: process.env.SMTP_SECURE === 'true',
          auth: { 
            user: process.env.MAIL_USER, 
            pass: process.env.MAIL_PASS 
          }
        });

        await transporter.sendMail({
          from: process.env.MAIL_USER,
          to: process.env.EMAIL_TO || process.env.MAIL_USER,
          subject: `Bài làm: ${name || 'unknown'} - Lớp ${className || 'unknown'}${score !== null ? ` - Điểm: ${score}` : ''}`,
          text: `Kết quả thi của ${name || 'unknown'}.\nLớp: ${className}\nSố lần vi phạm: ${violations || 0}${score !== null ? `\nĐiểm: ${score}/10` : ''}`,
          attachments: [{ filename: path.basename(filename), path: filename }]
        });
        
        console.log('Email sent successfully for:', name);
      } catch (emailError) {
        console.error('Email error (non-blocking):', emailError.message);
      }
    });
    
  } catch(e) { 
    console.error(e); 
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

// Lấy danh sách bài nộp
router.get('/submissions', (req, res) => {
  try {
    const dir = path.join(process.cwd(), 'data', 'submissions');
    if (!fs.existsSync(dir)) return res.json({ ok: true, submissions: [] });
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.xml'));
    const submissions = files.map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      // Parse XML để lấy thông tin
      const nameMatch = content.match(/<hoten>(.*?)<\/hoten>/);
      const classMatch = content.match(/<lop>(.*?)<\/lop>/);
      const timestamp = f.split('_')[0];
      
      return {
        filename: f,
        name: nameMatch ? nameMatch[1] : 'Unknown',
        className: classMatch ? classMatch[1] : 'Unknown',
        timestamp: parseInt(timestamp),
        date: new Date(parseInt(timestamp)).toLocaleString('vi-VN')
      };
    }).sort((a, b) => b.timestamp - a.timestamp);
    
    res.json({ ok: true, submissions });
  } catch(e) { 
    console.error(e); 
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

export default router;
