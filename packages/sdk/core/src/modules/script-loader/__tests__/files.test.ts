/**
 * @vitest-environment jsdom
 *
 * The script registry's `files` pin the scripts LogRocket's loader
 * inserts while it runs. jsdom fetches nothing, so these read what the
 * browser would fetch: each element's `src`, `integrity` and
 * `crossorigin`. The real browser test is `script-files.e2e.test.ts` in
 * `@inth/integrations`.
 */
import { afterEach, describe, expect, test } from 'vitest';

import { normalizeFileUrl, pinRegistryFiles } from '../files';
import type { FilePin, RegistryFiles } from '../files';
import { parseRegistryFiles } from '../registry';

const LOGGER = 'https://cdn.vendor.example/logger-1.min.js';
const BLOCKED = 'https://cdn.vendor.example/blocked.js';
const HASH_SRC =
	'https://acme.inth.app/scripts/vendor/logger@0123456789abcdef.js';
const HASH =
	'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';
const OTHER_HASH =
	'sha384-ZZZuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';

const files: RegistryFiles = {
	[BLOCKED]: null,
	[LOGGER]: { integrity: HASH, src: HASH_SRC },
};

const pins: FilePin[] = [];
const join = (list: RegistryFiles): FilePin => {
	const pin = pinRegistryFiles(list);
	if (!pin) {
		throw new Error('Expected a pin in a document.');
	}
	pins.push(pin);
	return pin;
};

/** What the browser reads to fetch `element`. */
const fetched = (element: HTMLScriptElement) => ({
	crossorigin: element.getAttribute('crossorigin'),
	integrity: element.getAttribute('integrity'),
	src: element.getAttribute('src'),
});

/** A loader inserting a script the way most do. */
const insert = (src: string, setup?: (element: HTMLScriptElement) => void) => {
	const element = document.createElement('script');
	element.src = src;
	setup?.(element);
	document.head.appendChild(element);
	return element;
};

/** A script the parser made, so no setter saw its `src`. */
const parsed = (src: string) =>
	document
		.createRange()
		.createContextualFragment(`<script src="${src}"></script>`)
		.firstElementChild as HTMLScriptElement;

const PINNED = { crossorigin: 'anonymous', integrity: HASH, src: HASH_SRC };

/** An empty script under a hash it does not have: it fails, unfetched. */
const REFUSED = {
	crossorigin: 'anonymous',
	integrity: expect.stringMatching(/^sha384-/u),
	src: 'data:text/javascript,',
};

const untouched = (src: string) => ({
	crossorigin: null,
	integrity: null,
	src,
});

afterEach(() => {
	for (const pin of pins.splice(0)) {
		pin.dispose();
	}
	document.head.innerHTML = '';
	document.body.innerHTML = '';
});

describe('normalizeFileUrl', () => {
	test('resolves a relative URL against the page, drops the fragment and keeps the query', () => {
		expect(
			normalizeFileUrl('/lib/logger.js?v=2#top', 'https://site.example/a/b')
		).toBe('https://site.example/lib/logger.js?v=2');
		expect(normalizeFileUrl('HTTPS://CDN.Vendor.example:443/x.js')).toBe(
			'https://cdn.vendor.example/x.js'
		);
	});

	test('reads only http(s) URLs, and no relative one without a base', () => {
		expect(normalizeFileUrl('data:text/javascript,1')).toBeNull();
		expect(normalizeFileUrl('/x.js')).toBeNull();
	});
});

describe('parseRegistryFiles', () => {
	test('keys files by their normalised URL and refuses entries it cannot check', () => {
		expect(
			parseRegistryFiles({
				[`${LOGGER}#frag`]: { integrity: HASH, keyId: 'later', src: HASH_SRC },
				[BLOCKED]: null,
				'https://cdn.vendor.example/http.js': {
					integrity: HASH,
					src: 'http://acme.inth.app/x.js',
				},
				'https://cdn.vendor.example/nohash.js': {
					integrity: 'sha1-abc',
					src: HASH_SRC,
				},
				'relative/key.js': { integrity: HASH, src: HASH_SRC },
			})
		).toEqual({
			[BLOCKED]: null,
			[LOGGER]: { integrity: HASH, src: HASH_SRC },
			'https://cdn.vendor.example/http.js': null,
			'https://cdn.vendor.example/nohash.js': null,
		});
	});

	test('refuses a URL two keys name when either refuses it', () => {
		expect(
			parseRegistryFiles({
				[`${LOGGER}#a`]: null,
				[LOGGER]: { integrity: HASH, src: HASH_SRC },
			})
		).toEqual({ [LOGGER]: null });
	});

	test('reads anything but an object as no list', () => {
		expect(parseRegistryFiles([])).toBeNull();
		expect(parseRegistryFiles(undefined)).toBeNull();
	});
});

describe('pinRegistryFiles', () => {
	test.each([
		[
			'the src property',
			(element: HTMLScriptElement) => {
				element.src = LOGGER;
			},
		],
		[
			'setAttribute',
			(element: HTMLScriptElement) => element.setAttribute('SRC', LOGGER),
		],
		[
			'setAttributeNS',
			(element: HTMLScriptElement) =>
				element.setAttributeNS(null, 'src', LOGGER),
		],
		[
			'its attribute node',
			(element: HTMLScriptElement) => {
				const attribute = document.createAttribute('src');
				attribute.value = LOGGER;
				element.setAttributeNode(attribute);
			},
		],
	])(
		'points a listed file set with %s at the registry as it is inserted',
		(_case, set) => {
			join(files);
			const element = document.createElement('script');
			set(element);
			expect(element.getAttribute('src')).toBe(LOGGER);
			document.head.appendChild(element);

			expect(fetched(element)).toEqual(PINNED);
		}
	);

	test.each([
		['appendChild', (s: HTMLScriptElement) => document.head.appendChild(s)],
		['append', (s: HTMLScriptElement) => document.head.append(s)],
		[
			'insertBefore',
			(s: HTMLScriptElement) => document.head.insertBefore(s, null),
		],
		[
			'insertAdjacentElement',
			(s: HTMLScriptElement) =>
				document.head.insertAdjacentElement('beforeend', s),
		],
		[
			'after',
			(s: HTMLScriptElement) => {
				const marker = document.createTextNode('');
				document.head.append(marker);
				marker.after(s);
			},
		],
		[
			'a fragment',
			(s: HTMLScriptElement) => {
				const fragment = document.createDocumentFragment();
				fragment.append(s);
				document.head.appendChild(fragment);
			},
		],
		[
			'a detached parent',
			(s: HTMLScriptElement) => {
				const wrapper = document.createElement('div');
				wrapper.appendChild(s);
				document.body.appendChild(wrapper);
			},
		],
		[
			'Range.insertNode',
			(s: HTMLScriptElement) => {
				const range = document.createRange();
				range.selectNodeContents(document.head);
				range.insertNode(s);
			},
		],
		[
			'a connected shadow root',
			(s: HTMLScriptElement) => {
				const host = document.createElement('div');
				document.body.append(host);
				host.attachShadow({ mode: 'open' }).append(s);
			},
		],
	])(
		'points a parsed listed file at the registry as %s inserts it',
		(_case, place) => {
			const element = parsed(LOGGER);
			join(files);
			place(element);

			expect(fetched(element)).toEqual(PINNED);
		}
	);

	test('points a connected script at the registry as it gets its first src', () => {
		join(files);
		const bySetter = document.createElement('script');
		document.head.append(bySetter);
		bySetter.src = LOGGER;
		const byAttribute = document.createElement('script');
		document.head.append(byAttribute);
		byAttribute.setAttribute('src', LOGGER);

		expect(fetched(bySetter)).toEqual(PINNED);
		expect(fetched(byAttribute)).toEqual(PINNED);
	});

	test('matches a relative URL against the page and ignores the fragment, but not the query', () => {
		join({
			[normalizeFileUrl('/vendor/logger.js', document.baseURI) as string]: {
				integrity: HASH,
				src: HASH_SRC,
			},
		});

		expect(fetched(insert('/vendor/logger.js#boot'))).toEqual(PINNED);
		expect(fetched(insert('/vendor/logger.js?v=2'))).toEqual(
			untouched('/vendor/logger.js?v=2')
		);
	});

	test('leaves a URL the list does not name alone', () => {
		join(files);
		const other = 'https://cdn.vendor.example/logger-2.min.js';

		expect(fetched(insert(other))).toEqual(untouched(other));
		expect(fetched(insert(`${LOGGER}?build=2`))).toEqual(
			untouched(`${LOGGER}?build=2`)
		);
	});

	test('keeps a page-set integrity, and the vendor URL when the registry serves other bytes', () => {
		join(files);

		// jsdom reflects no `integrity` property, so these set the attribute.
		const allowed = insert(LOGGER, (element) => {
			element.setAttribute('integrity', `${OTHER_HASH} ${HASH}`);
		});
		expect(fetched(allowed)).toEqual({
			...PINNED,
			integrity: `${OTHER_HASH} ${HASH}`,
		});

		// Set after the src, as a loader's own mount does: the element is
		// decided as it is inserted, so this pin counts too.
		const other = insert(LOGGER, (element) => {
			element.setAttribute('integrity', OTHER_HASH);
		});
		expect(fetched(other)).toEqual({
			...untouched(LOGGER),
			integrity: OTHER_HASH,
		});
	});

	test('points a null entry at a file that fails unfetched, whatever the page pins', () => {
		join(files);

		expect(fetched(insert(BLOCKED))).toEqual(REFUSED);
		expect(
			fetched(
				insert(BLOCKED, (element) => {
					element.setAttribute('integrity', HASH);
				})
			)
		).toEqual(REFUSED);
	});

	test('pins a listed file whose own integrity has no hash the browser reads', () => {
		join(files);

		expect(
			fetched(
				insert(LOGGER, (element) => {
					element.setAttribute('integrity', 'not-a-hash');
				})
			)
		).toEqual(PINNED);
	});

	test('combines lists: a refusal in any wins, then the first to name a URL', () => {
		const first = join(files);
		const second = join({
			[LOGGER]: null,
			'https://cdn.vendor.example/second.js': {
				integrity: OTHER_HASH,
				src: HASH_SRC,
			},
		});
		expect(fetched(insert(LOGGER))).toEqual(REFUSED);
		expect(fetched(insert('https://cdn.vendor.example/second.js'))).toEqual({
			...PINNED,
			integrity: OTHER_HASH,
		});

		second.dispose();
		expect(fetched(insert(LOGGER))).toEqual(PINNED);
		first.dispose();
		expect(fetched(insert(LOGGER))).toEqual(untouched(LOGGER));
	});

	test('restores every patched prototype once the last loader leaves', () => {
		const srcSetter = Object.getOwnPropertyDescriptor(
			HTMLScriptElement.prototype,
			'src'
		)?.set;
		const natives = {
			append: Element.prototype.append,
			appendChild: Node.prototype.appendChild,
			insertNode: Range.prototype.insertNode,
			setAttribute: Element.prototype.setAttribute,
		};
		const first = join(files);
		const second = join(files);
		expect(Node.prototype.appendChild).not.toBe(natives.appendChild);

		first.dispose();
		expect(Node.prototype.appendChild).not.toBe(natives.appendChild);
		second.dispose();
		expect({
			append: Element.prototype.append,
			appendChild: Node.prototype.appendChild,
			insertNode: Range.prototype.insertNode,
			setAttribute: Element.prototype.setAttribute,
		}).toEqual(natives);
		expect(
			Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src')?.set
		).toBe(srcSetter);
	});

	test('puts ours back when a library wrote back a method it saved before the pin', () => {
		const saved = Node.prototype.appendChild;
		const pin = join(files);
		// The library restores what it saved, over ours.
		Node.prototype.appendChild = saved;
		pin.dispose();
		join(files);

		expect(Node.prototype.appendChild).not.toBe(saved);
		expect(fetched(insert(LOGGER))).toEqual(PINNED);
	});

	test('wraps a src setter another library put on between two pins, and keeps it', () => {
		const scriptProto = HTMLScriptElement.prototype;
		const native = Object.getOwnPropertyDescriptor(
			scriptProto,
			'src'
		) as PropertyDescriptor;
		join(files).dispose();
		const seen: unknown[] = [];
		const librarySet = function librarySet(
			this: HTMLScriptElement,
			value: unknown
		) {
			seen.push(value);
			native.set?.call(this, value);
		};
		Object.defineProperty(scriptProto, 'src', {
			...native,
			get: native.get,
			set: librarySet,
		});
		try {
			const pin = join(files);
			const element = document.createElement('script');
			document.head.append(element);
			element.src = LOGGER;
			expect(seen).toEqual([HASH_SRC]);
			expect(fetched(element)).toEqual(PINNED);

			pin.dispose();
			expect(Object.getOwnPropertyDescriptor(scriptProto, 'src')?.set).toBe(
				librarySet
			);
		} finally {
			Object.defineProperty(scriptProto, 'src', native);
		}
	});

	test('adds no layer per install when another library wraps a method on top', () => {
		const native = Node.prototype.appendChild;
		join(files).dispose();
		join(files);
		const below = Node.prototype.appendChild;
		const library = function library<T extends Node>(this: Node, node: T): T {
			return below.call(this, node) as T;
		};
		Node.prototype.appendChild = library;
		try {
			for (let cycle = 0; cycle < 3; cycle += 1) {
				pins.splice(0).forEach((pin) => {
					pin.dispose();
				});
				// Ours stays under the library's, a pass-through without a list.
				expect(fetched(insert(LOGGER))).toEqual(untouched(LOGGER));
				join(files);
				expect(Node.prototype.appendChild).toBe(library);
				expect(fetched(insert(LOGGER))).toEqual(PINNED);
			}
		} finally {
			// The library unwraps itself, as it found the method.
			Node.prototype.appendChild = below;
		}
		pins.splice(0).forEach((pin) => {
			pin.dispose();
		});
		expect(Node.prototype.appendChild).toBe(native);
	});
});
