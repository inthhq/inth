/**
 * The shared surface DOM controllers, in jsdom. jsdom has no layout, so
 * geometry is checked through the pure reveal maths and stubbed rects.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	afterMotion,
	attachBackdropGuard,
	attachLiveRegion,
	attachPageBlock,
	attachScrollFades,
	attachThemeSwitchGuard,
	attachTopLayerTrap,
	disclosureRevealDelta,
	nextTopLayerStop,
	readScrollFades,
	revealDelta,
	revealInScrollBody,
	scheduleReveal,
	switchThemeWithoutTransitions,
	THEME_SWITCHING_ATTRIBUTE,
} from '~/primitives/surface';

const tab = (shiftKey = false): KeyboardEvent => {
	const event = new KeyboardEvent('keydown', {
		bubbles: true,
		cancelable: true,
		composed: true,
		key: 'Tab',
		shiftKey,
	});
	(document.activeElement ?? document.body).dispatchEvent(event);
	return event;
};

const card = function card(id: string): HTMLElement {
	const element = document.createElement('div');
	element.id = id;
	element.innerHTML = `
		<h2 tabindex="-1" data-title>Title</h2>
		<button data-a>A</button>
		<button data-b>B</button>
		<button data-c disabled>C</button>
	`;
	return element;
};

const deepActive = (): Element | null => {
	let active = document.activeElement;
	while (active?.shadowRoot?.activeElement) {
		active = active.shadowRoot.activeElement;
	}
	return active;
};

beforeEach(() => {
	document.body.innerHTML = '';
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('top-layer trap', () => {
	test('[FOC-01] Shift+Tab from a focused tabindex=-1 title stays in the layer', () => {
		const layer = card('main');
		document.body.append(document.createElement('button'), layer);
		const title = layer.querySelector<HTMLElement>('[data-title]');
		const stop = attachTopLayerTrap(layer, { initialFocus: title });
		expect(document.activeElement).toBe(title);
		const event = tab(true);
		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(layer.querySelector('[data-b]'));
		stop();
	});

	test('[FOC-01] Tab from the title moves to the next tabbable in document order', () => {
		const layer = card('main');
		document.body.append(layer);
		const title = layer.querySelector<HTMLElement>('[data-title]');
		const stop = attachTopLayerTrap(layer, { initialFocus: title });
		tab();
		expect(document.activeElement).toBe(layer.querySelector('[data-a]'));
		stop();
	});

	test('[FOC-01] Tab wraps from the last to the first, skipping disabled controls', () => {
		const layer = card('main');
		document.body.append(layer);
		const stop = attachTopLayerTrap(layer);
		layer.querySelector<HTMLElement>('[data-b]')?.focus();
		tab();
		expect(document.activeElement).toBe(layer.querySelector('[data-a]'));
		tab(true);
		expect(document.activeElement).toBe(layer.querySelector('[data-b]'));
		stop();
	});

	test('[NEST-03] only the top layer traps; closing it hands the trap back and returns focus', () => {
		const main = card('main');
		const sheet = card('sheet');
		document.body.append(main, sheet);
		const opener = main.querySelector<HTMLElement>('[data-b]');
		const stopMain = attachTopLayerTrap(main);
		const stopSheet = attachTopLayerTrap(sheet, {
			initialFocus: 'first-tabbable',
			returnFocus: () => opener,
		});
		expect(document.activeElement).toBe(sheet.querySelector('[data-a]'));
		expect(nextTopLayerStop(sheet, opener, false)).toBe(
			sheet.querySelector('[data-a]')
		);
		stopSheet();
		expect(document.activeElement).toBe(opener);
		tab();
		expect(document.activeElement).toBe(main.querySelector('[data-a]'));
		stopMain();
	});

	test('[FOC-01] works inside a shadow root', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const root = host.attachShadow({ mode: 'open' });
		const layer = card('shadow');
		root.append(layer);
		const stop = attachTopLayerTrap(layer, {
			initialFocus: layer.querySelector<HTMLElement>('[data-title]'),
		});
		const event = new KeyboardEvent('keydown', {
			bubbles: true,
			cancelable: true,
			composed: true,
			key: 'Tab',
			shiftKey: true,
		});
		layer.querySelector('[data-title]')?.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(deepActive()).toBe(layer.querySelector('[data-b]'));
		stop();
	});
});

describe('page block', () => {
	test('[FOC-02] everything outside the surface is inert until release', () => {
		const page = document.createElement('main');
		const ownInert = document.createElement('aside');
		ownInert.setAttribute('inert', '');
		const host = document.createElement('div');
		const surface = document.createElement('section');
		const sibling = document.createElement('div');
		host.append(surface, sibling);
		document.body.append(page, ownInert, host);

		const release = attachPageBlock(surface, { scrollLock: false });
		expect(page.hasAttribute('inert')).toBe(true);
		expect(sibling.hasAttribute('inert')).toBe(true);
		expect(surface.hasAttribute('inert')).toBe(false);
		expect(host.hasAttribute('inert')).toBe(false);
		release();
		expect(page.hasAttribute('inert')).toBe(false);
		expect(sibling.hasAttribute('inert')).toBe(false);
		// A page's own inert is not ours to clear.
		expect(ownInert.hasAttribute('inert')).toBe(true);
	});

	test('blocks from inside a shadow root, around its host', () => {
		const page = document.createElement('main');
		const host = document.createElement('div');
		document.body.append(page, host);
		const root = host.attachShadow({ mode: 'open' });
		const banner = document.createElement('div');
		const dialog = document.createElement('div');
		root.append(banner, dialog);
		const release = attachPageBlock(dialog, { scrollLock: false });
		expect(page.hasAttribute('inert')).toBe(true);
		expect(banner.hasAttribute('inert')).toBe(true);
		expect(host.hasAttribute('inert')).toBe(false);
		release();
		expect(page.hasAttribute('inert')).toBe(false);
	});

	test('[PERM-05] the newest block decides, so a dialog opened over a leaving banner is not inert', () => {
		const page = document.createElement('main');
		const banner = document.createElement('div');
		const dialog = document.createElement('div');
		document.body.append(page, banner, dialog);
		const releaseBanner = attachPageBlock(banner, { scrollLock: false });
		expect(dialog.hasAttribute('inert')).toBe(true);
		const releaseDialog = attachPageBlock(dialog, { scrollLock: false });
		expect(dialog.hasAttribute('inert')).toBe(false);
		expect(banner.hasAttribute('inert')).toBe(true);
		releaseBanner();
		expect(dialog.hasAttribute('inert')).toBe(false);
		expect(page.hasAttribute('inert')).toBe(true);
		releaseDialog();
		expect(page.hasAttribute('inert')).toBe(false);
		expect(banner.hasAttribute('inert')).toBe(false);
	});

	test('a node added beside the surface while blocking is inert too', async () => {
		const surface = document.createElement('div');
		document.body.append(surface);
		const release = attachPageBlock(surface, { scrollLock: false });
		const late = document.createElement('div');
		document.body.append(late);
		await Promise.resolve();
		expect(late.hasAttribute('inert')).toBe(true);
		release();
		expect(late.hasAttribute('inert')).toBe(false);
	});

	test('[BNR-13] locks and restores document scrolling', () => {
		const surface = document.createElement('div');
		document.body.append(surface);
		const release = attachPageBlock(surface);
		expect(document.body.style.overflow).toBe('hidden');
		release();
		release();
		expect(document.body.style.overflow).toBe('');
	});
});

describe('live region', () => {
	test('[SR-01] makes the element a polite status region, cleared on open and close', () => {
		const region = document.createElement('div');
		region.textContent = 'stale';
		document.body.append(region);
		const live = attachLiveRegion(region);
		expect(region.getAttribute('role')).toBe('status');
		expect(region.getAttribute('aria-live')).toBe('polite');
		expect(region.textContent).toBe('');
		live.announce('Opted out.');
		expect(region.textContent?.replace('​', '')).toBe('Opted out.');
		live();
		expect(region.textContent).toBe('');
		expect(region.hasAttribute('role')).toBe(false);
		// [SR-02] A closed layer never speaks.
		live.announce('Late.');
		expect(region.textContent).toBe('');
	});

	test('[SR-03] the same message twice changes the text', () => {
		const region = document.createElement('div');
		const live = attachLiveRegion(region);
		live.announce('Saved.');
		const first = region.textContent;
		live.announce('Saved.');
		expect(region.textContent).not.toBe(first);
		live();
	});

	test('keeps a role the markup already set', () => {
		const region = document.createElement('div');
		region.setAttribute('role', 'status');
		const live = attachLiveRegion(region);
		live();
		expect(region.getAttribute('role')).toBe('status');
	});
});

describe('scroll fades', () => {
	const area = (top: number, client: number, height: number) => {
		const element = document.createElement('div');
		Object.defineProperties(element, {
			clientHeight: { configurable: true, value: client },
			scrollHeight: { configurable: true, value: height },
			scrollTop: { configurable: true, value: top, writable: true },
		});
		return element;
	};

	test('[LAY-08] each fade shows only with more content in its direction', () => {
		expect(
			readScrollFades({ clientHeight: 100, scrollHeight: 100, scrollTop: 0 })
		).toEqual({
			bottom: false,
			top: false,
		});
		expect(
			readScrollFades({ clientHeight: 100, scrollHeight: 300, scrollTop: 0 })
		).toEqual({
			bottom: true,
			top: false,
		});
		expect(
			readScrollFades({ clientHeight: 100, scrollHeight: 300, scrollTop: 200 })
		).toEqual({
			bottom: false,
			top: true,
		});
	});

	test('[LAY-08] recomputes on scroll and after a grid-template-rows transition', () => {
		const element = area(0, 100, 300);
		document.body.append(element);
		const stop = attachScrollFades(element);
		expect(element.hasAttribute('data-fade-bottom')).toBe(true);
		expect(element.hasAttribute('data-fade-top')).toBe(false);

		(element as { scrollTop: number }).scrollTop = 120;
		element.dispatchEvent(new Event('scroll'));
		expect(element.hasAttribute('data-fade-top')).toBe(true);

		Object.defineProperty(element, 'scrollHeight', { value: 220 });
		const end = new Event('transitionend', { bubbles: true });
		Object.defineProperty(end, 'propertyName', { value: 'grid-template-rows' });
		element.dispatchEvent(end);
		expect(element.hasAttribute('data-fade-bottom')).toBe(false);

		stop();
		expect(element.hasAttribute('data-fade-top')).toBe(false);
	});
});

describe('scroll reveal', () => {
	const rect = (top: number, bottom: number) => ({ bottom, top });

	test('[LAY-05] nearest: scroll the least, never past the target’s top', () => {
		expect(revealDelta(rect(0, 400), rect(100, 200))).toBe(0);
		expect(revealDelta(rect(0, 400), rect(350, 450))).toBe(58);
		expect(revealDelta(rect(0, 400), rect(100, 900))).toBe(92);
		expect(revealDelta(rect(0, 400), rect(-50, 50))).toBe(-58);
		expect(revealDelta(rect(0, 400), rect(120, 200), 'start')).toBe(112);
	});

	test('[LAY-05] an opened disclosure shows as much as fits without scrolling its trigger out', () => {
		expect(
			disclosureRevealDelta(rect(0, 400), rect(300, 340), rect(340, 380))
		).toBe(0);
		expect(
			disclosureRevealDelta(rect(0, 400), rect(300, 340), rect(340, 500))
		).toBe(108);
		expect(
			disclosureRevealDelta(rect(0, 400), rect(100, 140), rect(140, 900))
		).toBe(92);
	});

	test('[LAY-05] scrolls the body with scrollBy and never calls scrollIntoView', () => {
		const body = document.createElement('div');
		const target = document.createElement('div');
		body.append(target);
		document.body.append(body);
		const scrollBy = vi.fn();
		body.scrollBy = scrollBy as typeof body.scrollBy;
		const scrollIntoView = vi.fn();
		target.scrollIntoView = scrollIntoView;
		vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
			DOMRect.fromRect({ height: 400, y: 0 })
		);
		vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
			DOMRect.fromRect({ height: 100, y: 350 })
		);
		expect(revealInScrollBody(target, { body, reducedMotion: true })).toBe(58);
		expect(scrollBy).toHaveBeenCalledWith({ behavior: 'auto', top: 58 });
		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	test('[PERM-16] a reveal scheduled for a surface that changed does nothing', () => {
		vi.useFakeTimers();
		const reveal = vi.fn();
		let current = true;
		scheduleReveal(reveal, { isCurrent: () => current });
		current = false;
		vi.advanceTimersByTime(230);
		expect(reveal).not.toHaveBeenCalled();
		scheduleReveal(reveal, { isCurrent: () => true });
		vi.advanceTimersByTime(230);
		expect(reveal).toHaveBeenCalledOnce();
	});
});

describe('backdrop guard', () => {
	test('[NEST-05] a backdrop press closes the top layer and the tap’s click does not land underneath', () => {
		vi.useFakeTimers();
		const stage = document.createElement('div');
		const backdrop = document.createElement('div');
		backdrop.dataset.backdrop = '';
		const close = document.createElement('button');
		stage.append(backdrop, close);
		document.body.append(stage);
		const onBackdrop = vi.fn();
		const clicked = vi.fn();
		close.addEventListener('click', clicked);
		const stop = attachBackdropGuard(stage, {
			isBackdrop: (target) => target.hasAttribute('data-backdrop'),
			onBackdrop,
		});

		backdrop.dispatchEvent(
			new Event('pointerdown', { bubbles: true, cancelable: true })
		);
		expect(onBackdrop).toHaveBeenCalledOnce();
		close.click();
		expect(clicked).not.toHaveBeenCalled();

		vi.advanceTimersByTime(460);
		close.click();
		expect(clicked).toHaveBeenCalledOnce();
		stop();
	});

	test('a press elsewhere is left alone', () => {
		const stage = document.createElement('div');
		const button = document.createElement('button');
		stage.append(button);
		document.body.append(stage);
		const onBackdrop = vi.fn();
		const clicked = vi.fn();
		button.addEventListener('click', clicked);
		const stop = attachBackdropGuard(stage, {
			isBackdrop: () => false,
			onBackdrop,
		});
		button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		button.click();
		expect(onBackdrop).not.toHaveBeenCalled();
		expect(clicked).toHaveBeenCalledOnce();
		stop();
	});
});

describe('theme switch guard', () => {
	test('[VIS-06] transitions stay off for two frames around a theme switch', () => {
		vi.useFakeTimers();
		const root = document.createElement('div');
		const frames: FrameRequestCallback[] = [];
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((run) => {
			frames.push(run);
			return frames.length;
		});
		const apply = vi.fn(() => {
			expect(root.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(true);
			root.classList.add('dark');
		});
		switchThemeWithoutTransitions(apply, { root });
		expect(apply).toHaveBeenCalledOnce();
		expect(root.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(true);
		frames.shift()?.(0);
		expect(root.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(true);
		frames.shift()?.(16);
		expect(root.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(false);
	});

	test('[VIS-06] a theme class someone else toggles is guarded too', async () => {
		const root = document.createElement('div');
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
		const stop = attachThemeSwitchGuard({ root });
		root.classList.add('inth-dark');
		await Promise.resolve();
		expect(root.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(true);
		stop();
		expect(root.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(false);
	});
});

describe('reduced motion', () => {
	test('[MOT-03] under reduced motion a timer ends the step, not the animation', () => {
		vi.useFakeTimers();
		const cue = document.createElement('span');
		const done = vi.fn();
		afterMotion(cue, done, { duration: 1700, reducedMotion: true });
		cue.dispatchEvent(new Event('animationend'));
		expect(done).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1700);
		expect(done).toHaveBeenCalledOnce();
	});

	test('with motion, the element’s own end event ends the step once', () => {
		vi.useFakeTimers();
		const panel = document.createElement('div');
		const done = vi.fn();
		afterMotion(panel, done, {
			duration: 200,
			event: 'transitionend',
			property: 'grid-template-rows',
			reducedMotion: false,
		});
		const other = new Event('transitionend');
		Object.defineProperty(other, 'propertyName', { value: 'opacity' });
		panel.dispatchEvent(other);
		expect(done).not.toHaveBeenCalled();
		const end = new Event('transitionend');
		Object.defineProperty(end, 'propertyName', { value: 'grid-template-rows' });
		panel.dispatchEvent(end);
		vi.advanceTimersByTime(1000);
		expect(done).toHaveBeenCalledOnce();
	});

	test('[ARCH-02] a cancelled step never finishes', () => {
		vi.useFakeTimers();
		const done = vi.fn();
		const cancel = afterMotion(document.createElement('div'), done, {
			duration: 100,
			reducedMotion: true,
		});
		cancel();
		vi.advanceTimersByTime(500);
		expect(done).not.toHaveBeenCalled();
	});
});
