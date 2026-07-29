const fs = require('fs');
const path = require('path');
const vm = require('vm');

const browserSuitePath = path.join(__dirname, 'status-summary-browser.test.js');
const browserSuiteSource = fs.readFileSync(browserSuitePath, 'utf8');
const qualityGatesPath = path.join(__dirname, '..', '.github', 'workflows', 'quality-gates.yml');
const qualityGatesSource = fs.readFileSync(qualityGatesPath, 'utf8');
const TOOLBAR_FOCUS_JOURNEY_TITLE = 'constrained toolbar prioritizes actions while preserving local overflow access';
const BROWSER_POLICY_GUARD_CONTRACT = 'browser availability source-contract policy pin';
const BROWSER_POLICY_GUARD_COMMAND = 'npx jest tests/browser-availability-policy.test.js --runInBand --coverage=false';
const REVERSE_TOOLBAR_FOCUS_CONTRACT = 'reverse-direction toolbar focus containment';
const SYNCHRONOUS_TOOLBAR_FOCUS_SCROLL_CONTRACT = 'synchronous toolbar keyboard focus-scroll timing';
const JAVASCRIPT_IDENTIFIER_PATTERN = '[A-Za-z_$][\\w$]*';

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

const getViewportDeclaration = (source, constantName) => {
  const declarationPattern = new RegExp(`\\bconst\\s+${escapeRegex(constantName)}\\s*=\\s*\\[([^\\]]*)\\]\\s*;`, 'g');
  const declarations = Array.from(source.matchAll(declarationPattern));
  if (declarations.length !== 1) {
    throw new Error(`${constantName} must have exactly one literal array declaration.`);
  }

  return {
    body: declarations[0][1],
    index: declarations[0].index,
    source: declarations[0][0],
  };
};

const getDeclaredViewportWidths = (source, constantName) => {
  const declaration = getViewportDeclaration(source, constantName);
  if (!/^\s*\d+(?:\s*,\s*\d+)*\s*,?\s*$/.test(declaration.body)) {
    throw new Error(`${constantName} must contain only decimal integer viewport widths in its literal array.`);
  }

  return declaration.body.match(/\d+/g).map(Number);
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
    `for\\s*\\(\\s*const\\s+${JAVASCRIPT_IDENTIFIER_PATTERN}\\s+of\\s+${escapeRegex(constantName)}\\s*\\)`,
  );
  if (!directLoop.test(Function.prototype.toString.call(journey.callback))) {
    throw new Error(`${constantName} must be consumed directly by "${journeyTitle}".`);
  }
};

const requireSourceMatch = (source, pattern, contractName, requirementName) => {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`${contractName}: missing ${requirementName}.`);
  }
  return match;
};

const assertBrowserPolicyGuardPinned = (source) => {
  const invocationCount = source.split(BROWSER_POLICY_GUARD_COMMAND).length - 1;
  if (invocationCount !== 1) {
    throw new Error(
      `${BROWSER_POLICY_GUARD_CONTRACT}: quality-gates.yml must invoke ` +
        `"${BROWSER_POLICY_GUARD_COMMAND}" exactly once; received ${invocationCount}.`,
    );
  }
};

const assertToolbarReverseFocusContract = (source) => {
  const journey = evaluateBrowserSuite(source, {}).find(
    ({ title, callback }) => title === TOOLBAR_FOCUS_JOURNEY_TITLE && typeof callback === 'function',
  );
  if (!journey) {
    throw new Error(`${REVERSE_TOOLBAR_FOCUS_CONTRACT}: "${TOOLBAR_FOCUS_JOURNEY_TITLE}" is not registered.`);
  }

  const callbackSource = Function.prototype.toString.call(journey.callback);
  const reverseOrderMatch = requireSourceMatch(
    callbackSource,
    new RegExp(
      `\\bconst\\s+(?<reverseOrder>${JAVASCRIPT_IDENTIFIER_PATTERN})\\s*=\\s*` +
        `(?<forwardOrder>${JAVASCRIPT_IDENTIFIER_PATTERN})\\s*\\.\\s*slice\\s*\\(\\s*\\)` +
        `\\s*\\.\\s*reverse\\s*\\(\\s*\\)\\s*;`,
    ),
    REVERSE_TOOLBAR_FOCUS_CONTRACT,
    'exact reverse action order',
  );
  const reverseOrderName = reverseOrderMatch.groups.reverseOrder;
  const forwardOrderName = reverseOrderMatch.groups.forwardOrder;

  requireSourceMatch(
    callbackSource,
    new RegExp(
      `for\\s*\\(\\s*const\\s+${JAVASCRIPT_IDENTIFIER_PATTERN}\\s+of\\s+` +
        `${escapeRegex(forwardOrderName)}\\s*\\)\\s*\\{\\s*` +
        `await\\s+pressKey\\s*\\(\\s*${JAVASCRIPT_IDENTIFIER_PATTERN}\\s*,\\s*['"]Tab['"]\\s*,` +
        `\\s*['"]Tab['"]\\s*,\\s*9\\s*,?\\s*\\)\\s*;`,
    ),
    REVERSE_TOOLBAR_FOCUS_CONTRACT,
    'exact reverse action order',
  );

  const reverseTraceMatch = requireSourceMatch(
    callbackSource,
    new RegExp(
      `\\bconst\\s+(?<reverseTrace>${JAVASCRIPT_IDENTIFIER_PATTERN})\\s*=\\s*\\[\\s*\\]\\s*;\\s*` +
        `for\\s*\\(\\s*const\\s+(?<expectedAction>${JAVASCRIPT_IDENTIFIER_PATTERN})\\s+of\\s+` +
        `${escapeRegex(reverseOrderName)}\\s*\\)\\s*\\{[\\s\\S]*?` +
        `\\bconst\\s+(?<traceEntry>${JAVASCRIPT_IDENTIFIER_PATTERN})\\s*=\\s*await\\s+` +
        `${JAVASCRIPT_IDENTIFIER_PATTERN}\\s*\\(\\s*\\)\\s*;[\\s\\S]*?` +
        `expect\\s*\\(\\s*\\k<traceEntry>\\.id\\s*\\)\\s*\\.\\s*toBe\\s*` +
        `\\(\\s*\\k<expectedAction>\\s*\\)\\s*;[\\s\\S]*?` +
        `\\k<reverseTrace>\\s*\\.\\s*push\\s*\\(\\s*\\{\\s*\\.\\.\\.\\s*` +
        `\\k<traceEntry>\\s*,\\s*(?:width|width\\s*:\\s*${JAVASCRIPT_IDENTIFIER_PATTERN})\\s*,` +
        `\\s*direction\\s*:\\s*['"]reverse['"]\\s*,?\\s*\\}\\s*\\)\\s*;`,
    ),
    REVERSE_TOOLBAR_FOCUS_CONTRACT,
    'reverse trace capture',
  );
  const reverseTraceName = reverseTraceMatch.groups.reverseTrace;

  requireSourceMatch(
    reverseTraceMatch[0],
    new RegExp(
      `await\\s+pressKey\\s*\\(\\s*${JAVASCRIPT_IDENTIFIER_PATTERN}\\s*,\\s*['"]Tab['"]\\s*,` +
        `\\s*['"]Tab['"]\\s*,\\s*9\\s*,\\s*8\\s*,?\\s*\\)\\s*;`,
    ),
    REVERSE_TOOLBAR_FOCUS_CONTRACT,
    'real Shift+Tab traversal',
  );

  requireSourceMatch(
    callbackSource,
    new RegExp(
      `assertToolbarFocusContainment\\s*\\(\\s*${JAVASCRIPT_IDENTIFIER_PATTERN}\\s*\\.\\s*` +
        `${escapeRegex(reverseTraceName)}\\s*,\\s*REVERSE_TOOLBAR_FOCUS_CONTRACT\\s*,?\\s*\\)\\s*;`,
    ),
    REVERSE_TOOLBAR_FOCUS_CONTRACT,
    'production reverse containment assertion',
  );

  const mutationMatch = requireSourceMatch(
    callbackSource,
    new RegExp(
      `\\bconst\\s+(?<mutationTrace>${JAVASCRIPT_IDENTIFIER_PATTERN})\\s*=\\s*\\[\\s*\\]\\s*;` +
        `\\s*try\\s*\\{[\\s\\S]*?\\bconst\\s+(?<lockedOffset>${JAVASCRIPT_IDENTIFIER_PATTERN})` +
        `\\s*=\\s*(?<toolbar>${JAVASCRIPT_IDENTIFIER_PATTERN})\\.scrollWidth\\s*-\\s*` +
        `\\k<toolbar>\\.clientWidth\\s*;[\\s\\S]*?` +
        `window\\.__reverseToolbarOriginalScrollIntoView\\s*=\\s*` +
        `Element\\.prototype\\.scrollIntoView\\s*;\\s*` +
        `\\bconst\\s+(?<originalScroll>${JAVASCRIPT_IDENTIFIER_PATTERN})\\s*=\\s*` +
        `Element\\.prototype\\.scrollIntoView\\s*;\\s*` +
        `Element\\.prototype\\.scrollIntoView\\s*=\\s*function\\s*\\(\\s*` +
        `(?<options>${JAVASCRIPT_IDENTIFIER_PATTERN})\\s*,?\\s*\\)\\s*\\{\\s*` +
        `if\\s*\\(\\s*\\k<toolbar>\\.contains\\s*\\(\\s*this\\s*\\)\\s*\\)\\s*\\{\\s*` +
        `\\k<toolbar>\\.scrollLeft\\s*=\\s*\\k<lockedOffset>\\s*;`,
    ),
    REVERSE_TOOLBAR_FOCUS_CONTRACT,
    'one-sided focus-scroll mutation',
  );
  const mutationTraceName = mutationMatch.groups.mutationTrace;

  requireSourceMatch(
    callbackSource,
    new RegExp(
      `expect\\s*\\(\\s*\\(\\s*\\)\\s*=>\\s*assertToolbarFocusContainment\\s*\\(\\s*` +
        `${escapeRegex(mutationTraceName)}\\s*,\\s*REVERSE_TOOLBAR_FOCUS_CONTRACT\\s*,?\\s*\\)` +
        `\\s*,?\\s*\\)\\s*\\.\\s*toThrow\\s*\\(\\s*REVERSE_TOOLBAR_FOCUS_CONTRACT\\s*\\)\\s*;`,
    ),
    REVERSE_TOOLBAR_FOCUS_CONTRACT,
    'named mutation rejection',
  );
};

const assertSynchronousToolbarFocusScrollContract = (source) => {
  const journey = evaluateBrowserSuite(source, {}).find(
    ({ title, callback }) => title === TOOLBAR_FOCUS_JOURNEY_TITLE && typeof callback === 'function',
  );
  if (!journey) {
    throw new Error(
      `${SYNCHRONOUS_TOOLBAR_FOCUS_SCROLL_CONTRACT}: "${TOOLBAR_FOCUS_JOURNEY_TITLE}" is not registered.`,
    );
  }

  const callbackSource = Function.prototype.toString.call(journey.callback);
  const requirements = [
    {
      name: 'capture-phase event identity',
      pattern:
        /probe\.currentEventId = \+\+probe\.nextEventId;\s*},\s*\{ capture: true, signal: controller\.signal \},\s*\);\s*Element\.prototype\.scrollIntoView/,
    },
    {
      name: 'in-event scrollIntoView observation',
      pattern: /Element\.prototype\.scrollIntoView = function \(options\) \{[\s\S]*?eventId: probe\.currentEventId,/,
    },
    {
      name: 'exact focus timing trace',
      pattern:
        /TOOLBAR_FOCUS_VIEWPORT_WIDTHS\.flatMap\(\(width\) =>[\s\S]*?\[\.\.\.expectedTabOrder, \.\.\.reverseTabOrder\]/,
    },
    {
      name: 'production timing assertion',
      pattern: /assertSynchronousToolbarFocusScroll\(focusScrollTimingTrace\);/,
    },
  ];
  const missingRequirement = requirements.find(({ pattern }) => !pattern.test(callbackSource));
  if (missingRequirement) {
    throw new Error(`${SYNCHRONOUS_TOOLBAR_FOCUS_SCROLL_CONTRACT}: missing ${missingRequirement.name}.`);
  }
};

const replaceSourceOrThrow = (source, searchValue, replacement, mutationName) => {
  const mutatedSource = source.replace(searchValue, replacement);
  if (mutatedSource === source) {
    throw new Error(`Mutation fixture "${mutationName}" did not alter its source.`);
  }
  return mutatedSource;
};

const replaceViewportDeclaration = (source, constantName, replacement, mutationName) => {
  const declaration = getViewportDeclaration(source, constantName);
  return replaceSourceOrThrow(
    source,
    declaration.source,
    replacement,
    mutationName ?? `${constantName} declaration replacement`,
  );
};

const createViewportDeclaration = (constantName, widths) => `const ${constantName} = [${widths.join(', ')}];`;

const replaceViewportLoopIterable = (
  source,
  constantName,
  iterable,
  mutationName,
  formatLoop = (bindingName, replacementIterable) => `for (const ${bindingName} of ${replacementIterable})`,
) => {
  const directLoop = new RegExp(
    `for\\s*\\(\\s*const\\s+(${JAVASCRIPT_IDENTIFIER_PATTERN})\\s+of\\s+` + `${escapeRegex(constantName)}\\s*\\)`,
  );
  const loop = source.match(directLoop);
  if (!loop) {
    throw new Error(`Mutation fixture "${mutationName}" did not find ${constantName}'s direct loop.`);
  }
  return replaceSourceOrThrow(source, directLoop, formatLoop(loop[1], iterable), mutationName);
};

const mutateToolbarJourney = (source, mutationName, mutateCallback) => {
  const titleIndex = source.indexOf(`'${TOOLBAR_FOCUS_JOURNEY_TITLE}'`);
  const callbackStart = source.indexOf('async () => {', titleIndex);
  const callbackEnd = source.indexOf('\nbrowserTest(', callbackStart);
  if (titleIndex < 0 || callbackStart < 0 || callbackEnd < 0) {
    throw new Error(`Mutation fixture "${mutationName}" could not isolate the toolbar journey.`);
  }

  const callbackSource = source.slice(callbackStart, callbackEnd);
  const mutatedCallback = mutateCallback(callbackSource);
  if (mutatedCallback === callbackSource) {
    throw new Error(`Mutation fixture "${mutationName}" did not alter the toolbar journey.`);
  }
  return source.slice(0, callbackStart) + mutatedCallback + source.slice(callbackEnd);
};

const renameIdentifiers = (source, renames, mutationName) => {
  let renamedSource = source;
  for (const [currentName, replacementName] of Object.entries(renames)) {
    renamedSource = replaceSourceOrThrow(
      renamedSource,
      new RegExp(`\\b${escapeRegex(currentName)}\\b`, 'g'),
      replacementName,
      `${mutationName}: ${currentName}`,
    );
  }
  return renamedSource;
};

const createReverseOrderDerivationPattern = (reverseOrderName, forwardOrderName) =>
  new RegExp(
    `\\bconst\\s+${escapeRegex(reverseOrderName)}\\s*=\\s*` +
      `${escapeRegex(forwardOrderName)}\\s*\\.\\s*slice\\s*\\(\\s*\\)` +
      `\\s*\\.\\s*reverse\\s*\\(\\s*\\)\\s*;`,
  );

const replaceWithAlternateLayout = (source, pattern, layouts, mutationName) => {
  const currentLayout = source.match(pattern)?.[0];
  const replacement = layouts.find((layout) => layout !== currentLayout);
  if (!currentLayout || !replacement) {
    throw new Error(`Mutation fixture "${mutationName}" could not select an alternate layout.`);
  }
  return replaceSourceOrThrow(source, pattern, replacement, mutationName);
};

const VIEWPORT_CONTRACTS = [
  {
    constantName: 'TOOLBAR_VIEWPORT_WIDTHS',
    expectedWidths: [375, 500, 800, 1280, 1366, 1367, 1500],
    journeyTitle: TOOLBAR_FOCUS_JOURNEY_TITLE,
  },
  {
    constantName: 'TOOLBAR_FOCUS_VIEWPORT_WIDTHS',
    expectedWidths: [375, 500, 800, 1280],
    journeyTitle: TOOLBAR_FOCUS_JOURNEY_TITLE,
  },
  {
    constantName: 'GRID_FOCUS_VIEWPORT_WIDTHS',
    expectedWidths: [375, 500, 800, 1280],
    journeyTitle: 'request-grid focus stays visible without disrupting pointer sorting or resizing',
  },
];

test('fails explicitly in CI when no browser executable is discoverable', () => {
  expect(() => evaluateBrowserSuiteRegistration({ CI: 'true' })).toThrow(
    'Real-browser regression tests require an executable Chrome or Edge in CI.',
  );
});

test('pins the browser source-contract policy to the required quality workflow', () => {
  expect(() => assertBrowserPolicyGuardPinned(qualityGatesSource)).not.toThrow();
});

test('policy invocation removal fails with a named pin diagnostic', () => {
  const mutatedWorkflow = replaceSourceOrThrow(
    qualityGatesSource,
    BROWSER_POLICY_GUARD_COMMAND,
    'npm test -- --runInBand',
    'browser policy workflow invocation removal',
  );

  expect(() => assertBrowserPolicyGuardPinned(mutatedWorkflow)).toThrow(BROWSER_POLICY_GUARD_CONTRACT);
});

test('locks toolbar branding coverage to both exact sides of the content breakpoint', () => {
  assertExactViewportWidths(browserSuiteSource, 'TOOLBAR_VIEWPORT_WIDTHS', [375, 500, 800, 1280, 1366, 1367, 1500]);
});

test('locks toolbar focus coverage to narrow, stacked, and split layouts', () => {
  assertExactViewportWidths(browserSuiteSource, 'TOOLBAR_FOCUS_VIEWPORT_WIDTHS', [375, 500, 800, 1280]);
});

test('locks request-grid focus coverage to narrow, stacked, and split layouts', () => {
  assertExactViewportWidths(browserSuiteSource, 'GRID_FOCUS_VIEWPORT_WIDTHS', [375, 500, 800, 1280]);
});

test.each(VIEWPORT_CONTRACTS)(
  '$constantName accepts equivalent multiline declaration and loop formatting',
  ({ constantName, expectedWidths, journeyTitle }) => {
    const multilineDeclaration = [
      'const',
      `  ${constantName}`,
      '  =',
      '  [',
      ...expectedWidths.map((width) => `    ${width},`),
      '  ];',
    ].join('\n');
    let reformattedSource = replaceViewportDeclaration(
      browserSuiteSource,
      constantName,
      multilineDeclaration,
      `${constantName} multiline declaration`,
    );
    reformattedSource = replaceViewportLoopIterable(
      reformattedSource,
      constantName,
      constantName,
      `${constantName} multiline loop`,
      (bindingName, iterable) => `for (\n        const ${bindingName}\n        of ${iterable}\n      )`,
    );

    expect(() => assertExactViewportWidths(reformattedSource, constantName, expectedWidths)).not.toThrow();
    expect(() => assertJourneyConsumesViewportWidths(reformattedSource, journeyTitle, constantName)).not.toThrow();
  },
);

const viewportDeclarationMutations = VIEWPORT_CONTRACTS.flatMap((contract) => {
  const { constantName, expectedWidths } = contract;
  return [
    {
      ...contract,
      mutationName: 'missing declaration',
      mutateSource: (source) =>
        replaceViewportDeclaration(source, constantName, '', `${constantName} missing declaration`),
    },
    {
      ...contract,
      mutationName: 'renamed declaration',
      mutateSource: (source) =>
        replaceViewportDeclaration(
          source,
          constantName,
          createViewportDeclaration(`${constantName}_RENAMED`, expectedWidths),
          `${constantName} renamed declaration`,
        ),
    },
    {
      ...contract,
      mutationName: 'narrowed declaration',
      mutateSource: (source) =>
        replaceViewportDeclaration(
          source,
          constantName,
          createViewportDeclaration(constantName, [1280]),
          `${constantName} narrowed declaration`,
        ),
    },
    {
      ...contract,
      mutationName: 'malformed declaration',
      mutateSource: (source) =>
        replaceViewportDeclaration(
          source,
          constantName,
          `const ${constantName} = [${expectedWidths.join(', ')}, viewportWidth];`,
          `${constantName} malformed declaration`,
        ),
    },
    {
      ...contract,
      mutationName: 'divergent declaration',
      mutateSource: (source) =>
        replaceViewportDeclaration(
          source,
          constantName,
          createViewportDeclaration(constantName, expectedWidths.toReversed()),
          `${constantName} divergent declaration`,
        ),
    },
  ];
});

test.each(viewportDeclarationMutations)(
  '$constantName $mutationName fails with a named diagnostic',
  ({ constantName, expectedWidths, mutateSource }) => {
    const mutatedSource = mutateSource(browserSuiteSource);

    expect(() => assertExactViewportWidths(mutatedSource, constantName, expectedWidths)).toThrow(constantName);
  },
);

const viewportLoopMutations = VIEWPORT_CONTRACTS.flatMap((contract) => {
  const { constantName, expectedWidths } = contract;
  return [
    {
      ...contract,
      mutationName: 'divergent literal loop',
      mutateSource: (source) =>
        replaceViewportLoopIterable(
          source,
          constantName,
          `[${expectedWidths.toReversed().join(', ')}]`,
          `${constantName} divergent literal loop`,
        ),
    },
    {
      ...contract,
      mutationName: 'indirect alias loop',
      mutateSource: (source) => {
        const aliasName = `${constantName}_COPY`;
        const sourceWithAlias = replaceViewportDeclaration(
          source,
          constantName,
          `${createViewportDeclaration(constantName, expectedWidths)}\n` + `const ${aliasName} = ${constantName};`,
          `${constantName} alias declaration`,
        );
        return replaceViewportLoopIterable(
          sourceWithAlias,
          constantName,
          aliasName,
          `${constantName} indirect alias loop`,
        );
      },
    },
  ];
});

test.each(viewportLoopMutations)(
  '$constantName $mutationName fails with a named diagnostic',
  ({ constantName, journeyTitle, mutateSource }) => {
    const mutatedSource = mutateSource(browserSuiteSource);

    expect(() => assertJourneyConsumesViewportWidths(mutatedSource, journeyTitle, constantName)).toThrow(constantName);
  },
);

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

const multilineReverseOrderSource = mutateToolbarJourney(
  browserSuiteSource,
  'preformatted reverse-order derivation',
  (callbackSource) =>
    replaceWithAlternateLayout(
      callbackSource,
      createReverseOrderDerivationPattern('reverseTabOrder', 'expectedTabOrder'),
      [
        'const reverseTabOrder =\n        expectedTabOrder.slice().reverse();',
        'const reverseTabOrder =\n        expectedTabOrder\n          .slice()\n          .reverse();',
      ],
      'preformatted reverse-order derivation',
    ),
);

test.each([
  ['current source', browserSuiteSource],
  ['preformatted multiline source', multilineReverseOrderSource],
])('accepts equivalent reverse-focus layout, local bindings, and argument formatting from %s', (_, source) => {
  const mutationName = 'equivalent reverse-focus formatting';
  const equivalentSource = mutateToolbarJourney(source, mutationName, (callbackSource) => {
    let reformattedSource = renameIdentifiers(
      callbackSource,
      {
        mutatedReverseTabTrace: 'rejectedReverseTrace',
        reverseTabTrace: 'backwardFocusTrace',
        expectedTabOrder: 'forwardActionIds',
        reverseTabOrder: 'backwardActionIds',
        expectedId: 'expectedActionId',
        traceEntry: 'focusEntry',
        lockedToolbarScrollLeft: 'frozenToolbarOffset',
        originalScrollIntoView: 'savedScrollIntoView',
        options: 'scrollOptions',
        measurement: 'focusSample',
        toolbar: 'toolbarElement',
      },
      mutationName,
    );
    reformattedSource = replaceWithAlternateLayout(
      reformattedSource,
      createReverseOrderDerivationPattern('backwardActionIds', 'forwardActionIds'),
      [
        'const backwardActionIds =\n        forwardActionIds.slice().reverse();',
        'const backwardActionIds =\n        forwardActionIds\n          .slice()\n          .reverse();',
      ],
      `${mutationName}: reverse order layout`,
    );
    reformattedSource = replaceWithAlternateLayout(
      reformattedSource,
      /for\s*\(\s*const\s+expectedActionId\s+of\s+forwardActionIds\s*\)\s*\{/,
      [
        'for (\n        const expectedActionId\n        of forwardActionIds\n      ) {',
        'for (\n        const expectedActionId of\n          forwardActionIds\n      ) {',
      ],
      `${mutationName}: forward traversal layout`,
    );
    reformattedSource = replaceSourceOrThrow(
      reformattedSource,
      /await pressKey\(cdp, 'Tab', 'Tab', 9, 8\);/g,
      "await pressKey(\n            cdp,\n            'Tab',\n            'Tab',\n            9,\n            8,\n          );",
      `${mutationName}: Shift+Tab argument layout`,
    );
    reformattedSource = replaceSourceOrThrow(
      reformattedSource,
      /assertToolbarFocusContainment\(\s*focusSample\.backwardFocusTrace,\s*REVERSE_TOOLBAR_FOCUS_CONTRACT,\s*\);/,
      'assertToolbarFocusContainment(focusSample.backwardFocusTrace, REVERSE_TOOLBAR_FOCUS_CONTRACT);',
      `${mutationName}: production assertion layout`,
    );
    return replaceSourceOrThrow(
      reformattedSource,
      /Element\.prototype\.scrollIntoView = function \(scrollOptions\) \{/g,
      'Element.prototype.scrollIntoView = function (\n              scrollOptions,\n            ) {',
      `${mutationName}: mutation argument layout`,
    );
  });

  expect(() => assertToolbarReverseFocusContract(equivalentSource)).not.toThrow();
});

test('locks the toolbar journey to an in-event synchronous focus-scroll timing probe', () => {
  expect(() => assertSynchronousToolbarFocusScrollContract(browserSuiteSource)).not.toThrow();
});

test.each([
  {
    mutationName: 'journey registration rename',
    expectedDiagnostic: `"${TOOLBAR_FOCUS_JOURNEY_TITLE}" is not registered`,
    mutateSource: (source) =>
      replaceSourceOrThrow(
        source,
        `'${TOOLBAR_FOCUS_JOURNEY_TITLE}'`,
        `'${TOOLBAR_FOCUS_JOURNEY_TITLE} renamed'`,
        'journey registration rename',
      ),
  },
  {
    mutationName: 'reverse order derivation removal',
    expectedDiagnostic: 'missing exact reverse action order',
    mutateSource: (source) =>
      mutateToolbarJourney(source, 'reverse order derivation removal', (callbackSource) =>
        replaceSourceOrThrow(
          callbackSource,
          /\s*\.\s*slice\s*\(\s*\)\s*\.\s*reverse\s*\(\s*\)\s*;/,
          '.slice();',
          'reverse order derivation removal',
        ),
      ),
  },
  {
    mutationName: 'unrelated reverse order derivation',
    expectedDiagnostic: 'missing exact reverse action order',
    mutateSource: (source) =>
      mutateToolbarJourney(source, 'unrelated reverse order derivation', (callbackSource) =>
        replaceSourceOrThrow(
          callbackSource,
          createReverseOrderDerivationPattern('reverseTabOrder', 'expectedTabOrder'),
          'const decoyTabOrder = expectedTabOrder.slice(0, 3);\n' +
            '      const reverseTabOrder = decoyTabOrder.slice().reverse();',
          'unrelated reverse order derivation',
        ),
      ),
  },
  {
    mutationName: 'Shift+Tab removal',
    expectedDiagnostic: 'missing real Shift+Tab traversal',
    mutateSource: (source) =>
      mutateToolbarJourney(source, 'Shift+Tab removal', (callbackSource) =>
        replaceSourceOrThrow(
          callbackSource,
          "await pressKey(cdp, 'Tab', 'Tab', 9, 8);",
          "await pressKey(cdp, 'Tab', 'Tab', 9);",
          'Shift+Tab removal',
        ),
      ),
  },
  {
    mutationName: 'reverse trace capture removal',
    expectedDiagnostic: 'missing reverse trace capture',
    mutateSource: (source) =>
      mutateToolbarJourney(source, 'reverse trace capture removal', (callbackSource) =>
        replaceSourceOrThrow(
          callbackSource,
          "reverseTabTrace.push({ ...traceEntry, width, direction: 'reverse' });",
          'void traceEntry;',
          'reverse trace capture removal',
        ),
      ),
  },
  {
    mutationName: 'production reverse assertion removal',
    expectedDiagnostic: 'missing production reverse containment assertion',
    mutateSource: (source) =>
      mutateToolbarJourney(source, 'production reverse assertion removal', (callbackSource) =>
        replaceSourceOrThrow(
          callbackSource,
          /assertToolbarFocusContainment\(\s*measurement\.reverseTabTrace,\s*REVERSE_TOOLBAR_FOCUS_CONTRACT,\s*\);/,
          'void measurement.reverseTabTrace;',
          'production reverse assertion removal',
        ),
      ),
  },
  {
    mutationName: 'one-sided focus-scroll proof removal',
    expectedDiagnostic: 'missing one-sided focus-scroll mutation',
    mutateSource: (source) =>
      mutateToolbarJourney(source, 'one-sided focus-scroll proof removal', (callbackSource) =>
        replaceSourceOrThrow(
          callbackSource,
          /if \(toolbar\.contains\(this\)\) \{\s*toolbar\.scrollLeft = lockedToolbarScrollLeft;/,
          'if (toolbar.contains(this)) {\n                void lockedToolbarScrollLeft;',
          'one-sided focus-scroll proof removal',
        ),
      ),
  },
  {
    mutationName: 'named mutation rejection removal',
    expectedDiagnostic: 'missing named mutation rejection',
    mutateSource: (source) =>
      mutateToolbarJourney(source, 'named mutation rejection removal', (callbackSource) =>
        replaceSourceOrThrow(
          callbackSource,
          /expect\(\(\) =>\s*assertToolbarFocusContainment\(\s*mutatedReverseTabTrace,\s*REVERSE_TOOLBAR_FOCUS_CONTRACT,\s*\),\s*\)\.toThrow\(REVERSE_TOOLBAR_FOCUS_CONTRACT\);/,
          'void mutatedReverseTabTrace;',
          'named mutation rejection removal',
        ),
      ),
  },
])('$mutationName fails with the reverse-direction contract diagnostic', ({ expectedDiagnostic, mutateSource }) => {
  const mutatedSource = mutateSource(browserSuiteSource);

  expect(() => assertToolbarReverseFocusContract(mutatedSource)).toThrow(
    `${REVERSE_TOOLBAR_FOCUS_CONTRACT}: ${expectedDiagnostic}`,
  );
});

test('mutation fixtures fail closed when their source target drifts', () => {
  expect(() =>
    replaceSourceOrThrow(
      browserSuiteSource,
      'source text that is deliberately absent',
      'replacement',
      'missing mutation sentinel',
    ),
  ).toThrow('Mutation fixture "missing mutation sentinel" did not alter its source.');
});

test.each([
  [
    'capture-phase event identity removal',
    (source) =>
      source.replace(
        /(probe\.currentEventId = \+\+probe\.nextEventId;\s*},\s*)\{ capture: true, signal: controller\.signal \}/,
        '$1{ signal: controller.signal }',
      ),
  ],
  [
    'production timing assertion removal',
    (source) =>
      source.replace('assertSynchronousToolbarFocusScroll(focusScrollTimingTrace);', 'void focusScrollTimingTrace;'),
  ],
])('%s fails with the synchronous focus-scroll diagnostic', (_mutationName, mutateSource) => {
  const mutatedSource = mutateSource(browserSuiteSource);

  expect(mutatedSource).not.toBe(browserSuiteSource);
  expect(() => assertSynchronousToolbarFocusScrollContract(mutatedSource)).toThrow(
    SYNCHRONOUS_TOOLBAR_FOCUS_SCROLL_CONTRACT,
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
