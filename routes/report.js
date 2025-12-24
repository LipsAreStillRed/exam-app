import express from 'express';
import fs from 'fs';
import path from 'path';
import { sendEmail } from '../utils/emailHelper.js';
import { getClassResults } from '../utils/resultsService.js';
import { buildClassReportWorkbook } from '../utils/reportExport.js';
import { uploadToDrive } from '../utils/driveHelper.js';

const router = express.Router();

router.post('/exam/report/:classId/export', async (req, res) => {
  try {
    const { classId } = req.params;
    const { schedule, to, attach = true, answers = false } = req.body;

    // Lấy kết quả của lớp
    const results = await getClassResults(classId);

    // Tạo workbook Excel từ kết quả
    const { buffer, filename } = buildClassReportWorkbook({
      classId,
      schedule,
      results,
      includeAnswers: answers
    });

    // ✅ Ghi file Excel ra thư mục tạm
    const tmpDir = path.join(process.cwd(), 'tmp_reports');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const tmpPath = path.join(tmpDir, filename);
    fs.writeFileSync(tmpPath, buffer);

    // ✅ Upload lên Google Drive bằng đường dẫn file
    const driveFile = await uploadToDrive(
      tmpPath,
      filename,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const recipient = to || process.env.EMAIL_TO;
    const driveLink = driveFile.webViewLink || driveFile.webContentLink;

    // Gửi email kèm báo cáo
    await sendEmail({
      to: recipient,
      subject: `Báo cáo lớp ${classId}${schedule ? ` (${schedule})` : ''}`,
      html: `<p>Báo cáo lớp ${classId} đã được tạo.</p><p>Link Drive: <a href="${driveLink}">${driveLink}</a></p>`,
      attachments: attach ? [{ filename, content: buffer }] : []
    });


    // Xóa file tạm sau khi upload
    fs.unlinkSync(tmpPath);

    res.json({
      ok: true,
      classId,
      to: recipient,
      file: { link: driveLink },
      count: results.length
    });
  } catch (err) {
    console.error('Report export error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
