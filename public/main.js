// ====================== STATE ======================
let currentExamId = null;
let currentClassName = '';
let currentStudentInfo = { name: '', dob: '' };
let examTimer = null;
let examStartTime = null;
let violations = 0;
let questionKeyMapping = {};
window.currentExamData = null;

// ====================== DARK MODE HANDLER ======================
function initDarkMode() {
  const btn = document.getElementById('themeToggle');
  const icon = document.getElementById('themeIcon');
  const text = document.getElementById('themeText');
  if (!btn || !icon || !text) return;

  // Khởi tạo theo trạng thái lưu
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    icon.textContent = '🌙';
    text.textContent = 'Dark';
  } else {
    icon.textContent = '🌞';
    text.textContent = 'Light';
  }

  btn.onclick = () => {
    const isDark = document.body.classList.toggle('dark-mode');
    if (isDark) {
      icon.textContent = '🌙';
      text.textContent = 'Dark';
      localStorage.setItem('theme', 'dark');
    } else {
      icon.textContent = '🌞';
      text.textContent = 'Light';
      localStorage.setItem('theme', 'light');
    }
  };
}

// ====================== HELPERS ======================
function showPage(id) {
  ['loginPage','teacherPage','studentInfoPage','examPage','resultPage'].forEach(pid => {
    const el = document.getElementById(pid);
    if (el) el.style.display = (pid === id) ? '' : 'none';
    if (pid === 'loginPage') {
      el?.classList.toggle('active', pid === id);
    }
  });
}

function showMessage(elId, text, isError = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.className = isError ? 'error-message show' : 'message success';
  el.style.display = 'block';
}
// ====================== LOGIN HANDLER ======================
async function handleLogin(pwd) {
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pwd })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Sai mật khẩu');
  return { role: data.role, className: data.className || '' };
}

function setupEventHandlers() {
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      loginError.textContent = '';
      const pwd = document.getElementById('passwordInput')?.value.trim();
      if (!pwd) {
        loginError.textContent = 'Nhập mật khẩu';
        return;
      }
      const loginBtn = document.getElementById('loginBtn');
      if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = 'Đang xử lý...'; }
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
        }
      } catch (err) {
        loginError.textContent = err.message;
      } finally {
        if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Đăng nhập'; }
      }
    });
  }

  // Toggle password
  const togglePassword = document.getElementById('togglePassword');
  if (togglePassword) {
    togglePassword.addEventListener('click', () => {
      const input = document.getElementById('passwordInput');
      const icon = document.getElementById('eyeIcon');
      if (!input || !icon) return;
      if (input.type === 'password') {
        input.type = 'text';
        icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
      } else {
        input.type = 'password';
        icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
      }
    });
  }

  // Student info form
  const studentInfoForm = document.getElementById('studentInfoForm');
  const studentInfoError = document.getElementById('studentInfoError');
  if (studentInfoForm) {
    studentInfoForm.addEventListener('submit', async e => {
      e.preventDefault();
      studentInfoError.textContent = '';
      const name = document.getElementById('studentName').value.trim();
      const dob = document.getElementById('studentDOB').value;
      if (!name || !dob) {
        studentInfoError.textContent = 'Điền đầy đủ thông tin';
        return;
      }
      const dobMatch = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!dobMatch) {
        studentInfoError.textContent = 'Định dạng ngày sinh không đúng (dd/mm/yyyy)';
        return;
      }
      const dobISO = `${dobMatch[3]}-${dobMatch[2]}-${dobMatch[1]}`;
      currentStudentInfo = { name, dob: dobISO };
      try {
        const exam = await loadLatestExamVariant();
        currentExamId = exam.id;
        showPage('examPage');
        document.getElementById('studentInfo').textContent = `${name} - ${currentClassName}`;
        renderExam(exam);
        startExamTimer(exam.timeMinutes);
      } catch (err) {
        studentInfoError.textContent = 'Lỗi: ' + err.message;
      }
    });
  }
}
// ====================== RENDER EXAM ======================
function renderExam(exam) {
  const container = document.getElementById('questionsContainer');
  if (!container) return;
  container.innerHTML = '';
  questionKeyMapping = {};
  window.currentExamData = exam;

  (exam.questions || []).forEach((q, index) => {
    const displayIndex = index + 1;
    questionKeyMapping[displayIndex] = String(q.id);

    const qDiv = document.createElement('div');
    qDiv.className = 'question-item';

    let imageHtml = q.image ? `<img src="${q.image}" style="max-width:100%;border-radius:8px;margin:12px 0;"/>` : '';
    let optionsHtml = '';

    if (q.type === 'multiple_choice') {
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
    } else if (q.type === 'true_false' && Array.isArray(q.subQuestions)) {
      optionsHtml = `
        <div class="truefalse-block">
          ${q.subQuestions.map(sub => `
            <div class="sub-item">
              ${sub.key}) ${sub.text}
              <label><input type="radio" name="q_${displayIndex}_${sub.key}" value="Đúng"> Đúng</label>
              <label><input type="radio" name="q_${displayIndex}_${sub.key}" value="Sai"> Sai</label>
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
          <input class="cell" maxlength="1" name="q_${displayIndex}_1">
          <input class="cell" maxlength="1" name="q_${displayIndex}_2">
          <input class="cell" maxlength="1" name="q_${displayIndex}_3">
          <input class="cell" maxlength="1" name="q_${displayIndex}_4">
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

  setTimeout(() => { if (window.renderMath) window.renderMath(); }, 100);
}

// ====================== SUBMIT EXAM ======================
async function submitExam(autoSubmit = false) {
  if (!autoSubmit && !confirm('Nộp bài?')) return;

  const examEndTime = Date.now();
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
  if (window.currentExamData && window.currentExamData.questions) {
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
      if (msgEl) msgEl.textContent = autoSubmit ? 'Hết giờ hoặc vi phạm! Đã tự động nộp.' : 'Nộp bài thành công!';
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
        violationInfo.style.color = 'var(--danger)';
        violationInfo.style.marginTop = '12px';
        violationInfo.innerHTML = `⚠️ Số lần vi phạm: <strong>${violations}</strong>`;
        resultContainer.appendChild(violationInfo);
      }
    } else {
      alert('Lỗi: ' + (data.error || 'Unknown'));
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
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
      return;
    }
    listDiv.innerHTML = '';
    data.exams.forEach(exam => {
      const item = document.createElement('div');
      item.className = 'exam-item';
      item.innerHTML = `
        <span>${exam.originalName || 'Đề thi'} • ${exam.timeMinutes || 45} phút • ${exam.variantCount || 1} phiên bản</span>
        <button>Chi tiết</button>
      `;
      item.querySelector('button').onclick = () => openExamDetail(exam.id);
      listDiv.appendChild(item);
    });
  } catch (err) {
    listDiv.innerHTML = '<p class="empty-state">Lỗi kết nối server</p>';
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
  } catch (err) {
    listDiv.innerHTML = '<p class="empty-state">Lỗi kết nối server</p>';
  }
}
// ====================== HELPER: ADD EDIT BUTTON TO QUESTION ======================
function addEditButtonToQuestion(qDiv, examId, question) {
  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-secondary';
  editBtn.style.cssText = 'margin-top:12px; margin-left:8px; padding:6px 14px; font-size:13px;';
  editBtn.innerHTML = '✏️ Sửa nội dung câu hỏi';
  editBtn.onclick = () => {
    const newText = prompt('Nhập nội dung mới (dùng $...$ cho công thức):', question.question);
    if (newText === null) return;
    updateQuestionText(examId, question.id, newText);
  };
  qDiv.appendChild(editBtn);
}

// ====================== API: UPDATE QUESTION TEXT ======================
async function updateQuestionText(examId, qid, newText) {
  try {
    const res = await fetch(`/exam/${examId}/questions/${qid}/text`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText })
    });
    const result = await res.json();
    if (result.ok) {
      alert('✅ Đã cập nhật!');
      closeExamDetail();
      openExamDetail(examId);
    } else {
      alert('❌ Lỗi: ' + (result.error || 'Unknown'));
    }
  } catch (err) {
    alert('❌ Lỗi: ' + err.message);
  }
}

// ====================== IMAGE UPLOAD/DELETE FOR QUESTION ======================
async function attachImage(examId, qid, fileInput) {
  if (!fileInput?.files[0]) throw new Error('Chưa chọn ảnh');
  const fd = new FormData();
  fd.append('image', fileInput.files[0]);
  const res = await fetch(`/exam-media/${examId}/questions/${qid}/image`, { method: 'POST', body: fd });
  const result = await res.json();
  if (!result.ok) throw new Error(result.error || 'Không cập nhật được');
  return result;
}

async function deleteImage(examId, qid) {
  const res = await fetch(`/exam-media/${examId}/questions/${qid}/image`, { method: 'DELETE' });
  const result = await res.json();
  if (!result.ok) throw new Error(result.error || 'Không xóa được');
  return result;
}
// ====================== OPEN/CLOSE EXAM DETAIL ======================
async function openExamDetail(examId) {
  try {
    const res = await fetch(`/exam/${examId}`);
    const data = await res.json();
    if (!data.ok || !data.exam) {
      alert('❌ Lỗi: ' + (data.error || 'Không có dữ liệu đề thi'));
      return;
    }
    const exam = data.exam;
    const modal = document.getElementById('examDetailModal');
    const content = document.getElementById('examDetailContent');
    if (!modal || !content) return;

    content.innerHTML = `<h3>${exam.originalName || 'Đề thi'}</h3>`;
    const questions = exam.questions || [];
    if (questions.length === 0) {
      content.innerHTML += '<p class="empty-state">⚠️ Đề thi không có câu hỏi</p>';
      modal.style.display = 'block';
      return;
    }

    questions.forEach((q, index) => {
      const div = document.createElement('div');
      div.className = 'question-block';
      div.innerHTML = `
        <h4>Câu ${q.displayIndex || q.id || (index + 1)}</h4>
        <p>${q.question || q.text || '(Không có nội dung)'}</p>
        ${q.image ? `<img src="${q.image}" style="max-width:100%;border-radius:8px;margin:12px 0;"/>` : ''}
      `;

      const optsDiv = document.createElement('div');
      optsDiv.className = 'options';

      // Multiple choice
      if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
        const block = document.createElement('div');
        block.className = 'option-block';
        q.options.forEach(opt => {
          const optDiv = document.createElement('div');
          optDiv.className = 'option-item-wrapper';
          optDiv.innerHTML = `
            <label>
              <input type="radio" name="ans_${q.id}" value="${opt.key}" ${q.correctAnswer === opt.key ? 'checked' : ''}>
              ${opt.key}. <span class="option-text-${q.id}-${opt.key}">${opt.text || ''}</span>
            </label>
            ${opt.image ? `<img src="${opt.image}" style="max-width:200px;margin-top:8px;"/>` : ''}
          `;
          block.appendChild(optDiv);
        });
        optsDiv.appendChild(block);
      }

      div.appendChild(optsDiv);
      addEditButtonToQuestion(div, examId, q);
      content.appendChild(div);
    });

    modal.style.display = 'block';
    setupModalButtons(examId);
    setTimeout(() => { if (window.renderMath) window.renderMath(); }, 100);
  } catch (err) {
    alert('Lỗi tải chi tiết: ' + err.message);
  }
}

function closeExamDetail() {
  const modal = document.getElementById('examDetailModal');
  if (modal) modal.style.display = 'none';
}
// ====================== EDIT OPTION TEXT ======================
async function editOptionText(examId, qid, optionKey) {
  const currentText = document.querySelector(`.option-text-${qid}-${optionKey}`)?.textContent || '';
  const newText = prompt('Nhập nội dung mới cho đáp án:', currentText);
  if (newText === null) return;
  try {
    const res = await fetch(`/exam/${examId}/questions/${qid}/options/${optionKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText })
    });
    const result = await res.json();
    if (result.ok) {
      alert('✅ Đã cập nhật đáp án!');
      closeExamDetail();
      openExamDetail(examId);
    } else {
      alert('❌ Lỗi: ' + (result.error || 'Unknown'));
    }
  } catch (err) {
    alert('❌ Lỗi: ' + err.message);
  }
}

// ====================== EDIT SUBQUESTION TEXT ======================
async function editSubQuestionText(examId, qid, subKey) {
  const currentText = document.querySelector(`.subq-text-${qid}-${subKey}`)?.textContent || '';
  const newText = prompt('Nhập nội dung mới cho câu hỏi con:', currentText);
  if (newText === null) return;
  try {
    const res = await fetch(`/exam/${examId}/questions/${qid}/subquestions/${subKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText })
    });
    const result = await res.json();
    if (result.ok) {
      alert('✅ Đã cập nhật!');
      closeExamDetail();
      openExamDetail(examId);
    } else {
      alert('❌ Lỗi: ' + (result.error || 'Unknown'));
    }
  } catch (err) {
    alert('❌ Lỗi: ' + err.message);
  }
}

// ====================== IMAGE FOR OPTION ======================
async function attachImageToOption(examId, qid, optionKey, fileInput) {
  if (!fileInput?.files[0]) throw new Error('Chưa chọn ảnh');
  const fd = new FormData();
  fd.append('image', fileInput.files[0]);
  const res = await fetch(`/exam-media/${examId}/questions/${qid}/options/${optionKey}/image`, { method: 'POST', body: fd });
  const result = await res.json();
  if (!result.ok) throw new Error(result.error || 'Không cập nhật được');
  return result;
}

async function deleteImageFromOption(examId, qid, optionKey) {
  const res = await fetch(`/exam-media/${examId}/questions/${qid}/options/${optionKey}/image`, { method: 'DELETE' });
  const result = await res.json();
  if (!result.ok) throw new Error(result.error || 'Không xóa được');
  return result;
}
// ====================== MODAL ACTIONS ======================
function setupModalButtons(examId) {
  const saveBtn = document.getElementById('saveAnswers');
  const reportBtn = document.getElementById('sendReport');
  const deleteBtn = document.getElementById('deleteExam');

  if (saveBtn) {
    saveBtn.onclick = async () => {
      try {
        const answers = {};
        document.querySelectorAll("[name^='ans_']").forEach(input => {
          if (input.type === 'radio' && !input.checked) return;
          const nm = input.name;
          const val = input.value.trim();
          const matchMain = nm.match(/^ans_(\d+)$/);
          if (matchMain) answers[matchMain[1]] = val;
        });
        const res = await fetch(`/exam/${examId}/correct-answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers })
        });
        const result = await res.json();
        alert(result.ok ? '✅ Đã lưu đáp án!' : '❌ Lỗi: ' + (result.error || 'Unknown'));
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    };
  }

  if (reportBtn) {
    reportBtn.onclick = async () => {
      try {
        const className = prompt('Nhập tên lớp:');
        if (!className) return;
        const res = await fetch('/student/send-class-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ className, examId })
        });
        const result = await res.json();
        alert(result.message || (result.ok ? '✅ Đã gửi' : '❌ Lỗi'));
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    };
  }

  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      try {
        if (!confirm('Xóa đề này?')) return;
        const res = await fetch(`/exam/${examId}`, { method: 'DELETE' });
        const result = await res.json();
        alert(result.message || (result.ok ? '✅ Đã xóa' : '❌ Lỗi'));
        if (result.ok) {
          closeExamDetail();
          await loadExamList();
        }
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    };
  }
}

// ====================== EXAM HELPERS ======================
async function loadLatestExamVariant() {
  const res = await fetch('/exam/latest-variant');
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

function startExamTimer(timeMinutes) {
  examStartTime = Date.now();
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
    if (timerEl) timerEl.textContent = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  }, 1000);
}

// ====================== EVENT HANDLERS ======================
function setupEventHandlers() {
  // đã khai báo login/studentInfo ở Part 2
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fileInput = document.getElementById('examFile');
      const timeInput = document.getElementById('timeMinutes');
      const passwordInput = document.getElementById('examPassword');
      const variantCount = document.getElementById('variantCount')?.value || '1';
      if (!fileInput?.files[0]) {
        showMessage('uploadMessage', 'Chọn file đề thi', true);
        return;
      }
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      formData.append('timeMinutes', timeInput.value || '45');
      formData.append('password', passwordInput.value || '');
      formData.append('variantCount', variantCount);
      formData.append('p1Mode', document.getElementById('p1Mode')?.value || 'none');
      formData.append('p2Mode', document.getElementById('p2Mode')?.value || 'none');
      formData.append('p3Mode', document.getElementById('p3Mode')?.value || 'none');
      formData.append('useAI', document.getElementById('useAI')?.checked ? 'true' : 'false');
      try {
        const res = await fetch('/exam/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.ok) {
          showMessage('uploadMessage', `✅ Upload thành công! ${data.count} câu • ${data.variantCount} phiên bản`);
          uploadForm.reset();
          setTimeout(async () => {
            await loadExamList();
            await loadSubmissions();
          }, 500);
        } else {
          showMessage('uploadMessage', '❌ ' + (data.error || 'Lỗi upload'), true);
        }
      } catch (err) {
        showMessage('uploadMessage', '❌ Lỗi: ' + err.message, true);
      }
    });
  }

  document.getElementById('submitBtn')?.addEventListener('click', e => {
    e.preventDefault();
    submitExam(false);
  });
  document.getElementById('logoutTeacher')?.addEventListener('click', () => location.reload());
  document.getElementById('logoutStudent')?.addEventListener('click', () => location.reload());
  document.getElementById('backToHome')?.addEventListener('click', () => location.reload());
  document.getElementById('closeModal')?.addEventListener('click', closeExamDetail);
  window.onclick = (event) => {
    const modal = document.getElementById('examDetailModal');
    if (event.target === modal) closeExamDetail();
  };
}

// ====================== INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  showPage('loginPage');
  setupEventHandlers();
});

// ====================== GLOBAL EXPORTS ======================
window.openExamDetail = openExamDetail;
window.closeExamDetail = closeExamDetail;
window.loadExamList = loadExamList;
window.loadSubmissions = loadSubmissions;
window.attachImage = attachImage;
window.deleteImage = deleteImage;
window.editOptionText = editOptionText;
window.editSubQuestionText = editSubQuestionText;
window.attachImageToOption = attachImageToOption;
window.deleteImageFromOption = deleteImageFromOption;
