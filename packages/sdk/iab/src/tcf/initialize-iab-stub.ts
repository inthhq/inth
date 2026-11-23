/**
 * IAB TCF `__tcfapi` stub, following the TCF CMP API stub requirements: it
 * answers `ping`, queues every other call until the real CMP loads, and
 * serves `__tcfapiLocator` postMessage calls from child frames.
 *
 * @packageDocumentation
 */

import type { PingData, TCFApi, TCFApiCallback } from '@inth/sdk-core';

import { CMP_VERSION_NUMBER, createPingData } from './cmp-defaults.model';

let stubInitialized = false;
/** The stub this module installed, distinct from a replacement CMP API. */
let ownedStub: TCFApi | null = null;

let locatorIframe: HTMLIFrameElement | null = null;

/**
 * The stub's ping answer. It has no CMP ID or vendor list yet, and reports
 * the default CMP version.
 */
const createStubPingData = (): PingData =>
	createPingData({
		cmpId: 0,
		cmpStatus: 'stub',
		cmpVersion: CMP_VERSION_NUMBER,
		displayStatus: 'hidden',
		gdprApplies: undefined,
		gvlVersion: 0,
		// TCF 2.4 still uses policy version 5
		tcfPolicyVersion: 5,
	});

const createStubApi = function createStubApi(): TCFApi {
	const queue: Parameters<TCFApi>[] = [];

	const stub = ((
		command: string,
		apiVersion: number,
		handler: TCFApiCallback<unknown>,
		parameter?: unknown
	) => {
		if (command === 'ping') {
			(handler as TCFApiCallback<PingData>)(createStubPingData(), true);
		} else {
			queue.push([
				command,
				apiVersion,
				handler,
				parameter,
			] as Parameters<TCFApi>);
		}
	}) as TCFApi;

	stub.queue = queue;

	return stub;
};

/**
 * Child frames, such as ad iframes, find the CMP by looking for an iframe
 * named `__tcfapiLocator` in their parent frames.
 */
const createLocatorIframe =
	function createLocatorIframe(): HTMLIFrameElement | null {
		if (typeof document === 'undefined') {
			return null;
		}

		if (document.querySelector('iframe[name="__tcfapiLocator"]')) {
			return null;
		}

		const iframe = document.createElement('iframe');
		iframe.name = '__tcfapiLocator';
		iframe.style.display = 'none';
		iframe.setAttribute('aria-hidden', 'true');
		iframe.tabIndex = -1;

		const target = document.body ?? document.documentElement;
		target.appendChild(iframe);

		return iframe;
	};

const handlePostMessage = function handlePostMessage(
	event: MessageEvent
): void {
	if (typeof window === 'undefined' || !window.__tcfapi) {
		return;
	}

	const { data } = event;

	if (!data || typeof data !== 'object' || !('__tcfapiCall' in data)) {
		return;
	}

	const call = data.__tcfapiCall as {
		command: string;
		version: number;
		callId: string;
		parameter?: unknown;
	};

	if (!call || !call.command || !call.callId) {
		return;
	}

	(
		window.__tcfapi as (
			command: string,
			version: number,
			handler: TCFApiCallback<unknown>,
			parameter?: unknown
		) => void
	)(
		call.command,
		call.version,
		(returnValue: unknown, success: boolean) => {
			const response = {
				__tcfapiReturn: {
					callId: call.callId,
					returnValue,
					success,
				},
			};

			if (event.source && typeof event.source.postMessage === 'function') {
				(event.source as Window).postMessage(response, '*');
			}
		},
		call.parameter
	);
};

/**
 * Installs a `__tcfapi` stub that queues calls, the `__tcfapiLocator`
 * iframe, and the postMessage handler for calls from child frames. Call it
 * as early as possible, so `__tcfapi` exists before any vendor script runs.
 * A `__tcfapi` already on the page is left in place. `createIAB` calls it
 * on mount, and the real CMP API replays the queue once the vendor list
 * loads.
 *
 * @public
 */
export const initializeIABStub = function initializeIABStub(): void {
	if (typeof window === 'undefined') {
		return;
	}

	if (stubInitialized) {
		return;
	}

	if (!window.__tcfapi) {
		ownedStub = createStubApi();
		window.__tcfapi = ownedStub;
	}

	locatorIframe = createLocatorIframe();

	window.addEventListener('message', handlePostMessage);

	stubInitialized = true;
};

/** @public */
export const getStubQueue = function getStubQueue(): Parameters<TCFApi>[] {
	if (typeof window === 'undefined' || !window.__tcfapi) {
		return [];
	}

	return window.__tcfapi.queue ?? [];
};

/** @public */
export const clearStubQueue = function clearStubQueue(): void {
	if (typeof window !== 'undefined' && window.__tcfapi?.queue) {
		window.__tcfapi.queue = [];
	}
};

/**
 * Removes the stub's message handler and locator iframe, and `__tcfapi`
 * while it is still this module's stub.
 *
 * @public
 */
export const destroyIABStub = function destroyIABStub(): void {
	if (typeof window === 'undefined') {
		return;
	}

	window.removeEventListener('message', handlePostMessage);

	if (locatorIframe?.parentNode) {
		locatorIframe.parentNode.removeChild(locatorIframe);
		locatorIframe = null;
	}

	// Remove only our unfulfilled stub; a real CMP may have replaced it.
	if (ownedStub && window.__tcfapi === ownedStub) {
		delete window.__tcfapi;
	}
	ownedStub = null;
	stubInitialized = false;
};
