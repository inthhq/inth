import { InthProvider as ReactInthProvider } from '@inth/react';
import { describe, expect, test } from 'vitest';

import packageJson from '../../package.json';
import * as entry from '../index';
import * as reactEntry from '../react';
import { InthProvider } from '../inth-provider';

describe('the InthProvider each @inth/tanstack-start entry exports', () => {
	test("the main entry exports this package's root, not React's", () => {
		expect(entry.InthProvider).toBe(InthProvider);
		expect(entry.InthProvider).not.toBe(ReactInthProvider);
	});

	test('@inth/tanstack-start/react exports the provider from @inth/react', () => {
		expect(packageJson.exports['./react']).toMatchObject({
			import: './dist/react.js',
		});
		// oxlint-disable-next-line import/namespace -- The rule cannot follow `export *` from another package.
		expect(reactEntry.InthProvider).toBe(ReactInthProvider);
	});
});
