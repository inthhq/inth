/**
 * Every `InthProviderOptions` field, sorted for `liveRootKey`. This file
 * is type-checked (`check-types`), so a new option fails until someone
 * classifies it; `create-deferred-kernel.test.ts` checks the key follows the list.
 */
import type { InthProviderOptions } from '../../provider';

/**
 * Every option, sorted: `display` when only what the page shows depends
 * on it, `key` otherwise. A new option fails to compile here until
 * someone decides which it is.
 */
export const OPTIONS: Record<keyof InthProviderOptions, 'display' | 'key'> = {
	__debugPkg: 'key',
	__preloadScriptLoader: 'key',
	__resolveStreamedInit: 'key',
	callbacks: 'key',
	clearOnRevocation: 'key',
	colorScheme: 'display',
	components: 'display',
	consentCategories: 'key',
	consentSource: 'key',
	disableAnimation: 'display',
	enabled: 'key',
	experiment: 'key',
	experimentalScriptRegistry: 'key',
	i18n: 'display',
	iframeBlocker: 'key',
	journey: 'key',
	legalLinks: 'display',
	mode: 'key',
	networkBlocker: 'key',
	noStyle: 'display',
	nonce: 'key',
	overrides: 'key',
	persistence: 'key',
	prefetch: 'key',
	preloadDialog: 'display',
	presentation: 'display',
	projectUrl: 'key',
	reloadOnConsentRevoked: 'key',
	scriptLoader: 'key',
	scripts: 'key',
	scrollLock: 'display',
	storageConfig: 'key',
	streamBanner: 'key',
	styles: 'display',
	theme: 'display',
	trapFocus: 'display',
	user: 'key',
	vendors: 'key',
};
