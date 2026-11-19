import { createElement, isValidElement } from 'react';
import type { ComponentType, ReactElement, ReactNode } from 'react';

/**
 * Recursively clones React children, adding `additionalProps` to elements
 * whose component `displayName` is in `displayNames`. With `asChild` (the
 * parent renders a Slot), it returns only the first child.
 */
export const recursiveCloneChildren = function recursiveCloneChildren(
	children: ReactNode,
	additionalProps: Record<string, unknown>,
	displayNames: string[],
	uniqueId: string,
	asChild?: boolean
): ReactNode | ReactNode[] {
	const childrenArray = Array.isArray(children) ? children : [children];
	const mappedChildren = childrenArray.map((child: ReactNode) => {
		if (!isValidElement(child)) {
			return child;
		}

		const displayName = (child.type as ComponentType)?.displayName || '';
		const newProps = displayNames.includes(displayName) ? additionalProps : {};

		const childProps = (child as ReactElement<Record<string, unknown>>).props;
		const clonedChildren = recursiveCloneChildren(
			childProps?.children as ReactNode,
			additionalProps,
			displayNames,
			uniqueId,
			childProps?.asChild as boolean | undefined
		);

		return createElement(
			child.type,
			{
				...childProps,
				...newProps,
				key: `${uniqueId}-${child.key || displayName}`,
			},
			clonedChildren
		);
	});

	return asChild ? mappedChildren?.[0] : mappedChildren;
};
