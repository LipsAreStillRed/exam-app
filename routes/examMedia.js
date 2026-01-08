import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

function examPath(id) { return path.join(process.cwd(), 'data', 'exams', `${id}.json`); }

// Upload ảnh cho câu hỏi
router.post('/:examId/questions/:qid/image', upload.single('image'), async (req, res) => {
  try {
    const { examId, qid } = req.params;
    const examFile = examPath(examId);
    if (!fs.existsSync(examFile)) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
    const examData = JSON.parse(fs.readFileSync(examFile, 'utf8'));

    const outDir = path.join('public', 'uploads', 'question-images', examId);
    fs.mkdirSync(outDir, { recursive: true });
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const outPath = path.join(outDir, safeName);
    fs.renameSync(req.file.path, outPath);
    const url = `/uploads/question-images/${examId}/${safeName}`;

    const q = (examData.questions || []).find(x => String(x.id) === String(qid));
    if (!q) return res.status(404).json({ ok: false, error: 'Không tìm thấy câu hỏi' });

    q.image = url;
    fs.writeFileSync(examFile, JSON.stringify(examData, null, 2), 'utf8');

    res.json({ ok: true, url });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ✅ NEW: Xóa ảnh của câu hỏi
router.delete('/:examId/questions/:qid/image', async (req, res) => {
  try {
    const { examId, qid } = req.params;
    const examFile = examPath(examId);
    
    if (!fs.existsSync(examFile)) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
    }
    
    const examData = JSON.parse(fs.readFileSync(examFile, 'utf8'));
    const q = (examData.questions || []).find(x => String(x.id) === String(qid));
    
    if (!q) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy câu hỏi' });
    }
    
    // Xóa file ảnh vật lý nếu có
    if (q.image) {
      const imagePath = path.join('public', q.image);
      if (fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
          console.log('✅ Đã xóa file ảnh:', imagePath);
        } catch (err) {
          console.error('⚠️ Không xóa được file ảnh:', err.message);
        }
      }
    }
    
    // Xóa reference trong JSON
    delete q.image;
    fs.writeFileSync(examFile, JSON.stringify(examData, null, 2), 'utf8');
    
    console.log(`✅ Đã xóa ảnh của câu ${qid} trong đề ${examId}`);
    res.json({ ok: true, message: 'Đã xóa ảnh thành công' });
  } catch (e) {
    console.error('❌ Delete image error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});
// ✅ API MỚI 3: Upload ảnh cho đáp án (option)
router.post('/:examId/questions/:qid/options/:optionKey/image', upload.single('image'), async (req, res) => {
  try {
    const { examId, qid, optionKey } = req.params;
    const examFile = examPath(examId);
    
    if (!fs.existsSync(examFile)) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
    }
    
    const examData = JSON.parse(fs.readFileSync(examFile, 'utf8'));
    
    const q = (examData.questions || []).find(x => String(x.id) === String(qid));
    if (!q) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy câu hỏi' });
    }
    
    if (q.type !== 'multiple_choice' || !Array.isArray(q.options)) {
      return res.status(400).json({ ok: false, error: 'Không phải câu trắc nghiệm' });
    }
    
    const option = q.options.find(opt => opt.key === optionKey);
    if (!option) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đáp án' });
    }
    
    // Tạo thư mục lưu ảnh
    const outDir = path.join('public', 'uploads', 'option-images', examId, qid);
    fs.mkdirSync(outDir, { recursive: true });
    
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const outPath = path.join(outDir, `${optionKey}_${safeName}`);
    fs.renameSync(req.file.path, outPath);
    
    const url = `/uploads/option-images/${examId}/${qid}/${optionKey}_${safeName}`;
    
    // Lưu URL vào option
    option.image = url;
    fs.writeFileSync(examFile, JSON.stringify(examData, null, 2), 'utf8');
    
    console.log(`✅ Uploaded image for option ${optionKey} in question ${qid}`);
    res.json({ ok: true, url });
  } catch (e) {
    console.error('❌ Upload option image error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ✅ API MỚI 4: Xóa ảnh của đáp án (option)
router.delete('/:examId/questions/:qid/options/:optionKey/image', async (req, res) => {
  try {
    const { examId, qid, optionKey } = req.params;
    const examFile = examPath(examId);
    
    if (!fs.existsSync(examFile)) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
    }
    
    const examData = JSON.parse(fs.readFileSync(examFile, 'utf8'));
    
    const q = (examData.questions || []).find(x => String(x.id) === String(qid));
    if (!q) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy câu hỏi' });
    }
    
    const option = q.options?.find(opt => opt.key === optionKey);
    if (!option) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy đáp án' });
    }
    
    // Xóa file ảnh vật lý nếu có
    if (option.image) {
      const imagePath = path.join('public', option.image);
      if (fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
          console.log('✅ Đã xóa file ảnh:', imagePath);
        } catch (err) {
          console.error('⚠️ Không xóa được file ảnh:', err.message);
        }
      }
    }
    
    // Xóa reference trong JSON
    delete option.image;
    fs.writeFileSync(examFile, JSON.stringify(examData, null, 2), 'utf8');
    
    console.log(`✅ Đã xóa ảnh của đáp án ${optionKey} trong câu ${qid}`);
    res.json({ ok: true, message: 'Đã xóa ảnh đáp án thành công' });
  } catch (e) {
    console.error('❌ Delete option image error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
