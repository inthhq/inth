'use client';

import { showConsentSurface } from '@inth/sdk/surface-actions';
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
import type { ConsentDialogTriggerProps } from './components/panel-trigger';
import type {
	ConsentWidgetCompoundComponent,
	ConsentWidgetProps,
} from './components/preferences';
import { requestReceiptFocus } from './components/privacy-choices/receipt-focus';
import { BANNER_SHEETS } from './components/shared/first-paint-sheets';
import { preloadSurfaceSheets } from './components/shared/surface-styles';
import { importDialog } from './deferred/trigger';
import { useActiveUI, useModel } from './hooks';
import {
	useHasOptOutConfirmationHost,
	useOptInConfirmationHost,
	useOptInConfirmationOpen,
	useOptOutConfirmationOpen,
} from './hooks/use-opt-out';
import { useKernel } from './kernel-selector';
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

const triggerModule = createDeferredModule(
	() => import('./components/panel-trigger')
);
const LazyConsentDialogTrigger = triggerModule.component(
	(module) => module.ConsentDialogTrigger
);

type DialogDesign = 'classic' | 'privacy-choices';

/**
 * Mounted `ConsentDialog`s by the design each renders, so warming loads
 * only the dialogs a page can open: never the classic chunk and its
 * sheets for a Privacy Choices page, whatever was hovered before the
 * dialog mounted. A warm request before any dialog mounts waits for one.
 */
const mountedDesigns: Record<DialogDesign, number> = {
	classic: 0,
	'privacy-choices': 0,
};
let warmRequested = false;

const warmDesign = function warmDesign(design: DialogDesign): void {
	if (design === 'privacy-choices') {
		void privacyChoicesDialogModule.preload();
	} else {
		void dialogModule.preload();
	}
};

registerDialogChunkWarmer(() => {
	warmRequested = true;
	for (const design of ['classic', 'privacy-choices'] as const) {
		if (mountedDesigns[design] > 0) {
			warmDesign(design);
		}
	}
});

/** Count this dialog's design while it is mounted, and warm it if asked. */
const useWarmableDesign = function useWarmableDesign(
	design: DialogDesign
): void {
	useEffect(() => {
		mountedDesigns[design] += 1;
		if (warmRequested) {
			warmDesign(design);
		}
		return () => {
			mountedDesigns[design] -= 1;
		};
	}, [design]);
};

const resolveTriggerProps = (
	showTrigger: ConsentDialogProps['showTrigger']
): ConsentDialogTriggerProps | null => {
	if (showTrigger === true) {
		return {};
	}
	return showTrigger ? showTrigger : null;
};
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

/**
 * Whether the dialog can render now: its `models` allow the policy's model,
 * and a controlled `open={false}` does not keep it hidden. Only then can it
 * take the opt-out confirmation over.
 */
const canDialogShow = (
	{ models, open }: ConsentDialogProps,
	model: ReturnType<typeof useModel>
): boolean =>
	(!models || model === null || models.includes(model)) && open !== false;

const LazyConsentDialog = (props: ConsentDialogProps) => {
	const kernel = useKernel();
	const activeUI = useActiveUI();
	const confirmationOpen = useOptOutConfirmationOpen();
	const hasStandaloneConfirmation = useHasOptOutConfirmationHost();
	const optInConfirmationOpen = useOptInConfirmationOpen();
	const { banner } = useHeadlessConsentUI();
	const privacyChoices = banner.design === 'privacy-choices';
	useWarmableDesign(privacyChoices ? 'privacy-choices' : 'classic');
	// A shown banner can open the dialog at any moment, whatever renders it.
	useIdleDialogWarming(activeUI === 'banner');
	// The Privacy Choices design confirms an opt-out on its receipt, in the
	// dialog: the opt-out confirmation (after a revocation reload, or from a
	// one-click opt-out link) opens the dialog there instead. A standalone
	// `OptOutConfirmation` the host mounted still shows it itself.
	const model = useModel();
	const embeddedConfirmation = confirmationOpen && !hasStandaloneConfirmation;
	const dialogCanShow = canDialogShow(props, model);
	const adoptConfirmation =
		privacyChoices && embeddedConfirmation && dialogCanShow;
	useEffect(() => {
		if (!adoptConfirmation) {
			return;
		}
		requestReceiptFocus(kernel);
		// Opening the dialog closes the confirmation.
		showConsentSurface(kernel, 'dialog');
	}, [adoptConfirmation, kernel]);
	if (privacyChoices) {
		const triggerProps = resolveTriggerProps(props.showTrigger);
		// The v6 dialog loads on open, never with the banner (PERM-05: the
		// banner leaves at once when it opens).
		const dialogOpen = props.open === true || activeUI === 'dialog';
		return (
			<>
				{triggerProps ? <LazyConsentDialogTrigger {...triggerProps} /> : null}
				{embeddedConfirmation && !dialogCanShow ? (
					// This dialog does not open under the model, or the host
					// keeps it closed, so the confirmation shows as on the
					// classic design.
					<LazyOptOutConfirmationComponent
						embedded
						noStyle={props.noStyle}
						disableAnimation={props.disableAnimation}
						scrollLock={props.scrollLock}
						trapFocus={props.trapFocus}
					/>
				) : null}
				{optInConfirmationOpen ? (
					<LazyOptInConfirmationHost
						noStyle={props.noStyle}
						disableAnimation={props.disableAnimation}
						scrollLock={props.scrollLock}
						trapFocus={props.trapFocus}
					/>
				) : null}
				{dialogOpen ? (
					<LazyPrivacyChoicesDialog
						open={props.open}
						noStyle={props.noStyle}
						disableAnimation={props.disableAnimation}
						models={props.models}
						uiSource={props.uiSource}
						legalLinks={props.legalLinks}
					/>
				) : null}
			</>
		);
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
