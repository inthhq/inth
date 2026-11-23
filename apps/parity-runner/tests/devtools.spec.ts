/* oxlint-disable no-await-in-loop -- Each capture navigates the same browser page and compares against the preceding React render. */
import { diffComputedStyleMap } from '@inth/conformance';
import { expect, test } from '@playwright/test';

import { captureComputedStyleMap } from '../src/diff-computed-style';
import { captureDomSnapshot } from '../src/diff-dom';
import type { StoryEntry } from '../src/pair-stories';
import { comparePng } from '../src/pixel-diff';
import { loadStorybookIndex } from '../src/storybook-index';

const urls: Record<string, string> = {
	angular: process.env.ANGULAR_STORYBOOK_URL ?? 'http://127.0.0.1:6011',
	astro: process.env.ASTRO_STORYBOOK_URL ?? 'http://127.0.0.1:6010',
	react: process.env.REACT_STORYBOOK_URL ?? 'http://127.0.0.1:6006',
	svelte: process.env.SVELTE_STORYBOOK_URL ?? 'http://127.0.0.1:6007',
	vue: process.env.VUE_STORYBOOK_URL ?? 'http://127.0.0.1:6008',
};
const frameworks = (process.env.PARITY_FRAMEWORKS ?? 'react,svelte,vue')
	.split(',')
	.map((value) => value.trim())
	// `in` would also accept `toString` and friends off the prototype.
	.filter((value) => Object.hasOwn(urls, value))
	.sort((left, right) => Number(right === 'react') - Number(left === 'react'));
const tabs = [
	'Consents',
	'Scripts',
	'Location',
	'Policy',
	'IAB',
	'Events',
	'Actions',
] as const;
const rootSelector = '[data-inth-dev-tools]';
/**
 * Chromium can antialias the same rounded corner one level differently
 * between two renders of identical markup, which made the Scripts tab's
 * search field fail at random. Two levels per channel absorbs that; any
 * real colour, font or layout change moves far more, and a size change or
 * a single pixel beyond it still fails.
 */
const PIXEL_BUDGET = { maxRatio: 0, threshold: 2 };

const isDevToolsStory = (story: StoryEntry) =>
	story.title.endsWith('/Core/DevTools') && story.name === 'Default';

/**
 * Each enabled framework's DevTools story, React's first. A framework
 * whose Storybook has none, such as Astro, which ships no DevTools
 * component, is left out rather than failed, so a run that pairs it with
 * React alone has nothing to compare and skips.
 */
const devToolsStories = async function devToolsStories(): Promise<{
	compared: { framework: string; id: string; url: string }[];
	skipped: string[];
}> {
	const compared: { framework: string; id: string; url: string }[] = [];
	const skipped: string[] = [];
	for (const framework of frameworks) {
		const url = urls[framework];
		if (!url) {
			throw new Error(`Missing ${framework} URL`);
		}
		const entry = (await loadStorybookIndex(url)).find(isDevToolsStory);
		if (entry) {
			compared.push({ framework, id: entry.id, url });
		} else {
			skipped.push(framework);
		}
	}
	return { compared, skipped };
};

// All framework renders are captured in the same Chromium run. This avoids
// OS-specific font baselines and deliberately does not use toHaveScreenshot,
// so CI's --ignore-snapshots cannot disable these visual comparisons.
for (const colorScheme of ['light', 'dark'] as const) {
	for (const mobile of [false, true]) {
		test(`DevTools parity: ${colorScheme}, ${mobile ? 'mobile' : 'desktop'}`, async ({
			page,
		}, testInfo) => {
			expect(frameworks).toContain('react');
			const { compared, skipped } = await devToolsStories();
			for (const framework of skipped) {
				testInfo.annotations.push({
					description: `${framework} has no Core/DevTools story`,
					type: 'skip',
				});
			}
			expect(
				compared[0]?.framework,
				'React must include the DevTools comparison story'
			).toBe('react');
			test.skip(
				compared.length < 2,
				`No framework besides React has a DevTools story (skipped: ${skipped.join(', ')})`
			);
			const viewport = mobile
				? { height: 844, width: 390 }
				: { height: 900, width: 1280 };
			await page.setViewportSize(viewport);
			await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
			await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
			const baseline = new Map<
				string,
				{
					image: Buffer;
					dom: string;
					a11y: string;
					styles: Awaited<ReturnType<typeof captureComputedStyleMap>>;
				}
			>();
			for (const { framework, id, url } of compared) {
				await page.goto(`${url}/iframe.html?id=${id}&viewMode=story`, {
					waitUntil: 'networkidle',
				});
				const root = page.locator(rootSelector);
				await expect(root).toHaveCount(1);
				await expect(
					root.getByRole('tab', { exact: true, name: 'Consents' })
				).toBeVisible();
				await page.evaluate(() => document.fonts.ready);
				// The Storybook theme follows the host's .dark class, not media alone.
				await page.evaluate((scheme) => {
					document.documentElement.classList.toggle('dark', scheme === 'dark');
					document.documentElement.style.colorScheme = scheme;
				}, colorScheme);
				await expect(root.locator('.inth-dev-tools__panel')).toHaveCSS(
					'background-color',
					colorScheme === 'dark' ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)'
				);
				for (const tab of [...tabs, 'Launcher']) {
					if (tab === 'Launcher') {
						await root
							.getByRole('button', { name: 'Close Inth DevTools' })
							.click();
					} else {
						await root.getByRole('tab', { exact: true, name: tab }).click();
						if (tab === 'Events') {
							await root.getByRole('button', { name: 'Clear events' }).click();
						}
					}
					// Revisions reflect framework initialization order, not different UI.
					if (tab === 'Policy') {
						await root
							.locator('dt')
							.filter({ hasText: /^Revision$/u })
							.evaluate((label) => {
								if (label.nextElementSibling) {
									label.nextElementSibling.textContent = '0';
								}
							});
					}
					await page.mouse.move(0, 0);
					await root.evaluate((element) => {
						if (element.ownerDocument.activeElement instanceof HTMLElement) {
							element.ownerDocument.activeElement.blur();
						}
					});
					const bounds = await root.boundingBox();
					if (!bounds) {
						throw new Error(`${framework}/${tab} has no visible bounds`);
					}
					expect(bounds.x).toBeGreaterThanOrEqual(0);
					expect(bounds.y).toBeGreaterThanOrEqual(0);
					expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
					expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
					const overflow = await root.evaluate((element) =>
						[
							element,
							...element.querySelectorAll<HTMLElement>(
								'.inth-dev-tools__panel, .inth-dev-tools__tabs, .inth-dev-tools__content'
							),
						].some((item) => item.scrollWidth > item.clientWidth + 1)
					);
					expect(
						overflow,
						`${framework}/${tab} must not overflow horizontally`
					).toBe(false);
					const image = await root.screenshot({ animations: 'disabled' });
					await testInfo.attach(`${framework}-${tab}.png`, {
						body: image,
						contentType: 'image/png',
					});
					const dom = (
						await captureDomSnapshot(page, rootSelector, { includeRoot: true })
					)
						.replace(/inth-dev-tools-\d+/gu, 'inth-dev-tools-instance')
						.replace(/inth-[0-9a-f]{8}\b/gu, 'inth-anonymized-script');
					expect(dom).toContain('data-inth-dev-tools');
					const a11y = await root.ariaSnapshot();
					const styles = await captureComputedStyleMap(page, rootSelector, '*');
					const reference = baseline.get(tab);
					if (!reference) {
						baseline.set(tab, { a11y, dom, image, styles });
						continue;
					}
					expect.soft(dom, `${framework}/${tab} DOM`).toBe(reference.dom);
					expect
						.soft(a11y, `${framework}/${tab} accessibility`)
						.toBe(reference.a11y);
					expect
						.soft(
							diffComputedStyleMap(reference.styles, styles),
							`${framework}/${tab} CSS`
						)
						.toEqual([]);
					const pixels = comparePng(reference.image, image, PIXEL_BUDGET);
					if (!pixels.ok && pixels.diff) {
						await testInfo.attach(`${framework}-${tab}-diff.png`, {
							body: pixels.diff,
							contentType: 'image/png',
						});
					}
					expect
						.soft(
							pixels.ok,
							`${framework}/${tab} pixels must match React (${pixels.reason ?? 'ok'}); see attached images`
						)
						.toBe(true);
				}
			}
		});
	}
}
