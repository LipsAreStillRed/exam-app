// routes/student.js - FINAL FIX VERSION
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

// ✅ FIX: Hàm chấm điểm SO SÁNH THEO NỘI DUNG, KHÔNG PHẢI KEY
function calculateScore(studentAnswers, correctAnswers, questions, examData = null) {
  console.log('🔍 calculateScore called');
  console.log('📝 Student answers:', studentAnswers);
  console.log('✅ Correct answers from server:', correctAnswers);
  
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

  // ✅ TẠO MAP NỘI DUNG ĐÁP ÁN ĐÚNG (từ đề gốc)
  const correctContentMap = {};
  (questions || []).forEach(q => {
    const qid = String(q.id);
    const ca = correctAns[qid];
    
    if (q.type === 'multiple_choice' && Array.isArray(q.options) && ca) {
      const correctOption = q.options.find(opt => opt.key === ca);
      if (correctOption) {
        correctContentMap[qid] = normalizeStr(correctOption.text);
        console.log(`📋 Câu ${qid}: Đáp án đúng = key "${ca}" → nội dung "${correctOption.text.substring(0, 30)}..."`);
      }
    }
  });

  console.log('\n🔍 Bắt đầu so sánh đáp án:\n');

  (questions || []).forEach(q => {
    const qid = String(q.id);

    // ✅ TRUE/FALSE NHIỀU Ý
    if (q.type === 'true_false' && Array.isArray(q.subQuestions)) {
      q.subQuestions.forEach(sub => {
        total++;
        const key = String(sub.key);
        const ca = correctAns[qid]?.[key];
        const sa = studentAns[qid]?.[key];
        
        console.log(`Câu ${qid}${key}: HS="${sa}" vs ĐA="${ca}"`);
        
        if (!ca || !sa) return;
        if (normalizeStr(sa) === normalizeStr(ca)) {
          correct++;
          console.log(`  ✅ Đúng\n`);
        } else {
          console.log(`  ❌ Sai\n`);
        }
      });
      return;
    }

    // ✅ MULTIPLE CHOICE - SO SÁNH THEO NỘI DUNG
    if (q.type === 'multiple_choice') {
      total++;
      const studentKey = studentAns[qid];
      const correctContent = correctContentMap[qid];
      
      console.log(`Câu ${qid}:`);
      console.log(`  - HS chọn key: "${studentKey}"`);
      
      if (!studentKey) {
        console.log(`  ❌ Không trả lời\n`);
        return;
      }
      
      // ✅ LẤY NỘI DUNG từ examData (đề đã trộn học sinh nhìn thấy)
      let studentContent = null;
      if (examData?.questions) {
        const shuffledQ = examData.questions.find(eq => String(eq.id) === qid);
        if (shuffledQ?.options) {
          const studentOption = shuffledQ.options.find(opt => opt.key === studentKey);
          if (studentOption) {
            studentContent = normalizeStr(studentOption.text);
            console.log(`  - Nội dung HS chọn: "${studentOption.text.substring(0, 30)}..."`);
          }
        }
      }
      
      // Fallback: nếu không có examData, lấy từ questions gốc
      if (!studentContent) {
        const originalOption = q.options?.find(opt => opt.key === studentKey);
        if (originalOption) {
          studentContent = normalizeStr(originalOption.text);
          console.log(`  - Nội dung HS chọn (fallback): "${originalOption.text.substring(0, 30)}..."`);
        }
      }
      
      console.log(`  - Nội dung đáp án đúng: "${correctContent}"`);
      
      if (studentContent === correctContent) {
        correct++;
        console.log(`  ✅ ĐÚNG - Nội dung khớp!\n`);
      } else {
        console.log(`  ❌ SAI - Nội dung khác!\n`);
      }
      return;
    }

    // ✅ TRUE/FALSE ĐƠN
    if (q.type === 'true_false') {
      total++;
      const ca = correctAns[qid];
      const sa = studentAns[qid];
      
      console.log(`Câu ${qid}: HS="${sa}" vs ĐA="${ca}"`);
      
      if (!ca || !sa) return;
      if (normalizeStr(sa) === normalizeStr(ca)) {
        correct++;
        console.log(`  ✅ Đúng\n`);
      } else {
        console.log(`  ❌ Sai\n`);
      }
      return;
    }

    // ✅ SHORT ANSWER
    if (q.type === 'short_answer') {
      total++;
      const ca = correctAns[qid];
      const sa = studentAns[qid];
      
      let saStr = sa;
      let caStr = ca;
      
      if (Array.isArray(sa)) saStr = sa.filter(Boolean).join('');
      else if (typeof sa === 'object' && sa?.boxes) saStr = sa.boxes.filter(Boolean).join('');
      if (Array.isArray(ca)) caStr = ca.filter(Boolean).join('');
      
      console.log(`Câu ${qid}: HS="${saStr}" vs ĐA="${caStr}"`);
      
      if (normalizeStr(saStr) === normalizeStr(caStr)) {
        correct++;
        console.log(`  ✅ Đúng\n`);
      } else {
        console.log(`  ❌ Sai\n`);
      }
    }
  });

  if (total === 0) {
    console.warn('⚠️ Không có câu hỏi nào để chấm');
    return null;
  }
  
  const score = Math.round((correct / total) * 10 * 10) / 10;
  console.log(`\n📊 KẾT QUẢ CUỐI: ${correct}/${total} = ${score}/10\n`);
  
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

// ✅ ROUTE SUBMIT
router.post('/submit', async (req, res) => {
  try {
    const { id, name, className, dob, answers, examId, violations, email, examData, startTime, endTime } = req.body;

    console.log('\n' + '='.repeat(80));
    console.log('📨 NHẬN BÀI NỘP MỚI');
    console.log('='.repeat(80));
    console.log(`Tên: ${name}`);
    console.log(`Lớp: ${className}`);
    console.log(`ExamID: ${examId}`);
    console.log(`Vi phạm: ${violations}`);
    console.log(`Thời gian bắt đầu: ${startTime ? new Date(startTime).toLocaleString('vi-VN') : 'N/A'}`);
    console.log(`Thời gian kết thúc: ${endTime ? new Date(endTime).toLocaleString('vi-VN') : 'N/A'}`);
    console.log(`Có examData: ${examData ? 'Có (' + examData.questions?.length + ' câu)' : 'Không'}`);
    console.log('='.repeat(80) + '\n');

    let score = null;
    let questions = [];

    if (examId) {
      try {
        const baseId = String(examId).split('_r')[0].split('_v')[0];
        const examJsonPath = path.join(process.cwd(), 'data', 'exams', `${baseId}.json`);
        let examDataFromServer = null;

        if (fs.existsSync(examJsonPath)) {
          examDataFromServer = JSON.parse(fs.readFileSync(examJsonPath, 'utf8'));
          console.log('✅ Đã load đề thi gốc từ local');
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
          
          let correctAnswers = {};
          
          if (examDataFromServer.answers && Object.keys(examDataFromServer.answers).length > 0) {
            correctAnswers = examDataFromServer.answers;
            console.log('✅ Dùng đáp án từ examData.answers');
          } else {
            correctAnswers = {};
            (examDataFromServer.questions || []).forEach(q => {
              if (q.correctAnswer !== undefined) {
                correctAnswers[String(q.id)] = q.correctAnswer;
              }
            });
            console.log('⚠️ Fallback: Dùng đáp án từ q.correctAnswer');
          }
          
          console.log('\n📋 Đáp án đúng (từ server - đề gốc):');
          Object.entries(correctAnswers).forEach(([k, v]) => {
            console.log(`  Câu ${k}: ${JSON.stringify(v)}`);
          });
          
          console.log('\n📦 Đáp án học sinh (đã map về ID gốc):');
          Object.entries(answers || {}).forEach(([k, v]) => {
            console.log(`  Câu ${k}: ${JSON.stringify(v)}`);
          });
          
          // ✅ CHẤM ĐIỂM - TRUYỀN examData để so sánh nội dung
          score = calculateScore(answers || {}, correctAnswers, questions, examData);
        }
      } catch (e) {
        console.error('❌ Error calculating score:', e);
      }
    }

    // ✅ TÍNH THỜI GIAN LÀM BÀI
    let duration = null;
    let startTimeFormatted = 'N/A';
    let endTimeFormatted = 'N/A';
    
    if (startTime && endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);
      const durationMs = end - start;
      
      // Chuyển sang phút:giây
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      startTimeFormatted = start.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      endTimeFormatted = end.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      
      console.log(`⏱️ Thời gian làm bài: ${duration} (${minutes} phút ${seconds} giây)\n`);
    }

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

    const doc = create({ version: '1.0' })
      .ele('ketqua')
        .ele('hoten').txt(name || '').up()
        .ele('lop').txt(className || '').up()
        .ele('ngaysinh').txt(dob || '').up()
        .ele('examId').txt(examId || '').up()
        .ele('diem').txt(score !== null ? String(score) : 'Chưa chấm').up()
        .ele('violations').txt(String(violations || 0)).up()
        .ele('thoigianbatdau').txt(startTimeFormatted).up()
        .ele('thoigianketthuc').txt(endTimeFormatted).up()
        .ele('thoigianlambaiphutgiay').txt(duration || 'N/A').up()
        .ele('traloi').txt(JSON.stringify(answers || {})).up();
    
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

    const xmlDir = path.join(process.cwd(), 'data', 'submissions');
    if (!fs.existsSync(xmlDir)) fs.mkdirSync(xmlDir, { recursive: true });

    const timestamp = Date.now();
    const xmlFilename = path.join(xmlDir, `${timestamp}_${(name || 'unknown').replace(/\s+/g, '_')}.xml`);
    fs.writeFileSync(xmlFilename, xml, 'utf8');

    const csvResult = updateCSV(className || 'unknown', { name, dob, score, violations, answers });

    res.json({
      ok: true,
      file: path.basename(xmlFilename),
      score,
      totalSubmissions: csvResult.totalSubmissions - 1,
      driveLink: null
    });

    queueMicrotask(async () => {
      try {
        if (String(process.env.DRIVE_ENABLED || '').toLowerCase() === 'true') {
          const driveResult = await uploadToDrive(xmlFilename, path.basename(xmlFilename), 'application/xml');
          if (driveResult) {
            console.log(`✅ Uploaded submission to Drive: ${driveResult.webViewLink || driveResult.webContentLink}`);
          }
        }

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
