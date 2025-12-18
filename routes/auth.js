import express from 'express';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

// Mật khẩu giáo viên từ biến môi trường
const TEACHER_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Danh sách lớp từ biến môi trường (chuỗi CSV: 12A1,12A2,...)
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

    // Học sinh: so khớp với PW_<TênLớp> trong biến môi trường
    for (const cls of CLASS_LIST) {
      const classPassword = process.env[`PW_${cls}`];
      if (classPassword && password === classPassword) {
        return res.json({ ok: true, role: 'student', className: cls });
      }
    }

    // Sai mật khẩu
    return res.status(401).json({ ok: false, error: 'Mật khẩu không đúng' });
  } catch (e) {
    console.error('Auth error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
