/**
 * Checks the Inth script registry's `released` signature on an entry
 * before the loader points a script at it.
 *
 * The browser's SRI check proves the bytes match `integrity`, but the
 * registry list that carries `integrity` comes from Inth's backend. The
 * public keys ship in this package, so a backend that changes the list
 * cannot make a script load bytes Inth never released. WebCrypto checks
 * it; no library.
 *
 * Inth builds the signed statement itself from the URL the integration
 * would load, the entry's `integrity` and the signature's own fields, so a
 * signature over another statement, URL or hash does not verify.
 */

import { SIGNING_KEYS } from './signing-keys';
import type { RegistrySigningKeys } from './signing-keys';

export type { RegistrySigningKeys } from './signing-keys';

/** A `released` signature on a registry entry. */
export interface RegistrySignature {
	keyId: string;
	/** 64 bytes, `r` then `s`, in standard base64. */
	value: string;
	/** The SHA-256 of the bytes, lowercase hex. */
	sha256: string;
	/** When the release was signed, as ISO 8601. */
	signedAt: string;
}

/** Changes when the signed fields or their order do. */
const SIGNING_FORMAT = 'inth-script-registry-v1';

/** P-256 signatures are `r` and `s`, 32 bytes each. */
const SIGNATURE_LENGTH = 64;

const fromBase64 = (value: string): Uint8Array<ArrayBuffer> | null => {
	try {
		return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
	} catch {
		return null;
	}
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A signature as an entry carries it, or `null` when it is not an object
 * of four strings. Fields Inth does not know are ignored.
 *
 * @internal
 */
export const parseRegistrySignature = function parseRegistrySignature(
	value: unknown
): RegistrySignature | null {
	if (!isRecord(value)) {
		return null;
	}
	const { keyId, sha256, signedAt, value: signature } = value;
	if (
		typeof keyId !== 'string' ||
		typeof sha256 !== 'string' ||
		typeof signedAt !== 'string' ||
		typeof signature !== 'string'
	) {
		return null;
	}
	return { keyId, sha256, signedAt, value: signature };
};

/**
 * The bytes the registry signs when it releases a version, or `null` when
 * a field cannot be one: a time that does not parse, or a line break that
 * could shift one field into the next.
 *
 * @internal
 */
export const releaseStatement = function releaseStatement(fields: {
	url: string;
	integrity: string;
	sha256: string;
	signedAt: string;
}): Uint8Array<ArrayBuffer> | null {
	const time = Date.parse(fields.signedAt);
	if (Number.isNaN(time)) {
		return null;
	}
	const lines = [
		SIGNING_FORMAT,
		'released',
		fields.url,
		fields.integrity,
		fields.sha256,
		new Date(time).toISOString(),
	];
	if (lines.some((line) => /[\r\n]/u.test(line))) {
		return null;
	}
	return new TextEncoder().encode(lines.join('\n'));
};

const importedKeys = new Map<string, Promise<CryptoKey>>();

const importKey = (spki: string): Promise<CryptoKey> => {
	let key = importedKeys.get(spki);
	if (!key) {
		key = crypto.subtle.importKey(
			'spki',
			fromBase64(spki) ?? new Uint8Array(),
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['verify']
		);
		importedKeys.set(spki, key);
	}
	return key;
};

/**
 * The absolute URL a vendor `src` loads from, or `null` when it has none.
 * A protocol-relative URL, such as Microsoft UET's `//bat.bing.com/bat.js`,
 * reads as https, the only scheme the registry serves. A path, such as
 * `/scripts/at.js`, resolves against the page's base URL, as the browser
 * resolves it; a server has no page, so it leaves that entry to the browser.
 * The `href` has no fragment and no trailing dot on its host, neither of
 * which changes the file a server sends.
 */
const vendorHref = (src: string): string | null => {
	try {
		const url = new URL(
			src.startsWith('//') ? `https:${src}` : src,
			globalThis.document?.baseURI ?? globalThis.location?.href
		);
		url.hash = '';
		if (url.hostname.endsWith('.')) {
			url.hostname = url.hostname.slice(0, -1);
		}
		return url.href;
	} catch {
		return null;
	}
};

/**
 * Whether `signature` is a key's in `keys` over the `released` statement
 * for `url` and `integrity`. `url` is the URL the integration would load
 * from the vendor. False for anything malformed, an unknown key, or a
 * page with no WebCrypto, one that is not a secure context, such as plain
 * http on a host other than localhost; never throws.
 *
 * @internal
 */
export const verifyReleaseSignature = async function verifyReleaseSignature(
	input: {
		url: string;
		integrity: string;
		signature: RegistrySignature;
	},
	keys: RegistrySigningKeys = 'production'
): Promise<boolean> {
	const publicKey = SIGNING_KEYS[keys].get(input.signature.keyId);
	const signature = fromBase64(input.signature.value);
	const url = vendorHref(input.url);
	if (url === null) {
		return false;
	}
	const statement = releaseStatement({
		integrity: input.integrity,
		sha256: input.signature.sha256,
		signedAt: input.signature.signedAt,
		url,
	});
	if (
		!(publicKey && statement) ||
		signature?.length !== SIGNATURE_LENGTH ||
		typeof crypto === 'undefined' ||
		!crypto.subtle
	) {
		return false;
	}
	try {
		return await crypto.subtle.verify(
			{ hash: 'SHA-256', name: 'ECDSA' },
			await importKey(publicKey),
			signature,
			statement
		);
	} catch {
		return false;
	}
};

/**
 * Finished checks by {@link checkKey}, shared by every loader. A long-lived
 * server sees each entry the registry sends it, so the map starts over once
 * it holds {@link MAX_SETTLED}. A verifier keeps the verdicts it gave, so
 * only a new verifier, such as a later server render, checks again.
 */
const settled = new Map<string, boolean>();
const MAX_SETTLED = 512;
const running = new Map<string, Promise<boolean>>();

const checkKey = (
	keys: RegistrySigningKeys,
	url: string,
	integrity: string,
	signature: RegistrySignature
): string =>
	JSON.stringify([
		keys,
		url,
		integrity,
		signature.keyId,
		signature.value,
		signature.sha256,
		signature.signedAt,
	]);

/** Checks one entry and keeps the result for every loader. */
const runCheck = async (
	key: string,
	input: Parameters<typeof verifyReleaseSignature>[0],
	keys: RegistrySigningKeys
): Promise<boolean> => {
	const valid = await verifyReleaseSignature(input, keys);
	if (settled.size >= MAX_SETTLED) {
		settled.clear();
	}
	settled.set(key, valid);
	running.delete(key);
	return valid;
};

const notifyWhenDone = async (
	check: Promise<boolean>,
	keep: (valid: boolean) => void,
	onSettled: (() => void) | undefined
): Promise<void> => {
	keep(await check);
	onSettled?.();
};

/**
 * What the loader does with a registry entry: `load` it, `wait` while its
 * signature is checked, or `refuse` it, so the script loads neither from
 * the registry nor from its vendor.
 */
export type RegistryEntryVerdict = 'load' | 'refuse' | 'wait';

/** The part of a registry entry its signature check reads. */
export interface SignedRegistryEntry {
	integrity?: string;
	/** Absent when the entry has none; `null` when it is malformed. */
	signature?: RegistrySignature | null;
}

/**
 * Decides each registry entry by its signature, checking each one once.
 *
 * @param options.requireSignatures - Whether an entry with no signature is
 * refused. An invalid signature is refused either way.
 * @param options.keys - Whose keys to trust.
 * @param options.onSettled - Called when a check the verdict waited on
 * finishes, so the caller can resolve its scripts again.
 * @returns A function from the URL the integration would load and its
 * registry entry to a verdict.
 * @internal
 */
export const createRegistryVerifier = function createRegistryVerifier(options: {
	requireSignatures: boolean;
	keys: RegistrySigningKeys;
	onSettled?: () => void;
}): (url: string, entry: SignedRegistryEntry) => RegistryEntryVerdict {
	// The checks this verifier waits on, and the verdicts it has given. A
	// verdict stays here when the shared cache starts over, so a loader
	// never waits again on an entry it already decided.
	const watched = new WeakSet<Promise<boolean>>();
	const decided = new Map<string, boolean>();
	return (url, entry) => {
		const { signature } = entry;
		if (signature === undefined) {
			return options.requireSignatures ? 'refuse' : 'load';
		}
		if (signature === null || typeof entry.integrity !== 'string') {
			return 'refuse';
		}
		const href = vendorHref(url);
		if (href === null) {
			return 'refuse';
		}
		const key = checkKey(options.keys, href, entry.integrity, signature);
		const result = decided.get(key) ?? settled.get(key);
		if (result !== undefined) {
			decided.set(key, result);
			return result ? 'load' : 'refuse';
		}
		let check = running.get(key);
		if (!check) {
			check = runCheck(
				key,
				{ integrity: entry.integrity, signature, url: href },
				options.keys
			);
			running.set(key, check);
		}
		if (!watched.has(check)) {
			watched.add(check);
			void notifyWhenDone(
				check,
				(valid) => decided.set(key, valid),
				options.onSettled
			);
		}
		return 'wait';
	};
};
