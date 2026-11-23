import { CPPA_OPT_OUT_ICON } from '@inth/sdk/ui/utils/opt-out-icon';
import type { FC } from 'react';

export interface OptOutIconProps {
	className?: string;
	/**
	 * Give the icon its own size, 14px tall at the glyph's ratio. A page
	 * whose stylesheet never sizes it (a Privacy Choices page loads no
	 * classic banner sheet) would otherwise let it fill the line; a sizing
	 * rule, where one loads, still wins.
	 */
	sized?: boolean;
}

/** 14px tall at the glyph's ratio, from its `viewBox`. */
const ICON_SIZE = (() => {
	const [, , width = 30, height = 14] = CPPA_OPT_OUT_ICON.viewBox
		.split(' ')
		.map(Number);
	const tall = 14;
	return { height: tall, width: Math.round((tall * width) / height) };
})();

/**
 * Official California CCPA opt-out icon rendered beside "Privacy Choices"
 * links. Decorative next to visible link text (`aria-hidden="true"`).
 *
 * @internal
 */
export const OptOutIcon: FC<OptOutIconProps> = ({ className, sized }) => (
	<svg
		aria-hidden="true"
		className={className}
		focusable="false"
		width={sized ? ICON_SIZE.width : undefined}
		height={sized ? ICON_SIZE.height : undefined}
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
