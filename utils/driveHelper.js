import { google } from 'googleapis';
import fs from 'fs';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Nếu đã có refresh token thì set luôn để dùng
if (process.env.OAUTH_REFRESH_TOKEN) {
  oauth2Client.setCredentials({ refresh_token: process.env.OAUTH_REFRESH_TOKEN });
}

const drive = google.drive({ version: 'v3', auth: oauth2Client });

export async function uploadToDrive(filePath, fileName, mimeType) {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) throw new Error('Thiếu GOOGLE_DRIVE_FOLDER_ID');

    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    const media = {
      mimeType,
      body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, name, webViewLink, webContentLink',
    });

    // Xoá file tạm sau khi upload
    fs.unlink(filePath, () => {});
    return response.data;
  } catch (error) {
    console.error('Drive upload error:', error?.response?.data || error.message || error);
    throw error;
  }
}

export async function deleteFromDrive(fileId) {
  try {
    await drive.files.delete({ fileId });
    return { success: true };
  } catch (error) {
    console.error('Drive delete error:', error?.response?.data || error.message || error);
    throw error;
  }
}
