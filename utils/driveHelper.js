import { google } from 'googleapis';
import { Readable } from 'stream';

let drive = null;

// ================= INIT =================
export function initDrive() {
  try {
    if (!process.env.GOOGLE_CREDENTIALS) throw new Error('Missing GOOGLE_CREDENTIALS');
    if (!process.env.DRIVE_FOLDER_ID) throw new Error('Missing DRIVE_FOLDER_ID');

    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive']
    });

    drive = google.drive({ version: 'v3', auth });
    console.log('✅ Drive initialized for:', credentials.client_email);
    return true;
  } catch (err) {
    console.error('❌ Drive init failed:', err.message);
    return false;
  }
}

// ================= UPLOAD =================
export async function uploadToDrive(
  fileBuffer,
  filename,
  mimeType = 'application/octet-stream'
) {
  if (!drive) throw new Error('Drive not initialized');

  const folderId = process.env.DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('DRIVE_FOLDER_ID is missing');

  console.log('👉 Uploading to folder:', folderId);

  const stream = Readable.from(fileBuffer);

  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: filename,
      parents: [folderId]
    },
    media: {
      mimeType,
      body: stream
    },
    fields: 'id, webViewLink, webContentLink'
  });

  console.log('✅ Uploaded:', res.data.id);
  return res.data;
}

// ================= DOWNLOAD =================
export async function downloadFromDrive(fileId) {
  if (!drive) throw new Error('Drive not initialized');

  const res = await drive.files.get(
    {
      fileId,
      alt: 'media',
      supportsAllDrives: true
    },
    { responseType: 'arraybuffer' }
  );

  return Buffer.from(res.data);
}

// ================= DELETE =================
export async function deleteFromDrive(fileId) {
  if (!drive || !fileId) return false;

  await drive.files.delete({
    fileId,
    supportsAllDrives: true
  });

  console.log('🗑️ Deleted:', fileId);
  return true;
}
