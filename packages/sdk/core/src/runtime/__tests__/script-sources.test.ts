import {
	createConsentManifestPolicyPack,
	resolveInitFromManifest,
} from '@inth/sdk-schema/types';
import type { ConsentManifest } from '@inth/sdk-schema/types';
/**
 * @vitest-environment jsdom
 *
 * `scriptLoader.sources` loads a script from another URL, such as a vetted
 * copy on the site's own host, with an integrity hash the browser checks.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	optInRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type { Script } from '../../libs/script-loader/types';
import { custom } from '../../transports/custom';
import { manifest as browserManifest } from '../../transports/manifest-browser';
import { hosted } from '../../transports/mode';
import type { ProviderTransportFactory } from '../../transports/mode';
import {
	createConsentProviderRuntime,
	createConsentRuntime,
	defaultRuntimeModules,
	streamPrefetch,
} from '../index';
import type {
	ConsentProviderRuntimeOptions,
	ConsentRuntimeOptions,
	RuntimePrefetch,
} from '../types';

const REGISTRY_SRC = 'https://acme.example/scripts/vendor@0123456789abcdef.js';
const REGISTRY_INTEGRITY = 'sha384-registry';

const mode = custom({
	init: () => Promise.resolve({}),
	save: () => Promise.resolve({ ok: true }),
});

const vendorScript = (overrides: Partial<Script> = {}): Script => ({
	anonymizeId: false,
	attributes: { 'data-api-host': 'https://api.vendor.example' },
	category: 'measurement',
	id: 'vendor',
	src: 'https://cdn.vendor.example/vendor.js',
	...overrides,
});

const otherScript: Script = {
	anonymizeId: false,
	category: 'measurement',
	id: 'other',
	src: 'https://cdn.other.example/other.js',
};

const element = (id: string) =>
	document.head.querySelector<HTMLScriptElement>(`script#c15t-script-${id}`);

/** The attributes the browser reads when it fetches the script. */
const fetchAttributes = (id: string) => {
	const script = element(id);
	return {
		apiHost: script?.getAttribute('data-api-host') ?? null,
		crossorigin: script?.getAttribute('crossorigin') ?? null,
		integrity: script?.getAttribute('integrity') ?? null,
		src: script?.getAttribute('src') ?? null,
	};
};

/** A runtime with consent management off, so every script loads at once. */
const start = (
	options: Omit<ConsentRuntimeOptions, 'enabled' | 'mode'> & {
		mode?: ProviderTransportFactory;
	}
) => {
	const runtime = createConsentRuntime({
		enabled: false as const,
		mode,
		persistence: false,
		...options,
	});
	runtime.start();
	return runtime;
};

afterEach(() => {
	document.head.innerHTML = '';
	delete (window as { c15t?: unknown }).c15t;
});

describe('scriptLoader.sources', () => {
	test('loads a listed script from its source with integrity and runs its setup', () => {
		const setup = vi.fn((info: { element?: HTMLScriptElement }) => {
			// Setup runs before the element is inserted, with the new URL set.
			expect(info.element?.getAttribute('src')).toBe(REGISTRY_SRC);
		});
		const runtime = start({
			scriptLoader: {
				sources: {
					vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
			scripts: [vendorScript({ onBeforeLoad: setup }), otherScript],
		});

		expect(fetchAttributes('vendor')).toEqual({
			apiHost: 'https://api.vendor.example',
			crossorigin: 'anonymous',
			integrity: REGISTRY_INTEGRITY,
			src: REGISTRY_SRC,
		});
		expect(setup).toHaveBeenCalledOnce();
		expect(fetchAttributes('other')).toEqual({
			apiHost: null,
			crossorigin: null,
			integrity: null,
			src: otherScript.src,
		});
		runtime.dispose();
	});

	test('replaces the credentials mode when the source lists a hash the script pins', () => {
		const runtime = start({
			scriptLoader: {
				sources: {
					vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
			scripts: [
				vendorScript({
					attributes: {
						crossorigin: 'use-credentials',
						integrity: `sha384-vendor ${REGISTRY_INTEGRITY}`,
					},
				}),
			],
		});

		expect(fetchAttributes('vendor')).toMatchObject({
			crossorigin: 'anonymous',
			integrity: `sha384-vendor ${REGISTRY_INTEGRITY}`,
			src: REGISTRY_SRC,
		});
		runtime.dispose();
	});

	test.each([
		['a misspelled algorithm', 'sha348-abc'],
		['an algorithm browsers do not check', 'md5-abc'],
		['a hash after a non-breaking space', `\u00a0${REGISTRY_INTEGRITY}`],
		['only whitespace', ' '],
		['nothing in it', ''],
	])(
		'loads nothing for a source whose integrity has %s',
		(_case, integrity) => {
			const onDebug = vi.fn();
			const runtime = start({
				scriptLoader: {
					onDebug,
					sources: { vendor: { integrity, src: REGISTRY_SRC } },
				},
				scripts: [vendorScript(), otherScript],
			});

			// The browser would ignore the value and run the file unchecked.
			expect(element('vendor')).toBeNull();
			expect(element('other')).not.toBeNull();
			expect(onDebug).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'error', scriptId: 'vendor' })
			);
			runtime.dispose();
		}
	);

	test('keeps a script on its own URL when a browser cannot parse its pin', () => {
		// A browser splits on ASCII whitespace only, so it reads one invalid
		// token here, not the source's hash, and would check nothing.
		const pinned = `${REGISTRY_INTEGRITY}\u00a0junk`;
		const runtime = start({
			scriptLoader: {
				sources: {
					vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
			scripts: [vendorScript({ attributes: { integrity: pinned } })],
		});

		expect(fetchAttributes('vendor')).toMatchObject({
			integrity: pinned,
			src: 'https://cdn.vendor.example/vendor.js',
		});
		runtime.dispose();
	});

	test('keeps a pinned script on its own URL when the source lists other bytes', () => {
		const runtime = start({
			scriptLoader: {
				sources: {
					vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
			scripts: [
				vendorScript({
					attributes: { crossorigin: 'anonymous', integrity: 'sha384-pinned' },
				}),
			],
		});

		expect(fetchAttributes('vendor')).toMatchObject({
			integrity: 'sha384-pinned',
			src: 'https://cdn.vendor.example/vendor.js',
		});
		runtime.dispose();
	});

	test('reads a pin whatever the casing of its attribute name', () => {
		const runtime = start({
			scriptLoader: {
				sources: {
					vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
			scripts: [vendorScript({ attributes: { Integrity: 'sha384-pinned' } })],
		});

		expect(fetchAttributes('vendor')).toMatchObject({
			integrity: 'sha384-pinned',
			src: 'https://cdn.vendor.example/vendor.js',
		});
		runtime.dispose();
	});

	test('reads the last pin when a script spells the attribute twice', () => {
		const runtime = start({
			scriptLoader: {
				sources: {
					vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
			scripts: [
				vendorScript({
					attributes: { Integrity: '', integrity: 'sha384-pinned' },
				}),
			],
		});

		expect(fetchAttributes('vendor')).toMatchObject({
			integrity: 'sha384-pinned',
			src: 'https://cdn.vendor.example/vendor.js',
		});
		runtime.dispose();
	});

	test('keeps a pinned script on its own URL when a stronger pinned hash decides', () => {
		// Browsers check only the strongest algorithm a pin lists, so the
		// registry's sha384 hash would never be compared.
		const pin = `sha512-vendor ${REGISTRY_INTEGRITY}`;
		const runtime = start({
			scriptLoader: {
				sources: {
					vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
			scripts: [vendorScript({ attributes: { integrity: pin } })],
		});

		expect(fetchAttributes('vendor')).toMatchObject({
			integrity: pin,
			src: 'https://cdn.vendor.example/vendor.js',
		});
		runtime.dispose();
	});

	test("keeps the script's integrity on a source that lists no hash", () => {
		const runtime = start({
			scriptLoader: { sources: { vendor: { src: REGISTRY_SRC } } },
			scripts: [vendorScript({ attributes: { integrity: 'sha384-vendor' } })],
		});

		expect(fetchAttributes('vendor')).toMatchObject({
			crossorigin: 'anonymous',
			integrity: 'sha384-vendor',
			src: REGISTRY_SRC,
		});
		runtime.dispose();
	});

	test("tells a script's callbacks where its element loads from", () => {
		const setup = vi.fn();
		const runtime = start({
			scriptLoader: {
				sources: {
					vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
			scripts: [vendorScript({ onBeforeLoad: setup })],
		});

		expect(setup).toHaveBeenCalledWith(
			expect.objectContaining({
				source: {
					crossorigin: 'anonymous',
					integrity: REGISTRY_INTEGRITY,
					src: REGISTRY_SRC,
				},
			})
		);
		runtime.dispose();
	});

	test('tells a callback-only script where to load its file from', () => {
		const setup = vi.fn();
		const runtime = start({
			scriptLoader: {
				sources: {
					vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
			scripts: [vendorScript({ callbackOnly: true, onBeforeLoad: setup })],
		});

		expect(setup).toHaveBeenCalledWith(
			expect.objectContaining({
				source: {
					crossorigin: 'anonymous',
					integrity: REGISTRY_INTEGRITY,
					src: REGISTRY_SRC,
				},
			})
		);
		expect(element('vendor')).toBeNull();
		runtime.dispose();
	});

	test("sets a source's attributes the script does not set, and removes null ones", () => {
		const runtime = start({
			scriptLoader: {
				sources: {
					vendor: {
						attributes: {
							'data-api': 'https://vendor.example/api/event',
							'data-api-host': 'https://registry.example',
							'data-write-key': null,
						},
						integrity: REGISTRY_INTEGRITY,
						src: REGISTRY_SRC,
					},
				},
			},
			scripts: [
				vendorScript({
					attributes: {
						'data-api-host': 'https://api.vendor.example',
						'data-write-key': 'wk',
					},
				}),
			],
		});

		const tag = element('vendor');
		expect({
			api: tag?.getAttribute('data-api'),
			apiHost: tag?.getAttribute('data-api-host'),
			writeKey: tag?.hasAttribute('data-write-key'),
		}).toEqual({
			api: 'https://vendor.example/api/event',
			// The page's own value wins, so a site's proxy stays.
			apiHost: 'https://api.vendor.example',
			writeKey: false,
		});
		runtime.dispose();
	});

	test("takes the later value when a source spells an attribute's name twice", () => {
		const runtime = start({
			scriptLoader: {
				sources: {
					vendor: {
						attributes: { 'DATA-MODE': 'registry', 'data-mode': null },
						integrity: REGISTRY_INTEGRITY,
						src: REGISTRY_SRC,
					},
				},
			},
			scripts: [vendorScript()],
		});

		expect(element('vendor')?.hasAttribute('data-mode')).toBe(false);
		runtime.dispose();
	});

	test('applies only data-* attributes from a source', () => {
		const runtime = start({
			scriptLoader: {
				sources: {
					vendor: {
						attributes: {
							crossorigin: 'use-credentials',
							'data-ok': 'yes',
							integrity: null,
							onload: 'alert(1)',
						},
						integrity: REGISTRY_INTEGRITY,
						src: REGISTRY_SRC,
					},
				},
			},
			scripts: [vendorScript()],
		});

		const tag = element('vendor');
		expect({
			crossorigin: tag?.getAttribute('crossorigin'),
			dataOk: tag?.getAttribute('data-ok'),
			integrity: tag?.getAttribute('integrity'),
			onload: tag?.getAttribute('onload'),
		}).toEqual({
			crossorigin: 'anonymous',
			dataOk: 'yes',
			integrity: REGISTRY_INTEGRITY,
			onload: null,
		});
		runtime.dispose();
	});

	test('sets no source attributes on a script that keeps its own URL', () => {
		const runtime = start({
			scriptLoader: {
				sources: {
					vendor: {
						attributes: { 'data-api': 'https://registry.example/api' },
						integrity: REGISTRY_INTEGRITY,
						src: REGISTRY_SRC,
					},
				},
			},
			scripts: [vendorScript({ attributes: { integrity: 'sha384-pinned' } })],
		});

		expect(element('vendor')?.getAttribute('src')).toBe(
			'https://cdn.vendor.example/vendor.js'
		);
		expect(element('vendor')?.hasAttribute('data-api')).toBe(false);
		runtime.dispose();
	});

	test('loads a source entry that carries fields it does not know', () => {
		const entry = {
			integrity: REGISTRY_INTEGRITY,
			keyId: 'inth-2027-01',
			signature: 'base64-signature',
			src: REGISTRY_SRC,
		};
		const runtime = start({
			scriptLoader: { sources: { vendor: entry } },
			scripts: [vendorScript()],
		});

		expect(fetchAttributes('vendor')).toMatchObject({
			crossorigin: 'anonymous',
			integrity: REGISTRY_INTEGRITY,
			src: REGISTRY_SRC,
		});
		runtime.dispose();
	});

	test('applies to scripts a provider passes after it started', async () => {
		const options: ConsentProviderRuntimeOptions = {
			enabled: false,
			mode,
			persistence: false,
			scriptLoader: {
				sources: {
					vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
		};
		const runtime = createConsentProviderRuntime(
			options,
			defaultRuntimeModules
		);
		runtime.start();
		expect(element('vendor')).toBeNull();

		await runtime.update({ ...options, scripts: [vendorScript()] });

		await vi.waitFor(() => {
			expect(fetchAttributes('vendor')).toMatchObject({
				integrity: REGISTRY_INTEGRITY,
				src: REGISTRY_SRC,
			});
		});
		runtime.dispose();
	});
});

describe('experimentalScriptRegistry', () => {
	const VENDOR_SRC = 'https://cdn.vendor.example/vendor.js';
	const HASH_SRC = 'https://acme.inth.app/scripts/vendor@0123456789abcdef.js';
	const HASH_INTEGRITY =
		'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';

	/** A script `@inth/integrations` built, which loads without consent. */
	const integrationScript = (overrides: Partial<Script> = {}) =>
		vendorScript({
			category: 'necessary',
			integration: 'vendor',
			...overrides,
		});

	const necessaryOther: Script = { ...otherScript, category: 'necessary' };

	/** A mode whose init answers `answer`, carrying `scriptRegistry`. */
	const initMode = (answer: () => Promise<Record<string, unknown>>) =>
		custom({
			init: answer as never,
			save: () => Promise.resolve({ ok: true }),
		});

	const listed = (scriptSources: Record<string, unknown>) =>
		initMode(() =>
			Promise.resolve({ scriptRegistry: { sources: scriptSources } })
		);

	/** A runtime with consent management on and no stored consent. */
	const startWith = (
		options: Omit<ConsentRuntimeOptions, 'mode' | 'persistence'> & {
			mode: ProviderTransportFactory;
		}
	) => {
		const runtime = createConsentRuntime({
			experimentalScriptRegistry: true,
			persistence: false,
			...options,
		});
		runtime.start();
		return runtime;
	};

	/** Every script tag in the head, by its `src`. */
	const srcs = () =>
		[...document.head.querySelectorAll('script')].map((tag) =>
			tag.getAttribute('src')
		);

	test('loads an integration from the hash URL init lists, with integrity and attributes', async () => {
		const setup = vi.fn();
		const runtime = startWith({
			mode: listed({
				vendor: {
					attributes: {
						'data-api': 'https://cdn.vendor.example/api/event',
						'data-api-host': 'https://registry.example',
						'data-write-key': null,
					},
					integrity: HASH_INTEGRITY,
					src: HASH_SRC,
				},
			}),
			scripts: [
				integrationScript({
					attributes: {
						'data-api-host': 'https://api.vendor.example',
						'data-write-key': 'wk',
					},
					onBeforeLoad: setup,
				}),
				necessaryOther,
			],
		});

		await vi.waitFor(() => expect(element('vendor')).not.toBeNull());
		const tag = element('vendor');
		expect({
			api: tag?.getAttribute('data-api'),
			apiHost: tag?.getAttribute('data-api-host'),
			crossorigin: tag?.getAttribute('crossorigin'),
			integrity: tag?.getAttribute('integrity'),
			src: tag?.getAttribute('src'),
			writeKey: tag?.hasAttribute('data-write-key'),
		}).toEqual({
			api: 'https://cdn.vendor.example/api/event',
			// The page's own value wins, so a site's proxy stays.
			apiHost: 'https://api.vendor.example',
			crossorigin: 'anonymous',
			integrity: HASH_INTEGRITY,
			src: HASH_SRC,
			writeKey: false,
		});
		expect(setup).toHaveBeenCalledOnce();
		expect(fetchAttributes('other').src).toBe(otherScript.src);
		runtime.dispose();
	});

	test('holds an integration until init resolves', async () => {
		let answer: (response: Record<string, unknown>) => void = () => undefined;
		const runtime = startWith({
			mode: initMode(
				() =>
					new Promise((resolve) => {
						answer = resolve;
					})
			),
			scripts: [integrationScript()],
		});
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(element('vendor')).toBeNull();

		answer({
			scriptRegistry: {
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			},
		});
		await vi.waitFor(() =>
			expect(element('vendor')?.getAttribute('src')).toBe(HASH_SRC)
		);
		expect(srcs()).not.toContain(VENDOR_SRC);
		runtime.dispose();
	});

	test('loads from a prefetched list at once, with no wait', () => {
		const runtime = startWith({
			mode,
			prefetch: {
				initialPolicyPending: false,
				initialScriptRegistry: {
					sources: {
						vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC },
					},
				},
			},
			scripts: [integrationScript()],
		});

		expect(fetchAttributes('vendor')).toMatchObject({
			integrity: HASH_INTEGRITY,
			src: HASH_SRC,
		});
		runtime.dispose();
	});

	test('loads an optional integration from the list only once consent is granted', async () => {
		const runtime = startWith({
			mode: initMode(() =>
				Promise.resolve({
					policyResolution: {
						...matchedResolution(optInRule({ id: 'opt-in' })),
						version: 1,
					},
					scriptRegistry: {
						sources: {
							vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC },
						},
					},
				})
			),
			scripts: [integrationScript({ category: 'measurement' })],
		});
		await vi.waitFor(() =>
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(element('vendor')).toBeNull();

		await runtime.kernel.commands.save('all');

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor')).toMatchObject({
				crossorigin: 'anonymous',
				integrity: HASH_INTEGRITY,
				src: HASH_SRC,
			})
		);
		expect(srcs()).toEqual([HASH_SRC]);
		runtime.dispose();
	});

	test('loads by the list a streamed prefetch carries, without asking init', async () => {
		const init = vi.fn(() => Promise.resolve({}));
		const stream = Promise.withResolvers<RuntimePrefetch>();
		const runtime = createConsentProviderRuntime(
			{
				experimentalScriptRegistry: true,
				mode: initMode(init),
				persistence: false,
				prefetch: stream.promise,
				scripts: [integrationScript()],
			},
			{ ...defaultRuntimeModules, streamPrefetch }
		);
		runtime.start();
		expect(element('vendor')).toBeNull();

		stream.resolve({
			initialPolicyResolution: matchedResolution(optInRule({ id: 'opt-in' })),
			initialScriptRegistry: {
				sources: {
					vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC },
				},
			},
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor')).toMatchObject({
				integrity: HASH_INTEGRITY,
				src: HASH_SRC,
			})
		);
		expect(init).not.toHaveBeenCalled();
		runtime.dispose();
	});

	test('waits for init over a list a pending prefetch carries', async () => {
		let answer: (response: Record<string, unknown>) => void = () => undefined;
		const runtime = startWith({
			mode: initMode(
				() =>
					new Promise((resolve) => {
						answer = resolve;
					})
			),
			// A prefetch for other inputs, which the runtime asks init again for.
			prefetch: {
				initialPolicyPending: true,
				initialScriptRegistry: {
					sources: {
						vendor: { integrity: 'sha384-stale', src: REGISTRY_SRC },
					},
				},
			},
			scripts: [integrationScript()],
		});
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(element('vendor')).toBeNull();

		answer({
			scriptRegistry: {
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			},
		});
		await vi.waitFor(() =>
			expect(fetchAttributes('vendor')).toMatchObject({
				integrity: HASH_INTEGRITY,
				src: HASH_SRC,
			})
		);
		runtime.dispose();
	});

	test("drops a pending prefetch's list when init answers without one", async () => {
		const runtime = startWith({
			mode: initMode(() => Promise.resolve({})),
			prefetch: {
				initialPolicyPending: true,
				initialScriptRegistry: {
					sources: {
						vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC },
					},
				},
			},
			scripts: [integrationScript()],
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC)
		);
		expect(runtime.kernel.getSnapshot().scriptRegistry).toBeNull();
		runtime.dispose();
	});

	test("loads from the vendor URL when init fails, over a pending prefetch's list", async () => {
		const runtime = startWith({
			mode: initMode(() => Promise.reject(new TypeError('offline'))),
			prefetch: {
				initialPolicyPending: true,
				initialScriptRegistry: { sources: { vendor: null } },
			},
			scripts: [integrationScript()],
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC)
		);
		runtime.dispose();
	});

	test('loads by the list a manifest carries', async () => {
		const runtime = startWith({
			mode: browserManifest({
				projectUrl: '',
				snapshot: {
					branding: 'c15t',
					policyPacks: [
						createConsentManifestPolicyPack({
							...optInRule({ id: 'everywhere' }),
							match: { isDefault: true },
						}),
					],
					revision: '1',
					schemaVersion: 2,
					scriptRegistry: {
						sources: {
							vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC },
						},
					},
				},
			}),
			scripts: [integrationScript()],
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor')).toMatchObject({
				crossorigin: 'anonymous',
				integrity: HASH_INTEGRITY,
				src: HASH_SRC,
			})
		);
		runtime.dispose();
	});

	test("loads by the list a hosted backend's /init carries", async () => {
		const manifest: ConsentManifest = {
			branding: 'c15t',
			policyPacks: [
				createConsentManifestPolicyPack({
					...optInRule({ id: 'everywhere' }),
					match: { isDefault: true },
				}),
			],
			revision: '1',
			schemaVersion: 2,
			scriptRegistry: {
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			},
		};
		const urls: string[] = [];
		const runtime = startWith({
			mode: hosted({
				fetch: (input) => {
					urls.push(String(input));
					return Promise.resolve(
						Response.json(resolveInitFromManifest(manifest, {}), {
							headers: { 'x-c15t-policy-contract': '1' },
						})
					);
				},
				projectUrl: 'https://acme.inth.app',
			}),
			scripts: [integrationScript()],
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor')).toMatchObject({
				integrity: HASH_INTEGRITY,
				src: HASH_SRC,
			})
		);
		// One request, to /init: the list costs nothing extra.
		expect(urls.map((url) => new URL(url).pathname)).toEqual(['/init']);
		runtime.dispose();
	});

	test("settles on the first failed init, so a retry's list does not move a loaded script", async () => {
		let calls = 0;
		const runtime = startWith({
			mode: initMode(() => {
				calls += 1;
				return calls === 1
					? Promise.reject(new TypeError('offline'))
					: Promise.resolve({ scriptRegistry: { sources: { vendor: null } } });
			}),
			scripts: [integrationScript()],
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC)
		);
		await vi.waitFor(
			() =>
				expect(runtime.kernel.getSnapshot().scriptRegistry?.sources).toEqual({
					vendor: null,
				}),
			{ timeout: 3000 }
		);
		expect(srcs()).toEqual([VENDOR_SRC]);
		runtime.dispose();
	});

	test('loads an entry, and a list, that carry fields it does not know', async () => {
		const runtime = startWith({
			mode: initMode(() =>
				Promise.resolve({
					keyId: 'inth-2027-01',
					scriptRegistry: {
						sources: {
							vendor: {
								integrity: HASH_INTEGRITY,
								keyId: 'inth-2027-01',
								signature: 'base64-signature',
								src: HASH_SRC,
							},
						},
					},
				})
			),
			scripts: [integrationScript()],
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor')).toMatchObject({
				crossorigin: 'anonymous',
				integrity: HASH_INTEGRITY,
				src: HASH_SRC,
			})
		);
		runtime.dispose();
	});

	test.each([
		[
			'the list has no entry for the script',
			() =>
				Promise.resolve({
					scriptRegistry: {
						sources: {
							another: { integrity: HASH_INTEGRITY, src: HASH_SRC },
						},
					},
				}),
		],
		['init carries no list', () => Promise.resolve({})],

		[
			'the list is not an object',
			() => Promise.resolve({ scriptRegistry: { sources: [] } }),
		],
		['init fails', () => Promise.reject(new TypeError('offline'))],
	])('loads from the vendor URL when %s', async (_case, answer) => {
		const runtime = startWith({
			mode: initMode(answer),
			scripts: [integrationScript()],
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor')).toEqual({
				apiHost: 'https://api.vendor.example',
				crossorigin: null,
				integrity: null,
				src: VENDOR_SRC,
			})
		);
		runtime.dispose();
	});

	test.each([
		['with no integrity', { src: HASH_SRC }],
		[
			'with an integrity that is not an SRI hash',
			{ integrity: 'md5-x', src: HASH_SRC },
		],
		[
			// A browser splits on ASCII whitespace only, so it would read no
			// hash here and run the script unchecked.
			'with a hash after a non-breaking space',
			{ integrity: `\u00a0${HASH_INTEGRITY}`, src: HASH_SRC },
		],
		[
			'with a hash followed by other text',
			{ integrity: `${HASH_INTEGRITY}!`, src: HASH_SRC },
		],
		[
			'with a plain-http src',
			{
				integrity: HASH_INTEGRITY,
				src: 'http://acme.inth.app/scripts/vendor.js',
			},
		],
		[
			'with a javascript: src',
			{ integrity: HASH_INTEGRITY, src: ['javascript', 'alert(1)'].join(':') },
		],
		[
			'with an attribute that is a number',
			{
				attributes: { 'data-api': 1 },
				integrity: HASH_INTEGRITY,
				src: HASH_SRC,
			},
		],
		[
			'as something other than an object',
			'https://acme.inth.app/scripts/vendor.js',
		],
		['as null', null],
	])('loads nothing for a script the list names %s', async (_case, entry) => {
		const onDebug = vi.fn();
		const runtime = startWith({
			mode: listed({ vendor: entry }),
			scriptLoader: { onDebug },
			scripts: [integrationScript(), necessaryOther],
		});

		await vi.waitFor(() =>
			expect(onDebug).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'error', scriptId: 'vendor' })
			)
		);
		expect(element('vendor')).toBeNull();
		expect(srcs()).toEqual([otherScript.src]);
		runtime.dispose();
	});

	test('registers the category of a script it holds, while it waits and after a null entry', async () => {
		let answer: (response: Record<string, unknown>) => void = () => undefined;
		const runtime = startWith({
			mode: initMode(
				() =>
					new Promise((resolve) => {
						answer = resolve;
					})
			),
			// The only script in its category, so the banner learns of the
			// category from this script alone.
			scripts: [integrationScript({ category: 'experience' })],
		});
		const categories = () => runtime.kernel.getSnapshot().consentCategories;

		expect(element('vendor')).toBeNull();
		expect(categories()).toContain('experience');

		answer({ scriptRegistry: { sources: { vendor: null } } });
		await vi.waitFor(() =>
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
		);
		expect(element('vendor')).toBeNull();
		expect(categories()).toContain('experience');
		runtime.dispose();
	});

	test('reads null attributes on an entry as none', async () => {
		const runtime = startWith({
			mode: listed({
				vendor: { attributes: null, integrity: HASH_INTEGRITY, src: HASH_SRC },
			}),
			scripts: [integrationScript()],
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor')).toEqual({
				apiHost: 'https://api.vendor.example',
				crossorigin: 'anonymous',
				integrity: HASH_INTEGRITY,
				src: HASH_SRC,
			})
		);
		runtime.dispose();
	});

	test('checks a held script against the URL it loads from, once the list arrives', async () => {
		let answer: (response: Record<string, unknown>) => void = () => undefined;
		const validate = vi.fn();
		const runtime = startWith({
			mode: initMode(
				() =>
					new Promise((resolve) => {
						answer = resolve;
					})
			),
			scripts: [integrationScript({ validate })],
		});
		expect(validate).not.toHaveBeenCalled();

		answer({
			scriptRegistry: {
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			},
		});
		await vi.waitFor(() =>
			expect(validate).toHaveBeenCalledWith(
				expect.objectContaining({ src: HASH_SRC })
			)
		);
		expect(validate).not.toHaveBeenCalledWith(
			expect.objectContaining({ src: VENDOR_SRC })
		);
		runtime.dispose();
	});

	test("keeps its own frozen copy of the list, apart from the caller's", () => {
		const scriptSources = {
			vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC },
		};
		const runtime = startWith({
			mode,
			prefetch: {
				initialPolicyPending: false,
				initialScriptRegistry: { sources: scriptSources },
			},
			scripts: [],
		});
		scriptSources.vendor.src = 'https://evil.example/vendor.js';

		const kept = runtime.kernel.getSnapshot().scriptRegistry?.sources;
		expect(kept?.vendor?.src).toBe(HASH_SRC);
		expect(Object.isFrozen(kept?.vendor)).toBe(true);
		runtime.dispose();
	});

	test('does not run a mounted script again when the list arrives', async () => {
		let answer: (response: Record<string, unknown>) => void = () => undefined;
		const setup = vi.fn();
		const teardown = vi.fn();
		const runtime = startWith({
			mode: initMode(
				() =>
					new Promise((resolve) => {
						answer = resolve;
					})
			),
			scriptLoader: {
				sources: {
					own: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
			scripts: [
				// Mounts at once from the page's own source.
				integrationScript({
					callbackOnly: true,
					id: 'own',
					onBeforeLoad: setup,
					onDispose: teardown,
				}),
				// Waits for init.
				integrationScript(),
			],
		});
		expect(setup).toHaveBeenCalledOnce();

		answer({
			scriptRegistry: {
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			},
		});
		await vi.waitFor(() =>
			expect(element('vendor')?.getAttribute('src')).toBe(HASH_SRC)
		);
		expect(setup).toHaveBeenCalledOnce();
		expect(teardown).not.toHaveBeenCalled();
		runtime.dispose();
	});

	test("does not fall back to the vendor URL when the registry's copy fails to load", async () => {
		const onError = vi.fn();
		const runtime = startWith({
			mode: listed({ vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } }),
			scripts: [integrationScript({ onError })],
		});
		await vi.waitFor(() => expect(element('vendor')).not.toBeNull());

		// What the browser fires for an SRI mismatch, a 423 hold or a 410.
		element('vendor')?.dispatchEvent(new Event('error'));
		await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(srcs()).toEqual([HASH_SRC]);
		runtime.dispose();
	});

	test("lets a scriptLoader.sources entry win over the list's", async () => {
		const runtime = startWith({
			mode: listed({
				vendor: {
					attributes: { 'data-api': 'https://registry.example/api' },
					integrity: HASH_INTEGRITY,
					src: HASH_SRC,
				},
			}),
			scriptLoader: {
				sources: {
					vendor: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
			scripts: [integrationScript()],
		});

		// The page's own entry applies at once, without waiting for init.
		expect(fetchAttributes('vendor')).toMatchObject({
			integrity: REGISTRY_INTEGRITY,
			src: REGISTRY_SRC,
		});
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(srcs()).toEqual([REGISTRY_SRC]);
		expect(element('vendor')?.hasAttribute('data-api')).toBe(false);
		runtime.dispose();
	});

	test('keeps a script pinned with other bytes on its own URL', async () => {
		const runtime = startWith({
			mode: listed({ vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } }),
			scripts: [
				integrationScript({ attributes: { integrity: 'sha384-pinned' } }),
			],
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor')).toMatchObject({
				integrity: 'sha384-pinned',
				src: VENDOR_SRC,
			})
		);
		runtime.dispose();
	});

	test('does not wait for init in a runtime that never asks it', () => {
		const runtime = startWith({
			enabled: false,
			mode,
			// A pending policy, as a provider leaves it after an override.
			prefetch: { initialPolicyPending: true },
			scripts: [integrationScript()],
		});

		expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC);
		runtime.dispose();
	});

	test('leaves scripts alone when off, even when init lists them', () => {
		const runtime = startWith({
			experimentalScriptRegistry: false,
			mode,
			prefetch: {
				initialPolicyPending: false,
				initialScriptRegistry: {
					sources: {
						vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC },
					},
				},
			},
			scripts: [integrationScript()],
		});

		expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC);
		runtime.dispose();
	});

	test('loads from the vendor URL for scripts a provider passes after init failed', async () => {
		const init = vi.fn(() => Promise.reject(new TypeError('offline')));
		const options: ConsentProviderRuntimeOptions = {
			experimentalScriptRegistry: true,
			mode: initMode(init),
			persistence: false,
		};
		const runtime = createConsentProviderRuntime(
			options,
			defaultRuntimeModules
		);
		runtime.start();
		await vi.waitFor(() => expect(init).toHaveBeenCalled());
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		await runtime.update({ ...options, scripts: [integrationScript()] });

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC)
		);
		runtime.dispose();
	});

	test('keeps the registered scripts when a waiting script fails its check once the list arrives', async () => {
		let answer: (response: Record<string, unknown>) => void = () => undefined;
		const onDispose = vi.fn();
		const onDebug = vi.fn();
		const options: ConsentProviderRuntimeOptions = {
			experimentalScriptRegistry: true,
			mode: initMode(
				() =>
					new Promise((resolve) => {
						answer = resolve;
					})
			),
			persistence: false,
			scriptLoader: { onDebug },
			scripts: [{ ...necessaryOther, onDispose }],
		};
		const runtime = createConsentProviderRuntime(
			options,
			defaultRuntimeModules
		);
		runtime.start();
		await vi.waitFor(() => expect(element('other')).not.toBeNull());

		await runtime.update({
			...options,
			scripts: [
				integrationScript({
					validate: () => {
						throw new Error('invalid configuration');
					},
				}),
			],
		});
		answer({
			scriptRegistry: {
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			},
		});
		await vi.waitFor(() =>
			expect(onDebug).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'error',
					message: expect.stringContaining('invalid configuration'),
				})
			)
		);

		expect(onDispose).not.toHaveBeenCalled();
		expect(element('other')?.isConnected).toBe(true);
		expect(element('vendor')).toBeNull();
		runtime.dispose();
	});

	test('replaces the registered scripts once a waiting script passes its check', async () => {
		let answer: (response: Record<string, unknown>) => void = () => undefined;
		const onDispose = vi.fn();
		const validate = vi.fn();
		const options: ConsentProviderRuntimeOptions = {
			experimentalScriptRegistry: true,
			mode: initMode(
				() =>
					new Promise((resolve) => {
						answer = resolve;
					})
			),
			persistence: false,
			scripts: [{ ...necessaryOther, onDispose }],
		};
		const runtime = createConsentProviderRuntime(
			options,
			defaultRuntimeModules
		);
		runtime.start();
		await vi.waitFor(() => expect(element('other')).not.toBeNull());

		await runtime.update({
			...options,
			scripts: [integrationScript({ validate })],
		});
		expect(onDispose).not.toHaveBeenCalled();
		answer({
			scriptRegistry: {
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			},
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor').src).toBe(HASH_SRC)
		);
		expect(validate).toHaveBeenCalledWith(
			expect.objectContaining({ src: HASH_SRC })
		);
		expect(onDispose).toHaveBeenCalledOnce();
		expect(element('other')).toBeNull();
		runtime.dispose();
	});

	test('applies to scripts a provider passes after it started', async () => {
		const options: ConsentProviderRuntimeOptions = {
			experimentalScriptRegistry: true,
			mode: listed({ vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } }),
			persistence: false,
		};
		const runtime = createConsentProviderRuntime(
			options,
			defaultRuntimeModules
		);
		runtime.start();

		await runtime.update({ ...options, scripts: [integrationScript()] });

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor')).toMatchObject({
				integrity: HASH_INTEGRITY,
				src: HASH_SRC,
			})
		);
		runtime.dispose();
	});
});
