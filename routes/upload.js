import express from 'express';
import multer from 'multer';
import { uploadToDrive, deleteFromDrive } from '../utils/driveHelper.js';
import JSZip from 'jszip'; import { DOMParser } from 'xmldom'; import omml2mathml from 'omml2mathml'; // cần cài lib hỗ trợ

const router = express.Router();
const upload = multer({ dest: 'tmp/' });

// Hàm chuyển OMML sang MathML 
function convertOmmlToMathml(ommlXml) { 
  const doc = new DOMParser().parseFromString(ommlXml, 'text/xml'); 
  return omml2mathml(doc); // trả về MathML string }

// ✅ Upload file lên Google Drive
router.post('/drive/upload', upload.single('file'), async (req, res) => {
  try {
    if (!process.env.OAUTH_REFRESH_TOKEN) {
      return res.status(400).send('Chưa kết nối Google Drive. Vui lòng vào /oauth2/authorize để cấp quyền.');
    }

    const { path, originalname, mimetype } = req.file;
    const result = await uploadToDrive(path, originalname, mimetype);

    res.json({
      message: 'Upload thành công',
      id: result.id,
      name: result.name,
      webViewLink: result.webViewLink,
      webContentLink: result.webContentLink,
    });
  } catch (err) {
    console.error('Upload route error:', err);
    res.status(500).send('Upload thất bại.');
  }
});

// ✅ Xoá file trên Google Drive theo ID
router.delete('/drive/file/:id', async (req, res) => {
  try {
    if (!process.env.OAUTH_REFRESH_TOKEN) {
      return res.status(400).send('Chưa kết nối Google Drive. Vui lòng vào /oauth2/authorize để cấp quyền.');
    }

    const fileId = req.params.id;
    await deleteFromDrive(fileId);

    res.json({ message: 'Đã xoá file trên Google Drive', id: fileId });
  } catch (err) {
    console.error('Delete route error:', err);
    res.status(500).send('Xoá file thất bại.');
  }
});

export default router;
