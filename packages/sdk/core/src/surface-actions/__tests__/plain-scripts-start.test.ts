/**
 * @vitest-environment jsdom
 *
 * What a page starts without the loader. Anything the early path cannot
 * verify is left to the server start or the engine.
 */
import { afterEach, describe, expect, test } from 'vitest';

import type { Script } from '../../libs/script-loader/script.model';
import type { ConsentSnapshot } from '../../consent-kernel.model';
import {
	changedPlainScripts,
	claimPlainScripts,
	isPlainScript,
	obsoletePlainScripts,
	plainDeclarations,
	releasePlainScripts,
	startPlainScripts,
} from '../plain-scripts';

const granted: Pick<ConsentSnapshot, 'effectivePermissions'> = {
	effectivePermissions: {
		experience: false,
		functionality: false,
		marketing: true,
		measurement: false,
		necessary: true,
	},
};

const pixel: Script = {
	category: 'marketing',
	id: 'pixel',
	src: 'https://cdn.example.com/pixel.js',
};

const page = window as unknown as Record<string, unknown>;

afterEach(() => {
	Reflect.deleteProperty(page, '__inthStarted');
	Reflect.deleteProperty(page, '__inthRender');
	document.head.replaceChildren();
});

describe('startPlainScripts', () => {
	test('starts a plain script the visitor allows', () => {
		expect(startPlainScripts([pixel], granted, undefined)).toHaveLength(1);
		expect(document.head.querySelectorAll('script')).toHaveLength(1);
	});

	test('leaves an integration script to the loader', () => {
		// The loader may load it from the script registry instead.
		const integration: Script = { ...pixel, id: 'vendor', integration: 'x' };
		startPlainScripts([pixel, integration], granted, undefined);
		expect(
			[...document.querySelectorAll('script')].map((tag) => tag.src)
		).toEqual([pixel.src]);
	});

	test('leaves a script with anonymizeId to the loader', () => {
		// The loader sets its element id before appending it; a script with
		// `anonymizeId: false` may read `inth-script-<id>` as it runs.
		const named = { ...pixel, anonymizeId: false };
		expect(isPlainScript(named)).toBe(false);
		expect(startPlainScripts([named], granted, undefined)).toHaveLength(0);
		expect(document.head.querySelector('script')).toBeNull();
	});

	test('leaves a script with an empty src to the loader', () => {
		// An empty src resolves to the page's own URL; the loader rejects it.
		const empty = { ...pixel, src: '' };
		expect(isPlainScript(empty)).toBe(false);
		expect(startPlainScripts([empty], granted, undefined)).toHaveLength(0);
		expect(document.head.querySelector('script')).toBeNull();
	});

	test.each([[true], ['loaded']] as const)(
		'leaves a script kept after a revoke (persistAfterConsentRevoked: %s) to the loader',
		(persist) => {
			// The loader keeps its element connected without a page mark, so
			// only the loader can tell whether one is already there.
			const kept = { ...pixel, persistAfterConsentRevoked: persist };
			expect(isPlainScript(kept)).toBe(false);
			expect(startPlainScripts([kept], granted, undefined)).toHaveLength(0);
		}
	);

	test('leaves a script kept after dispose (persistAfterDispose) to the loader', () => {
		// Its element stays connected on dispose while the registry entry
		// goes, so only the loader can tell whether one is already there.
		const kept = { ...pixel, persistAfterDispose: true };
		expect(isPlainScript(kept)).toBe(false);
		expect(startPlainScripts([kept], granted, undefined)).toHaveLength(0);
	});

	test('leaves a resource the server start reserved alone', () => {
		// The server start runs the integration's setup for that resource; a
		// plain entry that claimed it first would skip the setup.
		const entry = { ...pixel, id: 'hook-entry', resourceKey: 'shared' };
		expect(
			startPlainScripts([entry], granted, undefined, { shared: 1 })
		).toHaveLength(0);
		expect(document.head.querySelector('script')).toBeNull();
		// Another resource still starts.
		expect(
			startPlainScripts([pixel], granted, undefined, { shared: 1 })
		).toHaveLength(1);
	});

	test('reads no reservations from the page object itself', () => {
		// The page object may be an earlier render's, after a client-side
		// navigation whose render left none: the caller passes this
		// render's reservations, read through its id check.
		page.__inthRender = { id: 'earlier', starts: { pixel: 1 } };
		expect(startPlainScripts([pixel], granted, undefined)).toHaveLength(1);
	});
});

describe('releasePlainScripts', () => {
	test('removes what it started and its entry, unless a loader adopted it', () => {
		const other = {
			...pixel,
			id: 'other',
			src: 'https://cdn.example.com/other.js',
		};
		const keys = startPlainScripts([pixel, other], granted, undefined);
		const started = page.__inthStarted as Record<
			string,
			HTMLScriptElement & { __inthAdopted?: boolean }
		>;
		const adopted = started.other;
		if (adopted) {
			adopted.__inthAdopted = true;
		}
		releasePlainScripts(keys);
		expect(started.pixel).toBeUndefined();
		expect(
			document.head.querySelector(`script[src="${pixel.src}"]`)
		).toBeNull();
		// The loader owns an adopted element.
		expect(started.other).toBe(adopted);
		expect(adopted?.isConnected).toBe(true);
	});
});

describe('claimPlainScripts', () => {
	test('keeps an element until the last owner that declares it releases it', () => {
		startPlainScripts([pixel], granted, undefined);
		const first = new Map<string, string>();
		const second = new Map<string, string>();
		claimPlainScripts([pixel], first);
		// A second owner that found it already started holds it too.
		claimPlainScripts(
			[{ ...pixel, id: 'same-resource', resourceKey: 'pixel' }],
			second
		);
		claimPlainScripts([pixel], first);
		releasePlainScripts(first.keys());
		expect(
			document.head.querySelector(`script[src="${pixel.src}"]`)
		).not.toBeNull();
		releasePlainScripts(second.keys());
		expect(
			document.head.querySelector(`script[src="${pixel.src}"]`)
		).toBeNull();
	});

	test('leaves an element to its owners, and reports its key, when a new owner declares it otherwise', () => {
		startPlainScripts([pixel], granted, undefined);
		const first = new Map<string, string>();
		const second = new Map<string, string>();
		expect(claimPlainScripts([pixel], first)).toEqual([]);
		expect(
			claimPlainScripts(
				[{ ...pixel, src: 'https://cdn.example.com/other.js' }],
				second
			)
		).toEqual(['pixel']);
		expect(
			claimPlainScripts([{ ...pixel, category: 'measurement' }], second)
		).toEqual(['pixel']);
		expect(second.size).toBe(0);
		releasePlainScripts(first.keys());
		expect(
			document.head.querySelector(`script[src="${pixel.src}"]`)
		).toBeNull();
	});
});

describe('changedPlainScripts', () => {
	const twin = { ...pixel, id: 'pixel-twin', resourceKey: 'pixel' };
	const shared = { ...pixel, resourceKey: 'pixel' };

	test("compares an owner's scripts that share a resource as one declaration", () => {
		startPlainScripts([shared], granted, undefined);
		const owned = new Map<string, string>();
		claimPlainScripts([shared, twin], owned);
		// Unchanged: nothing to release.
		expect(changedPlainScripts([shared, twin], owned)).toEqual([]);
		expect(changedPlainScripts([twin, shared], owned)).toEqual([]);
		// One of them changes: the key once.
		expect(
			changedPlainScripts(
				[shared, { ...twin, src: 'https://cdn.example.com/other.js' }],
				owned
			)
		).toEqual(['pixel']);
	});

	test('counts one owner per key, however many of its scripts share it', () => {
		startPlainScripts([shared], granted, undefined);
		const owned = new Map<string, string>();
		const other = new Map<string, string>();
		claimPlainScripts([shared, twin], owned);
		claimPlainScripts([shared], other);
		releasePlainScripts(owned.keys());
		// The other owner still holds it.
		expect(
			document.head.querySelector(`script[src="${pixel.src}"]`)
		).not.toBeNull();
		releasePlainScripts(other.keys());
		expect(
			document.head.querySelector(`script[src="${pixel.src}"]`)
		).toBeNull();
	});
});

describe('obsoletePlainScripts', () => {
	test('counts a replaced callbackOnly predicate as a change, and a kept one as none', () => {
		// The loader remounts a script given a new predicate.
		const predicate = () => false;
		const declared = plainDeclarations([{ ...pixel, callbackOnly: predicate }]);
		expect(
			obsoletePlainScripts([{ ...pixel, callbackOnly: predicate }], declared, [
				'pixel',
			])
		).toEqual([]);
		expect(
			obsoletePlainScripts([{ ...pixel, callbackOnly: () => true }], declared, [
				'pixel',
			])
		).toEqual(['pixel']);
	});
});
