const np = require('../panel.js');

const importRow = (source) => {
  const row = np.buildRowFromRequest(np.normalizeHarEntry({
    request: { method: 'POST', url: 'https://fidelity.test/', ...source.request },
    response: { status: 200, ...source.response },
  }), 1);
  row._reqObj = null;
  return row;
};
const mirrorRow = (row) => {
  const wire = JSON.parse(JSON.stringify(np.serializeRowForMirror(row)));
  const result = np.buildRowFromRequest(np.buildMirrorEntryFromWire(wire), wire.id);
  result._reqObj = null;
  return result;
};
const exported = (row) => np.buildHarLogFromRows([row]).log.entries[0];

describe('HAR round-trip fidelity', () => {
  test('preserves ordered form parameters and file metadata, without inventing text', () => {
    const params = [
      { name: 'tag', value: 'private-first' },
      { name: 'tag', value: 'private-second' },
      { name: 'attachment', fileName: 'private.txt', contentType: 'text/plain', comment: 'private-note' },
    ];
    const source = { request: { postData: { mimeType: 'multipart/form-data', params } }, response: {} };
    const snapshot = JSON.stringify(source);
    const row = importRow(source);
    for (const candidate of [row, mirrorRow(row)]) {
      expect(candidate.size).toBe(row.size);
      expect(exported(candidate).request.postData).toEqual({ mimeType: 'multipart/form-data', params });
      const sanitized = np.sanitizeHar(np.buildHarLogFromRows([candidate]));
      expect(sanitized.log.entries[0].request.postData.params).toEqual(params.map(({ name }) => ({ name, value: np.REDACTION_MARKER })));
      expect(sanitized.log.entries[0].request.postData.text).toBeUndefined();
      expect(JSON.stringify(sanitized)).not.toContain('private-');
      expect(JSON.stringify(sanitized)).not.toContain('private.txt');
      expect(exported(candidate).request.bodySize).toBe(-1);
    }
    expect(JSON.stringify(source)).toBe(snapshot);
  });

  test('normalizes only known parameter fields and never calls unsafe scalar conversions', () => {
    const hostile = { toString() { throw new Error('must not run'); } };
    const row = importRow({ request: { postData: { mimeType: 'application/x-www-form-urlencoded', params: [
      { name: 7, value: false, fileName: hostile, contentType: null, comment: true, unknown: 'discard' }, null,
    ] } }, response: {} });
    expect(exported(row).request.postData.params).toEqual([
      { name: '7', value: 'false', fileName: '', contentType: '', comment: 'true' }, { name: '' },
    ]);
  });

  test('keeps request base64 encoding through full exports and mirrors while sanitized output omits it', () => {
    const text = 'AP8=';
    const row = importRow({ request: { postData: { mimeType: 'application/octet-stream', text, encoding: 'base64' } }, response: {} });
    for (const candidate of [row, mirrorRow(row)]) {
      expect(exported(candidate).request.postData).toEqual({ mimeType: 'application/octet-stream', text, encoding: 'base64' });
      expect(exported(candidate).request.bodySize).toBe(2);
      const sanitized = np.sanitizeHar(np.buildHarLogFromRows([candidate])).log.entries[0].request.postData;
      expect(sanitized.text).toBe(np.OMISSION_MARKER);
      expect(sanitized.encoding).toBeUndefined();
      expect(sanitized._networkPlus.status).toBe('omitted');
    }
  });

  test.each([
    [120, 900, 780], [25, 0, -25], [0, 0, 0], [-1, 900, 780],
  ])('keeps transferred bytes %i separate from decoded bytes %i and compression %i', (bodySize, size, compression) => {
    const row = importRow({ request: {}, response: { bodySize, content: { size, compression, mimeType: 'application/json' } } });
    for (const candidate of [row, mirrorRow(row)]) {
      for (const har of [np.buildHarLogFromRows([candidate]), np.sanitizeHar(np.buildHarLogFromRows([candidate]))]) {
        expect(har.log.entries[0].response.bodySize).toBe(bodySize);
        expect(har.log.entries[0].response.content).toEqual(expect.objectContaining({ size, compression }));
      }
      expect(candidate.size).toBe(row.size);
    }
  });

  test.each([
    ['日本🌍', '', 10], ['AAEC/w==', 'base64', 4], ['', '', 0],
  ])('infers missing request sizes from payload bytes for %s (%s)', (text, encoding, size) => {
    const row = importRow({
      request: { postData: { mimeType: 'text/plain', text, encoding } },
      response: { content: { mimeType: 'text/plain', text, encoding } },
    });
    for (const candidate of [row, mirrorRow(row)]) {
      const entry = exported(candidate);
      expect([entry.request.bodySize, entry.response.bodySize, entry.response.content.size]).toEqual([size, -1, -1]);
      expect(candidate.size).toBe(row.size);
    }
    const legacy = exported({ method: 'POST', url: 'https://fidelity.test/', requestPostData: { text, encoding }, size: 0 });
    expect(legacy.request.bodySize).toBe(size);
    expect(legacy.response.bodySize).toBe(0);
  });

  test.each([
    [{}, {}, -1, -1, -1],
    [{ postData: { params: [] } }, { bodySize: 0 }, -1, 0, -1],
    [{ bodySize: -1, postData: { text: '' } }, { bodySize: -1, content: { size: 0 } }, -1, -1, 0],
    [{}, { bodySize: 5, content: { size: -1, text: 'known text' } }, -1, 5, -1],
  ])('preserves explicit unknown independently of known empty metadata', (request, response, requestSize, responseSize, contentSize) => {
    const row = importRow({ request, response });
    for (const candidate of [row, mirrorRow(row)]) {
      const entry = exported(candidate);
      expect([entry.request.bodySize, entry.response.bodySize, entry.response.content.size]).toEqual([requestSize, responseSize, contentSize]);
    }
  });

  test('does not substitute decoded size for an unreported compressed transfer size', () => {
    const row = importRow({ request: {}, response: { content: { size: 900, compression: 780 } } });
    expect(exported(row).response.bodySize).toBe(-1);
    expect(exported(mirrorRow(row)).response.bodySize).toBe(-1);
    expect(mirrorRow(row).size).toBe(row.size);
  });

  test('includes preserved form parameters in mirror snapshot chunk budgeting', () => {
    const row = importRow({ request: { postData: { mimeType: 'application/x-www-form-urlencoded', params: [
      { name: 'large', value: 'x'.repeat(1024 * 1024) },
    ] } }, response: {} });
    const messages = [];
    const host = np.createMirrorHostSession({
      postMessage: (message) => messages.push(message),
      getRows: () => [row, { ...row, id: 2 }],
      isPaused: () => true,
    });
    host.sendSnapshot();
    expect(messages.filter((message) => message.type === 'snapshot-rows').map((message) => message.rows.length)).toEqual([1, 1]);
  });

  test('unknown decoded size never claims an empty response, while legacy helper fallbacks stay compatible', () => {
    const row = importRow({ request: {}, response: {} });
    const entry = exported(row);
    expect(entry.response.content.size).toBe(-1);
    delete entry.response.content._networkPlus;
    expect(np.classifyImportedResponseContent(entry).state).toBe('unavailable');
    expect(np.buildHarResponseContent({ size: 0 }).size).toBe(0);
    expect(np.buildHarResponseContent(null).size).toBe(0);
  });
});
