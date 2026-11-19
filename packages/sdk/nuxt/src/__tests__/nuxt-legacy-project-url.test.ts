/**
 * The c15t project URL variables on a running server, applied the way Nuxt
 * applies the Inth ones.
 */
import { describe, expect, test } from 'vitest';

import { applyLegacyProjectUrl } from '../runtime/server/legacy-project-url';

const VARIABLES = [
	{
		legacy: 'NUXT_PUBLIC_C15T_BACKEND_URL',
		name: 'NUXT_PUBLIC_INTH_PROJECT_URL',
		scope: 'public',
	},
	{
		legacy: 'NUXT_C15T_BACKEND_URL',
		name: 'NUXT_INTH_PROJECT_URL',
		scope: 'server',
	},
] as const;

const config = () => ({
	inth: { projectUrl: '' },
	public: { inth: { projectUrl: 'https://build.example.com' } },
});

describe('applyLegacyProjectUrl', () => {
	test('a c15t name alone replaces the URL', () => {
		const runtimeConfig = config();
		applyLegacyProjectUrl(
			runtimeConfig,
			{
				NUXT_C15T_BACKEND_URL: 'https://private.example.com',
				NUXT_PUBLIC_C15T_BACKEND_URL: 'https://inth.example.com',
			},
			VARIABLES
		);
		expect(runtimeConfig.public.inth.projectUrl).toBe(
			'https://inth.example.com'
		);
		expect(runtimeConfig.inth.projectUrl).toBe('https://private.example.com');
	});

	test('loses to the Inth name, which Nuxt applies itself', () => {
		const runtimeConfig = config();
		applyLegacyProjectUrl(
			runtimeConfig,
			{
				NUXT_PUBLIC_C15T_BACKEND_URL: 'https://inth.example.com',
				NUXT_PUBLIC_INTH_PROJECT_URL: 'https://inth.example.com',
			},
			VARIABLES
		);
		expect(runtimeConfig.public.inth.projectUrl).toBe(
			'https://build.example.com'
		);
	});

	test('treats an empty value as unset', () => {
		const runtimeConfig = config();
		applyLegacyProjectUrl(
			runtimeConfig,
			{ NUXT_PUBLIC_C15T_BACKEND_URL: '' },
			VARIABLES
		);
		expect(runtimeConfig.public.inth.projectUrl).toBe(
			'https://build.example.com'
		);
	});

	test('applies only the variables the module lists', () => {
		const runtimeConfig = config();
		applyLegacyProjectUrl(
			runtimeConfig,
			{ NUXT_PUBLIC_C15T_BACKEND_URL: 'https://inth.example.com' },
			VARIABLES.slice(1)
		);
		expect(runtimeConfig.public.inth.projectUrl).toBe(
			'https://build.example.com'
		);
	});
});
