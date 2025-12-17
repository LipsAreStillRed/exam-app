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
import { parseExamContent, smartShuffle, flattenSections } from '../utils/parseExamContent.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

function convertOmmlToMathml(xml) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return omml2mathml(doc);
  } catch {
    return null;
  }
}

function ensureDir() {
  const dir = path.join(process.cwd(), 'data', 'exams');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function examPath(id) { return path.join(ensureDir(), `${id}.json`); }
function readExam(id) {
  const p = examPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeExam(exam) {
  fs.writeFileSync(examPath(exam.id), JSON.stringify(exam, null, 2), 'utf8');
}

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Chưa chọn file' });
    const result = await mammoth.extractRawText({ path: req.file.path });
    const text = result.value || '';
    const sections = parseExamContent(text);
    if (!sections.length) return res.status(400).json({ ok: false, error: 'Không tìm thấy câu hỏi' });

    const shuffled = smartShuffle(sections, req.body.shuffle === 'true');
    const questions = flattenSections(shuffled);

    // OMML -> MathML
    let mathmlList = [];
    try {
      const zip = await JSZip.loadAsync(fs.readFileSync(req.file.path));
      const docXml = await zip.file('word/document.xml').async('string');
      const ommlBlocks = docXml.match(/<m:oMath[^>]*>[\s\S]*?<\/m:oMath>/g) || [];
      mathmlList = ommlBlocks.map(convertOmmlToMathml).filter(Boolean);
    } catch {}

    questions.forEach((q, i) => { if (mathmlList[i]) q.mathml = mathmlList[i]; });

    const examId = uuidv4();
    const examData = {
      id: examId,
      originalName: req.file.originalname,
      createdAt: Date.now(),
      timeMinutes: parseInt(req.body.timeMinutes) || 45,
      password: req.body.password || null,
      sections: shuffled,
      questions,
      answers: {},
    };
    writeExam(examData);

    // Upload Drive
    let driveResult = null;
    try {
      driveResult = await uploadToDrive(examPath(examId), `${examId}.json`, 'application/json');
    } catch {}
    if (driveResult) {
      examData.driveFileId = driveResult.fileId;
      examData.driveLink = driveResult.webViewLink;
      writeExam(examData);
    }

    fs.unlinkSync(req.file.path);
    res.json({ ok: true, examId, count: questions.length, savedToDrive: !!driveResult });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/list', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const exams = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  res.json({ ok: true, exams });
});

router.get('/latest', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (!files.length) return res.json({ ok: true, exam: null });
  const latest = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
                      .sort((a, b) => b.createdAt - a.createdAt)[0];
  res.json({ ok: true, exam: latest });
});

router.get('/:id', (req, res) => {
  const exam = readExam(req.params.id);
  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  res.json({ ok: true, exam });
});

router.post('/:id/correct-answers', (req, res) => {
  const exam = readExam(req.params.id);
  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  exam.answers = req.body.answers || {};
  writeExam(exam);
  res.json({ ok: true, message: 'Đã lưu đáp án' });
});

router.delete('/:id', (req, res) => {
  const exam = readExam(req.params.id);
  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  fs.unlinkSync(examPath(req.params.id));
  if (exam.driveFileId) deleteFromDrive(exam.driveFileId
