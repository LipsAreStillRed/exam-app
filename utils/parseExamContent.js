// utils/parseExamContent.js - ✅ ENHANCED PARSER

/**
 * ✅ Smart Math Wrap - Tự động detect và wrap công thức
 */
function smartMathWrap(text) {
  if (!text) return text;
  
  let result = text;
  
  // 1. Đã có $ rồi thì giữ nguyên
  if (result.includes('$')) {
    return result;
  }
  
  // 2. Xử lý ký hiệu độ: ^0^C → °C
  result = result.replace(/\^0\^([A-Z])/g, '°$1');
  result = result.replace(/\^\{?0\}?\^([A-Z])/g, '°$1');
  
  // 3. Xử lý số mũ: 10^6 → 10⁶
  const superscriptMap = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
  };
  
  result = result.replace(/\^(\d)/g, (m, d) => superscriptMap[d] || m);
  result = result.replace(/\^\{(\d+)\}/g, (m, num) => {
    return num.split('').map(d => superscriptMap[d] || d).join('');
  });
  
  // 4. Normalize spaces
  result = result.replace(/\s+/g, ' ').trim();
  
  return result;
}

/**
 * ✅ ENHANCED Parse Exam Content
 */
export function parseExamContent(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sections = [];
  let currentSection = null;
  let currentQuestion = null;
  let pendingOptions = []; // ✅ Lưu options tạm thời

  const pushQuestion = () => {
    if (currentQuestion && currentSection) {
      // ✅ Apply pending options
      if (pendingOptions.length > 0) {
        currentQuestion.options = pendingOptions;
        pendingOptions = [];
      }
      
      // Smart wrap
      if (currentQuestion.question) {
        currentQuestion.question = smartMathWrap(currentQuestion.question);
      }
      
      if (currentQuestion.options) {
        currentQuestion.options = currentQuestion.options.map(opt => ({
          ...opt,
          text: smartMathWrap(opt.text || '')
        }));
      }
      
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
    
    // ✅ Detect câu hỏi: "Câu 1:" hoặc "Câu 1."
    const questionMatch = line.match(/^Câu\s*(\d+)[:.]\s*(.*)/i);
    if (questionMatch) {
      pushQuestion();
      
      const id = questionMatch[1];
      const stem = questionMatch[2].trim();
      
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
    
    // ✅ ENHANCED: Detect options với nhiều pattern
    // Pattern 1: "A. text" (standard)
    // Pattern 2: "A.text" (no space)
    // Pattern 3: "A) text" (parenthesis)
    const optionMatch = line.match(/^([A-D])[\.\)]\s*(.*)/i);
    if (optionMatch && currentSection?.type === 'multiple_choice' && currentQuestion) {
      const key = optionMatch[1].toUpperCase();
      const textPart = optionMatch[2].trim();
      
      // ✅ Check if this option belongs to current question
      // If we already have 4 options, this might be a new question
      if (pendingOptions.length >= 4) {
        // Start new question context
        console.warn(`⚠️ Line ${lineIndex}: Found option ${key} but already have 4 options. Might be formatting issue.`);
      }
      
      pendingOptions.push({ key, text: textPart });
      
      // ✅ Auto-assign if we have all 4 options
      if (pendingOptions.length === 4 && currentQuestion) {
        currentQuestion.options = [...pendingOptions];
        pendingOptions = [];
      }
      
      return;
    }
    
    // ✅ Detect sub-questions: a) b) c) d)
    const subQuestionMatch = line.match(/^([a-e])[\.\)]\s*(.*)/i);
    if (subQuestionMatch && currentSection?.type === 'true_false' && currentQuestion) {
      const key = subQuestionMatch[1].toLowerCase();
      const textPart = subQuestionMatch[2].trim();
      currentQuestion.subQuestions.push({ key, text: textPart });
      return;
    }
    
    // ✅ Continuation of question or option text
    if (currentQuestion) {
      // If we have pending options, append to last option
      if (pendingOptions.length > 0 && !/^(Câu|Phần|PHẦN)/i.test(line)) {
        const lastOption = pendingOptions[pendingOptions.length - 1];
        lastOption.text += ' ' + line;
      } else if (!/^(Câu|Phần|PHẦN|[A-D][\.\)]|[a-e][\.\)])/i.test(line)) {
        // Otherwise append to question
        currentQuestion.question += ' ' + line;
      }
    }
  });

  pushQuestion();
  pushSection();
  
  // ✅ VALIDATION: Ensure all multiple_choice questions have 4 options
  sections.forEach(section => {
    if (section.type === 'multiple_choice') {
      section.questions = section.questions.map(q => {
        if (!q.options || q.options.length !== 4) {
          console.warn(`⚠️ Câu ${q.id}: Chỉ có ${q.options?.length || 0} options, bổ sung mặc định`);
          
          const existingOptions = q.options || [];
          const letters = ['A', 'B', 'C', 'D'];
          
          q.options = letters.map((letter, idx) => {
            if (existingOptions[idx]) {
              return { key: letter, text: existingOptions[idx].text };
            }
            return { key: letter, text: `Đáp án ${letter} (cần bổ sung)` };
          });
        }
        return q;
      });
    }
  });
  
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
