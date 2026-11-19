/**
 * The methods the analytics.js snippet (Segment's, which Customer.io and
 * Hightouch ship) stubs on its array queue before the SDK loads.
 */
export const ANALYTICS_JS_QUEUE_METHODS = [
	'trackSubmit',
	'trackClick',
	'trackLink',
	'trackForm',
	'pageview',
	'identify',
	'reset',
	'group',
	'track',
	'ready',
	'alias',
	'debug',
	'page',
	'once',
	'off',
	'on',
	'addSourceMiddleware',
	'addIntegrationMiddleware',
	'setAnonymousId',
	'addDestinationMiddleware',
] as const;
