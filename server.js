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
import { getClassResults } from './utils/resultsService.js';
import { buildClassReportWorkbook } from './utils/reportExport.js';
import { uploadToDrive } from './utils/driveHelper.js';
import { sendEmail } from './utils/emailHelper.js';
import examMediaRouter from './routes/examMedia.js';

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/exam-media', examMediaRouter);
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
app.use('/', reportRoutes);      

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
