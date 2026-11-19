// Typed here so core needs no Node types. TypeScript erases it, leaving the
// expression bundlers look for.
declare const process: { env: { NODE_ENV?: string } };

/**
 * Whether this is a production build, for gating development warnings.
 *
 * Bundlers replace the literal `process.env.NODE_ENV` at build time, the
 * same check `@inth/react` uses, so a production build skips the warnings
 * even in the browser, which has no `process`. Reading it through
 * `globalThis.process` hides it from that replacement and the warnings
 * print in production. Without a bundler and without `process`, such as an
 * ES module loaded straight from a CDN, the read throws and counts as
 * development.
 *
 * @internal
 * @returns `true` when `NODE_ENV` is `'production'`.
 */
export const isProductionBuild = function isProductionBuild(): boolean {
	try {
		return process.env.NODE_ENV === 'production';
	} catch {
		return false;
	}
};

/**
 * `console.warn` in development builds only.
 *
 * @param message - The warning, starting with `[inth]`.
 * @param error - What failed, logged after the message when given.
 * @internal
 */
export const warnInDevelopment = function warnInDevelopment(
	message: string,
	error?: unknown
): void {
	if (isProductionBuild()) {
		return;
	}
	if (error === undefined) {
		console.warn(message);
	} else {
		console.warn(message, error);
	}
};
