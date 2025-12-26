// routes/exam.js
import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import omml2mathml from 'omml2mathml';
import { v4 as uuidv4 } from 'uuid';
import { uploadToDrive, deleteFromDrive, downloadFromDrive } from '../utils/driveHelper.js';
import { parseExamContent, flattenSections } from '../utils/parseExamContent.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// storage helpers
function ensureDir() {
  const dir = path.join(process.cwd(), 'data', 'exams');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function examPath(id) { return path.join(ensureDir(), `${id}.json`); }
function readExam(id) { try { return JSON.parse(fs.readFileSync(examPath(id), 'utf8')); } catch { return null; } }
function writeExam(exam) { fs.writeFileSync(examPath(exam.id), JSON.stringify(exam, null, 2), 'utf8'); }

function convertOmmlToMathml(xml) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const mmlNode = omml2mathml(doc);
    return mmlNode?.toString ? mmlNode.toString() : String(mmlNode);
  } catch { return null; }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Resequence các lựa chọn thành A/B/C/D theo thứ tự mới
function resequenceOptionsABCD(optionsByText) {
  const letters = ['A','B','C','D','E','F'];
  return optionsByText.map((opt, idx) => ({ key: letters[idx], text: opt.text }));
}

// Trộn đáp án trắc nghiệm dựa theo text để giữ đúng đáp án
function shuffleOptionsWithTextPreserved(q) {
  if (q.type !== 'multiple_choice' || !Array.isArray(q.options) || q.options.length === 0) return q;

  // Lấy text của đáp án đúng
  let correctText = null;
  if (q.correctAnswer) {
    const found = q.options.find(o => o.key === q.correctAnswer);
    if (found) correctText = found.text;
  } else if (q.correctAnswerText) {
    correctText = q.correctAnswerText;
  }

  // Trộn theo text và đánh lại key A/B/C/D
  const shuffledByText = shuffle(q.options.map(o => ({ text: o.text })));
  const rekeyed = resequenceOptionsABCD(shuffledByText);

  // Tìm key mới tương ứng với text đúng
  let newCorrectKey = null;
  if (correctText) {
    const match = rekeyed.find(o => String(o.text).trim() === String(correctText).trim());
    if (match) newCorrectKey = match.key;
  }

  return {
    ...q,
    options: rekeyed,
    ...(newCorrectKey ? { correctAnswer: newCorrectKey } : {})
  };
}

// Trộn True/False nhiều ý, map correctAnswer theo text để tránh lệch key
function shuffleTrueFalseSubQuestions(q) {
  if (q.type !== 'true_false' || !Array.isArray(q.subQuestions) || q.subQuestions.length === 0) return q;

  const shuffled = shuffle(q.subQuestions.map(sq => ({ text: sq.text })));
  const letters = ['a','b','c','d','e','f'];
  const rekeyed = shuffled.map((sq, idx) => ({ key: letters[idx], text: sq.text }));

  let newCorrect = {};
  if (q.correctAnswer && typeof q.correctAnswer === 'object') {
    // Map theo text để bảo toàn Đ/S
    for (const sq of rekeyed) {
      const old = (q.subQuestions || []).find(x => String(x.text).trim() === String(sq.text).trim());
      if (old && q.correctAnswer[old.key] !== undefined) {
        newCorrect[sq.key] = q.correctAnswer[old.key];
      }
    }
  }

  return { ...q, subQuestions: rekeyed, correctAnswer: newCorrect };
}

// Giữ nguyên q.id gốc, chỉ thay đổi displayIndex và nội dung trộn theo config
function makeRuntimeVariant(baseExam) {
  const cfg = baseExam.shuffleConfig || {};
  // Nếu đề không có part, coi như tất cả là part 1
  const part1 = baseExam.questions.filter(q => q.part === 1 || q.part === undefined);
  const part2 = baseExam.questions.filter(q => q.part === 2);
  const part3 = baseExam.questions.filter(q => q.part === 3);

  // Phần 1
  let p1 = [...part1];
  if (cfg.p1Mode === 'questions' || cfg.p1Mode === 'both') p1 = shuffle(p1);
  p1 = p1.map(q => (cfg.p1Mode === 'both' ? shuffleOptionsWithTextPreserved(q)
                                          : (q.type === 'multiple_choice'
                                             ? { ...q, options: resequenceOptionsABCD(q.options.map(o => ({ text: o.text }))) }
                                             : q)));

  // Phần 2
  let p2 = [...part2];
  if (cfg.p2Mode === 'questions' || cfg.p2Mode === 'both') p2 = shuffle(p2);
  p2 = p2.map(q => (cfg.p2Mode === 'both' ? shuffleTrueFalseSubQuestions(q) : q));

  // Phần 3
  let p3 = [...part3];
  if (cfg.p3Mode === 'questions') p3 = shuffle(p3);

  // Kết hợp, giữ nguyên id gốc, chỉ thêm displayIndex
  const questions = [...p1, ...p2, ...p3].map((q, idx) => ({
    ...q,
    displayIndex: idx + 1 // chỉ để hiển thị; id gốc giữ nguyên
  }));

  return {
    id: `${baseExam.id}_r${Date.now()}`,
    timeMinutes: baseExam.timeMinutes,
    password: baseExam.password,
    questions
  };
}

// Upload đề từ Word
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Chưa chọn file' });

    // Parse đề
    const raw = await mammoth.extractRawText({ path: req.file.path });
    const text = raw.value || '';
    const sections = parseExamContent(text);
    if (!sections.length) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: 'Không tìm thấy câu hỏi' });
    }

    // OMML -> MathML
    let mathmlMapByIndex = {};
    try {
      const zip = await JSZip.loadAsync(fs.readFileSync(req.file.path));
      const docXml = await zip.file('word/document.xml').async('string');
      const ommlBlocks = docXml.match(/<m:oMath[^>]*>[\s\S]*?<\/m:oMath>/g) || [];
      const mathmlList = ommlBlocks.map(convertOmmlToMathml).filter(Boolean);
      mathmlList.forEach((mml, idx) => { mathmlMapByIndex[idx] = mml; });
    } catch {}

    const examId = uuidv4();
    const timeMinutes = parseInt(req.body.timeMinutes || '45', 10);
    const baseQuestions = flattenSections(sections);

    baseQuestions.forEach((q, idx) => {
      if (mathmlMapByIndex[idx]) q.mathml = String(mathmlMapByIndex[idx]);
      if (typeof q.mathml !== 'string') delete q.mathml;
    });

    const cfg = {
      p1Mode: req.body.p1Mode || 'none',
      p2Mode: req.body.p2Mode || 'none',
      p3Mode: req.body.p3Mode || 'none',
      variantCount: parseInt(req.body.variantCount || '1', 10)
    };

    const examData = {
      id: examId,
      originalName: req.file.originalname,
      createdAt: Date.now(),
      timeMinutes,
      password: req.body.password || null,
      sections,
      questions: baseQuestions,
      answers: {}, // Khởi tạo để lưu đáp án
      variants: [],
      shuffleConfig: cfg
    };
    writeExam(examData);

    // Upload exam JSON lên Drive
    let driveResult = null;
    if (String(process.env.DRIVE_ENABLED || '').toLowerCase() === 'true') {
      try {
        driveResult = await uploadToDrive(examPath(examId), `exam_${examId}.json`, 'application/json');
        if (driveResult) {
          examData.driveFileId = driveResult.id;
          examData.driveLink = driveResult.webViewLink || driveResult.webContentLink;
          writeExam(examData);
          console.log('✅ Uploaded exam to Drive:', driveResult.webViewLink);
        }
      } catch (err) {
        console.error('❌ Drive upload error:', err?.response?.data || err.message);
      }
    }

    fs.unlinkSync(req.file.path);
    res.json({ ok: true, examId, count: baseQuestions.length, variantCount: cfg.variantCount, savedToDrive: !!driveResult });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Lưu đáp án và đồng bộ Drive
router.post('/:id/correct-answers', async (req, res) => {
  try {
    const baseId = String(req.params.id);
    if (baseId.includes('_v') || baseId.includes('_r')) {
      return res.status(400).json({ ok: false, error: 'Chỉ được lưu đáp án trên đề gốc' });
    }
    const exam = readExam(baseId);
    if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });

    const incomingAnswers = req.body.answers || {};
    console.log('📥 Nhận đáp án:', incomingAnswers);

    // Lưu map đáp án gốc
    exam.answers = incomingAnswers;

    // Gán correctAnswer lên từng câu để GV xem lại
    if (Array.isArray(exam.questions)) {
      exam.questions = exam.questions.map(q => {
        if (incomingAnswers[q.id] !== undefined) {
          return { ...q, correctAnswer: incomingAnswers[q.id] };
        }
        return q;
      });
    }

    writeExam(exam);
    console.log('✅ Đã lưu đáp án vào file local');

    // Đồng bộ lên Drive: xóa cũ → upload mới
    if (String(process.env.DRIVE_ENABLED || '').toLowerCase() === 'true') {
      try {
        if (exam.driveFileId) {
          await deleteFromDrive(exam.driveFileId);
          console.log('🗑️  Đã xóa file cũ trên Drive');
        }
        const driveResult = await uploadToDrive(examPath(baseId), `exam_${baseId}.json`, 'application/json');
        if (driveResult) {
          exam.driveFileId = driveResult.id;
          exam.driveLink = driveResult.webViewLink || driveResult.webContentLink;
          writeExam(exam);
          console.log('✅ Đã đồng bộ đáp án lên Drive:', driveResult.webViewLink);
        }
      } catch (err) {
        console.error('❌ Drive sync error:', err?.response?.data || err.message);
      }
    }

    res.json({ ok: true, message: 'Đã lưu đáp án thành công' });
  } catch (e) {
    console.error('❌ Error saving answers:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Danh sách đề (lọc chỉ đề gốc)
router.get('/list', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('_v') && !f.includes('_r'));
  const exams = files.map(f => {
    const exam = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return {
      id: exam.id,
      originalName: exam.originalName,
      createdAt: exam.createdAt,
      timeMinutes: exam.timeMinutes,
      questionCount: exam.questions?.length || 0,
      hasAnswers: exam.answers && Object.keys(exam.answers).length > 0,
      variants: exam.variants || []
    };
  });
  res.json({ ok: true, exams });
});

// Đề gốc mới nhất (giáo viên xem/nhập đáp án)
router.get('/latest', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('_v') && !f.includes('_r'));
  if (!files.length) return res.json({ ok: true, exam: null });
  const latest = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
                      .sort((a, b) => b.createdAt - a.createdAt)[0];
  res.json({ ok: true, exam: latest });
});

// Học sinh: nhận một phiên bản đề ngẫu nhiên từ đề mới nhất
router.get('/latest-variant', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('_v') && !f.includes('_r'));
  if (!files.length) return res.json({ ok: true, exam: null });
  const latest = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const runtime = makeRuntimeVariant(latest);
  const examForStudent = {
    id: runtime.id,
    baseId: latest.id, // QUAN TRỌNG: để backend biết đề gốc
    originalName: latest.originalName, 
    timeMinutes: runtime.timeMinutes, 
    password: runtime.password, 
    questions: runtime.questions  // giữ nguyên id gốc
  };
  res.json({ ok: true, exam: examForStudent });
});

// Lấy chi tiết đề (giáo viên) – có fallback từ Drive nếu file local mất
router.get('/:id', async (req, res) => {
  const baseId = String(req.params.id);
  let exam = readExam(baseId);

  // Nếu file local không tồn tại, thử tải từ Drive
  if (!exam) {
    try {
      const metaPath = path.join(process.cwd(), 'data', 'exams', `${baseId}.json`);
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta.driveFileId) {
          const remoteExam = await downloadFromDrive(meta.driveFileId);
          if (remoteExam && remoteExam.id === baseId) {
            exam = remoteExam;
            // Ghi lại local để lần sau không cần tải lại
            writeExam(exam);
          }
        }
      }
    } catch (err) {
      console.error('Fallback load exam from Drive error:', err?.response?.data || err.message);
    }
  }

  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  res.json({ ok: true, exam });
});

// Xác thực mật khẩu đề
router.post('/verify-password', (req, res) => {
  const { examId, password } = req.body;
  const baseId = String(examId).split('_r')[0].split('_v')[0];
  const exam = readExam(baseId);
  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  const verified = !exam.password || exam.password === password;
  res.json({ ok: verified });
});

// Xóa đề
router.delete('/:id', async (req, res) => {
  try {
    const exam = readExam(req.params.id);
    if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });

    const p = examPath(req.params.id);
    if (fs.existsSync(p)) fs.unlinkSync(p);

    const imgDir = path.join('public', 'uploads', 'question-images', req.params.id);
    if (fs.existsSync(imgDir)) fs.rmSync(imgDir, { recursive: true, force: true });

    if (exam.driveFileId) {
      try { await deleteFromDrive(exam.driveFileId); } catch (e) { console.error('Delete from Drive error:', e.message); }
    }

    res.json({ ok: true, message: 'Đã xóa đề' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Lấy danh sách đề phụ theo examId (nếu có sử dụng)
router.get('/:id/variants', (req, res) => {
  const exam = readExam(req.params.id);
  if (!exam) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  }
  res.json(exam.variants || []);
});

export default router;
