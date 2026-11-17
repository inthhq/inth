/**
 * The Svelte provider's transport: a backend URL alone is the hosted
 * backend, defaulting to the URL `consentManifest()` read, as Vue's does.
 */
import { hosted } from '@c15t/core/modes';
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
		expect({ ...selectedMode({ projectUrl: '/api/c15t' }) }).toMatchObject({
			projectUrl: '/api/c15t',
		});
	});

	test('testing() selects its own transport, with or without a backend URL', () => {
		const mode = testing();
		expect(selectedMode({ mode, projectUrl: '/api/c15t' })).toBe(
			mode.transport
		);
		expect(selectedMode({ mode })).toBe(mode.transport);
	});

	test('hosted() selects the hosted backend', () => {
		expect({
			...selectedMode({ mode: hosted(), projectUrl: '/api/c15t' }),
		}).toMatchObject({ projectUrl: '/api/c15t' });
	});

	test('is none when no URL is known', () => {
		expect(selectedMode({})).toBeUndefined();
	});
});
