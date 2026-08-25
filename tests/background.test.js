'use strict';
// Direct unit coverage for the background service worker's single job:
// minimizing the undocked DevTools window on pop-out. The worker source is
// executed against a scripted chrome.windows so every response branch —
// focused pick, single-window fallback, ambiguous decline, error paths —
// can fail a gate instead of only being reachable in a real browser.
const fs = require('fs');
const path = require('path');

const workerSource = fs.readFileSync(path.resolve(__dirname, '..', 'background.js'), 'utf8');

function runWorker({ windows, getAllError = null, updateError = null } = {}) {
  const updates = [];
  let listener = null;
  const chromeMock = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener: (fn) => {
          listener = fn;
        },
      },
    },
    windows: {
      getAll: (options, cb) => {
        expect(options).toEqual({ windowTypes: ['devtools'] });
        if (getAllError) chromeMock.runtime.lastError = { message: getAllError };
        cb(windows);
        chromeMock.runtime.lastError = null;
      },
      update: (id, opts, cb) => {
        updates.push({ id, opts });
        if (updateError) chromeMock.runtime.lastError = { message: updateError };
        cb();
        chromeMock.runtime.lastError = null;
      },
    },
  };
  new Function('chrome', workerSource)(chromeMock);
  if (typeof listener !== 'function') throw new Error('The worker registered no onMessage listener.');
  return { listener, updates };
}

function ask(listener, message) {
  let response = null;
  const keepChannelOpen = listener(message, {}, (answer) => {
    response = answer;
  });
  return { response, keepChannelOpen };
}

describe('background worker minimize handshake', () => {
  test('minimizes the focused DevTools window among several', () => {
    const { listener, updates } = runWorker({
      windows: [
        { id: 10, type: 'devtools', focused: false },
        { id: 11, type: 'devtools', focused: true },
      ],
    });
    const { response, keepChannelOpen } = ask(listener, { type: 'networkplus-minimize-devtools' });
    expect(keepChannelOpen).toBe(true);
    expect(response).toEqual({ minimized: true });
    expect(updates).toEqual([{ id: 11, opts: { state: 'minimized' } }]);
  });

  test('falls back to the only DevTools window when focus already moved', () => {
    const { listener, updates } = runWorker({ windows: [{ id: 20, type: 'devtools', focused: false }] });
    const { response } = ask(listener, { type: 'networkplus-minimize-devtools' });
    expect(response).toEqual({ minimized: true });
    expect(updates).toEqual([{ id: 20, opts: { state: 'minimized' } }]);
  });

  test('answers minimized:false when no DevTools window exists (docked session)', () => {
    const { listener, updates } = runWorker({ windows: [] });
    const { response } = ask(listener, { type: 'networkplus-minimize-devtools' });
    expect(response).toEqual({ minimized: false });
    expect(updates).toHaveLength(0);
  });

  test('declines to guess between multiple unfocused DevTools windows', () => {
    const { listener, updates } = runWorker({
      windows: [
        { id: 30, type: 'devtools', focused: false },
        { id: 31, type: 'devtools', focused: false },
      ],
    });
    const { response } = ask(listener, { type: 'networkplus-minimize-devtools' });
    expect(response).toEqual({ minimized: false });
    expect(updates).toHaveLength(0);
  });

  test('a getAll error answers minimized:false instead of throwing', () => {
    const { listener, updates } = runWorker({
      windows: [{ id: 40, type: 'devtools', focused: true }],
      getAllError: 'windows unavailable',
    });
    const { response } = ask(listener, { type: 'networkplus-minimize-devtools' });
    expect(response).toEqual({ minimized: false });
    expect(updates).toHaveLength(0);
  });

  test('an update error reports the truthful minimized:false outcome', () => {
    const { listener } = runWorker({
      windows: [{ id: 50, type: 'devtools', focused: true }],
      updateError: 'window vanished',
    });
    const { response } = ask(listener, { type: 'networkplus-minimize-devtools' });
    expect(response).toEqual({ minimized: false });
  });

  test('unrelated messages are ignored without touching windows', () => {
    let touched = false;
    const chromeMock = {
      runtime: { lastError: null, onMessage: { addListener: () => {} } },
      windows: {
        getAll: () => {
          touched = true;
        },
        update: () => {
          touched = true;
        },
      },
    };
    let listener = null;
    chromeMock.runtime.onMessage.addListener = (fn) => {
      listener = fn;
    };
    new Function('chrome', workerSource)(chromeMock);
    const result = listener({ type: 'someone-elses-message' }, {}, () => {
      touched = true;
    });
    expect(result).toBeUndefined();
    expect(touched).toBe(false);
  });
});
