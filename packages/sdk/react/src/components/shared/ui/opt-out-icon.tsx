import { CPPA_OPT_OUT_ICON } from '@inth/sdk/ui/utils/opt-out-icon';
import type { FC } from 'react';

export interface OptOutIconProps {
	className?: string;
}

/**
 * Official California CCPA opt-out icon rendered beside "Privacy Choices"
 * links. Decorative next to visible link text (`aria-hidden="true"`).
 *
 * @internal
 */
export const OptOutIcon: FC<OptOutIconProps> = ({ className }) => (
	<svg
		aria-hidden="true"
		className={className}
		focusable="false"
		viewBox={CPPA_OPT_OUT_ICON.viewBox}
		xmlns="http://www.w3.org/2000/svg"
	>
		{CPPA_OPT_OUT_ICON.paths.map((path) => (
			<path
				key={path.d}
				clipRule={path.evenOdd ? 'evenodd' : undefined}
				d={path.d}
				fill={path.fill}
				fillRule={path.evenOdd ? 'evenodd' : undefined}
			/>
		))}
	</svg>
);
