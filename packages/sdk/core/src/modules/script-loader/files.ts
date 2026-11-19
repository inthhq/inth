/**
 * Pins the files a loader downloads while it runs, by the script registry's
 * `files` list. Today that is LogRocket's logger.
 *
 * The registry moves an integration's own script to a hash URL the browser
 * checks, but LogRocket's loader then inserts a script of its own, straight
 * from the vendor. Once a list that names files has arrived, a script
 * element whose URL the list names is pointed at the registry's copy, with
 * its integrity, just before the browser fetches it: as the element is
 * inserted into the page, or as a connected element gets its first `src`.
 * A URL the list maps to `null` is pointed at a file that never runs, so
 * the element fires `error` and the loader's own failure path runs.
 *
 * A URL the list does not name is left alone, and nothing is held or
 * delayed: integrations wait for the list before they mount
 * (`sources.ts`), so the pin is in place before their loaders run. Code
 * the pin cannot see loads files without it; only a Content Security
 * Policy that allows the registry, and not the vendor, closes that.
 */
import { pinAllows } from './sources';

/** Where the registry serves one file. */
export interface RegistryFile {
	/** The file's URL at the registry. */
	readonly src: string;
	/** Its SRI hash. */
	readonly integrity: string;
}

/**
 * The registry's files by normalised vendor URL (see
 * {@link normalizeFileUrl}). `null` marks a file the registry holds or
 * rejects: it loads from nowhere.
 */
export type RegistryFiles = Readonly<Record<string, RegistryFile | null>>;

/** One script loader's share of the pin. */
export interface FilePin {
	/** Leave the pin; the last one out takes the patches off. */
	dispose: () => void;
}

/**
 * A URL as a key of the list: absolute, without its fragment, everything
 * else exactly as the URL parser writes it. The query string is part of
 * the key. `null` for a URL that does not parse or is not http(s).
 *
 * @param url - The URL, as a script's `src` gets it.
 * @param base - The URL to resolve a relative one against; omit it to
 * accept only absolute URLs.
 * @internal
 */
export const normalizeFileUrl = function normalizeFileUrl(
	url: unknown,
	base?: string
): string | null {
	try {
		const parsed = new URL(String(url), base);
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
			return null;
		}
		parsed.hash = '';
		return parsed.href;
	} catch {
		return null;
	}
};

/**
 * Where a refused file points: an empty script under a hash it does not
 * have. The browser asks no server for it, refuses it and fires `error`;
 * a CSP without `data:` blocks it, with the same `error`.
 */
const REFUSED: RegistryFile = {
	integrity:
		'sha384-yV4YBBnXjEy7Ehxk1n24pq1i7Qs3OB3jMcxv/WAESNNp7rzxfk7jZbXyDzmhtUXE',
	src: 'data:text/javascript,',
};

/** Each loader's list, in the order the loaders joined. */
const lists = new Set<{ readonly files: RegistryFiles }>();

/** What the lists say together, by URL; `null` while none names a file. */
let pins: Map<string, RegistryFile> | null = null;

/** A refusal in any list wins; otherwise the first list to name a URL. */
const merge = function merge(): void {
	const next = new Map<string, RegistryFile>();
	for (const { files } of lists) {
		for (const [url, file] of Object.entries(files)) {
			if (!file) {
				next.set(url, REFUSED);
			} else if (!next.has(url)) {
				next.set(url, file);
			}
		}
	}
	pins = next.size > 0 ? next : null;
};

const attribute = (element: Element, name: string): string | null =>
	Element.prototype.getAttribute.call(element, name);

/**
 * Set or remove an attribute. The pin's own `setAttribute` wrapper passes
 * these through: they are never a connected script's first `src`.
 */
const writeAttribute = function writeAttribute(
	element: Element,
	name: string,
	value: string | null
): void {
	if (value === null) {
		Element.prototype.removeAttribute.call(element, name);
	} else {
		Element.prototype.setAttribute.call(element, name, value);
	}
};

/**
 * Point `element` at the registry's copy of `value` when the lists name
 * it, and return the URL it gets instead; otherwise return `value`, so a
 * Trusted Types URL stays one. A page-set integrity stays, as a
 * `scriptLoader.sources` entry treats it: the element moves only when that
 * pin allows the registry's bytes. A refusal moves it whatever it pins.
 */
const route = function route(element: Element, value: unknown): unknown {
	const file = pins?.get(
		normalizeFileUrl(value, element.baseURI || undefined) ?? ''
	);
	if (!file) {
		return value;
	}
	const own = attribute(element, 'integrity');
	if (file === REFUSED || !own?.trim()) {
		writeAttribute(element, 'integrity', file.integrity);
	} else if (!pinAllows(own, file.integrity)) {
		return value;
	}
	writeAttribute(element, 'crossorigin', 'anonymous');
	return file.src;
};

/** What a sweep changed on one element, to put back if the insert fails. */
interface Swept {
	crossorigin: string | null;
	element: HTMLScriptElement;
	integrity: string | null;
	src: string;
}

const isTree = (node: unknown): node is Element | DocumentFragment =>
	node instanceof Element ||
	(typeof DocumentFragment !== 'undefined' && node instanceof DocumentFragment);

/** Route each script that inserting `node` into the page runs. */
const sweep = function sweep(node: unknown, swept: Swept[]): void {
	// A connected script has run, or waits on its own `src`: moving it runs
	// nothing new.
	if (!isTree(node) || node.isConnected) {
		return;
	}
	const scripts =
		node instanceof HTMLScriptElement
			? [node]
			: node.querySelectorAll('script');
	for (const element of scripts) {
		const src = attribute(element, 'src');
		if (src === null) {
			continue;
		}
		const before: Swept = {
			crossorigin: attribute(element, 'crossorigin'),
			element,
			integrity: attribute(element, 'integrity'),
			src,
		};
		const next = route(element, src);
		if (next !== src) {
			writeAttribute(element, 'src', String(next));
			swept.push(before);
		}
	}
};

/** Whether giving `element` a `src` makes the browser fetch it now. */
const fetchesNow = (element: unknown): element is HTMLScriptElement =>
	pins !== null &&
	element instanceof HTMLScriptElement &&
	element.isConnected &&
	attribute(element, 'src') === null;

/** One prototype member the pin wraps. */
interface Patch {
	/** Whether ours is in the member's chain, on top or under another. */
	inChain: boolean;
	put: () => void;
	/** Take ours off; `false` when another wrapper sits on top of it. */
	take: () => boolean;
}

/** Made on the first install and kept, so a later install reuses them. */
const patches: Patch[] = [];

type Method = (this: unknown, ...args: unknown[]) => unknown;

/** A prototype the pin patches: a DOM node's, or `Range`'s. */
type Patchable = Node | Range;

/**
 * Wrap `proto[name]`. The wrapper calls whatever the member was when ours
 * was last put on, so taking ours off and putting it back never drops a
 * wrapper another library added in between.
 */
const wrapMember = function wrapMember(
	proto: Patchable | undefined,
	name: string,
	wrap: (original: () => Method) => Method
): void {
	const target = proto as unknown as Record<string, unknown> | undefined;
	if (!target || typeof target[name] !== 'function') {
		return;
	}
	let original = target[name] as Method;
	const wrapped = wrap(() => original);
	patches.push({
		inChain: false,
		put() {
			original = target[name] as Method;
			target[name] = wrapped;
		},
		take() {
			if (target[name] !== wrapped) {
				return false;
			}
			target[name] = original;
			return true;
		},
	});
};

/** Sweep the nodes an insertion adds, when it adds them to the page. */
const insertion =
	(pick: (args: unknown[]) => unknown[]) =>
	(original: () => Method): Method =>
		function inserted(this: unknown, ...args: unknown[]) {
			const anchor =
				typeof Range !== 'undefined' && this instanceof Range
					? this.startContainer
					: this;
			// A node inserted into a detached tree is swept when that tree
			// joins the page.
			if (!(pins && anchor instanceof Node && anchor.isConnected)) {
				return original().apply(this, args);
			}
			const swept: Swept[] = [];
			for (const node of pick(args)) {
				sweep(node, swept);
			}
			try {
				return original().apply(this, args);
			} catch (error) {
				// Nothing was inserted: the elements go back as they were.
				for (const { crossorigin, element, integrity, src } of swept) {
					writeAttribute(element, 'src', src);
					writeAttribute(element, 'integrity', integrity);
					writeAttribute(element, 'crossorigin', crossorigin);
				}
				throw error;
			}
		};

const createPatches = function createPatches(): void {
	const scriptProto = HTMLScriptElement.prototype;
	const descriptor = Object.getOwnPropertyDescriptor(scriptProto, 'src');
	const ownSet = descriptor?.set;
	if (descriptor?.configurable && ownSet) {
		const set = function set(this: HTMLScriptElement, value: unknown) {
			ownSet.call(this, fetchesNow(this) ? route(this, value) : value);
		};
		patches.push({
			inChain: false,
			put() {
				Object.defineProperty(scriptProto, 'src', {
					...descriptor,
					get: descriptor.get,
					set,
				});
			},
			take() {
				if (Object.getOwnPropertyDescriptor(scriptProto, 'src')?.set !== set) {
					return false;
				}
				Object.defineProperty(scriptProto, 'src', descriptor);
				return true;
			},
		});
	}
	const elementProto = Element.prototype;
	wrapMember(
		elementProto,
		'setAttribute',
		(original) =>
			function routed(this: unknown, ...args: unknown[]) {
				if (fetchesNow(this) && String(args[0]).toLowerCase() === 'src') {
					args[1] = route(this, args[1]);
				}
				return original().apply(this, args);
			}
	);
	const first = (args: unknown[]) => args.slice(0, 1);
	const all = (args: unknown[]) => args;
	for (const name of ['appendChild', 'insertBefore', 'replaceChild']) {
		wrapMember(Node.prototype, name, insertion(first));
	}
	// A shadow root is a fragment, and a script inserted into a connected
	// one runs.
	const fragmentProto =
		typeof DocumentFragment === 'undefined'
			? undefined
			: DocumentFragment.prototype;
	for (const proto of [elementProto, fragmentProto]) {
		for (const name of ['append', 'prepend', 'replaceChildren']) {
			wrapMember(proto, name, insertion(all));
		}
	}
	const characterProto =
		typeof CharacterData === 'undefined' ? undefined : CharacterData.prototype;
	for (const proto of [elementProto, characterProto]) {
		for (const name of ['after', 'before', 'replaceWith']) {
			wrapMember(proto, name, insertion(all));
		}
	}
	wrapMember(
		elementProto,
		'insertAdjacentElement',
		insertion((args) => args.slice(1, 2))
	);
	if (typeof Range !== 'undefined') {
		for (const name of ['insertNode', 'surroundContents']) {
			wrapMember(Range.prototype, name, insertion(first));
		}
	}
};

const install = function install(): void {
	if (patches.length === 0) {
		createPatches();
	}
	for (const patch of patches) {
		if (!patch.inChain) {
			patch.put();
			patch.inChain = true;
		}
	}
};

/**
 * Take the patches off. One another library wrapped since stays in its
 * chain as a pass-through, since `pins` is `null`, and the next install
 * reuses it instead of adding another layer.
 */
const uninstall = function uninstall(): void {
	for (const patch of patches) {
		if (patch.inChain && patch.take()) {
			patch.inChain = false;
		}
	}
};

/**
 * Join the pin with one script loader's list, installing it if no loader
 * pinned yet. A no-op outside the browser.
 *
 * @param files - The registry's files.
 * @returns This loader's share, or `null` outside the browser.
 * @internal
 */
export const pinRegistryFiles = function pinRegistryFiles(
	files: RegistryFiles
): FilePin | null {
	if (
		typeof document === 'undefined' ||
		typeof HTMLScriptElement === 'undefined'
	) {
		return null;
	}
	const list = { files };
	lists.add(list);
	merge();
	if (pins) {
		install();
	}
	return {
		dispose() {
			if (lists.delete(list)) {
				merge();
				if (!pins) {
					uninstall();
				}
			}
		},
	};
};
