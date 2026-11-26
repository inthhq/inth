import { gorgiasChat } from '../../../vendors/functional/gorgias';
import type { TraceSpec } from '../harness';

const noop = () => undefined;

let deferred: (() => void)[] = [];
const resolveInit = (index: number) => ({
	label: `init #${index + 1} resolves`,
	run() {
		deferred[index]?.();
	},
});

// Each file run installs a fresh `GorgiasChat` whose `init` resolves
// immediately, or, in the race scenario, when a step resolves it.
const createSpec = (pending: boolean): TraceSpec => ({
	granted: { functionality: true },
	name: 'gorgias',
	onFileLoad(_src, stubs) {
		const index = deferred.length;
		const init = pending
			? new Promise<void>((resolve) => {
					deferred.push(resolve);
				})
			: Promise.resolve();
		if (!pending) {
			deferred.push(noop);
		}
		stubs.install(
			'GorgiasChat',
			stubs.api(`GorgiasChat#${index + 1}`, {
				disableSegment: noop,
				init: () => init,
			})
		);
	},
	script: () => gorgiasChat({ appKey: 'app-key' }),
	setup() {
		deferred = [];
	},
});

const immediate = createSpec(false);
const raced = createSpec(true);

export const gorgiasTrace: TraceSpec = {
	...immediate,
	scenarios: [
		{
			name: 'widget-loaded event before the load event',
			start: 'granted',
			steps: [
				{
					label: 'bundle dispatches gorgias-widget-loaded',
					run({ stubs }) {
						stubs.install(
							'GorgiasChat',
							stubs.api('GorgiasChat#early', {
								disableSegment: noop,
								init: () => Promise.resolve(),
							})
						);
						window.dispatchEvent(new Event('gorgias-widget-loaded'));
					},
				},
				'load',
				'dispose',
			],
		},
		{
			// Segment runs while measurement is granted, and stops with the
			// chat when functionality is revoked, even with measurement kept.
			name: 'functionality revoked while measurement stays granted',
			start: 'granted',
			steps: [
				{
					consent: { functionality: true, measurement: true },
					label: 'grant measurement too',
				},
				'load',
				{
					consent: { measurement: true },
					label: 'revoke functionality, keep measurement',
				},
				'dispose',
			],
		},
	],
};

/** Init promises that resolve only when a step says so. */
export const gorgiasRaceTrace: TraceSpec = {
	...raced,
	name: 'gorgias.pending-init',
	scenarios: [
		{
			name: 'an old init promise settles after revoke and regrant',
			start: 'granted',
			steps: [
				'load',
				'deny',
				'grant',
				'load',
				resolveInit(0),
				resolveInit(1),
				'dispose',
			],
		},
		{
			name: 'revoke while init is pending',
			start: 'granted',
			steps: ['load', 'deny', resolveInit(0), 'dispose'],
		},
	],
	standardScenarios: false,
};

export const traces = [gorgiasTrace, gorgiasRaceTrace];
