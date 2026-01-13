// ====================== STATE MANAGEMENT ======================
let currentExamId = null;
let currentClassName = null;
let currentStudentInfo = null;
let examTimer = null;
let violations = 0;
let visibilityCheckEnabled = false;
let questionKeyMapping = {};
let examStartTime = null;
let lastViolationTime = 0;
let currentExamVariantIndex = 0;
let currentExamVariantCount = 1;
let currentExamPasswordRequired = false;
let currentExamPasswordVerified = false;
let currentExamOriginalName = '';
let currentExamTimeMinutes = 45;
let currentExamQuestions = [];
let currentExamMeta = {};
let isRenderingMath = false;

// ====================== CONFIGURATION ======================
const CONFIG = {
  YOUTUBE_VIDEO_ID: window.ENV?.YOUTUBE_VIDEO_ID || 'kQKkGqZf3nE',
  TROLL_VIDEO_ID: window.ENV?.TROLL_VIDEO_ID || 'dQw4w9WgXcQ',
  VIOLATION_COOLDOWN: 2000,
  VIOLATION_MAX: 3,
  MAX_UPLOAD_SIZE_MB: 10,
  ENABLE_AI_PARSE: true,
  DEFAULT_TIME_MINUTES: 45,
  DEFAULT_VARIANT_COUNT: 1,
  RENDER_MATH_DELAY_MS: 100,
  SCROLL_BEHAVIOR: 'smooth'
};

// ====================== THEME / DARK MODE ======================
function initDarkMode() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  const body = document.body;
  const themeToggle = document.getElementById('themeToggle');
  const label = themeToggle?.querySelector('.theme-label');
  const icon = themeToggle?.querySelector('.theme-icon');

  console.log('🎨 Initializing theme:', savedTheme);

  const applyTheme = (mode) => {
    const isDark = mode === 'dark';
    body.classList.toggle('dark-mode', isDark);
    if (label) label.textContent = isDark ? 'Dark' : 'Light';
    if (icon) icon.textContent = isDark ? '🌙' : '☀️';
    localStorage.setItem('theme', mode);
    console.log('🎨 Theme applied:', mode);
  };

  applyTheme(savedTheme);

  themeToggle?.addEventListener('click', () => {
    const next = body.classList.contains('dark-mode') ? 'light' : 'dark';
    applyTheme(next);
    themeToggle.style.transform = 'scale(0.9) rotate(360deg)';
    setTimeout(() => themeToggle.style.transform = 'scale(1) rotate(0deg)', 300);
    console.log('🎨 Theme switched to:', next);
  });
}

// ====================== YOUTUBE VIDEO ======================
function setupYouTubeVideo() {
  const iframe = document.getElementById('youtubeVideo');
  if (!iframe) return;
  const videoId = CONFIG.YOUTUBE_VIDEO_ID;
  iframe.src = `https://www.youtube.com/embed/${videoId}`;
  console.log('🎬 YouTube video loaded:', videoId);
}

// ====================== TOOLS RENDER ======================
function renderTools() {
  const grid = document.getElementById('toolsGrid');
  if (!grid) return;
  const tools = window.ENV?.TOOLS || [];
  grid.innerHTML = tools.map(t => `
    <a href="${t.url}" target="_blank" class="tool-card ${t.icon}-tool">
      <div class="tool-icon">
        <svg viewBox="0 0 24 24" fill="currentColor"><rect width="24" height="24" rx="6"/></svg>
      </div>
      <span class="tool-name">${t.name}</span>
    </a>
  `).join('');
  console.log('🛠 Tools rendered:', tools.length);
}

// ====================== LAYOUT HELPERS ======================
function showPage(id) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
    page.style.display = 'none';
  });
  const targetPage = document.getElementById(id);
  if (targetPage) {
    targetPage.classList.add('active');
    targetPage.style.display = 'flex';
    window.scrollTo({ top: 0, behavior: CONFIG.SCROLL_BEHAVIOR });
    console.log('📄 Page shown:', id);
  }
}

function showMessage(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = isError ? 'message error' : 'message success';
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 5000);
  console.log('💬 Message:', message);
}

// ====================== PASSWORD TOGGLE ======================
function setupPasswordToggle() {
  const toggleBtn = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('passwordInput');
  const eyeOpen = toggleBtn?.querySelector('.eye-open');
  const eyeClosed = toggleBtn?.querySelector('.eye-closed');

  toggleBtn?.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    if (eyeOpen) eyeOpen.style.display = isPassword ? 'none' : 'inline';
    if (eyeClosed) eyeClosed.style.display = isPassword ? 'inline' : 'none';
    console.log('👁️ Password visibility toggled:', !isPassword);
  });
}

// ====================== CUSTOM DATE INPUT ======================
function setupCustomDateInput() {
  const dobInput = document.getElementById('studentDOB');
  if (!dobInput) return;

  dobInput.type = 'text';
  dobInput.placeholder = 'dd/mm/yyyy';
  dobInput.maxLength = 10;
  dobInput.inputMode = 'numeric';

  dobInput.addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    let formatted = '';
    if (value.length > 0) formatted = value.substring(0, 2);
    if (value.length >= 3) formatted += '/' + value.substring(2, 4);
    if (value.length >= 5) formatted += '/' + value.substring(4, 8);
    e.target.value = formatted;
    e.target.setCustomValidity('');
  });

  dobInput.addEventListener('blur', function(e) {
    const value = e.target.value;
    if (!value) return;
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
      e.target.setCustomValidity('Định dạng không đúng. Nhập: dd/mm/yyyy');
      console.warn('⚠️ DOB format invalid:', value);
      return;
    }
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day < 1 || day > daysInMonth || month < 1 || month > 12 || year < 1900 || year > new Date().getFullYear()) {
      e.target.setCustomValidity('Ngày tháng năm không hợp lệ');
      console.warn('⚠️ DOB invalid date:', value);
      return;
    }
    e.target.setCustomValidity('');
    console.log('✅ DOB valid:', value);
  });
}
// ====================== VIOLATION DETECTION ======================
function setupViolationDetection() {
  if (visibilityCheckEnabled) return;
  visibilityCheckEnabled = true;
  violations = 0;
  lastViolationTime = 0;
  console.log('👀 Violation detection enabled');
  setTimeout(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }, 5000);
}

function handleVisibilityChange() {
  if (!visibilityCheckEnabled || !document.hidden) return;
  const now = Date.now();
  if (now - lastViolationTime < CONFIG.VIOLATION_COOLDOWN) return;
  lastViolationTime = now;
  violations++;
  console.warn('⚠️ Violation detected! Count:', violations);
  const violEl = document.getElementById('violationCount');
  if (violEl) violEl.textContent = `${violations}/${CONFIG.VIOLATION_MAX}`;
  if (violations >= CONFIG.VIOLATION_MAX) {
    console.error('❌ Max violations reached, auto-submitting exam');
    submitExam(true);
  }
}

function disableViolationDetection() {
  visibilityCheckEnabled = false;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  console.log('👀 Violation detection disabled');
}

// ====================== AUTH ======================
async function handleLogin(password) {
  console.log('🔑 Attempting login with password');
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    console.error('❌ Login failed:', data.error);
    throw new Error(data.error || 'Đăng nhập thất bại');
  }
  console.log('✅ Login success:', data.role);
  return data;
}

// ====================== TEACHER: LOAD EXAM LIST ======================
async function loadExamList() {
  const listDiv = document.getElementById('examList');
  if (!listDiv) return;
  listDiv.innerHTML = '<p class="empty-state">Đang tải...</p>';
  try {
    const res = await fetch('/exam/list');
    const data = await res.json();
    if (!data.ok || !data.exams?.length) {
      listDiv.innerHTML = '<p class="empty-state">Chưa có đề thi nào</p>';
      console.warn('⚠️ No exams found');
      return;
    }
    listDiv.innerHTML = '';
    data.exams.forEach(exam => {
      const item = document.createElement('div');
      item.className = 'exam-item';
      item.innerHTML = `
        <span>${exam.originalName || 'Đề thi'} • ${exam.questionCount} câu • ${exam.timeMinutes || CONFIG.DEFAULT_TIME_MINUTES} phút</span>
        <div class="exam-actions">
          <button class="btn-detail" data-id="${exam.id}">Chi tiết</button>
          <button class="btn-delete" data-id="${exam.id}">Xóa</button>
        </div>`;
      item.querySelector('.btn-detail').onclick = () => openExamDetail(exam.id);
      item.querySelector('.btn-delete').onclick = () => deleteExam(exam.id);
      listDiv.appendChild(item);
    });
    console.log('📚 Exam list loaded:', data.exams.length);
  } catch (err) {
    listDiv.innerHTML = '<p class="empty-state">Lỗi kết nối server</p>';
    console.error('❌ Error loading exam list:', err);
  }
}

async function deleteExam(examId) {
  if (!confirm('Bạn có chắc muốn xóa đề này?')) return;
  try {
    const res = await fetch(`/exam/${examId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.ok) {
      alert('❌ Không xóa được đề: ' + (data.error || 'Unknown'));
      return;
    }
    await loadExamList();
    showMessage('uploadMessage', '✅ Đã xóa đề');
    console.log('🗑️ Exam deleted:', examId);
  } catch (err) {
    alert('❌ Lỗi xóa đề: ' + err.message);
    console.error('❌ Error deleting exam:', err);
  }
}

// ====================== TEACHER: LOAD SUBMISSIONS ======================
async function loadSubmissions() {
  const listDiv = document.getElementById('submissionsList');
  if (!listDiv) return;
  listDiv.innerHTML = '<p class="empty-state">Đang tải...</p>';
  try {
    const res = await fetch('/student/submissions');
    const data = await res.json();
    if (!data.ok || !data.submissions?.length) {
      listDiv.innerHTML = '<p class="empty-state">Chưa có bài nộp nào</p>';
      console.warn('⚠️ No submissions found');
      return;
    }
    listDiv.innerHTML = '';
    data.submissions.forEach(sub => {
      const item = document.createElement('div');
      item.className = 'submission-item';
      item.innerHTML = `
        <span>${sub.name} - ${sub.className} • Điểm: ${sub.score ?? 'Chưa chấm'} • Vi phạm: ${sub.violations ?? 0}</span>
        <button class="btn-view-sub" data-id="${sub.id}">Xem</button>`;
      item.querySelector('.btn-view-sub').onclick = () => viewSubmission(sub.id);
      listDiv.appendChild(item);
    });
    console.log('📥 Submissions loaded:', data.submissions.length);
  } catch (err) {
    listDiv.innerHTML = '<p class="empty-state">Lỗi kết nối server</p>';
    console.error('❌ Error loading submissions:', err);
  }
}

async function viewSubmission(submissionId) {
  alert('Xem chi tiết bài nộp: ' + submissionId);
}

// ====================== EXAM OPERATIONS ======================
async function loadLatestExamVariant() {
  console.log('📖 Loading latest exam variant...');
  const res = await fetch('/exam/latest-variant');
  const data = await res.json();
  if (!data.ok || !data.exam) {
    console.error('❌ No exam variant available');
    throw new Error('Không có đề thi');
  }
  currentExamId = data.exam.id;
  currentExamOriginalName = data.exam.originalName || 'Đề thi';
  currentExamTimeMinutes = data.exam.timeMinutes || CONFIG.DEFAULT_TIME_MINUTES;
  currentExamVariantCount = data.exam.variantCount || CONFIG.DEFAULT_VARIANT_COUNT;
  currentExamPasswordRequired = !!data.exam.password;
  currentExamQuestions = data.exam.questions || [];
  currentExamMeta = data.exam.meta || {};
  console.log('✅ Latest exam variant loaded:', data.exam.id);
  return data.exam;
}

async function verifyExamPassword(examId, password) {
  console.log('🔑 Verifying exam password for exam:', examId);
  const res = await fetch('/exam/verify-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId, password })
  });
  const data = await res.json();
  currentExamPasswordVerified = !!data.ok;
  console.log('🔐 Password verification result:', data.ok);
  return data.ok;
}
// ====================== EXAM RENDERING ======================
function renderExam(exam) {
  const container = document.getElementById('questionsContainer');
  if (!container) return;
  container.innerHTML = '';
  questionKeyMapping = {};
  window.currentExamData = exam;

  console.log('📝 Rendering exam:', exam.id, 'with', exam.questions?.length, 'questions');

  // shuffle questions if exam.meta.shuffleQuestions
  let questions = [...(exam.questions || [])];
  if (exam.meta?.shuffleQuestions) {
    questions = shuffleArray(questions);
    console.log('🔀 Questions shuffled');
  }

  questions.forEach((q, index) => {
    const displayIndex = index + 1;
    questionKeyMapping[displayIndex] = String(q.id);
    const qDiv = document.createElement('div');
    qDiv.className = 'question-item';

    let imageHtml = q.image ? `<img src="${q.image}" alt="Hình câu ${displayIndex}"/>` : '';
    let optionsHtml = '';

    if (q.type === 'multiple_choice' && q.options) {
      let opts = [...q.options];
      if (exam.meta?.shuffleOptions) {
        opts = shuffleArray(opts);
        console.log(`🔀 Options shuffled for Q${displayIndex}`);
      }
      optionsHtml = `<div class="option-block">
        ${opts.map(opt => `
          <label>
            <input type="radio" name="q_${displayIndex}" value="${opt.key}">
            ${opt.key}. ${opt.text}
          </label>`).join('')}
      </div>`;
    } else if (q.type === 'true_false' && q.subQuestions) {
      optionsHtml = `<div class="truefalse-block">
        ${q.subQuestions.map(sub => `
          <div class="sub-item">
            <strong>${sub.key})</strong> ${sub.text}
            <div>
              <label><input type="radio" name="q_${displayIndex}_${sub.key}" value="Đúng"> Đúng</label>
              <label><input type="radio" name="q_${displayIndex}_${sub.key}" value="Sai"> Sai</label>
            </div>
          </div>`).join('')}
      </div>`;
    } else if (q.type === 'true_false') {
      optionsHtml = `<div class="truefalse-block">
        <label><input type="radio" name="q_${displayIndex}" value="Đúng"> Đúng</label>
        <label><input type="radio" name="q_${displayIndex}" value="Sai"> Sai</label>
      </div>`;
    } else if (q.type === 'short_answer') {
      optionsHtml = `<div class="short-form">
        <input class="cell cell-1" maxlength="1" name="q_${displayIndex}_1">
        <input class="cell cell-2" maxlength="1" name="q_${displayIndex}_2">
        <input class="cell cell-3" maxlength="1" name="q_${displayIndex}_3">
        <input class="cell cell-4" maxlength="1" name="q_${displayIndex}_4">
      </div>`;
    }

    qDiv.innerHTML = `<strong>Câu ${displayIndex}:</strong>
      <p>${q.question || q.text}</p>
      ${imageHtml}
      ${optionsHtml}`;
    container.appendChild(qDiv);
  });

  setTimeout(() => {
    if (!isRenderingMath) {
      isRenderingMath = true;
      window.renderMath?.();
      isRenderingMath = false;
    }
  }, CONFIG.RENDER_MATH_DELAY_MS);

  console.log('✅ Exam rendered successfully');
}

// ====================== SHUFFLE UTILS ======================
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ====================== EXAM TIMER ======================
function startExamTimer(timeMinutes) {
  examStartTime = Date.now();
  let timeLimit = timeMinutes * 60;
  let startTime = Date.now();
  console.log('⏱ Exam timer started:', timeMinutes, 'minutes');

  examTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = timeLimit - elapsed;
    if (remaining <= 0) {
      clearInterval(examTimer);
      console.warn('⏰ Time up! Auto-submitting exam');
      submitExam(true);
      return;
    }
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.textContent = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  }, 1000);
}
// ====================== SUBMIT EXAM ======================
async function submitExam(autoSubmit = false) {
  if (!autoSubmit && !confirm('Bạn có chắc muốn nộp bài?')) return;

  const examEndTime = Date.now();
  disableViolationDetection();
  if (examTimer) clearInterval(examTimer);

  const answers = {};
  document.querySelectorAll('[name^="q_"]').forEach(input => {
    const isValid = (input.type === 'radio' && input.checked) || (input.type === 'text' && input.value.trim());
    if (!isValid) return;

    const nm = input.name;
    const val = input.value.trim();
    const matchMain = nm.match(/^q_(\d+)$/);
    const matchSub = nm.match(/^q_(\d+)_(\w+)$/);
    const matchShort = nm.match(/^q_(\d+)_(\d)$/);

    let displayIndex;
    if (matchMain) displayIndex = matchMain[1];
    else if (matchSub) displayIndex = matchSub[1];
    else if (matchShort) displayIndex = matchShort[1];

    const originalQid = questionKeyMapping[displayIndex] || displayIndex;

    if (matchSub) {
      const subKey = matchSub[2];
      answers[originalQid] = answers[originalQid] || {};
      answers[originalQid][subKey] = val;
    } else if (matchShort) {
      const idx = matchShort[2];
      answers[originalQid] = answers[originalQid] || ['', '', '', ''];
      answers[originalQid][parseInt(idx) - 1] = val;
    } else {
      answers[originalQid] = val;
    }
  });

  let examDataToSend = null;
  if (window.currentExamData?.questions) {
    examDataToSend = {
      id: window.currentExamData.id,
      questions: window.currentExamData.questions.map(q => ({
        id: q.id,
        displayIndex: q.displayIndex,
        type: q.type,
        question: q.question || q.text,
        options: q.options || []
      }))
    };
  }

  try {
    const res = await fetch('/student/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: currentStudentInfo.name,
        className: currentClassName,
        dob: currentStudentInfo.dob,
        answers,
        examId: currentExamId,
        violations,
        examData: examDataToSend,
        startTime: examStartTime,
        endTime: examEndTime
      })
    });
    const data = await res.json();

    if (data.ok) {
      showPage('resultPage');
      const msgEl = document.getElementById('resultMessage');
      const scoreEl = document.getElementById('scoreDisplay');
      msgEl.textContent = autoSubmit ? 'Hết giờ hoặc vi phạm! Đã tự động nộp.' : 'Nộp bài thành công!';
      if (data.score !== null && data.score !== undefined) {
        scoreEl.textContent = `${data.score}/10`;
        scoreEl.style.color = 'var(--success)';
      } else {
        scoreEl.textContent = 'Chờ chấm điểm';
        scoreEl.style.color = 'var(--warning)';
      }
      console.log('✅ Exam submitted successfully');
    } else {
      alert('❌ Lỗi: ' + (data.error || 'Unknown'));
      console.error('❌ Exam submission failed:', data.error);
    }
  } catch (err) {
    alert('❌ Lỗi nộp bài: ' + err.message);
    console.error('❌ Error submitting exam:', err);
  }
}
// ====================== EVENT HANDLERS ======================
function setupEventHandlers() {
  // Login Form
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    loginError.classList.remove('show');

    const pwd = document.getElementById('passwordInput').value.trim();
    if (!pwd) {
      loginError.textContent = 'Vui lòng nhập mật khẩu';
      loginError.classList.add('show');
      return;
    }

    try {
      const result = await handleLogin(pwd);
      if (result.role === 'teacher') {
        showPage('teacherPage');
        await Promise.all([loadExamList(), loadSubmissions()]);
      } else if (result.role === 'student') {
        currentClassName = result.className;
        showPage('studentInfoPage');
        document.getElementById('studentClass').value = result.className || '';

        // Restore saved data
        const savedName = localStorage.getItem('studentName');
        const savedDOB = localStorage.getItem('studentDOB');
        if (savedName) document.getElementById('studentName').value = savedName;
        if (savedDOB) document.getElementById('studentDOB').value = savedDOB;

        setupCustomDateInput();
        const exam = await loadLatestExamVariant();
        currentExamId = exam.id;
        const pwdGroup = document.getElementById('examPasswordGroup');
        if (pwdGroup) pwdGroup.style.display = exam.password ? 'block' : 'none';
      }
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.add('show');
    }
  });

  // Student Info Form
  const studentInfoForm = document.getElementById('studentInfoForm');
  const studentInfoError = document.getElementById('studentInfoError');
  studentInfoForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    studentInfoError.textContent = '';
    studentInfoError.classList.remove('show');

    const name = document.getElementById('studentName').value.trim();
    const dob = document.getElementById('studentDOB').value;
    if (!name || !dob) {
      studentInfoError.textContent = 'Vui lòng điền đầy đủ thông tin';
      studentInfoError.classList.add('show');
      return;
    }

    localStorage.setItem('studentName', name);
    localStorage.setItem('studentDOB', dob);
    currentStudentInfo = { name, dob };

    try {
      const exam = await loadLatestExamVariant();
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
      document.getElementById('studentInfo').textContent = `${name} - ${currentClassName}`;
      renderExam(exam);
      startExamTimer(exam.timeMinutes);
      setupViolationDetection();
    } catch (err) {
      studentInfoError.textContent = 'Lỗi: ' + err.message;
      studentInfoError.classList.add('show');
    }
  });

  // Upload Form (Teacher)
  const uploadForm = document.getElementById('uploadForm');
  uploadForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('examFile');
    if (!fileInput?.files[0]) {
      showMessage('uploadMessage', 'Vui lòng chọn file đề thi', true);
      return;
    }
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('timeMinutes', document.getElementById('timeMinutes')?.value || '45');
    formData.append('password', document.getElementById('examPassword')?.value || '');
    formData.append('variantCount', document.getElementById('variantCount')?.value || '1');
    formData.append('p1Mode', document.getElementById('p1Mode')?.value || 'none');
    formData.append('p2Mode', document.getElementById('p2Mode')?.value || 'none');
    formData.append('p3Mode', document.getElementById('p3Mode')?.value || 'none');
    formData.append('useAI', document.getElementById('useAI')?.checked ? 'true' : 'false');
    try {
      const res = await fetch('/exam/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.ok) {
        showMessage('uploadMessage', `✅ Upload thành công! ${data.count} câu`);
        uploadForm.reset();
        await Promise.all([loadExamList(), loadSubmissions()]);
      } else {
        showMessage('uploadMessage', '❌ ' + (data.error || 'Lỗi upload'), true);
      }
    } catch (err) {
      showMessage('uploadMessage', '❌ Lỗi: ' + err.message, true);
    }
  });

  // Submit Button (Student)
  document.getElementById('submitBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    submitExam(false);
  });

  // Logout Buttons
  document.getElementById('logoutTeacher')?.addEventListener('click', () => location.reload());
  document.getElementById('logoutStudent')?.addEventListener('click', () => location.reload());

  // Back to Home Buttons
  const backButtons = document.querySelectorAll('[id^="backToHome"]');
  backButtons.forEach(btn => {
    btn.addEventListener('click', () => location.reload());
  });

  // Modal Close
  document.getElementById('closeModal')?.addEventListener('click', closeExamDetail);
  window.onclick = (event) => {
    const modal = document.getElementById('examDetailModal');
    if (event.target === modal) closeExamDetail();
  };
}
// ====================== FOOTER TROLL ======================
function setupFooterTroll() {
  const btns = [
    document.getElementById('backToHome'),
    document.getElementById('backToHomeTeacher'),
    document.getElementById('backToHomeStudent'),
    document.getElementById('backToHomeExam'),
    document.getElementById('backToHomeResult')
  ].filter(Boolean);

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      // reset state
      currentExamId = null;
      currentClassName = null;
      currentStudentInfo = null;
      violations = 0;
      disableViolationDetection();
      showPage('loginPage');
      // mở troll video
      const trollId = CONFIG.TROLL_VIDEO_ID;
      window.open(`https://www.youtube.com/watch?v=${trollId}`, '_blank');
      console.log('🎭 Footer troll triggered, opened video:', trollId);
    });
  });
}

// ====================== EXAM DETAIL MODAL ======================
function openExamDetail(examId) {
  const modal = document.getElementById('examDetailModal');
  const content = document.getElementById('examDetailContent');
  if (!modal || !content) return;

  modal.style.display = 'block';
  content.innerHTML = '<p>Đang tải chi tiết đề...</p>';

  fetch(`/exam/detail/${examId}`)
    .then(res => res.json())
    .then(data => {
      if (!data.ok) {
        content.innerHTML = '<p class="error">Không tải được chi tiết đề</p>';
        return;
      }
      content.innerHTML = `
        <h3>${data.exam.originalName || 'Đề thi'}</h3>
        <p>Số câu hỏi: ${data.exam.questionCount}</p>
        <pre>${JSON.stringify(data.exam.questions, null, 2)}</pre>
      `;
      console.log('📄 Exam detail loaded:', examId);
    })
    .catch(err => {
      content.innerHTML = '<p class="error">Lỗi kết nối server</p>';
      console.error('❌ Error loading exam detail:', err);
    });
}

function closeExamDetail() {
  const modal = document.getElementById('examDetailModal');
  if (modal) modal.style.display = 'none';
  console.log('📄 Exam detail modal closed');
}

// ====================== INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  setupYouTubeVideo();
  renderTools();
  setupPasswordToggle();
  setupEventHandlers();
  setupFooterTroll();
  showPage('loginPage');
  console.log('🚀 App initialized');
});

// ====================== GLOBAL EXPORTS ======================
window.showPage = showPage;
window.showMessage = showMessage;
window.loadExamList = loadExamList;
window.loadSubmissions = loadSubmissions;
window.openExamDetail = openExamDetail;
window.closeExamDetail = closeExamDetail;
