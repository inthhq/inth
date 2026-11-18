import { createConsentRoute } from '@inth/nextjs/api';

import consentConfig from '@/c15t.config';

export const { GET } = createConsentRoute({ config: consentConfig });
