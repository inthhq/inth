/**
 * The phone layout over a server-rendered consent prompt waits for
 * hydration: the browser keeps the server's desktop markup until the
 * application is stable.
 */
import { ApplicationRef, PendingTasks } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { injectPhoneLayout } from './surface-session';

const stubPhone = function stubPhone(): void {
	vi.stubGlobal('matchMedia', (query: string) => ({
		addEventListener: () => undefined,
		matches: query.includes('max-width'),
		media: query,
		removeEventListener: () => undefined,
	}));
};

const serverPrompt = function serverPrompt(): void {
	const root = document.createElement('div');
	root.dataset.testid = 'consent-banner-root';
	root.dataset.design = 'privacy-choices';
	document.body.append(root);
};

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

describe('injectPhoneLayout', () => {
	test('a browser-only render reads the viewport at once', () => {
		stubPhone();
		const phone = TestBed.runInInjectionContext(injectPhoneLayout);
		expect(phone()).toBe(true);
	});

	test('over a server-rendered prompt it keeps desktop until the application is stable', async () => {
		stubPhone();
		serverPrompt();
		const done = TestBed.inject(PendingTasks).add();
		const phone = TestBed.runInInjectionContext(injectPhoneLayout);
		expect(phone()).toBe(false);
		await Promise.resolve();
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(phone()).toBe(false);
		done();
		await TestBed.inject(ApplicationRef).whenStable();
		await vi.waitFor(() => expect(phone()).toBe(true));
	});
});
