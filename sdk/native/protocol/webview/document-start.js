(function (origins, token, initial) {
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
		return;
	}
	var key = '__c15tNativeConsent';
	if (Object.prototype.hasOwnProperty.call(w, key)) {
		return;
	}
	var freeze = Object.freeze;
	var listeners = [];
	var read = function (input) {
		var value = input && typeof input === 'object' ? input : {};
		var granted =
			value.permissions && typeof value.permissions === 'object'
				? value.permissions
				: {};
		var text = function (field) {
			return typeof field === 'string' && field.length > 0 ? field : null;
		};
		return freeze({
			version: 1,
			ready: value.ready === true,
			revision: typeof value.revision === 'number' ? value.revision : 0,
			model: text(value.model),
			permissions: freeze({
				necessary: true,
				functionality: granted.functionality === true,
				experience: granted.experience === true,
				measurement: granted.measurement === true,
				marketing: granted.marketing === true,
			}),
			tcString: text(value.tcString),
			gppString: text(value.gppString),
		});
	};
	var state = read(initial);
	var api = freeze({
		version: 1,
		getState: function () {
			return state;
		},
		subscribe: function (listener) {
			if (typeof listener !== 'function') {
				return function () {};
			}
			var entry = { listener: listener };
			listeners[listeners.length] = entry;
			return function () {
				entry.listener = null;
			};
		},
		update: function (key, next) {
			if (key !== token) {
				return false;
			}
			state = read(next);
			for (var index = 0; index < listeners.length; index += 1) {
				var current = listeners[index].listener;
				if (current) {
					try {
						current(state);
					} catch (error) {
						/* One listener must not stop the others. */
					}
				}
			}
			return true;
		},
		openPreferences: function () {
			var message = '{"type":"c15t:open-preferences"}';
			var webkit = w.webkit && w.webkit.messageHandlers;
			var channel =
				(webkit && webkit.c15tConsent) || w.c15tConsent || w.ReactNativeWebView;
			if (channel && typeof channel.postMessage === 'function') {
				channel.postMessage(message);
				return true;
			}
			return false;
		},
	});
	Object.defineProperty(w, key, {
		configurable: false,
		enumerable: false,
		value: api,
		writable: false,
	});
});
