import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { shuffle } from '../utils/shuffle.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Parser thông minh nâng cao cho đề thi THPT
function parseExamContent(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const questions = [];
  let currentQuestion = null;
  let currentType = 'multiple_choice';
  let inSubQuestion = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Phát hiện phần mới (linh hoạt hơn)
    if (line.match(/phần\s*(\d+|i+|một|hai|ba)/i) || 
        line.match(/^(part|section)\s*\d+/i)) {
      if (line.match(/đúng\s*(và)?\s*sai/i) || 
          line.match(/true\s*(or)?\s*false/i)) {
        currentType = 'true_false';
      } else if (line.match(/trả\s*lời\s*ngắn/i) || 
                 line.match(/short\s*answer/i) ||
                 line.match(/tự\s*luận/i)) {
        currentType = 'short_answer';
      } else {
        currentType = 'multiple_choice';
      }
      inSubQuestion = false;
      continue;
    }
    
    // Phát hiện câu hỏi mới (nhiều format)
    // Format: "Câu 1:", "Câu 1.", "Question 1:", "1.", "Bài 1:"
    const questionMatch = line.match(/^(câu|question|bài|cau)\s*(\d+)[:\.\-\s]/i);
    if (questionMatch) {
      // Lưu câu hỏi cũ
      if (currentQuestion) {
        questions.push(currentQuestion);
      }
      
      const questionNum = questionMatch[2];
      currentQuestion = {
        id: questionNum,
        type: currentType,
        question: line.replace(/^(câu|question|bài|cau)\s*\d+[:\.\-\s]*/i, '').trim(),
        options: [],
        subQuestions: [],
        correctAnswer: null
      };
      inSubQuestion = false;
      continue;
    }
    
    // Phát hiện câu hỏi con (a), b), c), d) - cho phần đúng/sai
    const subQuestionMatch = line.match(/^([a-d])[.\)]\s*(.+)/i);
    if (subQuestionMatch && currentQuestion && currentType === 'true_false') {
      currentQuestion.subQuestions.push({
        key: subQuestionMatch[1].toLowerCase(),
        text: subQuestionMatch[2].trim()
      });
      inSubQuestion = true;
      continue;
    }
    
    // Phát hiện đáp án (A., B., C., D. hoặc A), B), C), D))
    const optionMatch = line.match(/^([A-D])[.\)]\s*(.+)/i);
    if (optionMatch && currentQuestion && !inSubQuestion) {
      currentQuestion.options.push({
        key: optionMatch[1].toUpperCase(),
        text: optionMatch[2].trim()
      });
      continue;
    }
    
    // Nếu không phải câu hỏi mới hay đáp án, thêm vào câu hỏi hiện tại
    if (currentQuestion && line.length > 0 && !inSubQuestion) {
      // Kiểm tra nếu là tiếp theo của câu hỏi
      if (!line.match(/^[A-D][.\)]/i)) {
        currentQuestion.question += ' ' + line;
      }
    }
  }
  
  // Lưu câu hỏi cuối
  if (currentQuestion) {
    questions.push(currentQuestion);
  }
  
  // Xử lý câu hỏi đúng/sai có câu con
  questions.forEach(q => {
    if (q.type === 'true_false' && q.subQuestions.length > 0) {
      // Giữ nguyên, frontend sẽ hiển thị từng câu con
      q.hasSubQuestions = true;
    }
  });
  
  return questions;
}

// Validate parsed questions
function validateQuestions(questions) {
  const errors = [];
  
  questions.forEach((q, idx) => {
    if (!q.question || q.question.length < 5) {
      errors.push(`Câu ${q.id || idx + 1}: Nội dung câu hỏi quá ngắn`);
    }
    
    if (q.type === 'multiple_choice' && q.options.length < 2) {
      errors.push(`Câu ${q.id || idx + 1}: Không đủ đáp án (cần ít nhất 2 đáp án)`);
    }
    
    if (q.type === 'true_false' && q.subQuestions.length === 0) {
      // Đây là câu đúng/sai đơn giản, không có câu con
      q.options = [
        { key: 'Đúng', text: 'Đúng' },
        { key: 'Sai', text: 'Sai' }
      ];
    }
  });
  
  return { valid: errors.length === 0, errors };
}

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });
    
    const result = await mammoth.extractRawText({ path: req.file.path });
    const text = result.value || '';
    
    if (text.length < 50) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: 'File quá ngắn hoặc không có nội dung' });
    }
    
    // Parse câu hỏi
    const questions = parseExamContent(text);
    
    if (questions.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        ok: false, 
        error: 'Không tìm thấy câu hỏi. Đảm bảo câu hỏi bắt đầu bằng "Câu X:"' 
      });
    }
    
    // Validate
    const validation = validateQuestions(questions);
    if (!validation.valid) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        ok: false, 
        error: 'Lỗi format đề thi:\n' + validation.errors.join('\n')
      });
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
      answers: {},
      metadata: {
        totalQuestions: questions.length,
        multipleChoice: questions.filter(q => q.type === 'multiple_choice').length,
        trueFalse: questions.filter(q => q.type === 'true_false').length,
        shortAnswer: questions.filter(q => q.type === 'short_answer').length
      }
    };
    
    fs.writeFileSync(outPath, JSON.stringify(examData, null, 2), 'utf8');
    
    // Cleanup
    fs.unlinkSync(req.file.path);
    
    res.json({ 
      ok: true, 
      examId, 
      count: shuffled.length,
      metadata: examData.metadata
    });
  } catch(e) { 
    console.error(e);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
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
        hasAnswers: Object.keys(data.answers || {}).length > 0,
        metadata: data.metadata || {}
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
      hasPassword: !!data.password,
      metadata: data.metadata || {}
    });
  } catch(e) { 
    console.error(e); 
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

// Lấy chi tiết một đề
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

// Kiểm tra mật khẩu đề
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

// Cập nhật đáp án
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
