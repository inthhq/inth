// #region docs:static-export-next-config title="next.config.ts"
import { withConsentManifest } from '@inth/nextjs/build';
import type { NextConfig } from 'next';

const nextConfig = { output: 'export' } satisfies NextConfig;

// Finds inth.config.ts. A static export skips the manifest download.
export default withConsentManifest(nextConfig);
// #endregion docs:static-export-next-config
