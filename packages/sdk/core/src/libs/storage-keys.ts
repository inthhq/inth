import type { StorageConfig } from './cookie';

/** Default consent storage key. */
export const STORAGE_KEY_V2 = 'inth';

/** The consent key before 1.8, read as a fallback under every other key. */
export const STORAGE_KEY = 'privacy-consent-storage';

/** c15t's consent storage key, read as a fallback under the default key. */
export const C15T_STORAGE_KEY = 'c15t';

/** Failed v3 consent saves waiting for a backend replay. */
export const PENDING_SAVES_STORAGE_KEY = 'inth-v3-pending-consent-saves:v1';

/**
 * Subject ids the backend refused as another tenant's, each with the id this
 * browser moved to, so every tab moves to the same one. Cleared with the
 * queued saves.
 */
export const SUBJECT_REASSIGNMENTS_STORAGE_KEY =
	'inth-v3-subject-reassignments:v1';

/**
 * The banner-experiment arm this browser was shown, as `{ id, variant }`.
 * Written only once the banner has rendered that arm.
 */
export const EXPERIMENT_STORAGE_KEY = 'inth-experiment-v1';

/**
 * The consent journey id a `journey: 'tab'` runtime keeps in
 * `sessionStorage` while a prompt is due. Removed once a choice is recorded.
 */
export const JOURNEY_STORAGE_KEY = 'inth-journey-v1';

/**
 * The keys one consent storage key derives. Notice dismissals, vendor
 * denials and the clear epoch get their own keys derived from the consent
 * key so a custom `storageKey` moves them all together.
 */
export interface StorageKeyFamily {
	consent: string;
	notice: string;
	/** Identity cookie bound to the notice acknowledgement. */
	noticeSubject: string;
	/** localStorage marker for dropped notice cookie writes. */
	noticeCookieMiss: string;
	vendors: string;
	/** Time of the last clear. Survives the clear it records. */
	epoch: string;
	/**
	 * localStorage only: the consent cookie as it stood when a consent write
	 * reached localStorage but not the cookie.
	 */
	cookieMiss: string;
	/**
	 * Where v3 alphas stored standing GPC directives. Nothing writes or
	 * reads it now; `clear()` removes it.
	 */
	privacy: string;
}

/** The storage keys one configuration resolves to. */
export interface ResolvedStorageKeys extends StorageKeyFamily {
	/**
	 * Families another or an earlier store wrote, in the order they are
	 * read: c15t's under the default key, then the pre-1.8 consent key. The
	 * consent record, the notice dismissal and the vendor denials each fall
	 * back to them only while the configured family holds no valid one.
	 * Nothing writes them. `clear()` removes them with the configured
	 * family, and the configured family's clear epoch voids decisions in
	 * any written back later. Their `epoch` is never read.
	 */
	legacy: StorageKeyFamily[];
}

const familyOf = function familyOf(consent: string): StorageKeyFamily {
	return {
		consent,
		cookieMiss: `${consent}-cookie-miss`,
		epoch: `${consent}-epoch`,
		notice: `${consent}-notice`,
		noticeCookieMiss: `${consent}-notice-cookie-miss`,
		noticeSubject: `${consent}-notice-subject`,
		privacy: `${consent}-privacy`,
		vendors: `${consent}-vendors`,
	};
};

/**
 * The storage keys `config` resolves to. Every reader, writer, watcher,
 * clearer and inline script takes its names from here.
 *
 * @returns The configured family and the legacy families read after it.
 */
export const resolveStorageKeys = function resolveStorageKeys(
	config?: StorageConfig
): ResolvedStorageKeys {
	const consent = config?.storageKey || STORAGE_KEY_V2;
	const legacy = [
		...(consent === STORAGE_KEY_V2 ? [C15T_STORAGE_KEY] : []),
		...(consent === STORAGE_KEY ? [] : [STORAGE_KEY]),
	];
	return { ...familyOf(consent), legacy: legacy.map(familyOf) };
};

/**
 * The configured family, then the legacy ones: the order every reader
 * tries them in.
 *
 * @returns Every family `keys` reads.
 */
export const storageKeyFamilies = function storageKeyFamilies(
	keys: ResolvedStorageKeys
): StorageKeyFamily[] {
	const { legacy, ...configured } = keys;
	return [configured, ...legacy];
};

/**
 * Names whose presence alone shows that a choice, or a notice dismissal,
 * is stored, configured family first. For the checks that run before any
 * record is decoded, which test them with {@link STORED_NAMES_CHECK}.
 *
 * @returns The consent record names and the notice dismissal names.
 */
export const storedChoiceNames = function storedChoiceNames(
	config?: StorageConfig
): { choice: string[]; notice: string[] } {
	const families = storageKeyFamilies(resolveStorageKeys(config));
	return {
		choice: families.map((family) => family.consent),
		notice: families.map((family) => family.notice),
	};
};

/**
 * ES5 source of a function expression that takes a list of names and
 * returns whether any holds a non-empty cookie or a localStorage entry.
 * Inline scripts embed it to tell whether a choice is stored before the
 * runtime loads; `hasStoredConsentRecord` runs the same test in bundled
 * code. Blocked cookies or storage read as nothing stored there.
 */
export const STORED_NAMES_CHECK =
	'function(n){try{if(document.cookie.split("; ").some(function(c){return n.some(function(k){return c.indexOf(k+"=")===0&&c.length>k.length+1})}))return true}catch(e){}try{return n.some(function(k){return localStorage.getItem(k)!==null})}catch(e){return false}}';
