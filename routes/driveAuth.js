const express = require('express');
const { google } = require('googleapis');

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Bắt đầu luồng xác thực: giáo viên bấm nút "Kết nối Google Drive"
router.get('/oauth2/authorize', (req, res) => {
  const scopes = ['https://www.googleapis.com/auth/drive.file'];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });
  res.redirect(url);
});

// Callback: lấy refresh token sau khi cấp quyền
router.get('/oauth2/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      return res.send(`
        <p>Không nhận được refresh_token.</p>
        <p>Hãy vào Google Account > Security > Third-party access, thu hồi app, rồi thử lại.</p>
      `);
    }

    res.send(`
      <h3>Đã kết nối Google Drive</h3>
      <p>Copy giá trị sau và thêm vào Render (OAUTH_REFRESH_TOKEN), rồi redeploy:</p>
      <pre>${refreshToken}</pre>
    `);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Lỗi xác thực Google OAuth.');
  }
});

module.exports = router;
