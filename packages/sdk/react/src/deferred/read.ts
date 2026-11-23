/**
 * Reads a recorded promise during render, under React 18 and 19.
 *
 * @packageDocumentation
 * @internal
 */

import * as React from 'react';

import type { Recorded } from './recorded-promise.model';

/** React 19's `use`, absent from React 18. */
const { use } = React as {
	use?: <Value>(value: Promise<Value>) => Value;
};

/**
 * Reads a recorded promise during render: its value once settled, else it
 * suspends. Render-only, like `use`.
 *
 * @internal
 */
export const read = function read<Value>(promise: Recorded<Value>): Value {
	if (promise.status === 'fulfilled') {
		return promise.value as Value;
	}
	if (promise.status === 'rejected') {
		throw promise.reason;
	}
	if (use) {
		// oxlint-disable-next-line react-hooks/rules-of-hooks -- `read` is `use` with a React 18 fallback.
		return use(promise);
	}
	throw promise;
};
