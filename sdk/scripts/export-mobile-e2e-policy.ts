import { writeFile } from 'node:fs/promises';

import { exportMobilePolicy } from './export-mobile-policy';

const [, , output] = process.argv;
if (!output) {
	throw new Error('Expected an isolated E2E output path.');
}
await writeFile(
	output,
	await exportMobilePolicy({
		endpoint: `${process.env.C15T_E2E_BINDING ?? 'http://localhost:3108'}/api/self-host`,
		fetch: (input, init) =>
			fetch(
				String(input).replace(
					process.env.C15T_E2E_BINDING ?? 'http://localhost:3108',
					process.env.C15T_E2E_FETCH ?? 'http://localhost:3108'
				),
				init
			),
		expiresAt:
			process.env.C15T_APP_E2E_SCENARIO === 'expiry'
				? 1793232001000
				: Date.now() + 86400000,
		now:
			process.env.C15T_APP_E2E_SCENARIO === 'expiry'
				? 1793232000000
				: undefined,
		testOnlyAllowLoopback: true,
	})
);
