'use strict';
// Minimal background worker with a single job: when the Network+ panel
// opens its pop-out mirror tab, minimize the undocked DevTools window so
// capture keeps running out of the way. chrome.windows needs no manifest
// permission, and the window is located by its devtools type alone — no
// tab URLs or page data are read. A docked DevTools has no window of its
// own, so the request answers { minimized: false } and nothing moves.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'networkplus-minimize-devtools') return undefined;
  chrome.windows.getLastFocused({ windowTypes: ['devtools'] }, (devtoolsWindow) => {
    if (chrome.runtime.lastError || !devtoolsWindow || devtoolsWindow.type !== 'devtools') {
      sendResponse({ minimized: false });
      return;
    }
    chrome.windows.update(devtoolsWindow.id, { state: 'minimized' }, () => {
      sendResponse({ minimized: !chrome.runtime.lastError });
    });
  });
  return true;
});
