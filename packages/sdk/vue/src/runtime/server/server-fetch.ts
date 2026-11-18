import type { ManifestFetch } from '@inth/sdk/server';

interface NitroAppWithLocalFetch {
	localFetch: ManifestFetch;
}

export const createServerFetch =
	(useNitroApp: () => NitroAppWithLocalFetch): ManifestFetch =>
	(input, init) =>
		useNitroApp().localFetch(input, init);
