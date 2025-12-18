// ====================== STATE ======================
// public/main.js (thay hoàn toàn bằng bản này)
let currentExamId = null;
let currentClassName = null;
let currentStudentInfo = null;
let examTimer = null;
let violations = 0;

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

async function loadExamList() {
  try {
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
        <button type="button" class="btn" onclick="window.openExamDetail('${exam.id}')">Chi tiết</button>
      `;
      listDiv.appendChild(item);
    });
  } catch (err) {
    const listDiv = document.getElementById('examList');
    if (listDiv) listDiv.innerHTML = '<p class="error">Lỗi tải danh sách đề</p>';
  }
}

async function loadSubmissions() {
  try {
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
        <div style="color: var(--text-light); font-size: 13px; margin-top: 4px;">
          Lớp: ${sub.className} • ${sub.date}
        </div>
        ${sub.score !== 'Chưa chấm'
          ? `<span class="submission-score">${sub.score} điểm</span>`
          : '<span style="color: var(--warning);">Chưa chấm</span>'}
      `;
      listDiv.appendChild(item);
    });
  } catch {}
}

async function openExamDetail(examId) {
  try {
    const res = await fetch(`/exam/${examId}`);
    const data = await res.json();
    if (!data.ok) {
      alert('Không tải được đề');
      return;
    }
    const exam = data.exam;

    const modal = document.getElementById('examDetailModal');
    const content = document.getElementById('examDetailContent');

    content.innerHTML = `
      <p><strong>Tên đề:</strong> ${exam.originalName || exam.name || '—'}</p>
      <p><strong>Số câu hỏi:</strong> ${(exam.questions?.length) ?? 0}</p>
      <p><strong>Thời gian:</strong> ${exam.timeMinutes} phút</p>
      <p><strong>Mật khẩu đề:</strong> ${exam.password || 'Không có'}</p>
      <hr style="margin: 16px 0; border:none; border-top:1px solid var(--border);" />
      <p class="hint">Chọn đáp án đúng cho từng câu hỏi (xem/sửa đáp án đúng). Có thể đính kèm ảnh từng câu.</p>
    `;

    (exam.questions || []).forEach(q => {
      const div = document.createElement('div');
      div.className = 'question-block';

      const mathHtml = (typeof q.mathml === 'string' && q.mathml.trim().length)
        ? `<div class="mathml">${q.mathml}</div>` : '';

      div.innerHTML = `
        <h4>Câu ${q.displayIndex ?? q.id}</h4>
        <p>${q.question}</p>
        ${q.image ? `<img src="${q.image}" style="max-width:240px" />` : ''}
        ${mathHtml}
        ${q.latex ? `<div class="latex">\\(${q.latex}\\)</div>` : ''}
        <div id="options_${q.id}" class="options"></div>
        <div class="attach" style="margin-top:8px">
          <input type="file" id="img_${q.id}" accept="image/*">
          <button type="button" class="btn btn-secondary" onclick="window.attachImage('${exam.id}','${q.id}')">Đính kèm ảnh</button>
        </div>
      `;
      content.appendChild(div);

      const optsDiv = div.querySelector(`#options_${q.id}`);
      if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
        q.options.forEach(opt => {
          const optEl = document.createElement('label');
          optEl.className = 'option';
          optEl.innerHTML = `
            <input type="radio" name="ans_${q.id}" value="${opt.key}" ${q.correctAnswer === opt.key ? 'checked' : ''}>
            ${opt.key}. ${opt.text}
          `;
          optsDiv.appendChild(optEl);
        });
      } else if (q.type === 'true_false' && Array.isArray(q.subQuestions)) {
        q.subQuestions.forEach(sub => {
          const optEl = document.createElement('div');
          optEl.className = 'option';
          optEl.innerHTML = `
            <span><strong>${sub.key})</strong> ${sub.text}</span>
            <div style="margin-left:auto;display:flex;gap:12px">
              <label><input type="radio" name="ans_${q.id}_${sub.key}" value="Đúng"> Đúng</label>
              <label><input type="radio" name="ans_${q.id}_${sub.key}" value="Sai"> Sai</label>
            </div>
          `;
          optsDiv.appendChild(optEl);
        });
      } else if (q.type === 'short_answer') {
        const ta = document.createElement('textarea');
        ta.rows = 2;
        ta.name = `ans_${q.id}`;
        ta.value = q.correctAnswer || '';
        ta.style.cssText = 'width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;';
        optsDiv.appendChild(ta);
      }
    });

    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise();
    }

    modal.classList.add('active');

    document.getElementById('saveAnswers')?.addEventListener('click', async () => {
      try {
        const answers = {};
        // multiple/short_answer
        document.querySelectorAll('[name^="ans_"]').forEach(input => {
          const nm = input.name;
          if (nm.match(/^ans_\d+$/)) {
            if ((input.type === 'radio' && input.checked) || input.tagName === 'TEXTAREA') {
              const qid = nm.replace('ans_', '');
              answers[qid] = input.value;
            }
          }
        });
        // true_false nhóm a,b,c,d
        (exam.questions || []).forEach(q => {
          if (q.type === 'true_false' && Array.isArray(q.subQuestions)) {
            const obj = {};
            q.subQuestions.forEach(sub => {
              const checked = document.querySelector(`input[name="ans_${q.id}_${sub.key}"]:checked`);
              if (checked) obj[sub.key] = checked.value;
            });
            answers[q.id] = obj;
          }
        });

        const resSave = await fetch(`/exam/${exam.id}/correct-answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers })
        });
        const result = await resSave.json();
        alert(result.message || (result.ok ? 'Đã lưu đáp án' : 'Lỗi lưu đáp án'));
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    });

    document.getElementById('sendReport')?.addEventListener('click', async () => {
      const className = prompt('Nhập tên lớp:');
      if (!className) return;
      try {
        const resR = await fetch('/student/send-class-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ className, examId: exam.id })
        });
        const result = await resR.json();
        alert(result.message || (result.ok ? 'Đã gửi' : 'Lỗi'));
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    });

    document.getElementById('deleteExam')?.addEventListener('click', async () => {
      if (!confirm('Xóa đề này?')) return;
      try {
        const resDel = await fetch(`/exam/${exam.id}`, { method: 'DELETE' });
        const result = await resDel.json();
        alert(result.message || (result.ok ? 'Đã xóa' : 'Lỗi'));
        if (result.ok) {
          closeExamDetail();
          await loadExamList();
        }
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    });
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

function closeExamDetail() {
  document.getElementById('examDetailModal')?.classList.remove('active');
}

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
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    const warningEl = document.getElementById('warningMessage');
    if (!warningEl) return;
    if (remaining <= 60) warningEl.textContent = '⚠️ Còn 1 phút!';
    else if (remaining <= 300) warningEl.textContent = '⏰ Còn 5 phút';
    else warningEl.textContent = '';
  }, 1000);
}

function renderExam(exam) {
  const container = document.getElementById('questionsContainer');
  if (!container) return;
  container.innerHTML = '';
  (exam.questions || []).forEach((q, index) => {
    const qDiv = document.createElement('div');
    qDiv.className = 'question-item';

    let optionsHtml = '';
    if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
      optionsHtml = '<div class="options">';
      q.options.forEach(opt => {
        optionsHtml += `
          <label class="option">
            <input type="radio" name="q_${q.id}" value="${opt.key}">
            ${opt.key}. ${opt.text}
          </label>
        `;
      });
      optionsHtml += '</div>';
    } else if (q.type === 'true_false') {
      // phần 2: nếu là nhóm a,b,c,d trong exam upload thì khi render học sinh sẽ nhận câu đơn
      // để đơn giản hiện mỗi subQuestion như một dòng lựa chọn riêng:
      if (Array.isArray(q.subQuestions) && q.subQuestions.length) {
        optionsHtml = '<div class="options">';
        q.subQuestions.forEach(sub => {
          optionsHtml += `
            <div class="option">
              <span><strong>${sub.key})</strong> ${sub.text}</span>
              <div style="margin-left:auto;display:flex;gap:12px">
                <label><input type="radio" name="q_${q.id}_${sub.key}" value="Đúng"> Đúng</label>
                <label><input type="radio" name="q_${q.id}_${sub.key}" value="Sai"> Sai</label>
              </div>
            </div>
          `;
        });
        optionsHtml += '</div>';
      } else {
        optionsHtml = `
          <div class="options">
            <label class="option">
              <input type="radio" name="q_${q.id}" value="Đúng"> Đúng
            </label>
            <label class="option">
              <input type="radio" name="q_${q.id}" value="Sai"> Sai
            </label>
          </div>
        `;
      }
    } else if (q.type === 'short_answer') {
      optionsHtml = `
        <textarea name="q_${q.id}" rows="2" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;"></textarea>
      `;
    }

    const mathHtml = (typeof q.mathml === 'string' && q.mathml.trim().length)
      ? `<div class="mathml">${q.mathml}</div>` : '';

    qDiv.innerHTML = `
      <strong>Câu ${index + 1}:</strong>
      <p>${q.question}</p>
      ${q.image ? `<img src="${q.image}" style="max-width:100%;margin:12px 0;" />` : ''}
      ${mathHtml}
      ${q.latex ? `<div class="latex">\\(${q.latex}\\)</div>` : ''}
      ${optionsHtml}
    `;
    container.appendChild(qDiv);
  });

  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise();
  }
}

async function submitExam(autoSubmit = false) {
  if (!autoSubmit && !confirm('Nộp bài?')) return;
  if (examTimer) clearInterval(examTimer);

  const answers = {};
  // multiple/short_answer/true_false đơn
  document.querySelectorAll('[name^="q_"]').forEach(input => {
    if ((input.type === 'radio' && input.checked) || input.tagName === 'TEXTAREA') {
      const nm = input.name;
      // nhóm đúng/sai có dạng q_<id>_<key>
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
        violations
      })
    });
    const data = await res.json();
    if (data.ok) {
      showPage('resultPage');
      const msgEl = document.getElementById('resultMessage');
      const scoreEl = document.getElementById('scoreDisplay');
      if (msgEl) msgEl.textContent = autoSubmit ? 'Hết giờ! Đã tự động nộp.' : 'Nộp bài thành công!';
      if (scoreEl) {
        if (data.score !== null && data.score !== undefined) {
          scoreEl.textContent = `${data.score}/10`;
          scoreEl.style.color = 'var(--success)';
        } else {
          scoreEl.textContent = 'Chờ chấm điểm';
          scoreEl.style.color = 'var(--warning)';
        }
      }
    } else {
      alert('Lỗi: ' + (data.error || 'Unknown'));
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

function setupEventHandlers() {
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
      if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang xử lý...';
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
          const classInput = document.getElementById('studentClass');
          if (classInput) classInput.value = result.className || '';
          const exam = await loadLatestExam();
          currentExamId = exam.id;
          const pwdGroup = document.getElementById('examPasswordGroup');
          if (pwdGroup) pwdGroup.style.display = exam.password ? 'block' : 'none';
        }
      } catch (err) {
        loginError.textContent = err.message;
        loginError.classList.add('show');
      } finally {
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.textContent = 'Đăng nhập';
        }
      }
    });
  }

  document.getElementById('togglePassword')?.addEventListener('click', () => {
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

  const studentInfoForm = document.getElementById('studentInfoForm');
  const studentInfoError = document.getElementById('studentInfoError');
  if (studentInfoForm) {
    studentInfoForm.addEventListener('submit', async e => {
      e.preventDefault();
      if (studentInfoError) {
        studentInfoError.textContent = '';
        studentInfoError.classList.remove('show');
      }

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
        const infoEl = document.getElementById('studentInfo');
        if (infoEl) infoEl.textContent = `${name} - ${currentClassName}`;
        renderExam(exam);
        startExamTimer(exam.timeMinutes);
      } catch (err) {
        studentInfoError.textContent = 'Lỗi: ' + err.message;
        studentInfoError.classList.add('show');
      }
    });
  }

// ... giữ nguyên các hàm và sự kiện khác

// Upload form (teacher) — cập nhật gửi tuỳ chọn trộn
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

    const uploadBtn = document.getElementById('uploadBtn');

    if (!fileInput || !fileInput.files[0]) {
      showMessage('uploadMessage', 'Vui lòng chọn file đề thi', true);
      return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('timeMinutes', (timeInput?.value) || '45');
    formData.append('password', (passwordInput?.value) || '');

    // Tuỳ chọn trộn
    formData.append('p1ShuffleQuestions', String(!!p1Q));
    formData.append('p1ShuffleOptions', String(!!p1O));
    formData.append('p2ShuffleQuestions', String(!!p2Q));
    formData.append('p2ShuffleItems', String(!!p2I));
    formData.append('p3ShuffleQuestions', String(!!p3Q));
    formData.append('variantCount', variantCount);

    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = '⏳ Đang xử lý...';
    }

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
    } finally {
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📤 Upload Đề';
      }
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
  const examDetailModal = document.getElementById('examDetailModal');
  if (examDetailModal) {
    examDetailModal.addEventListener('click', (e) => {
      if (e.target === examDetailModal) closeExamDetail();
    });
  }
}

// Đính kèm ảnh từng câu (giáo viên)
window.attachImage = async (examId, qid) => {
  try {
    const input = document.getElementById(`img_${qid}`);
    if (!input || !input.files[0]) return alert('Chọn ảnh');
    const fd = new FormData();
    fd.append('image', input.files[0]);
    const res = await fetch(`/exam-media/${examId}/questions/${qid}/image`, { method: 'POST', body: fd });
    const result = await res.json();
    if (result.ok) {
      alert('Đã cập nhật ảnh');
      // thêm ảnh hiển thị ngay
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
  } catch (e) {
    alert('Lỗi: ' + e.message);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  showPage('loginPage');
  setupEventHandlers();
});

// Expose
window.openExamDetail = openExamDetail;
window.closeExamDetail = closeExamDetail;
window.loadExamList = loadExamList;
window.loadSubmissions = loadSubmissions;
