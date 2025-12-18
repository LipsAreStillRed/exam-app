import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

function examPath(id) { return path.join(process.cwd(), 'data', 'exams', `${id}.json`); }

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

export default router;
