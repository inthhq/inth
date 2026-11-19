import { createConsentRoute } from '@inth/nextjs/api';

import consentConfig from '@/inth.config';

export const { GET } = createConsentRoute({ config: consentConfig });
