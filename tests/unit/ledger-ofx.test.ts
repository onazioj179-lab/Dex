// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { isOfxFile, parseOfx, ofxToCsv, ofxDate, ofxAmount } from '../../src/renderer/DEXAPPLICATIONS/ledger/ofx';

const SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD
<BANKACCTFROM><BANKID>123<ACCTID>987654<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261101
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103120000[-5:EST]<TRNAMT>-42.10<FITID>A1<NAME>COFFEE &amp; CO<MEMO>Card 1234
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105<TRNAMT>+1,250.00<FITID>A2<NAME>PAYROLL, ACME
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const XML = `<?xml version="1.0" encoding="UTF-8"?><?OFX OFXHEADER="200" VERSION="220"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR</CURDEF><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261110</DTPOSTED><TRNAMT>-9,99</TRNAMT><FITID>X</FITID><MEMO>Streaming</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('Ledger OFX import', () => {
  it('recognises bank files by name or header', () => {
    expect(isOfxFile('stmt.QFX', '')).toBe(true);
    expect(isOfxFile('x.txt', SGML)).toBe(true);
    expect(isOfxFile('x.txt', XML)).toBe(true);
    expect(isOfxFile('x.csv', 'Date,Amount')).toBe(false);
  });

  it('reads OFX 1.x (SGML) statements', () => {
    const st = parseOfx(SGML);
    expect(st.currency).toBe('USD');
    expect(st.accountId).toBe('987654');
    expect(st.transactions).toEqual([
      { date: '2026-11-03', amount: '-42.10', payee: 'COFFEE & CO', memo: 'Card 1234', fitId: 'A1', type: 'DEBIT' },
      { date: '2026-11-05', amount: '1250.00', payee: 'PAYROLL, ACME', memo: '', fitId: 'A2', type: 'CREDIT' },
    ]);
  });

  it('reads OFX 2.x (XML) with a decimal comma and memo-only rows', () => {
    const st = parseOfx(XML);
    expect(st.currency).toBe('EUR');
    expect(st.transactions[0]).toMatchObject({ date: '2026-11-10', amount: '-9.99', payee: 'Streaming', memo: '' });
  });

  it('writes the CSV the importer reads, quoting where needed', () => {
    expect(ofxToCsv(parseOfx(SGML))).toBe('Date,Payee,Memo,Amount\n2026-11-03,COFFEE & CO,Card 1234,-42.10\n2026-11-05,"PAYROLL, ACME",,1250.00\n');
  });

  it('normalises dates and amounts', () => {
    expect(ofxDate('20261231235959.000[0:GMT]')).toBe('2026-12-31');
    expect(ofxDate('bad')).toBe('');
    expect(ofxAmount('1.234,56')).toBe('1234.56');
    expect(ofxAmount('-0.5')).toBe('-0.5');
    expect(ofxAmount('abc')).toBe('');
  });
});
