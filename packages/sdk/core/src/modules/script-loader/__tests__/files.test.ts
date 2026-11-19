/**
 * @vitest-environment jsdom
 *
 * The script registry's `files` pin the scripts a vendor's loader inserts
 * while it runs. jsdom fetches nothing, so these read what the browser
 * would fetch: each element's `src`, `integrity` and `type`. The real
 * browser test is `script-files.e2e.test.ts` in `@inth/integrations`.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { normalizeFileUrl, pinRegistryFiles } from '../files';
import type { FilePin, RegistryFiles } from '../files';
import { parseRegistryFiles } from '../registry';

const LOGGER = 'https://cdn.vendor.example/logger-1.min.js';
const HELD = 'https://cdn.vendor.example/held.js';
const HASH_SRC =
	'https://acme.inth.app/scripts/vendor-logger@0123456789abcdef.js';
const HASH =
	'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';
const OTHER_HASH =
	'sha384-ZZZuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';

const files: RegistryFiles = {
	[HELD]: null,
	[LOGGER]: { integrity: HASH, src: HASH_SRC },
};

const pins: FilePin[] = [];
const join = (list: RegistryFiles | null): FilePin => {
	const pin = pinRegistryFiles(list);
	if (!pin) {
		throw new Error('Expected a pin in a document.');
	}
	pins.push(pin);
	return pin;
};

/** What the browser reads to fetch and run `element`. */
const fetched = (element: HTMLScriptElement) => ({
	crossorigin: element.getAttribute('crossorigin'),
	integrity: element.getAttribute('integrity'),
	src: element.getAttribute('src'),
	type: element.getAttribute('type'),
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

const PINNED = {
	crossorigin: 'anonymous',
	integrity: HASH,
	src: HASH_SRC,
	type: null,
};

const untouched = (src: string) => ({
	crossorigin: null,
	integrity: null,
	src,
	type: null,
});

const tick = (ms = 10) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
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
				[HELD]: null,
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
			[HELD]: null,
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
			'setAttributeNode',
			(element: HTMLScriptElement) => {
				const attribute = document.createAttribute('src');
				attribute.value = LOGGER;
				element.setAttributeNode(attribute);
			},
		],
	])('points a listed file set with %s at the registry', (_case, set) => {
		join(files);
		const element = document.createElement('script');
		set(element);
		document.head.appendChild(element);

		expect(fetched(element)).toEqual(PINNED);
	});

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
	])(
		'points a parsed listed file at the registry as %s inserts it',
		(_case, place) => {
			const element = parsed(LOGGER);
			join(files);
			place(element);

			expect(fetched(element)).toEqual(PINNED);
		}
	);

	test('points a listed file at the registry as a connected shadow root takes it', () => {
		join(files);
		const host = document.createElement('div');
		document.body.append(host);
		const element = parsed(LOGGER);
		host.attachShadow({ mode: 'open' }).append(element);

		expect(fetched(element)).toEqual(PINNED);
	});

	test('routes a pinned element again when the page changes its src behind the setters', () => {
		/** Change `src` through its attribute node, which no setter sees. */
		const setBehind = (script: HTMLScriptElement, url: string) => {
			const attribute = script.getAttributeNode('src');
			if (!attribute) {
				throw new Error('Expected a src attribute.');
			}
			attribute.value = url;
		};

		join(files);
		const element = document.createElement('script');
		element.src = 'https://cdn.vendor.example/other.js';
		setBehind(element, LOGGER);
		document.head.appendChild(element);
		expect(fetched(element)).toEqual(PINNED);

		const repointed = document.createElement('script');
		repointed.src = LOGGER;
		setBehind(repointed, HELD);
		document.head.appendChild(repointed);
		expect(fetched(repointed)).toEqual({
			...untouched(HELD),
			type: 'inth/held',
		});
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
		// A pin that allows the registry's bytes moves, and stays on it.
		const allowed = insert(LOGGER, (element) => {
			element.setAttribute('integrity', `${OTHER_HASH} ${HASH}`);
		});
		expect(fetched(allowed)).toEqual({
			...PINNED,
			integrity: `${OTHER_HASH} ${HASH}`,
		});

		const before = document.createElement('script');
		before.setAttribute('integrity', OTHER_HASH);
		before.src = LOGGER;
		document.head.appendChild(before);
		expect(fetched(before)).toEqual({
			...untouched(LOGGER),
			integrity: OTHER_HASH,
		});

		// Set after the src, as the loader's own mount does.
		const after = insert(LOGGER, (element) => {
			element.setAttribute('integrity', OTHER_HASH);
		});
		expect(fetched(after)).toEqual({
			...untouched(LOGGER),
			integrity: OTHER_HASH,
		});
	});

	test('routes scripts in shadow roots when their host joins the page', () => {
		join(files);
		const open = document.createElement('div');
		open.attachShadow({ mode: 'open' }).append(parsed(LOGGER));
		const closed = document.createElement('div');
		const closedRoot = closed.attachShadow({ mode: 'closed' });
		closedRoot.append(parsed(HELD));
		const wrapper = document.createElement('section');
		wrapper.append(closed);
		document.body.append(open, wrapper);

		expect(
			fetched(open.shadowRoot?.querySelector('script') as HTMLScriptElement)
		).toEqual(PINNED);
		expect(
			(closedRoot.querySelector('script') as HTMLScriptElement).getAttribute(
				'type'
			)
		).toBe('inth/held');
	});

	test('decides a detached element again at insertion, by the lists then', () => {
		join(files);
		const refusedLater = document.createElement('script');
		refusedLater.src = LOGGER;
		const heldLater = document.createElement('script');
		heldLater.src = LOGGER;

		const refusing = join({ [LOGGER]: null });
		document.head.append(refusedLater);
		expect(fetched(refusedLater)).toEqual({
			...untouched(LOGGER),
			type: 'inth/held',
		});
		refusing.dispose();

		const waiting = join(null);
		document.head.append(heldLater);
		expect(fetched(heldLater)).toEqual({
			...untouched(LOGGER),
			type: 'inth/held',
		});
		waiting.list(files);
		expect(fetched(heldLater)).toEqual(PINNED);
	});

	test('takes back what it set when the page points the element elsewhere', () => {
		join(files);
		const other = 'https://cdn.vendor.example/other.js';
		const element = document.createElement('script');
		element.src = LOGGER;
		element.src = other;
		document.head.appendChild(element);

		expect(fetched(element)).toEqual(untouched(other));
	});

	test('keeps a crossorigin the page set after the pin when it points the element elsewhere', () => {
		join(files);
		const other = 'https://cdn.vendor.example/other.js';
		const element = document.createElement('script');
		element.src = LOGGER;
		element.setAttribute('crossorigin', 'use-credentials');
		element.src = other;
		document.head.appendChild(element);

		expect(fetched(element)).toEqual({
			...untouched(other),
			crossorigin: 'use-credentials',
		});
	});

	describe('a null entry', () => {
		test('loads nothing and fires error, so the loader sees a failed load', async () => {
			join(files);
			const onerror = vi.fn();
			const listener = vi.fn();
			const element = insert(HELD, (script) => {
				script.onerror = onerror;
				script.addEventListener('error', listener);
			});

			// The browser does not run a script of a type it does not know.
			expect(fetched(element)).toEqual({
				...untouched(HELD),
				type: 'inth/held',
			});
			await vi.waitFor(() => expect(onerror).toHaveBeenCalledOnce());
			expect(listener).toHaveBeenCalledOnce();
		});

		test('stays inert when the loader sets type after src, and fails once when moved', async () => {
			join(files);
			const onerror = vi.fn();
			const element = insert(HELD, (script) => {
				script.type = 'text/javascript';
				script.onerror = onerror;
			});
			document.body.appendChild(element);

			expect(element.getAttribute('type')).toBe('inth/held');
			await tick();
			expect(onerror).toHaveBeenCalledOnce();
		});

		test('fires no error for an element never inserted', async () => {
			join(files);
			const onerror = vi.fn();
			const element = document.createElement('script');
			element.onerror = onerror;
			element.src = HELD;

			await tick();
			expect(onerror).not.toHaveBeenCalled();
		});

		test('lets an element not inserted yet move to a URL the list does not name', async () => {
			join(files);
			const onerror = vi.fn();
			const fallback = 'https://cdn.other.example/fallback.js';
			const element = insert(HELD, (script) => {
				script.type = 'module';
				script.onerror = onerror;
				script.src = fallback;
			});

			expect(fetched(element)).toEqual({
				...untouched(fallback),
				type: 'module',
			});
			await tick();
			expect(onerror).not.toHaveBeenCalled();
		});

		test('stays inert when the page resets its type, then moves it or sets its src', () => {
			join(files);
			const moved = insert(HELD);
			moved.type = 'text/javascript';
			document.body.append(moved);
			expect(moved.getAttribute('type')).toBe('inth/held');

			const repointed = insert(HELD);
			repointed.removeAttribute('type');
			repointed.src = 'https://cdn.other.example/fallback.js';
			expect(repointed.getAttribute('type')).toBe('inth/held');
		});

		test('keeps its inert type through every way the page sets one', () => {
			join(files);
			const element = insert(HELD);
			element.removeAttribute('type');
			element.type = 'text/javascript';
			element.setAttributeNS(null, 'type', 'module');
			element.toggleAttribute('type');
			element.setAttribute('TYPE', 'module');
			// Text would make the browser check a script that has not started.
			element.text = '1';
			expect(element.getAttribute('type')).toBe('inth/held');
		});

		test('gives a held script the last type the page set while it was held', () => {
			const pin = join(null);
			const element = insert(LOGGER);
			element.type = 'text/javascript';
			element.removeAttribute('type');
			element.setAttribute('type', 'module');
			expect(element.getAttribute('type')).toBe('inth/held');

			pin.list(files);
			expect(fetched(element)).toEqual({ ...PINNED, type: 'module' });
		});

		test('lets an element go as an inline script when the page takes the refused URL off before inserting it', async () => {
			join(files);
			const onerror = vi.fn();
			const element = document.createElement('script');
			element.onerror = onerror;
			element.src = HELD;
			element.removeAttribute('src');
			element.text = 'void 0';
			document.head.append(element);

			expect(element.hasAttribute('type')).toBe(false);
			await tick();
			expect(onerror).not.toHaveBeenCalled();
		});

		test('fails nothing when the insertion throws, and decides the element again next time', async () => {
			join(files);
			const onerror = vi.fn();
			const element = document.createElement('script');
			element.onerror = onerror;
			element.src = HELD;
			const stranger = document.createElement('div');
			expect(() => document.head.replaceChild(element, stranger)).toThrow();

			const fallback = 'https://cdn.other.example/fallback.js';
			element.src = fallback;
			document.head.append(element);
			expect(fetched(element)).toEqual(untouched(fallback));
			await tick();
			expect(onerror).not.toHaveBeenCalled();
		});

		test('keeps an inserted element refused when its src changes', async () => {
			join(files);
			const onerror = vi.fn();
			const element = insert(HELD, (script) => {
				script.onerror = onerror;
			});
			element.src = 'https://cdn.other.example/fallback.js';

			expect(element.getAttribute('type')).toBe('inth/held');
			await tick();
			expect(onerror).toHaveBeenCalledOnce();
		});
	});

	describe('while the list is pending', () => {
		test('holds a cross-origin script, then points it at the registry and inserts it again', async () => {
			const pin = join(null);
			const element = insert(LOGGER, (script) => {
				script.type = 'module';
			});
			expect(element.getAttribute('type')).toBe('inth/held');

			const added: Node[] = [];
			new MutationObserver((records) => {
				added.push(...records.flatMap((record) => [...record.addedNodes]));
			}).observe(document.head, { childList: true });
			pin.list(files);

			expect(fetched(element)).toEqual({ ...PINNED, type: 'module' });
			await vi.waitFor(() => expect(added).toContain(element));
		});

		test('keeps a held script inert when the page resets its type and moves it', () => {
			const pin = join(null);
			const element = insert(LOGGER);
			element.removeAttribute('type');
			document.body.append(element);
			expect(element.getAttribute('type')).toBe('inth/held');

			pin.list(files);
			expect(fetched(element)).toEqual(PINNED);
		});

		test('runs held scripts again in the order the page inserted them', async () => {
			const pin = join(null);
			const consumer = document.createElement('script');
			consumer.src = 'https://cdn.other.example/consumer.js';
			const dependency = document.createElement('script');
			dependency.src = 'https://cdn.other.example/dependency.js';
			document.head.append(dependency);
			document.head.append(consumer);

			const added: Node[] = [];
			new MutationObserver((records) => {
				added.push(...records.flatMap((record) => [...record.addedNodes]));
			}).observe(document.head, { childList: true });
			pin.list(files);

			await vi.waitFor(() => expect(added).toEqual([dependency, consumer]));
		});

		test('lets a held script go as it came when the list does not name it', () => {
			const pin = join(null);
			const other = 'https://cdn.other.example/widget.js';
			const element = insert(other);
			pin.list(files);

			expect(fetched(element)).toEqual(untouched(other));
		});

		test('refuses a held script the list maps to null', async () => {
			const pin = join(null);
			const onerror = vi.fn();
			const element = insert(HELD, (script) => {
				script.onerror = onerror;
			});
			pin.list(files);

			expect(element.getAttribute('type')).toBe('inth/held');
			await vi.waitFor(() => expect(onerror).toHaveBeenCalledOnce());
		});

		test('never holds a same-origin script, such as a bundler chunk', () => {
			join(null);
			const chunk = new URL('/_next/static/chunk.js', location.href).href;

			expect(fetched(insert(chunk))).toEqual(untouched(chunk));
		});

		test('releases what it held, unchanged, when the list names no files or the loader leaves', () => {
			const listed = join(null);
			const first = insert(LOGGER);
			listed.list({});
			expect(fetched(first)).toEqual(untouched(LOGGER));

			const leaving = join(null);
			const second = insert(LOGGER);
			leaving.dispose();
			expect(fetched(second)).toEqual(untouched(LOGGER));
		});

		test('keeps holding while another loader still waits for its list', () => {
			const waiting = join(null);
			const listed = join(null);
			const element = insert('https://cdn.other.example/widget.js');
			listed.list(files);
			expect(element.getAttribute('type')).toBe('inth/held');

			waiting.list({});
			expect(element.hasAttribute('type')).toBe(false);
		});

		test('holds a file one list names while another list is pending, and the later refusal wins', async () => {
			join(files);
			const waiting = join(null);
			const onerror = vi.fn();
			const element = insert(LOGGER, (script) => {
				script.onerror = onerror;
			});
			expect(fetched(element)).toEqual({
				...untouched(LOGGER),
				type: 'inth/held',
			});

			waiting.list({ [LOGGER]: null });
			expect(element.getAttribute('type')).toBe('inth/held');
			await vi.waitFor(() => expect(onerror).toHaveBeenCalledOnce());
		});

		test('refuses at once a file a resolved list maps to null, while another is pending', () => {
			join(files);
			join(null);

			expect(insert(HELD).getAttribute('type')).toBe('inth/held');
		});
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
		expect(fetched(insert(LOGGER))).toEqual(untouched(LOGGER));
	});

	test('passes through when a wrapper on top keeps it in the chain after it left', () => {
		const native = Node.prototype.appendChild;
		const pin = join(files);
		const ours = Node.prototype.appendChild;
		const theirs = function theirs<T extends Node>(this: Node, node: T) {
			return ours.call(this, node) as T;
		};
		Node.prototype.appendChild = theirs;
		try {
			pin.dispose();
			expect(Node.prototype.appendChild).toBe(theirs);

			const element = parsed(LOGGER);
			document.head.appendChild(element);
			expect(fetched(element)).toEqual(untouched(LOGGER));
		} finally {
			Node.prototype.appendChild = native;
		}
	});
});
