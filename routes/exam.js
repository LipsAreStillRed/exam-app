import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { shuffle } from '../utils/shuffle.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Parser thông minh cho đề thi THPT
function parseExamContent(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const questions = [];
  let currentQuestion = null;
  let currentType = 'multiple_choice'; // multiple_choice, true_false, short_answer
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Phát hiện phần mới
    if (line.match(/phần\s*(\d+|i+|một|hai|ba)/i)) {
      if (line.match(/đúng\s*sai/i)) {
        currentType = 'true_false';
      } else if (line.match(/trả\s*lời\s*ngắn/i)) {
        currentType = 'short_answer';
      } else {
        currentType = 'multiple_choice';
      }
      continue;
    }
    
    // Phát hiện câu hỏi mới (Câu 1:, Câu 2:, etc)
    const questionMatch = line.match(/^câu\s*(\d+)[:\.\-\s]/i);
    if (questionMatch) {
      if (currentQuestion) {
        questions.push(currentQuestion);
      }
      currentQuestion = {
        id: questionMatch[1],
        type: currentType,
        question: line.replace(/^câu\s*\d+[:\.\-\s]*/i, '').trim(),
        options: [],
        correctAnswer: null
      };
      continue;
    }
    
    // Phát hiện đáp án (A., B., C., D. hoặc a), b), c), d))
    const optionMatch = line.match(/^([A-D])[.\)]\s*(.+)/i);
    if (optionMatch && currentQuestion) {
      currentQuestion.options.push({
        key: optionMatch[1].toUpperCase(),
        text: optionMatch[2].trim()
      });
      continue;
    }
    
    // Nếu không phải câu hỏi mới hay đáp án, thêm vào câu hỏi hiện tại
    if (currentQuestion && line.length > 0) {
      currentQuestion.question += ' ' + line;
    }
  }
  
  if (currentQuestion) {
    questions.push(currentQuestion);
  }
  
  return questions;
}

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });
    
    const result = await mammoth.extractRawText({ path: req.file.path });
    const text = result.value || '';
    
    // Parse câu hỏi thông minh
    const questions = parseExamContent(text);
    
    if (questions.length === 0) {
      return res.status(400).json({ ok: false, error: 'Không tìm thấy câu hỏi trong file' });
    }
    
    // Trộn câu hỏi nếu được yêu cầu
    const shuffled = req.body.shuffle === 'true' ? shuffle(questions) : questions;
    
    const outDir = path.join(process.cwd(), 'data', 'exams');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    
    const examId = uuidv4();
    const outPath = path.join(outDir, `${examId}.json`);
    
    const examData = {
      id: examId,
      originalName: req.file.originalname,
      createdAt: Date.now(),
      timeMinutes: parseInt(req.body.timeMinutes) || 45,
      password: req.body.password || null,
      questions: shuffled,
      answers: {} // Will be filled by teacher
    };
    
    fs.writeFileSync(outPath, JSON.stringify(examData, null, 2), 'utf8');
    
    // Cleanup upload file
    fs.unlinkSync(req.file.path);
    
    res.json({ ok: true, examId, count: shuffled.length });
  } catch(e) { 
    console.error(e); 
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

// Lấy danh sách tất cả các đề
router.get('/list', (req, res) => {
  try {
    const dir = path.join(process.cwd(), 'data', 'exams');
    if (!fs.existsSync(dir)) return res.json({ ok: true, exams: [] });
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const exams = files.map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      const data = JSON.parse(content);
      return {
        id: data.id,
        name: data.originalName,
        createdAt: data.createdAt,
        questionCount: data.questions.length,
        timeMinutes: data.timeMinutes,
        hasPassword: !!data.password,
        hasAnswers: Object.keys(data.answers || {}).length > 0
      };
    }).sort((a, b) => b.createdAt - a.createdAt);
    
    res.json({ ok: true, exams });
  } catch(e) { 
    console.error(e); 
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

// Lấy đề mới nhất
router.get('/latest', (req, res) => {
  try {
    const dir = path.join(process.cwd(), 'data', 'exams');
    if (!fs.existsSync(dir)) return res.json({ ok: true, questions: [] });
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    if (files.length === 0) return res.json({ ok: true, questions: [] });
    
    const content = fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8');
    const data = JSON.parse(content);
    
    res.json({ 
      ok: true, 
      examId: data.id,
      questions: data.questions,
      timeMinutes: data.timeMinutes,
      hasPassword: !!data.password
    });
  } catch(e) { 
    console.error(e); 
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

// Lấy chi tiết một đề (cho giáo viên)
router.get('/:examId', (req, res) => {
  try {
    const filePath = path.join(process.cwd(), 'data', 'exams', `${req.params.examId}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Exam not found' });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    res.json({ ok: true, exam: data });
  } catch(e) { 
    console.error(e); 
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

// Kiểm tra mật khẩu đề (cho học sinh)
router.post('/verify-password', (req, res) => {
  try {
    const { examId, password } = req.body;
    const filePath = path.join(process.cwd(), 'data', 'exams', `${examId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Exam not found' });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    if (!data.password) {
      return res.json({ ok: true, verified: true });
    }
    
    if (data.password === password) {
      return res.json({ ok: true, verified: true });
    }
    
    return res.json({ ok: true, verified: false });
  } catch(e) { 
    console.error(e); 
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

// Cập nhật đáp án (cho giáo viên)
router.post('/:examId/answers', (req, res) => {
  try {
    const { answers } = req.body;
    const filePath = path.join(process.cwd(), 'data', 'exams', `${req.params.examId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Exam not found' });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    data.answers = answers;
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    
    res.json({ ok: true, message: 'Answers updated' });
  } catch(e) { 
    console.error(e); 
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

// Xóa đề
router.delete('/:examId', (req, res) => {
  try {
    const filePath = path.join(process.cwd(), 'data', 'exams', `${req.params.examId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Exam not found' });
    }
    
    fs.unlinkSync(filePath);
    res.json({ ok: true, message: 'Exam deleted' });
  } catch(e) { 
    console.error(e); 
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

export default router;
