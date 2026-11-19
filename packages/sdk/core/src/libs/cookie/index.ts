/** Cookie operations and storage configuration. Consent records are read through the persistence module. */
export { getRootDomain, resolveCookieDomain } from './domain-utils';
export { expandFlatKeys } from './key-mapping';
export {
	deleteCookie,
	deleteCookieInEveryScope,
	getRawCookieValue,
	setCookie,
	writeCookie,
} from './operations';
export type { CookieWriteReport } from './operations';
export { readCookieValueFromHeader } from './read-header';

export { stringToFlat } from './serialization';
export type { StorageConfig } from './types';
