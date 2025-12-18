// routes/exam.js
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
import { parseExamContent, flattenSections } from '../utils/parseExamContent.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

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

function convertOmmlToMathml(xml) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const mmlNode = omml2mathml(doc);
    return mmlNode?.toString ? mmlNode.toString() : String(mmlNode);
  } catch {
    return null;
  }
}

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Chưa chọn file' });

    // 1) Lấy text thô để parser theo form Bộ GD
    const raw = await mammoth.extractRawText({ path: req.file.path });
    const text = raw.value || '';
    const sections = parseExamContent(text);
    if (!sections.length) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, error: 'Không tìm thấy câu hỏi' });
    }

    // 2) Extract OMML -> MathML từ document.xml
    let mathmlMapByIndex = {};
    try {
      const zip = await JSZip.loadAsync(fs.readFileSync(req.file.path));
      const docXml = await zip.file('word/document.xml').async('string');
      const ommlBlocks = docXml.match(/<m:oMath[^>]*>[\s\S]*?<\/m:oMath>/g) || [];
      const mathmlList = ommlBlocks.map(convertOmmlToMathml).filter(Boolean);
      mathmlList.forEach((mml, idx) => { mathmlMapByIndex[idx] = mml; });
    } catch {}

    // 3) Trích xuất media từ docx (word/media/*) -> public/uploads/exam-images/<examId>/
    const mediaMap = {};
    try {
      const zip = await JSZip.loadAsync(fs.readFileSync(req.file.path));
      const entries = zip.filter((relPath) => relPath.startsWith('word/media/'));
      const examTempId = 'temp'; // sẽ update sau khi có examId thực
      const mediaDir = path.join('public', 'uploads', 'exam-images', examTempId);
      fs.mkdirSync(mediaDir, { recursive: true });
      for (const entry of entries) {
        const filename = path.basename(entry.name);
        const outPath = path.join(mediaDir, filename);
        const buf = await entry.async('nodebuffer');
        fs.writeFileSync(outPath, buf);
        mediaMap[filename] = `/uploads/exam-images/${examTempId}/${filename}`;
      }
    } catch {}

    // 4) Tạo examId và cập nhật ảnh vào thư mục đúng examId
    const examId = uuidv4();
    const mediaDirOld = path.join('public', 'uploads', 'exam-images', 'temp');
    const mediaDirNew = path.join('public', 'uploads', 'exam-images', examId);
    if (fs.existsSync(mediaDirOld)) {
      fs.mkdirSync(mediaDirNew, { recursive: true });
      fs.readdirSync(mediaDirOld).forEach(fn => {
        fs.renameSync(path.join(mediaDirOld, fn), path.join(mediaDirNew, fn));
      });
      fs.rmSync(mediaDirOld, { recursive: true, force: true });
      // cập nhật URL
      Object.keys(mediaMap).forEach(k => {
        mediaMap[k] = `/uploads/exam-images/${examId}/${k}`;
      });
    }

    // 5) Gắn MathML theo index câu (đơn giản: theo thứ tự xuất hiện)
    const questions = flattenSections(sections);
    questions.forEach((q, idx) => {
      if (!q.mathml && mathmlMapByIndex[idx]) {
        q.mathml = String(mathmlMapByIndex[idx]); // chuỗi MathML
      }
      // đảm bảo không có object lạ:
      if (typeof q.mathml !== 'string') delete q.mathml;
    });

    // 6) Không ghép ảnh tự động theo câu (vì khó mapping), thay vào đó hỗ trợ giáo viên đính kèm ảnh từng câu sau khi upload
    // q.image sẽ là chuỗi URL khi giáo viên upload ảnh qua API riêng.

    const timeMinutes = parseInt(req.body.timeMinutes || '45', 10);
    const examData = {
      id: examId,
      originalName: req.file.originalname,
      createdAt: Date.now(),
      timeMinutes,
      password: req.body.password || null,
      sections,
      questions,
      answers: {}
    };
    writeExam(examData);

    // 7) Upload file JSON đề lên Drive (nếu cấu hình)
    let driveResult = null;
    try {
      driveResult = await uploadToDrive(examPath(examId), `${examId}.json`, 'application/json');
    } catch {}
    if (driveResult) {
      examData.driveFileId = driveResult.id;
      examData.driveLink = driveResult.webViewLink || driveResult.webContentLink;
      writeExam(examData);
    }

    // dọn file tạm
    fs.unlinkSync(req.file.path);

    res.json({ ok: true, examId, count: questions.length, savedToDrive: !!driveResult });
  } catch (e) {
    console.error('Upload error:', e);
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Danh sách đề
router.get('/list', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const exams = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  res.json({ ok: true, exams });
});

// Đề mới nhất cho học sinh
router.get('/latest', (req, res) => {
  const dir = ensureDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (!files.length) return res.json({ ok: true, exam: null });
  const latest = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
                      .sort((a, b) => b.createdAt - a.createdAt)[0];
  res.json({ ok: true, exam: latest });
});

// Lấy chi tiết đề
router.get('/:id', (req, res) => {
  const exam = readExam(req.params.id);
  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  res.json({ ok: true, exam });
});

// Xác thực mật khẩu đề
router.post('/verify-password', (req, res) => {
  const { examId, password } = req.body;
  const exam = readExam(examId);
  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  const verified = !exam.password || exam.password === password;
  res.json({ ok: verified });
});

// Lưu đáp án đúng
router.post('/:id/correct-answers', (req, res) => {
  const exam = readExam(req.params.id);
  if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });
  exam.answers = req.body.answers || {};
  writeExam(exam);
  res.json({ ok: true, message: 'Đã lưu đáp án' });
});

// Xóa đề
router.delete('/:id', async (req, res) => {
  try {
    const exam = readExam(req.params.id);
    if (!exam) return res.status(404).json({ ok: false, error: 'Không tìm thấy đề' });

    const p = examPath(req.params.id);
    if (fs.existsSync(p)) fs.unlinkSync(p);

    // xóa thư mục ảnh câu hỏi của đề này (nếu có)
    const imgDir = path.join('public', 'uploads', 'question-images', req.params.id);
    if (fs.existsSync(imgDir)) fs.rmSync(imgDir, { recursive: true, force: true });

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
