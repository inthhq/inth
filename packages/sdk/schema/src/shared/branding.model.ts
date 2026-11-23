import * as v from 'valibot';

import { brandingValues, DEFAULT_BRANDING } from './schema-constants.model';

export const brandingSchema = v.picklist(brandingValues);

export type Branding = v.InferOutput<typeof brandingSchema>;

export { brandingValues, DEFAULT_BRANDING };
