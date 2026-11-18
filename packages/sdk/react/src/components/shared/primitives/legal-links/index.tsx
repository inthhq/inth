import type { LegalLinks as LegalLinksType } from '@inth/sdk/engine';
import type { LegalLinksTranslations } from '@inth/sdk/translations';
import { defaultTranslationConfig } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/legal-links';
import { resolveLegalLinkEntries } from '@inth/sdk/ui/utils';
import { useContext, useSyncExternalStore } from 'react';

import { KernelContext } from '~/context';
import { useServerSnapshot } from '~/kernel-selector';
import { useUIConfig, V3UIConfigContext } from '~/ui-config-context';
import { mergeSlotProps } from '~/utils/merge-slot-props';

const noopSubscribe = () => () => undefined;

const useLegalLinksConfig = function useLegalLinksConfig():
	| LegalLinksType
	| undefined {
	const v3Config = useContext(V3UIConfigContext);
	return v3Config.legalLinks;
};

const useLegalLinkTranslations = function useLegalLinkTranslations():
	| Partial<LegalLinksTranslations>
	| undefined {
	const kernel = useContext(KernelContext);
	const serverSnapshot = useServerSnapshot(kernel);
	const kernelTranslations = useSyncExternalStore(
		kernel ? (listener) => kernel.subscribe(listener) : noopSubscribe,
		() => kernel?.getSnapshot().translations ?? null,
		() => serverSnapshot()?.translations ?? null
	);

	return kernelTranslations?.translations?.legalLinks;
};

/**
 * Props for the InlineLegalLinks component.
 */
export interface InlineLegalLinksProps {
	/**
	 * Controls which legal links to display.
	 *
	 * - `undefined` (default): Shows no legal links
	 * - `null`: Shows no legal links
	 * - Array of keys: Shows only the specified legal links
	 */
	links?: (keyof LegalLinksType)[] | null;

	context: LegalLinksContext;

	/**
	 * Optional test ID prefix for the links.
	 * Links will have test IDs like `${testIdPrefix}-${type}`
	 */
	testIdPrefix?: string;
}

/**
 * Renders legal links inline with commas and spaces.
 * The comma is part of the link (styled), but the space after is not.
 *
 * @example
 * ```tsx
 * <InlineLegalLinks
 *   links={['privacyPolicy', 'cookiePolicy']}
 *   context="dialog"
 *   testIdPrefix="consent-manager-dialog-legal-link"
 * />
 * ```
 */
export const InlineLegalLinks = ({
	links,
	context,
	testIdPrefix,
}: InlineLegalLinksProps) => {
	const entries = resolveLegalLinkEntries(
		useLegalLinksConfig(),
		links,
		useLegalLinkTranslations()
	);
	const { components } = useUIConfig();
	const rootStyles = mergeSlotProps(components?.['legal-links']?.root, {});
	const linkStyles = mergeSlotProps(components?.link?.[context], {
		baseClassName: styles.legalLink,
	});

	if (entries.length === 0) {
		return null;
	}

	return (
		<span {...rootStyles}>
			{' '}
			{entries.map((link) => (
				<span key={link.key}>
					<a
						href={link.href}
						target={link.target}
						rel={link.rel}
						{...linkStyles}
						data-testid={
							testIdPrefix ? `${testIdPrefix}-${link.key}` : undefined
						}
					>
						{link.label}
						{link.separated && ','}
					</a>
					{link.separated && ' '}
				</span>
			))}
		</span>
	);
};

/**
 * Valid link slot contexts for inline legal links.
 */
type LegalLinksContext = 'banner' | 'dialog' | 'manager';
