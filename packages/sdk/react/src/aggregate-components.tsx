'use client';

import {
	claimOptOutConfirmationHost,
	showConsentSurface,
} from '@inth/sdk/surface-actions';
import { useEffect } from 'react';
import type { ComponentType } from 'react';

import type { ConsentDialogProps } from './components/dialog/panel.model';
import type { OptInConfirmationProps } from './components/opt-in-confirmation';
import type {
	OptOutConfirmationCompoundComponent,
	OptOutConfirmationProps,
} from './components/opt-out-confirmation';
import type { ConsentDialogTriggerProps } from './components/panel-trigger';
import { requestReceiptFocus } from './components/parts/receipt-focus.model';
import type {
	ConsentWidgetCompoundComponent,
	ConsentWidgetProps,
} from './components/preferences';
import { PARTS_SHEETS } from './components/shared/parts-sheets';
import { preloadSurfaceSheets } from './components/shared/surface-styles';
import { importDialog } from './deferred/schedule-deferred-engine';
import { useActiveUI, useModel } from './hooks';
import { useIABPolicyGuard } from './hooks/use-iab-policy-guard';
import {
	useHasOptOutConfirmationHost,
	useOptInConfirmationHost,
	useOptInConfirmationOpen,
	useOptOutConfirmationOpen,
} from './hooks/use-opt-out';
import { useIdleDialogWarming } from './use-idle-dialog-warming';
import { useKernel } from './use-kernel';
import { createDeferredModule } from './utils/create-deferred-module';
import { registerDialogChunkWarmer } from './warm-dialog-chunk';

type AnyComponent = ComponentType<Record<string, unknown>>;

// Vite derives chunk names from these paths. Keep them neutral so URL filters
// do not block the UI. Each module is shared by its default and compound exports.
/**
 * The dialog, in a chunk of its own with its stylesheet, loaded when it
 * opens or when something warms it. It loads through the deferred root's
 * dialog chunk (`importDialog`), so a warmed dialog and an early one share
 * one download.
 */
const dialogModule = createDeferredModule(
	async () => (await importDialog()).dialog
);
const LazyDialogBody = dialogModule.component(
	(module) => module.ConsentDialogBody
);
const widgetModule = createDeferredModule(
	() => import('./components/preferences')
);
const optOutConfirmationModule = createDeferredModule(async () => {
	void preloadSurfaceSheets(PARTS_SHEETS);
	return await import('./components/opt-out-confirmation');
});
const optInConfirmationModule = createDeferredModule(async () => {
	void preloadSurfaceSheets(PARTS_SHEETS);
	return await import('./components/opt-in-confirmation');
});
const lazyWidgetExport = (name: string) =>
	widgetModule.component(
		(module) => (module as Record<string, unknown>)[name] as AnyComponent
	);
const lazyOptOutConfirmationExport = (name: string) =>
	optOutConfirmationModule.component(
		(module) => (module as Record<string, unknown>)[name] as AnyComponent
	);

const triggerModule = createDeferredModule(
	() => import('./components/panel-trigger')
);
const LazyConsentDialogTrigger = triggerModule.component(
	(module) => module.ConsentDialogTrigger
);

/**
 * Mounted `ConsentDialog`s, so warming loads the dialog only on a page that
 * can open it. A warm request before any dialog mounts waits for one.
 */
let mountedDialogs = 0;
let warmRequested = false;

registerDialogChunkWarmer(() => {
	warmRequested = true;
	if (mountedDialogs > 0) {
		void dialogModule.preload();
	}
});

/** Count this dialog while it is mounted, and warm it if asked. */
const useWarmableDialog = function useWarmableDialog(): void {
	useEffect(() => {
		mountedDialogs += 1;
		if (warmRequested) {
			void dialogModule.preload();
		}
		return () => {
			mountedDialogs -= 1;
		};
	}, []);
};

const resolveTriggerProps = (
	showTrigger: ConsentDialogProps['showTrigger']
): ConsentDialogTriggerProps | null => {
	if (showTrigger === true) {
		return {};
	}
	return showTrigger ? showTrigger : null;
};
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
	// A policy that needs <IABProvider> fails loudly wherever the dialog is
	// mounted, open or not, as the banner does.
	useIABPolicyGuard();
	const kernel = useKernel();
	const activeUI = useActiveUI();
	const confirmationOpen = useOptOutConfirmationOpen();
	const hasStandaloneConfirmation = useHasOptOutConfirmationHost();
	const optInConfirmationOpen = useOptInConfirmationOpen();
	useWarmableDialog();
	// A shown banner can open the dialog at any moment, whatever renders it.
	useIdleDialogWarming(activeUI === 'banner');
	// The dialog confirms an opt-out on its receipt: the opt-out confirmation
	// (after a revocation reload, or from a one-click opt-out link) opens the
	// dialog there instead. A standalone `OptOutConfirmation` the host
	// mounted still shows it itself.
	const model = useModel();
	const embeddedConfirmation = confirmationOpen && !hasStandaloneConfirmation;
	const dialogCanShow = canDialogShow(props, model);
	const adoptConfirmation = embeddedConfirmation && dialogCanShow;
	useEffect(() => {
		if (!adoptConfirmation) {
			return;
		}
		requestReceiptFocus(kernel);
		// Opening the dialog closes the confirmation.
		showConsentSurface(kernel, 'dialog');
	}, [adoptConfirmation, kernel]);
	const triggerProps = resolveTriggerProps(props.showTrigger);
	// The dialog loads on open, never with the banner (PERM-05: the banner
	// leaves at once when it opens).
	const dialogOpen = props.open === true || activeUI === 'dialog';
	return (
		<>
			{triggerProps ? <LazyConsentDialogTrigger {...triggerProps} /> : null}
			{embeddedConfirmation && !dialogCanShow ? (
				// This dialog does not open under the model, or the host keeps it
				// closed, so the confirmation shows on its own.
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
				<LazyDialogBody
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
};

const LazyOptOutConfirmation = (props: OptOutConfirmationProps) => {
	const kernel = useKernel();
	const confirmationOpen = useOptOutConfirmationOpen();
	// Claim the host from the first render, not once the lazy view loads, so
	// a mounted `ConsentDialog` never adopts the confirmation this one shows.
	useEffect(() => {
		if (props.embedded) {
			return;
		}
		return claimOptOutConfirmationHost(kernel, Symbol('OptOutConfirmation'));
	}, [kernel, props.embedded]);
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

/**
 * The consent dialog ("Your Privacy Choices"). Its code and stylesheet load
 * when it opens, or earlier when something warms it.
 */
export const ConsentDialog: ComponentType<ConsentDialogProps> =
	LazyConsentDialog;

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
