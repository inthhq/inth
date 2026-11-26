import type {
	AllConsentNames,
	HasCondition,
	VendorDetails,
} from '@inth/sdk/engine';
import type {
	ConsentSignalType,
	ManifestContract,
	ManifestStep,
	VENDOR_MANIFEST_KIND,
	VENDOR_MANIFEST_SCHEMA_VERSION,
} from '@inth/sdk/manifest-runtime';

// The serializable manifest and its steps live with the runtime that runs
// them, in `@inth/sdk/manifest-runtime`.
export {
	RUNTIME_VALUE_KIND,
	VENDOR_MANIFEST_KIND,
	VENDOR_MANIFEST_SCHEMA_VERSION,
	runtimeDateValue,
	runtimeTimestampValue,
	vendorManifestContract,
} from '@inth/sdk/manifest-runtime';
export type {
	CallGlobalStep,
	ConsentSignalType,
	ConstructGlobalStep,
	DefineGlobalMethodsStep,
	DefineQueueClassStep,
	DefineQueueFunctionStep,
	DefineQueueMethodsStep,
	DefineQueueProxyStep,
	DefineStubFunctionStep,
	GlobalMethodBehavior,
	LoadScriptStep,
	ManifestContract,
	ManifestStep,
	PushToQueueStep,
	ResolvedManifest,
	RuntimeValue,
	SetCookieStep,
	SetGlobalPathStep,
	SetGlobalStep,
} from '@inth/sdk/manifest-runtime';

type ManifestInterpolationToken = `{{${string}}}`;
export type ManifestCategoryCondition = HasCondition<
	AllConsentNames | ManifestInterpolationToken
>;

/**
 * A declarative definition of a vendor integration.
 *
 * Manifests are the source definition that the scripts engine compiles into a
 * serializable resolved manifest and then converts into a runtime `Script`.
 */
export interface VendorManifest extends ManifestContract {
	kind: typeof VENDOR_MANIFEST_KIND;

	schemaVersion: typeof VENDOR_MANIFEST_SCHEMA_VERSION;

	/** Unique vendor identifier (used as Script.id) */
	vendor: string;

	/**
	 * Name and privacy policy of the vendor, so the preference dialog lists
	 * it with its own switch. Becomes `Script.vendorDetails`.
	 */
	vendorDetails?: VendorDetails;

	/** Consent category or condition required to load this vendor */
	category: ManifestCategoryCondition;

	/** Load regardless of consent state (vendor manages its own consent internally) */
	alwaysLoad?: boolean | string;

	/** Keep the element after revocation; 'loaded' removes pending loaders. */
	persistAfterConsentRevoked?: boolean | string;

	/**
	 * Steps that must execute before default consent signaling.
	 *
	 * This is primarily used for integrations such as Google tags where a stub
	 * global must exist before calling the vendor's consent API.
	 */
	bootstrap?: ManifestStep[];

	/**
	 * Steps to execute when installing the vendor.
	 *
	 * The resolver extracts the script source from these steps:
	 * - If a `loadScript` step exists, its `src` becomes `Script.src`
	 * - All non-`loadScript` steps run as part of `onBeforeLoad`
	 */
	install: ManifestStep[];

	/** Steps to execute after the main script loads */
	afterLoad?: ManifestStep[];

	/** Steps to execute before load when the vendor has consent */
	onBeforeLoadGranted?: ManifestStep[];

	/** Steps to execute before load when the vendor does not have consent */
	onBeforeLoadDenied?: ManifestStep[];

	/** Steps to execute after load when the vendor has consent */
	onLoadGranted?: ManifestStep[];

	/** Steps to execute after load when the vendor does not have consent */
	onLoadDenied?: ManifestStep[];

	/** Steps to run on any consent state change */
	onConsentChange?: ManifestStep[];

	/**
	 * Steps to run when this vendor's consent changes to granted.
	 *
	 * Consent updates that leave this vendor's consent unchanged, such as a
	 * change to an unrelated category, do not run these steps again.
	 */
	onConsentGranted?: ManifestStep[];

	/**
	 * Steps to run when this vendor's consent changes to denied.
	 *
	 * Consent updates that leave this vendor's consent unchanged do not run
	 * these steps again.
	 */
	onConsentDenied?: ManifestStep[];

	/**
	 * Steps to run when the script is disposed (level 2). A replacement runs
	 * them once the new script has started, with consent read then.
	 */
	onDispose?: ManifestStep[];

	/** `Script.target` (level 2). */
	target?: 'head' | 'body';

	/** `Script.observeConsentBeforeLoad` (level 2). */
	observeConsentBeforeLoad?: boolean;

	/** `Script.persistAfterDispose` (level 2). */
	persistAfterDispose?: boolean;

	/** `Script.resourceKey` (level 2). */
	resourceKey?: string;

	/**
	 * Maps Inth consent categories to vendor-specific consent type names.
	 *
	 * Used with `consentSignal` to translate Inth consent state into
	 * the vendor's consent API format.
	 *
	 * @example
	 * ```ts
	 * // Google Consent Mode v2 mapping
	 * consentMapping: {
	 *   marketing: ['ad_storage', 'ad_user_data', 'ad_personalization'],
	 *   measurement: ['analytics_storage'],
	 *   functionality: ['functionality_storage'],
	 *   necessary: ['security_storage'],
	 *   experience: ['personalization_storage'],
	 * }
	 * ```
	 */
	consentMapping?: Record<string, string[]>;

	/** How to signal consent state to the vendor */
	consentSignal?: ConsentSignalType;

	/** Target global for consent signaling (defaults based on signal type) */
	consentSignalTarget?: string;

	/**
	 * Vendor consent types the `'default'` signal of a `'gtag'` or
	 * `'clarity'` manifest sets whatever the Inth consent state says.
	 * Updates and a vendor the subject turned off ignore them.
	 */
	consentSignalDefaults?:
		| Record<string, 'granted' | 'denied'>
		| ManifestInterpolationToken;
}
