import { marketoMunchkin } from '../../../vendors/analytics/marketo';
import type { TraceSpec } from '../harness';

export const marketoTrace: TraceSpec = {
	granted: { marketing: true },
	name: 'marketo',
	onFileLoad(_src, stubs) {
		stubs.install('Munchkin', stubs.api('Munchkin', { init: () => undefined }));
	},
	script: () =>
		marketoMunchkin({
			initOptions: { asyncOnly: true },
			munchkinId: '123-ABC-456',
		}),
};

export const traces = [marketoTrace];
