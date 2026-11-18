import { CONSENT_REQUEST_HEADER_NAMES } from '@inth/sdk/schema/types';

/** The request headers `/init` and the manifest inputs read. */
export const INIT_HEADER_NAMES = [...CONSENT_REQUEST_HEADER_NAMES] as const;

const INIT_HEADER_ALLOWLIST = new Set<string>(INIT_HEADER_NAMES);

/**
 * The consent headers among `headers`, lower-cased.
 *
 * @param headers - Request headers.
 * @returns Only the allowed, non-empty headers.
 */
export const pickAllowedInitHeaders = function pickAllowedInitHeaders(
	headers: Record<string, string | undefined>
): Record<string, string> {
	const allowed: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		const normalized = key.toLowerCase();
		if (value && INIT_HEADER_ALLOWLIST.has(normalized)) {
			allowed[normalized] = value;
		}
	}
	return allowed;
};
