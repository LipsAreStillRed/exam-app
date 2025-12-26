import express from 'express';
import fs from 'fs';
import path from 'path';
import { create } from 'xmlbuilder2';
import { uploadToDrive, downloadFromDrive } from '../utils/driveHelper.js';
import { sendEmail, sendClassEmail } from '../utils/emailHelper.js';

const router = express.Router();

/* ====================== SCORE CALCULATION - FIXED ====================== */
function calculateScore(answers, correctAnswers, questions) {
  console.log('🔢 Bắt đầu chấm điểm...');
  console.log('📝 Đáp án đúng:', correctAnswers);
  console.log('✍️  Đáp án học sinh:', answers);
  
  if (!correctAnswers || Object.keys(correctAnswers).length === 0) {
    console.log('❌ Không có đáp án đúng');
    return null;
  }

  let correct = 0;
  let total = 0;

  (questions || []).forEach(q => {
    const qid = String(q.id); // Đảm bảo qid là string

    // True/False nhiều ý
    if (q.type === 'true_false' && Array.isArray(q.subQuestions) && q.subQuestions.length > 0) {
      q.subQuestions.forEach(sub => {
        total++;
        const subKey = String(sub.key);
        const ca = correctAnswers[qid]?.[subKey];
        const sa = answers[qid]?.[subKey];
        
        if (!ca || !sa) {
          console.log(`❌ Câu ${qid}-${subKey}: Thiếu đáp án (CA: ${ca}, SA: ${sa})`);
          return;
        }
        
        const match = String(sa).trim().toUpperCase() === String(ca).trim().toUpperCase();
        if (match) {
          correct++;
          console.log(`✅ Câu ${qid}-${subKey}: Đúng`);
        } else {
          console.log(`❌ Câu ${qid}-${subKey}: Sai (CA: ${ca}, SA: ${sa})`);
        }
      });
      return;
    }

    // Câu đơn (Multiple Choice, True/False đơn, Short Answer)
    total++;
    const ca = correctAnswers[qid];
    const sa = answers[qid];
    
    if (!ca || !sa) {
      console.log(`❌ Câu ${qid}: Thiếu đáp án (CA: ${ca}, SA: ${sa})`);
      return;
    }

    // Xử lý Short Answer (array)
    let saStr = sa;
    let caStr = ca;
    
    if (Array.isArray(sa)) {
      saStr = sa.filter(Boolean).join('');
    } else if (typeof sa === 'object' && sa?.boxes) {
      saStr = sa.boxes.filter(Boolean).join('');
    }
    
    if (Array.isArray(ca)) {
      caStr = ca.filter(Boolean).join('');
    }

    // So sánh (bỏ khoảng trắng, uppercase)
    const saClean = String(saStr).trim().toUpperCase().replace(/\s/g, '');
    const caClean = String(caStr).trim().toUpperCase().replace(/\s/g, '');
    
    if (saClean === caClean) {
      correct++;
      console.log(`✅ Câu ${qid}: Đúng`);
    } else {
      console.log(`❌ Câu ${qid}: Sai (CA: "${caClean}", SA: "${saClean}")`);
    }
  });

  if (total === 0) {
    console.log('❌ Không có câu hỏi nào để chấm');
    return null;
  }
  
  const score = Math.round((correct / total) * 10 * 10) / 10;
  console.log(`🎯 Kết quả: ${correct}/${total} = ${score}/10`);
  return score;
}

const resultFile = path.join(process.cwd(), 'data', 'result.json');

function updateResultJson(className, studentData) {
  try {
    let result = {};
    if (fs.existsSync(resultFile)) {
      result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    }
    if (!result[className]) result[className] = [];

    const idx = result[className].findIndex(s => s.id === studentData.id);
    if (idx >= 0) result[className][idx] = studentData;
    else result[className].push(studentData);

    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf8');
  } catch (err) {
    console.error('updateResultJson error:', err.message);
  }
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
    `"${submissionData.name || ''}"`,
    submissionData.dob || '',
    className || '',
    new Date().toLocaleString('vi-VN'),
    submissionData.score !== null && submissionData.score !== undefined ? submissionData.score : 'Chưa chấm',
    submissionData.violations || 0,
    `"${JSON.stringify(submissionData.answers || {}).replace(/"/g, '""')}"`
  ].join(',') + '\n';

  fs.appendFileSync(filename, row, 'utf8');
  return { filename, totalSubmissions: stt };
}

// FIX: Submit với chấm điểm chính xác
router.post('/submit', async (req, res) => {
  try {
    const { id, name, className, dob, answers, examId, violations, email } = req.body;

    console.log('📥 Nhận bài nộp:', { examId, name, className });

    // Tính điểm theo đề gốc
    let score = null;
    let questions = [];
    
    if (examId) {
      try {
        // Lấy baseId từ examId (loại bỏ _r hoặc _v)
        const baseId = String(examId).split('_r')[0].split('_v')[0];
        console.log('🔍 Tìm đề gốc:', baseId);
        
        const examJsonPath = path.join(process.cwd(), 'data', 'exams', `${baseId}.json`);
        let examData = null;

        // Đọc từ file local
        if (fs.existsSync(examJsonPath)) {
          examData = JSON.parse(fs.readFileSync(examJsonPath, 'utf8'));
          console.log('✅ Đọc đề từ file local');
        } else {
          // Fallback: đọc từ Drive
          try {
            const metaPath = path.join(process.cwd(), 'data', 'exams', `${baseId}.json`);
            if (fs.existsSync(metaPath)) {
              const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
              if (meta.driveFileId) {
                examData = await downloadFromDrive(meta.driveFileId);
                console.log('✅ Đọc đề từ Drive');
              }
            }
          } catch (err) {
            console.error('❌ Không tải được đề từ Drive:', err.message);
          }
        }

        if (examData) {
          questions = examData.questions || [];
          const correctAnswers = examData.answers || {};
          
          console.log('📊 Số câu hỏi:', questions.length);
          console.log('📊 Số đáp án đúng:', Object.keys(correctAnswers).length);
          
          if (Object.keys(correctAnswers).length === 0) {
            console.log('⚠️  Đề chưa có đáp án!');
          }
          
          score = calculateScore(answers || {}, correctAnswers, questions);
        } else {
          console.log('❌ Không tìm thấy đề thi');
        }
      } catch (e) {
        console.error('❌ Error calculating score:', e);
      }
    }

    // Cập nhật result.json
    updateResultJson(className || 'unknown', {
      id: id || name || `stu_${Date.now()}`,
      name: name || '',
      email: email || '',
      score,
      submittedAt: new Date().toISOString(),
      status: 'submitted',
      answers: JSON.stringify(answers || {})
    });

    // Lưu XML bài nộp
    const doc = create({ version: '1.0' })
      .ele('ketqua')
        .ele('hoten').txt(name || '').up()
        .ele('lop').txt(className || '').up()
        .ele('ngaysinh').txt(dob || '').up()
        .ele('examId').txt(examId || '').up()
        .ele('diem').txt(score !== null ? String(score) : 'Chưa chấm').up()
        .ele('violations').txt(String(violations || 0)).up()
        .ele('traloi').txt(JSON.stringify(answers || {})).up()
      .up();
    const xml = doc.end({ prettyPrint: true });

    const xmlDir = path.join(process.cwd(), 'data', 'submissions');
    if (!fs.existsSync(xmlDir)) fs.mkdirSync(xmlDir, { recursive: true });

    const timestamp = Date.now();
    const xmlFilename = path.join(xmlDir, `${timestamp}_${(className || 'unknown')}.xml`);
    fs.writeFileSync(xmlFilename, xml, 'utf8');

    // Cập nhật CSV
    const csvResult = updateCSV(className || 'unknown', { name, dob, score, violations, answers });

    // Phản hồi cho frontend
    res.json({
      ok: true,
      file: path.basename(xmlFilename),
      score,
      totalSubmissions: csvResult.totalSubmissions - 1,
      driveLink: null
    });

    // Tác vụ chậm sau phản hồi
    queueMicrotask(async () => {
      try {
        if (String(process.env.DRIVE_ENABLED || '').toLowerCase() === 'true') {
          const driveResult = await uploadToDrive(xmlFilename, path.basename(xmlFilename), 'application/xml');
          if (driveResult) console.log(`✅ Uploaded submission to Drive: ${driveResult.webViewLink || driveResult.webContentLink}`);
        }

        if (process.env.MAIL_USER && process.env.MAIL_PASS) {
          await sendEmail({
            to: process.env.EMAIL_TO || process.env.MAIL_USER,
            subject: `Bài nộp: ${name || '(không tên)'} - ${className || '(không lớp)'}${score !== null ? ` - ${score} điểm` : ''}`,
            html: `Học sinh ${name || ''} (${className || ''}) đã nộp bài.<br>Số lần vi phạm: ${violations || 0}${score !== null ? `<br>Điểm: ${score}/10` : ''}`,
            attachments: [{ filename: path.basename(xmlFilename), path: xmlFilename }]
          });
        }
      } catch (error) {
        console.error('Post-submit tasks error:', error.message);
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ====================== LIST SUBMISSIONS ====================== */
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
      const timestamp = parseInt(f.split('_')[0], 10);

      return {
        filename: f,
        name: nameMatch ? nameMatch[1] : 'Unknown',
        className: classMatch ? classMatch[1] : 'Unknown',
        score: scoreMatch && scoreMatch[1] && scoreMatch[1] !== 'Chưa chấm' ? scoreMatch[1] : 'Chưa chấm',
        timestamp,
        date: isNaN(timestamp) ? '' : new Date(timestamp).toLocaleString('vi-VN')
      };
    }).sort((a, b) => b.timestamp - a.timestamp);

    res.json({ ok: true, submissions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ====================== SEND CLASS REPORT ====================== */
router.post('/send-class-report', async (req, res) => {
  try {
    const { className, examId } = req.body;
    const csvPath = path.join(process.cwd(), 'data', 'csv', `${className}.csv`);

    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ ok: false, error: 'Chưa có bài nộp' });
    }

    await sendClassEmail(className, csvPath, examId);
    res.json({ ok: true, message: 'Đã gửi email' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
