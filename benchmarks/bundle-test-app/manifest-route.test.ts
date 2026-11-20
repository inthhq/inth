import { createV1ManifestTransport } from '@inth/sdk/transports/manifest';
import { describe, expect, it } from 'vitest';

import { GET } from './app/api/bench-consent/v1/consent/manifest/route';

describe('the bench-consent manifest route', () => {
	it('serves a manifest the manifest transport resolves a policy from', async () => {
		const response = await GET();
		const transport = createV1ManifestTransport({
			projectUrl: 'https://bench.invalid',
			snapshot: await response.json(),
		});

		const init = await transport.init({
			overrides: { country: 'DE', language: 'en' },
			user: null,
		});

		expect(init.policyResolution).toMatchObject({ status: 'matched' });
	});
});
