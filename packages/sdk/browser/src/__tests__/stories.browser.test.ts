/**
 * Every consent banner and dialog story of the script tag renders its surface: the
 * banner in its placement, or the dialog open over the page. The stories
 * carry React's names (`fixtures/stories.ts`).
 */
import { clearBrowserConsentStorage } from '@inth/conformance/suite';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';

import type { ConsentClient } from '../types';
import { mountStory, CONSENT_STORIES } from './fixtures/stories';

const clients: ConsentClient[] = [];

afterEach(async () => {
	for (const client of clients.splice(0)) {
		client.dispose();
	}
	clearBrowserConsentStorage();
	document.body.replaceChildren();
	await page.viewport(1280, 800);
});

const start = async (name: string, phone = false): Promise<ConsentClient> => {
	if (phone) {
		await page.viewport(390, 800);
	}
	const client = await mountStory(name);
	clients.push(client);
	return client;
};

const find = (client: ConsentClient, testId: string) =>
	client.ui?.root.querySelector(`[data-testid="${testId}"]`) ?? null;

const stories = Object.entries(CONSENT_STORIES);
const openDialogs = stories.filter(
	([, story]) => story.group === 'Dialog' && !story.flow
);
const banners = stories.filter(
	([, story]) => story.group === 'Banner' || story.flow
);

describe('consent stories', () => {
	test.each(banners)(
		'%s shows the banner in its placement',
		async (name, story) => {
			const client = await start(name, story.phone);
			await vi.waitFor(() =>
				expect(find(client, 'consent-banner-root')).not.toBeNull()
			);
			expect(
				find(client, 'consent-banner-root')?.getAttribute('data-placement')
			).toMatch(new RegExp(`^${story.container.type}-`, 'u'));
		}
	);

	test.each(openDialogs)('%s opens the dialog', async (name, story) => {
		const client = await start(name, story.phone);
		await vi.waitFor(() =>
			expect(find(client, 'consent-dialog-root')).not.toBeNull()
		);
	});
});
