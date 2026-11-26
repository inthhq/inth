/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { npmAndRemote } from './__tests__/remote-path';
import {
	ALL_DENIED,
	loadScripts,
	registerVendorContractCleanup,
	settleScripts,
	updateScripts,
} from './e2e-test-utils';
import { frontChat } from './vendors/functional/front-chat';

const grantedConsents = { ...ALL_DENIED, functionality: true };

const getLoader = function getLoader(): HTMLScriptElement {
	const element = document.body.querySelector('script');
	if (!element) {
		throw new Error('Expected a Front Chat loader.');
	}
	return element;
};

describe('Front Chat loader contract', () => {
	registerVendorContractCleanup();
	afterEach(() => {
		delete window.FrontChat;
	});

	it('waits for functionality consent and SDK load, then initialises once', () => {
		const scripts = [frontChat({ chatId: 'channel-id' })];
		window.FrontChat = vi.fn();
		loadScripts(scripts, ALL_DENIED);
		expect(document.body.querySelector('script')).toBeNull();
		expect(window.FrontChat).not.toHaveBeenCalled();

		updateScripts(scripts, grantedConsents);
		const element = getLoader();
		expect(element.src).toBe(
			'https://chat-assets.frontapp.com/v1/chat.bundle.js'
		);
		expect(window.FrontChat).not.toHaveBeenCalled();
		element.dispatchEvent(new Event('load'));
		updateScripts(scripts, grantedConsents);
		expect(window.FrontChat).toHaveBeenCalledExactlyOnceWith('init', {
			chatId: 'channel-id',
			useDefaultLauncher: true,
		});
	});

	it('ignores a revoked in-flight load and initialises a subsequent permitted load', () => {
		const scripts = [frontChat({ chatId: 'channel-id' })];
		window.FrontChat = vi.fn();
		loadScripts(scripts, grantedConsents);
		const revoked = getLoader();
		updateScripts(scripts, ALL_DENIED);
		expect(revoked.isConnected).toBe(false);
		revoked.dispatchEvent(new Event('load'));
		expect(window.FrontChat).not.toHaveBeenCalled();

		updateScripts(scripts, grantedConsents);
		const current = getLoader();
		expect(current).not.toBe(revoked);
		current.dispatchEvent(new Event('load'));
		expect(window.FrontChat).toHaveBeenCalledOnce();
	});

	it('propagates the core loader CSP nonce into the Front SDK', () => {
		window.FrontChat = vi.fn();
		loadScripts([frontChat({ chatId: 'channel-id' })], grantedConsents, {
			nonce: 'provider-nonce',
		});
		const element = getLoader();
		expect(element.nonce).toBe('provider-nonce');
		element.dispatchEvent(new Event('load'));
		expect(window.FrontChat).toHaveBeenCalledWith('init', {
			chatId: 'channel-id',
			nonce: 'provider-nonce',
			useDefaultLauncher: true,
		});
	});
});

describe.each(npmAndRemote('frontChat', frontChat))(
	'Front Chat dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();
		afterEach(() => {
			delete window.FrontChat;
		});

		it('initialises with the launcher setting and the provider nonce once it loads with consent', async () => {
			window.FrontChat = vi.fn();
			const scripts = [
				build({ chatId: 'channel-id', useDefaultLauncher: false }),
			];
			loadScripts(scripts, ALL_DENIED, { nonce: 'provider-nonce' });
			await settleScripts();
			expect(document.body.querySelector('script')).toBeNull();

			updateScripts(scripts, grantedConsents);
			const element = getLoader();
			expect(element.nonce).toBe('provider-nonce');
			expect(window.FrontChat).not.toHaveBeenCalled();
			element.dispatchEvent(new Event('load'));
			expect(window.FrontChat).toHaveBeenCalledExactlyOnceWith('init', {
				chatId: 'channel-id',
				nonce: 'provider-nonce',
				useDefaultLauncher: false,
			});
		});
	}
);
