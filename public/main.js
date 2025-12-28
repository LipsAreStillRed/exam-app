// ====================== STATE ======================
let currentExamId = null;
let currentClassName = null;
let currentStudentInfo = null;
let examTimer = null;
let violations = 0;
let visibilityCheckEnabled = false;
let questionKeyMapping = {}; // { displayIndex: originalQuestionId }

// ====================== HELPERS ======================
function showPage(id) {
  console.log(`🔄 Showing page: ${id}`);
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

// ====================== VIOLATION DETECTION (ĐÃ FIX - TRÁNH DOUBLE TRIGGER) ======================

let lastActivityTime = Date.now();
let lastViolationTime = 0; // ✅ Thêm biến chống spam
const VIOLATION_COOLDOWN = 2000; // 2 giây cooldown giữa các vi phạm

function setupViolationDetection() {
  if (visibilityCheckEnabled) return;
  visibilityCheckEnabled = true;
  violations = 0;

  // ✅ Đợi 5 giây sau khi vào trang mới bật giám sát
  setTimeout(() => {
    // 1. Phát hiện chuyển tab
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 2. Track hoạt động
    document.addEventListener('mousemove', updateActivity);
    document.addEventListener('keypress', updateActivity);
    document.addEventListener('click', updateActivity);
    
    console.log('✅ Bật phát hiện vi phạm (chỉ tab/visibility)');
  }, 5000);
}

function handleVisibilityChange() {
  if (!visibilityCheckEnabled || !document.hidden) return;
  
  // ✅ Chống spam: chỉ ghi nhận 1 lần mỗi 2 giây
  const now = Date.now();
  if (now - lastViolationTime < VIOLATION_COOLDOWN) {
    console.log('⏳ Vi phạm bị bỏ qua (cooldown)');
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
  console.warn(`⚠️ Vi phạm #${violations}: ${reason}`);
  showViolationWarning();

  if (violations === 1) {
    alert(`⚠️ Vi phạm lần 1 (${reason})! Còn 2 lần nữa sẽ bị thu bài.`);
  } else if (violations === 2) {
    alert(`⚠️ Vi phạm lần 2 (${reason})! Còn 1 lần nữa sẽ bị thu bài.`);
  } else if (violations >= 3) {
    alert(`⛔ Vi phạm 3 lần! Tự động nộp bài với điểm 0.`);
    submitExam(true);
  }
}

function showViolationWarning() {
  const warningEl = document.getElementById('warningMessage');
  if (warningEl) {
    warningEl.textContent = `⚠️ Cảnh báo: ${violations}/3 lần vi phạm`;
    warningEl.style.display = 'block';
    warningEl.style.animation = 'blink 0.5s ease-in-out 3';
  }
}

function disableViolationDetection() {
  visibilityCheckEnabled = false;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener('mousemove', updateActivity);
  document.removeEventListener('keypress', updateActivity);
  document.removeEventListener('click', updateActivity);
  
  console.log('🔒 Tắt phát hiện vi phạm');
}

// ====================== AUTH ======================
async function handleLogin(password) {
  console.log('🔑 Attempting login...');
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const data = await res.json();
  console.log('📥 Login response:', data);
  if (!res.ok || !data.ok) throw new Error(data.error || 'Đăng nhập thất bại');
  return data;
}

// ====================== TEACHER FUNCTIONS ======================
async function loadExamList() {
  const listDiv = document.getElementById('examList');
  if (!listDiv) {
    console.error('❌ examList element not found');
    return;
  }
  
  listDiv.innerHTML = '<p class="empty-state">Đang tải...</p>';
  console.log('🔄 Fetching /exam/list...');

  try {
    const res = await fetch('/exam/list');
    console.log('📡 Response status:', res.status, res.statusText);
    
    const data = await res.json();
    console.log('📥 /exam/list response:', data);

    if (!data.ok) {
      console.error('❌ API returned ok: false');
      listDiv.innerHTML = '<p class="empty-state">Lỗi tải danh sách đề</p>';
      return;
    }

    if (!data.exams || !Array.isArray(data.exams)) {
      console.error('❌ Invalid exams data:', data.exams);
      listDiv.innerHTML = '<p class="empty-state">Dữ liệu không hợp lệ</p>';
      return;
    }

    if (data.exams.length === 0) {
      console.log('ℹ️ No exams found');
      listDiv.innerHTML = '<p class="empty-state">Chưa có đề thi nào</p>';
      return;
    }

    console.log(`✅ Found ${data.exams.length} exams`);
    listDiv.innerHTML = '';
    
    data.exams.forEach((exam, idx) => {
      console.log(`📝 Exam ${idx + 1}:`, exam);
      
      const count = exam.questionCount || 0;
      const examGroup = document.createElement('div');
      examGroup.style.marginBottom = '20px';
      
      const mainItem = document.createElement('div');
      mainItem.className = 'exam-item';
      mainItem.style.borderLeft = '4px solid var(--primary)';
      mainItem.innerHTML = `
        <span><strong>📚 ${exam.originalName || 'Đề không tên'}</strong> (${count} câu)</span>
        <button type="button" class="btn btn-primary">Chi tiết</button>
      `;
      mainItem.querySelector('button').onclick = () => {
        console.log('🖱️ Opening exam:', exam.id);
        openExamDetail(exam.id);
      };
      examGroup.appendChild(mainItem);
      
      if (Array.isArray(exam.variants) && exam.variants.length > 0) {
        console.log(`🔀 ${exam.variants.length} variants found`);
        const variantsList = document.createElement('div');
        variantsList.className = 'variants-list';
        variantsList.style.marginLeft = '30px';
        variantsList.style.marginTop = '8px';
        
        exam.variants.forEach((variant, vidx) => {
          if (!variant?.id) return;
          const variantItem = document.createElement('div');
          variantItem.className = 'exam-item variant-item';
          variantItem.style.borderLeft = '4px solid var(--success)';
          variantItem.style.background = '#f8f9fa';
          variantItem.innerHTML = `
            <span>🔀 Mã đề ${vidx + 1}</span>
            <button type="button" class="btn btn-secondary">Chi tiết</button>
          `;
          variantItem.querySelector('button').onclick = () => openExamDetail(exam.id);
          variantsList.appendChild(variantItem);
        });
        examGroup.appendChild(variantsList);
      }
      
      listDiv.appendChild(examGroup);
    });
    
    console.log('✅ Exam list rendered successfully');
  } catch (err) {
    console.error('❌ loadExamList error:', err);
    listDiv.innerHTML = '<p class="empty-state">Lỗi kết nối server</p>';
  }
}

async function loadSubmissions() {
  const listDiv = document.getElementById('submissionsList');
  if (!listDiv) return;
  listDiv.innerHTML = '<p class="empty-state">Đang tải...</p>';
  console.log('🔄 Fetching /student/submissions...');

  try {
    const res = await fetch('/student/submissions');
    const data = await res.json();
    console.log('📥 Submissions response:', data);

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
    console.log('✅ Submissions loaded');
  } catch (err) {
    console.error('❌ loadSubmissions error:', err);
    listDiv.innerHTML = '<p class="empty-state">Lỗi kết nối server</p>';
  }
}
// ====================== MODAL CHI TIẾT ĐỀ ======================
async function openExamDetail(examId) {
  try {
    console.log('📖 Loading exam:', examId);
    const res = await fetch(`/exam/${examId}`);
    const data = await res.json();
    console.log('📥 Exam detail response:', data);
    
    if (!data.ok) {
      alert('❌ Lỗi: ' + (data.error || 'Unknown'));
      return;
    }

    const exam = data.exam;
    if (!exam) {
      alert('❌ Không có dữ liệu đề thi');
      return;
    }

    const modal = document.getElementById('examDetailModal');
    const content = document.getElementById('examDetailContent');
    content.innerHTML = `<h3>${exam.originalName || 'Đề thi'}</h3>`;

    const questions = exam.questions || [];
    if (questions.length === 0) {
      content.innerHTML += '<p class="empty-state">⚠️ Đề thi không có câu hỏi</p>';
      modal.style.display = 'block';
      return;
    }

    console.log(`📝 Rendering ${questions.length} questions...`);

    questions.forEach((q, index) => {
      const div = document.createElement('div');
      div.className = 'question-block';
      div.innerHTML = `
        <h4>Câu ${q.displayIndex || q.id || (index + 1)}</h4>
        <p>${q.question || q.text || '(Không có nội dung)'}</p>
        ${q.image ? `<img src="${q.image}" style="max-width:100%;border-radius:8px;"/>` : ''}
      `;

      const optsDiv = document.createElement('div');
      optsDiv.className = 'options';

      if (q.type === 'multiple_choice' && Array.isArray(q.options) && q.options.length > 0) {
        const block = document.createElement('div');
        block.className = 'option-block';
        q.options.forEach(opt => {
          const label = document.createElement('label');
          const isCorrect = q.correctAnswer === opt.key;
          label.innerHTML = `
            <input type="radio" name="ans_${q.id}" value="${opt.key}" ${isCorrect ? 'checked' : ''}>
            ${opt.key}. ${opt.text || ''}
          `;
          block.appendChild(label);
        });
        optsDiv.appendChild(block);
      }
      else if (q.type === 'true_false' && Array.isArray(q.subQuestions) && q.subQuestions.length > 0) {
        const block = document.createElement('div');
        block.className = 'truefalse-block';
        q.subQuestions.forEach(sub => {
          const row = document.createElement('div');
          row.className = 'sub-item';
          const correctAnswer = q.correctAnswer?.[sub.key];
          const isDung = correctAnswer === 'Đúng';
          const isSai = correctAnswer === 'Sai';
          row.innerHTML = `
            <strong>${sub.key})</strong> ${sub.text || ''}
            <label>
              <input type="radio" name="ans_${q.id}_${sub.key}" value="Đúng" ${isDung ? 'checked' : ''}> 
              Đúng
            </label>
            <label>
              <input type="radio" name="ans_${q.id}_${sub.key}" value="Sai" ${isSai ? 'checked' : ''}> 
              Sai
            </label>
          `;
          block.appendChild(row);
        });
        optsDiv.appendChild(block);
      }
      else if (q.type === 'true_false') {
        const block = document.createElement('div');
        block.className = 'truefalse-block';
        ['Đúng','Sai'].forEach(val => {
          const label = document.createElement('label');
          const isChecked = q.correctAnswer === val;
          label.innerHTML = `
            <input type="radio" name="ans_${q.id}" value="${val}" ${isChecked ? 'checked' : ''}>
            ${val}
          `;
          block.appendChild(label);
        });
        optsDiv.appendChild(block);
      }
      else if (q.type === 'short_answer') {
        const form = document.createElement('div');
        form.className = 'short-form';
        const currentAnswer = Array.isArray(q.correctAnswer) ? q.correctAnswer : ['','','',''];
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
      
      const uploadDiv = document.createElement('div');
      uploadDiv.style.marginTop = '12px';
      uploadDiv.innerHTML = `
        <input type="file" id="img_${q.id}" accept="image/*" style="font-size:12px;">
        <button class="btn btn-secondary" style="margin-left:8px;padding:4px 12px;font-size:13px;">📎 Ảnh</button>
      `;
      uploadDiv.querySelector('button').onclick = () => attachImage(examId, q.id);
      div.appendChild(uploadDiv);
      content.appendChild(div);
    });

    modal.style.display = 'block';
    setupModalButtons(examId);
    console.log('✅ Modal opened');
  } catch (err) {
    console.error('❌ openExamDetail error:', err);
    alert('Lỗi tải chi tiết: ' + err.message);
  }
}

function closeExamDetail() {
  const modal = document.getElementById('examDetailModal');
  if (modal) modal.style.display = 'none';
}

async function attachImage(examId, qid) {
  const input = document.getElementById(`img_${qid}`);
  if (!input?.files[0]) return alert('Chọn ảnh');
  const fd = new FormData();
  fd.append('image', input.files[0]);
  try {
    const res = await fetch(`/exam-media/${examId}/questions/${qid}/image`, { method: 'POST', body: fd });
    const result = await res.json();
    if (result.ok) {
      alert('✅ Đã cập nhật ảnh');
      const block = input.parentNode.parentNode;
      const existingImg = block.querySelector('img');
      if (existingImg) existingImg.remove();
      const imgTag = document.createElement('img');
      imgTag.src = result.url;
      imgTag.style.maxWidth = '100%';
      imgTag.style.borderRadius = '8px';
      imgTag.style.marginTop = '8px';
      block.insertBefore(imgTag, block.querySelector('.options'));
    } else {
      alert('❌ Lỗi: ' + (result.error || 'Không cập nhật được'));
    }
  } catch (err) {
    alert('❌ Lỗi: ' + err.message);
  }
}

// ====================== MODAL ACTIONS ======================
function setupModalButtons(examId) {
  document.getElementById('saveAnswers').onclick = async () => {
    try {
      const answers = {};
      document.querySelectorAll("[name^='ans_']").forEach(input => {
        const name = input.name;
        const value = input.value.trim();
        if (input.type === 'radio' && !input.checked) return;
        
        const matchSub = name.match(/^ans_(\d+)_(\w+)$/);
        if (matchSub && input.type === 'radio') {
          const qid = matchSub[1];
          const subKey = matchSub[2];
          if (!answers[qid]) answers[qid] = {};
          answers[qid][subKey] = value;
          return;
        }
        
        const matchShort = name.match(/^ans_(\d+)_(\d)$/);
        if (matchShort && input.type !== 'radio') {
          const qid = matchShort[1];
          const idx = parseInt(matchShort[2]) - 1;
          if (!answers[qid]) answers[qid] = ['', '', '', ''];
          if (Array.isArray(answers[qid])) answers[qid][idx] = value;
          return;
        }
        
        const matchMain = name.match(/^ans_(\d+)$/);
        if (matchMain && input.type === 'radio') {
          answers[matchMain[1]] = value;
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
      console.log('📥 Kết quả:', result);
      alert(result.ok ? '✅ Đã lưu đáp án!' : '❌ Lỗi: ' + (result.error || 'Unknown'));
    } catch (err) {
      console.error('❌ Lỗi lưu:', err);
      alert('Lỗi: ' + err.message);
    }
  };

  document.getElementById('sendReport').onclick = async () => {
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

  document.getElementById('deleteExam').onclick = async () => {
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
// ====================== STUDENT FUNCTIONS ======================
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
    document.getElementById('timer').textContent = 
      `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  }, 1000);
}

// ✅ FIX CHẤM ĐIỂM: Lưu mapping displayIndex → originalQuestionId
function renderExam(exam) {
  const container = document.getElementById('questionsContainer');
  container.innerHTML = '';
  questionKeyMapping = {}; // Reset mapping
  
  console.log('📝 Rendering exam:', exam.id);
  console.log('📋 Questions:', exam.questions);
  
  (exam.questions || []).forEach((q, index) => {
    const displayIndex = index + 1;
    questionKeyMapping[displayIndex] = String(q.id); // ✅ Lưu mapping
    
    console.log(`📍 Câu ${displayIndex}: originalID="${q.id}"`);
    
    const qDiv = document.createElement('div');
    qDiv.className = 'question-item';
    let optionsHtml = '';
    
    // ✅ SỬ DỤNG displayIndex cho input name (KHÔNG dùng q.id)
    if (q.type === 'multiple_choice') {
      const options = q.options || [];
      console.log(`  └─ Options:`, options.map(o => `${o.key}. ${o.text.substring(0,20)}...`));
      
      optionsHtml = `
        <div class="option-block">
          ${options.map(opt => `
            <label>
              <input type="radio" name="q_${displayIndex}" value="${opt.key}">
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
              <label><input type="radio" name="q_${displayIndex}_${sub.key}" value="Đúng"> Đúng</label>
              <label><input type="radio" name="q_${displayIndex}_${sub.key}" value="Sai"> Sai</label>
            </div>
          `).join('')}
        </div>
      `;
    }
    else if (q.type === 'true_false') {
      optionsHtml = `
        <div class="truefalse-block">
          <label><input type="radio" name="q_${displayIndex}" value="Đúng"> Đúng</label>
          <label><input type="radio" name="q_${displayIndex}" value="Sai"> Sai</label>
        </div>
      `;
    }
    else if (q.type === 'short_answer') {
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
      ${optionsHtml}
    `;
    container.appendChild(qDiv);
  });
  
  console.log('✅ Mapping:', questionKeyMapping);
}

// ✅ FIX CHẤM ĐIỂM: Convert displayIndex → originalQuestionId khi submit
async function submitExam(autoSubmit = false) {
  if (!autoSubmit && !confirm('Nộp bài?')) return;
  disableViolationDetection();
  if (examTimer) clearInterval(examTimer);

  const answers = {};
  
  console.log('📤 Bắt đầu thu thập đáp án...');
  
  document.querySelectorAll('[name^="q_"]').forEach(input => {
    // Chỉ lấy radio đã checked HOẶC input text có giá trị
    const isValid = (input.type === 'radio' && input.checked) || 
                    (input.type === 'text' && input.value.trim());
    
    if (!isValid) return;
    
    const nm = input.name;
    const val = input.value.trim();
    
    // Parse displayIndex từ input name
    const matchMain = nm.match(/^q_(\d+)$/);
    const matchSub = nm.match(/^q_(\d+)_(\w+)$/);
    const matchShort = nm.match(/^q_(\d+)_(\d)$/);
    
    let displayIndex;
    if (matchMain) displayIndex = matchMain[1];
    else if (matchSub) displayIndex = matchSub[1];
    else if (matchShort) displayIndex = matchShort[1];
    
    // ✅ QUAN TRỌNG: Convert displayIndex → originalQuestionId
    const originalQid = questionKeyMapping[displayIndex] || displayIndex;
    
    console.log(`  ✓ Input name="${nm}" value="${val}" → displayIdx=${displayIndex} → qid="${originalQid}"`);
    
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

  console.log('📦 Đáp án cuối cùng:', answers);

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
    console.log('📥 Kết quả từ server:', data);
    
    if (data.ok) {
      showPage('resultPage');
      const msgEl = document.getElementById('resultMessage');
      const scoreEl = document.getElementById('scoreDisplay');
      if (msgEl) {
        msgEl.textContent = autoSubmit ? 'Hết giờ hoặc vi phạm! Đã tự động nộp.' : 'Nộp bài thành công!';
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
        violationInfo.style.color = 'var(--danger)';
        violationInfo.style.marginTop = '12px';
        violationInfo.innerHTML = `⚠️ Số lần vi phạm: <strong>${violations}</strong>`;
        resultContainer.appendChild(violationInfo);
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
          
          // ✅ Ghi nhớ: Tự động điền thông tin đã lưu
          const savedName = localStorage.getItem('studentName');
          const savedDOB = localStorage.getItem('studentDOB');
          if (savedName) document.getElementById('studentName').value = savedName;
          if (savedDOB) document.getElementById('studentDOB').value = savedDOB;
          
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
      
      // ✅ Ghi nhớ: Lưu thông tin học sinh
      localStorage.setItem('studentName', name);
      localStorage.setItem('studentDOB', dob);
      
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
        setupViolationDetection();
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
      if (!fileInput?.files[0]) {
        showMessage('uploadMessage', 'Chọn file đề thi', true);
        return;
      }
      console.log('📤 Uploading exam...');
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
        console.log('📥 Upload response:', data);
        if (data.ok) {
          showMessage('uploadMessage', `✅ Upload thành công! ${data.count} câu • ${data.variantCount} phiên bản`);
          uploadForm.reset();
          console.log('🔄 Reloading exam list...');
          setTimeout(async () => {
            await loadExamList();
            await loadSubmissions();
            console.log('✅ Exam list reloaded');
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
  console.log('🚀 App initialized - FIXED VERSION');
  console.log('✅ Vi phạm: 3 lần (có cooldown 2s)');
  console.log('✅ Chấm điểm: Mapping displayIndex → originalQid');
  console.log('✅ Ghi nhớ: localStorage tên + ngày sinh');
  showPage('loginPage');
  setupEventHandlers();
});

window.openExamDetail = openExamDetail;
window.closeExamDetail = closeExamDetail;
window.loadExamList = loadExamList;
window.loadSubmissions = loadSubmissions;
window.attachImage = attachImage;
