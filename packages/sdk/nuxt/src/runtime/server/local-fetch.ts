import { useNitroApp as getNitroApp } from 'nitropack/runtime';

import { createServerFetch } from './create-server-fetch';

export const serverFetch = createServerFetch(() => getNitroApp());
