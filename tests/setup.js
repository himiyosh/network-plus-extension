/**
 * Jest setup: mock browser globals for panel.js
 */
global.chrome = {
  storage: { local: { get: jest.fn(), set: jest.fn() } },
  devtools: {
    network: { onRequestFinished: null },
    panels: { openResource: jest.fn() },
  },
};

const mockElement = () => ({
  className: '',
  textContent: '',
  innerHTML: '',
  style: {},
  dataset: {},
  offsetWidth: 100,
  scrollTop: 0,
  scrollHeight: 0,
  clientHeight: 0,
  appendChild: jest.fn(),
  insertBefore: jest.fn(),
  removeChild: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  setAttribute: jest.fn(),
  removeAttribute: jest.fn(),
  getAttribute: jest.fn(),
  querySelector: jest.fn(() => mockElement()),
  querySelectorAll: jest.fn(() => []),
  insertAdjacentElement: jest.fn(),
  scrollIntoView: jest.fn(),
  closest: jest.fn(),
  focus: jest.fn(),
  click: jest.fn(),
  classList: {
    add: jest.fn(),
    remove: jest.fn(),
    toggle: jest.fn(),
    contains: jest.fn(() => false),
  },
});

global.document = {
  querySelector: jest.fn(() => mockElement()),
  querySelectorAll: jest.fn(() => []),
  documentElement: {
    removeAttribute: jest.fn(),
    setAttribute: jest.fn(),
  },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  createElement: jest.fn(() => mockElement()),
  createDocumentFragment: jest.fn(() => ({
    appendChild: jest.fn(),
  })),
  createTextNode: jest.fn((text) => ({ textContent: text })),
  body: { appendChild: jest.fn() },
};

global.window = {
  addEventListener: jest.fn(),
};

global.navigator = {
  clipboard: { writeText: jest.fn(() => Promise.resolve()) },
};

global.localStorage = {
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};

global.Blob = class Blob {
  constructor(parts, options) {
    this.parts = parts;
    this.options = options;
  }
};

global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
