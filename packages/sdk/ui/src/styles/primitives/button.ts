import styles from './button.module.css';

/**
 * Button visual variant type.
 * @public
 */
export type ButtonVariant = 'primary' | 'neutral';

/**
 * Button mode type - determines the visual style intensity.
 * @public
 */
export type ButtonMode = 'filled' | 'stroke' | 'lighter' | 'ghost';

/**
 * Button size type.
 * @public
 */
export type ButtonSize = 'medium' | 'small' | 'xsmall' | 'xxsmall';

/**
 * Props interface for button variants.
 * @public
 */
export interface ButtonVariantsProps {
	/**
	 * The visual variant of the button.
	 * @default 'primary'
	 */
	variant?: ButtonVariant;
	/**
	 * The mode/intensity of the button style.
	 * @default 'filled'
	 */
	mode?: ButtonMode;
	/**
	 * The size of the button.
	 * @default 'medium'
	 */
	size?: ButtonSize;
}

/**
 * Helper function to generate button CSS classes based on variants.
 *
 * @example
 * ```ts
 * const variants = buttonVariants({ variant: 'primary', mode: 'filled', size: 'medium' });
 * const rootClass = variants.root(); // Returns combined CSS classes
 * const iconClass = variants.icon(); // Returns icon-specific classes
 * ```
 *
 * @public
 */
export const buttonVariants = ({
	variant = 'primary',
	mode = 'filled',
	size = 'medium',
}: ButtonVariantsProps = {}) => {
	const rootClasses = [styles.button, styles[`button-${size}`]];

	const compoundMap: Record<
		`${ButtonVariant}-${ButtonMode}`,
		keyof typeof styles
	> = {
		'neutral-filled': 'button-neutral-filled',
		'neutral-ghost': 'button-neutral-ghost',
		'neutral-lighter': 'button-neutral-lighter',
		'neutral-stroke': 'button-neutral-stroke',
		'primary-filled': 'button-primary-filled',
		'primary-ghost': 'button-primary-ghost',
		'primary-lighter': 'button-primary-lighter',
		'primary-stroke': 'button-primary-stroke',
	};

	rootClasses.push(styles[compoundMap[`${variant}-${mode}`]]);

	const iconClasses = [styles['button-icon']];

	return {
		icon: (options?: { class?: string }) =>
			[...iconClasses, options?.class].filter(Boolean).join(' '),
		root: (options?: { class?: string }) =>
			[...rootClasses, options?.class].filter(Boolean).join(' '),
	};
};
