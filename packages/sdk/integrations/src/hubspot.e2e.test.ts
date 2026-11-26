/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { isolateHubSpotPage } from './__tests__/hubspot-page';
import { npmAndRemote } from './__tests__/remote-path';
import {
	ALL_DENIED,
	clearAllScripts,
	grantedMarketingConsents,
	grantedMeasurementConsents,
	loadScripts,
	settleScripts,
	updateScripts,
	registerVendorContractCleanup,
} from './e2e-test-utils';
import { hubspot } from './vendors/analytics/hubspot';

describe('HubSpot core loader consent contract', () => {
	registerVendorContractCleanup();
	afterEach(() => {
		for (const key of [
			'_hsp',
			'_hsq',
			'disableHubSpotCookieBanner',
			'HubSpotConversations',
			'hsConversationsOnReady',
			'hsConversationsSettings',
		]) {
			Reflect.deleteProperty(window, key);
		}
	});
	isolateHubSpotPage();

	it('creates no vendor globals, requests or storage before mapped consent', () => {
		const scripts = [hubspot({ portalId: '53' })];
		loadScripts(scripts, ALL_DENIED);
		updateScripts(scripts, grantedMeasurementConsents);
		expect(document.querySelector('script')).toBeNull();
		for (const key of [
			'_hsp',
			'_hsq',
			'disableHubSpotCookieBanner',
			'HubSpotConversations',
			'hsConversationsOnReady',
			'hsConversationsSettings',
		]) {
			expect(key in window).toBe(false);
		}
		expect(document.cookie).toBe('');
		updateScripts(scripts, grantedMarketingConsents);
		const element = document.querySelector('script');
		expect(element?.src).toBe('https://js.hs-scripts.com/53.js');
		element?.dispatchEvent(new Event('load'));
		updateScripts(scripts, grantedMarketingConsents);
		expect(document.querySelectorAll('script')).toHaveLength(1);
	});
	it('retains one loader across in-flight revoke and regrant', () => {
		const scripts = [hubspot({ portalId: '53' })];
		loadScripts(scripts, grantedMarketingConsents);
		const old = document.querySelector('script');
		updateScripts(scripts, ALL_DENIED);
		expect(old?.isConnected).toBe(true);
		old?.dispatchEvent(new Event('load'));
		expect(document.querySelector('script')).toBe(old);
		updateScripts(scripts, grantedMarketingConsents);
		const current = document.querySelector('script');
		expect(current).toBe(old);
		current?.dispatchEvent(new Event('load'));
		updateScripts(scripts, grantedMarketingConsents);
		expect(document.querySelectorAll('script')).toHaveLength(1);
	});
});

describe.each(npmAndRemote('hubspot', hubspot))(
	'HubSpot dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();
		isolateHubSpotPage();
		afterEach(() => {
			clearAllScripts();
		});

		/** The commands HubSpot's file runs from `_hsp`, once it has loaded. */
		const loadTracking = (loader: HTMLScriptElement | null) => {
			const queued = (window._hsp ?? []) as unknown[][];
			const commands: unknown[][] = [...queued];
			window._hsp = { push: (command) => commands.push(command) };
			loader?.dispatchEvent(new Event('load'));
			return commands;
		};

		it('loads the regional loader after marketing consent and forwards each purpose', async () => {
			const scripts = [build({ portalId: '053', region: 'eu1' })];
			loadScripts(scripts, grantedMeasurementConsents);
			await settleScripts();
			expect(document.querySelector('script')).toBeNull();
			expect('_hsp' in window).toBe(false);

			updateScripts(scripts, {
				...grantedMarketingConsents,
				measurement: true,
			});
			await settleScripts();
			const loader =
				document.querySelector<HTMLScriptElement>('#hs-script-loader');
			expect(loader?.src).toBe('https://js-eu1.hs-scripts.com/53.js');
			expect(window.disableHubSpotCookieBanner).toBe(true);
			const commands = loadTracking(loader);
			expect(commands).toEqual([
				[
					'setHubSpotConsent',
					{ advertisement: true, analytics: true, functionality: false },
				],
			]);

			updateScripts(scripts, grantedMarketingConsents);
			expect(commands.slice(1)).toEqual([
				['revokeCookieConsent'],
				[
					'setHubSpotConsent',
					{ advertisement: true, analytics: false, functionality: false },
				],
			]);
			// Without marketing, the loader's condition, every purpose is denied.
			updateScripts(scripts, grantedMeasurementConsents);
			expect(commands.slice(3)).toEqual([
				['revokeCookieConsent'],
				[
					'setHubSpotConsent',
					{ advertisement: false, analytics: false, functionality: false },
				],
			]);
			expect(document.querySelectorAll('script')).toHaveLength(1);
		});

		it('leaves another installation alone', async () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const other = document.createElement('div');
			other.id = 'hs-script-loader';
			document.body.append(other);
			loadScripts([build({ portalId: '53' })], grantedMarketingConsents);
			await settleScripts();

			expect(document.querySelector('script')).toBeNull();
			expect('_hsp' in window).toBe(false);
			expect(warn).toHaveBeenCalledWith(
				'hubspot: #hs-script-loader belongs to a non-script element. HubSpot will not load; remove or rename the conflicting ID and reload.'
			);
		});

		it('loads the chat widget with functionality consent and removes it when that is withdrawn', async () => {
			const widget = { load: vi.fn(), remove: vi.fn() };
			const clear = vi.fn();
			const scripts = [build({ chat: true, portalId: '53' })];
			const all = { ...grantedMarketingConsents, functionality: true };
			loadScripts(scripts, all);
			await settleScripts();
			expect(window.hsConversationsSettings).toEqual({
				loadImmediately: false,
			});
			loadTracking(document.querySelector('#hs-script-loader'));
			window.HubSpotConversations = {
				clear,
				off: vi.fn(),
				on: vi.fn(),
				widget,
			};
			for (const ready of window.hsConversationsOnReady ?? []) {
				ready();
			}
			expect(widget.load).toHaveBeenCalledOnce();

			updateScripts(scripts, grantedMarketingConsents);
			expect(widget.remove).toHaveBeenCalledOnce();
			expect(clear).toHaveBeenCalledWith({ resetWidget: false });
		});
	}
);
