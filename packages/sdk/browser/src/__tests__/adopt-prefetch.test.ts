/**
 * @vitest-environment jsdom
 *
 * The engine starts from the init script's `/v1/consent/init` answer only
 * when it would send the same request, manifest runtime level included.
 */
import { MANIFEST_RUNTIME_LEVEL } from '@inth/sdk-core/manifest-runtime';
import { afterEach, describe, expect, test } from 'vite-plus/test';

import { adoptBoot, releaseBoot, withInitPrefetch } from '../init/adopt';
import type { InitBoot } from '../init/boot';
import { version } from '../version';

const PROJECT = 'https://consent.example';

const boot = (manifestLevel: number): InitBoot =>
	({
		calls: [],
		commit: null,
		disposed: false,
		prefetch: {
			config: { initialPolicyPending: false },
			manifestLevel,
			overrides: undefined,
			projectUrl: PROJECT,
		},
		script: null,
		ui: null,
		version,
	}) as unknown as InitBoot;

afterEach(() => {
	releaseBoot();
});

describe('withInitPrefetch', () => {
	test('hands over an answer made for this runtime level', () => {
		adoptBoot(boot(MANIFEST_RUNTIME_LEVEL));

		expect(withInitPrefetch({ projectUrl: PROJECT }).prefetch).toMatchObject({
			initialPolicyPending: false,
		});
	});

	test('keeps an answer made for another runtime level', () => {
		adoptBoot(boot(MANIFEST_RUNTIME_LEVEL + 1));

		expect(withInitPrefetch({ projectUrl: PROJECT }).prefetch).toBeUndefined();
	});
});
