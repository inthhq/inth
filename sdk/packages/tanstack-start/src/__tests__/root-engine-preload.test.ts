/**
 * The server leaves an engine preload after the boot data for a visitor the
 * engine must serve at once. The snapshot decides for most roots; a root
 * whose options need the engine from its first render, such as one with a
 * network blocker, is preloaded whatever the banner shows, since the
 * browser renders it eagerly and the blocker must be in place before the
 * page's code sends a request.
 */
import { offline } from '@c15t/core/modes';
import { createElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { expect, test } from 'vitest';

import { optInRule } from '../../../core/src/__tests__/fixtures/kernel-fixtures';
import { ConsentRoot } from '../root';
import type { ConsentRootProps } from '../root';
import { resolveConsent } from '../server';

/** A fresh visitor the banner asks to choose: the engine can wait. */
const choiceState = () =>
	resolveConsent({
		mode: offline({ acknowledgeNoRecords: true, policyRules: [optInRule()] }),
		request: new Request('https://app.example.com/'),
	});

const render = async (
	props: Partial<ConsentRootProps> = {}
): Promise<string> => {
	const stream = await renderToReadableStream(
		createElement(
			ConsentRoot,
			{ ...props, state: await choiceState() },
			createElement('main', { id: 'page' }, 'Page')
		)
	);
	await stream.allReady;
	return new Response(stream).text();
};

/** Whether the script after the boot data preloads the engine's chunks. */
const hasEnginePreload = (html: string): boolean =>
	/<script data-c15t-boot[^>]*>[^<]*<\/script><script[^>]*>[^<]*c15t-engine-chunks[^<]*<\/script>/u.test(
		html
	);

test('a choice banner leaves the engine preload out', async () => {
	const html = await render();
	expect(html).toContain('data-c15t-boot');
	expect(hasEnginePreload(html)).toBe(false);
});

test('a root with a network blocker preloads the engine whatever the banner shows', async () => {
	const html = await render({ networkBlocker: { rules: [] } });
	expect(hasEnginePreload(html)).toBe(true);
	// Turned off, the blocker asks nothing of the engine.
	expect(
		hasEnginePreload(
			await render({ networkBlocker: { enabled: false, rules: [] } })
		)
	).toBe(false);
});
