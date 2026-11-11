(function (origins, token, next) {
	'use strict';
	var w = window;
	var origin = w.location.origin;
	var listed = false;
	for (var i = 0; i < origins.length; i += 1) {
		if (origins[i] === origin) {
			listed = true;
		}
	}
	if (!listed || w.top !== w) {
		return false;
	}
	var api = w.__c15tNativeConsent;
	return !!(api && typeof api.update === 'function' && api.update(token, next));
});
