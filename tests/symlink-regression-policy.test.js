const fs = require('fs');
const path = require('path');
const vm = require('vm');
const extensionPackage = require('../scripts/check-extension-package');

const suitePath = path.join(__dirname, 'extension-package.test.js');
const suiteSource = fs.readFileSync(suitePath, 'utf8');
const regressionTitle = 'rejects runtime symlinks and parent-directory root escapes';

const executeRegressionWithDeniedSymlink = (deniedAttempt) => {
  const registrations = [];
  const cleanupCallbacks = [];
  const events = [];
  const testApi = (title, callback) => registrations.push({ callback, title });
  testApi.each = (cases) => (title, callback) => {
    cases.forEach((parameters, index) => {
      const args = Array.isArray(parameters) ? parameters : [parameters];
      registrations.push({
        callback: () => callback(...args),
        title: `${title} [${index}]`,
      });
    });
  };

  const instrumentedPackage = {
    ...extensionPackage,
    createArchive: (...args) => {
      events.push('guard:createArchive');
      return extensionPackage.createArchive(...args);
    },
    validateExtension: (...args) => {
      events.push('guard:validateExtension');
      return extensionPackage.validateExtension(...args);
    },
  };
  const originalSymlinkSync = fs.symlinkSync;
  let symlinkAttempts = 0;
  fs.symlinkSync = (...args) => {
    symlinkAttempts += 1;
    if (symlinkAttempts === deniedAttempt) {
      events.push('symlink:denied');
      const error = new Error('Injected symlink creation denial');
      error.code = 'EPERM';
      throw error;
    }
    events.push('symlink:created');
    return originalSymlinkSync(...args);
  };

  let thrownError = null;
  try {
    vm.runInNewContext(
      suiteSource,
      {
        Buffer,
        __dirname: path.dirname(suitePath),
        afterEach: (callback) => cleanupCallbacks.push(callback),
        console: { warn: () => {} },
        describe: (_, callback) => callback(),
        expect,
        jest,
        require: (request) =>
          request === '../scripts/check-extension-package' ? instrumentedPackage : require(request),
        test: testApi,
      },
      { filename: suitePath },
    );

    const regression = registrations.find(({ title }) => title === regressionTitle);
    if (!regression) throw new Error(`Regression test was not registered: ${regressionTitle}`);
    regression.callback();
  } catch (error) {
    thrownError = error;
  } finally {
    fs.symlinkSync = originalSymlinkSync;
    for (const cleanup of cleanupCallbacks.reverse()) cleanup();
  }

  const denialIndex = events.indexOf('symlink:denied');
  const guardRanAfterDenial =
    denialIndex >= 0 && events.slice(denialIndex + 1).some((event) => event.startsWith('guard:'));
  const guardRanWithoutSymlinks =
    symlinkAttempts === 0 && events.filter((event) => event.startsWith('guard:')).length >= 3;

  return {
    failedClosed: thrownError?.code === 'EPERM',
    securityGuardRan: guardRanAfterDenial || guardRanWithoutSymlinks,
  };
};

test.each([
  ['runtime-file', 1],
  ['parent-directory', 2],
])('does not silently pass the %s guard when symlink creation returns EPERM', (_, deniedAttempt) => {
  expect(executeRegressionWithDeniedSymlink(deniedAttempt)).not.toEqual({
    failedClosed: false,
    securityGuardRan: false,
  });
});
