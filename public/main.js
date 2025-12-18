// ====================== STATE ======================
let currentExamId = null;
let currentClassName = null;
let currentStudentInfo = null;
let examTimer = null;
let violations = 0;

// ====================== HELPERS ======================
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
    target.style.display = 'block';
  }
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
  if (!data.ok || !data.exam) throw new Error('Không có đề thi');
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
      e.preventDefault();
      loginError.textContent = '';
      loginError.classList.remove('show');
      const pwd = document.getElementById('passwordInput').value.trim();
      if (!pwd) {
        loginError.textContent = 'Nhập mật khẩu';
        loginError.classList.add('show');
        return;
      }
      const loginBtn = document.getElementById('loginBtn');
      loginBtn.disabled = true;
      loginBtn.textContent = 'Đang xử lý...';
      try {
        const result = await handleLogin(pwd);
        if (result.role === 'teacher') {
          showPage('teacherPage');
          await loadExamList();
          await loadSubmissions();
        } else if (result.role === 'student') {
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

  // Toggle password
  document.getElementById('togglePassword')?.addEventListener('click', () => {
    const input = document.getElementById('passwordInput');
    const icon = document.getElementById('eyeIcon');
    if (input.type === 'password') {
      input.type = 'text';
      icon.innerHTML = '<path d="..."/>'; // icon open
    } else {
      input.type = 'password';
      icon.innerHTML = '<path d="..."/>'; // icon closed
    }
  });

  // Student info form
  const studentInfoForm = document.getElementById('studentInfoForm');
  const studentInfoError = document.getElementById('studentInfoError');
  studentInfoForm?.addEventListener('submit', async e => {
    e.preventDefault();
    studentInfoError.textContent = '';
    const name = document.getElementById('studentName').value.trim();
    const dob = document.getElementById('studentDOB').value;
    if (!name || !dob) {
      studentInfoError.textContent = 'Điền đầy đủ thông tin';
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
          studentInfoError.textContent = 'Nhập mật khẩu đề thi';
          studentInfoError.classList.add('show');
          return;
        }
        const ok = await verifyExamPassword(exam.id, examPassword);
        if (!ok) {
          studentInfoError.textContent = 'Mật khẩu đề sai';
          studentInfoError.classList.add('show');
          return;
        }
      }
      showPage('examPage');
      document.getElementById('studentInfo').textContent = `${name} - ${currentClassName}`;
      renderExam(exam);
      startExamTimer(exam.timeMinutes);
    } catch (err) {
      studentInfoError.textContent = 'Lỗi: ' + err.message;
      studentInfoError.classList.add('show');
    }
  });

  // Upload form
  const uploadForm = document.getElementById('uploadForm');
  uploadForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const fileInput = document.getElementById('examFile');
    if (!fileInput.files[0]) {
      showMessage('uploadMessage', 'Chọn file', true);
      return;
    }
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('timeMinutes', document.getElementById('timeMinutes').value);
    formData.append('password', document.getElementById('examPassword').value);
    formData.append('shuffle', document.getElementById('shuffleQuestions').checked);
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ Đang xử lý...';
    try {
      const res = await fetch('/exam/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.ok) {
        showMessage('uploadMessage', `✅ Upload thành công! ${data.count} câu`);
        uploadForm.reset();
        await loadExamList();
        await loadSubmissions();
      } else {
        showMessage('uploadMessage', '❌ ' + (data.error || 'Lỗi upload'), true);
      }
    } catch (err) {
      showMessage('uploadMessage', '❌ Lỗi: ' + err.message, true);
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
  document.getElementById('closeModal')?.addEventListener('click', closeExamDetail);
  document.getElementById('examDetailModal')?.addEventListener('click', e => {
    if (e.target.id === 'examDetailModal') closeExamDetail();
  });
}

// ====================== INIT ======================
document.addEventListener('DOMContentLoaded', () => {
  showPage('loginPage');
  setupEventHandlers();
});
