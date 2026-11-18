/** Cookie operations and storage configuration. Consent records are read through the persistence module. */
export { getRootDomain, resolveCookieDomain } from './domain-utils';
export {
	COOKIE_KEY_MAP,
	expandFlatKeys,
	REVERSE_COOKIE_KEY_MAP,
	shortenFlatKeys,
} from './key-mapping';
export {
	deleteCookie,
	getCookie,
	getRawCookieValue,
	parseCookieValue,
	setCookie,
	writeCookie,
} from './operations';
export type { CookieWriteReport } from './operations';
export { readCookieValueFromHeader } from './read-header';

export {
	flatToString,
	flattenObject,
	stringToFlat,
	unflattenObject,
} from './serialization';
export type { StorageConfig } from './types';
