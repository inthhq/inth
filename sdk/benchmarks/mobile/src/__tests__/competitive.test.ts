import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { expect, test } from 'vitest';

test('competitive artifact and runtime acceptance rules', () => {
	const result = spawnSync(
		'python3',
		[resolve(import.meta.dirname, '../../competitive/tests.py')],
		{ encoding: 'utf8' }
	);
	expect(result.error).toBeUndefined();
	expect(result.status, result.stdout + result.stderr).toBe(0);
});
