import express from 'express';
import { sendEmail } from '../utils/emailHelper.js';
import { getClassResults } from '../utils/resultsService.js';
import { buildClassReportWorkbook } from '../utils/reportExport.js';
import { uploadToDrive } from '../utils/driveHelper.js';

const router = express.Router();

router.post('/exam/report/:classId/export', async (req, res) => {
  try {
    const { classId } = req.params;
    const { schedule, to, attach = true, answers = false } = req.body;

    const results = await getClassResults(classId);
    const { buffer, filename } = buildClassReportWorkbook({ classId, schedule, results, includeAnswers: answers });

    const driveFile = await uploadToDrive({
      buffer,
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const recipient = to || process.env.EMAIL_TO;
    const driveLink = driveFile.webViewLink || driveFile.webContentLink;

    await sendEmail({
      to: recipient,
      subject: `Báo cáo lớp ${classId}${schedule ? ` (${schedule})` : ''}`,
      html: `<p>Báo cáo lớp ${classId} đã được tạo.</p><p>Link Drive: <a href="${driveLink}">${driveLink}</a></p>`,
      attachments: attach ? [{ filename, content: buffer }] : []
    });

    res.json({ ok: true, classId, to: recipient, file: { link: driveLink }, count: results.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
