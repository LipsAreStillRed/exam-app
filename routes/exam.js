import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { shuffle } from '../utils/shuffle.js';
import { v4 as uuidv4 } from 'uuid';
import { uploadToDrive, deleteFromDrive } from '../utils/driveHelper.js';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import omml2mathml from 'omml2mathml';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Hàm chuyển OMML sang MathML
function convertOmmlToMathml(ommlXml) {
  try {
    const doc = new DOMParser().parseFromString(ommlXml, 'text/xml');
    return omml2mathml(doc);
  } catch (e) {
    console.error('OMML convert error:', e);
    return null;
  }
}

// ... giữ nguyên các hàm parseExamContent, smartShuffle, flattenSections ...

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

    // ✅ Đọc XML để lấy OMML (Equation từ Word)
    const zip = await JSZip.loadAsync(fs.readFileSync(req.file.path));
    const docXml = await zip.file('word/document.xml').async('string');
    const ommlBlocks = docXml.match(/<m:oMath[^>]*>[\s\S]*?<\/m:oMath>/g) || [];
    const mathmlList = ommlBlocks.map(xml => convertOmmlToMathml(xml)).filter(Boolean);

    // ✅ Gắn công thức vào câu hỏi theo thứ tự
    questions.forEach((q, i) => {
      if (mathmlList[i]) q.mathml = mathmlList[i];
    });

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

    fs.writeFileSync(outPath, JSON.stringify(examData, null, 2), 'utf8');

    // ✅ Upload lên Drive giữ nguyên logic cũ
    let driveResult = null;
    try {
      driveResult = await uploadToDrive(outPath, `${examId}.json`, 'application/json');
    } catch (err) {
      console.error('Drive upload error:', err.message);
    }

    if (driveResult) {
      examData.driveFileId = driveResult.fileId;
      examData.driveLink = driveResult.webViewLink;
      console.log(`✅ Exam saved to Drive: ${examId}`);
    }

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

// ... giữ nguyên các route upload-image, delete-image, list, latest, get exam, verify-password, answers, delete exam, correct-answers, latex ...

export default router;
