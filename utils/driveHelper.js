import fs from 'fs';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Khởi tạo OAuth2 client
function getAuthClient() {
  const { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REFRESH_TOKEN } = process.env;
  const oauth2Client = new google.auth.OAuth2(
    OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oauth2Client.setCredentials({ refresh_token: OAUTH_REFRESH_TOKEN });
  return oauth2Client;
}

// ✅ Upload file bằng đường dẫn
export async function uploadToDrive(filePath, filename, mimeType) {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const fileMetadata = { name: filename };
  const media = {
    mimeType,
    body: fs.createReadStream(filePath)
  };

  const res = await drive.files.create({
    resource: fileMetadata,
    media,
    fields: 'id, webViewLink, webContentLink'
  });

  return res.data;
}

// ✅ Xóa file trên Drive
export async function deleteFromDrive(fileId) {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  await drive.files.delete({ fileId });
  return true;
}
