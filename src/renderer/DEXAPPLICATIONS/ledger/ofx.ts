// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * OFX / QFX / QBO bank files ("Download for Quicken / Money / QuickBooks").
 *
 * Banks hand these out more often than CSV. Both dialects are read: OFX 1.x
 * (SGML, where <TRNAMT>-12.50 has no closing tag) and OFX 2.x (XML). Each
 * <STMTTRN> becomes a row; the result is turned into the same CSV the Ledger
 * importer already reads (Date, Payee, Memo, Amount, ISO dates, signed
 * amounts), so preview, duplicate detection, categories and the automatic
 * backup all apply unchanged.
 */

export interface OfxTransaction {
  date: string;      // YYYY-MM-DD
  amount: string;    // signed decimal as written by the bank, "." separator
  payee: string;
  memo: string;
  fitId: string;
  type: string;
}

export interface OfxStatement {
  currency: string | null;
  accountId: string | null;
  transactions: OfxTransaction[];
}

export function isOfxFile(name: string, content: string): boolean {
  return /\.(ofx|qfx|qbo)$/i.test(name) || /^\s*(OFXHEADER:|<\?xml[^>]*\?>\s*<\?OFX)/i.test(content.slice(0, 400));
}

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

/** Value of a leaf tag inside a block: `<NAME>value` (SGML) or `<NAME>value</NAME>` (XML). */
function leaf(block: string, tag: string): string {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block);
  return m ? decodeEntities(m[1].trim()) : '';
}

/** OFX dates: YYYYMMDD[HHMMSS[.XXX]][TZ] → YYYY-MM-DD. */
export function ofxDate(v: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Amounts: "-12.50", "+1,234.00", "12,50" (decimal comma) → "-12.50" style. */
export function ofxAmount(v: string): string {
  let s = v.trim().replace(/\s/g, '');
  if (/^[+-]?\d{1,3}(\.\d{3})*,\d+$/.test(s) || /^[+-]?\d+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  return /^-?\d+(\.\d+)?$/.test(s) ? s : '';
}

export function parseOfx(content: string): OfxStatement {
  const body = content.slice(Math.max(0, content.search(/<OFX>/i)));
  const transactions: OfxTransaction[] = [];
  const re = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const b = m[1];
    const date = ofxDate(leaf(b, 'DTPOSTED') || leaf(b, 'DTUSER'));
    const amount = ofxAmount(leaf(b, 'TRNAMT'));
    if (!date || !amount) continue;
    const name = leaf(b, 'NAME') || leaf(b, 'PAYEE');
    const memo = leaf(b, 'MEMO');
    transactions.push({
      date, amount,
      // Some banks put the useful description in MEMO and a code in NAME.
      payee: name || memo,
      memo: name && memo && memo !== name ? memo : '',
      fitId: leaf(b, 'FITID'),
      type: leaf(b, 'TRNTYPE'),
    });
  }
  return { currency: leaf(body, 'CURDEF') || null, accountId: leaf(body, 'ACCTID') || null, transactions };
}

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The CSV the Ledger importer reads. */
export function ofxToCsv(st: OfxStatement): string {
  const lines = ['Date,Payee,Memo,Amount'];
  for (const t of st.transactions) lines.push([t.date, t.payee, t.memo, t.amount].map(csvCell).join(','));
  return lines.join('\n') + '\n';
}
