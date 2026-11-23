import styles from '@inth/sdk/ui/styles/components/branding';
import { resolveBrandingTag } from '@inth/sdk/ui/utils';
import type { BrandingSurface } from '@inth/sdk/ui/utils';

import { useTranslations } from '~/component-hooks/use-translations';
import { useBranding } from '~/hooks';
import { useIsHydrated } from '~/hooks/use-is-hydrated';
import { useTheme } from '~/hooks/use-theme';
import { useUIConfig } from '~/ui-config-context';
import { mergeSlotProps } from '~/utils/merge-slot-props';

import { BrandMarkIcon } from './logo';

interface BrandingTagProps {
	/** The surface the tag sits on. */
	surface: BrandingSurface;
	hideBranding?: boolean;
}

/** The "Consent by" tag on a stock surface. */
export const BrandingTag = ({ surface, hideBranding }: BrandingTagProps) => {
	const branding = useBranding();
	const { components } = useUIConfig();
	const { noStyle } = useTheme();
	const { common } = useTranslations();
	// The referral hostname only exists in the browser. Reading `window` during
	// the hydration render would make the client href differ from the
	// server-rendered one and trip React's attribute-mismatch check, so the
	// parameter is added after hydration instead.
	const isHydrated = useIsHydrated();
	const tag = resolveBrandingTag({
		branding,
		hostname: isHydrated ? window.location.hostname : undefined,
		noStyle,
		styles,
		surface,
	});

	if (!tag || hideBranding) {
		return null;
	}

	const rootProps = mergeSlotProps(components?.tag?.[tag.componentKey], {
		baseClassName: tag.classes.root,
		'data-testid': tag.testId,
	});
	const contentProps = mergeSlotProps(components?.tag?.content, {
		baseClassName: tag.classes.content,
	});

	return (
		<a
			{...rootProps}
			href={tag.href}
			data-branding={tag.brand}
			data-variant={tag.variant}
		>
			<span
				{...contentProps}
				data-slot="tag-content"
			>
				<span className={tag.classes.copy || undefined}>
					<span className={tag.classes.text || undefined}>
						{common.securedBy}
					</span>
				</span>
				<span
					dir="ltr"
					className={tag.classes.wordmark || undefined}
				>
					{tag.brand === 'inth' ? (
						<BrandMarkIcon mark="inth" />
					) : (
						<>
							<span className={tag.classes.mark || undefined}>
								<BrandMarkIcon mark="c15t" />
							</span>
							<span className={tag.classes.label || undefined}>c15t</span>
						</>
					)}
				</span>
			</span>
		</a>
	);
};
