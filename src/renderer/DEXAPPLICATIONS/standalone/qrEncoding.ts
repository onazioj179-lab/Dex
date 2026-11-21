// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import QRCode from 'qrcode';
import { qrMatrixToSVG, type QrSvgOptions } from '../../../shared/format/qrSvg';

export type QrErrorLevel = 'L' | 'M' | 'Q' | 'H';
export const QR_BATCH_LIMIT = 24;

export function createQrMatrix(data: string, level: QrErrorLevel): boolean[][] {
  if (!data || new TextEncoder().encode(data).length > 3000) throw new RangeError('QR data is empty or too long.');
  const { modules } = QRCode.create(data, { errorCorrectionLevel: level });
  return Array.from({ length: modules.size }, (_, row) =>
    Array.from({ length: modules.size }, (_, column) => Boolean(modules.get(row, column))));
}

export function createQrBatch(text: string, level: QrErrorLevel) {
  if (text.length > 20000) return { error: 'Batch input exceeds 20,000 characters.', items: [] };
  const rows = text.split(/\r\n|\r|\n/)
    .map((value, index) => ({ value, line: index + 1 }))
    .filter(row => row.value.trim());
  if (rows.length > QR_BATCH_LIMIT) return { error: 'Batch supports up to 24 nonempty lines.', items: [] };
  const items = rows.map(row => {
    try { return { line: row.line, matrix: createQrMatrix(row.value, level) }; }
    catch { return { line: row.line, matrix: null }; }
  });
  return { error: '', items };
}

export function qrBatchToSVG(matrices: boolean[][][], options: QrSvgOptions): string {
  const size = options.pixelSize ?? 240;
  const gap = 12;
  const columns = Math.min(3, matrices.length);
  const width = columns * size + (columns + 1) * gap;
  const rows = Math.ceil(matrices.length / Math.max(1, columns));
  const height = rows * size + (rows + 1) * gap;
  const tiles = matrices.map((matrix, index) => {
    const x = gap + (index % columns) * (size + gap);
    const y = gap + Math.floor(index / columns) * (size + gap);
    return qrMatrixToSVG(matrix, { ...options, pixelSize: size }).replace('<svg ', '<svg x="' + x + '" y="' + y + '" ');
  });
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">'
    + tiles.join('') + '</svg>';
}
