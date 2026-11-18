import { withConsentManifest } from '@inth/nextjs/build';
import type { NextConfig } from 'next';

const nextConfig = {} satisfies NextConfig;

export default withConsentManifest(nextConfig);
