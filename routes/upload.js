const express = require('express');
const multer = require('multer');
const { uploadToDrive } = require('../utils/driveHelper');

const router = express.Router();
const upload = multer({ dest: 'tmp/' }); // Render dùng disk tạm, đủ để stream lên Drive

// Form gửi file với field name="file"
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

module.exports = router;
