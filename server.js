import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import examRouter from './routes/exam.js';
import studentRouter from './routes/student.js';
import { initDrive, checkDriveStatus } from './utils/driveHelper.js';

dotenv.config();
const app = express();
// Khởi tạo Google Drive khi server start
const driveEnabled = initDrive();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/health', async (req, res) => {
  const driveStatus = driveEnabled ? await checkDriveStatus() : false;
  res.json({ 
    status: 'ok',
    drive: driveStatus ? 'connected' : 'not configured',
    timestamp: new Date().toISOString()
  });
});

app.use('/auth', authRouter);
app.use('/exam', examRouter);
app.use('/student', studentRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`💾 Google Drive: ${driveEnabled ? '✅ Enabled' : '⚠️  Not configured'}`);
  if (!driveEnabled) {
    console.log('💡 Tip: Set GOOGLE_CREDENTIALS and DRIVE_FOLDER_ID to enable Drive storage');
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ ok: false, error: err.message });
});
