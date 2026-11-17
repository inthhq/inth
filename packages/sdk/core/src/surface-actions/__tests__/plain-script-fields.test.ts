/**
 * Every `Script` field is either one a page can honour when it inserts a
 * plain script without the loader, or one that leaves the script to the
 * loader (`LOADER_FIELDS`). A field added to `Script` without a place in
 * one of the two lists fails the type check below.
 */
import { describe, expect, test } from 'vitest';

import type { Script } from '../../libs/script-loader/types';
import {
	isPlainScript,
	LOADER_FIELDS,
	SERVER_STARTED_ENGINE_FIELDS,
	scriptsNeedEngine,
} from '../plain-scripts';

/**
 * Fields `startPlainScripts` applies as the loader would, or that do not
 * change what it inserts.
 */
const PLAIN_SAFE_FIELDS = [
	'async',
	'attributes',
	'category',
	'defer',
	'fetchPriority',
	'id',
	'nonce',
	'resourceKey',
	'src',
	'target',
] as const satisfies readonly (keyof Script)[];

type Unsorted = Exclude<
	keyof Script,
	(typeof PLAIN_SAFE_FIELDS)[number] | (typeof LOADER_FIELDS)[number]
>;
// Fails to compile when a `Script` field is in neither list.
const everyFieldSorted: [Unsorted] extends [never] ? true : Unsorted = true;

const base: Script = {
	category: 'marketing',
	id: 'pixel',
	src: 'https://cdn.example.com/pixel.js',
};

/** A value for `field` that sets it. */
const valueFor = (field: keyof Script): unknown => {
	switch (field) {
		case 'attributes':
			return { 'data-x': '1' };
		case 'iabLegIntPurposes':
		case 'iabPurposes':
		case 'iabSpecialFeatures':
			return [1];
		case 'vendorDetails':
			return { id: 'pixel' };
		default:
			return field.startsWith('on') ||
				field === 'serverStart' ||
				field === 'validate'
				? () => undefined
				: true;
	}
};

describe('Script fields', () => {
	test('each field is in exactly one list', () => {
		expect(everyFieldSorted).toBe(true);
		const loader = new Set<string>(LOADER_FIELDS);
		expect(PLAIN_SAFE_FIELDS.filter((field) => loader.has(field))).toEqual([]);
	});

	test.each([...LOADER_FIELDS])(
		'%s leaves the script to the loader',
		(field) => {
			expect(isPlainScript({ ...base, [field]: valueFor(field) })).toBe(false);
		}
	);

	test.each(
		PLAIN_SAFE_FIELDS.filter(
			(field) => field !== 'src' && field !== 'id' && field !== 'category'
		)
	)('%s keeps a script plain', (field) => {
		expect(isPlainScript({ ...base, [field]: valueFor(field) })).toBe(true);
	});
});

/**
 * Loader fields of a runnable script the server started that let the
 * engine wait: the server start already did their work, or a later change
 * that needs the engine anyway does it. The rest need the engine at once
 * (`SERVER_STARTED_ENGINE_FIELDS`).
 */
const SERVER_STARTED_WAITING_FIELDS = [
	'alwaysLoad',
	'anonymizeId',
	'callbackOnly',
	'iabLegIntPurposes',
	'iabPurposes',
	'iabSpecialFeatures',
	'observeConsentBeforeLoad',
	'onBeforeLoad',
	'onConsentChange',
	'persistAfterConsentRevoked',
	'serverStart',
	'textContent',
	'validate',
	'vendor',
	'vendorDetails',
	'vendorId',
] as const satisfies readonly (typeof LOADER_FIELDS)[number][];

type UnsortedServerStarted = Exclude<
	(typeof LOADER_FIELDS)[number],
	| (typeof SERVER_STARTED_WAITING_FIELDS)[number]
	| (typeof SERVER_STARTED_ENGINE_FIELDS)[number]
>;
// Fails to compile when a loader field is in neither list.
const everyServerStartedFieldSorted: [UnsortedServerStarted] extends [never]
	? true
	: UnsortedServerStarted = true;

describe('loader fields of a script the server started', () => {
	const granted = {
		effectivePermissions: {
			experience: false,
			functionality: false,
			marketing: true,
			measurement: false,
			necessary: true,
		},
	};
	const started: Script = { ...base, serverStart: () => ({ code: '' }) };
	const needsEngine = (script: Script): boolean =>
		scriptsNeedEngine([script], granted, true, false, () => true);

	test('each field is in exactly one list', () => {
		expect(everyServerStartedFieldSorted).toBe(true);
		const engine = new Set<string>(SERVER_STARTED_ENGINE_FIELDS);
		expect(
			SERVER_STARTED_WAITING_FIELDS.filter((field) => engine.has(field))
		).toEqual([]);
		expect(
			[...SERVER_STARTED_ENGINE_FIELDS, ...SERVER_STARTED_WAITING_FIELDS].sort()
		).toEqual([...LOADER_FIELDS].sort());
	});

	test('the script alone lets the engine wait', () => {
		expect(needsEngine(started)).toBe(false);
	});

	test.each([...SERVER_STARTED_ENGINE_FIELDS])(
		'%s needs the engine at once',
		(field) => {
			expect(needsEngine({ ...started, [field]: valueFor(field) })).toBe(true);
		}
	);

	test.each(
		SERVER_STARTED_WAITING_FIELDS.filter((field) => field !== 'serverStart')
	)('%s lets the engine wait', (field) => {
		expect(needsEngine({ ...started, [field]: valueFor(field) })).toBe(false);
	});
});
