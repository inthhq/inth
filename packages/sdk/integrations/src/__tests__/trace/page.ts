/**
 * The page side of a trace run: what records DOM changes, cookies and
 * `window` globals, the fakes that make a run repeat exactly, and the stub
 * builders specs use for vendor code.
 */
import { vi } from 'vite-plus/test';

import type { TraceEvent, TraceStubs, TraceWindow } from './harness';
import { describeElement, labelStub, toJsonSafe } from './serialize';
import type { JsonValue } from './serialize';

const START_TIME = Date.UTC(2026, 0, 1);

// Page globals the SDK core keeps for itself, the same for any helper.
const SDK_GLOBALS = new Set([
	'__inthEarlyTaps',
	'__inthEndedRenders',
	'__inthInitialDataPromises',
	'__inthLoaderRan',
	'__inthRender',
	'__inthScriptDebugListeners',
	'__inthStarted',
]);

const parentName = (node: Node | null): string => {
	if (node === document.head) {
		return 'head';
	}
	if (node === document.body) {
		return 'body';
	}
	return node instanceof Element ? describeElement(node) : String(node);
};

const insertEvent = (element: Element, parent: Node | null): TraceEvent => {
	const attrs: Record<string, string> = {};
	for (const name of element.getAttributeNames().sort()) {
		attrs[name] = element.getAttribute(name) ?? '';
	}
	// oxlint-disable-next-line sort-keys -- A fixture line reads tag, parent, attributes.
	const event: TraceEvent = {
		insert: element.localName,
		in: parentName(parent),
		attrs,
	};
	if (element instanceof HTMLScriptElement) {
		event.async = element.async;
	}
	const text = element.textContent ?? '';
	if (text !== '') {
		event.text = text;
	}
	return event;
};

export interface TraceRecorder {
	readonly events: TraceEvent[];
	/** Records `event` after the DOM changes that came before it. */
	push: (event: TraceEvent) => void;
	/** Takes DOM changes not yet recorded. */
	flush: () => void;
	/** Stops recording; later changes and calls are not part of the trace. */
	stop: () => void;
	/** Script elements with a `src` that have not loaded or failed. */
	pending: () => HTMLScriptElement[];
	/** Marks a script element as loaded or failed. */
	settled: (element: HTMLScriptElement) => void;
}

export const createRecorder = function createRecorder(): TraceRecorder {
	const events: TraceEvent[] = [];
	const scripts = new Map<HTMLScriptElement, boolean>();
	let recording = true;
	const track = (node: Node) => {
		if (
			node instanceof HTMLScriptElement &&
			node.getAttribute('src') &&
			!scripts.has(node)
		) {
			scripts.set(node, false);
		}
	};
	const recordAttribute = (record: MutationRecord) => {
		const target = record.target as Element;
		const name = record.attributeName ?? '';
		// A helper can insert its element first and set `src` later.
		if (name === 'src') {
			track(target);
		}
		events.push({
			attr: name,
			on: describeElement(target),
			value: target.getAttribute(name),
		});
	};
	const recordChildren = (record: MutationRecord) => {
		for (const node of record.addedNodes) {
			if (node instanceof Element) {
				events.push(insertEvent(node, record.target));
				track(node);
			} else if (
				node instanceof Text &&
				record.target instanceof HTMLScriptElement
			) {
				events.push({ on: describeElement(record.target), text: node.data });
			}
		}
		for (const node of record.removedNodes) {
			if (node instanceof Element) {
				events.push({ remove: describeElement(node) });
			}
		}
	};
	const record = (records: MutationRecord[]) => {
		if (!recording) {
			return;
		}
		for (const item of records) {
			if (item.type === 'attributes') {
				recordAttribute(item);
			} else {
				recordChildren(item);
			}
		}
	};
	// Every recorded event first takes the pending DOM records, so DOM changes
	// keep their place among calls. Records left at a microtask boundary go
	// to the callback before anything else is recorded.
	const observer = new MutationObserver(record);
	observer.observe(document, {
		attributes: true,
		childList: true,
		subtree: true,
	});
	const flush = () => {
		record(observer.takeRecords());
	};
	return {
		events,
		flush,
		pending: () =>
			[...scripts].filter(([, done]) => !done).map(([element]) => element),
		push(event) {
			if (recording) {
				flush();
				events.push(event);
			}
		},
		settled(element) {
			scripts.set(element, true);
		},
		stop() {
			recording = false;
			observer.disconnect();
		},
	};
};

const jsdomWindow = (): Window | undefined =>
	(globalThis as { jsdom?: { window: Window } }).jsdom?.window;

const cookieAccessor = Object.getOwnPropertyDescriptor(
	Document.prototype,
	'cookie'
);

const clearCookies = () => {
	for (const pair of document.cookie.split(';')) {
		const name = pair.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; Max-Age=0; Path=/`;
		}
	}
};

const fakeRandomness = () => {
	let seed = 1;
	const random = vi.spyOn(Math, 'random').mockImplementation(() => {
		seed = (seed * 48_271) % 2_147_483_647;
		return seed / 2_147_483_647;
	});
	let count = 0;
	const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
		count += 1;
		const hex = count.toString(16).padStart(8, '0');
		return `${hex}-0000-4000-8000-000000000000` as `${string}-${string}-${string}-${string}-${string}`;
	});
	return () => {
		random.mockRestore();
		uuid.mockRestore();
	};
};

const recordConsole = (push: TraceRecorder['push']) => {
	const warn = vi.spyOn(console, 'warn').mockImplementation((...args) => {
		push({ warn: toJsonSafe(args) });
	});
	const error = vi.spyOn(console, 'error').mockImplementation((...args) => {
		push({ consoleError: toJsonSafe(args) });
	});
	return () => {
		warn.mockRestore();
		error.mockRestore();
	};
};

const recordCookies = (push: TraceRecorder['push']) => {
	if (!cookieAccessor?.get || !cookieAccessor.set) {
		return;
	}
	const { get, set } = cookieAccessor;
	Object.defineProperty(document, 'cookie', {
		configurable: true,
		get() {
			return get.call(document);
		},
		set(value: string) {
			push({ cookie: String(value) });
			set.call(document, value);
		},
	});
};

/**
 * Fixes time and randomness, so queued timestamps and IDs repeat, and
 * records console output and cookie writes. Returns what undoes it.
 */
export const installPageFakes = function installPageFakes(
	push: TraceRecorder['push']
): () => void {
	vi.useFakeTimers({
		now: START_TIME,
		toFake: [
			'Date',
			'setTimeout',
			'clearTimeout',
			'setInterval',
			'clearInterval',
			'setImmediate',
			'clearImmediate',
			'requestAnimationFrame',
			'cancelAnimationFrame',
		],
	});
	const restoreRandomness = fakeRandomness();
	const restoreConsole = recordConsole(push);
	// Node's storage globals can shadow jsdom's.
	const storage = jsdomWindow();
	if (storage) {
		vi.stubGlobal('localStorage', storage.localStorage);
		vi.stubGlobal('sessionStorage', storage.sessionStorage);
	}
	recordCookies(push);
	return () => {
		vi.clearAllTimers();
		vi.useRealTimers();
		document.head.replaceChildren();
		document.body.replaceChildren();
		Reflect.deleteProperty(document, 'cookie');
		clearCookies();
		storage?.localStorage.clear();
		storage?.sessionStorage.clear();
		vi.unstubAllGlobals();
		restoreRandomness();
		restoreConsole();
	};
};

export interface GlobalsWatcher {
	/** Records each `window` global that changed since the last call. */
	diff: () => void;
	/** Deletes globals the run added and puts back ones it replaced. */
	restore: () => void;
}

/**
 * Watches `window` from now on. Install it after the harness's own fakes,
 * so only the page's changes count.
 */
export const watchGlobals = function watchGlobals(
	win: TraceWindow,
	push: TraceRecorder['push']
): GlobalsWatcher {
	// Descriptors, so reading them runs no getters.
	const original = Object.getOwnPropertyDescriptors(win);
	/** A page global the helper replaced, such as a wrapped `fetch`. */
	const replaced = (key: string) => {
		const before = original[key];
		const now = Object.getOwnPropertyDescriptor(win, key);
		return (
			before !== undefined &&
			'value' in before &&
			now !== undefined &&
			'value' in now &&
			now.value !== before.value
		);
	};
	const read = (key: string) => {
		try {
			return win[key];
		} catch {
			return '[Throws]';
		}
	};
	const snapshot = () => {
		const values = new Map<string, string>();
		for (const key of Object.getOwnPropertyNames(win).sort()) {
			if (
				!SDK_GLOBALS.has(key) &&
				(original[key] === undefined || replaced(key))
			) {
				values.set(key, JSON.stringify(toJsonSafe(read(key))));
			}
		}
		return values;
	};
	let previous = snapshot();
	return {
		diff() {
			const next = snapshot();
			for (const [key, value] of next) {
				if (previous.get(key) !== value) {
					push({ global: key, value: JSON.parse(value) as JsonValue });
				}
			}
			for (const key of previous.keys()) {
				if (!next.has(key)) {
					push({ deleted: key });
				}
			}
			previous = next;
		},
		restore() {
			for (const key of Object.getOwnPropertyNames(win)) {
				const before = original[key];
				if (before === undefined) {
					Reflect.deleteProperty(win, key);
				} else if (replaced(key)) {
					Object.defineProperty(win, key, before);
				}
			}
		},
	};
};

type StubMembers = Record<string, unknown>;

const isPlainObject = (value: unknown): value is StubMembers =>
	value !== null &&
	typeof value === 'object' &&
	Object.getPrototypeOf(value) === Object.prototype;

export const createStubs = function createStubs(
	win: TraceWindow,
	push: TraceRecorder['push']
): TraceStubs {
	const fn: TraceStubs['fn'] = (path, impl) => {
		const stub = function stub(this: unknown, ...args: unknown[]) {
			// oxlint-disable-next-line sort-keys -- A fixture line reads path, then arguments.
			push({ call: path, args: toJsonSafe(args) });
			return impl?.apply(this, args);
		};
		labelStub(stub, path);
		return stub;
	};
	const build = (prefix: string, members: StubMembers): StubMembers =>
		Object.fromEntries(
			Object.entries(members).map(([key, value]) => {
				const path = `${prefix}.${key}`;
				if (typeof value === 'function') {
					return [
						key,
						fn(path, value as (this: unknown, ...args: unknown[]) => unknown),
					];
				}
				return [key, isPlainObject(value) ? build(path, value) : value];
			})
		);
	return {
		api: <ApiType>(path: string, members: StubMembers) =>
			build(path, members) as ApiType,
		fn,
		install(name, value) {
			win[name] = value;
		},
		json: toJsonSafe,
		note: push,
		win,
	};
};
