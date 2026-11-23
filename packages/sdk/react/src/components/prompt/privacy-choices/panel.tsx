'use client';

/**
 * The options a Privacy Choices prompt shows in place: the cookie
 * categories in the EU, the rights row and Preferences in the US. Loaded
 * on Customize, or at once by a side Drawer, with the stylesheets they
 * need.
 */

import { resolveSaleRight } from '@inth/sdk/engine';
import type { SaveUISource } from '@inth/sdk/engine';
import { resolvePreferencesRowCopy } from '@inth/sdk/surface-state';
import type { PrivacyChoicesPromptVariant } from '@inth/sdk/surface-state';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import styles from '@inth/sdk/ui/styles/components/privacy-choices';
import * as expand from '@inth/sdk/ui/styles/sheets/expand';
import * as privacyChoicesDialog from '@inth/sdk/ui/styles/sheets/privacy-choices-dialog';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { CategoryGroup } from '~/components/privacy-choices/category-group';
import { SaleRightsRow } from '~/components/privacy-choices/rights-row';
import { useConsentDraftSlice, useConsentDraftStore } from '~/draft';
import { useSnapshot } from '~/hooks';
import { useBrowserLayoutEffect } from '~/hooks/use-browser-layout-effect';
import { inertProps } from '~/utils/inert';

import { SurfaceStyles } from '../../shared/surface-styles';
import type { SurfaceStyleSheet } from '../../shared/surface-styles';

/**
 * The options' rules: the in-place panel, then the v6 rows over it. The
 * v6 sheet carries its own switch and category rows, so the classic
 * dialog sheet stays off the page.
 */
export const PANEL_SHEETS: readonly SurfaceStyleSheet[] = [
	expand,
	privacyChoicesDialog,
];

/** Props for {@link PrivacyChoicesPanel}. */
export interface PrivacyChoicesPanelProps {
	variant: PrivacyChoicesPromptVariant;
	/** Prefix for element ids inside the panel (SR-05). */
	idPrefix: string;
	uiSource?: SaveUISource;
	noStyle?: boolean;
	/** Called once the options render, so the prompt can focus the first one. */
	onReady?: () => void;
}

const Chevron = () => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="m6 9 6 6 6-6" />
	</svg>
);

const cx = (noStyle: boolean | undefined, ...names: (string | undefined)[]) =>
	noStyle ? undefined : names.filter(Boolean).join(' ') || undefined;

/**
 * Preferences in a US panel: the cookie categories behind a disclosure.
 * The category that decides sale follows the rights row instead of having
 * a switch of its own (LAW-05, CAT-08).
 */
const UsPreferences = ({
	idPrefix,
	noStyle,
}: {
	idPrefix: string;
	noStyle?: boolean;
}) => {
	const translations = useTranslations();
	const snapshot = useSnapshot();
	const draft = useConsentDraftStore();
	const sale = resolveSaleRight(snapshot).category;
	const onCount = useConsentDraftSlice(
		draft,
		(state) =>
			state.displayedCategories.filter(
				(name) => name !== 'necessary' && name !== sale && state.values[name]
			).length
	);
	const [open, setOpen] = useState(false);
	const copy = resolvePreferencesRowCopy(translations, onCount);
	const panelId = `${idPrefix}-preferences`;
	return (
		<div>
			<button
				type="button"
				className={cx(noStyle, styles.navRow)}
				aria-expanded={open}
				aria-controls={panelId}
				data-testid="consent-banner-preferences-row"
				onClick={() => setOpen((value) => !value)}
			>
				<span className={cx(noStyle, styles.navRowLabel)}>
					{copy.title}
					<span className={cx(noStyle, styles.navRowMeta)}>
						{copy.summary} · {copy.onCount}
					</span>
				</span>
				<span className={cx(noStyle, styles.chevron)}>
					<Chevron />
				</span>
			</button>
			<div
				className={cx(noStyle, expandStyles.panel)}
				id={panelId}
				data-open={open}
				{...inertProps(!open)}
			>
				<div className={cx(noStyle, expandStyles.inner)}>
					<div className={cx(noStyle, styles.preferencesBody)}>
						<CategoryGroup
							idPrefix={idPrefix}
							testIdPrefix="consent-banner"
							exclude={sale ? [sale] : []}
							noStyle={noStyle}
						/>
					</div>
				</div>
			</div>
		</div>
	);
};

/**
 * The options for the prompt's variant (BNR-14, BNR-15):
 *
 * - EU: the cookie categories, staged on the prompt's draft until a Save,
 *   Accept or Reject.
 * - US opt-in: the rights row, which applies as in the dialog, then
 *   Preferences.
 * - US notice: the rights row, which applies at once (LAW-04).
 *
 * Banner panels always use accordions, never sheets (PERM-01).
 *
 * @internal
 */
export const PrivacyChoicesPanel = ({
	variant,
	idPrefix,
	uiSource,
	noStyle,
	onReady,
}: PrivacyChoicesPanelProps) => {
	useBrowserLayoutEffect(() => {
		onReady?.();
	}, [onReady]);
	const rights = (
		<SaleRightsRow
			idPrefix={idPrefix}
			testIdPrefix="consent-banner"
			uiSource={uiSource}
			slotKey="banner.rightsRow"
			noStyle={noStyle}
		/>
	);
	let content: ReactNode = null;
	if (variant === 'choice') {
		content = (
			<CategoryGroup
				idPrefix={idPrefix}
				testIdPrefix="consent-banner"
				noStyle={noStyle}
			/>
		);
	} else if (variant === 'us-consent') {
		content = (
			<>
				{rights}
				<UsPreferences
					idPrefix={idPrefix}
					noStyle={noStyle}
				/>
			</>
		);
	} else if (variant === 'notice') {
		content = rights;
	}
	return (
		<>
			<SurfaceStyles
				sheets={PANEL_SHEETS}
				noStyle={noStyle}
			/>
			{content}
		</>
	);
};
