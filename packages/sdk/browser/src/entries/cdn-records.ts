/**
 * `dist/inth.records.js`: what the init script (`inth.js`) fetches at once
 * for a returning visitor, who has a stored consent record. It hands core's
 * record reader to the init script, which evaluates the stored choice
 * before `/v1/consent/init` answers and starts the scripts it allows. A first visit
 * never fetches it. See `../init/run.ts`.
 */

import { readStoredRecords } from '@inth/sdk-core/modules/persistence';

import { readBoot } from '../init/read-boot';
import { version } from '../version';

readBoot()?.provide({ name: 'records', readStoredRecords, version });
