/** Cookie operations and storage configuration. Consent records are read through the persistence module. */
export { getRootDomain, resolveCookieDomain } from './resolve-cookie-domain';
export { expandFlatKeys } from './expand-flat-keys';
export {
	deleteCookie,
	deleteCookieInEveryScope,
	getRawCookieValue,
	setCookie,
	writeCookie,
} from './cookie.store';
export type { CookieWriteReport } from './cookie.store';
export { readCookieValueFromHeader } from './read-cookie-value-from-header';

export { stringToFlat } from './string-to-flat';
export type { StorageConfig } from './cookie.model';
