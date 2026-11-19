// #region docs:next-config
import { withConsentManifest } from '@inth/nextjs/build';
import type { NextConfig } from 'next';

const nextConfig = {} satisfies NextConfig;

// Reads NEXT_PUBLIC_INTH_PROJECT_URL, like defineConsentConfig.
export default withConsentManifest(nextConfig);
// #endregion docs:next-config
