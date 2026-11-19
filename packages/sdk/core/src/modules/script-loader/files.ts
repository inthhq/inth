/**
 * Pins the files a vendor's loader downloads while it runs, such as
 * LogRocket's logger, by the script registry's `files` list.
 *
 * The registry moves an integration's own script to a hash URL the browser
 * checks, but that loader then inserts more script elements of its own,
 * straight from the vendor. While a pin is installed, every script element
 * whose URL the list names is pointed at the registry's copy with its
 * integrity before the browser fetches it:
 *
 * - `script.src = url`, `setAttribute('src')`, `setAttributeNS(null, 'src')`
 *   and `setAttributeNode` are routed as they happen.
 * - Inserting a node (`appendChild`, `insertBefore`, `append`, `before`,
 *   `replaceWith`, `insertAdjacentElement`, `Range.insertNode` and the rest)
 *   routes every script in it that is not connected yet, so a script parsed
 *   from a fragment is caught too.
 *
 * A URL the list maps to `null` never loads: the element gets a type the
 * browser does not run, and an `error` event, so the loader's own failure
 * path runs. A URL the list does not name is left alone.
 *
 * While the list is pending, a cross-origin script would leave before the
 * pin knows whether it is listed, so it is held instead: it gets a type the
 * browser does not run until the list arrives, then its own type back,
 * pointed at the registry when the list names it, and is inserted again in
 * place so the browser runs it. Same-origin scripts, such as a bundler's
 * chunks, are never held.
 *
 * Several script loaders can pin at once. Each joins the one install with
 * its own list; the prototypes are restored once the last one leaves.
 *
 * Code the pin cannot see loads files without it: `document.write`, `eval`,
 * `import()`, workers, iframes, script elements from another realm, and
 * any URL a page override hands the loader that the list does not name.
 * Only a Content Security Policy that allows the registry, and not the
 * vendor, closes those.
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
	/** The list arrived: route by `files` from now on. */
	list: (files: RegistryFiles) => void;
	/** Leave the pin; the last one out restores the prototypes. */
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

/** A type no browser runs, so a held or refused element stays inert. */
const HELD_TYPE = 'inth/held';

interface Owner {
	/** `null` while the list is pending. */
	files: RegistryFiles | null;
}

/** The DOM functions the pin calls itself, from before it patched them. */
interface Dom {
	getAttribute: Element['getAttribute'];
	insertBefore: Node['insertBefore'];
	removeAttribute: Element['removeAttribute'];
	setAttribute: Element['setAttribute'];
}

interface Install {
	dom: Dom;
	/** Elements held while a list is pending, in the order they came. */
	held: Set<HTMLScriptElement>;
	owners: Set<Owner>;
	restore: () => void;
}

/** What an element the pin pointed at the registry had before. */
interface Pinned {
	crossorigin: string | null;
	file: RegistryFile;
	/** The integrity it left on the element. */
	integrity: string;
	/** Whether that integrity is the registry's, set by the pin. */
	ownIntegrity: boolean;
	url: string;
}

let active: Install | null = null;

/** Each held or refused element's own `type`, to give back. */
const ownTypes = new WeakMap<HTMLScriptElement, string | null>();
/** Elements the list refused. They never load. */
const refused = new WeakSet<HTMLScriptElement>();
/** Refused elements whose `error` event has been sent. */
const failed = new WeakSet<HTMLScriptElement>();
const pinned = new WeakMap<HTMLScriptElement, Pinned>();

type Decision =
	| { readonly kind: 'pass' | 'hold' | 'refuse' }
	| { readonly kind: 'pin'; readonly file: RegistryFile };

const PASS: Decision = { kind: 'pass' };
const HOLD: Decision = { kind: 'hold' };
const REFUSE: Decision = { kind: 'refuse' };

const isCrossOrigin = (key: string): boolean => {
	try {
		return new URL(key).origin !== globalThis.location?.origin;
	} catch {
		return true;
	}
};

/**
 * What every owner's list says about one URL. A refusal in any list wins.
 * Otherwise a cross-origin URL waits while any list is pending, since that
 * list may refuse it or name another copy; then the first list that names
 * it pins it.
 */
const decide = function decide(install: Install, key: string | null): Decision {
	if (key === null) {
		return PASS;
	}
	let pending = false;
	let file: RegistryFile | undefined;
	for (const owner of install.owners) {
		if (owner.files === null) {
			pending = true;
		} else if (Object.hasOwn(owner.files, key)) {
			const listed = owner.files[key];
			if (!listed) {
				return REFUSE;
			}
			file ??= listed;
		}
	}
	if (pending && isCrossOrigin(key)) {
		return HOLD;
	}
	return file ? { file, kind: 'pin' } : PASS;
};

const keepType = function keepType(
	install: Install,
	element: HTMLScriptElement
): void {
	if (!ownTypes.has(element)) {
		ownTypes.set(element, install.dom.getAttribute.call(element, 'type'));
	}
	install.dom.setAttribute.call(element, 'type', HELD_TYPE);
};

/**
 * Keep a held or refused element inert as it is inserted. A loader may set
 * `type` after `src`; that value is the one it gets back.
 */
const enforceType = function enforceType(
	dom: Dom,
	element: HTMLScriptElement
): void {
	const type = dom.getAttribute.call(element, 'type');
	if (type !== HELD_TYPE) {
		ownTypes.set(element, type);
		dom.setAttribute.call(element, 'type', HELD_TYPE);
	}
};

const restoreType = function restoreType(
	dom: Dom,
	element: HTMLScriptElement
): void {
	if (!ownTypes.has(element)) {
		return;
	}
	const type = ownTypes.get(element) ?? null;
	ownTypes.delete(element);
	// The page set another type while the element was held: it keeps that.
	if (dom.getAttribute.call(element, 'type') !== HELD_TYPE) {
		return;
	}
	if (type === null) {
		dom.removeAttribute.call(element, 'type');
	} else {
		dom.setAttribute.call(element, 'type', type);
	}
};

/** Send a refused element's `error`, once, as a failed fetch would. */
const failLater = function failLater(element: HTMLScriptElement): void {
	if (failed.has(element)) {
		return;
	}
	failed.add(element);
	setTimeout(() => {
		element.dispatchEvent(new Event('error'));
	}, 0);
};

/**
 * Give back the element's own `crossorigin`, unless the page changed the
 * pin's `anonymous` since: its own later value stays.
 */
const restoreCrossorigin = function restoreCrossorigin(
	dom: Dom,
	element: HTMLScriptElement,
	record: Pinned
): void {
	if (dom.getAttribute.call(element, 'crossorigin') !== 'anonymous') {
		return;
	}
	if (record.crossorigin === null) {
		dom.removeAttribute.call(element, 'crossorigin');
	} else {
		dom.setAttribute.call(element, 'crossorigin', record.crossorigin);
	}
};

/** Put back what the pin set on an element the page points elsewhere. */
const unpin = function unpin(dom: Dom, element: HTMLScriptElement): void {
	const record = pinned.get(element);
	if (!record) {
		return;
	}
	pinned.delete(element);
	if (
		record.ownIntegrity &&
		dom.getAttribute.call(element, 'integrity') === record.integrity
	) {
		dom.removeAttribute.call(element, 'integrity');
	}
	restoreCrossorigin(dom, element, record);
};

/**
 * Point an element at the registry's copy. A page-set integrity stays, as
 * a `scriptLoader.sources` entry treats it: the element moves only when
 * the pin allows the registry's bytes, and keeps the vendor URL, pinned,
 * otherwise.
 */
const pin = function pin(
	install: Install,
	element: HTMLScriptElement,
	file: RegistryFile,
	value: unknown
): unknown {
	const { dom } = install;
	const own = dom.getAttribute.call(element, 'integrity');
	const ownIntegrity = !own?.trim();
	if (!ownIntegrity && !pinAllows(own as string, file.integrity)) {
		return value;
	}
	pinned.set(element, {
		crossorigin: dom.getAttribute.call(element, 'crossorigin'),
		file,
		integrity: ownIntegrity ? file.integrity : (own as string),
		ownIntegrity,
		url: String(value),
	});
	if (ownIntegrity) {
		dom.setAttribute.call(element, 'integrity', file.integrity);
	}
	dom.setAttribute.call(element, 'crossorigin', 'anonymous');
	return file.src;
};

/**
 * Apply the list to an element about to get `value` as its `src`, and
 * return what it gets instead: the registry's URL, or `value` itself, so a
 * Trusted Types URL stays one.
 */
const route = function route(
	install: Install,
	element: HTMLScriptElement,
	value: unknown
): unknown {
	// A held element is decided when the list arrives, by the URL it has
	// then. A refused one that has been inserted stays refused: it sent its
	// `error`. One not inserted yet is decided again by its new URL.
	if (install.held.has(element) || failed.has(element)) {
		return value;
	}
	if (refused.has(element)) {
		refused.delete(element);
		restoreType(install.dom, element);
	}
	unpin(install.dom, element);
	const decision = decide(
		install,
		normalizeFileUrl(value, element.baseURI || undefined)
	);
	if (decision.kind === 'pin') {
		return pin(install, element, decision.file, value);
	}
	if (decision.kind === 'hold') {
		keepType(install, element);
		install.held.add(element);
	} else if (decision.kind === 'refuse') {
		keepType(install, element);
		refused.add(element);
		if (element.isConnected) {
			failLater(element);
		}
	}
	return value;
};

/**
 * Check a pinned element again as it is inserted: the page may have set
 * its own integrity after its `src`. One the registry's bytes do not match
 * goes back to the vendor URL under the page's pin.
 *
 * @returns `false` when the element no longer points at the registry, so
 * it is routed afresh.
 */
const recheck = function recheck(
	dom: Dom,
	element: HTMLScriptElement
): boolean {
	const record = pinned.get(element);
	if (!record || dom.getAttribute.call(element, 'src') !== record.file.src) {
		unpin(dom, element);
		return false;
	}
	const own = dom.getAttribute.call(element, 'integrity');
	if (own === record.integrity) {
		return true;
	}
	if (!own?.trim()) {
		dom.setAttribute.call(element, 'integrity', record.file.integrity);
		pinned.set(element, {
			...record,
			integrity: record.file.integrity,
			ownIntegrity: true,
		});
	} else if (pinAllows(own, record.file.integrity)) {
		pinned.set(element, { ...record, integrity: own, ownIntegrity: false });
	} else {
		pinned.delete(element);
		dom.setAttribute.call(element, 'src', record.url);
		restoreCrossorigin(dom, element, record);
		return true;
	}
	dom.setAttribute.call(element, 'crossorigin', 'anonymous');
	return true;
};

const scriptsIn = function scriptsIn(node: unknown): HTMLScriptElement[] {
	if (node instanceof HTMLScriptElement) {
		return [node];
	}
	if (
		node instanceof Element ||
		(typeof DocumentFragment !== 'undefined' &&
			node instanceof DocumentFragment)
	) {
		return Array.from(node.querySelectorAll('script'));
	}
	return [];
};

/** Route each script in `node` that inserting it may run. */
const sweep = function sweep(install: Install, node: unknown): void {
	for (const element of scriptsIn(node)) {
		// A connected script has run, or waits on its own `src`: moving it
		// never runs it again.
		if (element.isConnected) {
			continue;
		}
		if (install.held.has(element) || refused.has(element)) {
			enforceType(install.dom, element);
			if (refused.has(element)) {
				failLater(element);
			}
		} else if (!(pinned.has(element) && recheck(install.dom, element))) {
			const src = install.dom.getAttribute.call(element, 'src');
			if (src !== null) {
				const next = route(install, element, src);
				if (next !== src) {
					install.dom.setAttribute.call(element, 'src', next as string);
				}
			}
		}
	}
};

/** Insert a connected element again in place, so the browser runs it. */
const reinsert = function reinsert(dom: Dom, element: HTMLScriptElement): void {
	const parent = element.parentNode;
	if (element.isConnected && parent) {
		dom.insertBefore.call(parent, element, element.nextSibling);
	}
};

/** Decide every held element again; run those the list lets go. */
const releaseHeld = function releaseHeld(install: Install): void {
	const { dom } = install;
	const elements = [...install.held];
	install.held.clear();
	for (const element of elements) {
		restoreType(dom, element);
		const src = dom.getAttribute.call(element, 'src');
		if (src !== null && active === install) {
			const next = route(install, element, src);
			if (next !== src) {
				dom.setAttribute.call(element, 'src', next as string);
			}
		}
		if (!(install.held.has(element) || refused.has(element))) {
			reinsert(dom, element);
		}
	}
};

/** After an owner listed or left: release what no list holds now. */
const settle = function settle(install: Install): void {
	const needed = [...install.owners].some(
		(owner) => owner.files === null || Object.keys(owner.files).length > 0
	);
	if (!needed && active === install) {
		// No list names a file, or every loader left. A held element was never
		// listed, so it goes as it came.
		active = null;
		releaseHeld(install);
		install.restore();
		return;
	}
	releaseHeld(install);
};

type Method = (this: unknown, ...args: unknown[]) => unknown;

/** A prototype the pin patches: a DOM node's, or `Range`'s. */
type Patchable = Node | Range;

/** Patch the DOM entry points. Returns the install; `restore` undoes it. */
const installPatches = function installPatches(): Install {
	const restores: (() => void)[] = [];
	const elementProto = Element.prototype;
	const dom: Dom = {
		getAttribute: elementProto.getAttribute,
		insertBefore: Node.prototype.insertBefore,
		removeAttribute: elementProto.removeAttribute,
		setAttribute: elementProto.setAttribute,
	};
	const install: Install = {
		dom,
		held: new Set(),
		owners: new Set(),
		restore() {
			for (const undo of restores.splice(0).reverse()) {
				undo();
			}
		},
	};

	const patch = function patch(
		proto: Patchable | undefined,
		name: string,
		wrap: (original: Method) => Method
	): void {
		const target = proto as unknown as Record<string, unknown> | undefined;
		const original = target?.[name];
		if (!target || typeof original !== 'function') {
			return;
		}
		const wrapped = wrap(original as Method);
		target[name] = wrapped;
		restores.push(() => {
			// A wrapper installed on top keeps ours in its chain; ours is then
			// a pass-through, because `active` no longer points here.
			if (target[name] === wrapped) {
				target[name] = original;
			}
		});
	};
	const routeArgument =
		(index: number, matches: (args: unknown[]) => boolean) =>
		(original: Method): Method =>
			function routed(this: unknown, ...args: unknown[]) {
				if (
					active === install &&
					this instanceof HTMLScriptElement &&
					args.length > index &&
					matches(args)
				) {
					args[index] = route(install, this, args[index]);
				}
				return original.apply(this, args);
			};

	const srcProto = HTMLScriptElement.prototype;
	const srcDescriptor = Object.getOwnPropertyDescriptor(srcProto, 'src');
	const ownSet = srcDescriptor?.set;
	if (srcDescriptor?.configurable && ownSet) {
		const set = function set(this: HTMLScriptElement, value: unknown) {
			ownSet.call(
				this,
				active === install && this instanceof HTMLScriptElement
					? route(install, this, value)
					: value
			);
		};
		Object.defineProperty(srcProto, 'src', {
			...srcDescriptor,
			get: srcDescriptor.get,
			set,
		});
		restores.push(() => {
			if (Object.getOwnPropertyDescriptor(srcProto, 'src')?.set === set) {
				Object.defineProperty(srcProto, 'src', srcDescriptor);
			}
		});
	}
	patch(
		elementProto,
		'setAttribute',
		routeArgument(1, ([name]) => String(name).toLowerCase() === 'src')
	);
	patch(
		elementProto,
		'setAttributeNS',
		routeArgument(
			2,
			([namespace, name]) =>
				(namespace === null || namespace === '') && name === 'src'
		)
	);
	const routeNode = (original: Method): Method =>
		function routedNode(this: unknown, ...args: unknown[]) {
			const [attribute] = args;
			if (
				active === install &&
				this instanceof HTMLScriptElement &&
				attribute instanceof Attr &&
				attribute.namespaceURI === null &&
				attribute.localName === 'src'
			) {
				const next = route(install, this, attribute.value);
				if (next !== attribute.value) {
					attribute.value = String(next);
				}
			}
			return original.apply(this, args);
		};
	patch(elementProto, 'setAttributeNode', routeNode);
	patch(elementProto, 'setAttributeNodeNS', routeNode);

	/** Sweep the nodes an insertion adds, when it adds them to the page. */
	const insertion =
		(pick: (args: unknown[]) => unknown[]) =>
		(original: Method): Method =>
			function inserted(this: unknown, ...args: unknown[]) {
				const anchor =
					typeof Range !== 'undefined' && this instanceof Range
						? this.startContainer
						: this;
				// A node inserted into a detached tree is swept when that tree
				// joins the page.
				if (
					active === install &&
					anchor instanceof Node &&
					anchor.isConnected
				) {
					for (const node of pick(args)) {
						sweep(install, node);
					}
				}
				return original.apply(this, args);
			};
	const first = (args: unknown[]) => args.slice(0, 1);
	const all = (args: unknown[]) => args;
	for (const name of ['appendChild', 'insertBefore', 'replaceChild']) {
		patch(Node.prototype, name, insertion(first));
	}
	for (const proto of [
		elementProto,
		// A shadow root is a fragment, and a script inserted into a connected
		// one runs.
		typeof DocumentFragment === 'undefined'
			? undefined
			: DocumentFragment.prototype,
	]) {
		for (const name of ['append', 'prepend', 'replaceChildren']) {
			patch(proto, name, insertion(all));
		}
	}
	for (const proto of [
		elementProto,
		typeof CharacterData === 'undefined' ? undefined : CharacterData.prototype,
	]) {
		for (const name of ['after', 'before', 'replaceWith']) {
			patch(proto, name, insertion(all));
		}
	}
	patch(
		elementProto,
		'insertAdjacentElement',
		insertion((args) => args.slice(1, 2))
	);
	if (typeof Range !== 'undefined') {
		for (const name of ['insertNode', 'surroundContents']) {
			patch(Range.prototype, name, insertion(first));
		}
	}
	return install;
};

/**
 * Join the pin with one script loader's list, installing it first if no
 * loader pinned yet. A no-op outside the browser.
 *
 * @param files - The registry's files, or `null` while its list is pending:
 * cross-origin scripts are then held until {@link FilePin.list} gives it.
 * @returns This loader's share, or `null` outside the browser.
 * @internal
 */
export const pinRegistryFiles = function pinRegistryFiles(
	files: RegistryFiles | null
): FilePin | null {
	if (
		typeof document === 'undefined' ||
		typeof HTMLScriptElement === 'undefined'
	) {
		return null;
	}
	active ??= installPatches();
	const install = active;
	const owner: Owner = { files };
	install.owners.add(owner);
	if (files !== null) {
		settle(install);
	}
	return {
		dispose() {
			if (install.owners.delete(owner)) {
				settle(install);
			}
		},
		list(next) {
			if (owner.files === null && install.owners.has(owner)) {
				owner.files = next;
				settle(install);
			}
		},
	};
};
