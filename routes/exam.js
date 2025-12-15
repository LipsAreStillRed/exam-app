import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { shuffle } from '../utils/shuffle.js';
import { v4 as uuidv4 } from 'uuid';
import { uploadToDrive, deleteFromDrive } from '../utils/driveHelper.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

function parseExamContent(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const sections = [];
  let currentSection = { type: 'multiple_choice', questions: [], title: 'Phần 1' };
  let currentQuestion = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.match(/phần\s*(\d+|i+|một|hai|ba)/i)) {
      if (currentQuestion) {
        currentSection.questions.push(currentQuestion);
        currentQuestion = null;
      }
      if (currentSection.questions.length > 0) {
        sections.push(currentSection);
      }
      
      if (line.match(/đúng\s*(và)?\s*sai/i)) {
        currentSection = { type: 'true_false', questions: [], title: line };
      } else if (line.match(/trả\s*lời\s*ngắn/i) || line.match(/tự\s*luận/i)) {
        currentSection = { type: 'short_answer', questions: [], title: line };
      } else {
        currentSection = { type: 'multiple_choice', questions: [], title: line };
      }
      continue;
    }
    
    const questionMatch = line.match(/^(câu|question|bài)\s*(\d+)[:\.\-\s]/i);
    if (questionMatch) {
      if (currentQuestion) {
        currentSection.questions.push(currentQuestion);
      }
      
      const questionNum = questionMatch[2];
      currentQuestion = {
        originalId: questionNum,
        id: questionNum,
        type: currentSection.type,
        question: line.replace(/^(câu|question|bài)\s*\d+[:\.\-\s]*/i, '').trim(),
        options: [],
        subQuestions: [],
        image: null,
        correctAnswer: null
      };
      continue;
    }
    
    const subQuestionMatch = line.match(/^([a-d])[.\)]\s*(.+)/i);
    if (subQuestionMatch && currentQuestion && currentSection.type === 'true_false') {
      currentQuestion.subQuestions.push({
        key: subQuestionMatch[1].toLowerCase(),
        text: subQuestionMatch[2].trim()
      });
      continue;
    }
    
    const optionMatch = line.match(/^([A-D])[.\)]\s*(.+)/i);
    if (optionMatch && currentQuestion) {
      currentQuestion.options.push({
        key: optionMatch[1].toUpperCase(),
        text: optionMatch[2].trim()
      });
      continue;
    }
    
    if (currentQuestion && line.length > 0 && !line.match(/^[A-D][.\)]/i)) {
      currentQuestion.question += ' ' + line;
    }
  }
  
  if (currentQuestion) {
    currentSection.questions.push(currentQuestion);
  }
  if (currentSection.questions.length > 0) {
    sections.push(currentSection);
  }
  
  sections.forEach(section => {
    section.questions.forEach(q => {
      if (q.type === 'true_false' && q.subQuestions.length === 0) {
        q.options = [
          { key: 'Đúng', text: 'Đúng' },
          { key: 'Sai', text: 'Sai' }
        ];
      }
    });
  });
  
  return sections;
}

function smartShuffle(sections, shouldShuffle) {
  if (!shouldShuffle) {
    let counter = 1;
    sections.forEach(section => {
      section.questions.forEach(q => {
        q.id = counter++;
      });
    });
    return sections;
  }
  
  const shuffledSections = sections.map(section => {
    if (section.type === 'multiple_choice') {
      return {
        ...section,
        questions: shuffle([...section.questions])
      };
    }
    return section;
  });
  
  let counter = 1;
  shuffledSections.forEach(section => {
    section.questions.forEach(q => {
      q.id = counter++;
    });
  });
  
  return shuffledSections;
}

function flattenSections(sections) {
  const questions = [];
  sections.forEach(section => {
    questions.push(...section.questions);
  });
  return questions;
}

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Chưa chọn file' });
    }

    const result = await mammoth.extractRawText({ path: req.file.path });
    const text = result.value || '';

    if (text.length < 50) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: 'File quá ngắn' });
    }

    const sections = parseExamContent(text);
    if (sections.length === 0 || sections.every(s => s.questions.length === 0)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: 'Không tìm thấy câu hỏi' });
    }

    const shuffled = smartShuffle(sections, req.body.shuffle === 'true');
    const questions = flattenSections(shuffled);
    const examId = uuidv4();

    const outDir = path.join(process.cwd(), 'data', 'exams');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const outPath = path.join(outDir, `${examId}.json`);

    const examData = {
      id: examId,
      originalName: req.file.originalname,
      createdAt: Date.now(),
      timeMinutes: parseInt(req.body.timeMinutes) || 45,
      password: req.body.password || null,
      sections: shuffled,
      questions: questions,
      answers: {},
      driveFileId: null,
      metadata: {
        totalQuestions: questions.length,
        sections: sections.length,
        multipleChoice: questions.filter(q => q.type === 'multiple_choice').length,
        trueFalse: questions.filter(q => q.type === 'true_false').length,
        shortAnswer: questions.filter(q => q.type === 'short_answer').length
      }
    };

    // ✅ Ghi file JSON ra ổ đĩa trước
    fs.writeFileSync(outPath, JSON.stringify(examData, null, 2), 'utf8');

    // ✅ Upload lên Drive bằng đường dẫn file
    let driveResult = null;
    try {
      driveResult = await uploadToDrive(
        outPath,
        `${examId}.json`,
        'application/json'
      );
    } catch (err) {
      console.error('Drive upload error:', err.message);
    }

    if (driveResult) {
      examData.driveFileId = driveResult.fileId;
      examData.driveLink = driveResult.webViewLink;
      console.log(`✅ Exam saved to Drive: ${examId}`);
    }

    // Xóa file Word gốc
    fs.unlinkSync(req.file.path);

    res.json({
      ok: true,
      examId,
      count: questions.length,
      metadata: examData.metadata,
      savedToDrive: !!driveResult
    });
  } catch (e) {
    console.error('Upload error:', e);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});



// UPLOAD HÌNH ẢNH CHO CÂU HỎI
router.post('/:examId/upload-image/:questionId', upload.single('image'), async (req, res) => {
  try {
    const { examId, questionId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Chưa chọn hình' });
    }
    
    const imageDir = path.join(process.cwd(), 'public', 'images', examId);
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }
    
    const ext = path.extname(req.file.originalname);
    const imageName = `q${questionId}${ext}`;
    const imagePath = path.join(imageDir, imageName);
    
    fs.renameSync(req.file.path, imagePath);
    
    const examPath = path.join(process.cwd(), 'data', 'exams', `${examId}.json`);
    if (fs.existsSync(examPath)) {
      const examData = JSON.parse(fs.readFileSync(examPath, 'utf8'));
      
      examData.questions.forEach(q => {
        if (q.id == questionId) {
          q.image = `/images/${examId}/${imageName}`;
        }
      });
      
      examData.sections.forEach(section => {
        section.questions.forEach(q => {
          if (q.id == questionId) {
            q.image = `/images/${examId}/${imageName}`;
          }
        });
      });
      
      fs.writeFileSync(examPath, JSON.stringify(examData, null, 2), 'utf8');
    }
    
    res.json({ 
      ok: true, 
      imageUrl: `/images/${examId}/${imageName}` 
    });
  } catch (e) {
    console.error('Upload image error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// XÓA HÌNH ẢNH
router.delete('/:examId/delete-image/:questionId', async (req, res) => {
  try {
    const { examId, questionId } = req.params;
    
    const examPath = path.join(process.cwd(), 'data', 'exams', `${examId}.json`);
    if (!fs.existsSync(examPath)) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
    }
    
    const examData = JSON.parse(fs.readFileSync(examPath, 'utf8'));
    
    examData.questions.forEach(q => {
      if (q.id == questionId && q.image) {
        const imagePath = path.join(process.cwd(), 'public', q.image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
        q.image = null;
      }
    });
    
    examData.sections.forEach(section => {
      section.questions.forEach(q => {
        if (q.id == questionId && q.image) {
          q.image = null;
        }
      });
    });
    
    fs.writeFileSync(examPath, JSON.stringify(examData, null, 2), 'utf8');
    
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete image error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/list', (req, res) => {
  try {
    const dir = path.join(process.cwd(), 'data', 'exams');
    if (!fs.existsSync(dir)) {
      return res.json({ ok: true, exams: [] });
    }
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const exams = files.map(f => {
      try {
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
          metadata: data.metadata || {},
          driveFileId: data.driveFileId || null,
          savedToDrive: !!data.driveFileId
        };
      } catch (e) {
        console.error(`Error reading exam ${f}:`, e);
        return null;
      }
    }).filter(e => e !== null).sort((a, b) => b.createdAt - a.createdAt);
    
    res.json({ ok: true, exams });
  } catch(e) { 
    console.error('List error:', e);
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

router.get('/latest', (req, res) => {
  try {
    const dir = path.join(process.cwd(), 'data', 'exams');
    if (!fs.existsSync(dir)) {
      return res.json({ ok: true, questions: [] });
    }
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    if (files.length === 0) {
      return res.json({ ok: true, questions: [] });
    }
    
    const content = fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8');
    const data = JSON.parse(content);
    
    res.json({ 
      ok: true, 
      examId: data.id,
      questions: data.questions,
      sections: data.sections || [],
      timeMinutes: data.timeMinutes,
      hasPassword: !!data.password,
      metadata: data.metadata || {}
    });
  } catch(e) { 
    console.error('Latest error:', e);
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

router.get('/:examId', (req, res) => {
  try {
    const filePath = path.join(process.cwd(), 'data', 'exams', `${req.params.examId}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    res.json({ ok: true, exam: data });
  } catch(e) { 
    console.error('Get exam error:', e);
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

router.post('/verify-password', (req, res) => {
  try {
    const { examId, password } = req.body;
    const filePath = path.join(process.cwd(), 'data', 'exams', `${examId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    if (!data.password) {
      return res.json({ ok: true, verified: true });
    }
    
    return res.json({ ok: true, verified: data.password === password });
  } catch(e) { 
    console.error('Verify password error:', e);
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

router.post('/:examId/answers', (req, res) => {
  try {
    const { answers } = req.body;
    const filePath = path.join(process.cwd(), 'data', 'exams', `${req.params.examId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    data.answers = answers;
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    
    res.json({ ok: true, message: 'Đã lưu đáp án' });
  } catch(e) { 
    console.error('Save answers error:', e);
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

router.delete('/:examId', async (req, res) => {
  try {
    const filePath = path.join(process.cwd(), 'data', 'exams', `${req.params.examId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
    }
    // Đọc data để lấy Drive ID
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Xóa từ Drive nếu có
    if (data.driveFileId) {
      await deleteFromDrive(data.driveFileId);
    }

    
    const imageDir = path.join(process.cwd(), 'public', 'images', req.params.examId);
    if (fs.existsSync(imageDir)) {
      fs.rmSync(imageDir, { recursive: true, force: true });
    }
    
    fs.unlinkSync(filePath);
    res.json({ ok: true, message: 'Đã xóa đề khỏi hệ thống và Drive' });
  } catch(e) { 
    console.error('Delete error:', e);
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

export default router;
