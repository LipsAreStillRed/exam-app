import fs from 'fs';
import path from 'path';

export async function getClassResults(classId) {
  try {
    const filePath = path.join(process.cwd(), 'data', 'results.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    const allResults = JSON.parse(raw);
    return allResults[classId] || [];
  } catch (err) {
    console.error('Lỗi đọc file kết quả:', err.message);
    return [];
  }
}
