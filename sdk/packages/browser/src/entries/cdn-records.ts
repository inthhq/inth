/**
 * `dist/c15t.records.js`: what the init script (`c15t.js`) fetches at once
 * for a returning visitor, who has a stored consent record. It hands core's
 * record reader to the init script, which evaluates the stored choice
 * before `/init` answers and starts the scripts it allows. A first visit
 * never fetches it. See `../init/run.ts`.
 */

import { readStoredRecords } from '@c15t/core/modules/persistence';

import { readBoot } from '../init/boot';
import { version } from '../version';

readBoot()?.provide({ name: 'records', readStoredRecords, version });
