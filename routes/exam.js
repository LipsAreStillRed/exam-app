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
import { uploadToDrive, deleteFromDrive } from '../utils/driveHelper.js';
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

function resequenceOptionsABCD(options) {
  const letters = ['A','B','C','D'];
  return options.map((opt, idx) => ({ key: letters[idx], text: opt.text }));
}

function shuffleOptionsWithRekey(q) {
  if (!Array.isArray(q.options) || q.options.length === 0) return q;
  const correctKey = q.correctAnswer;
  let correctText = null;
  if (correctKey) {
    const found = q.options.find(o => o.key === correctKey);
    if (found) correctText = found.text;
  } else if (q.correctAnswerText) {
    correctText = q.correctAnswerText;
  }
  const shuffledByText = shuffle(q.options.map(o => ({ text: o.text })));
  const rekeyed = resequenceOptionsABCD(shuffledByText);
  let newCorrectKey = null;
  if (correctText) {
    const match = rekeyed.find(o => o.text === correctText);
    if (match) newCorrectKey = match.key;
  }
  return { ...q, options: rekeyed, ...(newCorrectKey ? { correctAnswer: newCorrectKey } : {}) };
}

function shuffleTrueFalseSubQuestions(q) {
  if (!(q.type === 'true_false' && Array.isArray(q.subQuestions))) return q;
  const shuffled = shuffle(q.subQuestions.map(sq => ({ text: sq.text })));
  const letters = ['a','b','c','d'];
  const rekeyed = shuffled.map((sq, idx) => ({ key: letters[idx], text: sq.text }));
  let newCorrect = {};
  if (q.correctAnswer && typeof q.correctAnswer === 'object') {
    for (const sq of rekeyed) {
      const oldKey = (q.subQuestions || []).find(x => x.text === sq.text)?.key;
      if (oldKey && q.correctAnswer[oldKey]) newCorrect[sq.key] = q.correctAnswer[oldKey];
    }
  }
  return { ...q, subQuestions: rekeyed, correctAnswer: newCorrect };
}

function makeRuntimeVariant(baseExam) {
  const cfg = baseExam.shuffleConfig || {};
  const part1 = baseExam.questions.filter(q => q.part === 1);
  const part2 = baseExam.questions.filter(q => q.part === 2);
  const part3 = baseExam.questions.filter(q => q.part === 3);

  // Phần 1
  let p1 = [...part1];
  if (cfg.p1Mode === 'questions' || cfg.p1Mode === 'both') p1 = shuffle(p1);
  if (cfg.p1Mode === 'both') {
    p1 = p1.map(q => q.type === 'multiple_choice' ? shuffleOptionsWithRekey(q) : q);
  } else {
    p1 = p1.map(q => q.type === 'multiple_choice' ? ({
      ...q,
      options: resequenceOptionsABCD(q.options.map(o => ({ text: o.text })))
    }) : q);
  }

  // Phần 2
  let p2 = [...part2];
  if (cfg.p2Mode === 'questions' || cfg.p2Mode === 'both') p2 = shuffle(p2);
  if (cfg.p2Mode === 'both') p2 = p2.map(shuffleTrueFalseSubQuestions);

  // Phần 3
  let p3 = [...part3];
  if (cfg.p3Mode === 'questions') p3 = shuffle(p3);

  const questions = [...p1, ...p2, ...p3].map((q, idx) => ({ ...q, displayIndex: idx + 1 }));
  return {
    id: `${baseExam.id}_r${Date.now()}`,
    timeMinutes: baseExam.timeMinutes,
    password: baseExam.password,
    questions
  };
}

// Trộn đáp án phần 1, giữ đáp án đúng bằng mapping theo nội dung text
function shuffleOptionsKeepingCorrect(q) {
  if (!Array.isArray(q.options) || q.options.length === 0) return q;
  // tìm nội dung đáp án đúng theo correctAnswer key hiện tại, hoặc theo text đã lưu trong answers
  // Với đề gốc chưa có correctAnswer, ta không thể suy ra; giáo viên sẽ nhập sau. Ta chỉ trộn nếu đã có q.correctAnswerText
  const correctKey = q.correctAnswer; // có thể chưa tồn tại lúc upload
  let correctText = null;
  if (correctKey) {
    const found = q.options.find(o => o.key === correctKey);
    if (found) correctText = found.text;
  } else if (q.correctAnswerText) {
    correctText = q.correctAnswerText;
  }
  const newOptions = shuffle(q.options);
  if (correctText) {
    const match = newOptions.find(o => o.text === correctText);
    if (match) {
      q.correctAnswer = match.key; // cập nhật key đúng sau trộn
    }
  }
  q.options = newOptions;
  return q;
}

// Tạo variants theo tuỳ chọn
function makeVariants(exam, cfg) {
  const part1 = exam.questions.filter(q => q.part === 1);
  const part2 = exam.questions.filter(q => q.part === 2);
  const part3 = exam.questions.filter(q => q.part === 3);

  const n = Math.min(Math.max(parseInt(cfg.variantCount || '1', 10), 1), 4);
  const variants = [];

  for (let v = 1; v <= n; v++) {
  // Phần 1
  let p1 = [...part1];
  if (cfg.p1Mode === 'questions' || cfg.p1Mode === 'both') {
    p1 = shuffle(p1);
  }
  if (cfg.p1Mode === 'both') {
    p1.forEach(q => {
      if (q.type === 'multiple_choice') {
        shuffleOptionsKeepingCorrect(q);
      }
    });
  }

  // Phần 2
  let p2 = [...part2];
  if (cfg.p2Mode === 'questions' || cfg.p2Mode === 'both') {
    p2 = shuffle(p2);
  }
  if (cfg.p2Mode === 'both') {
    p2.forEach(q => {
      if (q.type === 'true_false' && Array.isArray(q.subQuestions)) {
        q.subQuestions = shuffle(q.subQuestions);
      }
    });
  }

  // Phần 3
  let p3 = [...part3];
  if (cfg.p3Mode === 'questions') {
    p3 = shuffle(p3);
  }

  const questions = [...p1, ...p2, ...p3].map((q, idx) => ({
    ...q,
    displayIndex: idx + 1 // hiển thị Câu 1, Câu 2...
  }));

  variants.push({
    id: `${exam.id}_v${v}`,
    name: `${exam.originalName} - Phiên bản ${v}`,
    baseExamId: exam.id,
    timeMinutes: exam.timeMinutes,
    password: exam.password,
    questions
  });
}
return variants;
}

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Chưa chọn file' });

    // Parse đề theo form Bộ GD
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
      if (mathmlMapByIndex[idx]) {
        q.mathml = String(mathmlMapByIndex[idx]);
      }
      if (typeof q.mathml !== 'string') delete q.mathml;
    });

    const examData = {
      id: examId,
      originalName: req.file.originalname,
      createdAt: Date.now(),
      timeMinutes,
      password: req.body.password || null,
      sections,
      questions: baseQuestions,
      answers: {}, // giáo viên nhập trên đề gốc
      variants: [] // sẽ thêm bên dưới
    };
    writeExam(examData);

    // Tạo variants theo tuỳ chọn
    const cfg = {
      p1Mode: req.body.p1Mode || 'none',
      p2Mode: req.body.p2Mode || 'none',
      p3Mode: req.body.p3Mode || 'none',
      variantCount: req.body.variantCount || '1'
    };
    const variants = makeVariants(examData, cfg);
    examData.variants = variants;
    writeExam(examData);
    const cfg = {
      p1Mode: req.body.p1Mode || 'none',
      p2Mode: req.body.p2Mode || 'none',
      p3Mode: req.body.p3Mode || 'none',
      variantCount: parseInt(req.body.variantCount || '1', 10)
    };
    examData.shuffleConfig = cfg;
    writeExam(examData);

    // Upload exam JSON lên Drive (nếu có)
    let driveResult = null;
    try {
      driveResult = await uploadToDrive(examPath(examId), `${examId}.json`, 'application/json');
    } catch {}
    if (driveResult) {
      examData.driveFileId = driveResult.id;
      examData.driveLink = driveResult.webViewLink || driveResult.webContentLink;
      writeExam(examData);
    }

    // dọn file tạm
    fs.unlinkSync(req.file.path);

    res.json({ ok: true, examId, count: baseQuestions.length, variantCount: cfg.variantCount, savedToDrive: !!driveResult });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Danh sách đề
router.get('/list', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const exams = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  res.json({ ok: true, exams });
});

// Đề gốc mới nhất (giáo viên xem/nhập đáp án)
router.get('/latest', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (!files.length) return res.json({ ok: true, exam: null });
  const latest = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
                      .sort((a, b) => b.createdAt - a.createdAt)[0];
  res.json({ ok: true, exam: latest });
});

// Học sinh: nhận một phiên bản đề ngẫu nhiên từ đề mới nhất
router.get('/latest-variant', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (!files.length) return res.json({ ok: true, exam: null });
  const latest = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const runtime = makeRuntimeVariant(latest);
  const examForStudent = {
    id: runtime.id,
    originalName: latest.originalName, 
    timeMinutes: runtime.timeMinutes, 
    password: runtime.password, 
    questions: runtime.questions  
  };
  res.json({ ok: true, exam: examForStudent });
});

// Lấy chi tiết đề (giáo viên)
router.get('/:id', (req, res) => {
  const exam = readExam(req.params.id);
  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  res.json({ ok: true, exam });
});

// Xác thực mật khẩu đề
router.post('/verify-password', (req, res) => {
  const { examId, password } = req.body;
  // examId có thể là id variant; kiểm tra base id
  const baseId = (String(examId).includes('_v')) ? String(examId).split('_v')[0] : examId;
  const exam = readExam(baseId);
  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  const verified = !exam.password || exam.password === password;
  res.json({ ok: verified });
});

// Lưu đáp án đúng trên đề gốc
router.post('/:id/correct-answers', (req, res) => {
  const baseId = String(req.params.id);
  if (baseId.includes('_v') || baseId.includes('_r')) {
    return res.status(400).json({ ok: false, error: 'Chỉ được lưu đáp án trên đề gốc' });
  }
  const exam = readExam(baseId);
  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  exam.answers = req.body.answers || {};
  writeExam(exam);
  res.json({ ok: true, message: 'Đã lưu đáp án' });
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
// Lấy danh sách đề phụ theo examId
router.get('/:id/variants', (req, res) => {
  const exam = readExam(req.params.id);
  if (!exam) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  }
  res.json(exam.variants || []);
});

export default router;
