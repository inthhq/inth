/**
 * Real-browser check that a cross-origin opt-out request started in the same
 * tick as a page navigation still reaches the backend after a delayed CORS
 * preflight.
 */
import { afterEach, expect, it } from 'vitest';

const opened: Window[] = [];

afterEach(async () => {
	for (const tab of opened.splice(0)) {
		tab.close();
	}
	await fetch('/__inth-test__/keepalive-received', { method: 'DELETE' });
});

it('delivers a cross-origin opt-out request sent in the same tick as a navigation', async () => {
	await fetch('/__inth-test__/keepalive-received', { method: 'DELETE' });
	const { origin } = (await (
		await fetch('/__inth-test__/keepalive-origin')
	).json()) as { origin: string | null };
	expect(origin).toBeTruthy();

	const key = '0193e5a8-7c1e-7b7a-9d7e-2f0c9a3b4d5e';
	const params = new URLSearchParams({
		idempotencyKey: key,
		projectUrl: origin as string,
	});
	const tab = window.open(`/__inth-test__/keepalive?${params}`, '_blank');
	if (!tab) {
		throw new Error('The browser blocked the page');
	}
	opened.push(tab);

	await expect
		.poll(
			() => {
				try {
					return tab.location.pathname;
				} catch {
					return '';
				}
			},
			{ timeout: 10_000 }
		)
		.toBe('/__inth-test__/keepalive-done');

	await expect
		.poll(
			async () => {
				const response = await fetch('/__inth-test__/keepalive-received');
				const bodies = (await response.json()) as {
					idempotencyKey?: string;
				}[];
				return bodies.map((body) => body.idempotencyKey);
			},
			{ timeout: 10_000 }
		)
		.toContain(key);
});
