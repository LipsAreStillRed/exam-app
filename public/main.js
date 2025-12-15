document.addEventListener('DOMContentLoaded', () => {
  const api = (path) => `${window.location.origin}${path}`;

  const pages = ['loginPage', 'teacherPage', 'studentInfoPage', 'examPage', 'resultPage'];
  const showPage = (id) => {
    pages.forEach(p => document.getElementById(p).classList.remove('active'));
    document.getElementById(id).classList.add('active');
  };

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('passwordInput').value.trim();
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
        document.getElementById('studentClass').value = data.className;
      }
    } else {
      document.getElementById('loginError').textContent = data.error || 'Đăng nhập thất bại';
    }
  });

  async function loadExamsList() {
    const res = await fetch(api('/exam/list'));
    const data = await res.json();
    if (data.ok) renderExamsList(data.exams);
  }

  function renderExamsList(exams) {
    const container = document.getElementById('examsList');
    container.innerHTML = '';
    if (exams.length === 0) {
      container.innerHTML = '<p class="empty-state">Chưa có đề thi</p>';
      return;
    }
    exams.forEach(exam => {
      const item = document.createElement('div');
      item.className = 'exam-item';
      item.innerHTML = `
        <strong>${exam.name}</strong>
        <span>${exam.questionCount} câu hỏi</span>
        <button class="btn btn-sm" data-id="${exam.id}">Chi tiết</button>
      `;
      item.querySelector('button').addEventListener('click', () => {
        openExamDetailModal(exam.id);
      });
      container.appendChild(item);
    });
  }

  async function openExamDetailModal(examId) {
    const res = await fetch(api(`/exam/${examId}`));
    const data = await res.json();
    if (!data.ok) return alert('Không tải được đề');

    const modal = document.getElementById('examDetailModal');
    const content = document.getElementById('examDetailContent');
    const exam = data.exam;
    content.innerHTML = `
      <p><strong>Tên đề:</strong> ${exam.originalName}</p>
      <p><strong>Số câu hỏi:</strong> ${exam.questions.length}</p>
      <p><strong>Thời gian:</strong> ${exam.timeMinutes} phút</p>
      <p><strong>Mật khẩu:</strong> ${exam.password || 'Không có'}</p>
    `;
    modal.classList.add('active');

    document.getElementById('saveAnswers').onclick = async () => {
      const answers = {}; // bạn có thể thêm logic lấy đáp án từ giao diện
      const res = await fetch(api(`/exam/${examId}/answers`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
      });
      const result = await res.json();
      alert(result.message || 'Đã lưu đáp án');
    };

    document.getElementById('sendReport').onclick = async () => {
      const res = await fetch(api(`/report/send/${examId}`));
      const result = await res.json();
      alert(result.message || 'Đã gửi báo cáo');
    };

    document.getElementById('deleteExam').onclick = async () => {
      if (!confirm('Bạn có chắc muốn xóa đề này?')) return;
      const res = await fetch(api(`/exam/${examId}`), { method: 'DELETE' });
      const result = await res.json();
      alert(result.message || 'Đã xóa đề');
      modal.classList.remove('active');
      loadExamsList();
    };
  }

  document.getElementById('closeModal').onclick = () => {
    document.getElementById('examDetailModal').classList.remove('active');
  };

  async function loadSubmissionsList() {
    const container = document.getElementById('submissionsList');
    container.innerHTML = '<p class="empty-state">Đang tải...</p>';
    // bạn có thể thêm logic tải bài nộp gần đây nếu có API
  }

  document.getElementById('logoutTeacher').onclick = () => showPage('loginPage');
  document.getElementById('logoutStudent').onclick = () => showPage('loginPage');
});
