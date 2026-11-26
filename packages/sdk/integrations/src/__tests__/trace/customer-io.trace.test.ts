/** @vitest-environment jsdom */
import { describeGoldenTraces } from './golden';

await describeGoldenTraces(() => import('./specs/customer-io'));
