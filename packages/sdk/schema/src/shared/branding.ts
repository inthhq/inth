import * as v from 'valibot';

import { brandingValues, DEFAULT_BRANDING } from './constants';

export const brandingSchema = v.picklist(brandingValues);

export type Branding = v.InferOutput<typeof brandingSchema>;

export { brandingValues, DEFAULT_BRANDING };
