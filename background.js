'use strict';
// Minimal background worker with a single job: when the Network+ panel
// opens its pop-out mirror tab, minimize the undocked DevTools window so
// capture keeps running out of the way. chrome.windows needs no manifest
// permission, and the window is located by its devtools type alone — no
// tab URLs or page data are read. A docked DevTools has no window of its
// own, so the request answers { minimized: false } and nothing moves.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'networkplus-minimize-devtools') return undefined;
  // windowTypes is ignored by getLastFocused (deprecated since Chrome 46),
  // and by reply time the fresh pop-out tab already stole the focus, so
  // getAll does the type filtering and focus only breaks ties.
  chrome.windows.getAll({ windowTypes: ['devtools'] }, (devtoolsWindows) => {
    if (chrome.runtime.lastError || !Array.isArray(devtoolsWindows) || devtoolsWindows.length === 0) {
      sendResponse({ minimized: false });
      return;
    }
    const target =
      devtoolsWindows.find((candidate) => candidate.focused === true) ||
      (devtoolsWindows.length === 1 ? devtoolsWindows[0] : null);
    if (!target) {
      sendResponse({ minimized: false });
      return;
    }
    chrome.windows.update(target.id, { state: 'minimized' }, () => {
      sendResponse({ minimized: !chrome.runtime.lastError });
    });
  });
  return true;
});
