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

// ====================== TEACHER ======================
async function loadExamList() {
  const res = await fetch('/exam/list');
  const data = await res.json();
  const listDiv = document.getElementById('examList');
  if (!listDiv) return;
  if (!data.ok || !data.exams || data.exams.length === 0) {
    listDiv.innerHTML = '<p class="empty-state">Chưa có đề thi nào</p>';
    return;
  }
  listDiv.innerHTML = '';
  data.exams.forEach(exam => {
    const count = (exam.questions?.length) ?? exam.questionCount ?? 0;
    const item = document.createElement('div');
    item.className = 'exam-item';
    item.innerHTML = `
      <span>${exam.originalName || exam.name || 'Đề không tên'} (${count} câu)</span>
      <button onclick="window.openExamDetail('${exam.id}')">Chi tiết</button>
    `;
    listDiv.appendChild(item);
  });
}

async function loadSubmissions() {
  const res = await fetch('/student/submissions');
  const data = await res.json();
  const listDiv = document.getElementById('submissionsList');
  if (!listDiv) return;
  if (!data.ok || !data.submissions || data.submissions.length === 0) {
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
        : '<span style="color: var(--warning);">Chưa chấm</span>'}
    `;
    listDiv.appendChild(item);
  });
}

async function openExamDetail(examId) {
  const res = await fetch(`/exam/${examId}`);
  const data = await res.json();
  if (!data.ok) return alert('Không tải được đề');
  const exam = data.exam;
  const modal = document.getElementById('examDetailModal');
  const content = document.getElementById('examDetailContent');
  content.innerHTML = `<h3>${exam.originalName}</h3>`;
  (exam.questions || []).forEach(q => {
    const div = document.createElement('div');
    div.className = 'question-block';
    div.innerHTML = `
      <h4>Câu ${q.displayIndex ?? q.id}</h4>
      <p>${q.question}</p>
      ${q.image ? `<img src="${q.image}" />` : ''}
      ${q.mathml ? `<div class="mathml">${q.mathml}</div>` : ''}
      <div id="options_${q.id}"></div>
      <input type="file" id="img_${q.id}" accept="image/*">
      <button onclick="window.attachImage('${exam.id}','${q.id}')">Đính kèm ảnh</button>
    `;
    content.appendChild(div);
  });
  modal.classList.add('active');
}

function closeExamDetail() {
  document.getElementById('examDetailModal')?.classList.remove('active');
}

// ====================== STUDENT ======================
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
    document.getElementById('timer').textContent = `${mins}:${secs}`;
  }, 1000);
}

function renderExam(exam) {
  const container = document.getElementById('questionsContainer');
  container.innerHTML = '';
  (exam.questions || []).forEach((q, index) => {
    const qDiv = document.createElement('div');
    qDiv.className = 'question-item';
    let optionsHtml = '';
    if (q.type === 'multiple_choice') {
      optionsHtml = q.options.map(opt => `
        <label><input type="radio" name="q_${q.id}" value="${opt.key}">${opt.key}. ${opt.text}</label>
      `).join('');
    } else if (q.type === 'true_false' && Array.isArray(q.subQuestions)) {
      optionsHtml = q.subQuestions.map(sub => `
        <div>${sub.key}) ${sub.text}
          <label><input type="radio" name="q_${q.id}_${sub.key}" value="Đúng">Đúng</label>
          <label><input type="radio" name="q_${q.id}_${sub.key}" value="Sai">Sai</label>
        </div>
      `).join('');
    } else if (q.type === 'short_answer') {
      optionsHtml = `<textarea name="q_${q.id}"></textarea>`;
    }
    qDiv.innerHTML = `<strong>Câu ${index+1}:</strong><p>${q.question}</p>${optionsHtml}`;
    container.appendChild(qDiv);
  });
}

async function submitExam(autoSubmit = false) {
  if (!autoSubmit && !confirm('Nộp bài?')) return;
  if (examTimer) clearInterval(examTimer);
  const answers = {};
  document.querySelectorAll('[name^="q_"]').forEach(input => {
    if ((input.type === 'radio' && input.checked) || input.tagName === 'TEXTAREA') {
      const nm = input.name;
      if (nm.match(/^q_\d+_\w+$/)) {
        const [_, qid, subKey] = nm.match(/^q_(\d+)_(\w+)$/);
        answers[qid] = answers[qid] || {};
        answers[qid][subKey] = input.value;
      } else {
        const qid = nm.replace('q_', '');
        answers[qid] = input.value;
      }
    }
  });
  const res = await fetch('/student/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: currentStudentInfo.name,
      className: currentClassName,
      dob: currentStudentInfo.dob,
      answers,
      examId: currentExamId,
      violations
    })
  });
  const data = await res.json();
  if (data.ok) {
    showPage('resultPage');
    document.getElementById('resultMessage').textContent = autoSubmit ? 'Hết giờ!' : 'Nộp bài thành công!';
    document.getElementById('scoreDisplay').textContent = data.score !== null ? `${data.score}/10` : 'Chờ chấm điểm';
  }
}

// ====================== EVENTS ======================
function setupEventHandlers() {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const pwd = document.getElementById('passwordInput').value
      if (!pwd) {
        document.getElementById('loginError').textContent = 'Nhập mật khẩu';
        return;
      }

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
          const exam = await loadLatestExamVariant();
          currentExamId = exam.id;
          const pwdGroup = document.getElementById('examPasswordGroup');
          if (pwdGroup) pwdGroup.style.display = exam.password ? 'block' : 'none';
        }
      } catch (err) {
        document.getElementById('loginError').textContent = err.message;
      }
    });
  }

  // Form thông tin học sinh
  const studentInfoForm = document.getElementById('studentInfoForm');
  if (studentInfoForm) {
    studentInfoForm.addEventListener('submit', async e => {
      e.preventDefault();
      const name = document.getElementById('studentName').value.trim();
      const dob = document.getElementById('studentDOB').value;
      if (!name || !dob) {
        document.getElementById('studentInfoError').textContent = 'Điền đầy đủ thông tin';
        return;
      }
      currentStudentInfo = { name, dob };
      try {
        const exam = await loadLatestExamVariant();
        currentExamId = exam.id;
        if (exam.password) {
          const examPassword = document.getElementById('studentExamPassword').value.trim();
          if (!examPassword) {
            document.getElementById('studentInfoError').textContent = 'Nhập mật khẩu đề thi';
            return;
          }
          const ok = await verifyExamPassword(exam.id, examPassword);
          if (!ok) {
            document.getElementById('studentInfoError').textContent = 'Mật khẩu đề sai';
            return;
          }
        }
        showPage('examPage');
        document.getElementById('studentInfo').textContent = `${name} - ${currentClassName}`;
        renderExam(exam);
        startExamTimer(exam.timeMinutes);
      } catch (err) {
        document.getElementById('studentInfoError').textContent = 'Lỗi: ' + err.message;
      }
    });
  }

  // Form upload đề (giáo viên)
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fileInput = document.getElementById('examFile');
      const timeInput = document.getElementById('timeMinutes');
      const passwordInput = document.getElementById('examPassword');
      const p1Q = document.getElementById('p1ShuffleQuestions')?.checked;
      const p1O = document.getElementById('p1ShuffleOptions')?.checked;
      const p2Q = document.getElementById('p2ShuffleQuestions')?.checked;
      const p2I = document.getElementById('p2ShuffleItems')?.checked;
      const p3Q = document.getElementById('p3ShuffleQuestions')?.checked;
      const variantCount = document.getElementById('variantCount')?.value || '1';
      if (!fileInput || !fileInput.files[0]) {
        showMessage('uploadMessage', 'Vui lòng chọn file đề thi', true);
        return;
      }
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      formData.append('timeMinutes', timeInput.value || '45');
      formData.append('password', passwordInput.value || '');
      formData.append('p1ShuffleQuestions', String(!!p1Q));
      formData.append('p1ShuffleOptions', String(!!p1O));
      formData.append('p2ShuffleQuestions', String(!!p2Q));
      formData.append('p2ShuffleItems', String(!!p2I));
      formData.append('p3ShuffleQuestions', String(!!p3Q));
      formData.append('variantCount', variantCount);
      try {
        const res = await fetch('/exam/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.ok) {
          showMessage('uploadMessage', `✅ Upload thành công! ${data.count} câu hỏi • ${data.variantCount} phiên bản`);
          uploadForm.reset();
          await loadExamList();
          await loadSubmissions();
        } else {
          showMessage('uploadMessage', '❌ ' + (data.error || 'Lỗi upload'), true);
        }
      } catch (err) {
        showMessage('uploadMessage', '❌ Lỗi kết nối: ' + err.message, true);
      }
    });
  }

  // Nút nộp bài
  document.getElementById('submitBtn')?.addEventListener('click', e => {
    e.preventDefault();
    submitExam(false);
  });

  // Logout / back
  document.getElementById('logoutTeacher')?.addEventListener('click', () => location.reload());
  document.getElementById('logoutStudent')?.addEventListener('click', () => location.reload());
  document.getElementById('backToHome')?.addEventListener('click', () => location.reload());

  // Modal close
  document.getElementById('closeModal')?.addEventListener('click', closeExamDetail);
}

// ====================== INIT ======================
document.addEventListener('DOMContentLoaded', () => {
  showPage('loginPage');
  setupEventHandlers();
});

// Expose for HTML onclick / global
window.openExamDetail = openExamDetail;
window.closeExamDetail = closeExamDetail;
window.loadExamList = loadExamList;
window.loadSubmissions = loadSubmissions;

// Đính kèm ảnh từng câu (giáo viên)
window.attachImage = async (examId, qid) => {
  const input = document.getElementById(`img_${qid}`);
  if (!input || !input.files[0]) return alert('Chọn ảnh');
  const fd = new FormData();
  fd.append('image', input.files[0]);
  const res = await fetch(`/exam-media/${examId}/questions/${qid}/image`, { method: 'POST', body: fd });
  const result = await res.json();
  if (result.ok) {
    alert('Đã cập nhật ảnh');
    const block = document.querySelector(`#options_${qid}`)?.parentNode;
    if (block) {
      const imgTag = document.createElement('img');
      imgTag.src = result.url;
      imgTag.style.maxWidth = '240px';
      block.insertAdjacentElement('afterbegin', imgTag);
    }
  } else {
    alert('Lỗi: ' + (result.error || 'Không cập nhật được ảnh'));
  }
};
