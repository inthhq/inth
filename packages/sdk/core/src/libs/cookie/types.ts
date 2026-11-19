/**
 * @packageDocumentation
 * Type definitions for cookie storage functionality.
 *
 * @remarks
 * This module contains all type definitions and interfaces used across
 * the cookie storage implementation.
 */

/**
 * Storage configuration options
 *
 * @remarks
 * Configure storage behavior through store options for better control
 * and testability.
 *
 * @example
 * ```typescript
 * import { createConsentKernel } from '@inth/sdk/engine';
 * import { createPersistence } from '@inth/sdk/modules/persistence';
 *
 * const kernel = createConsentKernel();
 * const persistence = createPersistence({
 *   kernel,
 *   storageConfig: {
 *     storageKey: 'my-consent-storage',
 *     crossSubdomain: true,
 *     defaultExpiryDays: 180
 *   }
 * });
 * ```
 *
 * @public
 */
export interface StorageConfig {
	/**
	 * Custom storage key for localStorage and cookies. The notice
	 * dismissal, vendor denials and clear epoch use keys derived from it
	 * (`<key>-notice`, `<key>-vendors`, `<key>-epoch`, ...).
	 *
	 * @default 'inth'
	 *
	 * @remarks
	 * Inth always writes under this key. Under the default key it also
	 * reads records c15t stored under `c15t`, so a visitor who chose on a
	 * c15t page of the same site, or of a sibling subdomain sharing the
	 * cookie domain, is not asked again. A record under `inth` always wins
	 * over one under `c15t`; Inth never rewrites c15t's records, and
	 * `clear()` removes them too. A custom key reads no c15t records.
	 *
	 * To share choices both ways with a c15t site, set `storageKey: 'c15t'`:
	 * Inth then reads and writes the same records c15t does.
	 *
	 * Every key except `'privacy-consent-storage'` also reads a record a
	 * version before 1.8 stored under that key.
	 */
	storageKey?: string;

	/**
	 * Enable cross-subdomain cookies by default
	 *
	 * @default false
	 *
	 * @remarks
	 * When true, cookies will automatically work across all subdomains
	 * (e.g., app.example.com, www.example.com, dashboard.example.com)
	 */
	crossSubdomain?: boolean;

	/**
	 * Custom default domain for cookies
	 *
	 * @default '' (current domain only)
	 *
	 * @remarks
	 * Ignored when `crossSubdomain` is set, which uses the root domain.
	 * Use '.example.com' for all subdomains.
	 */
	defaultDomain?: string;

	/**
	 * Default cookie expiration in days
	 *
	 * @default 365
	 */
	defaultExpiryDays?: number;
}
