// utils/driveHelper.js
import fs from 'fs';
import { google } from 'googleapis';

// Scope chỉ cấp quyền file app tạo hoặc mở
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Khởi tạo OAuth2 client đúng với ENV
function getAuthClient() {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    OAUTH_REFRESH_TOKEN,
    GOOGLE_REDIRECT_URI
  } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !OAUTH_REFRESH_TOKEN || !GOOGLE_REDIRECT_URI) {
    throw new Error('Missing Drive OAuth ENV variables');
  }

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: OAUTH_REFRESH_TOKEN });
  return oauth2Client;
}

function createDrive() {
  const auth = getAuthClient();
  return google.drive({ version: 'v3', auth });
}

// Upload file lên đúng folder chỉ định
export async function uploadToDrive(filePath, filename, mimeType) {
  const drive = createDrive();
  try {
    const fileMetadata = {
      name: filename,
      parents: process.env.GOOGLE_DRIVE_FOLDER_ID ? [process.env.GOOGLE_DRIVE_FOLDER_ID] : undefined
    };
    const media = { mimeType, body: fs.createReadStream(filePath) };
    const res = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id, webViewLink, webContentLink'
    });
    return res.data;
  } catch (err) {
    // In lỗi chi tiết để dễ debug
    console.error('Drive upload error:', err?.response?.data || err.message);
    throw err;
  }
}

export async function deleteFromDrive(fileId) {
  const drive = createDrive();
  try {
    await drive.files.delete({ fileId });
    return true;
  } catch (err) {
    console.error('Drive delete error:', err?.response?.data || err.message);
    throw err;
  }
}

// Tải nội dung file (JSON) trực tiếp bằng fileId
export async function downloadFromDrive(fileId) {
  const drive = createDrive();
  try {
    const res = await drive.files.get({ fileId, alt: 'media' });
    return res.data; // JSON của đề gốc
  } catch (err) {
    console.error('Drive download error:', err?.response?.data || err.message);
    throw err;
  }
}
