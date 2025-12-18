import express from 'express';
import fs from 'fs';
import path from 'path';
import { create } from 'xmlbuilder2';
import nodemailer from 'nodemailer';
import { uploadToDrive } from '../utils/driveHelper.js';

const router = express.Router();

function calculateScore(answers, correctAnswers, questions) {
  if (!correctAnswers || Object.keys(correctAnswers).length === 0) {
    return null;
  }
  
  let correct = 0;
  let total = 0;
  
  // Duyệt qua từng câu hỏi để xử lý đúng
  questions.forEach(q => {
    const questionId = q.id;
    
    // Câu đúng/sai có nhiều ý (a, b, c, d)
    if (q.type === 'true_false' && q.subQuestions && q.subQuestions.length > 0) {
      // Mỗi ý là 1 câu nhỏ
      q.subQuestions.forEach(sub => {
        total++;
        const subKey = sub.key;
        const correctAnswer = correctAnswers[questionId] && correctAnswers[questionId][subKey];
        const studentAnswer = answers[questionId] && answers[questionId][subKey];
        
        if (correctAnswer && studentAnswer) {
          const studentNorm = String(studentAnswer).toUpperCase().trim();
          const correctNorm = String(correctAnswer).toUpperCase().trim();
          
          if (studentNorm === correctNorm) {
            correct++;
          }
        }
      });
    } else {
      // Câu thường (trắc nghiệm, đúng/sai đơn, trả lời ngắn)
      total++;
      const correctAnswer = correctAnswers[questionId];
      const studentAnswer = answers[questionId];
      
      if (!correctAnswer || !studentAnswer) return;
      
      let studentAnswerStr = studentAnswer;
      if (typeof studentAnswer === 'object' && studentAnswer.boxes) {
        studentAnswerStr = studentAnswer.boxes.filter(b => b).join('');
      }
      
      const studentNorm = String(studentAnswerStr).toUpperCase().replace(/\s/g, '');
      const correctNorm = String(correctAnswer).toUpperCase().replace(/\s/g, '');
      
      if (studentNorm === correctNorm) {
        correct++;
      }
    }
  });
  
  if (total === 0) return null;
  
  return Math.round((correct / total) * 10 * 10) / 10;
}

function updateCSV(className, submissionData) {
  const dir = path.join(process.cwd(), 'data', 'csv');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const filename = path.join(dir, `${className}.csv`);
  const isNewFile = !fs.existsSync(filename);
  
  if (isNewFile) {
    const header = 'STT,Họ và tên,Ngày sinh,Lớp,Ngày giờ nộp,Điểm,Số lần vi phạm,Đáp án\n';
    fs.writeFileSync(filename, header, 'utf8');
  }
  
  const content = fs.readFileSync(filename, 'utf8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const stt = lines.length;
  
  const row = [
    stt,
    `"${submissionData.name}"`,
    submissionData.dob || '',
    className,
    new Date().toLocaleString('vi-VN'),
    submissionData.score !== null ? submissionData.score : 'Chưa chấm',
    submissionData.violations || 0,
    `"${JSON.stringify(submissionData.answers).replace(/"/g, '""')}"`
  ].join(',') + '\n';
  
  fs.appendFileSync(filename, row, 'utf8');
  
  return { filename, totalSubmissions: stt };
}

async function sendClassEmail(className, filename, examId) {
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
        pass: (process.env.MAIL_PASS || '').replace(/\s/g, '')
      }
    });

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: process.env.EMAIL_TO || process.env.MAIL_USER,
      subject: `📊 Kết quả lớp ${className} - ${new Date().toLocaleDateString('vi-VN')}`,
      text: `Kính gửi Thầy/Cô,\n\nĐính kèm file kết quả thi của lớp ${className}.\nMã đề: ${examId}\n\nTrân trọng.`,
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
    
    let score = null;
    let questions = [];
    
    if (examId) {
      try {
        const examPath = path.join(process.cwd(), 'data', 'exams', `${examId}.json`);
        if (fs.existsSync(examPath)) {
          const examData = JSON.parse(fs.readFileSync(examPath, 'utf8'));
          questions = examData.questions;
          score = calculateScore(answers, examData.answers, questions);
        }
      } catch (e) {
        console.error('Error calculating score:', e);
      }
    }
    
    const doc = create({ version: '1.0' })
      .ele('ketqua')
        .ele('hoten').txt(name || '').up()
        .ele('lop').txt(className || '').up()
        .ele('ngaysinh').txt(dob || '').up()
        .ele('examId').txt(examId || '').up()
        .ele('diem').txt(score !== null ? String(score) : '').up()
        .ele('violations').txt(String(violations || 0)).up()
        .ele('traloi').txt(JSON.stringify(answers || {})).up()
      .up();
    
    const xml = doc.end({ prettyPrint: true });
    const xmlDir = path.join(process.cwd(), 'data', 'submissions');
    if (!fs.existsSync(xmlDir)) fs.mkdirSync(xmlDir, { recursive: true });
    
    const timestamp = Date.now();
    const xmlFilename = path.join(xmlDir, `${timestamp}_${className || 'unknown'}.xml`);
    fs.writeFileSync(xmlFilename, xml, 'utf8');
    // Upload file XML bài nộp lên Google Drive
    let driveResult = null;
    try {
      driveResult = await uploadToDrive(xmlFilename, path.basename(xmlFilename), 'application/xml');
      if (driveResult) {
        console.log(`Uploaded submission to Drive: ${driveResult.webViewLink}`);
      }
    } catch (err) {
      console.error('Drive upload error:', err.message);
    }

    const csvResult = updateCSV(className, {
      name,
      dob,
      score,
      violations,
      answers
    });
    
    res.json({ 
      ok: true, 
      file: path.basename(xmlFilename), 
      score,
      totalSubmissions: csvResult.totalSubmissions - 1
    });
    
    setImmediate(async () => {
      try {
        if (!process.env.MAIL_USER || !process.env.MAIL_PASS) return;
        
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || 465),
          secure: true,
          auth: { 
            user: process.env.MAIL_USER, 
            pass: (process.env.MAIL_PASS || '').replace(/\s/g, '')
          }
        });

        await transporter.sendMail({
          from: process.env.MAIL_USER,
          to: process.env.EMAIL_TO || process.env.MAIL_USER,
          subject: `Bài nộp: ${name} - ${className}${score !== null ? ` - ${score} điểm` : ''}`,
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

router.post('/send-class-report', async (req, res) => {
  try {
    const { className, examId } = req.body;
    const csvPath = path.join(process.cwd(), 'data', 'csv', `${className}.csv`);
    
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ ok: false, error: 'Chưa có bài nộp' });
    }
    
    await sendClassEmail(className, csvPath, examId);
    
    res.json({ ok: true, message: 'Đã gửi email' });
  } catch(e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
