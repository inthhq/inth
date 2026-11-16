/**
 * Repository wrapper around `c15t mobile-manifest`'s exporter, for the example
 * and fixture resources that need an explicit `--expires-at`. Apps use the CLI.
 */
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { exportMobilePolicy } from '../packages/cli/src/mobile/export-manifest';

export { exportMobilePolicy };

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const { values } = parseArgs({
		options: {
			endpoint: { type: 'string' },
			'expires-at': { type: 'string' },
			languages: { type: 'string' },
			out: { type: 'string' },
			vendors: { type: 'string' },
		},
	});
	if (!values.endpoint || !values.out || !values['expires-at']) {
		throw new Error(
			'Use --endpoint https://your-project.inth.app --out c15t-policy.json --expires-at <ISO timestamp>.'
		);
	}
	await writeFile(
		values.out,
		await exportMobilePolicy({
			endpoint: values.endpoint,
			expiresAt: Date.parse(values['expires-at']),
			languages: values.languages?.split(','),
			vendors: values.vendors?.split(',').map(Number),
		})
	);
}
