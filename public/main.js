// ====================== PREVENT ALL FORM SUBMISSIONS ======================
document.addEventListener('DOMContentLoaded', () => {
  // Block all form submissions globally
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);
});

// ====================== STATE ======================
let currentExamId = null;
let currentClassName = null;
let currentStudentInfo = null;
let examTimer = null;
let violations = 0;

// ====================== HELPERS ======================
function showPage(id) {
  console.log('🔄 Chuyển sang trang:', id);
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
    target.style.display = 'block';
    console.log('✅ Đã chuyển sang:', id);
  } else {
    console.error('❌ Không tìm thấy trang:', id);
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
  console.log('🔐 Đang đăng nhập...');
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const data = await res.json();
  console.log('📩 Kết quả:', data);
  if (!res.ok || !data.ok) throw new Error(data.error || 'Đăng nhập thất bại');
  return data;
}

// ====================== TEACHER ======================
async function loadExamList() {
  try {
    console.log('📚 Đang tải danh sách đề...');
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
      const item = document.createElement('div');
      item.className = 'exam-item';
      item.innerHTML = `
        <span>${exam.name} (${exam.questionCount} câu)</span>
        <button onclick="window.openExamDetail('${exam.id}')">Chi tiết</button>
      `;
      listDiv.appendChild(item);
    });
    console.log('✅ Đã tải', data.exams.length, 'đề thi');
  } catch (err) {
    console.error('❌ Lỗi tải đề:', err);
  }
}

async function loadSubmissions() {
  try {
    console.log('📊 Đang tải bài nộp...');
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
        ${sub.score !== 'Chưa chấm' ? `<span class="submission-score">${sub.score} điểm</span>` : '<span style="color: var(--warning);">Chưa chấm</span>'}
      `;
      listDiv.appendChild(item);
    });
    console.log('✅ Đã tải', data.submissions.length, 'bài nộp');
  } catch (err) {
    console.error('❌ Lỗi tải bài nộp:', err);
  }
}

async function openExamDetail(examId) {
  try {
    console.log('📋 Đang mở chi tiết đề:', examId);
    const res = await fetch(`/exam/${examId}`);
    const data = await res.json();
    if (!data.ok) {
      alert('Không tải được đề');
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
      <p class="hint">Chọn đáp án đúng cho từng câu hỏi:</p>
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
        ta.style.cssText = 'width:100%;padding:8px;border:2px solid var(--border);border-radius:6px;font-family:inherit;';
        optsDiv.appendChild(ta);
      }
    });

    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise();
    }

    modal.classList.add('active');

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
        alert('Lỗi: ' + err.message);
      }
    };

    document.getElementById('sendReport').onclick = async () => {
      const className = prompt('Nhập tên lớp:');
      if (!className) return;
      try {
        const res = await fetch('/student/send-class-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ className, examId })
        });
        const result = await res.json();
        alert(result.message || (result.ok ? 'Đã gửi' : 'Lỗi'));
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    };

    document.getElementById('deleteExam').onclick = async () => {
      if (!confirm('Xóa đề này?')) return;
      try {
        const res = await fetch(`/exam/${examId}`, { method: 'DELETE' });
        const result = await res.json();
        alert(result.message || (result.ok ? 'Đã xóa' : 'Lỗi'));
        if (result.ok) {
          closeExamDetail();
          loadExamList();
        }
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    };
  } catch (err) {
    console.error('❌ Lỗi mở chi tiết:', err);
    alert('Lỗi: ' + err.message);
  }
}

function closeExamDetail() {
  document.getElementById('examDetailModal').classList.remove('active');
}

// ====================== STUDENT ======================
async function loadLatestExam() {
  console.log('📖 Đang tải đề thi...');
  const res = await fetch('/exam/latest');
  const data = await res.json();
  if (!data.ok || !data.exam) throw new Error('Không có đề thi');
  console.log('✅ Đã tải đề:', data.exam.id);
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
    if (timerEl) {
      timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
  console.log('🖊️ Hiển thị đề thi...');
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
      ${q.image ? `<img src="${q.image}" style="max-width:100%;border-radius:8px;margin:12px 0;" />` : ''}
      ${q.mathml ? `<div class="mathml">${q.mathml}</div>` : ''}
      ${q.latex ? `<div class="latex">\\(${q.latex}\\)</div>` : ''}
      ${optionsHtml}
    `;
    
    container.appendChild(qDiv);
  });
  
  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise();
  }
  
  console.log('✅ Đã hiển thị', exam.questions.length, 'câu hỏi');
}

async function submitExam(autoSubmit = false) {
  if (!autoSubmit && !confirm('Nộp bài?')) return;
  
  console.log('📤 Đang nộp bài...');
  
  if (examTimer) clearInterval(examTimer);
  
  const answers = {};
  
  document.querySelectorAll('[name^="q_"]').forEach(input => {
    if (input.type === 'radio' && input.checked) {
      const qid = input.name.replace('q_', '');
      answers[qid] = input.value;
    }
  });
  
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
    console.log('📩 Kết quả nộp:', data);
    
    if (data.ok) {
      showPage('resultPage');
      const msgEl = document.getElementById('resultMessage');
      const scoreEl = document.getElementById('scoreDisplay');
      
      if (msgEl) {
        msgEl.textContent = autoSubmit ? 'Hết giờ! Đã tự động nộp.' : 'Nộp bài thành công!';
      }
      
      if (scoreEl && data.score !== null && data.score !== undefined) {
        scoreEl.textContent = `${data.score}/10`;
        scoreEl.style.color = 'var(--success)';
      } else if (scoreEl) {
        scoreEl.textContent = 'Chờ chấm điểm';
        scoreEl.style.color = 'var(--warning)';
      }
      
      console.log('✅ Đã nộp bài');
    } else {
      alert('Lỗi: ' + (data.error || 'Unknown'));
    }
  } catch (err) {
    console.error('❌ Lỗi nộp bài:', err);
    alert('Lỗi: ' + err.message);
  }
}

// ====================== EVENTS ======================
function setupEventHandlers() {
  console.log('⚙️ Đang thiết lập sự kiện...');
  
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔐 Form đăng nhập được submit');
      
      if (loginError) {
        loginError.textContent = '';
        loginError.classList.remove('show');
        loginError.style.display = 'none';
      }
      
      const pwd = document.getElementById('passwordInput').value.trim();
      if (!pwd) {
        if (loginError) {
          loginError.textContent = 'Nhập mật khẩu';
          loginError.classList.add('show');
          loginError.style.display = 'block';
        }
        return false;
      }
      
      const loginBtn = document.getElementById('loginBtn');
      if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang xử lý...';
      }
      
      try {
        const result = await handleLogin(pwd);
        console.log('✅ Đăng nhập thành công:', result.role);
        
        if (result.role === 'teacher') {
          console.log('👨‍🏫 Chuyển sang trang giáo viên');
          showPage('teacherPage');
          await loadExamList();
          await loadSubmissions();
        } else if (result.role === 'student') {
          console.log('👨‍🎓 Chuyển sang trang học sinh');
          currentClassName = result.className;
          showPage('studentInfoPage');
          const classInput = document.getElementById('studentClass');
          if (classInput) {
            classInput.value = result.className || '';
          }
          
          try {
            const exam = await loadLatestExam();
            currentExamId = exam.id;
            
            const pwdGroup = document.getElementById('examPasswordGroup');
            if (exam.password && pwdGroup) {
              pwdGroup.style.display = 'block';
            } else if (pwdGroup) {
              pwdGroup.style.display = 'none';
            }
          } catch (err) {
            console.error('⚠️ Lỗi tải đề:', err);
          }
        }
      } catch (err) {
        console.error('❌ Lỗi đăng nhập:', err);
        if (loginError) {
          loginError.textContent = err.message;
          loginError.classList.add('show');
          loginError.style.display = 'block';
        }
      } finally {
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.textContent = 'Đăng nhập';
        }
      }
      
      return false;
    });
  }

  const togglePassword = document.getElementById('togglePassword');
  if (togglePassword) {
    togglePassword.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
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

  const studentInfoForm = document.getElementById('studentInfoForm');
  const studentInfoError = document.getElementById('studentInfoError');
  if (studentInfoForm) {
    studentInfoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('👨‍🎓 Form thông tin học sinh được submit');
      
      if (studentInfoError) {
        studentInfoError.textContent = '';
        studentInfoError.style.display = 'none';
      }
      
      const name = document.getElementById('studentName').value.trim();
      const dob = document.getElementById('studentDOB').value;
      
      if (!name || !dob) {
        if (studentInfoError) {
          studentInfoError.textContent = 'Điền đầy đủ thông tin';
          studentInfoError.style.display = 'block';
        }
        return false;
      }
      
      currentStudentInfo = { name, dob };
      
      try {
        const exam = await loadLatestExam();
        currentExamId = exam.id;
        
        if (exam.password) {
          const examPassword = document.getElementById('studentExamPassword').value.trim();
          if (!examPassword) {
            if (studentInfoError) {
              studentInfoError.textContent = 'Nhập mật khẩu đề thi';
              studentInfoError.style.display = 'block';
            }
            return false;
          }
          
          const isValid = await verifyExamPassword(exam.id, examPassword);
          if (!isValid) {
            if (studentInfoError) {
              studentInfoError.textContent = 'Mật khẩu đề sai';
              studentInfoError.style.display = 'block';
            }
            return false;
          }
        }
        
        console.log('🎯 Bắt đầu làm bài');
        showPage('examPage');
        
        const studentInfoEl = document.getElementById('studentInfo');
        if (studentInfoEl) {
          studentInfoEl.textContent = `${name} - ${currentClassName}`;
        }
        
        renderExam(exam);
        startExamTimer(exam.timeMinutes);
        
      } catch (err) {
        console.error('❌ Lỗi bắt đầu làm bài:', err);
        if (studentInfoError) {
          studentInfoError.textContent = 'Lỗi: ' + err.message;
          studentInfoError.style.display = 'block';
        }
      }
      
      return false;
    });
  }

  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('📤 Form upload được submit');
      
      const fileInput = document.getElementById('examFile');
      const timeInput = document.getElementById('timeMinutes');
      const passwordInput = document.getElementById('examPassword');
      const shuffleInput = document.getElementById('shuffleQuestions');
      const uploadBtn = document.getElementById('uploadBtn');
      
      if (!fileInput || !fileInput.files[0]) {
        showMessage('uploadMessage', 'Chọn file', true);
        return false;
      }
      
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      formData.append('timeMinutes', timeInput ? timeInput.value : '45');
      formData.append('password', passwordInput ? passwordInput.value : '');
      formData.append('shuffle', shuffleInput ? shuffleInput.checked : 'true');
      
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = '⏳ Đang xử lý...';
      }
      
      try {
        const res = await fetch('/exam/upload', {
          method: 'POST',
          body: formData
        });
        
        const data = await res.json();
        console.log('📩 Kết quả upload:', data);
        
        if (data.ok) {
          showMessage('uploadMessage', `✅ Upload thành công! ${data.count} câu`, false);
          uploadForm.reset();
          await loadExamList();
          await loadSubmissions();
        } else {
          showMessage('uploadMessage', '❌ ' + (data.error || 'Lỗi'), true);
        }
      } catch (err) {
        console.error('❌ Lỗi upload:', err);
        showMessage('uploadMessage', '❌ Lỗi: ' + err.message, true);
      } finally {
        if (uploadBtn) {
          uploadBtn.disabled = false;
          uploadBtn.textContent = '📤 Upload Đề';
        }
      }
      
      return false;
    });
  }

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      submitExam(false);
    });
  }

  const backToHome = document.getElementById('backToHome');
  if (backToHome) {
    backToHome.addEventListener('click', () => location.reload());
  }

  const logoutTeacher = document.getElementById('logoutTeacher');
  if (logoutTeacher) {
    logoutTeacher.addEventListener('click', () => location.reload());
  }

  const logoutStudent = document.getElementById('logoutStudent');
  if (logoutStudent) {
    logoutStudent.addEventListener('click', () => location.reload());
  }

  const closeModal = document.getElementById('closeModal');
  if (closeModal) {
    closeModal.addEventListener('click', closeExamDetail);
  }

  const examDetailModal = document.getElementById('examDetailModal');
  if (examDetailModal) {
    examDetailModal.addEventListener('click', (e) => {
      if (e.target === examDetailModal) closeExamDetail();
    });
  }
  
  console.log('✅ Đã thiết lập xong sự kiện');
}

// ====================== INIT ======================
document.addEventListener('DOMContentLoaded', () => {
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('🚀 HỆ THỐNG KHỞI ĐỘNG');
  console.log('═══════════════════════════════════════');
  console.log('');
  
  showPage('loginPage');
  setupEventHandlers();
  
  console.log('✅ Sẵn sàng sử dụng');
  console.log('');
});

window.openExamDetail = openExamDetail;
window.closeExamDetail = closeExamDetail;
