import { wisepops } from '../../../vendors/functional/wisepops';
import type { TraceSpec } from '../harness';

// The loader file replaces the queue stub with the real function.
export const wisepopsTrace: TraceSpec = {
	granted: { marketing: true },
	name: 'wisepops',
	onFileLoad(_src, stubs) {
		stubs.install('wisepops', stubs.fn('wisepops'));
	},
	script: () =>
		wisepops({ options: { autoPageview: 'url' }, siteId: 'site-id' }),
};

export const traces = [wisepopsTrace];
