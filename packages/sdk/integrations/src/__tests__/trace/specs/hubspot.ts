import { hubspot } from '../../../vendors/analytics/hubspot';
import type { TraceScenario, TraceSpec, TraceStubs } from '../harness';

const noop = () => undefined;

// The loader file replaces both command queues with dispatchers that run
// what was queued, as HubSpot's tracking code does.
const replaceQueue = (stubs: TraceStubs, name: '_hsp' | '_hsq') => {
	const current = stubs.win[name];
	// A second run finds the dispatcher already installed.
	const queued = Array.isArray(current) ? (current as unknown[][]) : [];
	const push = stubs.fn(`${name}.push`);
	stubs.install(name, { push });
	for (const command of queued) {
		push(command);
	}
};

const runTracking = (_src: string, stubs: TraceStubs) => {
	replaceQueue(stubs, '_hsp');
	replaceQueue(stubs, '_hsq');
};

// With chat, the file also creates `HubSpotConversations` and runs the
// ready callbacks. `widget.load` reports the widget loaded at once.
const runWithChat = (src: string, stubs: TraceStubs) => {
	runTracking(src, stubs);
	const listeners = new Set<() => void>();
	let loaded = false;
	stubs.install(
		'HubSpotConversations',
		stubs.api('HubSpotConversations', {
			clear: noop,
			off: (_event: unknown, listener: unknown) => {
				listeners.delete(listener as () => void);
			},
			on: (_event: unknown, listener: unknown) => {
				listeners.add(listener as () => void);
			},
			widget: {
				load: () => {
					loaded = true;
					for (const listener of listeners) {
						listener();
					}
				},
				remove: () => {
					loaded = false;
				},
				status: () => ({ loaded }),
			},
		})
	);
	const ready = Array.isArray(stubs.win.hsConversationsOnReady)
		? (stubs.win.hsConversationsOnReady as (() => void)[])
		: [];
	for (const onReady of ready) {
		onReady();
	}
};

const scenarios: TraceScenario[] = [
	{
		name: 'other categories change while granted',
		start: 'granted',
		steps: [
			'load',
			{
				consent: { marketing: true, measurement: true },
				label: 'grant measurement',
			},
			{
				consent: { functionality: true, marketing: true, measurement: true },
				label: 'grant functionality',
			},
			{
				consent: { functionality: true, marketing: true },
				label: 'revoke measurement',
			},
			'dispose',
		],
	},
];

export const hubspotTrace: TraceSpec = {
	granted: { marketing: true },
	name: 'hubspot',
	onFileLoad: runTracking,
	scenarios,
	script: () => hubspot({ portalId: '53' }),
};

/** With the chat widget, which needs functionality consent too. */
export const hubspotChatTrace: TraceSpec = {
	granted: { functionality: true, marketing: true },
	name: 'hubspot.chat',
	onFileLoad: runWithChat,
	scenarios,
	script: () => hubspot({ chat: true, portalId: '53' }),
};

export const traces = [hubspotTrace, hubspotChatTrace];
