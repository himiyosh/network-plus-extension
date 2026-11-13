const np = require('../panel.js');

const encoder = new TextEncoder();
const flush = () => new Promise((resolve) => setImmediate(resolve));
const entry = { request: { url: 'https://stream.test/one' }, response: { status: 200 } };
const validHar = JSON.stringify({ log: { entries: [entry] } });

function fileFromText(text, options = {}) {
  const bytes = encoder.encode(text);
  const file = {
    name: 'stream.har',
    size: options.size == null ? bytes.length : options.size,
    reads: 0,
    closed: false,
    async *stream() {
      try {
        for (let start = 0; start < bytes.length; start += options.chunkSize || bytes.length) {
          file.reads += 1;
          yield bytes.subarray(start, start + (options.chunkSize || bytes.length));
        }
      } finally {
        file.closed = true;
      }
    },
  };
  return file;
}

describe('HAR stream mirror transport', () => {
  const sessions = [];
  function connect(receiveHarStream) {
    const sent = [];
    const received = [];
    let host;
    const viewer = np.createMirrorViewerSession({
      postMessage(message) {
        sent.push(message);
        queueMicrotask(() => host.handleMessage(message));
      },
      appendWireRow() {},
      applyWireSnapshot() {},
      getLocalCount: () => 0,
      getLocalMaxId: () => 0,
    });
    host = np.createMirrorHostSession({
      postMessage(message) {
        received.push(message);
        queueMicrotask(() => viewer.handleMessage(message));
      },
      getRows: () => [],
      isPaused: () => true,
      fetchBodyForRow: () => Promise.reject(new Error('unused')),
      receiveHarStream,
    });
    sessions.push({ host, viewer });
    return { host, viewer, sent, received };
  }

  function receiver(capture, wait = Promise.resolve()) {
    return (_name, stream, done) => {
      const staged = [];
      wait.then(() => np.readHarEntries(stream, (row) => staged.push(row))).then(
        () => { capture.rows = staged; done(''); },
        (error) => done(error.message),
      );
    };
  }

  afterEach(() => {
    for (const { host, viewer } of sessions.splice(0)) {
      host.dropImportTransfers();
      viewer.failPendingBodyRequests('test cleanup');
    }
    jest.useRealTimers();
  });

  test('paces bytes on receiver acknowledgements and fragments large source chunks', async () => {
    let resume;
    const ready = new Promise((resolve) => { resume = resolve; });
    const capture = { rows: ['old'] };
    const link = connect(receiver(capture, ready));
    const text = JSON.stringify({ log: { entries: [{ ...entry, response: { content: { text: 'x'.repeat(1024 * 1024) } } }] } });
    const file = fileFromText(text);
    let result;
    const resultPromise = new Promise((resolve) => { result = resolve; });
    const sending = link.viewer.sendHarStream(file, result);
    await flush();
    expect(link.sent.filter((message) => message.type === 'import-chunk')).toHaveLength(1);
    expect(link.received.filter((message) => message.type === 'import-ack')).toHaveLength(0);
    expect(capture.rows).toEqual(['old']);
    resume();
    await sending;
    expect(await resultPromise).toBeNull();
    const chunks = link.sent.filter((message) => message.type === 'import-chunk');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((message) => message.data.length <= np.MIRROR_IMPORT_CHUNK_CHARS)).toBe(true);
    expect(link.received.filter((message) => message.type === 'import-ack')).toHaveLength(chunks.length);
    expect(capture.rows).toEqual(JSON.parse(text).log.entries);
    expect(file.closed).toBe(true);
  });

  test('a malformed suffix rejects the transfer after valid entries without committing them', async () => {
    const capture = { rows: ['previous capture'] };
    const link = connect(receiver(capture));
    let result;
    const resultPromise = new Promise((resolve) => { result = resolve; });
    await link.viewer.sendHarStream(fileFromText(validHar + ' trailing', { chunkSize: 5 }), result);
    expect((await resultPromise).message).toContain('not valid JSON');
    expect(capture.rows).toEqual(['previous capture']);
    expect(link.sent.some((message) => message.type === 'import-cancel')).toBe(true);
  });

  test.each([-1, 1])('rejects a declared byte count offset of %i without committing', async (offset) => {
    const capture = { rows: ['old'] };
    const link = connect(receiver(capture));
    let result;
    const resultPromise = new Promise((resolve) => { result = resolve; });
    const file = fileFromText(validHar, { size: encoder.encode(validHar).length + offset });
    await link.viewer.sendHarStream(file, result);
    expect((await resultPromise).message).toMatch(/declared size/);
    expect(capture.rows).toEqual(['old']);
  });

  test('disconnect aborts a blocked writer and releases the sender exactly once', async () => {
    const link = connect(() => {});
    const file = fileFromText(validHar, { chunkSize: 4 });
    const callback = jest.fn();
    const sending = link.viewer.sendHarStream(file, callback);
    await flush();
    link.host.dropImportTransfers();
    await sending;
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0].message).toContain('interrupted');
    expect(file.closed).toBe(true);
    await flush();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test.each(['malformed bytes', 'second chunk before ACK', 'end before ACK'])(
    'rejects %s and cleans the host transfer', async (scenario) => {
      const link = connect(() => {});
      const identity = { commandId: 123, viewer: 'direct-test' };
      link.host.handleMessage({ type: 'import-begin', ...identity, fileName: 'capture.har', size: 1, stream: true });
      if (scenario === 'malformed bytes') {
        link.host.handleMessage({ type: 'import-chunk', ...identity, data: '%' });
      } else {
        link.host.handleMessage({ type: 'import-chunk', ...identity, data: 'YQ==' });
        link.host.handleMessage(scenario === 'end before ACK'
          ? { type: 'import-end', ...identity }
          : { type: 'import-chunk', ...identity, data: 'YQ==' });
      }
      await flush();
      const results = link.received.filter((message) => message.type === 'command-result');
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ ...identity, ok: false });
      expect(results[0].error).toMatch(/decoded|out of order/);
      link.host.dropImportTransfers();
      await flush();
      expect(link.received.filter((message) => message.type === 'command-result')).toHaveLength(1);
    },
  );

  test('source read failures cancel the host transfer and settle once', async () => {
    const capture = { rows: ['old'] };
    const link = connect(receiver(capture));
    const failure = new Error('disk read failed');
    const callback = jest.fn();
    const file = { name: 'stream.har', size: 100, async *stream() {
      yield encoder.encode('{"log":');
      throw failure;
    } };
    await link.viewer.sendHarStream(file, callback);
    await flush();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(failure);
    expect(link.sent.some((message) => message.type === 'import-cancel')).toBe(true);
    expect(capture.rows).toEqual(['old']);
  });

  test('a rejected stream can be followed by a successful import', async () => {
    const capture = { rows: ['old'] };
    const link = connect(receiver(capture));
    for (const text of ['{"log":{"entries":[null]}}', validHar]) {
      let result;
      const resultPromise = new Promise((resolve) => { result = resolve; });
      await link.viewer.sendHarStream(fileFromText(text, { chunkSize: 7 }), result);
      const error = await resultPromise;
      expect(Boolean(error)).toBe(text !== validHar);
    }
    expect(capture.rows).toEqual([entry]);
  });

  test('acknowledgements refresh the idle timeout and a stalled stream cancels', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'setImmediate'] });
    const sent = [];
    const viewer = np.createMirrorViewerSession({
      postMessage: (message) => sent.push(message),
      appendWireRow() {}, applyWireSnapshot() {},
      getLocalCount: () => 0, getLocalMaxId: () => 0,
    });
    const callback = jest.fn();
    const sending = viewer.sendHarStream(fileFromText(validHar, { chunkSize: 3 }), callback);
    await flush();
    const begin = sent[0];
    viewer.handleMessage({ type: 'import-ack', commandId: begin.commandId, viewer: 'another-viewer' });
    await flush();
    expect(sent.filter((message) => message.type === 'import-chunk')).toHaveLength(1);
    jest.advanceTimersByTime(np.MIRROR_IMPORT_RESULT_TIMEOUT_MS - 1);
    viewer.handleMessage({ type: 'import-ack', commandId: begin.commandId, viewer: begin.viewer });
    await flush();
    jest.advanceTimersByTime(np.MIRROR_IMPORT_RESULT_TIMEOUT_MS - 1);
    expect(callback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2);
    await sending;
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0].message).toContain('did not answer in time');
    expect(sent.some((message) => message.type === 'import-cancel')).toBe(true);
  });
});
