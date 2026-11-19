import * as v from 'valibot';

import { hostingValues } from './constants';

/**
 * Schema for the backend operator reported on `/v1/consent/init` and the manifest
 */
export const hostingSchema = v.picklist(hostingValues);

export type Hosting = v.InferOutput<typeof hostingSchema>;

export { hostingValues };
