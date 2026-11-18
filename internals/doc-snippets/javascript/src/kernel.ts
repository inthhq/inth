// #region docs:kernel title="src/consent.ts"
import { createConsentKernel, createHostedTransport } from '@inth/sdk/engine';
import { createPersistence } from '@inth/sdk/modules/persistence';
import { createScriptLoader } from '@inth/sdk/modules/script-loader';

import { scripts } from './scripts';

export const startConsentKernel = async function startConsentKernel(
	projectUrl: string
) {
	const kernel = createConsentKernel({
		transport: createHostedTransport({ projectUrl }),
	});
	// Each module is yours to create and dispose. This kernel has no iframe
	// blocker, network blocker, data clearing or reload after revocation.
	const persistence = createPersistence({ kernel });
	const loader = createScriptLoader({ kernel, scripts });
	await kernel.commands.init();
	return {
		dispose() {
			loader.dispose();
			persistence.dispose();
			kernel.dispose();
		},
		kernel,
	};
};
// #endregion docs:kernel
