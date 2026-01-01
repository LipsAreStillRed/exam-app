// utils/mathParser.js - Parse công thức từ Word Equation
import { DOMParser } from '@xmldom/xmldom';

/**
 * Chuyển đổi OMML (Office Math Markup Language) sang LaTeX
 * Word Equation được lưu dưới dạng OMML trong XML
 */
export function ommlToLatex(ommlString) {
  if (!ommlString || typeof ommlString !== 'string') return '';
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(ommlString, 'text/xml');
    
    // Tìm các node toán học
    const mathNodes = doc.getElementsByTagNameNS('*', 'oMath');
    if (mathNodes.length === 0) return '';
    
    let latex = '';
    for (let i = 0; i < mathNodes.length; i++) {
      latex += parseOMathNode(mathNodes[i]);
    }
    
    return latex.trim();
  } catch (err) {
    console.error('OMML parsing error:', err);
    return '';
  }
}

function parseOMathNode(node) {
  if (!node || !node.childNodes) return '';
  
  let result = '';
  
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    const nodeName = child.localName || child.nodeName;
    
    switch (nodeName) {
      case 'f': // Fraction (phân số)
        result += parseFraction(child);
        break;
      case 'sup': // Superscript (mũ)
        result += parseSuperscript(child);
        break;
      case 'sub': // Subscript (chỉ số dưới)
        result += parseSubscript(child);
        break;
      case 'sSub': // Subscript with base
        result += parseSubSupScript(child);
        break;
      case 'sSup': // Superscript with base
        result += parseSubSupScript(child);
        break;
      case 'rad': // Root (căn)
        result += parseRoot(child);
        break;
      case 'r': // Run (text thường)
        result += parseRun(child);
        break;
      case 'func': // Function (sin, cos, log...)
        result += parseFunction(child);
        break;
      case 'd': // Delimiter (ngoặc, dấu...)
        result += parseDelimiter(child);
        break;
      default:
        // Đệ quy parse các node con
        result += parseOMathNode(child);
    }
  }
  
  return result;
}

function parseFraction(node) {
  const num = getElementContent(node, 'num');
  const den = getElementContent(node, 'den');
  return `\\frac{${num}}{${den}}`;
}

function parseSuperscript(node) {
  const base = getElementContent(node, 'e');
  const sup = getElementContent(node, 'sup');
  return `${base}^{${sup}}`;
}

function parseSubscript(node) {
  const base = getElementContent(node, 'e');
  const sub = getElementContent(node, 'sub');
  return `${base}_{${sub}}`;
}

function parseSubSupScript(node) {
  const base = getElementContent(node, 'e');
  const sub = getElementContent(node, 'sub');
  const sup = getElementContent(node, 'sup');
  
  if (sub && sup) {
    return `${base}_{${sub}}^{${sup}}`;
  } else if (sub) {
    return `${base}_{${sub}}`;
  } else if (sup) {
    return `${base}^{${sup}}`;
  }
  return base;
}

function parseRoot(node) {
  const deg = getElementContent(node, 'deg');
  const e = getElementContent(node, 'e');
  
  if (deg && deg !== '2') {
    return `\\sqrt[${deg}]{${e}}`;
  }
  return `\\sqrt{${e}}`;
}

function parseRun(node) {
  const tNodes = node.getElementsByTagNameNS('*', 't');
  if (tNodes.length === 0) return '';
  
  let text = '';
  for (let i = 0; i < tNodes.length; i++) {
    text += tNodes[i].textContent || '';
  }
  
  // Escape các ký tự đặc biệt LaTeX
  return text
    .replace(/\\/g, '\\textbackslash ')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\$/g, '\\$')
    .replace(/%/g, '\\%')
    .replace(/#/g, '\\#')
    .replace(/&/g, '\\&')
    .replace(/_/g, '\\_')
    .replace(/\^/g, '\\^{}');
}

function parseFunction(node) {
  const funcName = getElementContent(node, 'fName');
  const e = getElementContent(node, 'e');
  return `\\${funcName}(${e})`;
}

function parseDelimiter(node) {
  const content = parseOMathNode(node);
  const begChr = node.getElementsByTagNameNS('*', 'begChr')[0];
  const endChr = node.getElementsByTagNameNS('*', 'endChr')[0];
  
  let begin = '(';
  let end = ')';
  
  if (begChr) {
    const val = begChr.getAttribute('m:val') || begChr.getAttribute('val');
    if (val) begin = val;
  }
  if (endChr) {
    const val = endChr.getAttribute('m:val') || endChr.getAttribute('val');
    if (val) end = val;
  }
  
  return `\\left${begin}${content}\\right${end}`;
}

function getElementContent(node, tagName) {
  if (!node) return '';
  
  const elements = node.getElementsByTagNameNS('*', tagName);
  if (elements.length === 0) return '';
  
  return parseOMathNode(elements[0]);
}

/**
 * Wrapper để dễ sử dụng trong parseExamContent
 */
export function extractMathFromText(text) {
  // Pattern để tìm công thức trong text
  // Có thể là inline như "giá trị x=2" hoặc block riêng
  const mathPatterns = [
    /\$\$(.*?)\$\$/g,  // LaTeX block: $$...$$
    /\$(.*?)\$/g,      // LaTeX inline: $...$
    /\\\[(.*?)\\\]/g,  // LaTeX block: \[...\]
    /\\\((.*?)\\\)/g   // LaTeX inline: \(...\)
  ];
  
  let hasMath = false;
  for (const pattern of mathPatterns) {
    if (pattern.test(text)) {
      hasMatch = true;
      break;
    }
  }
  
  return { text, hasmath: hasMatch };
}

/**
 * Chuyển LaTeX thành HTML hiển thị được (dùng MathJax hoặc KaTeX)
 */
export function wrapMathInHTML(text) {
  if (!text) return '';
  
  // Wrap inline math: $...$ → \(...\)
  let result = text.replace(/\$([^\$]+)\$/g, '\\($1\\)');
  
  // Wrap block math: $$...$$ → \[...\]
  result = result.replace(/\$\$([^\$]+)\$\$/g, '\\[$1\\]');
  
  return result;
}

export default {
  ommlToLatex,
  extractMathFromText,
  wrapMathInHTML
};
