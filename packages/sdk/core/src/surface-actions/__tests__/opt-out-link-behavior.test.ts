/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	matchedResolution,
	NOW,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { createConsentKernel } from '../../kernel';
import {
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
} from '../../libs/page-globals';
import { EARLY_CONSENT_TAP_SCRIPT } from '../early-tap-script';
import { replayEarlyConsentTaps } from '../early-taps';
import {
	activateOptOutLink,
	closeOptOutConfirmation,
	isOptOutConfirmationOpen,
} from '../opt-out';

const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
	document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
	const host = window as unknown as Record<
		string,
		{ stop?: () => void } | undefined
	>;
	host[EARLY_TAPS_WINDOW_KEY]?.stop?.();
	Reflect.deleteProperty(window, EARLY_TAPS_WINDOW_KEY);
});

const createOptOutKernel = () => {
	const kernel = createConsentKernel({
		initialPolicyResolution: matchedResolution(
			optOutRule({
				categories: ['functionality', 'marketing', 'measurement'],
				prompt: 'notice',
			})
		),
		now: NOW,
	});
	cleanups.push(
		() => closeOptOutConfirmation(kernel),
		() => kernel.dispose()
	);
	return kernel;
};

describe('activateOptOutLink', () => {
	it('opens the preference dialog and records nothing for privacy-choices', () => {
		const kernel = createOptOutKernel();
		const optOutSpy = vi.spyOn(kernel.commands, 'optOut');

		const result = activateOptOutLink(kernel, 'privacy-choices', {
			uiSource: 'banner',
		});

		expect(result).toBeUndefined();
		expect(optOutSpy).not.toHaveBeenCalled();
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().activeUI).toBe('dialog');
		expect(isOptOutConfirmationOpen(kernel)).toBe(false);
	});

	it('records an opt-out in one click and opens confirmation for do-not-sell', async () => {
		const kernel = createOptOutKernel();

		const result = await activateOptOutLink(kernel, 'do-not-sell', {
			uiSource: 'banner',
		});

		expect(result?.ok).toBe(true);
		expect(kernel.getSnapshot().optOut?.method).toBe('button');
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().activeUI).not.toBe('dialog');
		expect(isOptOutConfirmationOpen(kernel)).toBe(true);
	});
});

describe('early tap replay for privacy-choices banner link', () => {
	it('opens the dialog and records no opt-out when data-opt-out-variant is privacy-choices', async () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<div data-testid="consent-banner-root" data-model="opt-out" data-prompt="notice"><button type="button" data-action="right" data-right="opt-out" data-opt-out-variant="privacy-choices">Your Privacy Choices</button></div>';
		document.body.append(container);
		cleanups.push(() => container.remove());
		// oxlint-disable-next-line no-new-func -- Runs the inline script as server HTML would.
		new Function(EARLY_CONSENT_TAP_SCRIPT)();
		container
			.querySelector<HTMLButtonElement>('[data-right="opt-out"]')
			?.click();

		// Opening preferences does not hide the banner ahead of hydration.
		expect(document.getElementById(EARLY_TAP_STYLE_ID)).toBeNull();

		const kernel = createOptOutKernel();
		const stop = replayEarlyConsentTaps(kernel, { started: () => true });
		cleanups.push(stop);

		await vi.waitFor(() => {
			expect(kernel.getSnapshot().activeUI).toBe('dialog');
		});
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(isOptOutConfirmationOpen(kernel)).toBe(false);
	});
});
