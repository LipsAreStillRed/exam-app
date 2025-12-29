// routes/student.js - FIXED VERSION
import express from 'express';
import fs from 'fs';
import path from 'path';
import { create } from 'xmlbuilder2';
import { uploadToDrive, downloadFromDrive } from '../utils/driveHelper.js';
import { sendEmail, sendClassEmail } from '../utils/emailHelper.js';

const router = express.Router();

function normalizeStr(x) {
  return String(x ?? '').trim().toUpperCase().replace(/\s/g, '');
}

// ✅ FIX: Hàm chấm điểm với xử lý đề trộn
function calculateScore(studentAnswers, correctAnswers, questions, examData = null) {
  console.log('🔍 calculateScore called');
  console.log('📝 Student answers:', studentAnswers);
  console.log('✅ Correct answers:', correctAnswers);
  
  // ✅ NẾU CÓ examData (đề đã trộn): Log để debug
  if (examData?.questions) {
    console.log('📋 ExamData questions (shuffled):');
    examData.questions.forEach(q => {
      console.log(`  - DisplayIndex ${q.displayIndex} → Original ID "${q.id}"`);
    });
  }
  
  const studentAns = Object.fromEntries(
    Object.entries(studentAnswers || {}).map(([k, v]) => [String(k), v])
  );
  const correctAns = Object.fromEntries(
    Object.entries(correctAnswers || {}).map(([k, v]) => [String(k), v])
  );

  if (!correctAns || Object.keys(correctAns).length === 0) {
    console.warn('⚠️ Không có đáp án đúng');
    return null;
  }

  let correct = 0;
  let total = 0;

  (questions || []).forEach(q => {
    const qid = String(q.id);

    // True/False nhiều ý
    if (q.type === 'true_false' && Array.isArray(q.subQuestions)) {
      q.subQuestions.forEach(sub => {
        total++;
        const key = String(sub.key);
        const ca = correctAns[qid]?.[key];
        const sa = studentAns[qid]?.[key];
        
        console.log(`Câu ${qid}${key}: HS="${sa}" vs ĐA="${ca}"`);
        
        if (!ca || !sa) {
          console.log(`  → Không có đáp án`);
          return;
        }
        if (normalizeStr(sa) === normalizeStr(ca)) {
          correct++;
          console.log(`✅ Đúng`);
        } else {
          console.log(`❌ Sai`);
        }
      });
      return;
    }

    // Câu đơn (multiple_choice, true_false đơn, short_answer)
    total++;
    const ca = correctAns[qid];
    const sa = studentAns[qid];
    
    console.log(`Câu ${qid}: HS="${JSON.stringify(sa)}" vs ĐA="${JSON.stringify(ca)}"`);

    if (!ca || !sa) {
      console.log(`  → Không có đáp án`);
      return;
    }

    let saStr = sa;
    let caStr = ca;
    
    // Xử lý short_answer (array)
    if (Array.isArray(sa)) saStr = sa.filter(Boolean).join('');
    else if (typeof sa === 'object' && sa?.boxes) saStr = sa.boxes.filter(Boolean).join('');
    if (Array.isArray(ca)) caStr = ca.filter(Boolean).join('');

    if (normalizeStr(saStr) === normalizeStr(caStr)) {
      correct++;
      console.log(`✅ Đúng`);
    } else {
      console.log(`❌ Sai (normalized: "${normalizeStr(saStr)}" vs "${normalizeStr(caStr)}")`);
    }
  });

  if (total === 0) {
    console.warn('⚠️ Không có câu hỏi nào để chấm');
    return null;
  }
  
  const score = Math.round((correct / total) * 10 * 10) / 10;
  console.log(`📊 Kết quả: ${correct}/${total} = ${score}/10`);
  
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
    new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    submissionData.score !== null && submissionData.score !== undefined ? submissionData.score : 'Chưa chấm',
    submissionData.violations || 0,
    `"${JSON.stringify(submissionData.answers || {}).replace(/"/g, '""')}"`
  ].join(',') + '\n';

  fs.appendFileSync(filename, row, 'utf8');
  return { filename, totalSubmissions: stt };
}

// ✅ ROUTE SUBMIT - ĐÃ FIX XỬ LÝ ĐỀ TRỘN
router.post('/submit', async (req, res) => {
  try {
    const { id, name, className, dob, answers, examId, violations, email, examData } = req.body;

    console.log('📨 Nhận bài nộp:', { name, className, examId, violations });
    console.log('📦 Đáp án học sinh (đã map về ID gốc):', answers);
    console.log('📋 ExamData từ frontend:', examData ? 'Có (' + examData.questions?.length + ' câu)' : 'Không');

    let score = null;
    let questions = [];

    if (examId) {
      try {
        // ✅ Lấy đề gốc từ server
        const baseId = String(examId).split('_r')[0].split('_v')[0];
        const examJsonPath = path.join(process.cwd(), 'data', 'exams', `${baseId}.json`);
        let examDataFromServer = null;

        if (fs.existsSync(examJsonPath)) {
          examDataFromServer = JSON.parse(fs.readFileSync(examJsonPath, 'utf8'));
          console.log('✅ Đã load đề thi từ local');
        } else {
          console.log('⚠️ Không tìm thấy đề local, thử load từ Drive...');
          try {
            const metaPath = path.join(process.cwd(), 'data', 'exams', `${baseId}.json`);
            if (fs.existsSync(metaPath)) {
              const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
              if (meta.driveFileId) {
                examDataFromServer = await downloadFromDrive(meta.driveFileId);
                if (examDataFromServer) {
                  fs.writeFileSync(examJsonPath, JSON.stringify(examDataFromServer, null, 2), 'utf8');
                  console.log('✅ Đã load đề từ Drive');
                }
              }
            }
          } catch (err) {
            console.error('❌ Không tải được đề từ Drive:', err?.response?.data || err.message);
          }
        }

        if (examDataFromServer) {
          questions = examDataFromServer.questions || [];
          
          // ✅ Lấy đáp án từ examData.answers (ưu tiên)
          let correctAnswers = {};
          
          if (examDataFromServer.answers && Object.keys(examDataFromServer.answers).length > 0) {
            correctAnswers = examDataFromServer.answers;
            console.log('✅ Dùng đáp án từ examData.answers');
          } else {
            // Fallback: lấy từ correctAnswer của từng câu
            correctAnswers = {};
            (examDataFromServer.questions || []).forEach(q => {
              if (q.correctAnswer !== undefined) {
                correctAnswers[String(q.id)] = q.correctAnswer;
              }
            });
            console.log('⚠️ Fallback: Dùng đáp án từ q.correctAnswer');
          }
          
          console.log('📋 Đáp án đúng (từ server):', correctAnswers);
          
          // ✅ CHẤM ĐIỂM - Truyền examData để xử lý mapping (nếu cần)
          score = calculateScore(answers || {}, correctAnswers, questions, examData);
        }
      } catch (e) {
        console.error('❌ Error calculating score:', e);
      }
    }

    // ✅ Lưu kết quả vào result.json
    updateResultJson(className || 'unknown', {
      id: id || name || `stu_${Date.now()}`,
      name: name || '',
      email: email || '',
      score,
      submittedAt: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      status: 'submitted',
      violations: violations || 0,
      answers: JSON.stringify(answers || {})
    });

    // ✅ Tạo XML submission
    const doc = create({ version: '1.0' })
      .ele('ketqua')
        .ele('hoten').txt(name || '').up()
        .ele('lop').txt(className || '').up()
        .ele('ngaysinh').txt(dob || '').up()
        .ele('examId').txt(examId || '').up()
        .ele('diem').txt(score !== null ? String(score) : 'Chưa chấm').up()
        .ele('violations').txt(String(violations || 0)).up()
        .ele('traloi').txt(JSON.stringify(answers || {})).up();
    
    // ✅ Thêm thông tin đề bài đã trộn (nếu frontend gửi lên)
    if (examData && examData.questions) {
      const questionsXml = doc.ele('questions');
      examData.questions.forEach(q => {
        const qNode = questionsXml.ele('question')
          .ele('id').txt(String(q.id)).up()
          .ele('displayIndex').txt(String(q.displayIndex || '')).up()
          .ele('type').txt(q.type || '').up()
          .ele('text').txt(q.question || q.text || '').up();
        
        if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
          const optsNode = qNode.ele('options');
          q.options.forEach(opt => {
            optsNode.ele('option')
              .ele('key').txt(opt.key).up()
              .ele('text').txt(opt.text || '').up()
            .up();
          });
        }
        
        qNode.up();
      });
    }
    
    const xml = doc.end({ prettyPrint: true });

    // ✅ Lưu XML
    const xmlDir = path.join(process.cwd(), 'data', 'submissions');
    if (!fs.existsSync(xmlDir)) fs.mkdirSync(xmlDir, { recursive: true });

    const timestamp = Date.now();
    const xmlFilename = path.join(xmlDir, `${timestamp}_${(name || 'unknown').replace(/\s+/g, '_')}.xml`);
    fs.writeFileSync(xmlFilename, xml, 'utf8');

    // ✅ Cập nhật CSV
    const csvResult = updateCSV(className || 'unknown', { name, dob, score, violations, answers });

    // ✅ Response ngay cho học sinh
    res.json({
      ok: true,
      file: path.basename(xmlFilename),
      score,
      totalSubmissions: csvResult.totalSubmissions - 1,
      driveLink: null
    });

    // ✅ Upload Drive + Email bất đồng bộ
    queueMicrotask(async () => {
      try {
        // Upload lên Drive
        if (String(process.env.DRIVE_ENABLED || '').toLowerCase() === 'true') {
          const driveResult = await uploadToDrive(xmlFilename, path.basename(xmlFilename), 'application/xml');
          if (driveResult) {
            console.log(`✅ Uploaded submission to Drive: ${driveResult.webViewLink || driveResult.webContentLink}`);
          }
        }

        // Gửi email
        if (process.env.MAIL_USER && process.env.MAIL_PASS) {
          await sendEmail({
            to: process.env.EMAIL_TO || process.env.MAIL_USER,
            subject: `Bài nộp: ${name || '(không tên)'} - ${className || '(không lớp)'}${score !== null ? ` - ${score} điểm` : ''}`,
            html: `
              <h3>Bài nộp mới</h3>
              <p><strong>Học sinh:</strong> ${name || '(không tên)'}</p>
              <p><strong>Lớp:</strong> ${className || '(không lớp)'}</p>
              <p><strong>Điểm:</strong> ${score !== null ? score + '/10' : 'Chưa chấm'}</p>
              <p><strong>Số lần vi phạm:</strong> ${violations || 0}</p>
              <p><strong>Thời gian:</strong> ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
            `,
            attachments: [{ filename: path.basename(xmlFilename), path: xmlFilename }]
          });
          console.log('✅ Email sent');
        }
      } catch (error) {
        console.error('Post-submit tasks error:', error.message);
      }
    });
  } catch (e) {
    console.error('❌ Submit error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ✅ GET SUBMISSIONS LIST
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
        date: isNaN(timestamp) ? '' : new Date(timestamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
      };
    }).sort((a, b) => b.timestamp - a.timestamp);

    res.json({ ok: true, submissions });
  } catch (e) {
    console.error('❌ Get submissions error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ✅ SEND CLASS REPORT
router.post('/send-class-report', async (req, res) => {
  try {
    const { className, examId } = req.body;
    const csvPath = path.join(process.cwd(), 'data', 'csv', `${className}.csv`);

    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ ok: false, error: 'Chưa có bài nộp nào của lớp này' });
    }

    await sendClassEmail(className, csvPath, examId);
    res.json({ ok: true, message: 'Đã gửi email báo cáo lớp thành công' });
  } catch (e) {
    console.error('❌ Send class report error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
