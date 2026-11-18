// #region docs:next-config
import { withConsentManifest } from '@inth/nextjs/build';
import type { NextConfig } from 'next';

const nextConfig = {} satisfies NextConfig;

// Reads NEXT_PUBLIC_C15T_BACKEND_URL, like defineConsentConfig.
export default withConsentManifest(nextConfig);
// #endregion docs:next-config
