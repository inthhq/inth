/**
 * The warning manifest mode logs when it answers from the backend's
 * `/init` because the consent manifest is unavailable.
 *
 * @packageDocumentation
 * @internal
 */

const warned = new Set<string>();

/**
 * Warns, once per manifest source, that consent resolves from the
 * backend's `/init` because the manifest could not be read.
 *
 * @param source - The manifest URL, or another name for where it was read.
 * @internal
 */
export const warnManifestFallback = function warnManifestFallback(
	source: string,
	cause: unknown
): void {
	if (warned.has(source)) {
		return;
	}
	warned.add(source);
	const reason = cause instanceof Error ? cause.message : String(cause);
	console.warn(
		`inth: could not read the consent manifest from ${source} (${reason}). Consent resolves from the backend's init until it can.`
	);
};
