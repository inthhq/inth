import { activeCampaignTracking } from '../../../vendors/email-and-sms/activecampaign';
import type { TraceSpec, TraceStubs } from '../harness';

// diffuser.js replaces the `pgo` queue stub with its own function and runs
// what was queued.
const runFile = (_src: string, stubs: TraceStubs) => {
	const queued = (stubs.win.pgo as { q?: IArguments[] } | undefined)?.q ?? [];
	const pgo = stubs.fn('pgo');
	stubs.install('pgo', pgo);
	for (const args of queued) {
		pgo(...Array.from(args));
	}
};

export const activeCampaignTrace: TraceSpec = {
	granted: { marketing: true },
	name: 'activecampaign',
	onFileLoad: runFile,
	script: () =>
		activeCampaignTracking({ accountId: '12345', email: 'user@example.com' }),
};

/** The page already runs ActiveCampaign's own snippet. */
export const activeCampaignUnmanagedTrace: TraceSpec = {
	...activeCampaignTrace,
	name: 'activecampaign.unmanaged-tracker',
	scenarios: [
		{
			name: 'an unmanaged tracker is already on the page',
			start: 'denied',
			steps: ['grant', 'load', 'dispose'],
		},
	],
	setup(stubs) {
		stubs.install('pgo', stubs.fn('pgo'));
	},
	standardScenarios: false,
};

export const traces = [activeCampaignTrace, activeCampaignUnmanagedTrace];
