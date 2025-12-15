import express from 'express';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const TEACHER_PASSWORD = process.env.ADMIN_PASSWORD || '';
const CLASS_LIST = (process.env.CLASS_LIST || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

router.post('/login', (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ ok: false, error: 'Vui lòng nhập mật khẩu' });
    }

    // Giáo viên
    if (TEACHER_PASSWORD && password === TEACHER_PASSWORD) {
      return res.json({ ok: true, role: 'teacher' });
    }

    // Học sinh
    const className = CLASS_LIST.find(cls => password === process.env[`PW_${cls}`]);
    if (className) {
      return res.json({ ok: true, role: 'student', className });
    }

    return res.status(401).json({ ok: false, error: 'Mật khẩu không đúng' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
