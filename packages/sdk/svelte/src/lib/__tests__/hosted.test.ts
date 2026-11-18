/**
 * The Svelte provider's transport: a backend URL alone is the hosted
 * backend, defaulting to the URL `consentManifest()` read, as Vue's does.
 */
import { hosted } from '@inth/sdk/modes';
import { afterEach, describe, expect, test } from 'vitest';

import { selectedMode } from '../select-mode';
import { testing } from '../testing';
import { setGenerated } from './generated';

afterEach(() => {
	setGenerated({});
});

describe('the transport a ConsentProvider selects', () => {
	test("is the hosted backend at the build's URL with no options", () => {
		setGenerated({ projectUrl: 'https://consent.example.com' });
		expect({ ...selectedMode({}) }).toMatchObject({
			projectUrl: 'https://consent.example.com',
			type: 'hosted',
		});
	});

	test('an explicit projectUrl wins', () => {
		setGenerated({ projectUrl: 'https://consent.example.com' });
		expect({ ...selectedMode({ projectUrl: '/api/inth' }) }).toMatchObject({
			projectUrl: '/api/inth',
		});
	});

	test('testing() selects its own transport, with or without a backend URL', () => {
		const mode = testing();
		expect(selectedMode({ mode, projectUrl: '/api/inth' })).toBe(
			mode.transport
		);
		expect(selectedMode({ mode })).toBe(mode.transport);
	});

	test('hosted() selects the hosted backend', () => {
		expect({
			...selectedMode({ mode: hosted(), projectUrl: '/api/inth' }),
		}).toMatchObject({ projectUrl: '/api/inth' });
	});

	test('is none when no URL is known', () => {
		expect(selectedMode({})).toBeUndefined();
	});
});
