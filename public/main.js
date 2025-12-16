document.addEventListener('DOMContentLoaded', () => {
  const api = (path) => `${window.location.origin}${path}`;

  const pages = ['loginPage', 'teacherPage', 'studentInfoPage', 'examPage', 'resultPage'];
  const showPage = (id) => {
    pages.forEach(p => document.getElementById(p).classList.remove('active'));
    document.getElementById(id).classList.add('active');
  };

  // Toggle hiển thị mật khẩu
  const toggleBtn = document.getElementById('togglePassword');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const input = document.getElementById('passwordInput');
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  }

  // Đăng nhập
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('passwordInput').value.trim();
    const errBox = document.getElementById('loginError');
    errBox.textContent = '';

    try {
      const res = await fetch(api('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();
      if (data.ok) {
        if (data.role === 'teacher') {
          showPage('teacherPage');
          loadExamsList();
          loadSubmissionsList();
        } else {
          showPage('studentInfoPage');
          document.getElementById('studentClass').value = data.className || '';
        }
      } else {
        errBox.textContent = data.error || 'Đăng nhập thất bại';
      }
    } catch (err) {
      errBox.textContent = 'Không thể kết nối máy chủ';
    }
  });

  // Upload đề thi (CHẶN RELOAD)
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const uploadBtn = document.getElementById('uploadBtn');
      const msg = document.getElementById('uploadMessage');
      msg.className = 'message';
      msg.textContent = '';
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Đang upload...';

      try {
        const formData = new FormData(uploadForm);
        // Đảm bảo các name của input khớp: file, timeMinutes, password, shuffle
        // (input file có id="examFile" nhưng FormData sẽ lấy theo "name" tự động nếu có. Nếu không có "name", ta đặt thủ công:)
        const fileInput = document.getElementById('examFile');
        if (fileInput && fileInput.files && fileInput.files[0]) {
          formData.set('file', fileInput.files[0]); // trường name = file cho Multer
        }
        formData.set('timeMinutes', document.getElementById('timeMinutes').value || '45');
        formData.set('password', document.getElementById('examPassword').value || '');
        formData.set('shuffle', document.getElementById('shuffleQuestions').checked ? 'true' : 'false');

        const res = await fetch(api('/exam/upload'), {
          method: 'POST',
          body: formData
          // Không set Content-Type khi dùng FormData
        });

        // Tránh lỗi "Unexpected end of JSON input"
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Upload thất bại (HTTP ${res.status})`);
        }

        const data = await res.json();
        if (data.ok) {
          msg.className = 'message success';
          msg.textContent = `✅ Upload thành công! ${data.count} câu hỏi`;
          // Tải lại danh sách đề
          await loadExamsList();
          // Reset form tùy ý
          uploadForm.reset();
          document.getElementById('shuffleQuestions').checked = true;
        } else {
          msg.className = 'message error';
          msg.textContent = data.error || 'Upload thất bại';
        }
      } catch (err) {
        msg.className = 'message error';
        msg.textContent = `Upload thất bại: ${err.message || err}`;
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📤 Upload Đề';
      }
    });
  }

  // Tải danh sách đề
  async function loadExamsList() {
    const container = document.getElementById('examsList');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Đang tải...</p>';

    try {
      const res = await fetch(api('/exam/list'));
      if (!res.ok) {
        const text = await res.text();
        container.innerHTML = `<p class="empty-state">Lỗi tải danh sách: ${text}</p>`;
        return;
      }
      const data = await res.json();
      if (data.ok) {
        renderExamsList(data.exams || []);
      } else {
        container.innerHTML = `<p class="empty-state">Lỗi: ${data.error || 'Không rõ nguyên nhân'}</p>`;
      }
    } catch (err) {
      container.innerHTML = `<p class="empty-state">Không thể kết nối máy chủ</p>`;
    }
  }

  function renderExamsList(exams) {
    const container = document.getElementById('examsList');
    container.innerHTML = '';
    if (!exams || exams.length === 0) {
      container.innerHTML = '<p class="empty-state">Chưa có đề thi</p>';
      return;
    }
    exams.forEach(exam => {
      const item = document.createElement('div');
      item.className = 'exam-item';
      item.innerHTML = `
        <div class="exam-item__left">
          <strong>${exam.name}</strong>
          <span>${exam.questionCount} câu hỏi • ${exam.timeMinutes} phút</span>
          ${exam.hasPassword ? '<span class="tag">Có mật khẩu</span>' : ''}
        </div>
        <div class="exam-item__right">
          <button class="btn btn-sm" data-id="${exam.id}">Chi tiết</button>
        </div>
      `;
      item.querySelector('button').addEventListener('click', () => {
        openExamDetailModal(exam.id);
      });
      container.appendChild(item);
    });
  }

  // Mở modal chi tiết đề
  async function openExamDetailModal(examId) {
    const res = await fetch(api(`/exam/${examId}`));
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
  <hr />
  <p><strong>Trộn đề ở lần tạo:</strong> ${exam.metadata?.multipleChoice ? 'Đã trộn phần trắc nghiệm' : 'Không trộn'}</p>
  <p class="hint">Chọn đáp án đúng cho từng câu hỏi bên dưới:</p>
`;

exam.questions.forEach(q => {
  const div = document.createElement('div');
  div.className = 'question-block';
  div.innerHTML = `
    <h4>Câu ${q.id}</h4>
    <p>${q.question}</p>
    ${q.image ? `<img src="${q.image}" style="max-width:200px"/>` : ''}
    ${q.latex ? `<div class="latex">\\(${q.latex}\\)</div>` : ''}
    <div id="options_${q.id}"></div>
  `;
  content.appendChild(div);

  const optsDiv = div.querySelector(`#options_${q.id}`);
  if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
    q.options.forEach(opt => {
      const optEl = document.createElement('label');
      optEl.innerHTML = `
        <input type="radio" name="ans_${q.id}" value="${opt.key}" ${q.correctAnswer === opt.key ? 'checked' : ''}>
        ${opt.key}. ${opt.text}
      `;
      optsDiv.appendChild(optEl);
    });
  } else if (q.type === 'true_false') {
    ['Đúng','Sai'].forEach(val => {
      const optEl = document.createElement('label');
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
    optsDiv.appendChild(ta);
  }
});

MathJax.typesetPromise();

    modal.classList.add('active');

    // Lưu đáp án (mở rộng sau: tạo form nhập đáp án theo từng câu)
    document.getElementById('saveAnswers').onclick = async () => {
  try {
    const answers = {};
    document.querySelectorAll('[name^="ans_"]').forEach(input => {
      if ((input.type === 'radio' && input.checked) || input.tagName === 'TEXTAREA') {
        const qid = input.name.replace('ans_', '');
        answers[qid] = input.value;
      }
    });

    const resSave = await fetch(api(`/exam/${examId}/correct-answers`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers })
    });
    const result = await resSave.json();
    alert(result.message || 'Đã lưu đáp án');
  } catch (err) {
    alert('Lỗi lưu đáp án');
  }
};


    // Gửi báo cáo (nếu có route /report/send/:examId)
    document.getElementById('sendReport').onclick = async () => {
      try {
        const resReport = await fetch(api(`/report/send/${examId}`));
        const result = await resReport.json();
        alert(result.message || 'Đã gửi báo cáo');
      } catch (err) {
        alert('Lỗi gửi báo cáo');
      }
    };

    // Xóa đề
    document.getElementById('deleteExam').onclick = async () => {
      if (!confirm('Bạn có chắc muốn xóa đề này?')) return;
      try {
        const resDel = await fetch(api(`/exam/${examId}`), { method: 'DELETE' });
        const result = await resDel.json();
        alert(result.message || 'Đã xóa đề');
        modal.classList.remove('active');
        loadExamsList();
      } catch (err) {
        alert('Lỗi xóa đề');
      }
    };
  }

  // Đóng modal
  const closeModalBtn = document.getElementById('closeModal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      document.getElementById('examDetailModal').classList.remove('active');
    });
  }

  // Bài nộp gần đây (placeholder)
  async function loadSubmissionsList() {
    const container = document.getElementById('submissionsList');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Chưa có dữ liệu</p>';
    // TODO: bổ sung API nếu có
  }

  document.getElementById('logoutTeacher').onclick = () => showPage('loginPage');
  document.getElementById('logoutStudent').onclick = () => showPage('loginPage');
});
