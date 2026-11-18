// Type-check scaffolding: the `scripts` that `customize.ts` passes to the
// plugin. The quickstart publishes the real file from `examples/vue`.
import { posthog } from '@inth/integrations/posthog';

export const scripts = [posthog({ id: 'phc_your_project_key' })];
