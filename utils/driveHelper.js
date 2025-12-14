import { google } from 'googleapis';
import { Readable } from 'stream';

let drive = null;

// Khởi tạo Google Drive API
export function initDrive() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    
    drive = google.drive({ version: 'v3', auth });
    console.log('✅ Google Drive initialized');
    return true;
  } catch (error) {
    console.error('❌ Drive init error:', error.message);
    return false;
  }
}

// Upload file lên Drive - ĐÃ SỬA LỖI STORAGE QUOTA
export async function uploadToDrive(fileBuffer, filename, mimeType = 'application/json') {
  if (!drive) {
    console.log('⚠️  Drive not initialized, falling back to local storage');
    return null;
  }
  
  try {
    // Chuyển buffer thành stream
    const bufferStream = new Readable();
    bufferStream.push(fileBuffer);
    bufferStream.push(null);
    
    // KHÔNG chỉ định parents để tránh lỗi storage quota
    // File sẽ được lưu vào "My Drive" root của tài khoản được share
    const fileMetadata = {
      name: `[ExamApp] ${filename}` // Thêm prefix để dễ tìm và quản lý
    };
    
    const media = {
      mimeType,
      body: bufferStream
    };
    
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
      supportsAllDrives: true // Hỗ trợ cả Shared Drives nếu có
    });
    
    console.log(`✅ Uploaded to Drive: ${filename} (ID: ${response.data.id})`);
    return {
      fileId: response.data.id,
      webViewLink: response.data.webViewLink
    };
  } catch (error) {
    console.error('❌ Upload to Drive failed:', error.message);
    console.error('Error details:', error);
    return null;
  }
}

// Tải file từ Drive
export async function downloadFromDrive(fileId) {
  if (!drive) {
    console.log('⚠️  Drive not initialized');
    return null;
  }
  
  try {
    const response = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );
    
    console.log(`✅ Downloaded from Drive: ${fileId}`);
    return Buffer.from(response.data);
  } catch (error) {
    console.error('❌ Download from Drive failed:', error.message);
    return null;
  }
}

// Xóa file từ Drive
export async function deleteFromDrive(fileId) {
  if (!drive || !fileId) return false;
  
  try {
    await drive.files.delete({ 
      fileId,
      supportsAllDrives: true 
    });
    console.log(`✅ Deleted from Drive: ${fileId}`);
    return true;
  } catch (error) {
    console.error('❌ Delete from Drive failed:', error.message);
    return false;
  }
}

// Kiểm tra Drive có hoạt động không
export async function checkDriveStatus() {
  if (!drive) return false;
  
  try {
    await drive.files.list({ 
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    return true;
  } catch (error) {
    return false;
  }
}
