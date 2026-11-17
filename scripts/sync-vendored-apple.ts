#!/usr/bin/env bun
/** Generate the CocoaPods copy of the shared Apple platform module. */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { syncVendoredCore } from './sync-vendored-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const drift = ['C15tApple', 'C15tConsentUI'].flatMap((module) =>
	syncVendoredCore({
		check: process.argv.includes('--check'),
		sourceDir: join(root, 'packages/swift/Sources', module),
		targetDir: join(root, 'packages/react-native/vendor', module),
	})
);
if (drift.length > 0) {
	console.error(
		'Vendored Apple platform sources differ. Run bun scripts/sync-vendored-apple.ts.',
		drift
	);
	process.exit(1);
}
