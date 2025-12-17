// ====================== STATE ======================
let currentExamId = null;
let currentClassName = null;
let currentStudentInfo = null;
let examTimer = null;
let violations = 0;

// ====================== HELPERS ======================
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}
function showMessage(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = isError ? 'message error' : 'message success';
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// ====================== AUTH ======================
async function handleLogin(password) {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Đăng nhập thất bại');
  return data;
}

// ====================== STUDENT ======================
async function loadLatestExam() {
  const res = await fetch('/exam/latest');
  const data = await res.json();
  if (!data.ok || !data.exam) throw new Error('Không có đề thi nào');
  return data.exam;
}
async function verifyExamPassword(examId, password) {
  const res = await fetch('/exam/verify-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId, password })
  });
  const data = await res.json();
  return data.ok;
}

// ====================== EVENTS ======================
function setupEventHandlers() {
  // Login form
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault(); // chặn reload
      loginError.textContent = '';
      loginError.classList.remove('show');
      const pwd = document.getElementById('passwordInput').value.trim();
      const loginBtn = document.getElementById('loginBtn');
      loginBtn.disabled = true;
      loginBtn.textContent = 'Đang xử lý...';
      try {
        const result = await handleLogin(pwd);
        if (result.role === 'teacher') {
          showPage('teacherPage');
          await loadExamList();
          await loadSubmissions();
        } else {
          currentClassName = result.className;
          showPage('studentInfoPage');
          document.getElementById('studentClass').value = result.className || '';
          const exam = await loadLatestExam();
          currentExamId = exam.id;
          const pwdGroup = document.getElementById('examPasswordGroup');
          pwdGroup.style.display = exam.password ? 'block' : 'none';
        }
      } catch (err) {
        loginError.textContent = err.message;
        loginError.classList.add('show');
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Đăng nhập';
      }
    });
  }

  // Toggle password visibility
  document.getElementById('togglePassword')?.addEventListener('click', () => {
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

  // Student info form
  const studentInfoForm = document.getElementById('studentInfoForm');
  const studentInfoError = document.getElementById('studentInfoError');
  studentInfoForm?.addEventListener('submit', async e => {
    e.preventDefault(); // chặn reload
    studentInfoError.textContent = '';
    const name = document.getElementById('studentName').value.trim();
    const dob = document.getElementById('studentDOB').value;
    if (!name || !dob) {
      studentInfoError.textContent = 'Vui lòng điền đầy đủ thông tin';
      studentInfoError.classList.add('show');
      return;
    }
    currentStudentInfo = { name, dob };
    try {
      const exam = await loadLatestExam();
      currentExamId = exam.id;
      if (exam.password) {
        const examPassword = document.getElementById('studentExamPassword').value.trim();
        if (!examPassword) {
          studentInfoError.textContent = 'Vui lòng nhập mật khẩu đề thi';
          studentInfoError.classList.add('show');
          return;
        }
        const ok = await verifyExamPassword(exam.id, examPassword);
        if (!ok) {
          studentInfoError.textContent = 'Mật khẩu đề thi không đúng';
          studentInfoError.classList.add('show');
          return;
        }
      }
      showPage('examPage');
      document.getElementById('studentInfo').textContent = `${name} - ${currentClassName || ''}`;
      renderExam(exam);
      startExamTimer(exam.timeMinutes);
    } catch (e) {
      studentInfoError.textContent = 'Không tải được đề thi: ' + e.message;
      studentInfoError.classList.add('show');
    }
  });

  // Upload form
  const uploadForm = document.getElementById('uploadForm');
  uploadForm?.addEventListener('submit', async e => {
    e.preventDefault(); // chặn reload
    const fileInput = document.getElementById('examFile');
    const timeInput = document.getElementById('timeMinutes');
    const passwordInput = document.getElementById('examPassword');
    const shuffleInput = document.getElementById('shuffleQuestions');
    const uploadBtn = document.getElementById('uploadBtn');
    if (!fileInput.files[0]) {
      showMessage('uploadMessage', 'Vui lòng chọn file', true);
      return;
    }
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('timeMinutes', timeInput.value);
    formData.append('password', passwordInput.value);
    formData.append('shuffle', shuffleInput.checked);
    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ Đang xử lý...';
    try {
      const res = await fetch('/exam/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.ok) {
        showMessage('uploadMessage', `✅ Upload thành công! ${data.count} câu hỏi`);
        uploadForm.reset();
        await loadExamList();
        await loadSubmissions();
      } else {
        showMessage('uploadMessage', '❌ ' + (data.error || 'Lỗi upload'), true);
      }
    } catch (e) {
      showMessage('uploadMessage', '❌ Lỗi kết nối: ' + e.message, true);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = '📤 Upload Đề';
    }
  });

  // Nộp bài
  document.getElementById('submitBtn')?.addEventListener('click', () => submitExam(false));

  // Đăng xuất
  document.getElementById('logoutTeacher')?.addEventListener('click', () => location.reload());
  document.getElementById('logoutStudent')?.addEventListener('click', () => location.reload());

  // Modal close
  document.getElementById('closeModal')?.addEventListener('click', closeExamDetailModal);
  document.getElementById('examDetailModal')?.addEventListener('click', e => {
    if (e.target.id === 'examDetailModal') closeExamDetailModal();
  });
}

// ====================== INIT ======================
document.addEventListener('DOMContentLoaded', () => {
  showPage('loginPage');
  setupEventHandlers();
});
