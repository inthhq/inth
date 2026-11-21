/**
 * Sends a single opt-out request through the `/v1` transport and navigates
 * away in the same tick, to prove Chromium delivers the request after the
 * page leaves.
 */
import { createV1HostedTransport } from '@inth/sdk-core';

const params = new URLSearchParams(location.search);
const idempotencyKey =
	params.get('idempotencyKey') ?? '0193e5a8-7c1e-7b7a-9d7e-2f0c9a3b4d5e';
const subjectId =
	params.get('subjectId') ?? '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c';
const target = params.get('projectUrl') ?? '/__inth-test__/keepalive-backend';

const transport = createV1HostedTransport({
	projectUrl: target,
	property: 'www.example.com',
});

void transport
	.optOut({
		country: 'US',
		givenAt: Date.now(),
		idempotencyKey,
		method: 'button',
		region: 'CA',
		subjectId,
		user: null,
	})
	.catch(() => undefined);

window.location.replace('/__inth-test__/keepalive-done');
