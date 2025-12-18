// utils/parseExamContent.js
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
  // gắn part index để render “Câu 1, Câu 2…” theo thứ tự hiển thị sau trộn
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
