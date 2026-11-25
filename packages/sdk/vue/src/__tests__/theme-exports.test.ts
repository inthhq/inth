import type { Theme as NuxtTheme } from '@inth/vue';
import { defineTheme as defineNuxtTheme } from '@inth/vue';
import { expect, test } from 'vite-plus/test';

import type { Theme } from '../index';
import { defineTheme } from '../index';

test('defines a theme through the Vue plugin entry', () => {
	const theme = {
		colors: { primary: '#2f6f4e' },
	} satisfies Theme;

	expect(defineTheme(theme)).toBe(theme);
});

test('defines a theme through the published Nuxt entry', () => {
	const theme = {
		colors: { primary: '#2f6f4e' },
	} satisfies NuxtTheme;
	expect(defineNuxtTheme(theme)).toBe(theme);
});
