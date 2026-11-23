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
import { connectConsentSource } from '../../runtime/controls';
import type { ExternalConsentSource } from '../../runtime/consent-runtime.model';
import { isOptOutConfirmationOpen, optOutConsentSurface } from '../opt-out';

const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
});

/** A kernel under an opt-out rule whose permissions an external CMP owns. */
const createExternalKernel = () => {
	const kernel = createConsentKernel({
		initialExternalPermissions: {},
		initialPolicyResolution: matchedResolution(
			optOutRule({ categories: ['marketing', 'measurement'] })
		),
		now: NOW,
	});
	const openPreferences = vi.fn();
	const source: ExternalConsentSource = {
		getPermissions: () => ({ marketing: true, measurement: true }),
		openPreferences,
		subscribe: () => () => undefined,
	};
	const disconnect = connectConsentSource(kernel, source);
	cleanups.push(disconnect, () => kernel.dispose());
	return { kernel, openPreferences };
};

describe('optOutConsentSurface under an external consent source', () => {
	it("opens the source's preferences once and records no opt-out here", async () => {
		const { kernel, openPreferences } = createExternalKernel();
		const optOutCommand = vi.spyOn(kernel.commands, 'optOut');
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		const result = await optOutConsentSurface(kernel);

		expect(result).toEqual({ ok: false, reason: 'not-available' });
		expect(openPreferences).toHaveBeenCalledOnce();
		expect(optOutCommand).not.toHaveBeenCalled();
		expect(recorded).not.toHaveBeenCalled();
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().activeUI).toBe('none');
		expect(isOptOutConfirmationOpen(kernel)).toBe(false);
	});
});
