const { google } = require('googleapis');
const fs = require('fs');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Dùng refresh token để tự làm mới access token
if (process.env.OAUTH_REFRESH_TOKEN) {
  oauth2Client.setCredentials({ refresh_token: process.env.OAUTH_REFRESH_TOKEN });
}

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function uploadToDrive(filePath, fileName, mimeType) {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) throw new Error('Thiếu GOOGLE_DRIVE_FOLDER_ID');

    const fileMetadata = { name: fileName, parents: [folderId] };
    const media = { mimeType, body: fs.createReadStream(filePath) };

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

async function deleteFromDrive(fileId) {
  await drive.files.delete({ fileId });
}

module.exports = { uploadToDrive, deleteFromDrive };
