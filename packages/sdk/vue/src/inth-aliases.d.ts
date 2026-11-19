declare module '#inth/composables' {
	export {
		consentConfigKey,
		useConsentConfig,
	} from './runtime/composables/config';
	export { useConsentActiveUI } from './runtime/composables/activeUI';
	export { useConsentComponent } from './runtime/composables/component';
	export {
		createDefaultIabSelection,
		useConsentIabSave,
		useConsentIabSelection,
		useConsentIabStore,
		type ConsentIabSelection,
		type IabConsentSaveInput,
		type IabPreferenceTab,
	} from './runtime/composables/iabSelection';
	export {
		useConsent,
		useConsentSave,
		type ConsentSaveInput,
	} from './runtime/composables/consent';
	export { useIabTranslations } from './runtime/composables/iab-translations';
	export { useConsentInit } from './runtime/composables/init';
	export { useConsentLanguage } from './runtime/composables/language';
	export { useRequestRegion } from './runtime/composables/region';
}

/** A Nuxt template the server render reads without a consent route. */
declare module '#@inth/sdk/server-manifest-snapshot' {
	import type { ConsentManifest } from '@inth/sdk/schema/types';

	/** The server snapshot, or `undefined` without one. */
	const manifest: ConsentManifest | undefined;
	export default manifest;
}

/** A Nuxt template the browser reads in `manifest({ resolve: 'browser' })`. */
declare module '#inth/client-manifest-snapshot' {
	import type { ConsentManifest } from '@inth/sdk/schema/types';

	/** The snapshot for browser resolution; `undefined` in every other mode. */
	const manifest: ConsentManifest | undefined;
	export default manifest;
}

/** A Nitro virtual the module fills from the client manifest. */
declare module '#inth/banner-preload-files' {
	/** The stock banner's own files (`bannerOnlyFiles`). */
	const files: readonly string[];
	export default files;
}
