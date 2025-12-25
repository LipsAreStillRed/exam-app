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

// FIX #1: Load exam list với xử lý variants an toàn hơn
async function loadExamList() {
  const listDiv = document.getElementById('examList');
  if (!listDiv) return;
  listDiv.innerHTML = '<p class="empty-state">Đang tải...</p>';

  try {
    const res = await fetch('/exam/list');
    const data = await res.json();

    if (!data.ok || !data.exams || !data.exams.length) {
      listDiv.innerHTML = '<p class="empty-state">Chưa có đề thi nào</p>';
      return;
    }

    listDiv.innerHTML = '';
    
    data.exams.forEach(exam => {
      const count = exam.questions?.length ?? exam.questionCount ?? 0;
      
      const examGroup = document.createElement('div');
      examGroup.style.marginBottom = '20px';
      
      // Đề gốc
      const mainItem = document.createElement('div');
      mainItem.className = 'exam-item';
      mainItem.style.borderLeft = '4px solid var(--primary)';
      mainItem.innerHTML = `
        <span><strong>📚 ${exam.originalName || exam.name || 'Đề không tên'}</strong> (${count} câu)</span>
        <button type="button" class="btn btn-primary">Chi tiết</button>
      `;
      mainItem.querySelector('button').onclick = () => openExamDetail(exam.id);
      examGroup.appendChild(mainItem);
      
      // FIX: Kiểm tra variants tồn tại và là array
      if (Array.isArray(exam.variants) && exam.variants.length > 0) {
        const variantsList = document.createElement('div');
        variantsList.className = 'variants-list';
        variantsList.style.marginLeft = '30px';
        variantsList.style.marginTop = '8px';
        
        exam.variants.forEach((variant, idx) => {
          // FIX: Kiểm tra variant có id hợp lệ
          if (!variant || !variant.id) {
            console.warn('Variant không có id:', variant);
            return;
          }
          
          const variantItem = document.createElement('div');
          variantItem.className = 'exam-item variant-item';
          variantItem.style.borderLeft = '4px solid var(--success)';
          variantItem.style.background = '#f8f9fa';
          variantItem.innerHTML = `
            <span>🔀 Mã đề ${idx + 1} (${variant.questions?.length || count} câu)</span>
            <button type="button" class="btn btn-secondary">Chi tiết</button>
          `;
          variantItem.querySelector('button').onclick = () => openExamDetail(exam.id);
          variantsList.appendChild(variantItem);
        });
        
        examGroup.appendChild(variantsList);
      }
      
      listDiv.appendChild(examGroup);
    });
  } catch (err) {
    console.error('loadExamList error:', err);
    listDiv.innerHTML = '<p class="empty-state">Lỗi kết nối server</p>';
  }
}

async function loadSubmissions() {
  const listDiv = document.getElementById('submissionsList');
  if (!listDiv) return;
  listDiv.innerHTML = '<p class="empty-state">Đang tải...</p>';

  try {
    const res = await fetch('/student/submissions');
    const data = await res.json();

    if (!data.ok || !data.submissions || !data.submissions.length) {
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
  } catch (err) {
    console.error('loadSubmissions error:', err);
    listDiv.innerHTML = '<p class="empty-state">Lỗi kết nối server</p>';
  }
}

// Mở modal chi tiết đề
async function openExamDetail(examId) {
  try {
    const res = await fetch(`/exam/${examId}`);
    const data = await res.json();
    
    if (!data.ok) {
      alert('Không tải được đề: ' + (data.error || 'Unknown error'));
      return;
    }

    const exam = data.exam;
    if (!exam) {
      alert('Dữ liệu đề thi không hợp lệ');
      return;
    }

    const modal = document.getElementById('examDetailModal');
    const content = document.getElementById('examDetailContent');
    
    content.innerHTML = `<h3>${exam.originalName || exam.name || 'Đề thi'}</h3>`;

    const questions = exam.questions || [];
    if (questions.length === 0) {
      content.innerHTML += '<p class="empty-state">Đề thi không có câu hỏi</p>';
      modal.style.display = 'block';
      return;
    }

    questions.forEach(q => {
      const div = document.createElement('div');
      div.className = 'question-block';
      div.innerHTML = `
        <h4>Câu ${q.displayIndex ?? q.id}</h4>
        <p>${q.question || q.text || ''}</p>
        ${q.image ? `<img src="${q.image}" style="max-width:100%;border-radius:8px;" />` : ''}
        ${q.mathml ? `<div class="mathml">${q.mathml}</div>` : ''}
      `;

      const optsDiv = document.createElement('div');
      optsDiv.className = 'options';

      // Multiple choice
      if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
        const block = document.createElement('div');
        block.className = 'option-block';
        q.options.forEach(opt => {
          const optEl = document.createElement('label');
          optEl.innerHTML = `
            <input type="radio" name="ans_${q.id}" value="${opt.key}" ${q.correctAnswer === opt.key ? 'checked' : ''}>
            ${opt.key}. ${opt.text}
          `;
          block.appendChild(optEl);
        });
        optsDiv.appendChild(block);
      }
      // True/False với sub-questions
      else if (q.type === 'true_false' && Array.isArray(q.subQuestions)) {
        const block = document.createElement('div');
        block.className = 'truefalse-block';
        q.subQuestions.forEach(sub => {
          const row = document.createElement('div');
          row.className = 'sub-item';
          const current = q.correctAnswer && q.correctAnswer[sub.key];
          row.innerHTML = `
            ${sub.key}) ${sub.text}
            <label><input type="radio" name="ans_${q.id}_${sub.key}" value="Đúng" ${current === 'Đúng' ? 'checked' : ''}> Đúng</label>
            <label><input type="radio" name="ans_${q.id}_${sub.key}" value="Sai" ${current === 'Sai' ? 'checked' : ''}> Sai</label>
          `;
          block.appendChild(row);
        });
        optsDiv.appendChild(block);
      }
      // True/False đơn
      else if (q.type === 'true_false') {
        const block = document.createElement('div');
        block.className = 'truefalse-block';
        ['Đúng','Sai'].forEach(val => {
          const optEl = document.createElement('label');
          optEl.innerHTML = `
            <input type="radio" name="ans_${q.id}" value="${val}" ${q.correctAnswer === val ? 'checked' : ''}>
            ${val}
          `;
          block.appendChild(optEl);
        });
        optsDiv.appendChild(block);
      }
      // Short answer
      else if (q.type === 'short_answer') {
        const form = document.createElement('div');
        form.className = 'short-form';
        const currentAnswer = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
        for (let i = 1; i <= 4; i++) {
          const inp = document.createElement('input');
          inp.className = `cell cell-${i}`;
          inp.maxLength = 1;
          inp.name = `ans_${q.id}_${i}`;
          inp.value = currentAnswer[i-1] || '';
          form.appendChild(inp);
        }
        optsDiv.appendChild(form);
      }

      div.appendChild(optsDiv);
      
      // Upload image
      const uploadDiv = document.createElement('div');
      uploadDiv.style.marginTop = '12px';
      uploadDiv.innerHTML = `
        <input type="file" id="img_${q.id}" accept="image/*" style="font-size:12px;">
        <button class="btn btn-secondary" style="margin-left:8px;padding:4px 12px;font-size:13px;">Đính kèm ảnh</button>
      `;
      uploadDiv.querySelector('button').onclick = () => attachImage(examId, q.id);
      div.appendChild(uploadDiv);
      
      content.appendChild(div);
    });

    modal.style.display = 'block';
    setupModalButtons(examId);
    
  } catch (err) {
    console.error('openExamDetail error:', err);
    alert('Có lỗi khi tải chi tiết đề: ' + err.message);
  }
}

// FIX #2: Cải thiện lưu đáp án với validation và logging
function setupModalButtons(examId) {
  // Lưu đáp án
  document.getElementById('saveAnswers').onclick = async () => {
    try {
      const answers = {};
      
      // Thu thập tất cả input
      document.querySelectorAll("[name^='ans_']").forEach(input => {
        const name = input.name;
        const value = input.value.trim();
        
        // Bỏ qua radio button không được chọn
        if (input.type === 'radio' && !input.checked) return;
        
        // Xử lý True/False nhiều ý: ans_<qid>_<subKey>
        const matchSub = name.match(/^ans_(\d+)_(\w+)$/);
        if (matchSub && input.type === 'radio') {
          const qid = matchSub[1];
          const subKey = matchSub[2];
          if (!answers[qid]) answers[qid] = {};
          answers[qid][subKey] = value;
          return;
        }
        
        // Xử lý Short Answer: ans_<qid>_<1-4>
        const matchShort = name.match(/^ans_(\d+)_(\d)$/);
        if (matchShort && input.type !== 'radio') {
          const qid = matchShort[1];
          const idx = parseInt(matchShort[2]) - 1;
          if (!answers[qid]) answers[qid] = ['', '', '', ''];
          if (Array.isArray(answers[qid])) {
            answers[qid][idx] = value;
          }
          return;
        }
        
        // Xử lý Multiple Choice và True/False đơn: ans_<qid>
        const matchMain = name.match(/^ans_(\d+)$/);
        if (matchMain && input.type === 'radio') {
          const qid = matchMain[1];
          answers[qid] = value;
        }
      });
      
      console.log('📤 Gửi đáp án:', answers);
      
      if (Object.keys(answers).length === 0) {
        alert('⚠️ Chưa chọn đáp án nào!');
        return;
      }
      
      const res = await fetch(`/exam/${examId}/correct-answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
      });
      
      const result = await res.json();
      console.log('📥 Kết quả lưu:', result);
      
      if (result.ok) {
        alert('✅ Đã lưu đáp án thành công!');
      } else {
        alert('❌ Lỗi: ' + (result.error || result.message || 'Không lưu được'));
      }
    } catch (err) {
      console.error('❌ Lỗi khi lưu đáp án:', err);
      alert('Lỗi kết nối: ' + err.message);
    }
  };

  // Gửi báo cáo
  document.getElementById('sendReport').onclick = async () => {
    try {
      const className = prompt('Nhập tên lớp cần gửi báo cáo:');
      if (!className) return;
      const res = await fetch('/student/send-class-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className, examId })
      });
      const result = await res.json();
      alert(result.message || (result.ok ? '✅ Đã gửi báo cáo' : '❌ Lỗi gửi báo cáo'));
    } catch (err) {
      alert('Lỗi kết nối khi gửi báo cáo: ' + err.message);
    }
  };

  // Xóa đề
  document.getElementById('deleteExam').onclick = async () => {
    try {
      if (!confirm('Bạn có chắc muốn xóa đề này?')) return;
      const res = await fetch(`/exam/${examId}`, { method: 'DELETE' });
      const result = await res.json();
      alert(result.message || (result.ok ? '✅ Đã xóa đề' : '❌ Lỗi xóa đề'));
      if (result.ok) {
        closeExamDetail();
        await loadExamList();
      }
    } catch (err) {
      alert('Lỗi kết nối khi xóa đề: ' + err.message);
    }
  };
}

function closeExamDetail() {
  const modal = document.getElementById('examDetailModal');
  if (modal) modal.style.display = 'none';
}

async function attachImage(examId, qid) {
  const input = document.getElementById(`img_${qid}`);
  if (!input || !input.files[0]) return alert('Chọn ảnh');
  const fd = new FormData();
  fd.append('image', input.files[0]);
  try {
    const res = await fetch(`/exam-media/${examId}/questions/${qid}/image`, { method: 'POST', body: fd });
    const result = await res.json();
    if (result.ok) {
      alert('✅ Đã cập nhật ảnh');
      const block = document.querySelector(`#img_${qid}`)?.parentNode?.parentNode;
      if (block) {
        const existingImg = block.querySelector('img');
        if (existingImg) existingImg.remove();
        const imgTag = document.createElement('img');
        imgTag.src = result.url;
        imgTag.style.maxWidth = '100%';
        imgTag.style.borderRadius = '8px';
        imgTag.style.marginTop = '8px';
        block.insertBefore(imgTag, block.querySelector('.options'));
      }
    } else {
      alert('❌ Lỗi: ' + (result.error || 'Không cập nhật được ảnh'));
    }
  } catch (err) {
    alert('❌ Lỗi kết nối: ' + err.message);
  }
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
    document.getElementById('timer').textContent = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
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
      const letters = ['A','B','C','D'];
      const options = (q.options || []).map((opt, idx) => ({
        key: letters[idx],
        text: opt.text
      }));
      optionsHtml = `
        <div class="option-block">
          ${options.map(opt => `
            <label>
              <input type="radio" name="q_${q.id}" value="${opt.key}">
              ${opt.key}. ${opt.text}
            </label>
          `).join('')}
        </div>
      `;
    }
    else if (q.type === 'true_false' && Array.isArray(q.subQuestions)) {
      optionsHtml = `
        <div class="truefalse-block">
          ${q.subQuestions.map(sub => `
            <div class="sub-item">
              ${sub.key}) ${sub.text}
              <label><input type="radio" name="q_${q.id}_${sub.key}" value="Đúng"> Đúng</label>
              <label><input type="radio" name="q_${q.id}_${sub.key}" value="Sai"> Sai</label>
            </div>
          `).join('')}
        </div>
      `;
    }
    else if (q.type === 'true_false') {
      optionsHtml = `
        <div class="truefalse-block">
          <label><input type="radio" name="q_${q.id}" value="Đúng"> Đúng</label>
          <label><input type="radio" name="q_${q.id}" value="Sai"> Sai</label>
        </div>
      `;
    }
    else if (q.type === 'short_answer') {
      optionsHtml = `
        <div class="short-form">
          <input class="cell cell-1" maxlength="1" name="q_${q.id}_1">
          <input class="cell cell-2" maxlength="1" name="q_${q.id}_2">
          <input class="cell cell-3" maxlength="1" name="q_${q.id}_3">
          <input class="cell cell-4" maxlength="1" name="q_${q.id}_4">
        </div>
      `;
    }
    qDiv.innerHTML = `<strong>Câu ${index+1}:</strong><p>${q.question}</p>${optionsHtml}`;
    container.appendChild(qDiv);
  });
}

// FIX #3: Cải thiện submit với logging để debug
async function submitExam(autoSubmit = false) {
  if (!autoSubmit && !confirm('Nộp bài?')) return;
  if (examTimer) clearInterval(examTimer);

  const answers = {};
  document.querySelectorAll('[name^="q_"]').forEach(input => {
    if ((input.type === 'radio' && input.checked) || input.tagName === 'INPUT') {
      const nm = input.name;
      const val = input.value.trim();

      const matchSub = nm.match(/^q_(\d+)_(\w+)$/);
      if (matchSub) {
        const qid = matchSub[1];
        const subKey = matchSub[2];
        answers[qid] = answers[qid] || {};
        answers[qid][subKey] = val;
      } else {
        const matchShort = nm.match(/^q_(\d+)_(\d)$/);
        if (matchShort) {
          const qid = matchShort[1];
          const idx = matchShort[2];
          answers[qid] = answers[qid] || [];
          answers[qid][idx - 1] = val;
        } else {
          const qid = nm.replace('q_', '');
          answers[qid] = val;
        }
      }
    }
  });

  console.log('📤 Học sinh nộp bài:', {
    examId: currentExamId,
    answers,
    student: currentStudentInfo
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
    
    console.log('📥 Kết quả chấm:', data);
    
    if (data.ok) {
      showPage('resultPage');
      const msgEl = document.getElementById('resultMessage');
      const scoreEl = document.getElementById('scoreDisplay');
      if (msgEl) {
        msgEl.textContent = autoSubmit ? 'Hết giờ! Đã tự động nộp.' : 'Nộp bài thành công!';
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
      if (data.driveLink) {
        const driveLinkEl = document.createElement('p');
        driveLinkEl.innerHTML = `Xem bài nộp trên Drive: <a href="${data.driveLink}" target="_blank">Mở file XML</a>`;
        document.getElementById('resultPage').appendChild(driveLinkEl);
      }
    } else {
      alert('Lỗi: ' + (data.error || 'Unknown'));
    }
  } catch (err) {
    console.error('❌ Lỗi nộp bài:', err);
    alert('Lỗi: ' + err.message);
  }
}

// ====================== EVENT HANDLERS ======================
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
          document.getElementById('studentClass').value = result.className || '';
          const exam = await loadLatestExamVariant();
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

  const studentInfoForm = document.getElementById('studentInfoForm');
  const studentInfoError = document.getElementById('studentInfoError');
  if (studentInfoForm) {
    studentInfoForm.addEventListener('submit', async e => {
      e.preventDefault();
      studentInfoError.textContent = '';
      studentInfoError.classList.remove('show');

      const name = document.getElementById('studentName').value.trim();
      const dob = document.getElementById('studentDOB').value;
      if (!name || !dob) {
        studentInfoError.textContent = 'Điền đầy đủ thông tin';
        studentInfoError.classList.add('show');
        return;
      }

      currentStudentInfo = { name, dob };

      try {
        const exam = await loadLatestExamVariant();
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
  }

  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async e => {
      e.preventDefault();

      const fileInput = document.getElementById('examFile');
      const timeInput = document.getElementById('timeMinutes');
      const passwordInput = document.getElementById('examPassword');
      const variantCount = document.getElementById('variantCount')?.value || '1';

      if (!fileInput || !fileInput.files[0]) {
        showMessage('uploadMessage', 'Vui lòng chọn file đề thi', true);
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

      try {
        const res = await fetch('/exam/upload', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.ok) {
          showMessage(
            'uploadMessage',
            `✅ Upload thành công! ${data.count} câu hỏi • ${data.variantCount} phiên bản`
          );
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
    if (event.target === modal) {
      closeExamDetail();
    }
  };
}

// ====================== INIT ======================
document.addEventListener('DOMContentLoaded', () => {
  showPage('loginPage');
  setupEventHandlers();
});

window.openExamDetail = openExamDetail;
window.closeExamDetail = closeExamDetail;
window.loadExamList = loadExamList;
window.loadSubmissions = loadSubmissions;
window.attachImage = attachImage;
