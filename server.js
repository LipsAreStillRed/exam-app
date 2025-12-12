import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import examRouter from './routes/exam.js';
import studentRouter from './routes/student.js';

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRouter);
app.use('/exam', examRouter);
app.use('/student', studentRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ ok: false, error: err.message });
});
