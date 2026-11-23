/**
 * The owed-prompt dialog: every category in scope, one switch each, and a save
 * that writes exactly what the subject is looking at.
 *
 * The component is split in two on purpose. The outer half reads copy only, so
 * a grant made somewhere else in the app leaves it alone; the inner half reads
 * the category list and exists only while the sheet is on screen. A dialog that
 * is mounted and shut therefore holds no consent subscription at all, which is
 * what lets `<ConsentBanner />` ship its own manager for free.
 */

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useSaveConsents } from '../hooks/use-consent-actions';
import { useConsentSelector } from '../hooks/use-consent-selector';
import {
	isConsentCategoryRowsEqual,
	selectConsentCategoryRows,
	useCategorySelection,
} from './internal/consent-category-rows.model';
import { ConsentBrandingTag } from './internal/consent-branding-tag';
import {
	CONSENT_BUTTON_ROW_ITEM,
	ConsentButton,
} from './internal/consent-button';
import { ConsentCategoryRow } from './internal/consent-category-row';
import {
	isConsentCopyEqual,
	selectConsentCopy,
} from './internal/consent-copy.model';
import type { ConsentCopy } from './internal/consent-copy.model';
import {
	ConsentSurface,
	ConsentSurfaceBody,
	ConsentSurfaceFooter,
	ConsentSurfaceHeader,
	ConsentSurfaceTitle,
	useConsentSurfaceFrame,
} from './internal/consent-surface';
import { useAnnounceOnOpen } from './internal/use-announce-on-open';
import type { ConsentPartStyles } from './theme/consent-theme-parts';
import type { ConsentTheme } from './theme/create-consent-theme';
import { useConsentStyles } from './theme/use-consent-styles';

/** Props for {@link ConsentDialog}. */
export interface ConsentDialogProps {
	/**
	 * Hide the "Consent by c15t" tab.
	 *
	 * Off by default, which is what the web surfaces do: the tab is what tells a
	 * subject who is holding their consent, and a plan that has already paid for
	 * removing it is the only reason to.
	 */
	readonly hideBranding?: boolean;
	/** Entry point to the app's own preference centre, rendered when supplied. */
	readonly onOpenPreferences?: () => void;
	/**
	 * Request closing after dismissal or a successful local save.
	 * Keep this callback idempotent: a pending save may finish after dismissal.
	 * A save finishing after unmount or while Activity hides the dialog does not
	 * call it. Keep the dialog mounted and control visibility with `open` if the
	 * host relies on this callback to clear its open state.
	 */
	readonly onRequestClose: () => void;
	/** Whether the dialog is open. */
	readonly open: boolean;
	/**
	 * How the card is anchored.
	 *
	 * `dialog` centres it inside the overlay with a 16pt gutter on every side and
	 * caps it at the web card's 448pt width, which is what the web surface does and
	 * the default here. `sheet` drops it to the bottom edge with a grab handle
	 * above it instead: a legitimate choice on a phone, and a host with a lot of
	 * categories to reach may prefer the taller card, but it is not what the web
	 * surface looks like.
	 */
	readonly presentation?: 'dialog' | 'sheet';
	/** Per-part style overrides. */
	readonly styles?: ConsentPartStyles;
	/** Theme to render with, instead of the platform scheme. */
	readonly theme?: ConsentTheme;
}

/** What the sheet contents need, handed down so they read the snapshot once. */
interface ConsentDialogContentProps {
	/** Copy resolved by the outer half. */
	readonly copy: ConsentCopy;
	/** Entry point to the app's own preference centre. */
	readonly onOpenPreferences?: () => void;
	/** Request closing after dismissal or a successful local save. */
	readonly onRequestClose: () => void;
}

/**
 * The list, the switches, and the save button.
 *
 * Mounted only while the sheet is on screen.
 *
 * @param props - Content props.
 * @returns The contents of the sheet.
 */
const ConsentDialogContent = ({
	copy,
	onOpenPreferences,
	onRequestClose,
}: ConsentDialogContentProps): ReactNode => {
	const saveConsents = useSaveConsents();
	const rows = useConsentSelector(
		selectConsentCategoryRows,
		isConsentCategoryRowsEqual
	);
	const selection = useCategorySelection(rows);
	const { isCurrentPresentation, parts, theme } = useConsentSurfaceFrame();
	const [busy, setBusy] = useState(false);
	const [saveFailed, setSaveFailed] = useState(false);
	const pending = useRef(false);
	useAnnounceOnOpen(saveFailed, copy.saveError);

	const save = async (): Promise<void> => {
		if (pending.current) {
			return;
		}

		pending.current = true;
		setBusy(true);
		setSaveFailed(false);

		let written = false;

		try {
			written = (await saveConsents(selection.commitSelection())).ok;
			setSaveFailed(!written);
		} catch {
			setSaveFailed(true);
			// Keep the draft available for retry after a bridge failure.
		}

		pending.current = false;
		setBusy(false);

		if (written && isCurrentPresentation()) {
			selection.reset();
			onRequestClose();
		}
	};

	/**
	 * Take one of the two whole-sheet decisions.
	 *
	 * A decision is not a save. The label promises everything or nothing, so the
	 * draft on screen is abandoned rather than carried into it, and the switches
	 * reset so that reopening the sheet shows what was written instead of the
	 * toggles that were never applied. Failure follows the save rule: the core
	 * keeps the error, the sheet stays open, and the draft is where it was.
	 *
	 * @param choice - Which way to decide.
	 * @returns Nothing.
	 */
	const decide = async (choice: 'accept' | 'reject'): Promise<void> => {
		if (pending.current) {
			return;
		}

		pending.current = true;
		setBusy(true);
		setSaveFailed(false);

		let written = false;

		try {
			written = (await saveConsents(choice === 'accept' ? 'all' : 'none')).ok;
			setSaveFailed(!written);
		} catch {
			setSaveFailed(true);
			// Same as a failed save: the sheet stays open with the draft intact.
		}

		pending.current = false;
		setBusy(false);

		if (written && isCurrentPresentation()) {
			selection.reset();
			onRequestClose();
		}
	};

	return (
		<>
			<ConsentSurfaceHeader>
				<ConsentSurfaceTitle>{copy.dialogTitle}</ConsentSurfaceTitle>
				<Text style={parts.description}>{copy.dialogDescription}</Text>
			</ConsentSurfaceHeader>
			<ConsentSurfaceBody>
				{selection.rows.map((row) => (
					<ConsentCategoryRow
						key={row.key}
						onToggle={(value) => {
							selection.toggle(row.key, value);
						}}
						parts={parts}
						row={row}
						theme={theme}
					/>
				))}
			</ConsentSurfaceBody>
			<ConsentSurfaceFooter>
				{saveFailed ? (
					<Text
						accessibilityRole="alert"
						style={parts.description}
					>
						{copy.saveError}
					</Text>
				) : null}
				{/*
				 * The two decisions share a row in the neutral outline and the action
				 * that writes the draft takes the accent below them, which is the split
				 * `policy-actions.ts` draws for a preference surface: there
				 * `primaryActions` defaults to `save`, so reject and accept stay neutral
				 * together. Leaving the decisions out of a surface that owes a prompt
				 * meant a subject could not grant or deny everything without flicking
				 * five switches.
				 */}
				<View style={parts.row}>
					<ConsentButton
						disabled={busy}
						kind="secondary"
						label={copy.rejectAll}
						testID="inth.prefs.reject-all"
						onPress={() => {
							void decide('reject');
						}}
						parts={parts}
						style={CONSENT_BUTTON_ROW_ITEM}
					/>
					<ConsentButton
						disabled={busy}
						kind="secondary"
						label={copy.acceptAll}
						testID="inth.prefs.accept-all"
						onPress={() => {
							void decide('accept');
						}}
						parts={parts}
						style={CONSENT_BUTTON_ROW_ITEM}
					/>
				</View>
				<ConsentButton
					disabled={busy}
					label={copy.save}
					testID="inth.prefs.save"
					onPress={() => {
						void save();
					}}
					parts={parts}
				/>
				{onOpenPreferences === undefined ? null : (
					<ConsentButton
						kind="link"
						label={copy.preferences}
						onPress={onOpenPreferences}
						parts={parts}
					/>
				)}
			</ConsentSurfaceFooter>
		</>
	);
};

/**
 * Render the consent manager as a modal.
 *
 * Open it from your own state, or let {@link ConsentBanner} open it when the
 * subject taps customize. The save button writes the categories on screen and
 * nothing else, so a subject who changes one switch does not renew the receipts
 * behind the ones they never looked at.
 *
 * @example
 * ```tsx
 * const [open, setOpen] = useState(false);
 *
 * <ConsentDialog onRequestClose={() => {
 *     setOpen(false);
 * }} open={open} />;
 * ```
 *
 * @param props - Dialog props.
 * @returns The dialog while it is open or animating out.
 */
export const ConsentDialog = ({
	hideBranding = false,
	onOpenPreferences,
	onRequestClose,
	open,
	presentation = 'dialog',
	styles,
	theme,
}: ConsentDialogProps): ReactNode => {
	// Words only. The category list belongs to the sheet, and a shut sheet has
	// none on screen.
	const copy = useConsentSelector(selectConsentCopy, isConsentCopyEqual);
	const surface = useConsentStyles({ presentation, styles, theme });

	const branding = hideBranding ? undefined : (
		<ConsentBrandingTag
			label={copy.securedBy}
			parts={surface.parts}
			presentation={presentation}
			radius={surface.theme.radius.lg}
		/>
	);

	return (
		<ConsentSurface
			branding={branding}
			dismissLabel={copy.dismiss}
			dismissTestID="inth.prefs.cancel"
			label={copy.dialogTitle}
			onRequestClose={onRequestClose}
			open={open}
			presentation={presentation}
			styles={surface}
		>
			<ConsentDialogContent
				copy={copy}
				onOpenPreferences={onOpenPreferences}
				onRequestClose={onRequestClose}
			/>
		</ConsentSurface>
	);
};
