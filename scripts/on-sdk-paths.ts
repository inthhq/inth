/**
 * Runs a command over the SDK paths in `sdk-paths.json`, the same list the
 * root lint and format configs leave out. Run from the repository root:
 * `node scripts/on-sdk-paths.ts oxfmt -c oxfmt.sdk.config.ts --check`.
 */
import { spawnSync } from 'node:child_process';

import sdkPaths from '../sdk-paths.json' with { type: 'json' };

const [command, ...args] = process.argv.slice(2);
if (!command) {
	throw new Error('Usage: node scripts/on-sdk-paths.ts <command> [args...]');
}
const result = spawnSync(command, [...args, ...sdkPaths], { stdio: 'inherit' });
process.exit(result.status ?? 1);
