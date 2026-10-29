/**
 * The first-layer prompt: a notice where the policy allows notice, an opt-in
 * choice where it does not.
 *
 * The banner is an absolutely positioned layer over the app, never a row in its
 * layout, so the moment a policy resolves a prompt nothing on screen moves. It
 * reads lifecycle, prompt identity and copy, so a grant
 * made elsewhere in the app does not rerender it.
 */

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useConsentActions } from '../hooks/use-consent-actions';
import { useConsentSelector } from '../hooks/use-consent-selector';
import { useConsentStatus } from '../hooks/use-consent-status';
import { isStatusPromptOwed } from '../lib/selectors';
import type { ConsentSnapshot } from '../protocol';
import { ConsentDialog } from './consent-dialog';
import { ConsentBrandingTag } from './internal/branding-tag';
import {
	CONSENT_BUTTON_ROW_ITEM,
	ConsentButton,
} from './internal/consent-button';
import {
	ConsentSurface,
	ConsentSurfaceBody,
	ConsentSurfaceFooter,
	ConsentSurfaceHeader,
	ConsentSurfaceTitle,
	useConsentSurfaceFrame,
} from './internal/consent-surface';
import { isConsentCopyEqual, selectConsentCopy } from './internal/copy';
import type { ConsentCopy } from './internal/copy';
import { useAnnounceOnOpen } from './internal/use-announce-on-open';
import type { ConsentPartStyles } from './theme/consent-theme-parts';
import type { ConsentTheme } from './theme/create-consent-theme';
import { useConsentStyles } from './theme/use-consent-styles';

/** Props for {@link ConsentBanner}. */
export interface ConsentBannerProps {
	/**
	 * Hide the "Secured by c15t" tab.
	 *
	 * Off by default, which is what the web surfaces do: the tab is what tells a
	 * subject who is holding their consent, and a plan that has already paid for
	 * removing it is the only reason to.
	 */
	readonly hideBranding?: boolean;
	/**
	 * Open the app's own finer controls.
	 *
	 * When omitted, the banner opens the built-in {@link ConsentDialog} itself,
	 * which is what makes `<ConsentBanner />` on its own a complete prompt.
	 */
	readonly onCustomize?: () => void;
	/** Per-part style overrides. */
	readonly styles?: ConsentPartStyles;
	/** Theme to render with, instead of the platform scheme. */
	readonly theme?: ConsentTheme;
}

interface ConsentBannerActionsProps {
	readonly busy: boolean;
	readonly commit: (
		choice: 'accept' | 'reject'
	) => Promise<boolean | undefined>;
	readonly copy: ConsentCopy;
	readonly customize: () => void;
	readonly notice: boolean;
}

const selectBannerPromptKey = (snapshot: ConsentSnapshot): string =>
	JSON.stringify([
		snapshot.promptRequirement.kind,
		snapshot.promptRequirement.kind === 'none'
			? null
			: snapshot.promptRequirement.reason,
		snapshot.resolution.policyId,
		snapshot.resolution.fingerprint,
		snapshot.subject?.subjectId,
		snapshot.subject?.externalId,
		snapshot.subject?.identityProvider,
	]);

const ConsentBannerActions = ({
	busy,
	commit,
	copy,
	customize,
	notice,
}: ConsentBannerActionsProps): ReactNode => {
	const actions = useConsentActions();
	const { parts } = useConsentSurfaceFrame();
	const [saveFailed, setSaveFailed] = useState(false);

	const decide = async (choice: 'accept' | 'reject'): Promise<void> => {
		setSaveFailed(false);
		try {
			const written = await commit(choice);
			if (written !== undefined) {
				setSaveFailed(!written);
			}
		} catch {
			setSaveFailed(true);
		}
	};

	useAnnounceOnOpen(saveFailed, copy.saveError);

	return (
		<>
			{saveFailed ? (
				<Text
					accessibilityRole="alert"
					style={parts.description}
				>
					{copy.saveError}
				</Text>
			) : null}
			{notice ? (
				<View style={parts.row}>
					<ConsentButton
						label={copy.acknowledge}
						onPress={() => {
							actions.dismissNotice();
						}}
						parts={parts}
						style={CONSENT_BUTTON_ROW_ITEM}
					/>
					<ConsentButton
						kind="secondary"
						testID="c15t.first-layer.customize"
						label={copy.customize}
						onPress={customize}
						parts={parts}
						style={CONSENT_BUTTON_ROW_ITEM}
					/>
				</View>
			) : (
				<>
					{/*
					 * The two decisions share a row at equal width, and Customize takes the row
					 * below it on its own. The accent is on Customize rather than on the decisions:
					 * `policy-actions.ts` defaults `primaryActions` to `customize` so that reject
					 * and accept stay neutral together, which stops the prompt leaning on a subject
					 * either way. With all three in one flex row the labels decided the arithmetic
					 * instead: measured on a device, reject came out 724px wide against customize's
					 * 167, which left the action that opens the choices reading as a caption.
					 */}
					<View style={parts.row}>
						<ConsentButton
							disabled={busy}
							kind="secondary"
							testID="c15t.first-layer.reject-all"
						label={copy.rejectAll}
							onPress={() => {
								void decide('reject');
							}}
							parts={parts}
							style={CONSENT_BUTTON_ROW_ITEM}
						/>
						<ConsentButton
							disabled={busy}
							kind="secondary"
							testID="c15t.first-layer.accept-all"
						label={copy.acceptAll}
							onPress={() => {
								void decide('accept');
							}}
							parts={parts}
							style={CONSENT_BUTTON_ROW_ITEM}
						/>
					</View>
					<ConsentButton
						disabled={busy}
						testID="c15t.first-layer.customize"
						label={copy.customize}
						onPress={customize}
						parts={parts}
					/>
				</>
			)}
		</>
	);
};

/**
 * Render the consent banner.
 *
 * Mount it once, inside the view that holds your screen. It shows itself while
 * the policy owes an interaction and unmounts itself once the subject has acted,
 * and it picks notice or opt-in copy from `promptRequirement.kind`.
 *
 * @example
 * ```tsx
 * <C15tProvider>
 *     <App />
 *     <ConsentBanner />
 * </C15tProvider>
 * ```
 *
 * @param props - Banner props.
 * @returns The banner while a prompt is owed, and nothing otherwise.
 */
export const ConsentBanner = ({
	hideBranding = false,
	onCustomize,
	styles,
	theme,
}: ConsentBannerProps): ReactNode => {
	const actions = useConsentActions();
	const status = useConsentStatus();
	const promptKey = useConsentSelector(selectBannerPromptKey);
	const copy = useConsentSelector(selectConsentCopy, isConsentCopyEqual);
	// The banner's own type roles: its heading is larger than the copy under it,
	// which is the opposite of the sheet this component can open.
	const surface = useConsentStyles({ presentation: 'banner', styles, theme });
	const [customizing, setCustomizing] = useState(false);
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);

	const commit = async (
		choice: 'accept' | 'reject'
	): Promise<boolean | undefined> => {
		if (pending.current) {
			return;
		}
		pending.current = true;
		setBusy(true);
		let written: boolean;
		try {
			const result = await (choice === 'accept'
				? actions.acceptAll()
				: actions.rejectAll());
			written = result.ok;
		} catch {
			written = false;
		}
		pending.current = false;
		setBusy(false);
		return written;
	};

	const notice = status.promptRequirement.kind === 'notice';
	const title = notice ? copy.noticeTitle : copy.bannerTitle;
	const description = notice ? copy.noticeDescription : copy.bannerDescription;
	const owed =
		isStatusPromptOwed(status) &&
		(status.activeUI === null || status.activeUI === 'banner');

	const customize = (): void => {
		if (onCustomize === undefined) {
			setCustomizing(true);
			return;
		}

		onCustomize();
	};

	const { parts } = surface;

	const branding = hideBranding ? undefined : (
		<ConsentBrandingTag
			label={copy.securedBy}
			parts={parts}
			presentation="banner"
			radius={surface.theme.radius.surface}
		/>
	);

	return (
		<>
			<ConsentSurface
				branding={branding}
				dismissLabel={copy.dismiss}
				label={title}
				open={owed && !customizing}
				presentation="banner"
				styles={surface}
			>
				<ConsentSurfaceHeader>
					<ConsentSurfaceTitle>{title}</ConsentSurfaceTitle>
				</ConsentSurfaceHeader>
				<ConsentSurfaceBody>
					<Text style={parts.description}>{description}</Text>
				</ConsentSurfaceBody>
				<ConsentSurfaceFooter>
					<ConsentBannerActions
						busy={busy}
						commit={commit}
						copy={copy}
						customize={customize}
						key={promptKey}
						notice={notice}
					/>
				</ConsentSurfaceFooter>
			</ConsentSurface>
			{onCustomize === undefined ? (
				<ConsentDialog
					onRequestClose={() => {
						setCustomizing(false);
					}}
					open={customizing}
					styles={styles}
					theme={theme}
				/>
			) : null}
		</>
	);
};
