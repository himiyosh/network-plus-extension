// Register the custom DevTools panel and log any registration failure.
if (chrome && chrome.devtools && chrome.devtools.panels) {
	chrome.devtools.panels.create('Network+', '', 'panel.html', function (_panel) {
		if (chrome.runtime && chrome.runtime.lastError) {
			console.error('Network+ panel create failed:', chrome.runtime.lastError.message);
			return;
		}
		console.log('Network+ panel registered');
	});
} else {
	console.error('chrome.devtools.panels is unavailable in this context');
}