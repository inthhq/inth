import type { ClassNameStyle, ThemeValue } from '../theme/types';
import { cn } from './cn';

/**
 * Merges two styles objects, handling theme values and style properties.
 *
 * @param style1 - The first style object to merge (lower precedence)
 * @param style2 - The second style object to merge (Takes precedence over style1)
 */
export const mergeStyles = function mergeStyles(
	style1: ThemeValue,
	style2?: ThemeValue
): ClassNameStyle {
	const normalize = (
		style: ThemeValue | undefined
	): ClassNameStyle | undefined => {
		if (style === undefined) {
			return undefined;
		}
		if (typeof style === 'string') {
			return { className: style };
		}
		return style as ClassNameStyle;
	};

	const s1 = normalize(style1);
	const s2 = normalize(style2);

	if (s1?.noStyle || s2?.noStyle) {
		if (s2?.noStyle) {
			return {
				className: s2.className,
				noStyle: true,
				style: s2.style,
			};
		}
	}

	const className = cn(
		s1?.baseClassName,
		s1?.className,
		s2?.baseClassName,
		s2?.className
	);

	const mergedStyle = {
		...s1?.style,
		...s2?.style,
	};

	return {
		className: className || undefined,
		noStyle: s1?.noStyle || s2?.noStyle,
		style: Object.keys(mergedStyle).length > 0 ? mergedStyle : undefined,
	};
};
