// ====================== STATE MANAGEMENT ======================
let currentExamId = null;
let currentClassName = null;
let currentStudentInfo = null;
let examTimer = null;
let violations = 0;
let visibilityCheckEnabled = false;
let questionKeyMapping = {};
let examStartTime = null;

// ====================== CONFIGURATION ======================
const CONFIG = {
  YOUTUBE_VIDEO_ID: window.ENV?.YOUTUBE_VIDEO_ID || 'dQw4w9WgXcQ',
  VIOLATION_COOLDOWN: 2000,
  VIOLATION_MAX: 3
};

// ====================== DARK MODE HANDLER ======================
function initDarkMode() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  const body = document.body;
  const themeToggle = document.getElementById('themeToggle');
  const sunIcon = themeToggle?.querySelector('.sun-icon');
  const moonIcon = themeToggle?.querySelector('.moon-icon');
  
  console.log('🎨 Initializing theme:', savedTheme);
  
  // Apply saved theme
  if (savedTheme === 'dark') {
    body.classList.add('dark-mode');
    if (sunIcon) sunIcon.style.display = 'none';
    if (moonIcon) moonIcon.style.display = 'block';
  }
  
  // Toggle theme on click
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = body.classList.toggle('dark-mode');
      
      // Switch icons with smooth transition
      if (sunIcon && moonIcon) {
        if (isDark) {
          sunIcon.style.display = 'none';
          moonIcon.style.display = 'block';
        } else {
          sunIcon.style.display = 'block';
          moonIcon.style.display = 'none';
        }
      }
      
      // Save preference
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      
      // Smooth animation
      themeToggle.style.transform = 'scale(0.85) rotate(360deg)';
      setTimeout(() => {
        themeToggle.style.transform = 'scale(1) rotate(0deg)';
      }, 300);
      
      console.log('🎨 Theme switched to:', isDark ? 'dark' : 'light');
    });
  }
}

// ====================== YOUTUBE VIDEO SETUP ======================
function setupYouTubeVideo() {
  const iframe = document.getElementById('youtubeVideo');
  if (!iframe) return;
  
  const videoId = CONFIG.YOUTUBE_VIDEO_ID;
  iframe.src = `https://www.youtube.com/embed/${videoId}`;
  console.log('🎬 YouTube video loaded:', videoId);
}

// ====================== HELPERS ======================
function showPage(id) {
  console.log(`🔄 Navigating to page: ${id}`);
  
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
    page.style.display = 'none';
  });
  
  const targetPage = document.getElementById(id);
  if (targetPage) {
    targetPage.classList.add('active');
    targetPage.style.display = 'flex';
    
    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    console.error('❌ Page not found:', id);
  }
}

function showMessage(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) {
    console.warn('⚠️ Message element not found:', elementId);
    return;
  }
  
  el.textContent = message;
  el.className = isError ? 'message error' : 'message success';
  el.style.display = 'block';
  
  // Auto hide after 5s
  setTimeout(() => {
    el.style.display = 'none';
  }, 5000);
}

// ====================== CUSTOM DATE INPUT (dd/mm/yyyy) ======================
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
      return;
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (day < 1 || day > 31) {
      e.target.setCustomValidity('Ngày không hợp lệ (1-31)');
      return;
    }
    if (month < 1 || month > 12) {
      e.target.setCustomValidity('Tháng không hợp lệ (1-12)');
      return;
    }
    if (year < 1900 || year > new Date().getFullYear()) {
      e.target.setCustomValidity(`Năm không hợp lệ (1900-${new Date().getFullYear()})`);
      return;
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) {
      e.target.setCustomValidity(`Tháng ${month}/${year} chỉ có ${daysInMonth} ngày`);
      return;
    }

    e.target.setCustomValidity('');
  });
  
  console.log('✅ Custom date input initialized');
}

// ====================== VIOLATION DETECTION ======================
let lastActivityTime = Date.now();
let lastViolationTime = 0;

function setupViolationDetection() {
  if (visibilityCheckEnabled) return;
  
  visibilityCheckEnabled = true;
  violations = 0;
  
  console.log('🔒 Violation detection will activate in 5s...');

  setTimeout(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('mousemove', updateActivity);
    document.addEventListener('keypress', updateActivity);
    document.addEventListener('click', updateActivity);
    console.log('✅ Violation detection activated');
  }, 5000);
}

function handleVisibilityChange() {
  if (!visibilityCheckEnabled || !document.hidden) return;
  
  const now = Date.now();
  if (now - lastViolationTime < CONFIG.VIOLATION_COOLDOWN) {
    console.log('⏳ Violation ignored (cooldown)');
    return;
  }
  
  lastViolationTime = now;
  recordViolation('Chuyển tab');
}

function updateActivity() {
  lastActivityTime = Date.now();
}

function recordViolation(reason) {
  violations++;
  console.warn(`⚠️ Violation #${violations}: ${reason}`);
  showViolationWarning();

  if (violations === 1) {
    alert(`⚠️ Vi phạm lần 1 (${reason})!\nLo mà làm đàng hoàng đi, còn 2 lần nữa sẽ bị thu bài.`);
  } else if (violations === 2) {
    alert(`⚠️ Vi phạm lần 2 (${reason})!\nĐã nói rồi còn vi phạm, 1 lần nữa sẽ bị thu bài.`);
  } else if (violations >= CONFIG.VIOLATION_MAX) {
    alert(`⛔ Vi phạm ${CONFIG.VIOLATION_MAX} lần! Tự động nộp bài với điểm 0.`);
    submitExam(true);
  }
}

function showViolationWarning() {
  const warningEl = document.getElementById('warningMessage');
  if (warningEl) {
    warningEl.textContent = `⚠️ Cảnh báo: ${violations}/${CONFIG.VIOLATION_MAX} lần vi phạm`;
    warningEl.style.display = 'block';
    warningEl.style.animation = 'blink 1s ease-in-out 3';
  }
}

function disableViolationDetection() {
  visibilityCheckEnabled = false;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener('mousemove', updateActivity);
  document.removeEventListener('keypress', updateActivity);
  document.removeEventListener('click', updateActivity);
  console.log('🔓 Violation detection disabled');
}

// ====================== AUTH ======================
async function handleLogin(password) {
  console.log('🔑 Attempting login...');
  
  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    
    const data = await res.json();
    console.log('📥 Login response:', data);
    
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Đăng nhập thất bại');
    }
    
    return data;
  } catch (err) {
    console.error('❌ Login error:', err);
    throw err;
  }
}

// ====================== PASSWORD TOGGLE ======================
function setupPasswordToggle() {
  const toggleBtn = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('passwordInput');
  const eyeOpen = toggleBtn?.querySelector('.eye-open');
  const eyeClosed = toggleBtn?.querySelector('.eye-closed');
  
  if (!toggleBtn || !passwordInput) return;
  
  toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    
    // Toggle icons
    if (eyeOpen && eyeClosed) {
      if (isPassword) {
        eyeOpen.style.display = 'none';
        eyeClosed.style.display = 'block';
      } else {
        eyeOpen.style.display = 'block';
        eyeClosed.style.display = 'none';
      }
    }
  });
  
  console.log('✅ Password toggle initialized');
}

// ====================== TEACHER: LOAD EXAM LIST ======================
async function loadExamList() {
  const listDiv = document.getElementById('examList');
  if (!listDiv) {
    console.error('❌ examList element not found');
    return;
  }
  
  listDiv.innerHTML = '<p class="empty-state">Đang tải...</p>';
  console.log('🔄 Fetching exam list...');

  try {
    const res = await fetch('/exam/list');
    const data = await res.json();
    console.log('📥 Exam list:', data);

    if (!data.ok || !data.exams?.length) {
      listDiv.innerHTML = '<p class="empty-state">Chưa có đề thi nào</p>';
      return;
    }

    listDiv.innerHTML = '';
    
    data.exams.forEach((exam) => {
      const examGroup = document.createElement('div');
      examGroup.style.marginBottom = '20px';
      
      const mainItem = document.createElement('div');
      mainItem.className = 'exam-item';
      mainItem.innerHTML = `
        <span><strong>📚 ${exam.originalName || 'Đề không tên'}</strong> (${exam.questionCount || 0} câu)</span>
        <button type="button" class="btn btn-primary">Chi tiết</button>
      `;
      mainItem.querySelector('button').onclick = () => openExamDetail(exam.id);
      examGroup.appendChild(mainItem);
      
      listDiv.appendChild(examGroup);
    });
    
    console.log('✅ Exam list loaded successfully');
  } catch (err) {
    console.error('❌ Load exam list error:', err);
    listDiv.innerHTML = '<p class="empty-state">Lỗi kết nối server</p>';
  }
}

// ====================== TEACHER: LOAD SUBMISSIONS ======================
async function loadSubmissions() {
  const listDiv = document.getElementById('submissionsList');
  if (!listDiv) return;
  
  listDiv.innerHTML = '<p class="empty-state">Đang tải...</p>';
  console.log('🔄 Fetching submissions...');

  try {
    const res = await fetch('/student/submissions');
    const data = await res.json();
    console.log('📥 Submissions:', data);

    if (!data.ok || !data.submissions?.length) {
      listDiv.innerHTML = '<p class="empty-state">Chưa có bài nộp nào</p>';
      return;
    }

    listDiv.innerHTML = '';
    data.submissions.slice(0, 10).forEach(sub => {
      const item = document.createElement('div');
      item.className = 'submission-item';
      item.innerHTML = `
        <strong>${sub.name}</strong>
        <div>${sub.className} • ${sub.date}</div>
        ${sub.score !== 'Chưa chấm'
          ? `<span class="submission-score">${sub.score} điểm</span>`
          : '<span style="color:var(--warning)">Chưa chấm</span>'}
      `;
      listDiv.appendChild(item);
    });
    
    console.log('✅ Submissions loaded successfully');
  } catch (err) {
    console.error('❌ Load submissions error:', err);
    listDiv.innerHTML = '<p class="empty-state">Lỗi kết nối server</p>';
  }
}

// ====================== EXAM OPERATIONS ======================
async function loadLatestExamVariant() {
  console.log('🔄 Loading latest exam variant...');
  
  const res = await fetch('/exam/latest-variant');
  const data = await res.json();
  
  if (!data.ok || !data.exam) {
    throw new Error('Không có đề thi');
  }
  
  console.log('✅ Latest exam loaded:', data.exam.id);
  return data.exam;
}

async function verifyExamPassword(examId, password) {
  console.log('🔐 Verifying exam password...');
  
  const res = await fetch('/exam/verify-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId, password })
  });
  
  const data = await res.json();
  console.log('✅ Password verification:', data.ok ? 'valid' : 'invalid');
  
  return data.ok;
}

function startExamTimer(timeMinutes) {
  examStartTime = Date.now();
  console.log('⏱️ Exam started at:', new Date(examStartTime).toLocaleString('vi-VN'));
  
  let timeLimit = timeMinutes * 60;
  let startTime = Date.now();
  
  examTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = timeLimit - elapsed;
    
    if (remaining <= 0) {
      clearInterval(examTimer);
      submitExam(true);
      return;
    }
    
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    
    const timerEl = document.getElementById('timer');
    if (timerEl) {
      timerEl.textContent = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
    }
  }, 1000);
}
// ====================== RENDER EXAM ======================
function renderExam(exam) {
  const container = document.getElementById('questionsContainer');
  if (!container) return;
  
  container.innerHTML = '';
  questionKeyMapping = {};
  window.currentExamData = exam;
  
  console.log('📝 Rendering exam:', exam.id);
  console.log('📋 Questions count:', exam.questions?.length || 0);
  
  (exam.questions || []).forEach((q, index) => {
    const displayIndex = index + 1;
    questionKeyMapping[displayIndex] = String(q.id);
    
    const qDiv = document.createElement('div');
    qDiv.className = 'question-item';
    
    let imageHtml = '';
    if (q.image) {
      imageHtml = `<img src="${q.image}" style="max-width:100%;border-radius:12px;margin:16px 0;" alt="Hình câu ${displayIndex}"/>`;
    }
    
    let optionsHtml = '';
    
    if (q.type === 'multiple_choice' && q.options) {
      optionsHtml = `
        <div class="option-block">
          ${q.options.map(opt => `
            <label>
              <input type="radio" name="q_${displayIndex}" value="${opt.key}">
              ${opt.key}. ${opt.text}
            </label>
          `).join('')}
        </div>
      `;
    } else if (q.type === 'true_false' && q.subQuestions) {
      optionsHtml = `
        <div class="truefalse-block">
          ${q.subQuestions.map(sub => `
            <div class="sub-item">
              <strong>${sub.key})</strong> ${sub.text}
              <div style="margin-top:10px;">
                <label><input type="radio" name="q_${displayIndex}_${sub.key}" value="Đúng"> Đúng</label>
                <label><input type="radio" name="q_${displayIndex}_${sub.key}" value="Sai"> Sai</label>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (q.type === 'true_false') {
      optionsHtml = `
        <div class="truefalse-block">
          <label><input type="radio" name="q_${displayIndex}" value="Đúng"> Đúng</label>
          <label><input type="radio" name="q_${displayIndex}" value="Sai"> Sai</label>
        </div>
      `;
    } else if (q.type === 'short_answer') {
      optionsHtml = `
        <div class="short-form">
          <input class="cell cell-1" maxlength="1" name="q_${displayIndex}_1">
          <input class="cell cell-2" maxlength="1" name="q_${displayIndex}_2">
          <input class="cell cell-3" maxlength="1" name="q_${displayIndex}_3">
          <input class="cell cell-4" maxlength="1" name="q_${displayIndex}_4">
        </div>
      `;
    }
    
    qDiv.innerHTML = `
      <strong>Câu ${displayIndex}:</strong>
      <p>${q.question || q.text}</p>
      ${imageHtml}
      ${optionsHtml}
    `;
    container.appendChild(qDiv);
  });
  
  console.log('✅ Exam rendered, mapping:', questionKeyMapping);
  
  // Render MathJax
  setTimeout(() => {
    if (window.renderMath) {
      window.renderMath();
      console.log('✅ MathJax rendering triggered');
    }
  }, 100);
}

// ====================== SUBMIT EXAM ======================
async function submitExam(autoSubmit = false) {
  if (!autoSubmit && !confirm('Bạn có chắc muốn nộp bài?')) return;
  
  const examEndTime = Date.now();
  console.log('⏱️ Exam ended at:', new Date(examEndTime).toLocaleString('vi-VN'));
  
  disableViolationDetection();
  if (examTimer) clearInterval(examTimer);

  const answers = {};
  
  console.log('📤 Collecting answers...');

  document.querySelectorAll('[name^="q_"]').forEach(input => {
    const isValid = (input.type === 'radio' && input.checked) || 
                    (input.type === 'text' && input.value.trim());
    
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

  console.log('📦 Final answers:', answers);

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
    console.log('📥 Submit result:', data);
    
    if (data.ok) {
      showPage('resultPage');
      
      const msgEl = document.getElementById('resultMessage');
      const scoreEl = document.getElementById('scoreDisplay');
      
      if (msgEl) {
        msgEl.textContent = autoSubmit ? 
          'Hết giờ hoặc vi phạm! Đã tự động nộp.' : 
          'Nộp bài thành công!';
      }
      
      if (scoreEl) {
        if (data.score !== null && data.score !== undefined) {
          scoreEl.textContent = `${data.score}/10`;
          scoreEl.style.color = 'var(--success)';
        } else {
          scoreEl.textContent = 'Chờ chấm điểm';
          scoreEl.style.color = 'var(--warning)';
        }
      }
      
      if (violations > 0) {
        const resultContainer = document.querySelector('.result-container');
        const violationInfo = document.createElement('p');
        violationInfo.style.cssText = 'color:var(--danger);margin-top:16px;font-weight:600;';
        violationInfo.innerHTML = `⚠️ Số lần vi phạm: <strong>${violations}</strong>`;
        resultContainer.appendChild(violationInfo);
      }
    } else {
      alert('❌ Lỗi: ' + (data.error || 'Unknown'));
    }
  } catch (err) {
    console.error('❌ Submit error:', err);
    alert('❌ Lỗi nộp bài: ' + err.message);
  }
}

// ====================== EVENT HANDLERS ======================
function setupEventHandlers() {
  // Login Form
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.textContent = '';
      loginError.classList.remove('show');
      
      const pwd = document.getElementById('passwordInput').value.trim();
      if (!pwd) {
        loginError.textContent = 'Vui lòng nhập mật khẩu';
        loginError.classList.add('show');
        return;
      }
      
      const loginBtn = document.getElementById('loginBtn');
      const btnText = loginBtn?.querySelector('.btn-text');
      const btnLoader = loginBtn?.querySelector('.btn-loader');
      
      if (loginBtn) {
        loginBtn.disabled = true;
        if (btnText) btnText.style.display = 'none';
        if (btnLoader) btnLoader.style.display = 'block';
      }
      
      try {
        const result = await handleLogin(pwd);
        
        if (result.role === 'teacher') {
          showPage('teacherPage');
          await Promise.all([loadExamList(), loadSubmissions()]);
        } else if (result.role === 'student') {
          currentClassName = result.className;
          showPage('studentInfoPage');
          
          const classInput = document.getElementById('studentClass');
          if (classInput) classInput.value = result.className || '';
          
          // Restore saved data
          const savedName = localStorage.getItem('studentName');
          const savedDOB = localStorage.getItem('studentDOB');
          if (savedName) document.getElementById('studentName').value = savedName;
          if (savedDOB) document.getElementById('studentDOB').value = savedDOB;
          
          setupCustomDateInput();
          
          const exam = await loadLatestExamVariant();
          currentExamId = exam.id;
          
          const pwdGroup = document.getElementById('examPasswordGroup');
          if (pwdGroup) {
            pwdGroup.style.display = exam.password ? 'block' : 'none';
          }
        }
      } catch (err) {
        loginError.textContent = err.message;
        loginError.classList.add('show');
      } finally {
        if (loginBtn) {
          loginBtn.disabled = false;
          if (btnText) btnText.style.display = 'block';
          if (btnLoader) btnLoader.style.display = 'none';
        }
      }
    });
  }

  // Student Info Form
  const studentInfoForm = document.getElementById('studentInfoForm');
  const studentInfoError = document.getElementById('studentInfoError');
  
  if (studentInfoForm) {
    studentInfoForm.addEventListener('submit', async (e) => {
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
      
      const dobMatch = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!dobMatch) {
        studentInfoError.textContent = 'Định dạng ngày sinh không đúng (dd/mm/yyyy)';
        studentInfoError.classList.add('show');
        return;
      }
      
      const dobISO = `${dobMatch[3]}-${dobMatch[2]}-${dobMatch[1]}`;
      
      localStorage.setItem('studentName', name);
      localStorage.setItem('studentDOB', dob);
      
      currentStudentInfo = { name, dob: dobISO };
      
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
        
        const studentInfoEl = document.getElementById('studentInfo');
        if (studentInfoEl) {
          studentInfoEl.textContent = `${name} - ${currentClassName}`;
        }
        
        renderExam(exam);
        startExamTimer(exam.timeMinutes);
        setupViolationDetection();
      } catch (err) {
        studentInfoError.textContent = 'Lỗi: ' + err.message;
        studentInfoError.classList.add('show');
      }
    });
  }

  // Upload Form
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const fileInput = document.getElementById('examFile');
      if (!fileInput?.files[0]) {
        showMessage('uploadMessage', 'Vui lòng chọn file đề thi', true);
        return;
      }
      
      console.log('📤 Uploading exam...');
      
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
        console.log('📥 Upload result:', data);
        
        if (data.ok) {
          showMessage('uploadMessage', `✅ Upload thành công! ${data.count} câu`);
          uploadForm.reset();
          
          setTimeout(async () => {
            await Promise.all([loadExamList(), loadSubmissions()]);
          }, 500);
        } else {
          showMessage('uploadMessage', '❌ ' + (data.error || 'Lỗi upload'), true);
        }
      } catch (err) {
        console.error('❌ Upload error:', err);
        showMessage('uploadMessage', '❌ Lỗi: ' + err.message, true);
      }
    });
  }

  // Submit Button
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
  
  console.log('✅ Event handlers initialized');
}

// ====================== EXAM DETAIL MODAL (Placeholder) ======================
function openExamDetail(examId) {
  console.log('📖 Opening exam detail:', examId);
  // This function exists in original code - keeping as placeholder
  alert('Chi tiết đề thi sẽ được hiển thị ở đây');
}

function closeExamDetail() {
  const modal = document.getElementById('examDetailModal');
  if (modal) modal.style.display = 'none';
}

// ====================== INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Application initializing...');
  console.log('📦 Version: Enhanced v2.0');
  
  // Initialize features
  initDarkMode();
  setupYouTubeVideo();
  setupPasswordToggle();
  setupEventHandlers();
  
  // Show login page
  showPage('loginPage');
  
  console.log('✅ Application ready');
  console.log('🎨 Theme:', localStorage.getItem('theme') || 'light');
  console.log('🎬 Video ID:', CONFIG.YOUTUBE_VIDEO_ID);
});

// ====================== GLOBAL EXPORTS ======================
window.showPage = showPage;
window.showMessage = showMessage;
window.loadExamList = loadExamList;
window.loadSubmissions = loadSubmissions;
window.openExamDetail = openExamDetail;
window.closeExamDetail = closeExamDetail;

console.log('📝 main.js loaded successfully');
