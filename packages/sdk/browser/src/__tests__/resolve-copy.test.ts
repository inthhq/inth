import type { ConsentSnapshot } from '@inth/sdk-core';
import { describe, expect, it } from 'vite-plus/test';

import { resolveCopy } from '../ui/resolve-copy';

const snapshotWith = (
	prompt: 'choice' | 'notice',
	translations: Record<string, unknown>
) =>
	({
		policyRule: { prompt },
		translations: { language: 'xx', translations },
	}) as unknown as ConsentSnapshot;

describe('surface copy', () => {
	it('titles a notice from its own language before English', () => {
		const copy = resolveCopy(
			snapshotWith('notice', {
				cookieBanner: { description: 'Beschreibung', title: 'Datenschutz' },
			})
		);

		expect(copy.prompt).toEqual({
			description: 'Beschreibung',
			title: 'Datenschutz',
		});
	});

	it('labels dismiss with an older bundle’s dismiss key', () => {
		const copy = resolveCopy(
			snapshotWith('notice', { common: { dismiss: 'Schließen' } })
		);

		expect(copy.actions.dismiss).toBe('Schließen');
		expect(copy.actions.accept).toBe('Accept All');
	});
});
