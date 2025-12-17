// utils/parseExamContent.js
// Parser theo form Bộ GD: Phần 1 (MCQ), Phần 2 (Đúng/Sai), Phần 3 (Trả lời ngắn)

export function parseExamContent(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sections = [];
  let currentSection = null;
  let currentQuestion = null;

  const pushQuestion = () => {
    if (currentQuestion && currentSection) {
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
    if (/^Phần\s*1/i.test(line)) {
      pushSection();
      currentSection = { title: 'Phần 1: Trắc nghiệm nhiều lựa chọn', type: 'multiple_choice', questions: [] };
    } else if (/^Phần\s*2/i.test(line)) {
      pushSection();
      currentSection = { title: 'Phần 2: Đúng/Sai', type: 'true_false', questions: [] };
    } else if (/^Phần\s*3/i.test(line)) {
      pushSection();
      currentSection = { title: 'Phần 3: Trả lời ngắn', type: 'short_answer', questions: [] };
    }
    else if (/^Câu\s*\d+[:.]/i.test(line)) {
      pushQuestion();
      const id = line.match(/\d+/)?.[0];
      if (currentSection?.type === 'true_false') {
        currentQuestion = { id, type: 'true_false', question: line, subQuestions: [] };
      } else if (currentSection?.type === 'short_answer') {
        currentQuestion = { id, type: 'short_answer', question: line };
      } else {
        currentQuestion = { id, type: 'multiple_choice', question: line, options: [] };
      }
    }
    else if (/^[A-D]\./.test(line) && currentSection?.type === 'multiple_choice') {
      currentQuestion?.options.push({ key: line[0], text: line.slice(2).trim() });
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

export function smartShuffle(sections, enabled) {
  if (!enabled) return sections;
  return sections.map(sec => {
    const qs = [...sec.questions].sort(() => Math.random() - 0.5);
    if (sec.type === 'multiple_choice') {
      qs.forEach(q => {
        if (Array.isArray(q.options)) {
          q.options = [...q.options].sort(() => Math.random() - 0.5);
        }
      });
    }
    return { ...sec, questions: qs };
  });
}

export function flattenSections(sections) {
  return sections.flatMap(sec => sec.questions.map(q => ({ ...q, sectionType: sec.type })));
}
