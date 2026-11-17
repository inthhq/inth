/**
 * The Svelte provider's transport: a backend URL alone is the hosted
 * backend, defaulting to the URL `consentManifest()` read, as Vue's does.
 */
import { afterEach, describe, expect, test } from 'vitest';

import { selectedMode } from '../select-mode';
import { withoutNetwork } from '../testing';
import { setGenerated } from './generated';

afterEach(() => {
	setGenerated({});
});

describe('the transport a ConsentProvider selects', () => {
	test("is the hosted backend at the build's URL with no options", () => {
		setGenerated({ backendURL: 'https://consent.example.com' });
		expect({ ...selectedMode({}) }).toMatchObject({
			backendURL: 'https://consent.example.com',
			type: 'hosted',
		});
	});

	test('an explicit backendURL wins', () => {
		setGenerated({ backendURL: 'https://consent.example.com' });
		expect({ ...selectedMode({ backendURL: '/api/c15t' }) }).toMatchObject({
			backendURL: '/api/c15t',
		});
	});

	test('a testing value wins over the backend URL', () => {
		const testing = withoutNetwork();
		expect(selectedMode({ backendURL: '/api/c15t', testing })).toBe(
			testing.transport
		);
	});

	test('is none when no URL is known', () => {
		expect(selectedMode({})).toBeUndefined();
	});
});
