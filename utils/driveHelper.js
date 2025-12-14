import { google } from 'googleapis';
import { Readable } from 'stream';

let drive = null;

// ================= INIT =================
export function initDrive() {
  try {
    if (!process.env.GOOGLE_CREDENTIALS) throw new Error('Missing GOOGLE_CREDENTIALS');
    if (!process.env.DRIVE_FOLDER_ID) throw new Error('Missing DRIVE_FOLDER_ID');

    // Parse the JSON string from the .env file
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

    const auth = new google.auth.GoogleAuth({
      credentials,
      // 'drive' scope gives full access (read/write/delete)
      scopes: ['https://www.googleapis.com/auth/drive'] 
    });

    drive = google.drive({ version: 'v3', auth });
    console.log('✅ Drive initialized for Service Account:', credentials.client_email);
    return true;
  } catch (err) {
    console.error('❌ Drive init failed:', err.message);
    return false;
  }
}

// ================= UPLOAD =================
export async function uploadToDrive(fileBuffer, filename, mimeType = 'application/octet-stream') {
  if (!drive) throw new Error('Drive not initialized');

  const folderId = process.env.DRIVE_FOLDER_ID;

  // OPTIMIZATION: Readable.from() is cleaner than pushing null manually
  const stream = Readable.from(fileBuffer);

  try {
    const res = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: filename,
        parents: [folderId] // puts file inside the specific folder
      },
      media: {
        mimeType,
        body: stream
      },
      fields: 'id, webViewLink, webContentLink' // webContentLink is useful for direct downloads
    });

    console.log('✅ Uploaded:', res.data.id);
    return res.data;
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    throw error;
  }
}

// ================= DOWNLOAD =================
export async function downloadFromDrive(fileId) {
  if (!drive) throw new Error('Drive not initialized');

  try {
    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );

    return Buffer.from(res.data);
  } catch (error) {
    console.error('❌ Download failed:', error.message);
    return null;
  }
}

// ================= DELETE =================
export async function deleteFromDrive(fileId) {
  if (!drive || !fileId) return false;

  try {
    await drive.files.delete({
      fileId,
      supportsAllDrives: true
    });
    console.log('🗑️ Deleted:', fileId);
    return true;
  } catch (error) {
    console.error('❌ Delete failed:', error.message);
    return false;
  }
}
