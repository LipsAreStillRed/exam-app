// ======================
// GLOBAL STATE
// ======================
let currentExamId = null;
let currentClassName = null;
let currentStudentInfo = null;
let examTimer = null;
let examStartTime = null;
let examTimeLimit = 0;
let violations = 0;

// ======================
// UTILITY FUNCTIONS
// ======================
function api(path) {
  return `/api${path}`;
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showMessage(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = isError ? 'message error' : 'message success';
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 5000);
}

// ======================
// AUTH FUNCTIONS
// ======================
async function handleLogin(password) {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Đăng nhập thất bại');
  }
  return data;
}

// ======================
// TEACHER FUNCTIONS
// ======================
async function loadExamList() {
  try {
    const res = await fetch('/exam/list');
    const data = await res.json();
    if (!data.ok) {
      throw new Error('Không tải được danh sách đề');
    }
    
    const listDiv = document.getElementById('examList');
    if (!listDiv) return;
    
    listDiv.innerHTML = '';
    
    if (!data.exams || data.exams.length === 0) {
      listDiv.innerHTML = '<p class="empty-state">Chưa có đề thi nào</p>';
      return;
    }
    
    data.exams.forEach(exam => {
      const item = document.createElement('div');
      item.className = 'exam-item';
      item.innerHTML = `
        <span>${exam.name} (${exam.questionCount} câu)</span>
        <button onclick="openExamDetailModal('${exam.id}')">Chi tiết</button>
      `;
      listDiv.appendChild(item);
    });
  } catch (err) {
    console.error('Load exam list error:', err);
    const listDiv = document.getElementById('examList');
    if (listDiv) {
      listDiv.innerHTML = '<p class="empty-state">Lỗi tải danh sách đề</p>';
    }
  }
}

async function loadSubmissions() {
  try {
    const res = await fetch('/student/submissions');
    const data = await res.json();
    if (!data.ok) throw new Error('Không tải được bài nộp');
    
    const listDiv = document.getElementById('submissionsList');
    if (!listDiv) return;
    
    listDiv.innerHTML = '';
    
    if (!data.submissions || data.submissions.length === 0) {
      listDiv.innerHTML = '<p class="empty-state">Chưa có bài nộp nào</p>';
      return;
    }
    
    data.submissions.slice(0, 10).forEach(sub => {
      const item = document.createElement('div');
      item.className = 'submission-item';
      item.innerHTML = `
        <strong>${sub.name}</strong>
        <div style="color: var(--text-light); font-size: 13px; margin-top: 4px;">
          Lớp: ${sub.className} • ${sub.date}
        </div>
        ${sub.score !== 'Chưa chấm' ? `<span class="submission-score">${sub.score} điểm</span>` : '<span style="color: var(--warning);">Chưa chấm</span>'}
      `;
      listDiv.appendChild(item);
    });
  } catch (err) {
    console.error('Load submissions error:', err);
  }
}

async function openExamDetailModal(examId) {
  try {
    const res = await fetch(`/exam/${examId}`);
    if (!res.ok) {
      alert('Không tải được đề');
      return;
    }
    const data = await res.json();
    if (!data.ok) {
      alert(data.error || 'Không tải được đề');
      return;
    }

    const modal = document.getElementById('examDetailModal');
    const content = document.getElementById('examDetailContent');
    const exam = data.exam;

    content.innerHTML = `
      <p><strong>Tên đề:</strong> ${exam.originalName}</p>
      <p><strong>Số câu hỏi:</strong> ${exam.questions.length}</p>
      <p><strong>Thời gian:</strong> ${exam.timeMinutes} phút</p>
      <p><strong>Mật khẩu đề:</strong> ${exam.password || 'Không có'}</p>
      <hr style="margin: 20px 0; border: none; border-top: 1px solid var(--border);" />
      <p><strong>Trộn đề:</strong> ${exam.sections && exam.sections.length > 0 ? 'Có' : 'Không'}</p>
      <p class="hint">Chọn đáp án đúng cho từng câu hỏi bên dưới:</p>
    `;

    exam.questions.forEach(q => {
      const div = document.createElement('div');
      div.className = 'question-block';
      div.innerHTML = `
        <h4>Câu ${q.id}</h4>
        <p>${q.question}</p>
        ${q.image ? `<img src="${q.image}" style="max-width:240px" />` : ''}
        ${q.mathml ? `<div class="mathml">${q.mathml}</div>` : ''}
        ${q.latex ? `<div class="latex">\\(${q.latex}\\)</div>` : ''}
        <div id="options_${q.id}" class="options"></div>
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
      } else if (q.type === 'true_false') {
        ['Đúng','Sai'].forEach(val => {
          const optEl = document.createElement('label');
          optEl.className = 'option';
          optEl.innerHTML = `
            <input type="radio" name="ans_${q.id}" value="${val}" ${q.correctAnswer === val ? 'checked' : ''}>
            ${val}
          `;
          optsDiv.appendChild(optEl);
        });
      } else if (q.type === 'short_answer') {
        const ta = document.createElement('textarea');
        ta.rows = 2;
        ta.name = `ans_${q.id}`;
        ta.value = q.correctAnswer || '';
        ta.style.width = '100%';
        ta.style.padding = '8px';
        ta.style.border = '2px solid var(--border)';
        ta.style.borderRadius = '6px';
        ta.style.fontFamily = 'inherit';
        optsDiv.appendChild(ta);
      }
    });

    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise();
    }

    modal.classList.add('active');

    // Save answers button
    document.getElementById('saveAnswers').onclick = async () => {
      try {
        const answers = {};
        document.querySelectorAll('[name^="ans_"]').forEach(input => {
          if ((input.type === 'radio' && input.checked) || input.tagName === 'TEXTAREA') {
            const qid = input.name.replace('ans_', '');
            answers[qid] = input.value;
          }
        });

        const resSave = await fetch(`/exam/${examId}/correct-answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers })
        });
        const result = await resSave.json();
        alert(result.message || (result.ok ? 'Đã lưu đáp án' : 'Lỗi lưu đáp án'));
      } catch (err) {
        alert('Lỗi lưu đáp án: ' + err.message);
      }
    };

    // Send report button
    document.getElementById('sendReport').onclick = async () => {
      const className = prompt('Nhập tên lớp để gửi báo cáo:');
      if (!className) return;
      
      try {
        const res = await fetch('/student/send-class-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ className, examId })
        });
        const result = await res.json();
        alert(result.message || (result.ok ? 'Đã gửi báo cáo' : 'Lỗi gửi báo cáo'));
      } catch (err) {
        alert('Lỗi gửi báo cáo: ' + err.message);
      }
    };

    // Delete exam button
    document.getElementById('deleteExam').onclick = async () => {
      if (!confirm('Bạn có chắc muốn xóa đề này?')) return;
      
      try {
        const res = await fetch(`/exam/${examId}`, { method: 'DELETE' });
        const result = await res.json();
        alert(result.message || (result.ok ? 'Đã xóa đề' : 'Lỗi xóa đề'));
        if (result.ok) {
          closeExamDetailModal();
          loadExamList();
        }
      } catch (err) {
        alert('Lỗi xóa đề: ' + err.message);
      }
    };
  } catch (err) {
    console.error('Open exam detail error:', err);
    alert('Lỗi tải đề: ' + err.message);
  }
}

function closeExamDetailModal() {
  document.getElementById('examDetailModal').classList.remove('active');
}

// ======================
// STUDENT FUNCTIONS
// ======================
async function loadLatestExam() {
  try {
    const res = await fetch('/exam/latest');
    const data = await res.json();
    if (!data.ok || !data.exam) {
      throw new Error('Không có đề thi nào');
    }
    return data.exam;
  } catch (err) {
    console.error('Load latest exam error:', err);
    throw err;
  }
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
  examTimeLimit = timeMinutes * 60;
  examStartTime = Date.now();
  
  examTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - examStartTime) / 1000);
    const remaining = examTimeLimit - elapsed;
    
    if (remaining <= 0) {
      clearInterval(examTimer);
      submitExam(true);
      return;
    }
    
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const timerEl = document.getElementById('timer');
    if (timerEl) {
      timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    const warningEl = document.getElementById('warningMessage');
    if (remaining <= 60 && warningEl) {
      warningEl.textContent = '⚠️ Còn 1 phút!';
    } else if (remaining <= 300 && warningEl) {
      warningEl.textContent = '⏰ Còn 5 phút';
    }
  }, 1000);
}

function renderExam(exam) {
  const container = document.getElementById('questionsContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  exam.questions.forEach((q, index) => {
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
      optionsHtml = '<div class="options">';
      ['Đúng', 'Sai'].forEach(val => {
        optionsHtml += `
          <label class="option">
            <input type="radio" name="q_${q.id}" value="${val}">
            ${val}
          </label>
        `;
      });
      optionsHtml += '</div>';
    } else if (q.type === 'short_answer') {
      optionsHtml = `
        <div class="short-answer-boxes">
          <div class="box-label">Nhập đáp án (4 ký tự):</div>
          <div class="boxes-container">
            ${[0,1,2,3].map(i => `
              <select class="answer-box" data-question="${q.id}" data-box="${i}">
                <option value="">-</option>
                ${['A','B','C','D','0','1','2','3','4','5','6','7','8','9'].map(v => 
                  `<option value="${v}">${v}</option>`
                ).join('')}
              </select>
            `).join('')}
          </div>
        </div>
      `;
    }
    
    qDiv.innerHTML = `
      <strong>Câu ${index + 1}:</strong>
      <p>${q.question}</p>
      ${q.image ? `<img src="${q.image}" style="max-width: 100%; border-radius: 8px; margin: 12px 0;" />` : ''}
      ${q.mathml ? `<div class="mathml">${q.mathml}</div>` : ''}
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
  if (!autoSubmit && !confirm('Bạn có chắc muốn nộp bài?')) return;
  
  if (examTimer) {
    clearInterval(examTimer);
  }
  
  const answers = {};
  
  // Collect multiple choice and true/false answers
  document.querySelectorAll('[name^="q_"]').forEach(input => {
    if (input.type === 'radio' && input.checked) {
      const qid = input.name.replace('q_', '');
      answers[qid] = input.value;
    }
  });
  
  // Collect short answer boxes
  const boxes = document.querySelectorAll('.answer-box');
  const boxAnswers = {};
  boxes.forEach(box => {
    const qid = box.dataset.question;
    const boxIndex = box.dataset.box;
    if (!boxAnswers[qid]) boxAnswers[qid] = { boxes: [] };
    boxAnswers[qid].boxes[boxIndex] = box.value;
  });
  
  Object.keys(boxAnswers).forEach(qid => {
    answers[qid] = boxAnswers[qid];
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
      
      if (msgEl) {
        msgEl.textContent = autoSubmit ? 'Hết giờ! Bài làm đã được tự động nộp.' : 'Bài làm của bạn đã được nộp thành công.';
      }
      
      if (scoreEl && data.score !== null && data.score !== undefined) {
        scoreEl.textContent = `${data.score}/10`;
      } else if (scoreEl) {
        scoreEl.textContent = 'Chờ giáo viên chấm điểm';
        scoreEl.style.color = 'var(--warning)';
      }
    } else {
      alert('Lỗi nộp bài: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Submit error:', err);
    alert('Lỗi nộp bài: ' + err.message);
  }
}

// ======================
// EVENT HANDLERS
// ======================
function setupEventHandlers() {
  // Login form
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (loginError) {
        loginError.textContent = '';
        loginError.classList.remove('show');
      }
      
      const pwd = document.getElementById('passwordInput').value.trim();
      const loginBtn = document.getElementById('loginBtn');
      
      if (loginBtn) loginBtn.disabled = true;
      
      try {
        const result = await handleLogin(pwd);
        
        if (result.role === 'teacher') {
          showPage('teacherPage');
          loadExamList();
          loadSubmissions();
        } else if (result.role === 'student') {
          currentClassName = result.className;
          showPage('studentInfoPage');
          document.getElementById('studentClass').value = result.className || '';
          
          // Check if exam has password
          try {
            const exam = await loadLatestExam();
            currentExamId = exam.id;
            
            if (exam.password) {
              document.getElementById('examPasswordGroup').style.display = 'block';
            } else {
              document.getElementById('examPasswordGroup').style.display = 'none';
            }
          } catch (err) {
            console.error('Error loading exam:', err);
            if (loginError) {
              loginError.textContent = 'Không tìm thấy đề thi nào';
              loginError.classList.add('show');
            }
          }
        }
      } catch (err) {
        if (loginError) {
          loginError.textContent = err.message;
          loginError.classList.add('show');
        }
      } finally {
        if (loginBtn) loginBtn.disabled = false;
      }
    });
  }
  
  // Toggle password visibility
  const togglePassword = document.getElementById('togglePassword');
  if (togglePassword) {
    togglePassword.addEventListener('click', function() {
      const input = document.getElementById('passwordInput');
      const icon = document.getElementById('eyeIcon');
      if (input && icon) {
        if (input.type === 'password') {
          input.type = 'text';
          icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
        } else {
          input.type = 'password';
          icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
        }
      }
    });
  }
  
  // Student info form
  const studentInfoForm = document.getElementById('studentInfoForm');
  const studentInfoError = document.getElementById('studentInfoError');
  
  if (studentInfoForm) {
    studentInfoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (studentInfoError) studentInfoError.textContent = '';
      
      const name = document.getElementById('studentName').value.trim();
      const dob = document.getElementById('studentDOB').value;
      
      if (!name || !dob) {
        if (studentInfoError) studentInfoError.textContent = 'Vui lòng điền đầy đủ thông tin';
        return;
      }
      
      currentStudentInfo = { name, dob };
      
      try {
        const exam = await loadLatestExam();
        currentExamId = exam.id;
        
        if (exam.password) {
          const examPassword = document.getElementById('studentExamPassword').value.trim();
          const isValid = await verifyExamPassword(exam.id, examPassword);
          
          if (!isValid) {
            if (studentInfoError) studentInfoError.textContent = 'Mật khẩu đề thi không đúng';
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
        
      } catch (err) {
        if (studentInfoError) {
          studentInfoError.textContent = 'Không tải được đề thi: ' + err.message;
        }
      }
    });
  }
  
  // Upload form
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const fileInput = document.getElementById('examFile');
      const timeInput = document.getElementById('timeMinutes');
      const passwordInput = document.getElementById('examPassword');
      const shuffleInput = document.getElementById('shuffleQuestions');
      const uploadBtn = document.getElementById('uploadBtn');
      const uploadMessage = document.getElementById('uploadMessage');
      
      if (!fileInput || !fileInput.files[0]) {
        showMessage('uploadMessage', 'Vui lòng chọn file', true);
        return;
      }
      
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      formData.append('timeMinutes', timeInput ? timeInput.value : '45');
      formData.append('password', passwordInput ? passwordInput.value : '');
      formData.append('shuffle', shuffleInput ? shuffleInput.checked : 'true');
      
      if (uploadBtn) uploadBtn.disabled = true;
      if (uploadMessage) uploadMessage.textContent = 'Đang tải lên...';
      
      try {
        const res = await fetch('/exam/upload', {
          method: 'POST',
          body: formData
        });
        
        const data = await res.json();
        
        if (data.ok) {
          showMessage('uploadMessage', `Đã tải lên thành công! ${data.count} câu hỏi`, false);
          uploadForm.reset();
          loadExamList();
        } else {
          showMessage('uploadMessage', data.error || 'Lỗi tải lên', true);
        }
      } catch (err) {
        showMessage('uploadMessage', 'Lỗi kết nối: ' + err.message, true);
      } finally {
        if (uploadBtn) uploadBtn.disabled = false;
      }
    });
  }
  
  // Submit exam button
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => submitExam(false));
  }
  
  // Back to home button
  const backToHome = document.getElementById('backToHome');
  if (backToHome) {
    backToHome.addEventListener('click', () => {
      location.reload();
    });
  }
  
  // Logout buttons
  const logoutTeacher = document.getElementById('logoutTeacher');
  if (logoutTeacher) {
    logoutTeacher.addEventListener('click', () => location.reload());
  }
  
  const logoutStudent = document.getElementById('logoutStudent');
  if (logoutStudent) {
    logoutStudent.addEventListener('click', () => location.reload());
  }
  
  // Close modal button
  const closeModal = document.getElementById('closeModal');
  if (closeModal) {
    closeModal.addEventListener('click', closeExamDetailModal);
  }
  
  // Close modal on background click
  const examDetailModal = document.getElementById('examDetailModal');
  if (examDetailModal) {
    examDetailModal.addEventListener('click', (e) => {
      if (e.target === examDetailModal) {
        closeExamDetailModal();
      }
    });
  }
}

// ======================
// INITIALIZATION
// ======================
document.addEventListener('DOMContentLoaded', () => {
  console.log('App initialized');
  showPage('loginPage');
  setupEventHandlers();
  
  // Load exam list for teacher page (will be hidden until login)
  loadExamList();
});

// Make functions available globally for onclick handlers
window.openExamDetailModal = openExamDetailModal;
window.closeExamDetailModal = closeExamDetailModal;
