import { eloquaTracking } from '../../../vendors/analytics/oracle-eloqua';
import type { TraceSpec, TraceStubs } from '../harness';

const siteId = '1973398186';

// elqCfg.min.js replaces the queue with a dispatcher. An opt-in or opt-out
// command inserts Eloqua's consent response script, as in the e2e suite.
const runFile = (src: string, stubs: TraceStubs) => {
	if (src.includes('svrGP')) {
		return;
	}
	stubs.install('_elqQ', {
		push: stubs.fn('_elqQ.push', (command) => {
			const [name] = command as unknown[];
			if (name === 'elqOptIn' || name === 'elqOptOut') {
				const response = document.createElement('script');
				response.src = `https://s${siteId}.t.eloqua.com/visitor/v200/svrGP?pps=${name === 'elqOptIn' ? '41' : '42'}&siteid=${siteId}`;
				document.head.append(response);
			}
		}),
	});
};

export const oracleEloquaTrace: TraceSpec = {
	granted: { marketing: true },
	name: 'oracle-eloqua',
	onFileLoad: runFile,
	scenarios: [
		{
			name: 'revoke while the opt-in response is pending',
			start: 'granted',
			steps: [
				{ load: 'elqCfg' },
				'deny',
				{ load: 'pps=41' },
				'load',
				'grant',
				'load',
				'dispose',
			],
		},
		{
			name: 'the opt-in response fails',
			start: 'granted',
			steps: [
				{ load: 'elqCfg' },
				{ error: 'pps=41' },
				'deny',
				'load',
				'dispose',
			],
		},
	],
	script: () =>
		eloquaTracking({ firstPartyCookieDomain: 'Track.Example.com', siteId }),
};

export const traces = [oracleEloquaTrace];
