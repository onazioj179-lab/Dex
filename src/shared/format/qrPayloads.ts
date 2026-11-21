// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
export function mailtoPayload(recipient: string, subject: string, body: string): string {
  const email = recipient.trim();
  if (!/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/u.test(email)) return '';
  const fields = [
    subject ? 'subject=' + encodeURIComponent(subject.replace(/[\r\n]+/g, ' ')) : '',
    body ? 'body=' + encodeURIComponent(body.replace(/\r\n|[\r\n]/g, '\r\n')) : '',
  ].filter(Boolean);
  return 'mailto:' + encodeURIComponent(email).replace('%40', '@') + (fields.length ? '?' + fields.join('&') : '');
}

export function calendarQrPayload(title: string, start: Date, end: Date, uid: string, stamp: Date): string {
  if (!title.trim() || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return '';
  const basic = (date: Date) => date.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const summary = title.trim().replace(/[\\;,]/g, '\\$&').replace(/\r\n|[\r\n]/g, '\\n');
  const encode = new TextEncoder();
  let folded = 'SUMMARY:';
  let width = 8;
  for (const character of summary) {
    const bytes = encode.encode(character).length;
    if (width + bytes > 75) {
      folded += '\r\n ';
      width = 1;
    }
    folded += character;
    width += bytes;
  }
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DEX//QR//EN', 'BEGIN:VEVENT',
    'UID:' + uid + '@dex', 'DTSTAMP:' + basic(stamp), 'DTSTART:' + basic(start), 'DTEND:' + basic(end),
    folded, 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}
