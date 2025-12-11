const API_BASE = '';

function api(path) {
  return (API_BASE || '') + path;
}

const state = {
  userRole: null,
  className: null,
  studentInfo: null,
  examData: null,
  timerInterval: null,
  timeLeft: 0,
  tabViolations: 0,
  currentExamId: null,
  studentAnswers: {}
};

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 5000);
}

function showMessage(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = 'message ' + (isError ? 'error' : 'success');
  setTimeout(() => el.className = 'message', 5000);
}

// LOGIN
document.getElementById('togglePassword').addEventListener('click', function() {
  const input = document.getElementById('passwordInput');
  const icon = document.getElementById('eyeIcon');
  
  if (input.type === 'password') {
    input.type = 'text';
    icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    input.type = 'password';
    icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const password = document.getElementById('passwordInput').value.trim();
  const loginBtn = document.getElementById('loginBtn');
  
  loginBtn.disabled = true;
  loginBtn.textContent = 'Đang xử lý...';
  
  try {
    const response = await fetch(api('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      state.userRole = data.role;
      state.className = data.className;
      
      if (data.role === 'teacher') {
        showPage('teacherPage');
        loadExamsList();
        loadSubmissionsList();
      } else {
        document.getElementById('studentClass').value = data.className;
        showPage('studentInfoPage');
        await loadLatestExam();
      }
    } else {
      showError('loginError', data.error || 'Đăng nhập thất bại');
    }
  } catch (error) {
    showError('loginError', 'Lỗi kết nối: ' + error.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Đăng nhập';
  }
});

// TEACHER - UPLOAD
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const fileInput = document.getElementById('examFile');
  const file = fileInput.files[0];
  
  if (!file) {
    showMessage('uploadMessage', 'Vui lòng chọn file', true);
    return;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('timeMinutes', document.getElementById('timeMinutes').value);
  formData.append('password', document.getElementById('examPassword').value);
  formData.append('shuffle', document.getElementById('shuffleQuestions').checked);
  
  const uploadBtn = document.getElementById('uploadBtn');
  uploadBtn.disabled = true;
  uploadBtn.textContent = '⏳ Đang xử lý...';
  
  try {
    const response = await fetch(api('/exam/upload'), {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showMessage('uploadMessage', `✅ Upload thành công! ${data.count} câu hỏi`);
      fileInput.value = '';
      document.getElementById('examPassword').value = '';
      loadExamsList();
    } else {
      showMessage('uploadMessage', '❌ Lỗi: ' + (data.error || 'Không xác định'), true);
    }
  } catch (error) {
    showMessage('uploadMessage', '❌ Lỗi kết nối: ' + error.message, true);
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = '📤 Upload và Tạo Đề';
  }
});

// TEACHER - LOAD EXAMS LIST
async function loadExamsList() {
  try {
    const response = await fetch(api('/exam/list'));
    const data = await response.json();
    
    const container =
