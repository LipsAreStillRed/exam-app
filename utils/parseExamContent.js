// utils/parseExamContent.js - ✅ FINAL FIX VERSION
// Xử lý tất cả lỗi từ Word: công thức, format, missing values

/**
 * ✅ Clean và fix công thức toán từ Word
 */
function cleanMathFormula(text) {
  if (!text) return text;
  
  let result = text;
  
  // ✅ Fix 1: Xử lý ^0^C, ^0^X thành °C, °X
  result = result.replace(/\^0\^([A-Z])/g, '°$1');
  result = result.replace(/\^\{?0\}?\^([A-Z])/g, '°$1');
  
  // ✅ Fix 2: Xử lý _(^0) thành °
  result = result.replace(/\(_\{\}\^\{0\}\{?([A-Z])\}?\)/g, '°$1');
  result = result.replace(/\(_\^\{?0\}?\{?([A-Z])\}?\)/g, '°$1');
  
  // ✅ Fix 3: Xử lý {2,3.10}^{6} thành 2.3 × 10^6
  result = result.replace(/\{([0-9,]+)\.([0-9]+)\}\^\{([0-9]+)\}/g, '$1.$2 \\times 10^{$3}');
  result = result.replace(/\$?\{([0-9,]+)\.([0-9]+)\}\^\{([0-9]+)\}\$/g, '$1.$2 \\times 10^{$3}');
  
  // ✅ Fix 4: Xử lý 〖...〗 (Unicode brackets)
  result = result.replace(/〖([^〗]+)〗/g, '$1');
  
  // ✅ Fix 5: Xử lý $...$ bị lỗi
  // Từ: $T\ (K) = t(_{}^{0}{C) + 273}$
  // Thành: T(K) = t(°C) + 273
  result = result.replace(/\$([^$]+)\$/g, (match, inner) => {
    let cleaned = inner
      .replace(/\\_\{\}/g, '_')
      .replace(/\\ +/g, ' ')
      .replace(/\{([A-Z])\}/g, '$1')
      .replace(/_\{\}\^\{0\}\{([A-Z])\}/g, '°$1')
      .replace(/\(_\{\}\^\{0\}\{([A-Z])\) \+ ([0-9]+)\}/g, '(°$1) + $2');
    return `$${cleaned}$`;
  });
  
  // ✅ Fix 6: Xử lý dấu · (middle dot) thành \cdot
  result = result.replace(/·/g, '\\cdot ');
  result = result.replace(/\./g, '.'); // Normalize dots
  
  // ✅ Fix 7: Loại bỏ các ký tự thừa
  result = result.replace(/\\\$/g, '');
  result = result.replace(/\\ +/g, ' ');
  result = result.trim();
  
  return result;
}

/**
 * ✅ Wrap công thức trong $...$ nếu chưa có
 */
function wrapMathInDollar(text) {
  if (!text) return text;
  
  // Đã có $ rồi thì clean thôi
  if (text.includes('$')) {
    return cleanMathFormula(text);
  }
  
  // Detect có công thức không
  const hasMath = /[_^{}\\×·]|\\times|\\frac|\\sqrt|\\cdot|°[A-Z]/i.test(text);
  
  if (hasMath) {
    return `$${cleanMathFormula(text)}$`;
  }
  
  return text;
}

/**
 * ✅ Parse từng câu hỏi từ text
 */
export function parseExamContent(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sections = [];
  let currentSection = null;
  let currentQuestion = null;

  const pushQuestion = () => {
    if (currentQuestion && currentSection) {
      // ✅ Clean công thức và content
      if (currentQuestion.question) {
        currentQuestion.question = wrapMathInDollar(currentQuestion.question);
      }
      
      // ✅ Clean options
      if (currentQuestion.options) {
        currentQuestion.options = currentQuestion.options.map(opt => ({
          ...opt,
          text: wrapMathInDollar(opt.text || '')
        }));
      }
      
      // ✅ Clean subQuestions
      if (currentQuestion.subQuestions) {
        currentQuestion.subQuestions = currentQuestion.subQuestions.map(sub => ({
          ...sub,
          text: wrapMathInDollar(sub.text || '')
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

  lines.forEach((line, lineIndex) => {
    // ✅ Detect sections
    if (/^Phần\s*1\b/i.test(line) || /^PHẦN\s*I\b/i.test(line)) {
      pushSection();
      currentSection = { 
        title: 'Phần 1: Trắc nghiệm nhiều lựa chọn', 
        type: 'multiple_choice', 
        questions: [] 
      };
      return;
    }
    
    if (/^Phần\s*2\b/i.test(line) || /^PHẦN\s*II\b/i.test(line)) {
      pushSection();
      currentSection = { 
        title: 'Phần 2: Đúng/Sai', 
        type: 'true_false', 
        questions: [] 
      };
      return;
    }
    
    if (/^Phần\s*3\b/i.test(line) || /^PHẦN\s*III\b/i.test(line)) {
      pushSection();
      currentSection = { 
        title: 'Phần 3: Trả lời ngắn', 
        type: 'short_answer', 
        questions: [] 
      };
      return;
    }
    
    // ✅ Detect câu hỏi: "Câu 1.", "Câu 2:", etc.
    if (/^Câu\s*\d+[:.]/i.test(line)) {
      pushQuestion();
      
      const id = line.match(/\d+/)?.[0];
      const stem = line.replace(/^Câu\s*\d+[:.]\s*/i, '').trim();
      
      if (currentSection?.type === 'true_false') {
        currentQuestion = { 
          id, 
          type: 'true_false', 
          question: stem, 
          subQuestions: [] 
        };
      } else if (currentSection?.type === 'short_answer') {
        currentQuestion = { 
          id, 
          type: 'short_answer', 
          question: stem 
        };
      } else {
        currentQuestion = { 
          id, 
          type: 'multiple_choice', 
          question: stem, 
          options: [] 
        };
      }
      return;
    }
    
    // ✅ Detect options: A. B. C. D.
    if (/^[A-D]\.\s+/.test(line) && currentSection?.type === 'multiple_choice') {
      const key = line[0];
      const textPart = line.replace(/^[A-D]\.\s+/, '').trim();
      currentQuestion?.options.push({ key, text: textPart });
      return;
    }
    
    // ✅ Detect sub-questions: a) b) c) d)
    if (/^[a-d]\)\s+/i.test(line) && currentSection?.type === 'true_false') {
      const key = line[0].toLowerCase();
      const textPart = line.slice(3).trim();
      currentQuestion?.subQuestions.push({ key, text: textPart });
      return;
    }
    
    // ✅ Detect sub-questions: a\) b\) (escaped)
    if (/^[a-e]\\?\)\s+/i.test(line) && currentSection?.type === 'true_false') {
      const key = line[0].toLowerCase();
      const textPart = line.replace(/^[a-e]\\?\)\s+/i, '').trim();
      currentQuestion?.subQuestions.push({ key, text: textPart });
      return;
    }
    
    // ✅ Nếu là short_answer, append vào question
    if (currentSection?.type === 'short_answer' && currentQuestion) {
      // Nếu line này không phải section header hoặc câu hỏi mới
      if (!/^(Phần|PHẦN|Câu)\s/i.test(line)) {
        currentQuestion.question += ' ' + line;
      }
      return;
    }
    
    // ✅ Nếu là continuation của question hoặc option
    if (currentQuestion) {
      // Nếu không phải header mới
      if (!/^(Phần|PHẦN|Câu|[A-D]\.|[a-e]\))/i.test(line)) {
        // Append vào question text
        currentQuestion.question += ' ' + line;
      }
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
