/**
 * Page-side observer for the consent gate.
 *
 * Adapted from CookieBench's `installObserver`
 * (`packages/runner/src/browser-observer.ts`, inthhq/cookiebench), so the gate
 * times the same moments CookieBench reports:
 *
 * - `visibleAt` (`banner.visible`): the first animation frame in which the
 *   banner root has a rendered footprint: some area in the viewport, no
 *   `display: none`, `visibility: hidden` or zero opacity on it or an
 *   ancestor.
 * - `input`: the trusted `pointerdown` on the armed control, or the
 *   trusted Enter `keydown` that activates it from the keyboard
 *   (`event.timeStamp`); every action metric is measured from it.
 * - `dismissedAt` (`action.dismissed`): the first frame after the input in
 *   which the banner has no footprint and no blocking overlay remains.
 * - `effectiveAt` (`action.consent-effective`): the first frame after the
 *   input in which the bridge's `allowedCategories` equals the categories
 *   the action grants and consent is no longer `unset`.
 * - `preferencesVisibleAt` (`action.preferences-visible`): the first frame
 *   after the input in which the preferences panel has a footprint.
 * - Event Timing entries (`action.input-to-next-paint`) and
 *   largest-contentful-paint (`page.lcp`) are collected as CookieBench does.
 *
 * It is a string, not a function, for the reason given on
 * `benchPerformanceObserverScript` in `browser.ts`: transpiled functions
 * carry `__name` helpers that do not exist in the page.
 */
export interface GateObserverConfig {
	banner: string;
	overlay: string;
	preferencesPanel: string;
	primaryContent: string;
	stateGlobal: string;
	acceptCategories: readonly string[];
}

export interface GateObservations {
	visibleAt?: number;
	fcp?: number;
	lcp?: number;
	lcpElementId?: string;
	input?: { at: number; type: string };
	inputEvents: { at: number; type: string }[];
	dismissedAt?: number;
	effectiveAt?: number;
	preferencesVisibleAt?: number;
	events: {
		name: string;
		startTime: number;
		duration: number;
		interactionId: number;
	}[];
	scripts: { id: string; category: string; at: number }[];
	consent?: string;
	allowedCategories: string[];
	heroComplete: boolean;
}

export const gateObserverScript = function gateObserverScript(
	config: GateObserverConfig
): string {
	return `(() => {
	if (window !== window.top) return;
	const config = ${JSON.stringify(config)};
	const observations = {
		events: [],
		inputEvents: [],
		scripts: [],
		allowedCategories: [],
		heroComplete: false,
	};
	let armedSelector;
	let armedAction;
	const shadowRoots = new Set();
	const nativeAttachShadow = Element.prototype.attachShadow;
	Element.prototype.attachShadow = function attachShadow(init) {
		const root = nativeAttachShadow.call(this, init);
		if (this.shadowRoot === root) shadowRoots.add(root);
		return root;
	};
	const roots = () => [document, ...[...shadowRoots].filter((root) => root.host.isConnected)];
	const query = (selector) => {
		for (const root of roots()) {
			const found = root.querySelector(selector);
			if (found) return found;
		}
		return null;
	};
	const queryAll = (selector) => roots().flatMap((root) => [...root.querySelectorAll(selector)]);
	const presence = (element, ignoreOpacity) => {
		const hidden = { visible: false, intercepts: false };
		if (!element || !element.isConnected) return hidden;
		let intercepts = true;
		let ancestor = element;
		while (ancestor) {
			const style = getComputedStyle(ancestor);
			if (
				style.display === 'none' ||
				style.visibility === 'hidden' ||
				style.visibility === 'collapse' ||
				(!ignoreOpacity && Number(style.opacity) === 0) ||
				style.contentVisibility === 'hidden'
			) return hidden;
			if (ancestor === element) intercepts = style.pointerEvents !== 'none';
			ancestor = ancestor.parentElement || (ancestor.getRootNode() instanceof ShadowRoot ? ancestor.getRootNode().host : null);
		}
		const rect = element.getBoundingClientRect();
		const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.left < innerWidth && rect.top < innerHeight;
		return { visible, intercepts };
	};
	const blocking = (element) => {
		const seen = presence(element, true);
		return seen.visible && seen.intercepts;
	};
	const observe = (type, collect, extra) => {
		try {
			new PerformanceObserver((list) => collect(list.getEntries())).observe({ type, buffered: true, ...(extra || {}) });
		} catch {}
	};
	observe('paint', (entries) => {
		for (const entry of entries) {
			if (entry.name === 'first-contentful-paint') observations.fcp = entry.startTime;
		}
	});
	observe('largest-contentful-paint', (entries) => {
		for (const entry of entries) {
			observations.lcp = entry.startTime;
			observations.lcpElementId = entry.element ? entry.element.id : undefined;
		}
	});
	observe('event', (entries) => {
		for (const entry of entries) {
			observations.events.push({
				name: entry.name,
				startTime: entry.startTime,
				duration: entry.duration,
				interactionId: entry.interactionId,
			});
		}
	}, { durationThreshold: 16 });
	const onInput = (event) => {
		if (!armedSelector || !event.isTrusted) return;
		const control = query(armedSelector);
		if (!control || !event.composedPath().includes(control)) return;
		const input = { at: event.timeStamp, type: event.type };
		observations.inputEvents.push(input);
		const starts = event.type === 'pointerdown' || (event.type === 'keydown' && event.key === 'Enter');
		if (starts && !observations.input) observations.input = input;
	};
	for (const name of ['pointerdown', 'pointerup', 'keydown', 'click']) {
		document.addEventListener(name, onInput, { capture: true, passive: true });
	}
	const tick = () => {
		const at = performance.now();
		const awaitingDismissal = observations.input !== undefined && observations.dismissedAt === undefined;
		if (observations.visibleAt === undefined || awaitingDismissal) {
			const banner = presence(query(config.banner));
			if (banner.visible) {
				if (observations.visibleAt === undefined) observations.visibleAt = at;
			} else if (
				awaitingDismissal &&
				armedAction === 'accept' &&
				!queryAll(config.overlay).some(blocking)
			) {
				observations.dismissedAt = at;
			}
		}
		if (
			armedAction === 'preferences' &&
			observations.input &&
			observations.preferencesVisibleAt === undefined &&
			presence(query(config.preferencesPanel)).visible
		) {
			observations.preferencesVisibleAt = at;
		}
		const state = window[config.stateGlobal];
		if (state && Array.isArray(state.allowedCategories) && Array.isArray(state.scripts)) {
			observations.consent = state.consent;
			observations.allowedCategories = [...state.allowedCategories];
			observations.scripts = state.scripts.map((script) => ({ ...script }));
			if (
				armedAction === 'accept' &&
				observations.input &&
				observations.effectiveAt === undefined &&
				state.consent !== 'unset' &&
				[...state.allowedCategories].filter((category) => config.acceptCategories.includes(category)).sort().join(',') ===
					[...config.acceptCategories].sort().join(',')
			) {
				observations.effectiveAt = at;
			}
		}
		const hero = query(config.primaryContent);
		observations.heroComplete = Boolean(hero && hero.complete && hero.naturalWidth > 0);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	window.__inthGate = {
		arm(selector, action) {
			armedSelector = selector;
			armedAction = action;
		},
		observations,
	};
})();`;
};
