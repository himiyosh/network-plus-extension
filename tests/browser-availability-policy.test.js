const fs = require('fs');
const path = require('path');
const vm = require('vm');

const browserSuitePath = path.join(__dirname, 'status-summary-browser.test.js');
const browserSuiteSource = fs.readFileSync(browserSuitePath, 'utf8');
const TOOLBAR_FOCUS_JOURNEY_TITLE =
  'constrained toolbar prioritizes actions while preserving local overflow access';
const REVERSE_TOOLBAR_FOCUS_CONTRACT = 'reverse-direction toolbar focus containment';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const evaluateBrowserSuite = (source, environment) => {
  const registrations = [];
  const testApi = (title, callback) => registrations.push({ callback, skipped: false, title });
  testApi.skip = (title, callback) => registrations.push({ callback, skipped: true, title });

  const mockedFs = Object.create(fs);
  mockedFs.accessSync = () => {
    throw new Error('No executable browser is available.');
  };

  vm.runInNewContext(
    source,
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

const evaluateBrowserSuiteRegistration = (environment) =>
  evaluateBrowserSuite(browserSuiteSource, environment).map(({ skipped, title }) => ({ skipped, title }));

const getDeclaredViewportWidths = (source, constantName) => {
  const declaration = source.match(
    new RegExp(`const ${escapeRegex(constantName)} = \\[([^\\]]+)\\];`),
  );
  if (!declaration) {
    throw new Error(`${constantName} must have a literal array declaration.`);
  }

  const widths = declaration[1].match(/\d+/g)?.map(Number);
  if (!widths?.length) {
    throw new Error(`${constantName} must declare at least one viewport width.`);
  }
  return widths;
};

const assertExactViewportWidths = (source, constantName, expectedWidths) => {
  const actualWidths = getDeclaredViewportWidths(source, constantName);
  if (
    actualWidths.length !== expectedWidths.length ||
    actualWidths.some((width, index) => width !== expectedWidths[index])
  ) {
    throw new Error(
      `${constantName} must declare exactly [${expectedWidths.join(', ')}]; received [${actualWidths.join(', ')}].`,
    );
  }
};

const assertJourneyConsumesViewportWidths = (source, journeyTitle, constantName) => {
  const journey = evaluateBrowserSuite(source, {}).find(
    ({ title, callback }) => title === journeyTitle && typeof callback === 'function',
  );
  if (!journey) {
    throw new Error(`${constantName} cannot be verified because "${journeyTitle}" is not registered.`);
  }

  const directLoop = new RegExp(
    `for\\s*\\(\\s*const\\s+width\\s+of\\s+${escapeRegex(constantName)}\\s*\\)`,
  );
  if (!directLoop.test(Function.prototype.toString.call(journey.callback))) {
    throw new Error(`${constantName} must be consumed directly by "${journeyTitle}".`);
  }
};

const assertToolbarReverseFocusContract = (source) => {
  const journey = evaluateBrowserSuite(source, {}).find(
    ({ title, callback }) =>
      title === TOOLBAR_FOCUS_JOURNEY_TITLE && typeof callback === 'function',
  );
  if (!journey) {
    throw new Error(
      `${REVERSE_TOOLBAR_FOCUS_CONTRACT}: "${TOOLBAR_FOCUS_JOURNEY_TITLE}" is not registered.`,
    );
  }

  const callbackSource = Function.prototype.toString.call(journey.callback);
  const requirements = [
    {
      name: 'exact reverse action order',
      pattern: /const reverseTabOrder = expectedTabOrder\.slice\(\)\.reverse\(\);/,
    },
    {
      name: 'real Shift+Tab traversal',
      pattern:
        /for \(const expectedId of reverseTabOrder\) \{\s*await pressKey\(cdp, 'Tab', 'Tab', 9, 8\);[\s\S]*?reverseTabTrace\.push\(\{ \.\.\.traceEntry, width, direction: 'reverse' \}\);/,
    },
    {
      name: 'reverse trace capture',
      pattern: /reverseTabTrace\.push\(\{ \.\.\.traceEntry, width, direction: 'reverse' \}\);/,
    },
    {
      name: 'production reverse containment assertion',
      pattern:
        /assertToolbarFocusContainment\(\s*measurement\.reverseTabTrace,\s*REVERSE_TOOLBAR_FOCUS_CONTRACT,\s*\);/,
    },
    {
      name: 'one-sided focus-scroll mutation',
      pattern:
        /Element\.prototype\.scrollIntoView = function \(options\) \{[\s\S]*?toolbar\.scrollLeft = lockedToolbarScrollLeft;/,
    },
    {
      name: 'named mutation rejection',
      pattern:
        /expect\(\(\) =>\s*assertToolbarFocusContainment\(\s*mutatedReverseTabTrace,\s*REVERSE_TOOLBAR_FOCUS_CONTRACT,\s*\),\s*\)\.toThrow\(REVERSE_TOOLBAR_FOCUS_CONTRACT\);/,
    },
  ];
  const missingRequirement = requirements.find(
    ({ pattern }) => !pattern.test(callbackSource),
  );
  if (missingRequirement) {
    throw new Error(`${REVERSE_TOOLBAR_FOCUS_CONTRACT}: missing ${missingRequirement.name}.`);
  }
};

const replaceViewportDeclaration = (source, constantName, widths) =>
  source.replace(
    new RegExp(`const ${escapeRegex(constantName)} = \\[[^\\]]+\\];`),
    `const ${constantName} = [${widths.join(', ')}];`,
  );

const divergeViewportLoop = (source, constantName, widths) => {
  const directLoop = new RegExp(
    `for\\s*\\(\\s*const\\s+width\\s+of\\s+${escapeRegex(constantName)}\\s*\\)`,
  );
  return directLoop.test(source)
    ? source.replace(directLoop, `for (const width of [${widths.join(', ')}])`)
    : source;
};

test('fails explicitly in CI when no browser executable is discoverable', () => {
  expect(() => evaluateBrowserSuiteRegistration({ CI: 'true' })).toThrow(
    'Real-browser regression tests require an executable Chrome or Edge in CI.',
  );
});

test('locks toolbar branding coverage to both exact sides of the content breakpoint', () => {
  const viewportDeclaration = browserSuiteSource.match(/const TOOLBAR_VIEWPORT_WIDTHS = \[([^\]]+)\];/);

  assertExactViewportWidths(
    browserSuiteSource,
    'TOOLBAR_VIEWPORT_WIDTHS',
    [375, 500, 800, 1280, 1366, 1367, 1500],
  );
  expect(viewportDeclaration).not.toBeNull();
  expect(viewportDeclaration[1].match(/\d+/g).map(Number)).toEqual([375, 500, 800, 1280, 1366, 1367, 1500]);
});

test('locks toolbar focus coverage to narrow, stacked, and split layouts', () => {
  assertExactViewportWidths(
    browserSuiteSource,
    'TOOLBAR_FOCUS_VIEWPORT_WIDTHS',
    [375, 500, 800, 1280],
  );
});

test('locks request-grid focus coverage to narrow, stacked, and split layouts', () => {
  const viewportDeclaration = browserSuiteSource.match(/const GRID_FOCUS_VIEWPORT_WIDTHS = \[([^\]]+)\];/);

  assertExactViewportWidths(browserSuiteSource, 'GRID_FOCUS_VIEWPORT_WIDTHS', [375, 500, 800, 1280]);
  expect(viewportDeclaration).not.toBeNull();
  expect(viewportDeclaration[1].match(/\d+/g).map(Number)).toEqual([375, 500, 800, 1280]);
});

test.each([
  ['TOOLBAR_VIEWPORT_WIDTHS', [375, 500, 800, 1280, 1366, 1367, 1500]],
  ['TOOLBAR_FOCUS_VIEWPORT_WIDTHS', [375, 500, 800, 1280]],
  ['GRID_FOCUS_VIEWPORT_WIDTHS', [375, 500, 800, 1280]],
])('%s declaration narrowing fails with a named diagnostic', (constantName, expectedWidths) => {
  const narrowedSource = replaceViewportDeclaration(browserSuiteSource, constantName, [1280]);

  expect(() => assertExactViewportWidths(narrowedSource, constantName, expectedWidths)).toThrow(constantName);
});

test.each([
  [
    'TOOLBAR_VIEWPORT_WIDTHS',
    [375, 500, 800, 1280, 1366, 1367, 1500],
    'constrained toolbar prioritizes actions while preserving local overflow access',
  ],
  [
    'TOOLBAR_FOCUS_VIEWPORT_WIDTHS',
    [375, 500, 800, 1280],
    'constrained toolbar prioritizes actions while preserving local overflow access',
  ],
  [
    'GRID_FOCUS_VIEWPORT_WIDTHS',
    [375, 500, 800, 1280],
    'request-grid focus stays visible without disrupting pointer sorting or resizing',
  ],
])('%s loop divergence fails with a named diagnostic', (constantName, widths, journeyTitle) => {
  const divergentSource = divergeViewportLoop(browserSuiteSource, constantName, widths);

  expect(() => assertJourneyConsumesViewportWidths(divergentSource, journeyTitle, constantName)).toThrow(
    constantName,
  );
});

test('locks the toolbar measurement journey to its declared viewport widths', () => {
  assertJourneyConsumesViewportWidths(
    browserSuiteSource,
    'constrained toolbar prioritizes actions while preserving local overflow access',
    'TOOLBAR_VIEWPORT_WIDTHS',
  );
});

test('locks the toolbar focus journey to its declared viewport widths', () => {
  assertJourneyConsumesViewportWidths(
    browserSuiteSource,
    'constrained toolbar prioritizes actions while preserving local overflow access',
    'TOOLBAR_FOCUS_VIEWPORT_WIDTHS',
  );
});

test('locks the request-grid journey to its declared viewport widths', () => {
  assertJourneyConsumesViewportWidths(
    browserSuiteSource,
    'request-grid focus stays visible without disrupting pointer sorting or resizing',
    'GRID_FOCUS_VIEWPORT_WIDTHS',
  );
});

test('locks the request-grid journey to real forward and reverse Tab traversal', () => {
  const journeyStart = browserSuiteSource.indexOf(
    "'request-grid focus stays visible without disrupting pointer sorting or resizing'",
  );

  expect(journeyStart).toBeGreaterThan(-1);
  const gridJourney = browserSuiteSource.slice(journeyStart);
  expect(gridJourney).toContain('const reverseGridTargets = expectedGridTargets.slice().reverse();');
  expect(gridJourney).toContain("await pressKey(cdp, 'Tab', 'Tab', 9, 8);");
  expect(gridJourney).toContain('reverseTabTrace.push(traceEntry);');
});

test('locks the toolbar journey to real reverse Shift+Tab and a named one-sided mutation proof', () => {
  expect(() => assertToolbarReverseFocusContract(browserSuiteSource)).not.toThrow();
});

test.each([
  [
    'Shift+Tab removal',
    (source) =>
      source.replace(
        "await pressKey(cdp, 'Tab', 'Tab', 9, 8);",
        "await pressKey(cdp, 'Tab', 'Tab', 9);",
      ),
  ],
  [
    'one-sided focus-scroll proof removal',
    (source) =>
      source.replace(
        /if \(toolbar\.contains\(this\)\) \{\s*toolbar\.scrollLeft = lockedToolbarScrollLeft;/,
        'if (toolbar.contains(this)) {\n                void lockedToolbarScrollLeft;',
      ),
  ],
])('%s fails with the reverse-direction contract diagnostic', (_mutationName, mutateSource) => {
  const mutatedSource = mutateSource(browserSuiteSource);

  expect(mutatedSource).not.toBe(browserSuiteSource);
  expect(() => assertToolbarReverseFocusContract(mutatedSource)).toThrow(
    REVERSE_TOOLBAR_FOCUS_CONTRACT,
  );
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
    {
      skipped: true,
      title: 'request-grid focus stays visible without disrupting pointer sorting or resizing',
    },
  ]);
});
