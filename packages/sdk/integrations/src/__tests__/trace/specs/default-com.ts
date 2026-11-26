import {
	defaultComFormsSdk,
	defaultComPixel,
} from '../../../vendors/analytics/default-com';
import type { TraceScenario, TraceSpec, TraceStubs } from '../harness';

const noop = () => undefined;

interface PixelBootstrap {
	q?: unknown[][];
	setConsent?: (consent: unknown) => void;
}

// index.js swaps the queued `setConsent` for its own and replays the queue.
const runPixel = (_src: string, stubs: TraceStubs) => {
	const config = stubs.win.__defaultPixel__ as PixelBootstrap | undefined;
	if (!config) {
		stubs.note({ note: 'index.js found no __defaultPixel__' });
		return;
	}
	const setConsent = stubs.fn('__defaultPixel__.setConsent');
	const queued = config.q ?? [];
	config.q = [];
	config.setConsent = setConsent;
	for (const [command, value] of queued) {
		if (command === 'setConsent') {
			setConsent(value);
		}
	}
};

// sdk.js installs the Forms SDK client.
const runForms = (_src: string, stubs: TraceStubs) => {
	stubs.install(
		'DefaultPixelSDK',
		stubs.api('DefaultPixelSDK', {
			init: noop,
			on: () => noop,
			recordFormInteraction: () => Promise.resolve(),
			scheduler: { display: () => noop },
			setConsent: noop,
			submitForm: () => Promise.resolve({ status: 200, success: true }),
		})
	);
};

const marketingChanges = (granted: TraceSpec['granted']): TraceScenario => ({
	name: 'marketing changes while granted',
	start: 'granted',
	steps: [
		'load',
		{ consent: { ...granted, marketing: true }, label: 'grant marketing' },
		{ consent: granted, label: 'revoke marketing' },
		'dispose',
	],
});

export const defaultComPixelTrace: TraceSpec = {
	granted: { measurement: true },
	name: 'default-com.pixel',
	onFileLoad: runPixel,
	scenarios: [marketingChanges({ measurement: true })],
	script: () =>
		defaultComPixel({
			publicKey: 'public-key',
			schedulerOrigins: ['https://example.com'],
		}),
};

export const defaultComFormsTrace: TraceSpec = {
	granted: { functionality: true },
	name: 'default-com.forms',
	onFileLoad: runForms,
	scenarios: [marketingChanges({ functionality: true })],
	script: () =>
		defaultComFormsSdk({
			autoDisplayScheduler: false,
			publicKey: 'public-key',
		}),
};

// The Pixel must not load next to a Forms SDK another installation put on the page.
export const defaultComPixelFormsPresentTrace: TraceSpec = {
	...defaultComPixelTrace,
	name: 'default-com.pixel.forms-sdk-present',
	scenarios: [
		{
			name: 'granted with a Forms SDK already on the page',
			start: 'granted',
			steps: ['load', 'dispose'],
		},
	],
	setup(stubs) {
		runForms('', stubs);
	},
	standardScenarios: false,
};

// The Forms SDK must not load next to Pixel configuration another
// installation put on the page.
export const defaultComFormsPixelPresentTrace: TraceSpec = {
	...defaultComFormsTrace,
	name: 'default-com.forms.pixel-config-present',
	scenarios: [
		{
			name: 'granted with Pixel configuration already on the page',
			start: 'granted',
			steps: ['load', 'dispose'],
		},
	],
	setup() {
		(window as { __defaultPixel__?: unknown }).__defaultPixel__ = {
			key: 'existing-key',
			q: [['existing']],
		};
	},
	standardScenarios: false,
};

export const traces = [
	defaultComPixelTrace,
	defaultComPixelFormsPresentTrace,
	defaultComFormsTrace,
	defaultComFormsPixelPresentTrace,
];
