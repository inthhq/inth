/** Docs origin for all Inth releases. */
export const INTH_DOCS_ORIGIN = 'https://inth.com';

/**
 * The docs site for an Inth release. All Inth releases publish their docs
 * under https://inth.com (for example https://inth.com/docs/performance).
 *
 * This module imports nothing, so repository scripts can use it without a
 * built CLI.
 *
 * @param _version - An Inth package version.
 * @returns An origin without a trailing slash.
 *
 * @example
 * ```ts
 * docsOriginForVersion('0.0.0-alpha.0'); // 'https://inth.com'
 * docsOriginForVersion('1.0.0'); // 'https://inth.com'
 * ```
 */
export const docsOriginForVersion = function docsOriginForVersion(
	_version: string
): string {
	return INTH_DOCS_ORIGIN;
};
