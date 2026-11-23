import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
	CORE_CHUNK_MODULES,
	CORE_FIRST_LOAD_MODULES,
	CORE_SURFACE_CONFIG_MODULES,
	coreModuleFile,
	coreModulePattern,
} from '../core-chunk-modules';

const SRC = join(import.meta.dirname, '..');

describe('core chunk modules', () => {
	test.each([...Object.values(CORE_CHUNK_MODULES), ...CORE_FIRST_LOAD_MODULES])(
		'%s is a core source file',
		(module) => {
			expect(existsSync(join(SRC, `${module}.ts`))).toBe(true);
		}
	);

	test('the first load includes what every surface reads', () => {
		expect(CORE_FIRST_LOAD_MODULES).toEqual(
			expect.arrayContaining([...CORE_SURFACE_CONFIG_MODULES])
		);
	});
});

describe('coreModulePattern', () => {
	const pattern = new RegExp(
		`[\\\\/]lib[\\\\/]${coreModulePattern(['libs/has', 'modules/loader-and-blocker'])}`,
		'u'
	);

	test.each([
		'/app/node_modules/@inth/sdk/lib/core/dist/libs/has.js',
		'C:\\app\\node_modules\\@inth\\sdk\\lib\\core\\dist\\modules\\loader-and-blocker.js',
		'/repo/packages/sdk/sdk/lib/core/src/libs/has.ts',
	])('matches %s', (id) => {
		expect(pattern.test(id)).toBe(true);
	});

	test.each([
		'/app/node_modules/@inth/sdk/lib/core/dist/modules/has.js',
		'/app/node_modules/@inth/sdk/lib/core/dist/libs/has-more.js',
		'/app/node_modules/@inth/sdk/lib/core/dist/libs/has.js.map',
		'/app/node_modules/@inth/sdk/lib/ui/dist/libs/has.js',
	])('leaves %s alone', (id) => {
		expect(pattern.test(id)).toBe(false);
	});
});

test('coreModuleFile names the built file', () => {
	expect(coreModuleFile(CORE_CHUNK_MODULES.browserResolver)).toBe(
		'/core/dist/transports/manifest-browser.js'
	);
});
