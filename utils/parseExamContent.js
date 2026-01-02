// utils/parseExamContent.js - ✅ FIXED VERSION
// Hỗ trợ parse công thức toán học từ Word

/**
 * Chuyển đổi công thức từ Word sang LaTeX
 * - Từ Word: T (K)=t(_(^0)C)+273 hoặc ${2,3.10}^{6}$
 * - Ra LaTeX: $T(K) = t(°C) + 273$ hoặc $2.3 \times 10^6$
 */
function cleanMathFormula(text) {
  if (!text) return text;
  
  let result = text;
  
  // ✅ Fix 1: Chuyển _(^0) thành ° (độ)
  result = result.replace(/\(_\{\}\^\{0\}\{?([A-Z])\}?\)/g, '°$1');
  result = result.replace(/\(_\^\{?0\}?\{?([A-Z])\}?\)/g, '°$1');
  result = result.replace(/\^\{?0\}?\{?([A-Z])\}/g, '°$1');
  
  // ✅ Fix 2: Chuyển {} thành dấu nhân
  result = result.replace(/\{([0-9,.]+)\.([0-9]+)\}\^\{([0-9]+)\}/g, '$1 \\times 10^{$3}');
  result = result.replace(/〖([^〗]+)〗/g, '$1');
  
  // ✅ Fix 3: Loại bỏ các ký tự Word thừa
  result = result.replace(/\\_\{\}/g, '_');
  result = result.replace(/\\\$/g, '');
  result = result.replace(/\\ +/g, ' ');
  
  return result;
}

/**
 * Wrap công thức trong $...$ để MathJax render
 */
function wrapMathInDollar(text) {
  if (!text) return text;
  
  // Nếu đã có $ thì giữ nguyên
  if (text.includes('$')) {
    return cleanMathFormula(text);
  }
  
  // Detect công thức (có các ký tự đặc biệt)
  const hasMath = /[_^{}\\]|\\times|\\frac|\\sqrt/i.test(text);
  
  if (hasMath) {
    return `$${cleanMathFormula(text)}$`;
  }
  
  return text;
}

export function parseExamContent(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sections = [];
  let currentSection = null;
  let currentQuestion = null;

  const pushQuestion = () => {
    if (currentQuestion && currentSection) {
      // ✅ Clean công thức trước khi lưu
      if (currentQuestion.question) {
        currentQuestion.question = wrapMathInDollar(currentQuestion.question);
      }
      if (currentQuestion.options) {
        currentQuestion.options = currentQuestion.options.map(opt => ({
          ...opt,
          text: wrapMathInDollar(opt.text)
        }));
      }
      if (currentQuestion.subQuestions) {
        currentQuestion.subQuestions = currentQuestion.subQuestions.map(sub => ({
          ...sub,
          text: wrapMathInDollar(sub.text)
        }));
      }
      
      currentSection.questions.push(currentQuestion);
      currentQuestion = null;
    }
  };
  
  const pushSection = () => {
    if (currentSection) {
      pushQuestion();
      sections.push(currentSection);
      currentSection = null;
    }
  };

  lines.forEach(line => {
    if (/^Phần\s*1\b/i.test(line)) {
      pushSection();
      currentSection = { title: 'Phần 1: Trắc nghiệm nhiều lựa chọn', type: 'multiple_choice', questions: [] };
    } else if (/^Phần\s*2\b/i.test(line) || /^PHẦN\s*II\b/.test(line)) {
      pushSection();
      currentSection = { title: 'Phần 2: Đúng/Sai', type: 'true_false', questions: [] };
    } else if (/^Phần\s*3\b/i.test(line) || /^PHẦN\s*III\b/.test(line)) {
      pushSection();
      currentSection = { title: 'Phần 3: Trả lời ngắn', type: 'short_answer', questions: [] };
    }
    else if (/^Câu\s*\d+[:.]/i.test(line)) {
      pushQuestion();
      const id = line.match(/\d+/)?.[0];
      const stem = line.replace(/^Câu\s*\d+[:.]\s*/i, '').trim();
      if (currentSection?.type === 'true_false') {
        currentQuestion = { id, type: 'true_false', question: stem, subQuestions: [] };
      } else if (currentSection?.type === 'short_answer') {
        currentQuestion = { id, type: 'short_answer', question: stem };
      } else {
        currentQuestion = { id, type: 'multiple_choice', question: stem, options: [] };
      }
    }
    else if (/^[A-D]\.\s+/.test(line) && currentSection?.type === 'multiple_choice') {
      const key = line[0];
      const textPart = line.replace(/^[A-D]\.\s+/, '').trim();
      currentQuestion?.options.push({ key, text: textPart });
    }
    else if (/^[a-d]\)\s+/i.test(line) && currentSection?.type === 'true_false') {
      const key = line[0].toLowerCase();
      const textPart = line.slice(3).trim();
      currentQuestion?.subQuestions.push({ key, text: textPart });
    }
    else if (currentSection?.type === 'short_answer' && currentQuestion) {
      currentQuestion.question += ' ' + line;
    }
  });

  pushQuestion();
  pushSection();
  return sections;
}

export function flattenSections(sections) {
  let idx = 0;
  return sections.flatMap(sec => {
    return sec.questions.map(q => ({
      ...q,
      sectionType: sec.type,
      part: sec.type === 'multiple_choice' ? 1 : (sec.type === 'true_false' ? 2 : 3),
      displayIndex: ++idx
    }));
  });
}
