const API_BASE = '';

function api(path) {
  return (API_BASE || '') + path;
}

const state = {
  userRole: null,
  className: null,
  studentInfo: null,
  examData: null,
  timerInterval: null,
  timeLeft: 0,
  tabViolations: 0,
  currentExamId: null,
  studentAnswers: {}
};

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 5000);
}

function showMessage(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = 'message ' + (isError ? 'error' : 'success');
  setTimeout(() => el.className = 'message', 5000);
}

// LOGIN
document.getElementById('togglePassword').addEventListener('click', function() {
  const input = document.getElementById('passwordInput');
  const icon = document.getElementById('eyeIcon');
  
  if (input.type === 'password') {
    input.type = 'text';
    icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    input.type = 'password';
    icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const password = document.getElementById('passwordInput').value.trim();
  const loginBtn = document.getElementById('loginBtn');
  
  loginBtn.disabled = true;
  loginBtn.textContent = 'Đang xử lý...';
  
  try {
    const response = await fetch(api('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      state.userRole = data.role;
      state.className = data.className;
      
      if (data.role === 'teacher') {
        showPage('teacherPage');
        loadExamsList();
        loadSubmissionsList();
      } else {
        document.getElementById('studentClass').value = data.className;
        showPage('studentInfoPage');
        await loadLatestExam();
      }
    } else {
      showError('loginError', data.error || 'Đăng nhập thất bại');
    }
  } catch (error) {
    showError('loginError', 'Lỗi kết nối: ' + error.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Đăng nhập';
  }
});

// TEACHER - UPLOAD
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const fileInput = document.getElementById('examFile');
  const file = fileInput.files[0];
  
  if (!file) {
    showMessage('uploadMessage', 'Vui lòng chọn file', true);
    return;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('timeMinutes', document.getElementById('timeMinutes').value);
  formData.append('password', document.getElementById('examPassword').value);
  formData.append('shuffle', document.getElementById('shuffleQuestions').checked);
  
  const uploadBtn = document.getElementById('uploadBtn');
  uploadBtn.disabled = true;
  uploadBtn.textContent = '⏳ Đang xử lý...';
  
  try {
    const response = await fetch(api('/exam/upload'), {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showMessage('uploadMessage', `✅ Upload thành công! ${data.count} câu hỏi`);
      fileInput.value = '';
      document.getElementById('examPassword').value = '';
      loadExamsList();
    } else {
      showMessage('uploadMessage', '❌ Lỗi: ' + (data.error || 'Không xác định'), true);
    }
  } catch (error) {
    showMessage('uploadMessage', '❌ Lỗi kết nối: ' + error.message, true);
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = '📤 Upload Đề';
  }
});

// TEACHER - LOAD EXAMS LIST
async function loadExamsList() {
  try {
    const response = await fetch(api('/exam/list'));
    const data = await response.json();
    
    const container = document.getElementById('examsList');
    
    if (!data.ok || data.exams.length === 0) {
      container.innerHTML = '<p class="empty-state">Chưa có đề thi</p>';
      return;
    }
    
    container.innerHTML = data.exams.map(exam => `
      <div class="exam-item" onclick="viewExamDetail('${exam.id}')">
        <div class="exam-item-header">
          <div class="exam-item-title">${exam.name}</div>
          <div>
            ${exam.hasAnswers ? '<span class="badge badge-success">Có đáp án</span>' : '<span class="badge badge-warning">Chưa đáp án</span>'}
          </div>
        </div>
        <div class="exam-item-meta">
          <span>📝 ${exam.questionCount} câu</span>
          <span>⏱️ ${exam.timeMinutes} phút</span>
          <span>${exam.hasPassword ? '🔒 Có mật khẩu' : '🔓 Không mật khẩu'}</span>
          <span>📅 ${new Date(exam.createdAt).toLocaleString('vi-VN')}</span>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading exams:', error);
    document.getElementById('examsList').innerHTML = '<p class="empty-state">Lỗi tải danh sách</p>';
  }
}

// TEACHER - VIEW EXAM DETAIL
window.viewExamDetail = async function(examId) {
  try {
    const response = await fetch(api(`/exam/${examId}`));
    const data = await response.json();
    
    if (!data.ok) {
      alert('Không thể tải đề thi');
      return;
    }
    
    state.currentExamId = examId;
    const exam = data.exam;
    
    let html = `
      <h3>${exam.originalName}</h3>
      <p><strong>Số câu:</strong> ${exam.questions.length} | <strong>Thời gian:</strong> ${exam.timeMinutes} phút</p>
      <hr style="margin: 20px 0;">
    `;
    
    exam.questions.forEach((q, idx) => {
      const questionNumber = q.id || (idx + 1);
      html += `
        <div class="question-block">
          <div class="question-header">
            Câu ${questionNumber} (${q.type === 'multiple_choice' ? 'Trắc nghiệm' : q.type === 'true_false' ? 'Đúng/Sai' : 'Trả lời ngắn'}):
          </div>
          <div class="question-text">${q.question}</div>
      `;
      
      // HIỂN THỊ HÌNH ẢNH (nếu có)
      if (q.image) {
        html += `
          <div style="margin: 15px 0;">
            <img src="${q.image}" style="max-width: 100%; border-radius: 8px; border: 2px solid var(--border);">
            <button class="btn btn-danger" style="margin-top: 8px; padding: 6px 12px; font-size: 14px;" onclick="deleteImage('${examId}', '${questionNumber}')">🗑️ Xóa hình</button>
          </div>
        `;
      } else {
        html += `
          <div style="margin: 15px 0;">
            <input type="file" id="imageFile_${questionNumber}" accept="image/*" style="display: none;" onchange="uploadImage('${examId}', '${questionNumber}')">
            <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 14px;" onclick="document.getElementById('imageFile_${questionNumber}').click()">📷 Thêm hình ảnh</button>
          </div>
        `;
      }
      
      // HIỂN THỊ ĐÁP ÁN
      if (q.type === 'multiple_choice' && q.options && q.options.length > 0) {
        html += '<div class="options-container">';
        q.options.forEach(opt => {
          html += `<div class="option-item">${opt.key}. ${opt.text}</div>`;
        });
        html += '</div>';
      } else if (q.type === 'true_false') {
        if (q.subQuestions && q.subQuestions.length > 0) {
          html += '<div class="options-container">';
          q.subQuestions.forEach(sub => {
            html += `<div class="option-item">${sub.key}) ${sub.text}</div>`;
          });
          html += '</div>';
        } else {
          html += '<div class="options-container">';
          html += '<div class="option-item">Đúng / Sai</div>';
          html += '</div>';
        }
      }
      
      // NHẬP ĐÁP ÁN
      if (q.type === 'true_false' && q.subQuestions && q.subQuestions.length > 0) {
        // Có nhiều ý a), b), c), d) - nhập riêng từng ý
        html += '<div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 10px;">';
        html += '<strong>Nhập đáp án từng ý:</strong>';
        q.subQuestions.forEach(sub => {
          const currentAnswer = exam.answers && exam.answers[questionNumber] && exam.answers[questionNumber][sub.key] ? exam.answers[questionNumber][sub.key] : '';
          html += `
            <div class="answer-input-group">
              <label>${sub.key}):</label>
              <select class="answer-input" data-question="${questionNumber}" data-subkey="${sub.key}">
                <option value="">- Chọn -</option>
                <option value="Đúng" ${currentAnswer === 'Đúng' ? 'selected' : ''}>Đúng</option>
                <option value="Sai" ${currentAnswer === 'Sai' ? 'selected' : ''}>Sai</option>
              </select>
            </div>
          `;
        });
        html += '</div>';
      } else {
        // Câu thường - nhập 1 đáp án
        const currentAnswer = exam.answers ? exam.answers[questionNumber] : '';
        html += `
          <div class="answer-input-group">
            <label>Đáp án:</label>
            <input type="text" class="answer-input" data-question="${questionNumber}" value="${currentAnswer || ''}" placeholder="VD: A hoặc Đúng hoặc 3,14">
          </div>
        `;
      }
      
      html += '</div>';
    });
    
    document.getElementById('examDetailContent').innerHTML = html;
    document.getElementById('examDetailModal').classList.add('show');
  } catch (error) {
    alert('Lỗi: ' + error.message);
  }
};

// Upload hình ảnh
window.uploadImage = async function(examId, questionId) {
  const fileInput = document.getElementById(`imageFile_${questionId}`);
  const file = fileInput.files[0];
  
  if (!file) return;
  
  const formData = new FormData();
  formData.append('image', file);
  
  try {
    const response = await fetch(api(`/exam/${examId}/upload-image/${questionId}`), {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.ok) {
      alert('✅ Đã thêm hình ảnh!');
      viewExamDetail(examId); // Reload
    } else {
      alert('❌ Lỗi: ' + (data.error || 'Không xác định'));
    }
  } catch (error) {
    alert('❌ Lỗi: ' + error.message);
  }
};

// Xóa hình ảnh
window.deleteImage = async function(examId, questionId) {
  if (!confirm('Xóa hình ảnh này?')) return;
  
  try {
    const response = await fetch(api(`/exam/${examId}/delete-image/${questionId}`), {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (data.ok) {
      alert('✅ Đã xóa hình!');
      viewExamDetail(examId);
    } else {
      alert('❌ Lỗi: ' + (data.error || 'Không xác định'));
    }
  } catch (error) {
    alert('❌ Lỗi: ' + error.message);
  }
};

// TEACHER - CLOSE MODAL
document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('examDetailModal').classList.remove('show');
});

// TEACHER - SAVE ANSWERS
document.getElementById('saveAnswers').addEventListener('click', async () => {
  const inputs = document.querySelectorAll('.answer-input');
  const answers = {};
  
  inputs.forEach(input => {
    const questionId = input.getAttribute('data-question');
    const subKey = input.getAttribute('data-subkey');
    const value = input.value.trim();
    
    if (subKey) {
      // Câu đúng/sai có nhiều ý
      if (!answers[questionId]) {
        answers[questionId] = {};
      }
      if (value) {
        answers[questionId][subKey] = value;
      }
    } else {
      // Câu thường
      if (value) {
        answers[questionId] = value;
      }
    }
  });
  
  if (Object.keys(answers).length === 0) {
    alert('⚠️ Chưa nhập đáp án nào');
    return;
  }
  
  try {
    const response = await fetch(api(`/exam/${state.currentExamId}/answers`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      alert('✅ Đã lưu đáp án!');
      document.getElementById('examDetailModal').classList.remove('show');
      loadExamsList();
    } else {
      alert('❌ Lỗi: ' + (data.error || 'Không xác định'));
    }
  } catch (error) {
    alert('❌ Lỗi: ' + error.message);
  }
});

// TEACHER - SEND REPORT
document.getElementById('sendReport').addEventListener('click', async () => {
  const className = prompt('Nhập lớp cần gửi báo cáo (VD: 12A1):');
  if (!className) return;
  
  try {
    const response = await fetch(api('/student/send-class-report'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        className: className.trim(), 
        examId: state.currentExamId 
      })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      alert('✅ Đã gửi báo cáo về email!');
    } else {
      alert('❌ Lỗi: ' + (data.error || 'Chưa có bài nộp'));
    }
  } catch (error) {
    alert('❌ Lỗi: ' + error.message);
  }
});

// TEACHER - DELETE EXAM
document.getElementById('deleteExam').addEventListener('click', async () => {
  if (!confirm('⚠️ Bạn có chắc muốn xóa đề này?')) {
    return;
  }
  
  try {
    const response = await fetch(api(`/exam/${state.currentExamId}`), {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (data.ok) {
      alert('✅ Đã xóa đề!');
      document.getElementById('examDetailModal').classList.remove('show');
      loadExamsList();
    } else {
      alert('❌ Lỗi: ' + (data.error || 'Không xác định'));
    }
  } catch (error) {
    alert('❌ Lỗi: ' + error.message);
  }
});

// TEACHER - LOAD SUBMISSIONS
async function loadSubmissionsList() {
  try {
    const response = await fetch(api('/student/submissions'));
    const data = await response.json();
    
    const container = document.getElementById('submissionsList');
    
    if (!data.ok || data.submissions.length === 0) {
      container.innerHTML = '<p class="empty-state">Chưa có bài nộp</p>';
      return;
    }
    
    container.innerHTML = data.submissions.slice(0, 10).map(sub => `
      <div class="submission-item">
        <div class="exam-item-header">
          <div class="exam-item-title">${sub.name}</div>
          <div>
            <span class="badge badge-success">${sub.className}</span>
            ${sub.score !== 'Chưa chấm' ? `<span class="submission-score">${sub.score} điểm</span>` : ''}
          </div>
        </div>
        <div class="exam-item-meta">
          <span>📅 ${sub.date}</span>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading submissions:', error);
  }
}

document.getElementById('logoutTeacher').addEventListener('click', () => {
  state.userRole = null;
  showPage('loginPage');
  document.getElementById('passwordInput').value = '';
});

// STUDENT - LOAD LATEST EXAM
async function loadLatestExam() {
  try {
    const response = await fetch(api('/exam/latest'));
    const data = await response.json();
    
    if (data.ok && data.questions && data.questions.length > 0) {
      state.examData = data;
      
      if (data.hasPassword) {
        document.getElementById('examPasswordGroup').style.display = 'block';
      } else {
        document.getElementById('examPasswordGroup').style.display = 'none';
      }
    } else {
      showError('studentInfoError', 'Chưa có đề thi. Vui lòng liên hệ giáo viên.');
    }
  } catch (error) {
    showError('studentInfoError', 'Lỗi tải đề: ' + error.message);
  }
}

// STUDENT - START EXAM
document.getElementById('studentInfoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const name = document.getElementById('studentName').value.trim();
  const dob = document.getElementById('studentDOB').value;
  const className = document.getElementById('studentClass').value;
  const examPassword = document.getElementById('studentExamPassword').value;
  
  if (!name || !dob) {
    showError('studentInfoError', 'Vui lòng điền đầy đủ thông tin');
    return;
  }
  
  if (state.examData.hasPassword) {
    try {
      const response = await fetch(api('/exam/verify-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          examId: state.examData.examId, 
          password: examPassword 
        })
      });
      
      const data = await response.json();
      
      if (!data.verified) {
        showError('studentInfoError', '❌ Mật khẩu đề không đúng');
        return;
      }
    } catch (error) {
      showError('studentInfoError', 'Lỗi: ' + error.message);
      return;
    }
  }
  
  state.studentInfo = { name, dob, className };
  startExam();
});

document.getElementById('logoutStudent').addEventListener('click', () => {
  state.userRole = null;
  state.className = null;
  showPage('loginPage');
  document.getElementById('passwordInput').value = '';
});

// EXAM - START
function startExam() {
  if (!state.examData || !state.examData.questions || state.examData.questions.length === 0) {
    alert('Không có đề thi');
    return;
  }
  
  showPage('examPage');
  
  document.getElementById('studentInfo').textContent = 
    `${state.studentInfo.name} - Lớp ${state.studentInfo.className}`;
  
  const container = document.getElementById('questionsContainer');
  container.innerHTML = '';
  state.studentAnswers = {};
  
  state.examData.questions.forEach((q, index) => {
    const questionId = q.id || (index + 1);
    const div = document.createElement('div');
    div.className = 'question-block';
    
    let typeLabel = '';
    if (q.type === 'true_false') typeLabel = ' (Đúng/Sai)';
    else if (q.type === 'short_answer') typeLabel = ' (Trả lời ngắn)';
    
    let html = `
      <div class="question-header">Câu ${questionId}${typeLabel}:</div>
      <div class="question-text">${q.question}</div>
    `;
    
    if (q.type === 'multiple_choice' && q.options && q.options.length > 0) {
      html += '<div class="options-container">';
      q.options.forEach(opt => {
        html += `
          <label class="option-item">
            <input type="radio" name="question_${questionId}" value="${opt.key}" onchange="saveAnswer('${questionId}', '${opt.key}')">
            <span class="option-text">${opt.key}. ${opt.text}</span>
          </label>
        `;
      });
      html += '</div>';
    } else if (q.type === 'true_false') {
      if (q.subQuestions && q.subQuestions.length > 0) {
        q.subQuestions.forEach(sub => {
          html += `
            <div style="margin: 12px 0; padding: 10px; background: #f8f9fa; border-radius: 6px;">
              <div style="margin-bottom: 8px;"><strong>${sub.key})</strong> ${sub.text}</div>
              <div class="options-container">
                <label class="option-item">
                  <input type="radio" name="question_${questionId}_${sub.key}" value="Đúng" onchange="saveSubAnswer('${questionId}', '${sub.key}', 'Đúng')">
                  <span class="option-text">Đúng</span>
                </label>
                <label class="option-item">
                  <input type="radio" name="question_${questionId}_${sub.key}" value="Sai" onchange="saveSubAnswer('${questionId}', '${sub.key}', 'Sai')">
                  <span class="option-text">Sai</span>
                </label>
              </div>
            </div>
          `;
        });
      } else {
        html += '<div class="options-container">';
        html += `
          <label class="option-item">
            <input type="radio" name="question_${questionId}" value="Đúng" onchange="saveAnswer('${questionId}', 'Đúng')">
            <span class="option-text">Đúng</span>
          </label>
          <label class="option-item">
            <input type="radio" name="question_${questionId}" value="Sai" onchange="saveAnswer('${questionId}', 'Sai')">
            <span class="option-text">Sai</span>
          </label>
        `;
        html += '</div>';
      }
    } else if (q.type === 'short_answer') {
      html += `
        <div class="short-answer-boxes">
          <div class="box-label">Chọn đáp án (tô từ trái sang phải):</div>
          <div class="boxes-container">
            <select class="answer-box" data-question="${questionId}" data-box="0" onchange="updateShortAnswer('${questionId}')">
              <option value="">-</option>
              <option value="-">−</option>
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="7">7</option>
              <option value="8">8</option>
              <option value="9">9</option>
              <option value=",">,</option>
            </select>
            <select class="answer-box" data-question="${questionId}" data-box="1" onchange="updateShortAnswer('${questionId}')">
              <option value="">-</option>
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="7">7</option>
              <option value="8">8</option>
              <option value="9">9</option>
              <option value=",">,</option>
            </select>
            <select class="answer-box" data-question="${questionId}" data-box="2" onchange="updateShortAnswer('${questionId}')">
              <option value="">-</option>
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="7">7</option>
              <option value="8">8</option>
              <option value="9">9</option>
              <option value=",">,</option>
            </select>
            <select class="answer-box" data-question="${questionId}" data-box="3" onchange="updateShortAnswer('${questionId}')">
              <option value="">-</option>
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="7">7</option>
              <option value="8">8</option>
              <option value="9">9</option>
              <option value=",">,</option>
            </select>
          </div>
        </div>
      `;
    }
    
    div.innerHTML = html;
    container.appendChild(div);
  });
  
  state.timeLeft = (state.examData.timeMinutes || 45) * 60;
  updateTimer();
  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    updateTimer();
    
    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      submitExam(true);
    }
  }, 1000);
  
  state.tabViolations = 0;
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

window.saveAnswer = function(questionId, answer) {
  state.studentAnswers[questionId] = answer;
};

window.saveSubAnswer = function(questionId, subKey, answer) {
  if (!state.studentAnswers[questionId]) {
    state.studentAnswers[questionId] = {};
  }
  state.studentAnswers[questionId][subKey] = answer;
};

window.updateShortAnswer = function(questionId) {
  const boxes = document.querySelectorAll(`select.answer-box[data-question="${questionId}"]`);
  const values = Array.from(boxes).map(box => box.value);
  
  state.studentAnswers[questionId] = {
    boxes: values,
    value: values.filter(v => v).join('')
  };
};

function handleVisibilityChange() {
  if (document.hidden && state.timerInterval) {
    state.tabViolations++;
    const warning = document.getElementById('warningMessage');
    warning.textContent = `⚠️ Cảnh báo: Bạn đã rời trang ${state.tabViolations}/3 lần`;
    
    if (state.tabViolations >= 3) {
      clearInterval(state.timerInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      alert('⚠️ Bạn đã vi phạm quy định. Bài thi sẽ được thu ngay.');
      submitExam(true);
    }
  } else if (!document.hidden && state.tabViolations > 0 && state.tabViolations < 3) {
    alert(`⚠️ Cảnh báo: Bạn đã rời trang ${state.tabViolations} lần. Lần thứ 3 bài thi sẽ bị thu!`);
  }
}

function updateTimer() {
  const minutes = Math.floor(state.timeLeft / 60);
  const seconds = state.timeLeft % 60;
  document.getElementById('timer').textContent = 
    `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  if (state.timeLeft < 300 && state.timeLeft > 0) {
    document.getElementById('timer').style.color = 'var(--warning)';
  }
  
  if (state.timeLeft < 60 && state.timeLeft > 0) {
    document.getElementById('timer').style.color = 'var(--danger)';
  }
}

document.getElementById('submitBtn').addEventListener('click', () => {
  if (confirm('Bạn có chắc muốn nộp bài?')) {
    submitExam(false);
  }
});

async function submitExam(isAuto) {
  clearInterval(state.timerInterval);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  
  const payload = {
    name: state.studentInfo.name,
    className: state.studentInfo.className,
    dob: state.studentInfo.dob,
    answers: state.studentAnswers,
    examId: state.examData.examId,
    violations: state.tabViolations
  };
  
  try {
    const response = await fetch(api('/student/submit'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    showPage('resultPage');
    
    if (data.ok) {
      document.getElementById('resultMessage').textContent = 
        isAuto ? 'Bài làm đã được tự động nộp.' : 'Bài làm đã nộp thành công!';
      
      if (data.score !== undefined && data.score !== null) {
        document.getElementById('scoreDisplay').textContent = `${data.score} điểm`;
      } else {
        document.getElementById('scoreDisplay').textContent = 'Chờ giáo viên chấm';
      }
    } else {
      document.getElementById('resultMessage').textContent = 
        'Có lỗi: ' + (data.error || 'Không xác định');
    }
  } catch (error) {
    showPage('resultPage');
    document.getElementById('resultMessage').textContent = 
      'Lỗi kết nối: ' + error.message;
  }
}

document.getElementById('backToHome').addEventListener('click', () => {
  state.userRole = null
  state.className = null;
  state.studentInfo = null;
  state.examData = null;
  state.studentAnswers = {};
  showPage('loginPage');
  document.getElementById('passwordInput').value = '';
});
