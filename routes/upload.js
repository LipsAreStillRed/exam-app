import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { uploadToDrive, deleteFromDrive } from '../utils/driveHelper.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// 📌 Upload file lên Google Drive
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Chưa chọn file' });
    }

    const result = await uploadToDrive(
      req.file.path,
      req.file.originalname,
      req.file.mimetype
    );

    // Xóa file tạm sau khi upload
    fs.unlinkSync(req.file.path);

    res.json({
      ok: true,
      fileId: result.fileId,
      webViewLink: result.webViewLink
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📌 Xóa file trên Google Drive
router.delete('/upload/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    await deleteFromDrive(fileId);
    res.json({ ok: true, message: 'Đã xóa file trên Drive' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
