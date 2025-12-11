import express from 'express';

const router = express.Router();

const PASSWORDS = {
  teacher: '@GV25',
  '12A1': '252612A1',
  '12A2': '252612A2',
  '12A3': '252612A3',
  '12A4': '252612A4'
};

router.post('/login', (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Vui lòng nhập mật khẩu' 
      });
    }

    if (password === PASSWORDS.teacher) {
      return res.json({ 
        ok: true, 
        role: 'teacher',
        message: 'Đăng nhập thành công với quyền Giáo viên'
      });
    }

    const className = Object.keys(PASSWORDS).find(
      key => key !== 'teacher' && PASSWORDS[key] === password
    );

    if (className) {
      return res.json({ 
        ok: true, 
        role: 'student',
        className: className,
        message: `Đăng nhập thành công - Lớp ${className}`
      });
    }

    return res.status(401).json({ 
      ok: false, 
      error: 'Mật khẩu không đúng' 
    });

  } catch(e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
