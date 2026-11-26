import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { runtimeScriptNonceValue, vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { trimToUndefined, withScriptUrl } from '../_shared/script-url';

declare global {
	interface Window {
		FrontChat?: (command: string, options?: Record<string, unknown>) => unknown;
	}
}

/**
 * Front Chat loader at the end of body, and the widget's initialisation once
 * it loads with consent. Front needs the loader's CSP nonce in `init` for
 * the scripts it generates; a loader without one sends none.
 */
export const frontChatManifest = {
	...vendorManifestContract,
	category: 'functionality',
	install: [
		{
			async: true,
			src: 'https://chat-assets.frontapp.com/v1/chat.bundle.js',
			type: 'loadScript',
		},
	],
	onLoadGranted: [
		{
			args: [
				'init',
				{
					chatId: '{{chatId}}',
					nonce: runtimeScriptNonceValue,
					useDefaultLauncher: '{{useDefaultLauncher}}',
				},
			],
			global: 'FrontChat',
			type: 'callGlobal',
		},
	],
	target: 'body',
	vendor: 'front-chat',
	vendorDetails: {
		homepageUrl: 'https://front.com/',
		legalName: 'FrontApp, Inc.',
		name: 'Front Chat',
		privacyPolicyUrl:
			'https://front.com/legal/front-products-and-services-privacy-notice',
	},
} as const satisfies VendorManifest;

export interface FrontChatOptions {
	/** Public chat ID from the Front channel's installation snippet. */
	chatId: string;
	/** Show Front's default launcher. @default true */
	useDefaultLauncher?: boolean;
	/** Custom or proxied Front Chat bundle URL. */
	scriptSrc?: string;
	/** CSP nonce forwarded to the loader and Front's generated scripts. */
	nonce?: string;
}

/**
 * Builds the serializable manifest behind {@link frontChat}. `chatId` must
 * already be trimmed and non-empty.
 */
export const resolveFrontChatManifest = function resolveFrontChatManifest({
	chatId,
	useDefaultLauncher = true,
}: Pick<FrontChatOptions, 'chatId' | 'useDefaultLauncher'>): ResolvedManifest {
	return getCompiledManifest(frontChatManifest, { chatId, useDefaultLauncher });
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; `scriptSrc` and `nonce` stay npm-only. Marked pure so a bundler
 * drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'frontChat',
		{
			chatId: {
				example: '0123456789abcdef0123456789abcdef',
				kind: 'id',
				label: 'Chat ID',
				pattern: '^[A-Za-z0-9_-]+$',
				required: true,
			},
			useDefaultLauncher: {
				default: true,
				kind: 'boolean',
				label: "Show Front's default launcher",
			},
		},
		resolveFrontChatManifest
	);

/**
 * Creates a Front Chat script gated on functionality consent.
 *
 * Keep Inth's default reload-on-revocation behaviour enabled to stop an
 * already-running widget. Removing its loader cannot unload the SDK.
 *
 * @remarks When `chatId` is missing or blank, the helper logs
 *   `frontChat: missing or invalid chatId` with `console.error` and returns
 *   a script that never loads. Copy the public ID from the Front channel's
 *   installation snippet.
 * @example
 * frontChat({ chatId: 'YOUR_FRONT_CHAT_ID' });
 * @see https://help.front.com/en/articles/2049
 */
export const frontChat = function frontChat(options: FrontChatOptions): Script {
	const chatId = readId(options?.chatId);
	if (chatId === undefined) {
		return skipMissingId('frontChat', 'chatId', {
			category: 'functionality',
			manifest: frontChatManifest,
		});
	}

	return {
		...withScriptUrl(
			resolvedManifestToScript(
				resolveFrontChatManifest({
					chatId,
					useDefaultLauncher: options.useDefaultLauncher,
				})
			),
			options.scriptSrc
		),
		// The loader puts it on its element, where init reads it.
		nonce: trimToUndefined(options.nonce),
	};
};

/**
 * Requests widget removal and session cleanup through Front's SDK.
 *
 * Optionally call it from `onBeforeConsentRevocationReload`. Front does not
 * provide a completion promise, so this does not guarantee cleanup before
 * navigation.
 * Safe to call during SSR or before the SDK loads.
 *
 * @example
 * shutdownFrontChat();
 * @see https://dev.frontapp.com/docs/chat-sdk-reference
 */
export const shutdownFrontChat = function shutdownFrontChat(): void {
	if (typeof window !== 'undefined' && typeof window.FrontChat === 'function') {
		window.FrontChat('shutdown', { clearSession: true });
	}
};
