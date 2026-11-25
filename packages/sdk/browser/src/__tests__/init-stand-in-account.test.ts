/**
 * The init script's stand-in with an account consent document queued
 * before the engine: the stand-in starts no script from its own
 * `/v1/consent/init` answer, because only the engine applies that
 * document. With nothing queued, it starts what the answer allows.
 */
import {
	policyRulePresets,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk-schema/types';
import { enTranslations } from '@inth/sdk-translations';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PREFETCH_WINDOW_KEY } from '../../../core/src/libs/page-globals';
import { releaseBoot } from '../init/adopt-boot';
import { runInitScript } from '../init/run-init-script';

const OWN_SRC = 'https://cdn.example/npm/@inth/sdk/lib/browser/dist/inth.js';
const BACKEND_URL = 'https://consent.example';
const target = window as unknown as Record<string, unknown>;

/** The `/v1/consent/init` answer: an opt-out policy for measurement and marketing. */
const optOutBody = () => ({
	branding: 'inth',
	location: { countryCode: 'US', regionCode: 'CA' },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({
			rules: [
				{
					...policyRulePresets.worldOptOutNoPrompt(),
					categories: ['measurement', 'marketing'],
					scopeMode: 'strict',
				},
			],
		})
	),
	translations: { language: 'en', translations: enTranslations },
});

let answerInit: (body: unknown) => void;

const start = (queued: unknown[]) => {
	target.inth = queued;
	const script = document.createElement('script');
	script.setAttribute('src', OWN_SRC);
	script.setAttribute('data-project-url', BACKEND_URL);
	return runInitScript(script);
};

const loaded = (file: string) =>
	[...document.head.querySelectorAll('script')]
		.map(({ src }) => src)
		.filter((src) => src.includes(file));

const settle = () =>
	new Promise((resolve) => {
		setTimeout(resolve, 10);
	});

const categories = [
	'config',
	{ consentCategories: ['measurement', 'marketing'] },
];

const gatedTag = () => {
	const gated = document.createElement('script');
	gated.setAttribute('type', 'text/plain');
	gated.setAttribute('data-inth-category', 'marketing');
	// Inline, so no earlier test's external tag is still loading ahead of it.
	gated.textContent = 'window.marketingRan = true;';
	document.head.append(gated);
};

const activated = () =>
	document.querySelectorAll(
		'script[data-inth-category="marketing"][data-inth-activated="true"]'
	);

beforeEach(() => {
	vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Promise((resolve) => {
					answerInit = (body) =>
						resolve({
							headers: { get: () => null },
							json: () => Promise.resolve(body),
							ok: true,
							status: 200,
						});
				})
		)
	);
});

afterEach(() => {
	// Not disposed: that rejects the queued calls' promises, which a page's
	// push() never holds.
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	releaseBoot();
	delete target.inth;
	Reflect.deleteProperty(target, PREFETCH_WINDOW_KEY);
	localStorage.clear();
	document.head.replaceChildren();
	document.body.replaceChildren();
});

describe('an account consent document queued before the engine', () => {
	it('leaves the scripts to the engine, which starts them with that consent', async () => {
		gatedTag();
		start([
			categories,
			['identify', { externalId: 'user_queued' }],
			['syncUserConsent', { categories: { marketing: false }, optOut: null }],
		]);
		answerInit(optOutBody());
		await settle();

		expect(activated()).toHaveLength(0);
		expect(loaded('inth.hosted.js')).toHaveLength(1);
	});

	it('still starts the scripts the answer allows with no account queued', async () => {
		gatedTag();
		start([categories]);
		answerInit(optOutBody());
		await settle();

		expect(activated()).toHaveLength(1);
	});
});
