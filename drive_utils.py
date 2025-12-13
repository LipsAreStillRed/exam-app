import os
import json
import io
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload

SCOPES = ['https://www.googleapis.com/auth/drive.file']

def get_drive_service():
    """Khởi tạo Google Drive service"""
    creds_json = os.environ.get('GOOGLE_CREDENTIALS')
    if not creds_json:
        raise ValueError("Chưa thiết lập GOOGLE_CREDENTIALS")
    
    creds_dict = json.loads(creds_json)
    credentials = service_account.Credentials.from_service_account_info(
        creds_dict, scopes=SCOPES
    )
    return build('drive', 'v3', credentials=credentials)

def upload_to_drive(file_content, filename, folder_id):
    """Upload file lên Google Drive"""
    try:
        service = get_drive_service()
        
        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }
        
        media = MediaIoBaseUpload(
            io.BytesIO(file_content),
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            resumable=True
        )
        
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, webViewLink'
        ).execute()
        
        print(f"✅ Upload thành công: {filename} (ID: {file.get('id')})")
        return file.get('id'), file.get('webViewLink')
    except Exception as e:
        print(f"❌ Lỗi upload lên Drive: {e}")
        return None, None

def download_from_drive(file_id):
    """Tải file từ Google Drive"""
    try:
        service = get_drive_service()
        request = service.files().get_media(fileId=file_id)
        
        file_bytes = io.BytesIO()
        downloader = MediaIoBaseDownload(file_bytes, request)
        
        done = False
        while not done:
            status, done = downloader.next_chunk()
        
        file_bytes.seek(0)
        print(f"✅ Tải file thành công từ Drive (ID: {file_id})")
        return file_bytes.read()
    except Exception as e:
        print(f"❌ Lỗi tải từ Drive: {e}")
        return None

def delete_from_drive(file_id):
    """Xóa file từ Google Drive"""
    try:
        service = get_drive_service()
        service.files().delete(fileId=file_id).execute()
        print(f"✅ Đã xóa file từ Drive (ID: {file_id})")
        return True
    except Exception as e:
        print(f"❌ Lỗi xóa file từ Drive: {e}")
        return False
