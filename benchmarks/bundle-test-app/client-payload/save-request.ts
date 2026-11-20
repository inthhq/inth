/**
 * The request each consent library's save sends to its arm's mock backend:
 * the published v2 client posts `/subjects`, the v3 client posts
 * `/v1/consent/records`.
 */
const SAVE_PATHS = {
	v2: '/subjects',
	v3: '/v1/consent/records',
} as const;

/** Libraries that save consent. */
export type SavingLibrary = keyof typeof SAVE_PATHS;

/**
 * Whether a request is the save the library sends when the visitor accepts.
 *
 * @param library - The arm's consent library.
 * @param method - The request method.
 * @param url - The request URL.
 */
export const isSaveRequest = function isSaveRequest(
	library: SavingLibrary,
	method: string,
	url: string
): boolean {
	return (
		method === 'POST' && new URL(url).pathname.endsWith(SAVE_PATHS[library])
	);
};
