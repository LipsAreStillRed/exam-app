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
    if (!studentAnswer) continue;
    
    // Xử lý đáp án trả lời ngắn (4 ô)
    let studentAnswerStr = studentAnswer;
    if (typeof studentAnswer === 'object' && studentAnswer.boxes) {
      // Nối 4 ô lại thành chuỗi
      studentAnswerStr = studentAnswer.boxes.join('');
    }
    
    // So sánh (không phân biệt hoa thường, bỏ khoảng trắng)
    const studentNorm = String(studentAnswerStr).toUpperCase().replace(/\s/g, '');
    const correctNorm = String(correctAnswer).toUpperCase().replace(/\s/g, '');
    
    if (studentNorm === correctNorm) {
      correct++;
    }
  }
  
  return Math.round((correct / total) * 10 * 10) / 10;
}

// Tạo/Cập nhật file CSV
function updateCSV(className, submissionData) {
  const dir = path.join(process.cwd(), 'data', 'csv');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const filename = path.join(dir, `${className}.csv`);
  const isNewFile = !fs.existsSync(filename);
  
  // Header
  if (isNewFile) {
    const header = 'STT,Họ và tên,Ngày sinh,Lớp,Ngày giờ nộp,Điểm,Số lần vi phạm,Đáp án\n';
    fs.writeFileSync(filename, header, 'utf8');
  }
  
  // Đếm số dòng (số học sinh đã nộp)
  const content = fs.readFileSync(filename, 'utf8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const stt = lines.length; // Bao gồm header, nên STT chính xác
  
  // Dữ liệu mới
  const row = [
    stt,
    `"${submissionData.name}"`,
    submissionData.dob || '',
    className,
    new Date().toLocaleString('vi-VN'),
    submissionData.score !== null ? submissionData.score : 'Chưa chấm',
    submissionData.violations || 0,
    `"${JSON.stringify(submissionData.answers)}"`
  ].join(',') + '\n';
  
  fs.appendFileSync(filename, row, 'utf8');
  
  return { filename, totalSubmissions: stt };
}

// Gửi email tổng hợp
async function sendClassEmail(className, filename) {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    console.log('Email not configured');
    return;
  }
  
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || 465),
      secure: true,
      auth: { 
        user: process.env.MAIL_USER, 
        pass: process.env.MAIL_PASS 
      }
    });

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: process.env.EMAIL_TO || process.env.MAIL_USER,
      subject: `📊 Kết quả lớp ${className} - ${new Date().toLocaleDateString('vi-VN')}`,
      text: `Kính gửi Thầy/Cô,\n\nĐính kèm file kết quả thi của lớp ${className}.\n\nTrân trọng.`,
      attachments: [{ 
        filename: path.basename(filename), 
        path: filename 
      }]
    });
    
    console.log(`Email sent for class ${className}`);
  } catch (error) {
    console.error('Email error:', error.message);
  }
}

router.post('/submit', async (req, res) => {
  try {
    const { name, className, dob, answers, examId, violations } = req.body;
    
    // Tính điểm
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
    
    // Lưu XML (giữ nguyên như cũ)
    const doc = create({ version: '1.0' })
      .ele('ketqua')
        .ele('hoten').txt(name || '').up()
        .ele('lop').txt(className || '').up()
        .ele('ngaysinh').txt(dob || '').up()
        .ele('examId').txt(examId || '').up()
        .ele('diem').txt(score !== null ? String(score) : '').up()
        .ele('violations').txt(violations || 0).up()
        .ele('traloi').txt(JSON.stringify(answers || {})).up()
      .up();
    
    const xml = doc.end({ prettyPrint: true });
    const xmlDir = path.join(process.cwd(), 'data', 'submissions');
    if (!fs.existsSync(xmlDir)) fs.mkdirSync(xmlDir, { recursive: true });
    
    const timestamp = Date.now();
    const xmlFilename = path.join(xmlDir, `${timestamp}_${className || 'unknown'}.xml`);
    fs.writeFileSync(xmlFilename, xml, 'utf8');
    
    // Cập nhật CSV
    const csvResult = updateCSV(className, {
      name,
      dob,
      score,
      violations,
      answers
    });
    
    // Trả response ngay
    res.json({ 
      ok: true, 
      file: path.basename(xmlFilename), 
      score,
      totalSubmissions: csvResult.totalSubmissions - 1 // Trừ header
    });
    
    // Kiểm tra nếu đủ học sinh (60) → gửi email
    // Bạn có thể điều chỉnh số này tùy lớp
    const classLimits = {
      '12A1': 60,
      '12A2': 60,
      '12A3': 60,
      '12A4': 60
    };
    
    const limit = classLimits[className] || 60;
    if (csvResult.totalSubmissions - 1 === limit) {
      // Đủ rồi, gửi email tổng hợp
      setImmediate(() => {
        sendClassEmail(className, csvResult.filename);
      });
    }
    
    // Gửi email từng bài riêng lẻ (optional - có thể bỏ để giảm spam)
    setImmediate(async () => {
      try {
        if (!process.env.MAIL_USER || !process.env.MAIL_PASS) return;
        
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || 465),
          secure: true,
          auth: { 
            user: process.env.MAIL_USER, 
            pass: process.env.MAIL_PASS 
          }
        });

        await transporter.sendMail({
          from: process.env.MAIL_USER,
          to: process.env.EMAIL_TO || process.env.MAIL_USER,
          subject: `Bài nộp: ${name} - ${className}${score !== null ? ` - Điểm: ${score}` : ''}`,
          text: `Học sinh ${name} (${className}) đã nộp bài.\nSố lần vi phạm: ${violations || 0}${score !== null ? `\nĐiểm: ${score}/10` : ''}`,
          attachments: [{ 
            filename: path.basename(xmlFilename), 
            path: xmlFilename 
          }]
        });
      } catch (error) {
        console.error('Email error:', error.message);
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
      const nameMatch = content.match(/<hoten>(.*?)<\/hoten>/);
      const classMatch = content.match(/<lop>(.*?)<\/lop>/);
      const scoreMatch = content.match(/<diem>(.*?)<\/diem>/);
      const timestamp = f.split('_')[0];
      
      return {
        filename: f,
        name: nameMatch ? nameMatch[1] : 'Unknown',
        className: classMatch ? classMatch[1] : 'Unknown',
        score: scoreMatch && scoreMatch[1] ? scoreMatch[1] : 'Chưa chấm',
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

// Lấy thống kê theo lớp
router.get('/stats/:className', (req, res) => {
  try {
    const csvPath = path.join(process.cwd(), 'data', 'csv', `${req.params.className}.csv`);
    
    if (!fs.existsSync(csvPath)) {
      return res.json({ ok: true, total: 0, avgScore: null });
    }
    
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const total = lines.length - 1; // Trừ header
    
    // Tính điểm trung bình
    let totalScore = 0;
    let countScored = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 6) {
        const score = parseFloat(parts[5]);
        if (!isNaN(score)) {
          totalScore += score;
          countScored++;
        }
      }
    }
    
    const avgScore = countScored > 0 ? Math.round((totalScore / countScored) * 10) / 10 : null;
    
    res.json({ 
      ok: true, 
      className: req.params.className,
      total, 
      avgScore,
      csvFile: path.basename(csvPath)
    });
  } catch(e) { 
    console.error(e); 
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

export default router;
