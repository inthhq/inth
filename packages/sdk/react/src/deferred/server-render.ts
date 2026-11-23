/**
 * Reads the server render's recorded promises (`server-render.model.ts`)
 * under React 18 and 19.
 *
 * @packageDocumentation
 * @internal
 */

import * as React from 'react';

import type { Recorded } from './server-render.model';

/** React 19's `use`, absent from React 18. */
const { use } = React as {
	use?: <Value>(value: Promise<Value>) => Value;
};

/**
 * `use` where React has it. React 18 suspends on a thrown promise and
 * reads its recorded result on the retry.
 *
 * @internal
 */
export const read = function read<Value>(promise: Recorded<Value>): Value {
	if (use) {
		// oxlint-disable-next-line react-hooks/rules-of-hooks -- `read` is `use` with a React 18 fallback, so it keeps `use`'s rules: render only, conditions allowed.
		return use(promise);
	}
	if (promise.status === 'fulfilled') {
		return promise.value as Value;
	}
	throw promise;
};
