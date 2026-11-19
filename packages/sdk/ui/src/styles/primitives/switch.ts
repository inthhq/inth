import styles from './switch.module.css';

/**
 * Switch size variants.
 * @public
 */
export type SwitchSize = 'medium' | 'small';

/**
 * Switch variant props interface.
 * @public
 */
export interface SwitchVariantsProps {
	/**
	 * The size of the switch.
	 * @default 'medium'
	 */
	size?: SwitchSize;
}

/**
 * CSS variables for the root switch component.
 * @public
 */
export interface SwitchRootCSSVariables {
	'--switch-height': string;
	'--switch-width': string;
	'--switch-padding': string;
	'--switch-duration': string;
	'--switch-ease': string;
}

/**
 * CSS variables for the switch thumb component.
 * @public
 */
export interface SwitchThumbCSSVariables {
	'--switch-thumb-size': string;
	'--switch-thumb-size-disabled': string;
	'--switch-thumb-translate': string;
	'--switch-thumb-background-color': string;
	'--switch-thumb-background-color-disabled': string;
}

/**
 * CSS variables for the switch track component.
 * @public
 */
export interface SwitchTrackCSSVariables {
	'--switch-background-color': string;
	'--switch-background-color-hover': string;
	'--switch-background-color-checked': string;
	'--switch-background-color-disabled': string;
}

/**
 * All CSS variables used in the switch component.
 * @public
 */
export type SwitchCSSVariables = SwitchRootCSSVariables &
	SwitchThumbCSSVariables &
	SwitchTrackCSSVariables;

/**
 * Helper function to generate switch CSS classes based on variants.
 *
 * @example
 * ```ts
 * const variants = switchVariants({ size: 'small' });
 * const rootClass = variants.root(); // Returns root CSS classes
 * const thumbClass = variants.thumb({ disabled: true }); // Returns thumb classes with disabled state
 * const trackClass = variants.track(); // Returns track CSS classes
 * ```
 *
 * @public
 */
export const switchVariants = ({
	size = 'medium',
}: SwitchVariantsProps = {}) => {
	const sizeMap: Record<SwitchSize, keyof typeof styles | undefined> = {
		medium: undefined,
		small: 'root-small',
	};

	const thumbSizeMap: Record<SwitchSize, keyof typeof styles | undefined> = {
		medium: undefined,
		small: 'thumb-small',
	};

	const trackSizeMap: Record<SwitchSize, keyof typeof styles | undefined> = {
		medium: undefined,
		small: 'track-small',
	};

	return {
		root: (options?: { class?: string; disabled?: boolean }) => {
			const classes = [styles.root];
			const sizeClass = sizeMap[size];
			if (sizeClass) {
				classes.push(styles[sizeClass]);
			}
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
		thumb: (options?: { class?: string; disabled?: boolean }) => {
			const classes = [styles.thumb];
			const sizeClass = thumbSizeMap[size];
			if (sizeClass) {
				classes.push(styles[sizeClass]);
			}
			if (options?.disabled) {
				classes.push(styles['thumb-disabled']);
			}
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
		track: (options?: { class?: string; disabled?: boolean }) => {
			const classes = [styles.track];
			const sizeClass = trackSizeMap[size];
			if (sizeClass) {
				classes.push(styles[sizeClass]);
			}
			if (options?.disabled) {
				classes.push(styles['track-disabled']);
			}
			if (options?.class) {
				classes.push(options.class);
			}
			return classes.filter(Boolean).join(' ');
		},
	};
};
