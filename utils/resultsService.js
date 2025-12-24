// utils/resultsService.js
import fs from 'fs';
import path from 'path';

const resultFile = path.join(process.cwd(), 'data', 'result.json');

export async function getClassResults(classId) {
  if (!fs.existsSync(resultFile)) return [];

  try {
    const raw = fs.readFileSync(resultFile, 'utf8');
    const allResults = JSON.parse(raw);
    return allResults[classId] || [];
  } catch (err) {
    console.error('Lỗi đọc file kết quả:', err.message);
    return [];
  }
}
