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
import { transportMode } from '../../__tests__/fixtures/transport-mode';
import type { Script } from '../../libs/script-loader/types';
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

const mode = transportMode({
	init: () => Promise.resolve({}),
	save: () => Promise.resolve({ ok: true }),
});

/** A mode whose init answers `answer`, carrying `scriptRegistry`. */
const initMode = (answer: () => Promise<Record<string, unknown>>) =>
	transportMode({
		init: answer as never,
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
	document.head.querySelector<HTMLScriptElement>(`script#inth-script-${id}`);

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
	delete (window as { __inthDebug?: unknown }).__inthDebug;
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
	/** The backend the runtimes below ask, so the browser remembers its list. */
	const BACKEND = 'https://acme.inth.app';
	const MEMORY_KEY = 'inth-script-registry:v1:';
	/** Persistence on, as the remembered list needs, without other tabs. */
	const PERSISTED = { sync: false } as const;
	afterEach(() => {
		localStorage.clear();
		for (const cookie of document.cookie.split(';')) {
			const name = cookie.split('=')[0]?.trim();
			if (name) {
				document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
			}
		}
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

	test("loads from the vendor URL when init fails and the browser remembers no list, over a pending prefetch's list", async () => {
		const runtime = startWith({
			mode: initMode(() => Promise.reject(new TypeError('offline'))),
			prefetch: {
				initialPolicyPending: true,
				initialScriptRegistry: { sources: { vendor: null } },
			},
			projectUrl: BACKEND,
			scripts: [integrationScript()],
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC)
		);
		runtime.dispose();
	});

	describe('when init fails, the list the browser remembers', () => {
		/** An init that answers, with a policy, carrying `scriptRegistry`. */
		const answering = (scriptRegistry: unknown, projectUrl = BACKEND) =>
			startWith({
				mode: initMode(() =>
					Promise.resolve({
						policyResolution: {
							...matchedResolution(optInRule({ id: 'opt-in' })),
							version: 1,
						},
						scriptRegistry,
					})
				),
				persistence: PERSISTED,
				projectUrl,
				// An optional script too, so the visitor has a choice to make.
				scripts: [integrationScript(), otherScript],
			});
		const failing = (projectUrl = BACKEND) =>
			startWith({
				mode: initMode(() => Promise.reject(new TypeError('offline'))),
				persistence: PERSISTED,
				projectUrl,
				scripts: [integrationScript()],
			});
		/** What the browser remembers for `projectUrl`. */
		const stored = (projectUrl = BACKEND) => {
			const raw = localStorage.getItem(
				`${MEMORY_KEY}${new URL(projectUrl).href}`
			);
			return raw ? (JSON.parse(raw) as { registry: unknown }).registry : null;
		};
		/**
		 * Answer once with `scriptRegistry` to a visitor who then makes a
		 * choice, so the browser remembers it.
		 */
		const remember = async (
			scriptRegistry: Record<string, unknown> | undefined,
			projectUrl = BACKEND
		) => {
			const runtime = answering(scriptRegistry, projectUrl);
			await vi.waitFor(() =>
				expect(runtime.kernel.getSnapshot().policyPending).toBe(false)
			);
			await runtime.kernel.commands.save('all');
			await vi.waitFor(() =>
				expect(stored(projectUrl)).toEqual(scriptRegistry ?? null)
			);
			runtime.dispose();
			document.head.innerHTML = '';
		};

		test('loads a script from the source it lists', async () => {
			await remember({
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			});
			const runtime = failing();

			await vi.waitFor(() =>
				expect(fetchAttributes('vendor')).toMatchObject({
					integrity: HASH_INTEGRITY,
					src: HASH_SRC,
				})
			);
			runtime.dispose();
		});

		test('loads nothing for a script it blocked, or one whose options it refuses', async () => {
			await remember({
				sources: {
					vendor: {
						integrity: HASH_INTEGRITY,
						refuseIfSet: ['initOptions.server'],
						src: HASH_SRC,
					},
				},
			});
			const refused = startWith({
				mode: initMode(() => Promise.reject(new TypeError('offline'))),
				persistence: PERSISTED,
				projectUrl: BACKEND,
				scripts: [
					integrationScript({
						integrationOptions: { initOptions: { server: 'https://x' } },
					}),
				],
			});
			await new Promise((resolve) => {
				setTimeout(resolve, 50);
			});
			expect(srcs()).toEqual([]);
			refused.dispose();

			await remember({ sources: { vendor: null } });
			const blocked = failing();
			await new Promise((resolve) => {
				setTimeout(resolve, 50);
			});
			expect(srcs()).toEqual([]);
			blocked.dispose();
		});

		test("is one backend's alone", async () => {
			await remember(
				{ sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } } },
				'https://other.inth.app'
			);
			const runtime = failing();

			await vi.waitFor(() =>
				expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC)
			);
			runtime.dispose();
		});

		test('is forgotten when init answers without a list', async () => {
			await remember({
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			});
			await remember(undefined);
			const runtime = failing();

			await vi.waitFor(() =>
				expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC)
			);
			runtime.dispose();
		});

		test('is kept and used when init answers that the backend could not read the registry', async () => {
			const list = {
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			};
			await remember(list);
			const runtime = answering({ unavailable: true });

			await vi.waitFor(() =>
				expect(fetchAttributes('vendor')).toMatchObject({
					integrity: HASH_INTEGRITY,
					src: HASH_SRC,
				})
			);
			expect(stored()).toEqual(list);
			runtime.dispose();
		});

		test('leaves the vendor URL when the backend could not read the registry and none is remembered', async () => {
			const runtime = answering({ unavailable: true });

			await vi.waitFor(() =>
				expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC)
			);
			expect(stored()).toBeNull();
			runtime.dispose();
		});

		test('ignores unavailable beside a list: the list applies and is remembered', async () => {
			await remember({ sources: { vendor: null } });
			const list = {
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			};
			const runtime = answering({ ...list, unavailable: true });

			await vi.waitFor(() =>
				expect(fetchAttributes('vendor').src).toBe(HASH_SRC)
			);
			await vi.waitFor(() => expect(stored()).toEqual(list));
			runtime.dispose();
		});

		test('is stored only once the visitor has made a choice', async () => {
			const list = {
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			};
			const runtime = answering(list);
			await vi.waitFor(() =>
				expect(fetchAttributes('vendor').src).toBe(HASH_SRC)
			);
			expect(stored()).toBeNull();

			await runtime.kernel.commands.save('none');
			await vi.waitFor(() => expect(stored()).toEqual(list));
			runtime.dispose();
		});

		test('is neither stored nor read with persistence: false', async () => {
			const list = {
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			};
			const unpersisted = startWith({
				mode: initMode(() =>
					Promise.resolve({
						policyResolution: {
							...matchedResolution(optInRule({ id: 'opt-in' })),
							version: 1,
						},
						scriptRegistry: list,
					})
				),
				projectUrl: BACKEND,
				scripts: [integrationScript(), otherScript],
			});
			await vi.waitFor(() =>
				expect(fetchAttributes('vendor').src).toBe(HASH_SRC)
			);
			await unpersisted.kernel.commands.save('all');
			expect(localStorage.length).toBe(0);
			unpersisted.dispose();
			document.head.innerHTML = '';

			await remember(list);
			const failingUnpersisted = startWith({
				mode: initMode(() => Promise.reject(new TypeError('offline'))),
				projectUrl: BACKEND,
				scripts: [integrationScript()],
			});
			await vi.waitFor(() =>
				expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC)
			);
			failingUnpersisted.dispose();
		});

		test('is kept and used when unavailable comes beside empty maps', async () => {
			const list = {
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			};
			await remember(list);
			const runtime = answering({ files: {}, sources: {}, unavailable: true });

			await vi.waitFor(() =>
				expect(fetchAttributes('vendor').src).toBe(HASH_SRC)
			);
			expect(stored()).toEqual(list);
			runtime.dispose();
		});

		test('is no list when storage throws, and nothing else breaks', async () => {
			await remember({
				sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
			});
			vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
				throw new DOMException('blocked', 'SecurityError');
			});
			const runtime = failing();

			await vi.waitFor(() =>
				expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC)
			);
			runtime.dispose();
			vi.restoreAllMocks();
		});
	});

	test('loads by the list a manifest carries', async () => {
		const runtime = startWith({
			mode: browserManifest({
				projectUrl: '',
				snapshot: {
					branding: 'inth',
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

	test("loads by the list a hosted backend's init carries", async () => {
		const manifest: ConsentManifest = {
			branding: 'inth',
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
							headers: { 'x-inth-policy-contract': '1' },
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
		// One request, to init: the list costs nothing extra.
		expect(urls.map((url) => new URL(url).pathname)).toEqual([
			'/v1/consent/init',
		]);
		runtime.dispose();
	});

	test("settles on the first failed init, so a retry's list does not move a loaded script, but is remembered", async () => {
		let calls = 0;
		const runtime = startWith({
			mode: initMode(() => {
				calls += 1;
				return calls === 1
					? Promise.reject(new TypeError('offline'))
					: Promise.resolve({ scriptRegistry: { sources: { vendor: null } } });
			}),
			persistence: PERSISTED,
			projectUrl: BACKEND,
			scripts: [integrationScript(), otherScript],
		});
		await runtime.kernel.commands.save('all');

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
		expect(srcs().filter((src) => src !== otherScript.src)).toEqual([
			VENDOR_SRC,
		]);
		await vi.waitFor(() =>
			expect(
				JSON.parse(localStorage.getItem(`${MEMORY_KEY}${BACKEND}/`) ?? 'null')
					?.registry
			).toEqual({ sources: { vendor: null } })
		);
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

	test.each(['listed with null', 'pending'] as const)(
		'tells a held script that observes consent of a withdrawal, while %s',
		async (state) => {
			const onConsentChange = vi.fn();
			const onBeforeLoad = vi.fn();
			const runtime = startWith({
				mode: initMode(() =>
					state === 'pending'
						? Promise.withResolvers<never>().promise
						: Promise.resolve({
								policyResolution: {
									...matchedResolution(optInRule({ id: 'opt-in' })),
									version: 1,
								},
								scriptRegistry: { sources: { vendor: null } },
							})
				),
				reloadOnConsentRevoked: false,
				// An SDK already running on the page, which this registration
				// controls through its callbacks.
				scripts: [
					integrationScript({
						category: 'measurement',
						observeConsentBeforeLoad: true,
						onBeforeLoad,
						onConsentChange,
					}),
				],
			});
			await vi.waitFor(() =>
				expect(runtime.kernel.getSnapshot().policyPending).toBe(
					state === 'pending'
				)
			);

			await runtime.kernel.commands.save({ measurement: true });
			onConsentChange.mockClear();
			await runtime.kernel.commands.save({ measurement: false });

			await vi.waitFor(() =>
				expect(onConsentChange).toHaveBeenCalledWith(
					expect.objectContaining({ hasConsent: false, id: 'vendor' })
				)
			);
			expect(onConsentChange).not.toHaveBeenCalledWith(
				expect.objectContaining({ hasConsent: true })
			);
			expect(onBeforeLoad).not.toHaveBeenCalled();
			expect(element('vendor')).toBeNull();
			runtime.dispose();
		}
	);

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

describe('experimentalScriptRegistry files', () => {
	const VENDOR_SRC = 'https://cdn.vendor.example/vendor.js';
	const HASH_SRC = 'https://acme.inth.app/scripts/vendor@0123456789abcdef.js';
	const LOGGER_SRC = 'https://cdn.vendor.example/logger-1.min.js';
	const LOGGER_HASH_SRC =
		'https://acme.inth.app/scripts/vendor-logger@0123456789abcdef.js';
	const HASH_INTEGRITY =
		'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';
	const LOGGER_INTEGRITY =
		'sha384-ZZZuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';

	const registry = {
		files: {
			[LOGGER_SRC]: { integrity: LOGGER_INTEGRITY, src: LOGGER_HASH_SRC },
		},
		sources: { vendor: { integrity: HASH_INTEGRITY, src: HASH_SRC } },
	};

	/** The logger tag, as the vendor's loader would insert it. */
	const insertLogger = () => {
		const tag = document.createElement('script');
		tag.src = LOGGER_SRC;
		document.head.appendChild(tag);
		return tag;
	};

	const pinnedLogger = {
		crossorigin: 'anonymous',
		integrity: LOGGER_INTEGRITY,
		src: LOGGER_HASH_SRC,
		type: null,
	};

	const fetched = (tag: HTMLScriptElement) => ({
		crossorigin: tag.getAttribute('crossorigin'),
		integrity: tag.getAttribute('integrity'),
		src: tag.getAttribute('src'),
		type: tag.getAttribute('type'),
	});

	/**
	 * A registry integration whose setup stands in for its loader: jsdom
	 * runs no fetched script, so the setup inserts the logger, as the loader
	 * would once it runs.
	 */
	const loaderScript = (loaded: HTMLScriptElement[]): Script => ({
		anonymizeId: false,
		category: 'necessary',
		id: 'vendor',
		integration: 'vendor',
		onBeforeLoad: () => {
			loaded.push(insertLogger());
		},
		src: VENDOR_SRC,
	});

	const integration = (): Script => ({
		anonymizeId: false,
		category: 'necessary',
		id: 'vendor',
		integration: 'vendor',
		src: VENDOR_SRC,
	});

	const nativeAppendChild = Node.prototype.appendChild;
	const runtimes: { dispose: () => void }[] = [];
	/** Start a runtime the test's cleanup disposes, even when it fails. */
	const begin = (options: Parameters<typeof createConsentRuntime>[0]) => {
		const runtime = createConsentRuntime(options);
		runtimes.push(runtime);
		runtime.start();
		return runtime;
	};

	afterEach(() => {
		for (const runtime of runtimes.splice(0)) {
			runtime.dispose();
		}
		expect(Node.prototype.appendChild).toBe(nativeAppendChild);
	});

	test("pins a file the integration's loader inserts, by the list init carries", async () => {
		const loaded: HTMLScriptElement[] = [];
		begin({
			experimentalScriptRegistry: true,
			mode: initMode(() => Promise.resolve({ scriptRegistry: registry })),
			persistence: false,
			scripts: [loaderScript(loaded)],
		});

		await vi.waitFor(() => expect(loaded).toHaveLength(1));
		expect(fetchAttributes('vendor').src).toBe(HASH_SRC);
		expect(fetched(loaded[0] as HTMLScriptElement)).toEqual(pinnedLogger);
	});

	test('holds nothing and patches nothing while init is pending, then pins once the list arrives', async () => {
		let answer: (response: Record<string, unknown>) => void = () => undefined;
		begin({
			experimentalScriptRegistry: true,
			mode: initMode(
				() =>
					new Promise((resolve) => {
						answer = resolve;
					})
			),
			persistence: false,
			scripts: [
				integration(),
				{
					anonymizeId: false,
					category: 'necessary',
					id: 'widget',
					src: 'https://cdn.other.example/widget.js',
				},
			],
		});
		expect(Node.prototype.appendChild).toBe(nativeAppendChild);
		expect(fetched(element('widget') as HTMLScriptElement)).toEqual({
			crossorigin: null,
			integrity: null,
			src: 'https://cdn.other.example/widget.js',
			type: null,
		});
		// Inserted before the list is here, it goes as it came.
		expect(fetched(insertLogger()).src).toBe(LOGGER_SRC);

		answer({ scriptRegistry: registry });
		await vi.waitFor(() =>
			expect(Node.prototype.appendChild).not.toBe(nativeAppendChild)
		);
		expect(fetched(insertLogger())).toEqual(pinnedLogger);
	});

	// A control, as are the next two: they pass without the pin too, and
	// guard that it stays off unless a list names files.
	test('patches nothing when init fails', async () => {
		let fail: (error: Error) => void = () => undefined;
		begin({
			experimentalScriptRegistry: true,
			mode: initMode(
				() =>
					new Promise((_resolve, reject) => {
						fail = reject;
					})
			),
			persistence: false,
			scripts: [integration()],
		});

		fail(new Error('offline'));
		await vi.waitFor(() =>
			expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC)
		);
		expect(Node.prototype.appendChild).toBe(nativeAppendChild);
	});

	test("routes a script the SDK itself creates, and keeps the loader's pin", () => {
		begin({
			enabled: false,
			experimentalScriptRegistry: true,
			mode,
			persistence: false,
			prefetch: {
				initialPolicyPending: false,
				initialScriptRegistry: registry,
			},
			scripts: [
				{
					anonymizeId: false,
					category: 'necessary',
					id: 'logger',
					src: LOGGER_SRC,
				},
				{
					anonymizeId: false,
					attributes: { integrity: HASH_INTEGRITY },
					category: 'necessary',
					id: 'pinned',
					src: `${LOGGER_SRC}#pinned`,
				},
			],
		});

		expect(fetched(element('logger') as HTMLScriptElement)).toEqual(
			pinnedLogger
		);
		// Its own pin lists other bytes, so it keeps the vendor URL.
		expect(fetched(element('pinned') as HTMLScriptElement)).toEqual({
			crossorigin: null,
			integrity: HASH_INTEGRITY,
			src: `${LOGGER_SRC}#pinned`,
			type: null,
		});
	});

	test('does not patch the DOM when the list names no files', async () => {
		begin({
			experimentalScriptRegistry: true,
			mode: initMode(() =>
				Promise.resolve({
					scriptRegistry: { sources: registry.sources },
				})
			),
			persistence: false,
			scripts: [integration()],
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor').src).toBe(HASH_SRC)
		);
		expect(Node.prototype.appendChild).toBe(nativeAppendChild);
	});

	test('leaves the DOM alone with the registry off, even when init lists files', async () => {
		begin({
			mode: initMode(() => Promise.resolve({ scriptRegistry: registry })),
			persistence: false,
			scripts: [integration()],
		});

		await vi.waitFor(() =>
			expect(fetchAttributes('vendor').src).toBe(VENDOR_SRC)
		);
		expect(Node.prototype.appendChild).toBe(nativeAppendChild);
		expect(fetched(insertLogger()).src).toBe(LOGGER_SRC);
	});

	test('restores the DOM when the runtime is disposed', () => {
		const runtime = begin({
			enabled: false,
			experimentalScriptRegistry: true,
			mode,
			persistence: false,
			prefetch: {
				initialPolicyPending: false,
				initialScriptRegistry: registry,
			},
			scripts: [integration()],
		});
		expect(Node.prototype.appendChild).not.toBe(nativeAppendChild);

		runtime.dispose();
		expect(Node.prototype.appendChild).toBe(nativeAppendChild);
	});
});

describe('experimentalScriptRegistry refuseIfSet', () => {
	const VENDOR_SRC = 'https://cdn.vendor.example/vendor.js';
	const HASH_SRC = 'https://acme.inth.app/scripts/vendor@0123456789abcdef.js';
	const HASH_INTEGRITY =
		'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';
	const PATHS = ['initOptions.sdkServer', 'initOptions.enterpriseServer'];

	/** Start with a prefetched list, so the list applies at once. */
	const startListed = (
		script: Partial<Script>,
		entry: Record<string, unknown> = {
			integrity: HASH_INTEGRITY,
			refuseIfSet: PATHS,
			src: HASH_SRC,
		}
	) => {
		const onDebug = vi.fn();
		const runtime = createConsentRuntime({
			experimentalScriptRegistry: true,
			mode,
			persistence: false,
			prefetch: {
				initialPolicyPending: false,
				initialScriptRegistry: { sources: { vendor: entry as never } },
			},
			scriptLoader: { onDebug },
			scripts: [
				{
					anonymizeId: false,
					category: 'necessary',
					id: 'vendor',
					integration: 'vendor',
					src: VENDOR_SRC,
					...script,
				},
			],
		});
		runtime.start();
		const refusal = () =>
			onDebug.mock.calls
				.map(
					([event]) =>
						event as { action: string; data?: unknown; message: string }
				)
				.find((event) => event.action === 'error');
		return { refusal, runtime };
	};

	test.each([
		['a URL', 'https://lr.example.com'],
		['any string', 'x'],
		['true', true],
		['a number', 1],
		['an object', {}],
		['an array', []],
	])(
		'loads nothing when the options set a listed path to %s',
		(_case, value) => {
			const { refusal, runtime } = startListed({
				integrationOptions: { initOptions: { enterpriseServer: value } },
			});

			expect(element('vendor')).toBeNull();
			expect(refusal()).toMatchObject({
				data: { refuseIfSet: 'initOptions.enterpriseServer' },
				message: expect.stringContaining(
					'its options set initOptions.enterpriseServer'
				),
			});
			runtime.dispose();
		}
	);

	test("refuses by a top-level path, as LogRocket's asyncScriptUrl is", () => {
		const entry = {
			integrity: HASH_INTEGRITY,
			refuseIfSet: [...PATHS, 'asyncScriptUrl'],
			src: HASH_SRC,
		};
		const moved = startListed(
			{
				integrationOptions: {
					asyncScriptUrl: 'https://lr.example.com/logger.js',
					initOptions: {},
				},
			},
			entry
		);
		expect(element('vendor')).toBeNull();
		expect(moved.refusal()).toMatchObject({
			data: { refuseIfSet: 'asyncScriptUrl' },
		});
		moved.runtime.dispose();

		// The helper publishes a blank asyncScriptUrl as undefined.
		const unset = startListed(
			{ integrationOptions: { asyncScriptUrl: undefined, initOptions: {} } },
			entry
		);
		expect(element('vendor')?.getAttribute('src')).toBe(HASH_SRC);
		unset.runtime.dispose();
	});

	// Controls, as are the next two: they pass without refuseIfSet too, and
	// guard that an unset option, one on the prototype, or the page's own
	// source does not refuse a script.
	test.each([
		['undefined', undefined],
		['null', null],
		["''", ''],
		['false', false],
		['0', 0],
	])('loads from the registry when a listed path is %s', (_case, value) => {
		const { refusal, runtime } = startListed({
			integrationOptions: {
				initOptions: { enterpriseServer: value, sdkServer: value },
			},
		});

		expect(fetchAttributes('vendor').src).toBe(HASH_SRC);
		expect(refusal()).toBeUndefined();
		runtime.dispose();
	});

	test('reads a path through own properties only, and a missing step as unset', () => {
		const inherited = Object.create({ sdkServer: 'https://lr.example.com' });
		const { runtime } = startListed({
			integrationOptions: { initOptions: inherited, other: { sdkServer: 'x' } },
		});

		expect(fetchAttributes('vendor').src).toBe(HASH_SRC);
		runtime.dispose();
	});

	test('loads nothing when the script carries no options to check', () => {
		const { refusal, runtime } = startListed({});

		expect(element('vendor')).toBeNull();
		expect(refusal()?.message).toContain('carries no integrationOptions');
		runtime.dispose();
	});

	test('loads nothing for an entry whose refuseIfSet is not a list of paths', () => {
		const { refusal, runtime } = startListed(
			{ integrationOptions: {} },
			{
				integrity: HASH_INTEGRITY,
				refuseIfSet: 'initOptions.sdkServer',
				src: HASH_SRC,
			}
		);

		expect(element('vendor')).toBeNull();
		expect(refusal()?.message).toContain('holds vendor back');
		runtime.dispose();
	});

	test("lets the page's own scriptLoader.sources entry win, as it does over the rest of the list", () => {
		const runtime = createConsentRuntime({
			experimentalScriptRegistry: true,
			mode,
			persistence: false,
			prefetch: {
				initialPolicyPending: false,
				initialScriptRegistry: {
					sources: {
						vendor: {
							integrity: HASH_INTEGRITY,
							refuseIfSet: PATHS,
							src: HASH_SRC,
						},
					},
				},
			},
			scriptLoader: {
				sources: {
					vendor: {
						integrity: HASH_INTEGRITY,
						src: 'https://site.example/vendor.js',
					},
				},
			},
			scripts: [
				{
					anonymizeId: false,
					category: 'necessary',
					id: 'vendor',
					integration: 'vendor',
					integrationOptions: {
						initOptions: { sdkServer: 'https://lr.example.com' },
					},
					src: VENDOR_SRC,
				},
			],
		});
		runtime.start();

		expect(fetchAttributes('vendor').src).toBe(
			'https://site.example/vendor.js'
		);
		runtime.dispose();
	});
});
