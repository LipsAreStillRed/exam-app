import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { uploadToDrive, deleteFromDrive, downloadFromDrive } from '../utils/driveHelper.js';
import { parseExamContent, flattenSections } from '../utils/parseExamContent.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

function ensureDir() {
  const dir = path.join(process.cwd(), 'data', 'exams');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function examPath(id) { 
  return path.join(ensureDir(), `${id}.json`); 
}

function readExam(id) { 
  try { 
    return JSON.parse(fs.readFileSync(examPath(id), 'utf8')); 
  } catch { 
    return null; 
  } 
}

function writeExam(exam) { 
  fs.writeFileSync(examPath(exam.id), JSON.stringify(exam, null, 2), 'utf8'); 
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
  const letters = ['A','B','C','D','E','F'];
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
  const letters = ['a','b','c','d','e','f'];
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
  const part1 = baseExam.questions.filter(q => q.part === 1 || q.part === undefined);
  const part2 = baseExam.questions.filter(q => q.part === 2);
  const part3 = baseExam.questions.filter(q => q.part === 3);

  let p1 = [...part1];
  if (cfg.p1Mode === 'questions' || cfg.p1Mode === 'both') p1 = shuffle(p1);
  p1 = p1.map(q => (cfg.p1Mode === 'both' ? shuffleOptionsWithRekey(q)
                                          : (q.type === 'multiple_choice'
                                             ? { ...q, options: resequenceOptionsABCD(q.options.map(o => ({ text: o.text }))) }
                                             : q)));

  let p2 = [...part2];
  if (cfg.p2Mode === 'questions' || cfg.p2Mode === 'both') p2 = shuffle(p2);
  p2 = p2.map(q => (cfg.p2Mode === 'both' ? shuffleTrueFalseSubQuestions(q) : q));

  let p3 = [...part3];
  if (cfg.p3Mode === 'questions') p3 = shuffle(p3);

  const questions = [...p1, ...p2, ...p3].map((q, idx) => ({
    ...q,
    displayIndex: idx + 1
  }));

  return {
    id: `${baseExam.id}_r${Date.now()}`,
    timeMinutes: baseExam.timeMinutes,
    password: baseExam.password,
    questions
  };
}

// ✅ UPLOAD - Dùng mammoth.convertToHtml để giữ công thức
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Chưa chọn file' });

    console.log('📄 Processing Word file:', req.file.originalname);

    // ✅ Dùng convertToHtml thay vì extractRawText để giữ format
    const result = await mammoth.convertToHtml({ 
      path: req.file.path 
    });
    
    let html = result.value || '';
    console.log('📝 Extracted HTML length:', html.length);
    
    // ✅ Convert HTML về plain text nhưng giữ format
    let text = html
      .replace(/<p>/g, '\n')
      .replace(/<\/p>/g, '\n')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<strong>/g, '**')
      .replace(/<\/strong>/g, '**')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
    
    console.log('📝 Converted text length:', text.length);
    console.log('📝 Sample:', text.substring(0, 800));
    
    const sections = parseExamContent(text);
    
    if (!sections.length) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: 'Không tìm thấy câu hỏi' });
    }

    const examId = uuidv4();
    const timeMinutes = parseInt(req.body.timeMinutes || '45', 10);

    let nextId = 1;
    const seen = new Set();
    const baseQuestions = flattenSections(sections).map(q => {
      let id = q.id != null ? String(q.id) : String(nextId++);
      while (seen.has(id)) id = String(nextId++);
      seen.add(id);
      return { ...q, id };
    });

    console.log(`✅ Parsed ${baseQuestions.length} questions`);

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
      answers: {},
      variants: [],
      shuffleConfig: cfg
    };

    writeExam(examData);
    console.log('✅ Exam saved:', examPath(examId));

    let driveResult = null;
    if (String(process.env.DRIVE_ENABLED || '').toLowerCase() === 'true') {
      try {
        driveResult = await uploadToDrive(examPath(examId), `exam_${examId}.json`, 'application/json');
        if (driveResult) {
          examData.driveFileId = driveResult.id;
          examData.driveLink = driveResult.webViewLink || driveResult.webContentLink;
          writeExam(examData);
          console.log('✅ Uploaded to Drive:', driveResult.webViewLink);
        }
      } catch (err) {
        console.error('❌ Drive upload error:', err?.response?.data || err.message);
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
    console.error('❌ Upload error:', e);
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/list', (req, res) => {
  try {
    const dir = ensureDir();
    const files = fs.readdirSync(dir).filter(f => {
      return f.endsWith('.json') && !f.includes('_v') && !f.includes('_r');
    });
    
    if (files.length === 0) {
      return res.json({ ok: true, exams: [] });
    }
    
    const exams = files.map(f => {
      try {
        const fullPath = path.join(dir, f);
        const exam = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        
        return {
          id: exam.id,
          originalName: exam.originalName || 'Đề không tên',
          createdAt: exam.createdAt || Date.now(),
          timeMinutes: exam.timeMinutes || 45,
          questionCount: exam.questions?.length || 0,
          hasAnswers: exam.answers && Object.keys(exam.answers).length > 0,
          variants: exam.variants || [],
          driveLink: exam.driveLink || null
        };
      } catch (err) {
        console.error(`❌ Error parsing ${f}:`, err.message);
        return null;
      }
    }).filter(Boolean);
    
    res.json({ ok: true, exams });
  } catch (err) {
    console.error('❌ /exam/list error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/latest', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => {
    return f.endsWith('.json') && !f.includes('_v') && !f.includes('_r');
  });
  
  if (!files.length) return res.json({ ok: true, exam: null });
  
  const latest = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
                      .sort((a, b) => b.createdAt - a.createdAt)[0];
  res.json({ ok: true, exam: latest });
});

router.get('/latest-variant', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => {
    return f.endsWith('.json') && !f.includes('_v') && !f.includes('_r');
  });
  
  if (!files.length) return res.json({ ok: true, exam: null });

  const latest = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
                      .sort((a, b) => b.createdAt - a.createdAt)[0];

  const runtime = makeRuntimeVariant(latest);
  const examForStudent = {
    id: runtime.id,
    baseId: latest.id,
    originalName: latest.originalName,
    timeMinutes: runtime.timeMinutes,
    password: runtime.password,
    questions: runtime.questions
  };
  res.json({ ok: true, exam: examForStudent });
});

router.post('/verify-password', (req, res) => {
  const { examId, password } = req.body;
  const baseId = String(examId).split('_r')[0].split('_v')[0];
  const exam = readExam(baseId);
  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  const verified = !exam.password || exam.password === password;
  res.json({ ok: verified });
});

router.post('/:id/correct-answers', async (req, res) => {
  try {
    const baseId = String(req.params.id);
    if (baseId.includes('_v') || baseId.includes('_r')) {
      return res.status(400).json({ ok: false, error: 'Chỉ được lưu đáp án trên đề gốc' });
    }
    const exam = readExam(baseId);
    if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });

    const incomingAnswers = Object.fromEntries(
      Object.entries(req.body.answers || {}).map(([k, v]) => [String(k), v])
    );
    exam.answers = incomingAnswers;

    exam.questions = (exam.questions || []).map(q => {
      const ans = incomingAnswers[String(q.id)];
      if (ans !== undefined) return { ...q, correctAnswer: ans };
      return q;
    });

    writeExam(exam);

    if (String(process.env.DRIVE_ENABLED || '').toLowerCase() === 'true') {
      try {
        if (exam.driveFileId) await deleteFromDrive(exam.driveFileId);
        const driveResult = await uploadToDrive(examPath(baseId), `exam_${baseId}.json`, 'application/json');
        if (driveResult) {
          exam.driveFileId = driveResult.id;
          exam.driveLink = driveResult.webViewLink || driveResult.webContentLink;
          writeExam(exam);
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

router.get('/:id/variants', (req, res) => {
  const exam = readExam(req.params.id);
  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  res.json(exam.variants || []);
});

router.delete('/:id', async (req, res) => {
  try {
    const exam = readExam(req.params.id);
    if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });

    const p = examPath(req.params.id);
    if (fs.existsSync(p)) fs.unlinkSync(p);

    const imgDir = path.join('public', 'uploads', 'question-images', req.params.id);
    if (fs.existsSync(imgDir)) fs.rmSync(imgDir, { recursive: true, force: true });

    if (exam.driveFileId) {
      try { await deleteFromDrive(exam.driveFileId); } 
      catch (e) { console.error('Delete from Drive error:', e.message); }
    }

    res.json({ ok: true, message: 'Đã xóa đề' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const baseId = String(req.params.id);
  let exam = readExam(baseId);

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
      console.error('Fallback load exam from Drive error:', err?.response?.data || err.message);
    }
  }

  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  res.json({ ok: true, exam });
});

export default router;
