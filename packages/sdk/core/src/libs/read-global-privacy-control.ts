/**
 * Utility helpers for detecting Global Privacy Control (GPC) signals.
 *
 * @remarks
 * GPC is a browser-level signal that indicates a user's preference to opt out
 * of the sale or sharing of their personal data (e.g. CCPA/CPRA).
 *
 * These helpers only read the client-side `navigator.globalPrivacyControl`
 * flag.
 *
 * @see https://globalprivacycontrol.org/ for the GPC specification.
 */

/**
 * The browser's GPC flag as it stands, or `undefined` without a browser,
 * without a boolean flag, or when reading it throws.
 *
 * @internal
 */
export const readGlobalPrivacyControl = function readGlobalPrivacyControl():
	| boolean
	| undefined {
	try {
		// The page's navigator; the global one outside a window.
		const reader = (
			typeof window === 'undefined' ? globalThis.navigator : window.navigator
		) as (Navigator & { globalPrivacyControl?: unknown }) | undefined;
		const value = reader?.globalPrivacyControl;
		return typeof value === 'boolean' ? value : undefined;
	} catch {
		// A getter that throws reads as no signal.
		return undefined;
	}
};

/**
 * Whether the browser sends the GPC signal: `false` without a browser, a
 * flag, or when reading it throws.
 *
 * @internal
 */
export const hasGlobalPrivacyControlSignal =
	function hasGlobalPrivacyControlSignal(): boolean {
		return readGlobalPrivacyControl() === true;
	};
