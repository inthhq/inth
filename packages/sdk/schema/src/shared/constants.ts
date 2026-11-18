/**
 * Branding options for the consent banner. `consent` is a deprecated alias
 * for `inth`.
 */
export const brandingValues = ['c15t', 'inth', 'consent', 'none'] as const;

/**
 * Who runs the backend that served a consent decision: Inth's hosted
 * platform, or the site's own `@c15t/backend`.
 */
export const hostingValues = ['inth', 'self-hosted'] as const;

/** Where the browser CMP and the manifest load the IAB Global Vendor List. */
export const DEFAULT_GVL_ENDPOINT = 'https://gvl.inth.app';
