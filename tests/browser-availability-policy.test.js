const fs = require('fs');
const path = require('path');
const vm = require('vm');

const browserSuitePath = path.join(__dirname, 'status-summary-browser.test.js');
const browserSuiteSource = fs.readFileSync(browserSuitePath, 'utf8');

const evaluateBrowserSuiteRegistration = (environment) => {
  const registrations = [];
  const testApi = (title) => registrations.push({ skipped: false, title });
  testApi.skip = (title) => registrations.push({ skipped: true, title });

  const mockedFs = Object.create(fs);
  mockedFs.accessSync = () => {
    throw new Error('No executable browser is available.');
  };

  vm.runInNewContext(
    browserSuiteSource,
    {
      __dirname: path.dirname(browserSuitePath),
      process: { env: environment },
      require: (request) => (request === 'fs' ? mockedFs : require(request)),
      test: testApi,
    },
    { filename: browserSuitePath },
  );

  return registrations;
};

test('fails explicitly in CI when no browser executable is discoverable', () => {
  expect(() => evaluateBrowserSuiteRegistration({ CI: 'true' })).toThrow(
    'Real-browser regression tests require an executable Chrome or Edge in CI.',
  );
});

test('locks toolbar branding coverage to both exact sides of the content breakpoint', () => {
  const viewportDeclaration = browserSuiteSource.match(
    /const TOOLBAR_VIEWPORT_WIDTHS = \[([^\]]+)\];/,
  );

  expect(viewportDeclaration).not.toBeNull();
  expect(viewportDeclaration[1].match(/\d+/g).map(Number)).toEqual([
    375, 500, 800, 1280, 1366, 1367, 1500,
  ]);
});

test('retains the local-only skip when no browser executable is discoverable', () => {
  expect(evaluateBrowserSuiteRegistration({})).toEqual([
    {
      skipped: false,
      title: 'profile cleanup warns after bounded retries exhaust a transient ENOTEMPTY error',
    },
    {
      skipped: false,
      title: 'profile cleanup rethrows non-transient removal errors',
    },
    {
      skipped: false,
      title: 'collapsed accessibility check rejects an empty second AX tree',
    },
    {
      skipped: true,
      title: 'live summary update preserves focused status chip identity and the pending click gesture',
    },
    {
      skipped: true,
      title: 'details close control reclaims the workbench and row selection reopens it',
    },
    {
      skipped: true,
      title: 'constrained toolbar prioritizes actions while preserving local overflow access',
    },
  ]);
});
