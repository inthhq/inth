/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';

await describeGoldenTraces(() => import('./specs/vercel-speed-insights'));
