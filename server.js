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
import examMediaRouter from './routes/examMedia.js';

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), 'public')));

app.use('/auth', authRouter);
app.use('/exam', examRouter);
app.use('/student', studentRouter);
app.use('/', driveAuthRoutes);
app.use('/', driveUploadRoutes);
app.use('/', reportRoutes);
app.use('/exam-media', examMediaRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
