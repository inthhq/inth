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
import { pinAllows, sriHashes } from './sources';

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
const lists: { readonly files: RegistryFiles }[] = [];

/** Where the lists send `url`: a refusal in any wins, then the first. */
const fileFor = function fileFor(url: string | null): RegistryFile | undefined {
	let found: RegistryFile | undefined;
	for (const { files } of lists) {
		if (url !== null && Object.hasOwn(files, url)) {
			const file = files[url];
			if (!file) {
				return REFUSED;
			}
			found ??= file;
		}
	}
	return found;
};

const attribute = (element: Element, name: string): string | null =>
	Element.prototype.getAttribute.call(element, name);

/**
 * Set an attribute. The pin's own `setAttribute` wrapper passes these
 * through: they are never a connected script's first `src`.
 */
const writeAttribute = (element: Element, name: string, value: string) => {
	Element.prototype.setAttribute.call(element, name, value);
};

/**
 * Point `element` at the registry's copy of `value` when the lists name
 * it, and return the URL it gets instead; otherwise return `value`, so a
 * Trusted Types URL stays one. A page-set integrity the browser reads
 * stays, as a `scriptLoader.sources` entry treats it: the element moves
 * only when that pin allows the registry's bytes. One it cannot read
 * checks nothing, so the registry's replaces it, and a refusal moves the
 * element whatever it pins.
 */
const route = function route(element: Element, value: unknown): unknown {
	const file = fileFor(normalizeFileUrl(value, element.baseURI || undefined));
	if (!file) {
		return value;
	}
	const own = attribute(element, 'integrity') ?? '';
	if (file === REFUSED || sriHashes(own).length === 0) {
		writeAttribute(element, 'integrity', file.integrity);
	} else if (!pinAllows(own, file.integrity)) {
		return value;
	}
	writeAttribute(element, 'crossorigin', 'anonymous');
	return file.src;
};

const isTree = (node: unknown): node is Element | DocumentFragment =>
	node instanceof Element ||
	(typeof DocumentFragment !== 'undefined' && node instanceof DocumentFragment);

/** Route each script that inserting `node` into the page runs. */
const sweep = function sweep(node: unknown): void {
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
		const next = src === null ? src : route(element, src);
		if (next !== src) {
			writeAttribute(element, 'src', String(next));
		}
	}
};

/** Whether giving `element` a `src` makes the browser fetch it now. */
const fetchesNow = (element: unknown): element is HTMLScriptElement =>
	lists.length > 0 &&
	element instanceof HTMLScriptElement &&
	element.isConnected &&
	attribute(element, 'src') === null;

/**
 * One prototype member the pin wraps. Whether ours is in place is read
 * from the member when the pin goes on or comes off, never kept apart
 * from it, so a library that writes back a method it saved cannot leave
 * the pin believing it is on.
 */
interface Patch {
	/** The member as it is now: a method, or the `src` setter. */
	read: () => unknown;
	/** Wrap the member as it is now, and put ours on top. */
	put: () => void;
	/** Put back what ours wrapped. */
	restore: () => void;
	/** Ours, as last put on. */
	ours?: unknown;
	/** What ours wrapped. */
	below?: unknown;
	/** A wrapper that sat on ours when the pin came off, so still holds it. */
	above?: unknown;
}

/** Made on the first install and kept. */
const patches: Patch[] = [];

type Method = (this: unknown, ...args: unknown[]) => unknown;

/** A prototype the pin patches: a DOM node's, or `Range`'s. */
type Patchable = Node | Range;

/** Wrap `proto[name]` with what `wrap` makes of the member below it. */
const wrapMember = function wrapMember(
	proto: Patchable | undefined,
	name: string,
	wrap: (below: Method) => Method
): void {
	const target = proto as unknown as Record<string, unknown> | undefined;
	if (!target || typeof target[name] !== 'function') {
		return;
	}
	const patch: Patch = {
		put() {
			const below = target[name] as Method;
			patch.below = below;
			patch.ours = wrap(below);
			target[name] = patch.ours;
		},
		read: () => target[name],
		restore() {
			target[name] = patch.below;
		},
	};
	patches.push(patch);
};

/** Sweep the nodes an insertion adds, when it adds them to the page. */
const insertion =
	(pick: (args: unknown[]) => unknown[]) =>
	(below: Method): Method =>
		function inserted(this: unknown, ...args: unknown[]) {
			const anchor =
				typeof Range !== 'undefined' && this instanceof Range
					? this.startContainer
					: this;
			// A node inserted into a detached tree is swept when that tree
			// joins the page.
			if (lists.length > 0 && anchor instanceof Node && anchor.isConnected) {
				for (const node of pick(args)) {
					sweep(node);
				}
			}
			return below.apply(this, args);
		};

/** The `src` setter, wrapping whichever setter is there when ours goes on. */
const wrapSrcSetter = function wrapSrcSetter(): void {
	const scriptProto = HTMLScriptElement.prototype;
	const current = () => Object.getOwnPropertyDescriptor(scriptProto, 'src');
	let belowDescriptor: PropertyDescriptor | undefined;
	const patch: Patch = {
		put() {
			const below = current();
			const belowSet = below?.set;
			if (!(below?.configurable && belowSet)) {
				return;
			}
			belowDescriptor = below;
			patch.below = belowSet;
			const ours = function ours(this: HTMLScriptElement, value: unknown) {
				belowSet.call(this, fetchesNow(this) ? route(this, value) : value);
			};
			patch.ours = ours;
			Object.defineProperty(scriptProto, 'src', {
				...below,
				get: below.get,
				set: ours,
			});
		},
		read: () => current()?.set,
		restore() {
			if (belowDescriptor) {
				Object.defineProperty(scriptProto, 'src', belowDescriptor);
			}
		},
	};
	patches.push(patch);
};

const createPatches = function createPatches(): void {
	wrapSrcSetter();
	const elementProto = Element.prototype;
	wrapMember(
		elementProto,
		'setAttribute',
		(below) =>
			function routed(this: unknown, ...args: unknown[]) {
				if (fetchesNow(this) && String(args[0]).toLowerCase() === 'src') {
					args[1] = route(this, args[1]);
				}
				return below.apply(this, args);
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

/**
 * Put ours on every member that does not hold it: on top, or under the
 * wrapper that sat on it when the pin last came off.
 */
const install = function install(): void {
	if (patches.length === 0) {
		createPatches();
	}
	for (const patch of patches) {
		const now = patch.read();
		if (now !== patch.ours && now !== patch.above) {
			patch.put();
			patch.above = undefined;
		}
	}
};

/**
 * Take ours off. Under a wrapper another library put on it, ours stays in
 * that chain as a pass-through, since no list is left, and the next
 * install keeps it there instead of adding a layer.
 */
const uninstall = function uninstall(): void {
	for (const patch of patches) {
		const now = patch.read();
		if (now === patch.ours) {
			patch.restore();
		}
		// Ours came off, or someone wrote back what it wrapped: nothing holds
		// it. Anything else on top still does.
		patch.above = now === patch.ours || now === patch.below ? undefined : now;
	}
};

/**
 * Join the pin with one script loader's list, and put ours back on any
 * member that lost it. A no-op outside the browser.
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
	lists.push(list);
	install();
	return {
		dispose() {
			const index = lists.indexOf(list);
			if (index !== -1) {
				lists.splice(index, 1);
				if (lists.length === 0) {
					uninstall();
				}
			}
		},
	};
};
