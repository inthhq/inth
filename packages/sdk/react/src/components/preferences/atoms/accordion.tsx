import type { AllConsentNames, ConsentType } from '@inth/sdk/engine';
import {
	consentTypes,
	resolveCategoryOptOutLock,
	resolveCategoryTitle,
	resolveOptOutCopy,
} from '@inth/sdk/surface-state';
import accordionStyles from '@inth/sdk/ui/styles/components/accordion';
import {
	createContext,
	forwardRef as createForwardRef,
	useCallback,
	useContext,
	useMemo,
} from 'react';
import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { Box } from '~/components/shared/primitives/box';
import type { BoxProps } from '~/components/shared/primitives/box';
import { LucideIcon } from '~/components/shared/ui/lucide-icon';
import * as PreferenceItem from '~/components/shared/ui/preference-item';
import * as RadixSwitch from '~/components/shared/ui/switch';
import { useConsentDraftSlice, useConsentDraftStore } from '~/draft';
import { useSnapshot } from '~/hooks';
import { useTheme } from '~/hooks/use-theme';

import { ConsentWidgetVendorList } from './consent-widget-vendor-list';

interface ConsentWidgetAccordionContextValue {
	noStyle?: boolean;
	onToggleItem: (value: string, open: boolean) => void;
	openValues: string[];
}

const ConsentWidgetAccordionContext =
	createContext<ConsentWidgetAccordionContextValue | null>(null);

const useConsentWidgetAccordionContext =
	function useConsentWidgetAccordionContext() {
		const context = useContext(ConsentWidgetAccordionContext);

		if (!context) {
			throw new Error(
				'ConsentWidgetAccordion components must be used within ConsentWidgetAccordion'
			);
		}

		return context;
	};

const ConsentWidgetAccordionTrigger = createForwardRef<
	HTMLDivElement,
	BoxProps
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={accordionStyles.triggerRow}
		{...props}
	>
		{children}
	</Box>
));
ConsentWidgetAccordionTrigger.displayName = 'ConsentWidgetAccordionTrigger';

const ConsentWidgetAccordionTriggerInner = PreferenceItem.Trigger;
const ConsentWidgetAccordionContent = PreferenceItem.Content;
const ConsentWidgetAccordionArrow = PreferenceItem.Leading;
const ConsentWidgetSwitch = RadixSwitch.Root;

type ConsentWidgetAccordionProps = Omit<BoxProps, 'slotKey'> & {
	'data-testid'?: string;
	children: ReactNode;
	onValueChange?: (value: string | string[]) => void;
	type?: 'multiple' | 'single';
	value?: string | string[];
};

const normalizeAccordionValue = (
	value: string | string[] | undefined
): string[] => {
	if (Array.isArray(value)) {
		return value;
	}
	return value ? [value] : [];
};

const ConsentWidgetAccordion = ({
	'data-testid': dataTestId,
	children,
	className,
	noStyle,
	onValueChange,
	style,
	type = 'multiple',
	value,
	...props
}: ConsentWidgetAccordionProps) => {
	const { noStyle: contextNoStyle } = useTheme();
	const finalNoStyle = noStyle ?? contextNoStyle;
	const openValues = useMemo(() => normalizeAccordionValue(value), [value]);

	const onToggleItem = useCallback(
		(itemValue: string, open: boolean) => {
			if (type === 'single') {
				onValueChange?.(open ? itemValue : '');
				return;
			}

			const nextValues = open
				? [...new Set([...openValues, itemValue])]
				: openValues.filter((currentValue) => currentValue !== itemValue);

			onValueChange?.(nextValues);
		},
		[onValueChange, openValues, type]
	);

	const contextValue = useMemo(
		() => ({ noStyle: finalNoStyle, onToggleItem, openValues }),
		[finalNoStyle, onToggleItem, openValues]
	);

	return (
		<ConsentWidgetAccordionContext.Provider value={contextValue}>
			<Box
				className={className}
				data-testid={dataTestId ?? 'consent-widget-accordion'}
				noStyle={noStyle}
				style={style}
				slotKey="accordion.root"
				baseClassName={accordionStyles.list}
				{...props}
			>
				{children}
			</Box>
		</ConsentWidgetAccordionContext.Provider>
	);
};

// Created once: a component type made during render would remount the icon
// on every render.
// No title: the icon is decorative, and a title would join the trigger's
// text content in tooling that reads it.
const OpenIcon = LucideIcon({ iconPath: <path d="M5 12h14M12 5v14" /> });
const CloseIcon = LucideIcon({ iconPath: <path d="M5 12h14" /> });

interface ConsentWidgetAccordionRowProps {
	consent: ConsentType;
	title: string;
	description: string;
	gpcLocked: boolean;
	restrictionReason: string | null;
	open: boolean;
	noStyle?: boolean;
	onToggleItem: (value: string, open: boolean) => void;
}

/**
 * One category row. It subscribes to its own draft value, so staging a
 * toggle re-renders only the row that changed.
 */
const ConsentWidgetAccordionRow = ({
	consent,
	title,
	description,
	gpcLocked,
	restrictionReason,
	open,
	noStyle,
	onToggleItem,
}: ConsentWidgetAccordionRowProps) => {
	const draft = useConsentDraftStore();
	const checked = useConsentDraftSlice(
		draft,
		(snapshot) => snapshot.values[consent.name]
	);
	const disabled = Boolean(consent.disabled) || gpcLocked;

	return (
		<PreferenceItem.Root
			className={noStyle ? undefined : accordionStyles.item}
			data-testid={`consent-widget-accordion-item-${consent.name}`}
			noStyle
			onOpenChange={(next) => onToggleItem(consent.name, next)}
			open={open}
			slotKey="accordion-item.root"
		>
			<ConsentWidgetAccordionTrigger slotKey="accordion.triggerRow">
				{/* The testid names the button, not the row that holds it,
				    so it means the same element in every adapter. */}
				<ConsentWidgetAccordionTriggerInner
					className={noStyle ? undefined : accordionStyles.trigger}
					data-testid={`consent-widget-accordion-trigger-${consent.name}`}
					noStyle
					slotKey="accordion-item.trigger"
				>
					<ConsentWidgetAccordionArrow
						className={noStyle ? undefined : accordionStyles.arrow}
						data-testid={`consent-widget-accordion-arrow-${consent.name}`}
						noStyle
						slotKey="accordion.arrow"
					>
						{/* Decorative: the trigger's name is the category title and
						    `aria-expanded` carries the state, so the icon stays out
						    of the accessible name in every framework. */}
						{open ? (
							<CloseIcon aria-hidden="true" />
						) : (
							<OpenIcon aria-hidden="true" />
						)}
					</ConsentWidgetAccordionArrow>
					<PreferenceItem.Header
						noStyle
						slotKey="accordion.header"
					>
						<PreferenceItem.Title
							className={noStyle ? undefined : accordionStyles.title}
							noStyle
							slotKey="accordion.title"
						>
							{title}
						</PreferenceItem.Title>
					</PreferenceItem.Header>
				</ConsentWidgetAccordionTriggerInner>

				<PreferenceItem.Control
					className={noStyle ? undefined : accordionStyles.control}
					noStyle
					slotKey="accordion.control"
				>
					<ConsentWidgetSwitch
						aria-label={title}
						checked={checked}
						aria-describedby={
							restrictionReason ? `inth-restriction-${consent.name}` : undefined
						}
						onCheckedChange={(value) => draft.set(consent.name, value)}
						disabled={disabled}
						size="small"
						data-testid={`consent-widget-switch-${consent.name}`}
					/>
				</PreferenceItem.Control>
			</ConsentWidgetAccordionTrigger>
			{restrictionReason ? (
				<output
					className={noStyle ? undefined : accordionStyles.restriction}
					data-testid={`consent-widget-restriction-${consent.name}`}
					id={`inth-restriction-${consent.name}`}
				>
					{restrictionReason}
				</output>
			) : null}
			<ConsentWidgetAccordionContent
				className={noStyle ? undefined : accordionStyles.content}
				data-testid={`consent-widget-accordion-content-${consent.name}`}
				innerClassName={noStyle ? undefined : accordionStyles.contentInner}
				innerSlotKey="accordion.contentInner"
				slotKey="accordion-item.content"
				viewportClassName={
					noStyle ? undefined : accordionStyles.contentViewport
				}
				viewportSlotKey="accordion.contentViewport"
			>
				{description}
				<ConsentWidgetVendorList
					category={consent.name}
					hideHint={gpcLocked}
					noStyle={noStyle}
				/>
			</ConsentWidgetAccordionContent>
		</PreferenceItem.Root>
	);
};

const ConsentWidgetAccordionItems = () => {
	// The draft's list, in its order, so every framework lists the same rows
	// in the same order.
	const displayedCategories = useConsentDraftSlice(
		useConsentDraftStore(),
		(state) => state.displayedCategories
	);
	const snapshot = useSnapshot();
	const { noStyle, onToggleItem, openValues } =
		useConsentWidgetAccordionContext();
	const translations = useTranslations();
	const optOutCopy = resolveOptOutCopy(translations);

	const restrictionReasonFor = function restrictionReasonFor(
		name: AllConsentNames,
		optOutLock: ReturnType<typeof resolveCategoryOptOutLock>
	): string | null {
		if (name === 'necessary') {
			return null;
		}
		if (optOutLock === 'gpc-active') {
			return optOutCopy.lockedByGpc;
		}
		if (optOutLock === 'held-by-account') {
			return optOutCopy.lockedByAccount;
		}
		const decision = snapshot.explicitChoice?.categories[name];
		const reasons = snapshot.restrictions[name];
		if (
			decision?.value === true &&
			reasons?.some((reason) => reason !== 'opt-out')
		) {
			return 'Your saved choice is restricted by the current privacy settings.';
		}
		return null;
	};

	const consents = useMemo(
		() =>
			displayedCategories.flatMap((name) =>
				consentTypes.filter((type) => type.name === name)
			),
		[displayedCategories]
	);

	return consents.map((consent) => {
		const optOutLock = resolveCategoryOptOutLock(snapshot, consent.name);
		return (
			<ConsentWidgetAccordionRow
				key={consent.name}
				consent={consent}
				description={
					translations.consentTypes[consent.name]?.description ??
					consent.description
				}
				gpcLocked={optOutLock === 'gpc-active'}
				noStyle={noStyle}
				onToggleItem={onToggleItem}
				open={openValues.includes(consent.name)}
				restrictionReason={restrictionReasonFor(consent.name, optOutLock)}
				title={resolveCategoryTitle(translations, consent.name)}
			/>
		);
	});
};

const ConsentWidgetAccordionItem = createForwardRef<
	HTMLDivElement,
	ComponentPropsWithoutRef<typeof PreferenceItem.Root>
>(({ className, ...rest }, forwardedRef) => (
	<PreferenceItem.Root
		ref={forwardedRef}
		className={[accordionStyles.item, className].filter(Boolean).join(' ')}
		noStyle
		{...rest}
	/>
));
ConsentWidgetAccordionItem.displayName = 'ConsentWidgetAccordionItem';

const AccordionTriggerInner = ConsentWidgetAccordionTriggerInner;
const AccordionTrigger = ConsentWidgetAccordionTrigger;
const AccordionContent = ConsentWidgetAccordionContent;
const AccordionArrow = ConsentWidgetAccordionArrow;
const Accordion = ConsentWidgetAccordion;
const Switch = ConsentWidgetSwitch;
const AccordionItems = ConsentWidgetAccordionItems;
const AccordionItem = ConsentWidgetAccordionItem;
const VendorList = ConsentWidgetVendorList;

export {
	ConsentWidgetVendorList,
	VendorList,
	Accordion,
	AccordionArrow,
	AccordionContent,
	AccordionItem,
	AccordionItems,
	AccordionTrigger,
	AccordionTriggerInner,
	ConsentWidgetAccordion,
	ConsentWidgetAccordionArrow,
	ConsentWidgetAccordionContent,
	ConsentWidgetAccordionItem,
	ConsentWidgetAccordionItems,
	ConsentWidgetAccordionTrigger,
	ConsentWidgetAccordionTriggerInner,
	ConsentWidgetSwitch,
	Switch,
};
