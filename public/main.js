// Hàm gọi API backend
function api(path) {
  return `/api${path}`;
}

// Hiển thị/ẩn trang
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// Gọi API login
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

// Mở modal chi tiết đề thi
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

      const resSave = await fetch(api(`/exam/${examId}/correct-answers`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
      });
      const result = await resSave.json();
      alert(result.message || (result.ok ? 'Đã lưu đáp án' : 'Lỗi lưu đáp án'));
    } catch (err) {
      alert('Lỗi lưu đáp án');
    }
  };
}

// Đóng modal
function closeExamDetailModal() {
  document.getElementById('examDetailModal').classList.remove('active');
}

// Load danh sách đề
async function loadExamList() {
  const res = await fetch(api('/exam/list'));
  const data = await res.json();
  if (!data.ok) {
    alert('Không tải được danh sách đề');
    return;
  }
  const listDiv = document.getElementById('examList');
  listDiv.innerHTML = '';
  data.exams.forEach(exam => {
    const item = document.createElement('div');
    item.className = 'exam-item';
    item.innerHTML = `
      <span>${exam.name} (${exam.questionCount} câu)</span>
      <button onclick="openExamDetailModal('${exam.id}')">Chi tiết</button>
    `;
    listDiv.appendChild(item);
  });
}

// Khởi động
document.addEventListener('DOMContentLoaded', () => {
  showPage('loginPage'); // mặc định hiển thị trang login
  loadExamList();        // tải danh sách đề cho giáo viên

  // Toggle mật khẩu
  document.getElementById('togglePassword').addEventListener('click', function() {
    const input = document.getElementById('passwordInput');
    const icon = document.getElementById('eyeIcon');
    if (input.type === 'password') {
      input.type = 'text';
      icon.innerHTML = '<path d="M17.94 17.94..."/>'; // icon mở
    } else {
      input.type = 'password';
      icon.innerHTML = '<path d="M1 12s4-8..."/><circle cx="12" cy="12" r="3"/>'; // icon đóng
    }
  });

  // Xử lý form login
  const form = document.getElementById('loginForm');
  const errBox = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.textContent = '';
    const pwd = document.getElementById('passwordInput').value.trim();
    try {
      const result = await handleLogin(pwd);
      if (result.role === 'teacher') {
        showPage('teacherPage');
        loadExamList();
      } else if (result.role === 'student') {
        showPage('studentInfoPage');
        document.getElementById('studentClass').value = result.className || '';
      }
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
    }
  });
});
