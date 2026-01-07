// ============================================
// routes/exam.js - FINAL PRODUCTION VERSION
// ============================================

import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import AdmZip from 'adm-zip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { uploadToDrive, deleteFromDrive, downloadFromDrive } from '../utils/driveHelper.js';
import { parseExamContent, flattenSections } from '../utils/parseExamContent.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');

// ============================================
// PART 1: FILE SYSTEM HELPERS
// ============================================

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

// ============================================
// PART 2: SHUFFLE UTILITIES
// ============================================

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
  
  return { 
    ...q, 
    options: rekeyed, 
    ...(newCorrectKey ? { correctAnswer: newCorrectKey } : {}) 
  };
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
      if (oldKey && q.correctAnswer[oldKey]) {
        newCorrect[sq.key] = q.correctAnswer[oldKey];
      }
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
  if (cfg.p1Mode === 'questions' || cfg.p1Mode === 'both') {
    p1 = shuffle(p1);
  }
  p1 = p1.map(q => {
    if (cfg.p1Mode === 'both') {
      return shuffleOptionsWithRekey(q);
    }
    if (q.type === 'multiple_choice') {
      return { 
        ...q, 
        options: resequenceOptionsABCD(q.options.map(o => ({ text: o.text }))) 
      };
    }
    return q;
  });

  let p2 = [...part2];
  if (cfg.p2Mode === 'questions' || cfg.p2Mode === 'both') {
    p2 = shuffle(p2);
  }
  p2 = p2.map(q => (cfg.p2Mode === 'both' ? shuffleTrueFalseSubQuestions(q) : q));

  let p3 = [...part3];
  if (cfg.p3Mode === 'questions') {
    p3 = shuffle(p3);
  }

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

// ============================================
// PART 3: OMML MATH PARSER
// ============================================

function extractMathFromDocx(docxPath) {
  try {
    const zip = new AdmZip(docxPath);
    const docXml = zip.readAsText('word/document.xml');
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(docXml, 'text/xml');
    const serializer = new XMLSerializer();
    
    const mathElements = doc.getElementsByTagNameNS(
      'http://schemas.openxmlformats.org/wordprocessingml/2006/math', 
      'oMath'
    );
    
    const mathMap = new Map();
    
    console.log(`📐 Found ${mathElements.length} OMML math elements`);
    
    for (let i = 0; i < mathElements.length; i++) {
      const mathNode = mathElements[i];
      const omml = serializer.serializeToString(mathNode);
      const latex = ommlToLatex(omml);
      const placeholder = `__MATH_${i}__`;
      mathMap.set(placeholder, latex);
    }
    
    return mathMap;
  } catch (err) {
    console.error('❌ OMML extraction error:', err.message);
    return new Map();
  }
}

function ommlToLatex(omml) {
  let latex = omml;
  
  // Superscript: base^{sup}
  latex = latex.replace(
    /<m:sSup>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sup>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSup>/g, 
    (match, base, sup) => {
      const cleanBase = cleanOMMLText(base);
      const cleanSup = cleanOMMLText(sup);
      return `${cleanBase}^{${cleanSup}}`;
    }
  );
  
  // Subscript: base_{sub}
  latex = latex.replace(
    /<m:sSub>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub>([\s\S]*?)<\/m:sub>[\s\S]*?<\/m:sSub>/g,
    (match, base, sub) => {
      const cleanBase = cleanOMMLText(base);
      const cleanSub = cleanOMMLText(sub);
      return `${cleanBase}_{${cleanSub}}`;
    }
  );
  
  // Fraction: \frac{num}{den}
  latex = latex.replace(
    /<m:f>[\s\S]*?<m:num>([\s\S]*?)<\/m:num>[\s\S]*?<m:den>([\s\S]*?)<\/m:den>[\s\S]*?<\/m:f>/g,
    (match, num, den) => {
      const cleanNum = cleanOMMLText(num);
      const cleanDen = cleanOMMLText(den);
      return `\\frac{${cleanNum}}{${cleanDen}}`;
    }
  );
  
  // Square root: \sqrt{content}
  latex = latex.replace(
    /<m:rad>[\s\S]*?<m:deg\s*\/?>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/g,
    (match, content) => {
      const cleanContent = cleanOMMLText(content);
      return `\\sqrt{${cleanContent}}`;
    }
  );
  
  // Nth root: \sqrt[n]{content}
  latex = latex.replace(
    /<m:rad>[\s\S]*?<m:deg>([\s\S]*?)<\/m:deg>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/g,
    (match, deg, content) => {
      const cleanDeg = cleanOMMLText(deg);
      const cleanContent = cleanOMMLText(content);
      return `\\sqrt[${cleanDeg}]{${cleanContent}}`;
    }
  );
  
  // Text nodes
  latex = latex.replace(/<m:t>(.*?)<\/m:t>/g, '$1');
  
  // Remove XML tags
  latex = latex.replace(/<[^>]+>/g, '');
  latex = latex.replace(/\s+/g, ' ').trim();
  
  return latex;
}

function cleanOMMLText(text) {
  let clean = text;
  clean = clean.replace(/<m:t>(.*?)<\/m:t>/g, '$1');
  clean = ommlToLatex(clean);
  clean = clean.replace(/<[^>]+>/g, '');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

// ============================================
// PART 4: GEMINI AI PARSER
// ============================================

async function parseWithGemini(filePath) {
  try {
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      console.warn('⚠️ Gemini API key not found');
      return null;
    }
    
    console.log('🤖 Using Gemini AI to parse document...');
    
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    
    const prompt = `
Bạn là hệ thống trích xuất đề thi. Phân tích file Word và trả về JSON.

QUAN TRỌNG - CHỈ TRẢ VỀ JSON, KHÔNG GIẢI THÍCH:
{
  "questions": [
    {
      "id": 1,
      "part": 1,
      "type": "multiple_choice",
      "question": "Nội dung câu hỏi (dùng $...$ cho công thức LaTeX)",
      "options": [
        {"key": "A", "text": "Đáp án A"},
        {"key": "B", "text": "Đáp án B"},
        {"key": "C", "text": "Đáp án C"},
        {"key": "D", "text": "Đáp án D"}
      ]
    }
  ]
}

QUY TẮC:
1. Bọc công thức trong $...$ (LaTeX)
2. Phân số: $\\frac{a}{b}$, Mũ: $x^{2}$, Độ: °
3. BẮT BUỘC đủ 4 options cho multiple_choice
4. CHỈ TRẢ VỀ JSON, không markdown, không giải thích
`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          data: base64Data
        }
      }
    ]);
    
    const response = await result.response;
    let text = response.text();
    
    // Clean markdown
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ Gemini response is not valid JSON');
      return null;
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate 4 options
    if (parsed.questions) {
      parsed.questions = parsed.questions.map(q => {
        if (q.type === 'multiple_choice') {
          const letters = ['A', 'B', 'C', 'D'];
          q.options = letters.map((letter, idx) => ({
            key: letter,
            text: q.options?.[idx]?.text || q.options?.[idx] || `Đáp án ${letter}`
          }));
        }
        return q;
      });
    }
    
    console.log(`✅ Gemini parsed ${parsed.questions?.length || 0} questions`);
    
    return parsed;
  } catch (err) {
    console.error('❌ Gemini AI error:', err.message);
    return null;
  }
}

// ============================================
// PART 5: UPLOAD ROUTE (3-TIER PARSER)
// ============================================

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Chưa chọn file' });
    }

    console.log('📄 Processing file:', req.file.originalname);
    
    const useAI = req.body.useAI === 'true';
    let sections = [];
    let mathCount = 0;
    let method = 'OMML';

    // TIER 1: Gemini AI (if enabled)
    if (useAI) {
      console.log('🤖 Using Gemini AI...');
      
      const geminiResult = await parseWithGemini(req.file.path);
      
      if (geminiResult && geminiResult.questions) {
        const part1 = geminiResult.questions.filter(
          q => q.part === 1 || q.type === 'multiple_choice'
        );
        const part2 = geminiResult.questions.filter(
          q => q.part === 2 || q.type === 'true_false'
        );
        const part3 = geminiResult.questions.filter(
          q => q.part === 3 || q.type === 'short_answer'
        );
        
        if (part1.length > 0) {
          sections.push({
            title: 'Phần 1: Trắc nghiệm nhiều lựa chọn',
            type: 'multiple_choice',
            questions: part1
          });
        }
        
        if (part2.length > 0) {
          sections.push({
            title: 'Phần 2: Đúng/Sai',
            type: 'true_false',
            questions: part2
          });
        }
        
        if (part3.length > 0) {
          sections.push({
            title: 'Phần 3: Trả lời ngắn',
            type: 'short_answer',
            questions: part3
          });
        }
        
        mathCount = geminiResult.questions.length;
        method = 'Gemini AI';
      }
    }

    // TIER 2: OMML Parser (fallback)
    if (sections.length === 0) {
      console.log('🔧 Using OMML parser...');
      
      const mathMap = extractMathFromDocx(req.file.path);
      mathCount = mathMap.size;
      
      const result = await mammoth.extractRawText({ path: req.file.path });
      let text = result.value || '';
      
      // Replace placeholders with LaTeX
      let placeholderIndex = 0;
      text = text.replace(/__MATH_\d+__/g, () => {
        const placeholder = `__MATH_${placeholderIndex}__`;
        const latex = mathMap.get(placeholder) || '';
        placeholderIndex++;
        return latex ? `$${latex}$` : '';
      });
      
      console.log(`✅ OMML: Extracted ${mathCount} formulas`);
      
      sections = parseExamContent(text);
      method = 'OMML';
    }

    // Validation
    if (!sections.length) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: 'Không tìm thấy câu hỏi' });
    }

    const examId = uuidv4();
    const timeMinutes = parseInt(req.body.timeMinutes || '45', 10);

    // Generate unique IDs
    let nextId = 1;
    const seen = new Set();
    const baseQuestions = flattenSections(sections).map(q => {
      let id = q.id != null ? String(q.id) : String(nextId++);
      while (seen.has(id)) id = String(nextId++);
      seen.add(id);
      return { ...q, id };
    });

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
      shuffleConfig: {
        p1Mode: req.body.p1Mode || 'none',
        p2Mode: req.body.p2Mode || 'none',
        p3Mode: req.body.p3Mode || 'none',
        variantCount: parseInt(req.body.variantCount || '1', 10)
      },
      parsedBy: method.toLowerCase().replace(' ', '_')
    };

    writeExam(examData);
    console.log(`✅ Exam saved: ${examPath(examId)}`);

    // Drive sync
    if (String(process.env.DRIVE_ENABLED || '').toLowerCase() === 'true') {
      try {
        const driveResult = await uploadToDrive(
          examPath(examId), 
          `exam_${examId}.json`, 
          'application/json'
        );
        
        if (driveResult) {
          examData.driveFileId = driveResult.id;
          examData.driveLink = driveResult.webViewLink || driveResult.webContentLink;
          writeExam(examData);
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
      variantCount: 1,
      method,
      mathCount
    });
  } catch (e) {
    console.error('❌ Upload error:', e);
    try { fs.unlinkSync(req.file?.path); } catch {}
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================
// PART 6: LIST & RETRIEVAL ROUTES
// ============================================

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
        return null;
      }
    }).filter(Boolean);
    
    res.json({ ok: true, exams });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/latest', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => {
    return f.endsWith('.json') && !f.includes('_v') && !f.includes('_r');
  });
  
  if (!files.length) return res.json({ ok: true, exam: null });
  
  const latest = files
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => b.createdAt - a.createdAt)[0];
    
  res.json({ ok: true, exam: latest });
});

router.get('/latest-variant', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => {
    return f.endsWith('.json') && !f.includes('_v') && !f.includes('_r');
  });
  
  if (!files.length) return res.json({ ok: true, exam: null });

  const latest = files
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
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

router.get('/:id', async (req, res) => {
  const baseId = String(req.params.id);
  let exam = readExam(baseId);

  // Drive fallback
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
      console.error('Fallback load exam from Drive error:', err.message);
    }
  }

  if (!exam) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  }
  
  res.json({ ok: true, exam });
});

// ============================================
// PART 7: PASSWORD & VARIANTS
// ============================================

router.post('/verify-password', (req, res) => {
  const { examId, password } = req.body;
  const baseId = String(examId).split('_r')[0].split('_v')[0];
  const exam = readExam(baseId);
  
  if (!exam) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  }
  
  const verified = !exam.password || exam.password === password;
  res.json({ ok: verified });
});

router.get('/:id/variants', (req, res) => {
  const exam = readExam(req.params.id);
  if (!exam) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  }
  res.json(exam.variants || []);
});

// ============================================
// PART 8: EDIT QUESTION TEXT
// ============================================

router.put('/:id/questions/:qid/text', async (req, res) => {
  try {
    const { id, qid } = req.params;
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ ok: false, error: 'Thiếu nội dung mới' });
    }
    
    const exam = readExam(id);
    if (!exam) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
    }
    
    const question = exam.questions.find(q => String(q.id) === String(qid));
    if (!question) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy câu hỏi' });
    }
    
    question.question = text;
    writeExam(exam);
    
    console.log(`✅ Updated question ${qid} in exam ${id}`);
    
    res.json({ ok: true, message: 'Đã cập nhật nội dung câu hỏi' });
  } catch (e) {
    console.error('❌ Update question error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================
// PART 9: CORRECT ANSWERS
// ============================================

router.post('/:id/correct-answers', async (req, res) => {
  try {
    const baseId = String(req.params.id);
    
    if (baseId.includes('_v') || baseId.includes('_r')) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Chỉ được lưu đáp án trên đề gốc' 
      });
    }
    
    const exam = readExam(baseId);
    if (!exam) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
    }

    const incomingAnswers = Object.fromEntries(
      Object.entries(req.body.answers || {}).map(([k, v]) => [String(k), v])
    );
    
    exam.answers = incomingAnswers;

    exam.questions = (exam.questions || []).map(q => {
      const ans = incomingAnswers[String(q.id)];
      if (ans !== undefined) {
        return { ...q, correctAnswer: ans };
      }
      return q;
    });

    writeExam(exam);

    // Drive sync
    if (String(process.env.DRIVE_ENABLED || '').toLowerCase() === 'true') {
      try {
        if (exam.driveFileId) {
          await deleteFromDrive(exam.driveFileId);
        }
        
        const driveResult = await uploadToDrive(
          examPath(baseId), 
          `exam_${baseId}.json`, 
          'application/json'
        );
        
        if (driveResult) {
          exam.driveFileId = driveResult.id;
          exam.driveLink = driveResult.webViewLink || driveResult.webContentLink;
          writeExam(exam);
        }
      } catch (err) {
        console.error('❌ Drive sync error:', err.message);
      }
    }

    res.json({ ok: true, message: 'Đã lưu đáp án thành công' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================
// PART 10: DELETE EXAM
// ============================================

router.delete('/:id', async (req, res) => {
  try {
    const exam = readExam(req.params.id);
    if (!exam) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
    }

    // Delete local file
    const p = examPath(req.params.id);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }

    // Delete images folder
    const imgDir = path.join('public', 'uploads', 'question-images', req.params.id);
    if (fs.existsSync(imgDir)) {
      fs.rmSync(imgDir, { recursive: true, force: true });
    }

    // Delete from Drive
    if (exam.driveFileId) {
      try { 
        await deleteFromDrive(exam.driveFileId); 
      } catch (e) { 
        console.error('Delete from Drive error:', e.message); 
      }
    }

    res.json({ ok: true, message: 'Đã xóa đề' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
