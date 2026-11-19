/**
 * `dist/inth.commit.js`: what the init script (`inth.js`) fetches when the
 * visitor taps Accept or Reject on its banner, before the engine has
 * loaded. It hands core's early-commit code to the init script, which
 * stores the choice and queues its save with it. See `../init/run.ts`.
 */

import {
	planEarlyCommit,
	storeEarlyCommit,
} from '@inth/sdk-core/surface-actions/early-commit';

import { readBoot } from '../init/boot';
import { version } from '../version';

readBoot()?.provide({
	name: 'commit',
	planEarlyCommit,
	storeEarlyCommit,
	version,
});
