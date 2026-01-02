// utils/parseExamContent.js - ✅ HYBRID PARSER
// Xử lý cả text thô VÀ equation chuẩn

/**
 * ✅ Detect và wrap công thức tự động
 */
function smartMathWrap(text) {
  if (!text) return text;
  
  let result = text;
  
  // ✅ 1. Đã có $ rồi thì giữ nguyên
  if (result.includes('$')) {
    return result;
  }
  
  // ✅ 2. Xử lý ký hiệu độ: ^0^C → °C
  result = result.replace(/\^0\^([A-Z])/g, '°$1');
  result = result.replace(/\^\{?0\}?\^([A-Z])/g, '°$1');
  
  // ✅ 3. Xử lý số mũ: 10^{6} → 10⁶
  const superscriptMap = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
  };
  
  result = result.replace(/\^(\d)/g, (match, digit) => superscriptMap[digit] || match);
  result = result.replace(/\^\{(\d+)\}/g, (match, num) => {
    return num.split('').map(d => superscriptMap[d] || d).join('');
  });
  
  // ✅ 4. Xử lý số dưới: _{i} → ᵢ
  const subscriptMap = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    'i': 'ᵢ', 'j': 'ⱼ', 'n': 'ₙ', 'x': 'ₓ'
  };
  
  result = result.replace(/_(\w)/g, (match, char) => subscriptMap[char] || match);
  result = result.replace(/_\{(\w+)\}/g, (match, str) => {
    return str.split('').map(c => subscriptMap[c] || c).join('');
  });
  
  // ✅ 5. Xử lý dấu nhân: {2,3.10}^{6} → 2,3×10⁶
  result = result.replace(/\{([0-9,]+)\.([0-9]+)\}\^\{?(\d+)\}?/g, '$1.$2×10$3');
  result = result.replace(/\{([0-9,]+)\.([0-9]+)\}\^(\d)/g, (match, p1, p2, p3) => {
    return `${p1}.${p2}×10${superscriptMap[p3] || p3}`;
  });
  
  // ✅ 6. Loại bỏ ký tự đặc biệt thừa
  result = result.replace(/〖([^〗]+)〗/g, '$1');
  result = result.replace(/\\_/g, '_');
  result = result.replace(/\\ /g, ' ');
  
  // ✅ 7. Detect có cần wrap $ không
  const needsMath = /[°×÷±≈≠≤≥∞∑∫√π∆]|⁰|¹|²|³|⁴|⁵|⁶|⁷|⁸|⁹|₀|₁|₂|₃|₄|₅|₆|₇|₈|₉/g.test(result);
  
  if (needsMath) {
    // Tách thành các phần: text thường và công thức
    const parts = [];
    let lastIndex = 0;
    
    // Tìm các đoạn có ký hiệu toán
    const mathRegex = /([A-Za-z0-9°×÷±≈≠≤≥∞∑∫√π∆⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉\(\)\[\]\{\}=\+\-\*\/\.\,]+)/g;
    
    let match;
    while ((match = mathRegex.exec(result)) !== null) {
      // Text trước công thức
      if (match.index > lastIndex) {
        parts.push(result.substring(lastIndex, match.index));
      }
      
      // Công thức (wrap trong $)
      const formula = match[1];
      if (/[°×÷±≈≠≤≥∞∑∫√π∆⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/.test(formula)) {
        parts.push(`$${formula}$`);
      } else {
        parts.push(formula);
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // Text còn lại
    if (lastIndex < result.length) {
      parts.push(result.substring(lastIndex));
    }
    
    result = parts.join('');
  }
  
  // ✅ 8. Normalize spaces
  result = result.replace(/\s+/g, ' ').trim();
  
  return result;
}

/**
 * ✅ Parse exam content
 */
export function parseExamContent(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sections = [];
  let currentSection = null;
  let currentQuestion = null;

  const pushQuestion = () => {
    if (currentQuestion && currentSection) {
      // ✅ Smart wrap cho question
      if (currentQuestion.question) {
        currentQuestion.question = smartMathWrap(currentQuestion.question);
      }
      
      // ✅ Smart wrap cho options
      if (currentQuestion.options) {
        currentQuestion.options = currentQuestion.options.map(opt => ({
          ...opt,
          text: smartMathWrap(opt.text || '')
        }));
      }
      
      // ✅ Smart wrap cho subQuestions
      if (currentQuestion.subQuestions) {
        currentQuestion.subQuestions = currentQuestion.subQuestions.map(sub => ({
          ...sub,
          text: smartMathWrap(sub.text || '')
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
    // Detect sections
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
    
    // Detect câu hỏi
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
    
    // Detect options: A. B. C. D.
    if (/^[A-D]\.\s+/.test(line) && currentSection?.type === 'multiple_choice') {
      const key = line[0];
      const textPart = line.replace(/^[A-D]\.\s+/, '').trim();
      currentQuestion?.options.push({ key, text: textPart });
      return;
    }
    
    // Detect sub-questions: a) b) c) d) hoặc a\) b\)
    if (/^[a-e]\\?\)\s+/i.test(line) && currentSection?.type === 'true_false') {
      const key = line[0].toLowerCase();
      const textPart = line.replace(/^[a-e]\\?\)\s+/i, '').trim();
      currentQuestion?.subQuestions.push({ key, text: textPart });
      return;
    }
    
    // Short answer: append vào question
    if (currentSection?.type === 'short_answer' && currentQuestion) {
      if (!/^(Phần|PHẦN|Câu)\s/i.test(line)) {
        currentQuestion.question += ' ' + line;
      }
      return;
    }
    
    // Continuation
    if (currentQuestion && !/^(Phần|PHẦN|Câu|[A-D]\.|[a-e]\\?\))/i.test(line)) {
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
