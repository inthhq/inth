/**
 * The Astro story catalogue.
 *
 * One entry per rendered variant. The module is imported from both sides
 * of the build: the Vite prerender plugin reads it in Node to render the
 * `.astro` components through Astro's container, and the stories read it
 * in the browser to look the rendered fragment up again. It must therefore
 * stay free of any `.astro`, Node or DOM import.
 */

import { bottomBarOptions } from './docs-recipes/bottom-bar';

/** The `.astro` components the Storybook renders. */
export type AstroComponentName =
	| 'consent-banner'
	| 'consent-dialog'
	| 'consent-dialog-trigger'
	| 'iab-consent-banner'
	| 'iab-consent-dialog'
	| 'opt-out-confirmation';

/** Which framework renders the on-demand dialog island. */
export type AstroUIAdapter = 'svelte' | 'react' | 'vue';

/** The regimes the prompt and dialog stories show, as React's do. */
export type StoryRegion = 'eu' | 'us-opt-in' | 'us-notice' | 'us-opt-out';

/** A regime story: the prompt, or the dialog, over a demo page. */
export interface PromptStory {
	region: StoryRegion;
	/** The prompt's `container`. */
	container: Record<string, unknown>;
	blockUntilChoice?: boolean;
	edgeStyle?: 'inset' | 'flush';
	/** A dialog story: the page carries `<ConsentDialog />` and the dialog's vendors. */
	dialog?: boolean;
	/** A Global Privacy Control signal is on. */
	gpc?: boolean;
}

/** A single prerendered variant. */
export interface AstroStoryVariant {
	/** Stable key. Also the virtual-module record key. */
	id: string;
	/** Which `.astro` component to render. */
	component: AstroComponentName;
	/** Props handed to the component. */
	props?: Record<string, unknown>;
	/** Slot content, by slot name. */
	slots?: Record<string, string>;
	/**
	 * Integration options, in the shape `inth()` takes in `astro.config`.
	 * The prerender resolves them with the package's own `resolveOptions`,
	 * so the server context and the browser boot see the same object a real
	 * site would.
	 */
	options?: {
		consentCategories?: string[];
		colorScheme?: 'light' | 'dark' | 'system';
		/**
		 * Turn IAB on. The prerender resolves an IAB policy pack and hands
		 * the integration the conformance vendor list, so the server render
		 * has the GVL the banner needs and the island boots against a
		 * runtime whose model is `iab`.
		 */
		iab?: boolean;
		/** Use the opt-out policy pack instead of the default opt-in rule. */
		policy?: 'default' | 'opt-out';
		/** Prevent page reloads on opt-out revocation inside Storybook fixtures. */
		reloadOnConsentRevoked?: boolean;
		/** Banner presentation, merged over the shared story presentation. */
		presentation?: {
			optOutLink?:
				| 'do-not-sell'
				| 'privacy-choices'
				| 'california-privacy-choices';
			prompt?: Record<string, unknown>;
		};
	};
	/**
	 * Which dialog adapter the story boots. Defaults to `react`, whose
	 * island renders React's own dialog, the parity baseline.
	 */
	ui?: AstroUIAdapter;
	/** Render the prompt over a demo page, under one regime's rule. */
	prompt?: PromptStory;
	/** Put `inth-dark` on `<html>` while the story is mounted. */
	dark?: boolean;
	/**
	 * Open a dialog once the runtime has booted. `<ConsentDialog />` only
	 * renders a host element; the surface is an island mounted on demand,
	 * so a story that wants the dialog visible has to ask for it.
	 */
	openDialog?: 'preferences' | 'iab';
	/**
	 * Open the opt-out confirmation view once the runtime has booted, either
	 * after an interactive request or with a Global Privacy Control signal.
	 */
	openOptOutConfirmation?: 'request' | 'signal';
	/** Seeded opt-out record state applied on boot for opt-out dialog and receipt stories. */
	optOutState?:
		| 'request'
		| 'request-confirmed'
		| 'account-covered'
		| 'gpc'
		| 'signal'
		| 'account-adopted';
	/** Include a server-rendered `<ConsentDialogLink right="opt-out" />` beside the host. */
	withOptOutLink?: boolean;
	/**
	 * Include a server-rendered `<PrivacyChoicesLink />` before the host, the
	 * page link that opens `<ConsentDialog />`, as React's banner-and-dialog
	 * stories render it.
	 */
	withPrivacyChoicesLink?: boolean;
	/**
	 * Render `<ConsentDialog />` after the component, as React's stories
	 * put `<ConsentDialog />` beside the banner or link that opens it.
	 */
	withDialog?: boolean;
	/**
	 * Render the component as a docs design recipe: over the demo page, with
	 * a "Privacy settings" `<ConsentDialogTrigger>` in its footer and a
	 * `<ConsentDialog />`, the scene every framework's recipe stories share.
	 */
	recipePage?: boolean;
}

const CATEGORIES = [
	'necessary',
	'functionality',
	'measurement',
	'experience',
	'marketing',
];

/** A regime banner story's variant. */
const bannerStory = function bannerStory(
	id: string,
	story: PromptStory
): AstroStoryVariant {
	return {
		component: 'consent-banner',
		id: `consent-banner--${id}`,
		options: { colorScheme: 'light', consentCategories: CATEGORIES },
		prompt: story,
	};
};

/**
 * A regime dialog story's variant: the dialog opens on boot, unless the
 * story walks the full flow from the banner.
 */
const dialogStory = function dialogStory(
	id: string,
	story: Omit<PromptStory, 'container' | 'dialog'> & {
		container?: Record<string, unknown>;
		flow?: boolean;
	}
): AstroStoryVariant {
	const { flow, ...rest } = story;
	return {
		component: 'consent-banner',
		id: `consent-dialog--${id}`,
		openDialog: flow ? undefined : 'preferences',
		options: { colorScheme: 'light', consentCategories: CATEGORIES },
		prompt: {
			container: { position: 'start', type: 'card' },
			...rest,
			dialog: true,
		},
	};
};

/** Every container and regime, under the names React's stories carry. */
const regionVariants: readonly AstroStoryVariant[] = [
	bannerStory('card-start-eu', {
		container: { position: 'start', type: 'card' },
		region: 'eu',
	}),
	bannerStory('card-start-us-opt-in', {
		container: { position: 'start', type: 'card' },
		region: 'us-opt-in',
	}),
	bannerStory('card-start-us-notice', {
		container: { position: 'start', type: 'card' },
		region: 'us-notice',
	}),
	bannerStory('card-end-eu', {
		container: { position: 'end', type: 'card' },
		region: 'eu',
	}),
	bannerStory('card-end-us-opt-in', {
		container: { position: 'end', type: 'card' },
		region: 'us-opt-in',
	}),
	bannerStory('card-end-us-notice', {
		container: { position: 'end', type: 'card' },
		region: 'us-notice',
	}),
	bannerStory('card-center-eu', {
		container: { position: 'center', type: 'card' },
		region: 'eu',
	}),
	bannerStory('card-center-us-opt-in', {
		container: { position: 'center', type: 'card' },
		region: 'us-opt-in',
	}),
	bannerStory('card-center-us-notice', {
		container: { position: 'center', type: 'card' },
		region: 'us-notice',
	}),
	bannerStory('banner-bottom-eu', {
		container: { edge: 'bottom', type: 'banner' },
		region: 'eu',
	}),
	bannerStory('banner-bottom-us-opt-in', {
		container: { edge: 'bottom', type: 'banner' },
		region: 'us-opt-in',
	}),
	bannerStory('banner-bottom-us-notice', {
		container: { edge: 'bottom', type: 'banner' },
		region: 'us-notice',
	}),
	bannerStory('banner-top-eu', {
		container: { edge: 'top', type: 'banner' },
		region: 'eu',
	}),
	bannerStory('banner-top-us-opt-in', {
		container: { edge: 'top', type: 'banner' },
		region: 'us-opt-in',
	}),
	bannerStory('banner-top-us-notice', {
		container: { edge: 'top', type: 'banner' },
		region: 'us-notice',
	}),
	bannerStory('drawer-bottom-eu', {
		container: { side: 'bottom', type: 'drawer' },
		region: 'eu',
	}),
	bannerStory('drawer-bottom-us-opt-in', {
		container: { side: 'bottom', type: 'drawer' },
		region: 'us-opt-in',
	}),
	bannerStory('drawer-bottom-us-notice', {
		container: { side: 'bottom', type: 'drawer' },
		region: 'us-notice',
	}),
	bannerStory('drawer-top-eu', {
		container: { side: 'top', type: 'drawer' },
		region: 'eu',
	}),
	bannerStory('drawer-top-us-opt-in', {
		container: { side: 'top', type: 'drawer' },
		region: 'us-opt-in',
	}),
	bannerStory('drawer-top-us-notice', {
		container: { side: 'top', type: 'drawer' },
		region: 'us-notice',
	}),
	bannerStory('drawer-start-eu', {
		container: { side: 'start', type: 'drawer' },
		region: 'eu',
	}),
	bannerStory('drawer-start-us-opt-in', {
		container: { side: 'start', type: 'drawer' },
		region: 'us-opt-in',
	}),
	bannerStory('drawer-start-us-notice', {
		container: { side: 'start', type: 'drawer' },
		region: 'us-notice',
	}),
	bannerStory('drawer-end-eu', {
		container: { side: 'end', type: 'drawer' },
		region: 'eu',
	}),
	bannerStory('drawer-end-us-opt-in', {
		container: { side: 'end', type: 'drawer' },
		region: 'us-opt-in',
	}),
	bannerStory('drawer-end-us-notice', {
		container: { side: 'end', type: 'drawer' },
		region: 'us-notice',
	}),
	bannerStory('blocking-card', {
		blockUntilChoice: true,
		container: { position: 'start', type: 'card' },
		region: 'eu',
	}),
	bannerStory('blocking-banner', {
		blockUntilChoice: true,
		container: { edge: 'bottom', type: 'banner' },
		region: 'eu',
	}),
	bannerStory('blocking-drawer-bottom', {
		blockUntilChoice: true,
		container: { side: 'bottom', type: 'drawer' },
		region: 'eu',
	}),
	bannerStory('blocking-drawer-start', {
		blockUntilChoice: true,
		container: { side: 'start', type: 'drawer' },
		region: 'eu',
	}),
	bannerStory('flush-banner-bottom', {
		container: { edge: 'bottom', type: 'banner' },
		edgeStyle: 'flush',
		region: 'eu',
	}),
	bannerStory('flush-drawer-bottom', {
		container: { side: 'bottom', type: 'drawer' },
		edgeStyle: 'flush',
		region: 'eu',
	}),
	dialogStory('us-opt-out', { region: 'us-opt-out' }),
	dialogStory('us-opt-in', { region: 'us-opt-in' }),
	dialogStory('us-with-gpc', { gpc: true, region: 'us-opt-out' }),
	dialogStory('eu', { region: 'eu' }),
	dialogStory('phone-us-preferences-sheet', { region: 'us-opt-out' }),
	dialogStory('phone-eu-vendor-sheets', { region: 'eu' }),
	dialogStory('phone-flush-sheets', {
		edgeStyle: 'flush',
		region: 'us-opt-in',
	}),
	dialogStory('full-flow-eu', { flow: true, region: 'eu' }),
	dialogStory('full-flow-us-opt-in', {
		flow: true,
		region: 'us-opt-in',
	}),
	dialogStory('full-flow-us-notice', {
		container: { edge: 'bottom', type: 'banner' },
		flow: true,
		region: 'us-notice',
	}),
];

/**
 * Every Astro variant this Storybook can show.
 *
 * Read twice from opposite sides of the build: the `astro-prerender` Vite
 * plugin walks it at build time to server-render each entry, and
 * `render-astro-story.ts` looks entries up by `id` in the browser. One list
 * is what keeps a story from being prerendered without a renderer, or
 * rendered without markup.
 */
export const astroStoryVariants: readonly AstroStoryVariant[] = [
	{
		component: 'consent-banner',
		id: 'consent-banner--default',
		options: { colorScheme: 'light', consentCategories: CATEGORIES },
		props: { force: true },
	},
	{
		component: 'consent-banner',
		id: 'consent-banner--with-dialog',
		options: { colorScheme: 'light', consentCategories: CATEGORIES },
		props: { force: true },
		withDialog: true,
	},
	{
		// The dialog stories: the page link opens the dialog, as Customize
		// now opens the choices inside the banner.
		component: 'consent-banner',
		id: 'consent-banner--with-dialog-and-link',
		options: { colorScheme: 'light', consentCategories: CATEGORIES },
		props: { force: true },
		withDialog: true,
		withPrivacyChoicesLink: true,
	},
	{
		// React's focus story blocks the page until a choice, as this does.
		component: 'consent-banner',
		id: 'consent-banner--blocking',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			presentation: { prompt: { blockUntilChoice: true } },
		},
		props: { force: true },
	},
	{
		component: 'consent-dialog-trigger',
		id: 'consent-dialog-link--default',
		options: { colorScheme: 'light', consentCategories: CATEGORIES },
		slots: { default: 'Privacy preferences' },
		withDialog: true,
	},
	{
		component: 'consent-banner',
		id: 'consent-banner--docs-bottom-bar',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			...bottomBarOptions,
		},
		props: { force: true },
		recipePage: true,
	},
	{
		component: 'consent-banner',
		dark: true,
		id: 'consent-banner--dark',
		options: { colorScheme: 'dark', consentCategories: CATEGORIES },
		props: { force: true },
	},
	{
		component: 'consent-banner',
		id: 'consent-banner--opt-out-link',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			policy: 'opt-out',
			reloadOnConsentRevoked: false,
		},
		props: { disableAnimation: true, force: true },
	},
	{
		component: 'consent-banner',
		id: 'consent-banner--privacy-choices-link',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			policy: 'opt-out',
			presentation: { optOutLink: 'privacy-choices' },
			reloadOnConsentRevoked: false,
		},
		props: { disableAnimation: true, force: true },
	},
	{
		component: 'opt-out-confirmation',
		id: 'opt-out-confirmation--request-honored',
		openOptOutConfirmation: 'request',
		optOutState: 'request',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			policy: 'opt-out',
			presentation: { optOutLink: 'do-not-sell' },
			reloadOnConsentRevoked: false,
		},
		props: { disableAnimation: true },
	},
	{
		component: 'opt-out-confirmation',
		id: 'opt-out-confirmation--request-confirmed',
		openOptOutConfirmation: 'request',
		optOutState: 'request-confirmed',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			policy: 'opt-out',
			presentation: { optOutLink: 'do-not-sell' },
			reloadOnConsentRevoked: false,
		},
		props: { disableAnimation: true },
	},
	{
		component: 'opt-out-confirmation',
		id: 'opt-out-confirmation--account-covered',
		openOptOutConfirmation: 'request',
		optOutState: 'account-covered',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			policy: 'opt-out',
			presentation: { optOutLink: 'do-not-sell' },
			reloadOnConsentRevoked: false,
		},
		props: { disableAnimation: true },
	},
	{
		// React's story renders `<ConsentDialog />`, not
		// `<OptOutConfirmation />`, so the dialog confirms on its receipt.
		component: 'consent-dialog',
		id: 'opt-out-confirmation--signal-honored',
		openOptOutConfirmation: 'signal',
		optOutState: 'signal',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			policy: 'opt-out',
			presentation: { optOutLink: 'do-not-sell' },
			reloadOnConsentRevoked: false,
		},
		props: { disableAnimation: true },
		withOptOutLink: true,
	},
	{
		// React's story renders `<ConsentDialog />`, not
		// `<OptOutConfirmation />`, so the dialog confirms on its receipt.
		component: 'consent-dialog',
		id: 'opt-out-confirmation--account-adopted',
		openOptOutConfirmation: 'request',
		optOutState: 'account-adopted',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			policy: 'opt-out',
			presentation: { optOutLink: 'do-not-sell' },
			reloadOnConsentRevoked: false,
		},
		props: { disableAnimation: true },
		withOptOutLink: true,
	},
	{
		component: 'consent-dialog',
		id: 'consent-dialog--default',
		options: { colorScheme: 'light', consentCategories: CATEGORIES },
	},
	{
		component: 'consent-dialog',
		id: 'consent-dialog--opened',
		openDialog: 'preferences',
		options: { colorScheme: 'light', consentCategories: CATEGORIES },
	},
	{
		component: 'consent-dialog',
		id: 'consent-dialog--opt-out-not-opted-out',
		openDialog: 'preferences',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			policy: 'opt-out',
			presentation: { optOutLink: 'do-not-sell' },
			reloadOnConsentRevoked: false,
		},
		props: { disableAnimation: true },
	},
	{
		component: 'consent-dialog',
		id: 'consent-dialog--opt-out-honored-by-request',
		openDialog: 'preferences',
		optOutState: 'request',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			policy: 'opt-out',
			presentation: { optOutLink: 'do-not-sell' },
			reloadOnConsentRevoked: false,
		},
		props: { disableAnimation: true },
	},
	{
		component: 'consent-dialog',
		id: 'consent-dialog--opt-out-confirmed-sale-and-share',
		openDialog: 'preferences',
		optOutState: 'request-confirmed',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			policy: 'opt-out',
			presentation: { optOutLink: 'do-not-sell' },
			reloadOnConsentRevoked: false,
		},
		props: { disableAnimation: true },
	},
	{
		component: 'consent-dialog',
		id: 'consent-dialog--opt-out-gpc-locked',
		openDialog: 'preferences',
		optOutState: 'gpc',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			policy: 'opt-out',
			presentation: { optOutLink: 'privacy-choices' },
			reloadOnConsentRevoked: false,
		},
		props: { disableAnimation: true },
	},
	{
		component: 'consent-dialog',
		id: 'consent-dialog--opt-in-confirmation',
		openDialog: 'preferences',
		optOutState: 'request',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			policy: 'opt-out',
			presentation: { optOutLink: 'do-not-sell' },
			reloadOnConsentRevoked: false,
		},
		props: { disableAnimation: true },
	},
	{
		component: 'consent-dialog',
		id: 'consent-dialog--opt-in-confirmation-confirmed-rights',
		openDialog: 'preferences',
		optOutState: 'request-confirmed',
		options: {
			colorScheme: 'light',
			consentCategories: CATEGORIES,
			policy: 'opt-out',
			presentation: { optOutLink: 'do-not-sell' },
			reloadOnConsentRevoked: false,
		},
		props: { disableAnimation: true },
	},
	{
		component: 'consent-dialog-trigger',
		id: 'consent-dialog-trigger--default',
		options: { colorScheme: 'light', consentCategories: CATEGORIES },
		slots: { default: 'Cookie preferences' },
	},
	{
		component: 'iab-consent-banner',
		id: 'iab-consent-banner--default',
		options: { colorScheme: 'light', iab: true },
		props: { force: true },
	},
	{
		component: 'iab-consent-dialog',
		id: 'iab-consent-dialog--overview',
		openDialog: 'iab',
		options: { colorScheme: 'light', iab: true },
		ui: 'svelte',
	},
	{
		component: 'iab-consent-dialog',
		id: 'iab-consent-dialog--overview-react',
		openDialog: 'iab',
		options: { colorScheme: 'light', iab: true },
		ui: 'react',
	},
	{
		component: 'iab-consent-dialog',
		id: 'iab-consent-dialog--overview-vue',
		openDialog: 'iab',
		options: { colorScheme: 'light', iab: true },
		ui: 'vue',
	},
	...regionVariants,
];

/**
 * Look a variant up by id.
 *
 * @param id - The variant id.
 * @returns The variant.
 * @throws {Error} When no variant carries that id.
 */
export const requireStoryVariant = function requireStoryVariant(
	id: string
): AstroStoryVariant {
	const variant = astroStoryVariants.find((entry) => entry.id === id);
	if (!variant) {
		throw new Error(`No Astro story variant registered for id: ${id}`);
	}
	return variant;
};
