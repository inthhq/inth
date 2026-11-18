// #region docs:client-side-config title="inth.config.ts"
import { defineConsentConfig, hosted } from '@inth/nextjs';

// The browser asks the backend's /init. The backend URL comes from
// NEXT_PUBLIC_INTH_PROJECT_URL.
export default defineConsentConfig({ mode: hosted() });
// #endregion docs:client-side-config
