// routes/exam.js - FIXED VERSION
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

  let p2 = [...part2];
  if (cfg.p2Mode === 'questions' || cfg.p2Mode === 'both') p2 = shuffle(p2);
  if (cfg.p2Mode === 'both') p2 = p2.map(shuffleTrueFalseSubQuestions);

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

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Chưa chọn file' });

    const raw = await mammoth.extractRawText({ path: req.file.path });
    const text = raw.value || '';
    const sections = parseExamContent(text);
    if (!sections.length) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: 'Không tìm thấy câu hỏi' });
    }

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
      answers: {}, // Khởi tạo object rỗng để lưu đáp án
      variants: [],
      shuffleConfig: cfg
    };
    
    writeExam(examData);

    // FIX: Upload lên Drive ngay sau khi tạo
    let driveResult = null;
    if (String(process.env.DRIVE_ENABLED || '').toLowerCase() === 'true') {
      try {
        driveResult = await uploadToDrive(
          examPath(examId), 
          `exam_${examId}.json`, 
          'application/json'
        );
        
        if (driveResult) {
          examData.driveFileId = driveResult.id;
          examData.driveLink = driveResult.webViewLink || driveResult.webContentLink;
          writeExam(examData); // Lưu lại với driveFileId
          console.log('✅ Uploaded exam to Drive:', driveResult.webViewLink);
        }
      } catch (err) {
        console.error('❌ Drive upload error:', err.message);
      }
    }

    fs.unlinkSync(req.file.path);
    res.json({ 
      ok: true, 
      examId, 
      count: baseQuestions.length, 
      variantCount: cfg.variantCount, 
      savedToDrive: !!driveResult 
    });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ ok: false, error: e.message });
  }
});

// FIX: Lưu đáp án đúng cách + đồng bộ Drive
router.post('/:id/correct-answers', async (req, res) => {
  try {
    const baseId = String(req.params.id);
    
    // Không cho lưu đáp án vào variant
    if (baseId.includes('_v') || baseId.includes('_r')) {
      return res.status(400).json({ ok: false, error: 'Chỉ được lưu đáp án trên đề gốc' });
    }
    
    const exam = readExam(baseId);
    if (!exam) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
    }

    // Lưu đáp án vào exam.answers
    const incomingAnswers = req.body.answers || {};
    
    console.log('📥 Nhận đáp án:', incomingAnswers);
    
    // Cập nhật answers vào exam object
    exam.answers = incomingAnswers;
    
    // Đồng thời cập nhật correctAnswer vào từng câu hỏi
    if (exam.questions && Array.isArray(exam.questions)) {
      exam.questions = exam.questions.map(q => {
        if (incomingAnswers[q.id] !== undefined) {
          return { ...q, correctAnswer: incomingAnswers[q.id] };
        }
        return q;
      });
    }
    
    // Lưu vào file local
    writeExam(exam);
    console.log('✅ Đã lưu đáp án vào file local');

    // FIX: Đồng bộ lên Drive ngay lập tức
    if (exam.driveFileId && String(process.env.DRIVE_ENABLED || '').toLowerCase() === 'true') {
      try {
        // Xóa file cũ trên Drive
        await deleteFromDrive(exam.driveFileId);
        console.log('🗑️  Đã xóa file cũ trên Drive');
        
        // Upload file mới
        const driveResult = await uploadToDrive(
          examPath(baseId), 
          `exam_${baseId}.json`, 
          'application/json'
        );
        
        if (driveResult) {
          exam.driveFileId = driveResult.id;
          exam.driveLink = driveResult.webViewLink || driveResult.webContentLink;
          writeExam(exam); // Lưu lại driveFileId mới
          console.log('✅ Đã đồng bộ đáp án lên Drive:', driveResult.webViewLink);
        }
      } catch (err) {
        console.error('❌ Drive sync error:', err.message);
        // Không return lỗi vì đã lưu local thành công
      }
    }

    res.json({ ok: true, message: 'Đã lưu đáp án thành công' });
  } catch (e) {
    console.error('❌ Error saving answers:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Danh sách đề
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

// Đề gốc mới nhất
router.get('/latest', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('_v') && !f.includes('_r'));
  if (!files.length) return res.json({ ok: true, exam: null });
  const latest = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
                      .sort((a, b) => b.createdAt - a.createdAt)[0];
  res.json({ ok: true, exam: latest });
});

// Học sinh: nhận variant ngẫu nhiên
router.get('/latest-variant', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('_v') && !f.includes('_r'));
  if (!files.length) return res.json({ ok: true, exam: null });
  const latest = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const runtime = makeRuntimeVariant(latest);
  
  // Truyền baseId để backend biết đề gốc khi chấm điểm
  const examForStudent = {
    id: runtime.id,
    baseId: latest.id, // QUAN TRỌNG: để backend biết đề gốc
    originalName: latest.originalName, 
    timeMinutes: runtime.timeMinutes, 
    password: runtime.password, 
    questions: runtime.questions  
  };
  res.json({ ok: true, exam: examForStudent });
});

// Lấy chi tiết đề
router.get('/:id', async (req, res) => {
  const baseId = String(req.params.id);
  let exam = readExam(baseId);

  // Fallback từ Drive nếu không có local
  if (!exam) {
    try {
      const metaPath = path.join(process.cwd(), 'data', 'exams', `${baseId}.json`);
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta.driveFileId) {
          const remoteExam = await downloadFromDrive(meta.driveFileId);
          if (remoteExam && remoteExam.id === baseId) {
            exam = remoteExam;
            writeExam(exam);
          }
        }
      }
    } catch (err) {
      console.error('Fallback load from Drive error:', err.message);
    }
  }

  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  res.json({ ok: true, exam });
});

// Xác thực mật khẩu
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

// FIX: API để test đáp án đã lưu chưa
router.get('/:id/check-answers', (req, res) => {
  const exam = readExam(req.params.id);
  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  
  const hasAnswers = exam.answers && Object.keys(exam.answers).length > 0;
  res.json({ 
    ok: true, 
    hasAnswers,
    answerCount: Object.keys(exam.answers || {}).length,
    answers: exam.answers 
  });
});

export default router;
