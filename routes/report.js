import express from 'express';
import { sendEmail } from '../utils/emailHelper.js';
import { getClassResults } from '../utils/resultsService.js';
import { renderClassReportHTML } from '../utils/reportTemplate.js';

const router = express.Router();

router.get('/exam/report/:classId/preview', async (req, res) => {
  try {
    const { classId } = req.params;
    const schedule = req.query.schedule || '';
    const results = await getClassResults(classId);
    const html = renderClassReportHTML({ classId, schedule, results });
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`<pre>${err.message}</pre>`);
  }
});

router.post('/exam/report/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const { schedule, to } = req.body || {};
    const results = await getClassResults(classId);
    const html = renderClassReportHTML({ classId, schedule, results });

    const recipient = to || process.env.EMAIL_TO;
    await sendEmail({
      to: recipient,
      subject: `Báo cáo lớp ${classId}${schedule ? ` (${schedule})` : ''}`,
      html,
    });

    res.json({ ok: true, classId, to: recipient, count: results.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
