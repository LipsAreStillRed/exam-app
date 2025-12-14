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
export async function uploadToDrive(fileBuffer, filename, mimeType = 'application/octet-stream') {
  if (!drive) th
