import express from 'express';
import { google } from 'googleapis';

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

router.get('/oauth2/authorize', (req, res) => {
  const scopes = ['https://www.googleapis.com/auth/drive.file'];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });
  res.redirect(url);
});

router.get('/oauth2/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      return res.send('Không nhận được refresh_token. Hãy thử lại.');
    }

    res.send(`
      <h3>Đã kết nối Google Drive</h3>
      <p>Copy giá trị sau và thêm vào Render (OAUTH_REFRESH_TOKEN):</p>
      <pre>${refreshToken}</pre>
    `);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Lỗi xác thực Google OAuth.');
  }
});

export default router;
