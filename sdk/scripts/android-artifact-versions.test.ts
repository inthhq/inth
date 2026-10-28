import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

test('the packed bridge requests the produced native artifact version by default', () => {
	const producer = readFileSync(
		new URL('../native/core-android/gradle.properties', import.meta.url),
		'utf8'
	)
		.match(/^c15t\.native\.version=(.+)$/mu)?.[1]
		?.trim();
	const consumer = readFileSync(
		new URL(
			'../packages/react-native/android/c15t-react-native/library.gradle',
			import.meta.url
		),
		'utf8'
	).match(
		/String coreVersion = prop\('c15t\.core\.version'\) \?: '([^']+)'/u
	)?.[1];
	expect(producer).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/u);
	expect(consumer).toBe(producer);
});
