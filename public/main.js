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
  tabViolations: 0
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
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 5000);
}

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
    } else {
      showMessage('uploadMessage', '❌ Lỗi: ' + (data.error || 'Không xác định'), true);
    }
  } catch (error) {
    showMessage('uploadMessage', '❌ Lỗi kết nối: ' + error.message, true);
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = '📤 Upload và Trộn Đề';
  }
});

document.getElementById('logoutTeacher').addEventListener('click', () => {
  state.userRole = null;
  showPage('loginPage');
  document.getElementById('passwordInput').value = '';
});

async function loadLatestExam() {
  try {
    const response = await fetch(api('/exam/latest'));
    const data = await response.json();
    
    if (data.ok && data.questions && data.questions.length > 0) {
      state.examData = data;
    } else {
      showError('studentInfoError', 'Chưa có đề thi nào. Vui lòng liên hệ giáo viên.');
    }
  } catch (error) {
    showError('studentInfoError', 'Lỗi tải đề thi: ' + error.message);
  }
}

document.getElementById('studentInfoForm').addEventListener('submit', (e) => {
  e.preventDefault();
  
  const name = document.getElementById('studentName').value.trim();
  const dob = document.getElementById('studentDOB').value;
  const className = document.getElementById('studentClass').value;
  
  if (!name || !dob) {
    showError('studentInfoError', 'Vui lòng điền đầy đủ thông tin');
    return;
  }
  
  state.studentInfo = { name, dob, className };
  startExam();
});

document.getElementById('logoutStudent').addEventListener('click', () => {
  state.userRole = null;
  state.className = null;
  showPage('loginPage');
  document.getElementById('passwordInput').value = '';
});

function startExam() {
  if (!state.examData || !state.examData.questions || state.examData.questions.length === 0) {
    alert('Không có đề thi');
    return;
  }
  
  showPage('examPage');
  
  document.getElementById('studentInfo').textContent = 
    `${state.studentInfo.name} - Lớp ${state.studentInfo.className}`;
  
  const container = document.getElementById('questionsContainer');
  container.innerHTML = '';
  
  state.examData.questions.forEach((question, index) => {
    const div = document.createElement('div');
    div.className = 'question-item';
    div.innerHTML = `<strong>Câu ${index + 1}:</strong><div>${question.replace(/\n/g, '<br>')}</div>`;
    container.appendChild(div);
  });
  
  state.timeLeft = (state.examData.timeMinutes || 45) * 60;
  updateTimer();
  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    updateTimer();
    
    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      submitExam(true);
    }
  }, 1000);
  
  state.tabViolations = 0;
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

function handleVisibilityChange() {
  if (document.hidden && state.timerInterval) {
    state.tabViolations++;
    const warning = document.getElementById('warningMessage');
    warning.textContent = `⚠️ Cảnh báo: Bạn đã rời khỏi trang ${state.tabViolations}/3 lần`;
    
    if (state.tabViolations >= 3) {
      clearInterval(state.timerInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      alert('Bạn đã vi phạm quy định. Bài thi sẽ được thu ngay.');
      submitExam(true);
    }
  }
}

function updateTimer() {
  const minutes = Math.floor(state.timeLeft / 60);
  const seconds = state.timeLeft % 60;
  document.getElementById('timer').textContent = 
    `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  if (state.timeLeft < 300 && state.timeLeft > 0) {
    document.getElementById('timer').style.color = 'var(--warning)';
  }
  
  if (state.timeLeft < 60 && state.timeLeft > 0) {
    document.getElementById('timer').style.color = 'var(--danger)';
  }
}

document.getElementById('submitBtn').addEventListener('click', () => {
  if (confirm('Bạn có chắc chắn muốn nộp bài?')) {
    submitExam(false);
  }
});

async function submitExam(isAuto) {
  clearInterval(state.timerInterval);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  
  const answersText = document.getElementById('studentAnswers').value.trim();
  let answers;
  
  try {
    answers = JSON.parse(answersText);
  } catch (e) {
    answers = answersText;
  }
  
  const payload = {
    name: state.studentInfo.name,
    className: state.studentInfo.className,
    dob: state.studentInfo.dob,
    answers: answers,
    score: null,
    examId: state.examData.examId,
    isAutoSubmit: isAuto,
    violations: state.tabViolations
  };
  
  try {
    const response = await fetch(api('/student/submit'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    showPage('resultPage');
    
    if (data.ok) {
      document.getElementById('resultMessage').textContent = 
        isAuto ? 'Bài làm của bạn đã được tự động nộp.' : 'Bài làm của bạn đã được nộp thành công!';
      
      if (data.score !== undefined && data.score !== null) {
        document.getElementById('scoreDisplay').textContent = `Điểm: ${data.score}/10`;
      }
    } else {
      document.getElementById('resultMessage').textContent = 
        'Có lỗi xảy ra: ' + (data.error || 'Không xác định');
    }
  } catch (error) {
    showPage('resultPage');
    document.getElementById('resultMessage').textContent = 
      'Lỗi kết nối: ' + error.message;
  }
}

document.getElementById('backToHome').addEventListener('click', () => {
  state.userRole = null;
  state.className = null;
  state.studentInfo = null;
  state.examData = null;
  showPage('loginPage');
  document.getElementById('passwordInput').value = '';
  document.getElementById('studentAnswers').value = '';
});
