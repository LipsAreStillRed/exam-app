import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import examRouter from './routes/exam.js';
import studentRouter from './routes/student.js';
import driveAuthRoutes from './routes/driveAuth.js';
import driveUploadRoutes from './routes/upload.js';
import reportRoutes from './routes/report.js';
import cron from 'node-cron';
import { getClassResults } from './utils/resultsService.js';
import { buildClassReportWorkbook } from './utils/reportExport.js';
import { uploadToDrive } from './utils/driveHelper.js';
import { sendEmail } from './utils/emailHelper.js';

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), 'public')));

// Health check đơn giản
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    drive: process.env.OAUTH_REFRESH_TOKEN ? 'connected' : 'not configured',
    timestamp: new Date().toISOString()
  });
});

// Các routes chính
app.use('/auth', authRouter);
app.use('/exam', examRouter);
app.use('/student', studentRouter);

// ✅ Thêm routes mới cho Google Drive OAuth và Upload
app.use('/', driveAuthRoutes);
app.use('/', driveUploadRoutes);
app.use(express.json()); // để đọc body JSON từ POST
app.use('/', reportRoutes);
// Cron job: kiểm tra mỗi 2 phút
const sentRecords = new Set();

cron.schedule('*/2 * * * *', async () => {
  try {
    // Cấu hình 4 lớp
    const classes = [
      { classId: '12A1', endAt: '2025-12-15T09:00:00+07:00', delayMinutes: 10, email: 'teacher12A1@example.com' },
      { classId: '12A2', endAt: '2025-12-15T10:30:00+07:00', delayMinutes: 10, email: 'teacher12A2@example.com' },
      { classId: '12A3', endAt: '2025-12-15T14:00:00+07:00', delayMinutes: 10, email: 'teacher12A3@example.com' },
      { classId: '12A4', endAt: '2025-12-15T16:00:00+07:00', delayMinutes: 10, email: 'teacher12A4@example.com' }
    ];

    for (const cls of classes) {
      const key = `${cls.classId}_${cls.endAt}`;
      if (sentRecords.has(key)) continue;

      const now = new Date();
      const end = new Date(cls.endAt);
      if (now.getTime() >= end.getTime() + cls.delayMinutes * 60000) {
        const results = await getClassResults(cls.classId);
        const { buffer, filename } = buildClassReportWorkbook({
          classId: cls.classId,
          schedule: `Kết thúc: ${end.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
          results,
          includeAnswers: false
        });

        const driveFile = await uploadToDrive({
          buffer,
          filename,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        const driveLink = driveFile.webViewLink || driveFile.webContentLink || '';
        await sendEmail({
          to: cls.email || process.env.EMAIL_TO,
          subject: `Báo cáo lớp ${cls.classId}`,
          html: `<p>Báo cáo lớp ${cls.classId} đã được tạo.</p><p>Link Drive: <a href="${driveLink}">${driveLink}</a></p>`,
          attachments: [{ filename, content: buffer }]
        });

        sentRecords.add(key);
        console.log(`[Cron] Đã gửi báo cáo lớp ${cls.classId}`);
      }
    }
  } catch (err) {
    console.error('[Cron] Error:', err.message);
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`💾 Google Drive: ${process.env.OAUTH_REFRESH_TOKEN ? '✅ Enabled' : '⚠️ Not configured'}`);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ ok: false, error: err.message });
});
