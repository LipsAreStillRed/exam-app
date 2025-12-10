import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { shuffle } from '../utils/shuffle.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });
    const result = await mammoth.extractRawText({ path: req.file.path });
    let text = result.value || '';
    let parts = text.split(/\n\s*\n/).map(p=>p.trim()).filter(p=>p.length>10);
    if (parts.length === 0) parts = text.split(/\n/).map(p=>p.trim()).filter(p=>p.length>10);
    const shuffled = shuffle(parts);
    const outDir = path.join(process.cwd(), 'data', 'exams');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const examId = uuidv4();
    const outPath = path.join(outDir, `${examId}_exam.txt`);
    fs.writeFileSync(outPath, shuffled.join('\n\n'), 'utf8');
    const metaDir = path.join(process.cwd(), 'data', 'meta');
    if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
    const meta = { id: examId, originalName: req.file.originalname, createdAt: Date.now(), timeMinutes: req.body.timeMinutes||null, password: req.body.password||null };
    fs.writeFileSync(path.join(metaDir, `${examId}.json`), JSON.stringify(meta,null,2),'utf8');
    res.json({ ok:true, examId, count: shuffled.length });
  } catch(e){ console.error(e); res.status(500).json({ ok:false, error: e.message }); }
});

router.get('/latest', (req, res) => {
  try {
    const dir = path.join(process.cwd(), 'data', 'exams');
    if (!fs.existsSync(dir)) return res.json({ ok:true, questions: [] });
    const files = fs.readdirSync(dir).filter(f=>f.endsWith('_exam.txt')).sort();
    if (files.length===0) return res.json({ ok:true, questions: [] });
    const content = fs.readFileSync(path.join(dir, files[files.length-1]), 'utf8');
    const parts = content.split(/\n\n+/).map(p=>p.trim()).filter(p=>p.length>0);
    res.json({ ok:true, examId: files[files.length-1].split('_')[0], questions: parts });
  } catch(e){ console.error(e); res.status(500).json({ ok:false, error: e.message }); }
});

export default router;
