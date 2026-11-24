import { translations as en } from '@inth/sdk-translations/en';
import { describe, expect, test } from 'vite-plus/test';

import {
	ENGLISH_LEGAL_LINK_LABELS,
	resolveLegalLinkEntries,
} from '../legal-links';

describe('resolveLegalLinkEntries', () => {
	test('shows nothing without keys or links', () => {
		expect(resolveLegalLinkEntries({}, null)).toEqual([]);
		expect(resolveLegalLinkEntries(undefined, ['privacyPolicy'])).toEqual([]);
	});

	test('a link that opens in a new tab by default gets noopener noreferrer', () => {
		const [entry] = resolveLegalLinkEntries(
			{ privacyPolicy: { href: '/privacy' } },
			['privacyPolicy']
		);
		expect(entry).toMatchObject({
			rel: 'noopener noreferrer',
			target: '_blank',
		});
	});

	test('a same-tab link gets no rel; a link with its own rel keeps it', () => {
		const entries = resolveLegalLinkEntries(
			{
				cookiePolicy: { href: '/cookies', rel: 'external' },
				privacyPolicy: { href: '/privacy', target: '_self' },
			},
			['privacyPolicy', 'cookiePolicy']
		);
		expect(entries.map(({ rel, target }) => ({ rel, target }))).toEqual([
			{ rel: undefined, target: '_self' },
			{ rel: 'external', target: '_blank' },
		]);
	});

	test('labels fall back from the link to the translation to English', () => {
		const entries = resolveLegalLinkEntries(
			{
				cookiePolicy: { href: '/cookies' },
				privacyPolicy: { href: '/privacy', label: 'Our privacy' },
				termsOfService: { href: '/terms' },
			},
			['privacyPolicy', 'cookiePolicy', 'termsOfService'],
			{ cookiePolicy: 'Cookie-Richtlinie' }
		);
		expect(entries.map((entry) => entry.label)).toEqual([
			'Our privacy',
			'Cookie-Richtlinie',
			'Terms of Service',
		]);
	});

	test('keeps the surface order, skips links without an href and separates all but the last', () => {
		const entries = resolveLegalLinkEntries(
			{
				cookiePolicy: { href: '' },
				privacyPolicy: { href: '/privacy' },
				termsOfService: { href: '/terms' },
			},
			['termsOfService', 'cookiePolicy', 'privacyPolicy']
		);
		expect(entries.map(({ key, separated }) => [key, separated])).toEqual([
			['termsOfService', true],
			['privacyPolicy', false],
		]);
	});

	test('the English labels match the English translations', () => {
		expect(ENGLISH_LEGAL_LINK_LABELS).toEqual(en.legalLinks);
	});
});
