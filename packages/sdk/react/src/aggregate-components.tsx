'use client';

import { useEffect } from 'react';
import type { ComponentType } from 'react';

import {
	registerDialogChunkWarmer,
	useIdleDialogWarming,
} from './chunk-warming';
import { useHeadlessConsentUI } from './component-hooks/use-headless-consent-ui';
import type { OptInConfirmationProps } from './components/opt-in-confirmation';
import type {
	OptOutConfirmationCompoundComponent,
	OptOutConfirmationProps,
} from './components/opt-out-confirmation';
import type {
	ConsentDialogCompoundComponent,
	ConsentDialogProps,
} from './components/panel';
import type {
	ConsentWidgetCompoundComponent,
	ConsentWidgetProps,
} from './components/preferences';
import { BANNER_SHEETS } from './components/shared/first-paint-sheets';
import { preloadSurfaceSheets } from './components/shared/surface-styles';
import { importDialog } from './deferred/trigger';
import { useActiveUI } from './hooks';
import {
	useHasOptOutConfirmationHost,
	useOptInConfirmationHost,
	useOptInConfirmationOpen,
	useOptOutConfirmationOpen,
} from './hooks/use-opt-out';
import { createDeferredModule } from './utils/deferred-module';

type AnyComponent = ComponentType<Record<string, unknown>>;

// Vite derives chunk names from these paths. Keep them neutral so URL filters
// do not block the UI. Each module is shared by its default and compound exports.
// The banner's sheets, which the dialog renders under its own, load beside
// the dialog's code when the page lacks them (a visitor who saw no banner). The dialog waits for it before opening, so a failed
// sheet load leaves the module usable. The panel loads through the deferred
// root's dialog chunk (`importDialog`), so a warmed dialog and an early one
// share one download.
const dialogModule = createDeferredModule(async () => {
	void preloadSurfaceSheets(BANNER_SHEETS);
	return (await importDialog()).panel;
});
const widgetModule = createDeferredModule(
	() => import('./components/preferences')
);
const optOutConfirmationModule = createDeferredModule(async () => {
	void preloadSurfaceSheets(BANNER_SHEETS);
	return await import('./components/opt-out-confirmation');
});
const optInConfirmationModule = createDeferredModule(async () => {
	void preloadSurfaceSheets(BANNER_SHEETS);
	return await import('./components/opt-in-confirmation');
});
const lazyDialogExport = (name: string) =>
	dialogModule.component(
		(module) => (module as Record<string, unknown>)[name] as AnyComponent
	);
const lazyWidgetExport = (name: string) =>
	widgetModule.component(
		(module) => (module as Record<string, unknown>)[name] as AnyComponent
	);
const lazyOptOutConfirmationExport = (name: string) =>
	optOutConfirmationModule.component(
		(module) => (module as Record<string, unknown>)[name] as AnyComponent
	);

/**
 * The v6 "Your Privacy Choices" dialog (`design: 'privacy-choices'`), in a
 * chunk of its own with its stylesheet, loaded when it opens and warmed
 * like the classic dialog. A page on the classic design never loads it.
 */
const privacyChoicesDialogModule = createDeferredModule(
	() => import('./components/privacy-choices-dialog')
);
const LazyPrivacyChoicesDialog = privacyChoicesDialogModule.component(
	(module) => module.PrivacyChoicesDialog
);

/**
 * The design the mounted `ConsentDialog` renders, so warming loads only
 * that design's dialog.
 */
let warmDesign: 'classic' | 'privacy-choices' = 'classic';

registerDialogChunkWarmer(() => {
	if (warmDesign === 'privacy-choices') {
		void privacyChoicesDialogModule.preload();
	} else {
		void dialogModule.preload();
	}
});
const LazyConsentDialogComponent = dialogModule.component(
	(module) => module.ConsentDialog
);
const LazyConsentWidgetComponent = widgetModule.component(
	(module) => module.ConsentWidget
);
const LazyOptOutConfirmationComponent = optOutConfirmationModule.component(
	(module) => module.OptOutConfirmation
);
const LazyOptInConfirmationComponent = optInConfirmationModule.component(
	(module) => module.OptInConfirmation
);

const LazyOptInConfirmationHost = (props: OptInConfirmationProps) => {
	const active = useOptInConfirmationHost();
	if (!active) {
		return null;
	}
	return <LazyOptInConfirmationComponent {...props} />;
};

const LazyConsentDialog = (props: ConsentDialogProps) => {
	const activeUI = useActiveUI();
	const confirmationOpen = useOptOutConfirmationOpen();
	const hasStandaloneConfirmation = useHasOptOutConfirmationHost();
	const optInConfirmationOpen = useOptInConfirmationOpen();
	const { banner } = useHeadlessConsentUI();
	const privacyChoices = banner.design === 'privacy-choices';
	useEffect(() => {
		warmDesign = privacyChoices ? 'privacy-choices' : 'classic';
	}, [privacyChoices]);
	// A shown banner can open the dialog at any moment, whatever renders it.
	useIdleDialogWarming(activeUI === 'banner');
	if (privacyChoices) {
		// The v6 dialog loads on open, never with the banner (PERM-05: the
		// banner leaves at once when it opens).
		if (props.open === true || activeUI === 'dialog') {
			return (
				<LazyPrivacyChoicesDialog
					open={props.open}
					noStyle={props.noStyle}
					disableAnimation={props.disableAnimation}
					models={props.models}
					uiSource={props.uiSource}
				/>
			);
		}
		return null;
	}
	const shouldLoadDialog =
		props.open === true || activeUI === 'dialog' || Boolean(props.showTrigger);
	if (shouldLoadDialog) {
		return <LazyConsentDialogComponent {...props} />;
	}
	if (confirmationOpen && !hasStandaloneConfirmation) {
		return (
			<LazyOptOutConfirmationComponent
				embedded
				noStyle={props.noStyle}
				disableAnimation={props.disableAnimation}
				scrollLock={props.scrollLock}
				trapFocus={props.trapFocus}
			/>
		);
	}
	if (optInConfirmationOpen) {
		return (
			<LazyOptInConfirmationHost
				noStyle={props.noStyle}
				disableAnimation={props.disableAnimation}
				scrollLock={props.scrollLock}
				trapFocus={props.trapFocus}
			/>
		);
	}
	return null;
};

const LazyOptOutConfirmation = (props: OptOutConfirmationProps) => {
	const confirmationOpen = useOptOutConfirmationOpen();
	if (props.open !== true && !confirmationOpen) {
		return null;
	}
	return <LazyOptOutConfirmationComponent {...props} />;
};

const LazyConsentWidget = (props: ConsentWidgetProps) => (
	<LazyConsentWidgetComponent {...props} />
);

const withLazyProperties = function withLazyProperties<T extends AnyComponent>(
	component: T,
	names: readonly string[],
	factory: (name: string) => AnyComponent
): T {
	const cache: Record<string, AnyComponent> = {};
	for (const name of names) {
		Object.defineProperty(component, name, {
			configurable: true,
			enumerable: true,
			get() {
				cache[name] ??= factory(name);
				return cache[name];
			},
		});
	}
	return component;
};

export const ConsentDialog = withLazyProperties(
	LazyConsentDialog,
	[
		'Card',
		'Header',
		'HeaderTitle',
		'HeaderDescription',
		'Content',
		'Footer',
		'ConsentCustomizationCard',
		'ConsentDialogFooter',
		'ConsentDialogHeader',
		'ConsentDialogHeaderTitle',
		'ConsentDialogHeaderDescription',
		'ConsentDialogContent',
		'Overlay',
		'Root',
	],
	lazyDialogExport
) as ConsentDialogCompoundComponent;

export const ConsentWidget = withLazyProperties(
	LazyConsentWidget,
	[
		'AccordionTrigger',
		'AccordionTriggerInner',
		'AccordionContent',
		'AccordionArrow',
		'Accordion',
		'Switch',
		'AccordionItems',
		'AccordionItem',
		'VendorList',
		'Root',
		'AcceptAllButton',
		'CustomizeButton',
		'SaveButton',
		'RejectButton',
		'PolicyActions',
		'Footer',
		'FooterSubGroup',
	],
	lazyWidgetExport
) as ConsentWidgetCompoundComponent;

export const OptOutConfirmation = withLazyProperties(
	LazyOptOutConfirmation,
	[
		'Card',
		'Description',
		'DoneButton',
		'Footer',
		'Header',
		'Overlay',
		'PreferencesLink',
		'Root',
		'Status',
		'Title',
	],
	lazyOptOutConfirmationExport
) as OptOutConfirmationCompoundComponent;
