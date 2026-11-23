/**
 * The per-kernel surface session store: it follows the kernel without a
 * renderer's help.
 */
import { describe, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	NOW,
	optInRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { createConsentKernel } from '../../kernel';
import { createPreferenceDraft } from '../../preference-draft';
import { showConsentSurface } from '../../surface-actions/rules';
import type { ConsentKernel, ResolvedVendor } from '../../consent-kernel.model';
import { copySurfaceReference } from '../commands';
import { getSurfaceSession } from '../session';

const vendor = (id: string, category: ResolvedVendor['category']) =>
	({
		category,
		id,
		name: id,
		presentable: true,
		privacyPolicyUrl: `https://${id}.example/privacy`,
		source: 'config',
	}) satisfies ResolvedVendor;

const kernelFor = function kernelFor(): ConsentKernel {
	vi.spyOn(Date, 'now').mockReturnValue(NOW);
	return createConsentKernel({
		consentCategories: ['marketing', 'measurement'],
		initialPolicyResolution: matchedResolution(
			optInRule({ categories: ['marketing', 'measurement'] })
		),
		initialVendors: {
			declared: [
				vendor('meta-pixel', 'marketing'),
				vendor('google-analytics', 'measurement'),
			],
			listVersion: '1',
		},
		now: NOW,
		transport: { save: () => Promise.resolve({ ok: true }) },
	});
};

describe('one session per kernel', () => {
	test('the same kernel gets the same session; another kernel its own', () => {
		const kernel = kernelFor();
		expect(getSurfaceSession(kernel)).toBe(getSurfaceSession(kernel));
		expect(getSurfaceSession(kernelFor())).not.toBe(getSurfaceSession(kernel));
	});
});

describe('[PERM-16] the session follows the kernel', () => {
	test('a read never notifies synchronously, even when it catches up with the kernel', async () => {
		const kernel = kernelFor();
		const seen: string[] = [];
		const listener = vi.fn();
		// Subscribed before the session, so it runs before the session's own
		// kernel listener and reads a session that has not caught up yet.
		kernel.subscribe(() => {
			seen.push(getSurfaceSession(kernel).getState().surface);
			expect(listener).not.toHaveBeenCalled();
		});
		getSurfaceSession(kernel).subscribe(listener);
		kernel.set.activeUI('dialog');
		expect(seen).toEqual(['dialog']);
		await Promise.resolve();
		expect(listener).toHaveBeenCalled();
	});

	test('opening the dialog drops the banner’s confirmation and moves the token', () => {
		const kernel = kernelFor();
		kernel.set.activeUI('banner');
		const session = getSurfaceSession(kernel);
		session.openConfirmation('sale');
		const listener = vi.fn();
		session.subscribe(listener);
		const { token } = session.getState();

		showConsentSurface(kernel, 'dialog');
		expect(listener).toHaveBeenCalled();
		expect(session.getState()).toMatchObject({
			confirmation: null,
			surface: 'dialog',
		});
		expect(session.isCurrent(token)).toBe(false);
	});

	test('a confirmation left open in the dialog does not reappear in the returning banner', () => {
		const kernel = kernelFor();
		showConsentSurface(kernel, 'dialog');
		const session = getSurfaceSession(kernel);
		session.openConfirmation('sale');
		session.toggleReceipt(true);
		showConsentSurface(kernel, 'none');
		expect(kernel.getSnapshot().activeUI).toBe('banner');
		expect(session.getState()).toMatchObject({
			confirmation: null,
			receiptOpen: false,
		});
	});

	test('[CLIP-02] a copy result landing after the dialog closed is ignored', async () => {
		const kernel = kernelFor();
		showConsentSurface(kernel, 'dialog');
		const session = getSurfaceSession(kernel);
		let reject: (error: Error) => void = () => undefined;
		const pending = copySurfaceReference(
			kernel,
			'ref',
			() =>
				new Promise<void>((_resolve, _reject) => {
					reject = _reject;
				})
		);
		showConsentSurface(kernel, 'none');
		reject(new Error('denied'));
		await expect(pending).resolves.toEqual({ applied: false, reveal: false });
		expect(session.getState().copy.status).toBe('idle');
	});

	test('[CLIP-01] copied is reported only after the write resolves; a failure with Details open reveals the fallback', async () => {
		const kernel = kernelFor();
		showConsentSurface(kernel, 'dialog');
		const session = getSurfaceSession(kernel);
		session.toggleReceipt(true);
		const write = vi.fn(() => Promise.resolve());
		const copied = copySurfaceReference(kernel, 'ref', write);
		expect(session.getState().copy.status).toBe('pending');
		await expect(copied).resolves.toEqual({ applied: true, reveal: true });
		expect(write).toHaveBeenCalledWith('ref');
		expect(session.getState().copy.status).toBe('copied');

		await copySurfaceReference(kernel, 'ref', () =>
			Promise.reject(new Error('denied'))
		);
		expect(session.getState().copy.status).toBe('failed');
	});

	test('[CLIP-03] a failure after Details closed keeps the fallback but neither moves focus nor speaks', async () => {
		const kernel = kernelFor();
		showConsentSurface(kernel, 'dialog');
		const session = getSurfaceSession(kernel);
		session.toggleReceipt(true);
		let reject: (error: Error) => void = () => undefined;
		const pending = copySurfaceReference(
			kernel,
			'ref',
			() =>
				new Promise<void>((_resolve, _reject) => {
					reject = _reject;
				})
		);
		session.toggleReceipt(false);
		reject(new Error('denied'));
		await expect(pending).resolves.toEqual({ applied: true, reveal: false });
		expect(session.getState().copy.status).toBe('failed');
	});

	test('[CLIP-03] a failure after the banner panel folded keeps the fallback but neither moves focus nor speaks', async () => {
		const kernel = kernelFor();
		kernel.set.activeUI('banner');
		const session = getSurfaceSession(kernel);
		session.expand();
		session.toggleReceipt(true);
		let reject: (error: Error) => void = () => undefined;
		const pending = copySurfaceReference(
			kernel,
			'ref',
			() =>
				new Promise<void>((_resolve, _reject) => {
					reject = _reject;
				})
		);
		session.collapse();
		reject(new Error('denied'));
		await expect(pending).resolves.toEqual({ applied: true, reveal: false });
		expect(session.getState().copy.status).toBe('failed');
	});

	test('[CLIP-03] a failure in an all-in-one drawer reveals the fallback, though the banner is not expanded', async () => {
		const kernel = kernelFor();
		kernel.set.activeUI('banner');
		const session = getSurfaceSession(kernel);
		session.toggleReceipt(true);
		expect(session.getState()).toMatchObject({
			expanded: false,
			surface: 'banner',
		});
		const fail = () => Promise.reject(new Error('denied'));

		await expect(
			copySurfaceReference(kernel, 'ref', fail, { panelVisible: true })
		).resolves.toEqual({ applied: true, reveal: true });
		// A folded banner panel is still hidden without the hint.
		await expect(copySurfaceReference(kernel, 'ref', fail)).resolves.toEqual({
			applied: true,
			reveal: false,
		});
		expect(session.getState().copy.status).toBe('failed');
	});

	test('[CLIP-01] no clipboard is a visible failure', async () => {
		const kernel = kernelFor();
		showConsentSurface(kernel, 'dialog');
		vi.stubGlobal('navigator', {});
		try {
			await copySurfaceReference(kernel, 'ref');
		} finally {
			vi.unstubAllGlobals();
		}
		expect(getSurfaceSession(kernel).getState().copy.status).toBe('failed');
	});
});

describe('[FOC-04] Escape through the session', () => {
	test('top sheet, then confirmation, then the dialog', () => {
		const kernel = kernelFor();
		showConsentSurface(kernel, 'dialog');
		const session = getSurfaceSession(kernel);
		session.openConfirmation('sale');
		session.pushSheet('cookies', 'preferences-row');
		session.openConfirmation('sale');
		const context = { blocking: false, focusInside: true };
		expect(session.escape(context)).toBe('close-sheet');
		expect(session.getState().sheets).toEqual([]);
		expect(session.escape(context)).toBe('close-confirmation');
		expect(session.escape(context)).toBe('close-dialog');
		expect(kernel.getSnapshot().activeUI).toBe('banner');
	});

	test('[NEST-04] popping returns the opener of the closed sheet', () => {
		const kernel = kernelFor();
		showConsentSurface(kernel, 'dialog');
		const session = getSurfaceSession(kernel);
		expect(session.pushSheet('cookies', 'preferences-row')).toBe(true);
		expect(session.pushSheet('vendors:marketing')).toBe(false);
		expect(session.popSheet()).toEqual({
			id: 'cookies',
			opener: 'preferences-row',
		});
		expect(session.popSheet()).toBeNull();
	});

	test('[PERM-01] a banner never stacks sheets, phone or not', () => {
		const kernel = kernelFor();
		kernel.set.activeUI('banner');
		expect(getSurfaceSession(kernel).pushSheet('cookies')).toBe(false);
	});

	test('[PERM-03] Escape on a banner folds, and never dismisses it', () => {
		const kernel = kernelFor();
		kernel.set.activeUI('banner');
		const session = getSurfaceSession(kernel);
		session.expand();
		expect(session.escape({ blocking: true, focusInside: true })).toBe(
			'collapse'
		);
		expect(session.escape({ blocking: true, focusInside: true })).toBe(
			'swallow'
		);
		expect(kernel.getSnapshot().activeUI).toBe('banner');
	});
});

describe('EU draft', () => {
	test('[EU-03] toggling a vendor under an off category is not a change', () => {
		const draft = createPreferenceDraft(kernelFor());
		draft.setVendor('meta-pixel', false);
		expect(draft.getState()).toMatchObject({
			hasEffectiveChanges: false,
			isDirty: true,
		});
		draft.set('marketing', true);
		expect(draft.getState().hasEffectiveChanges).toBe(true);
	});

	test('[EU-03] toggling a category on and off again after Reject all does not enable Save', () => {
		const draft = createPreferenceDraft(kernelFor());
		draft.rejectAll();
		draft.set('measurement', true);
		draft.set('measurement', false);
		expect(draft.getState().hasEffectiveChanges).toBe(false);
	});

	test('[EU-02] closing the dialog discards the attached draft', () => {
		const kernel = kernelFor();
		showConsentSurface(kernel, 'dialog');
		const draft = createPreferenceDraft(kernel);
		const detach = getSurfaceSession(kernel).attachDraft(draft);
		draft.set('marketing', true);
		expect(draft.getState().isDirty).toBe(true);
		showConsentSurface(kernel, 'none');
		expect(draft.getState().isDirty).toBe(false);
		expect(kernel.getSnapshot().explicitChoice).toBeNull();
		detach();
	});

	test('[EU-02] a close caught up by a read, then a synchronous reopen, still discards the draft', () => {
		const kernel = kernelFor();
		// Subscribed before the session, so its read catches the session up
		// before the session's own kernel listener runs.
		kernel.subscribe(() => {
			getSurfaceSession(kernel).getState();
		});
		showConsentSurface(kernel, 'dialog');
		const draft = createPreferenceDraft(kernel);
		const detach = getSurfaceSession(kernel).attachDraft(draft);
		draft.set('marketing', true);
		showConsentSurface(kernel, 'none');
		expect(kernel.getSnapshot().activeUI).not.toBe('dialog');
		showConsentSurface(kernel, 'dialog');
		expect(draft.getState().isDirty).toBe(false);
		detach();
	});
});
