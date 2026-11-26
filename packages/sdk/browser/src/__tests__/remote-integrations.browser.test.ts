/**
 * Every integration in `@inth/integrations/remote`, sent by a test backend
 * as the Inth server would (`fixtures/remote-integrations-list.ts`), through
 * the built `inth.js` in Chromium. Vendor hosts are answered in the browser
 * with empty JavaScript, so each vendor's tag loads without the test
 * reaching the vendor.
 *
 * On a failure the message is a table of every integration's state.
 */
import { afterEach, beforeAll, beforeEach, expect, it } from 'vite-plus/test';
import { commands } from 'vite-plus/test/browser';

import type { RemoteIntegrationList } from './fixtures/remote-integrations-list';
import {
	KNOWN_GAPS,
	acceptedRows,
	alwaysLoads,
	deniedRows,
	failingKeys,
	fetchRemoteIntegrations,
	formatRows,
	settle,
	unexpectedRequests,
	vendorSrc,
} from './fixtures/remote-integrations-report';
import type {
	DebugEvent,
	PageState,
	ZarazCalls,
} from './fixtures/remote-integrations-report';

type PageWindow = Window & {
	__adaStarts?: PageState['adaStarts'];
	__debug: DebugEvent[];
	__zaraz: ZarazCalls;
	inth: { getSnapshot: () => { explicitChoice: unknown } };
};

const frames: HTMLIFrameElement[] = [];

const clearStorage = function clearStorage(): void {
	localStorage.clear();
	sessionStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
};

/** The fixture page with `inth.js` pointed at the every-integration backend. */
const open = async function open(): Promise<PageWindow> {
	const frame = document.createElement('iframe');
	frame.src = '/__inth-init__/page?remote=all';
	frame.style.width = '800px';
	frame.style.height = '600px';
	frames.push(frame);
	document.body.append(frame);
	await new Promise((resolve) => {
		frame.addEventListener('load', resolve, { once: true });
	});
	return frame.contentWindow as PageWindow;
};

const bannerButton = (
	win: PageWindow,
	action: 'accept' | 'reject'
): HTMLButtonElement | null =>
	win.document
		.querySelector('[data-inth-ui]')
		?.shadowRoot?.querySelector<HTMLButtonElement>(
			`[data-testid="consent-banner-${action}-button"]`
		) ?? null;

/** Whether the page holds a choice the visitor made. */
const chose = (win: PageWindow): boolean =>
	win.inth.getSnapshot().explicitChoice !== null;

const scriptSrcs = (win: PageWindow): string[] =>
	[...win.document.querySelectorAll('script')].map((tag) => tag.src);

/** Everything the rows read, with the files fetched since the last read. */
const readPage = async function readPage(
	win: PageWindow,
	distFiles: string[],
	thirdParty: string[]
): Promise<PageState> {
	const requests = await commands.takeRequests();
	distFiles.push(...requests.dist);
	thirdParty.push(...requests.thirdParty);
	return {
		adaStarts: [...(win.__adaStarts ?? [])],
		debug: [...win.__debug],
		distFiles,
		scriptSrcs: scriptSrcs(win),
		thirdParty,
		zarazCalls: [...win.__zaraz],
	};
};

let list: RemoteIntegrationList;

beforeAll(async () => {
	await commands.watchRequests();
	list = await fetchRemoteIntegrations();
});

beforeEach(async () => {
	clearStorage();
	await commands.takeRequests();
});

afterEach(() => {
	for (const frame of frames.splice(0)) {
		frame.remove();
	}
	clearStorage();
});

it('builds an entry for every remote integration', () => {
	expect(list.unbuilt).toEqual([]);
	// A sudden drop means the catalogue lost entries, and this test with it.
	expect(list.integrations.length).toBeGreaterThan(60);
});

it('loads every integration the Inth server lists after an accept, with each runtime and adapter file it needs', async () => {
	const win = await open();
	await expect
		.poll(() => bannerButton(win, 'accept'), { timeout: 8000 })
		.not.toBeNull();
	bannerButton(win, 'accept')?.click();
	await expect.poll(() => chose(win), { timeout: 8000 }).toBe(true);

	const distFiles: string[] = [];
	const thirdParty: string[] = [];
	await settle(
		async () =>
			failingKeys(
				acceptedRows(list, await readPage(win, distFiles, thirdParty))
			).every((key) => key in KNOWN_GAPS),
		15_000
	);

	const rows = acceptedRows(list, await readPage(win, distFiles, thirdParty));
	expect(failingKeys(rows), `\n${formatRows(rows)}`).toEqual(
		Object.keys(KNOWN_GAPS)
	);
}, 45_000);

it('loads only the integrations whose manifests may load before a choice, before one and after a reject', async () => {
	const win = await open();
	await expect
		.poll(() => bannerButton(win, 'reject'), { timeout: 8000 })
		.not.toBeNull();
	const distFiles: string[] = [];
	const thirdParty: string[] = [];
	const early = list.integrations.filter(alwaysLoads);
	// The ones that may load do so before a choice.
	await settle(() => {
		const srcs = scriptSrcs(win);
		return early.every((entry) => {
			const src = vendorSrc(entry);
			return src === undefined || srcs.includes(src);
		});
	}, 15_000);
	// Time for anything that should not load to show up.
	await new Promise((resolve) => {
		setTimeout(resolve, 1000);
	});
	const before = await readPage(win, distFiles, thirdParty);
	const beforeRows = deniedRows(list, before);
	expect(failingKeys(beforeRows), `\n${formatRows(beforeRows)}`).toEqual([]);
	expect(unexpectedRequests(list, before)).toEqual([]);

	bannerButton(win, 'reject')?.click();
	await expect.poll(() => chose(win), { timeout: 8000 }).toBe(true);
	await new Promise((resolve) => {
		setTimeout(resolve, 1000);
	});
	const after = await readPage(win, distFiles, thirdParty);
	const afterRows = deniedRows(list, after);
	expect(failingKeys(afterRows), `\n${formatRows(afterRows)}`).toEqual([]);
	expect(unexpectedRequests(list, after)).toEqual([]);
	// Some manifests may load before a choice, so the test checks both sides.
	expect(early.length).toBeGreaterThan(0);
	expect(early.length).toBeLessThan(list.integrations.length);
}, 45_000);
