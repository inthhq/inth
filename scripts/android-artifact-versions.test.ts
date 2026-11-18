import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

test('the packed bridge requests the produced native artifact version by default', () => {
	const producer = readFileSync(
		new URL('../packages/android/gradle.properties', import.meta.url),
		'utf8'
	)
		.match(/^inth\.native\.version=(?<version>.+)$/mu)
		?.groups?.version?.trim();
	const consumer = readFileSync(
		new URL(
			'../packages/react-native/android/inth-react-native/library.gradle',
			import.meta.url
		),
		'utf8'
	).match(
		/String coreVersion = prop\('inth\.core\.version'\) \?: '(?<version>[^']+)'/u
	)?.groups?.version;
	expect(producer).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/u);
	expect(consumer).toBe(producer);
});
