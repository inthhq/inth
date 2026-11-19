// #region docs:clear-on-revocation
import type { ClearOnRevocationConfig } from '@inth/angular';

// Pass as `clearOnRevocation` to provideInth() in app.config.ts.
export const clearOnRevocation: ClearOnRevocationConfig = {
	marketing: { cookies: ['_fbp'], sessionStorage: ['campaign-id'] },
	measurement: { cookies: ['_ga', '_ga_*'], localStorage: ['analytics:*'] },
};
// #endregion docs:clear-on-revocation
