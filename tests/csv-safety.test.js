'use strict';

const np = require('../panel');

// Decode a generated CSV record independently of its formatter so commas,
// quotes and embedded newlines cannot hide a new formula-bearing cell.
function readCsv(csv) {
  const records = [];
  let record = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === ',') {
      record.push(cell);
      cell = '';
    } else if (!quoted && character === '\r' && csv[index + 1] === '\n') {
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
      index += 1;
    } else {
      cell += character;
    }
  }
  return records;
}

describe('spreadsheet-safe CSV metadata', () => {
  test.each([
    '=1+1', '+1+1', '-1+1', '@SUM(1)',
    '＝1+1', '＋1+1', '－1+1', '＠SUM(1)',
    '  =1+1', '\t=1+1', '\r=1+1', '\n=1+1', '\u0000=1+1', '\u001f=1+1',
    '\u007f=1+1', '\u0085=1+1', '\u00a0=1+1', '\ufeff=1+1', '\u3000＝1+1',
    '=SUM(1,2)', '=HYPERLINK("https://example.invalid/", "label")',
    '=1+1\r\n,=2+2',
  ])('keeps a formula-looking text value literal: %p', (text) => {
    expect(readCsv(np.escapeCsvField(text) + '\r\n')).toEqual([["'" + text]]);
  });

  test('preserves finite numbers and ordinary text without a formula marker', () => {
    for (const value of [-12.5, -1, 0, 3, 500000000]) {
      expect(np.escapeCsvField(value)).toBe(String(value));
    }
    for (const text of ['GET', 'OK', 'application/json', 'https://example.test/?a=b', '東京', 'line\nbreak']) {
      expect(readCsv(np.escapeCsvField(text) + '\r\n')).toEqual([[text]]);
    }
    expect(np.escapeCsvField('-12.5')).toBe("'-12.5");
    expect(np.escapeCsvField(null)).toBe('');
  });

  test('protects every textual metadata column and leaves measurement columns numeric', () => {
    const rows = readCsv(np.formatRowsCsv([{
      id: 7, method: '=1+1', status: 200, statusText: '\t+1+1', domain: '-1+1',
      type: '@SUM(1)', operation: '＝1+1', duration: -12.6, size: 500000000,
      url: '=HYPERLINK("https://example.invalid/", "label")',
    }]));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual([
      '7', "'=1+1", '200', "'\t+1+1", "'-1+1", "'@SUM(1)", "'＝1+1", '-13', '500000000',
      "'=HYPERLINK(\"https://example.invalid/\", \"label\")",
    ]);
  });

  test('the sanitized export path neutralizes formulas without weakening URL redaction', () => {
    const result = np.buildCsvPayload([{
      id: 1, method: 'GET', status: 200, statusText: '=1+1', type: 'text/html',
      duration: 12, size: 30, url: 'https://example.test/?token=synthetic-secret',
      requestHeaders: [], responseHeaders: [],
    }]);
    expect(result.ok).toBe(true);
    const records = readCsv(result.text);
    expect(records[1][3]).toBe("'=1+1");
    expect(records[1][7]).toBe('12');
    expect(records[1][8]).toBe('30');
    expect(records[1][9]).toContain('%5BREDACTED%5D');
    expect(result.text).not.toContain('synthetic-secret');
  });
});
