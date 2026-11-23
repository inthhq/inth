import styles from '@inth/sdk/ui/styles/components/button';
import { forwardRef as createForwardRef, useId } from 'react';
import type { ButtonHTMLAttributes, ElementType, ReactElement } from 'react';

import type { PolymorphicComponentProps } from '../../libs/polymorphic.model';
import { recursiveCloneChildren } from '../../libs/recursive-clone-children';
import { Slot } from '../../libs/slot';

export type ButtonVariant = 'primary' | 'neutral' | 'secondary';
export type ButtonMode = 'filled' | 'stroke' | 'lighter' | 'ghost';
export type ButtonSize = 'medium' | 'small' | 'xsmall' | 'xxsmall';
export interface ButtonVariantsProps {
	variant?: ButtonVariant;
	mode?: ButtonMode;
	size?: ButtonSize;
}

export const buttonVariants = (_props: ButtonVariantsProps = {}) => ({
	icon: (options?: { class?: string }) =>
		[styles.buttonIcon, options?.class].filter(Boolean).join(' '),
	root: (options?: { class?: string }) =>
		[styles.button, options?.class].filter(Boolean).join(' '),
});

const BUTTON_ROOT_NAME = 'ButtonRoot';
const BUTTON_ICON_NAME = 'ButtonIcon';

export interface ButtonIconProps extends Record<string, unknown> {
	variant?: ButtonVariant;
	mode?: ButtonMode;
	size?: ButtonSize;
}

export type RecursiveCloneableProps = Record<string, unknown>;

/** @internal */
export type ButtonSharedProps = ButtonVariantsProps;

/** @public */
type ButtonRootProps = ButtonSharedProps &
	ButtonHTMLAttributes<HTMLButtonElement> & {
		/**
		 * When true, the component will render its children directly without wrapping them in a button element
		 */
		asChild?: boolean;
		/**
		 * When true, the component will not apply default styling
		 */
		noStyle?: boolean;
	};

/**
 * The root component for the Button compound component
 *
 * @remarks
 * ButtonRoot is the main container component that provides the core button functionality.
 * It supports various style variants, modes, and sizes through the buttonVariants configuration.
 *
 * @example
 * ```tsx
 * <ButtonRoot variant="primary" mode="filled" size="medium">
 *   <ButtonIcon as={IconComponent} />
 *   Click me
 * </ButtonRoot>
 * ```
 *
 * @public
 */
const ButtonRoot = createForwardRef<HTMLButtonElement, ButtonRootProps>(
	(
		{
			children,
			variant,
			mode,
			size,
			asChild,
			className,
			noStyle,
			type = 'button',
			...rest
		},
		forwardedRef
	) => {
		const uniqueId = useId();
		const Component = asChild ? Slot : 'button';

		const variantClasses = noStyle
			? ''
			: buttonVariants({ mode, size, variant }).root();

		const finalClassName = [variantClasses, className]
			.filter(Boolean)
			.join(' ');

		const cloneableProps: RecursiveCloneableProps = {
			...(variant && { variant }),
			...(mode && { mode }),
			...(size && { size }),
		};

		const extendedChildren = recursiveCloneChildren(
			children as ReactElement[],
			cloneableProps,
			[BUTTON_ICON_NAME],
			uniqueId,
			asChild
		);

		return (
			<Component
				ref={forwardedRef}
				className={finalClassName}
				data-mode={variantClasses ? (mode ?? 'filled') : undefined}
				data-size={variantClasses ? (size ?? 'medium') : undefined}
				data-variant={variantClasses ? (variant ?? 'primary') : undefined}
				type={type}
				{...rest}
			>
				{extendedChildren}
			</Component>
		);
	}
);
ButtonRoot.displayName = BUTTON_ROOT_NAME;

/**
 * The icon component for the Button compound component
 *
 * @remarks
 * ButtonIcon is a polymorphic component that can render any icon component while maintaining
 * consistent styling with the parent button. It inherits variant properties from ButtonRoot.
 *
 * @example
 * ```tsx
 * <ButtonRoot>
 *   <ButtonIcon as={MyIcon} />
 *   Button with Icon
 * </ButtonRoot>
 * ```
 *
 * @public
 */
const ButtonIcon = <T extends ElementType>({
	variant,
	mode,
	size,
	as,
	className,
	...rest
}: PolymorphicComponentProps<T, ButtonIconProps>) => {
	const Component = as || 'div';
	const { icon } = buttonVariants({
		mode: mode as ButtonMode | undefined,
		size: size as ButtonSize | undefined,
		variant: variant as ButtonVariant | undefined,
	});

	return (
		<Component
			className={icon({ class: className as string | undefined })}
			{...rest}
		/>
	);
};
ButtonIcon.displayName = BUTTON_ICON_NAME;

/** @public */
export { ButtonIcon as Icon, ButtonRoot as Root };
