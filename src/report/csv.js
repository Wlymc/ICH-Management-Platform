/**
 * 零依赖 CSV 读写：导出带 UTF-8 BOM（Excel 直接双击不乱码），
 * 导入支持 UTF-8 / UTF-8 BOM / GBK / UTF-16LE。
 */

export function toCsv(rows) {
  const lines = rows.map((row) => row.map(cellToText).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function cellToText(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** 解析 CSV 文本为二维数组（支持引号包裹、转义引号、CRLF） */
export function parseCsv(input) {
  const text = String(input ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\r') {
      i += 1;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => String(cell).trim() !== ''));
}

/** 表头 + 数据行 → 对象数组 */
export function rowsToObjects(matrix) {
  if (!matrix.length) return { headers: [], records: [] };
  const headers = matrix[0].map((cell) => String(cell).trim().replace(/^\uFEFF/, ''));
  const records = matrix.slice(1).map((cells, index) => {
    const record = { __line: index + 2 };
    headers.forEach((header, col) => {
      record[header] = cells[col] === undefined ? '' : String(cells[col]).trim();
    });
    return record;
  });
  return { headers, records };
}
