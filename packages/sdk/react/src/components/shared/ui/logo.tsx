import { BRAND_MARKS } from '@inth/sdk/ui/utils';
import type { BrandMark } from '@inth/sdk/ui/utils';
import type { SVGProps } from 'react';

/**
 * A brand mark, decorative and filled with `currentColor`: on the "Secured
 * by" tag and on the dialog trigger.
 */
export const BrandMarkIcon = ({
	mark,
	...props
}: SVGProps<SVGSVGElement> & { mark: BrandMark }) => {
	const glyph = BRAND_MARKS[mark];
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox={glyph.viewBox}
			fill="none"
			aria-hidden="true"
			{...props}
		>
			{glyph.paths.map((path) => (
				<path
					key={path.d}
					fill="currentColor"
					fillRule={path.evenOdd ? 'evenodd' : undefined}
					clipRule={path.evenOdd ? 'evenodd' : undefined}
					d={path.d}
				/>
			))}
		</svg>
	);
};
