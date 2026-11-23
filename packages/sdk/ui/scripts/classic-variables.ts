/**
 * The classic banner and dialog variables, from the stylesheets the consent
 * UI replaced, and where the current sheets read them.
 *
 * A site that styled the old banner and dialog through these variables
 * keeps that styling: each part reads its own hook first, then
 * the classic variable, then the token. The docs table in
 * `docs/customization/tokens.mdx` and the computed-style test
 * (`classic-variables.browser.test.ts`) are both checked against this list,
 * so every classic variable has to be mapped or listed as
 * unmapped here.
 */

/** A rendering the test builds, with the data attributes it carries. */
export type ClassicProbeSurface =
	| 'bar'
	| 'bar-flush-top'
	| 'card'
	| 'card-center'
	| 'dialog'
	| 'drawer-flush-end';

/** One part whose computed style the classic variable must change. */
export interface ClassicProbe {
	surface: ClassicProbeSurface;
	/** The part's class name in its sheet's class map. */
	part: string;
	/** A computed property, as `getPropertyValue` takes it. */
	property: string;
	/** What the test sets the classic variable to. */
	value: string;
	/** The hook that must win over the classic variable on this part. */
	hook?: string;
	dark?: true;
	/** Phone width, below `PHONE_LAYOUT_QUERY`. */
	phone?: true;
	/** The layer playing its exit (`data-state="closed"`). */
	closing?: true;
}

export interface ClassicMapping {
	classic: string;
	/** The classic default, which the current sheets read as a fallback. */
	defaultValue: string;
	/** The hooks that win over it, or `[]` when the part reads it directly. */
	hooks: readonly string[];
	/** The parts it styles, as the docs table words them. */
	parts: string;
	probes: readonly ClassicProbe[];
}

export interface ClassicUnmapped {
	classic: string;
	reason: string;
}

const COLOR = 'rgb(1, 2, 3)';
const SHADOW = 'rgb(1, 2, 3) 0px 0px 0px 5px';

/**
 * A colour probe, marked dark for the `-dark` twin of a variable and given
 * the hook that must win over it when there is one.
 */
const colorProbe = function colorProbe(
	probe: Pick<ClassicProbe, 'part' | 'property' | 'surface'>,
	dark: boolean,
	hook = ''
): ClassicProbe {
	const built: ClassicProbe = { ...probe, value: COLOR };
	if (dark) {
		built.dark = true;
	}
	if (hook) {
		built.hook = hook;
	}
	return built;
};

export const CLASSIC_BANNER_VARIABLES: readonly ClassicMapping[] = [
	{
		classic: '--consent-banner-font-family',
		defaultValue: 'var(--inth-font-family)',
		hooks: [],
		parts: 'Card, Banner, Drawer: the layer font',
		probes: [
			{
				part: 'root',
				property: 'font-family',
				surface: 'card',
				value: 'serif',
			},
		],
	},
	{
		classic: '--consent-banner-line-height',
		defaultValue: 'var(--inth-line-height-normal)',
		hooks: [],
		parts: 'Card, Banner, Drawer: the layer line height',
		probes: [
			{ part: 'root', property: 'line-height', surface: 'card', value: '31px' },
		],
	},
	{
		classic: '--consent-banner-text-size-adjust',
		defaultValue: '100%',
		hooks: [],
		parts: 'Card, Banner, Drawer: the layer text size adjust',
		probes: [
			{
				part: 'root',
				property: '-webkit-text-size-adjust',
				surface: 'card',
				value: '80%',
			},
		],
	},
	{
		classic: '--consent-banner-border-radius',
		defaultValue: 'var(--inth-radius-lg)',
		hooks: ['--consent-card-radius'],
		parts: 'Card: the card corners',
		probes: [
			{
				hook: '--consent-card-radius',
				part: 'card',
				property: 'border-top-left-radius',
				surface: 'card',
				value: '21px',
			},
			{
				hook: '--consent-card-radius',
				part: 'card',
				property: 'border-top-left-radius',
				surface: 'card-center',
				value: '21px',
			},
		],
	},
	{
		classic: '--consent-banner-max-width',
		defaultValue: '440px',
		hooks: ['--consent-card-width'],
		parts: 'Card: the corner card width',
		probes: [
			{
				hook: '--consent-card-width',
				part: 'shell',
				property: 'width',
				surface: 'card',
				value: '333px',
			},
		],
	},
	{
		classic: '--consent-banner-wall-max-width',
		defaultValue: '30rem',
		hooks: ['--consent-card-width'],
		parts: 'Card: the centred card width',
		probes: [
			{
				hook: '--consent-card-width',
				part: 'shell',
				property: 'width',
				surface: 'card-center',
				value: '350px',
			},
		],
	},
	{
		classic: '--consent-banner-padding',
		defaultValue: 'var(--inth-space-lg)',
		hooks: [],
		parts: 'Card: the head and footer inset',
		probes: [
			{ part: 'head', property: 'padding-top', surface: 'card', value: '29px' },
			{
				part: 'footer',
				property: 'padding-left',
				surface: 'card',
				value: '29px',
			},
		],
	},
	{
		classic: '--consent-banner-padding-mobile',
		defaultValue: 'var(--inth-space-md)',
		hooks: [],
		parts: 'Card: the head and footer inset on phone',
		probes: [
			{
				part: 'head',
				phone: true,
				property: 'padding-top',
				surface: 'card',
				value: '13px',
			},
			{
				part: 'footer',
				phone: true,
				property: 'padding-left',
				surface: 'card',
				value: '13px',
			},
		],
	},
	{
		classic: '--consent-banner-entry-duration',
		defaultValue: 'var(--inth-duration-normal)',
		hooks: [],
		parts: 'Card, Banner, Drawer: the entrance and the scrim fade-in',
		probes: [
			{
				part: 'shell',
				property: 'animation-duration',
				surface: 'card',
				value: '0.7s',
			},
			{
				part: 'shell',
				property: 'animation-duration',
				surface: 'bar',
				value: '0.7s',
			},
			{
				part: 'scrim',
				property: 'animation-duration',
				surface: 'card',
				value: '0.7s',
			},
		],
	},
	{
		classic: '--consent-banner-entry-timing',
		defaultValue: 'var(--inth-easing-out)',
		hooks: [],
		parts: 'Card, Banner, Drawer: the entrance easing',
		probes: [
			{
				part: 'shell',
				property: 'animation-timing-function',
				surface: 'card',
				value: 'linear',
			},
			{
				part: 'scrim',
				property: 'animation-timing-function',
				surface: 'card',
				value: 'linear',
			},
		],
	},

	{
		classic: '--consent-banner-animation-timing',
		defaultValue: 'var(--inth-easing-in)',
		hooks: [],
		parts: 'Card, Banner, Drawer: the exit easing',
		probes: [
			{
				closing: true,
				part: 'shell',
				property: 'animation-timing-function',
				surface: 'card',
				value: 'linear',
			},
		],
	},
	{
		classic: '--consent-banner-border-width',
		defaultValue: '1px',
		hooks: [],
		parts:
			'Card, Banner, Drawer: the card border, the footer divider and the flush edge',
		probes: [
			{
				part: 'card',
				property: 'border-top-width',
				surface: 'card',
				value: '3px',
			},
			{
				part: 'footer',
				property: 'border-top-width',
				surface: 'card',
				value: '3px',
			},
			{
				part: 'card',
				property: 'border-bottom-width',
				surface: 'bar-flush-top',
				value: '3px',
			},
			{
				part: 'card',
				property: 'border-left-width',
				surface: 'drawer-flush-end',
				value: '3px',
			},
		],
	},
	{
		classic: '--consent-banner-shadow',
		defaultValue: 'var(--inth-shadow-lg)',
		hooks: ['--consent-card-shadow', '--consent-bar-shadow'],
		parts: 'Card, Banner: the card shadow',
		probes: [
			{
				hook: '--consent-card-shadow',
				part: 'card',
				property: 'box-shadow',
				surface: 'card',
				value: SHADOW,
			},
			{
				hook: '--consent-bar-shadow',
				part: 'card',
				property: 'box-shadow',
				surface: 'bar',
				value: SHADOW,
			},
		],
	},
	{
		classic: '--consent-banner-shadow-dark',
		defaultValue: 'var(--inth-shadow-lg)',
		hooks: ['--consent-card-shadow', '--consent-bar-shadow'],
		parts: 'Card, Banner: the card shadow in dark mode',
		probes: [
			{
				dark: true,
				hook: '--consent-card-shadow',
				part: 'card',
				property: 'box-shadow',
				surface: 'card',
				value: SHADOW,
			},
			{
				dark: true,
				hook: '--consent-bar-shadow',
				part: 'card',
				property: 'box-shadow',
				surface: 'bar',
				value: SHADOW,
			},
		],
	},
	...(
		[
			[
				'background-color',
				'var(--inth-surface)',
				'--consent-surface-background',
				'the card background',
				'card',
				'background-color',
			],
			[
				'footer-background-color',
				'var(--inth-surface-hover)',
				'--consent-surface-footer-background',
				'the footer background',
				'footer',
				'background-color',
			],
			['text-color', 'var(--inth-text)', '', 'the card text', 'card', 'color'],
			[
				'border-color',
				'var(--inth-border)',
				'--consent-surface-border-color',
				'the card border and the footer divider',
				'card',
				'border-top-color',
			],
			['title-color', 'var(--inth-text)', '', 'the title', 'title', 'color'],
			[
				'description-color',
				'var(--inth-text-muted)',
				'',
				'the description, and the Banner sentence',
				'description',
				'color',
			],
			[
				'overlay-background-color',
				'var(--inth-overlay)',
				'',
				'the blocking scrim',
				'scrim',
				'background-color',
			],
		] as const
	).flatMap(
		([name, defaultValue, hook, target, part, property]): ClassicMapping[] =>
			[false, true].map((dark) => ({
				classic: `--consent-banner-${name}${dark ? '-dark' : ''}`,
				defaultValue,
				hooks: hook ? [hook] : [],
				parts: `Card, Banner, Drawer: ${target}${dark ? ' in dark mode' : ''}`,
				probes: [
					colorProbe({ part, property, surface: 'card' }, dark, hook),
					...(name === 'border-color'
						? [
								colorProbe(
									{
										part: 'footer',
										property: 'border-top-color',
										surface: 'card',
									},
									dark
								),
							]
						: []),
					...(name === 'description-color'
						? [
								colorProbe(
									{ part: 'text', property: 'color', surface: 'bar' },
									dark
								),
							]
						: []),
				],
			}))
	),
	{
		classic: '--consent-banner-z-index',
		defaultValue: '999998',
		hooks: ['--consent-surface-z-index'],
		parts: 'Card, Banner, Drawer: the layer stacking',
		probes: [
			{
				hook: '--consent-surface-z-index',
				part: 'root',
				property: 'z-index',
				surface: 'card',
				value: '41',
			},
		],
	},
];

export const CLASSIC_DIALOG_VARIABLES: readonly ClassicMapping[] = [
	{
		classic: '--consent-dialog-font-family',
		defaultValue: 'var(--inth-font-family)',
		hooks: [],
		parts: 'Dialog: the dialog font',
		probes: [
			{
				part: 'backdrop',
				property: 'font-family',
				surface: 'dialog',
				value: 'serif',
			},
		],
	},
	{
		classic: '--consent-dialog-line-height',
		defaultValue: 'var(--inth-line-height-tight)',
		hooks: [],
		parts: 'Dialog: the dialog line height',
		probes: [
			{
				part: 'backdrop',
				property: 'line-height',
				surface: 'dialog',
				value: '31px',
			},
		],
	},
	{
		classic: '--consent-dialog-title-font-size',
		defaultValue: 'var(--inth-font-size-sm)',
		hooks: [],
		parts: 'Dialog: the title size',
		probes: [
			{
				part: 'title',
				property: 'font-size',
				surface: 'dialog',
				value: '27px',
			},
		],
	},
	{
		classic: '--consent-dialog-title-font-weight',
		defaultValue: 'var(--inth-font-weight-semibold)',
		hooks: [],
		parts: 'Dialog: the title weight',
		probes: [
			{
				part: 'title',
				property: 'font-weight',
				surface: 'dialog',
				value: '300',
			},
		],
	},
	{
		classic: '--consent-dialog-title-letter-spacing',
		defaultValue: '-0.025em',
		hooks: [],
		parts: 'Dialog: the title tracking',
		probes: [
			{
				part: 'title',
				property: 'letter-spacing',
				surface: 'dialog',
				value: '3px',
			},
		],
	},
	{
		classic: '--consent-dialog-description-font-size',
		defaultValue: 'var(--inth-font-size-base)',
		hooks: [],
		parts: 'Dialog: the intro size',
		probes: [
			{
				part: 'intro',
				property: 'font-size',
				surface: 'dialog',
				value: '23px',
			},
		],
	},
	{
		classic: '--consent-dialog-description-font-weight',
		defaultValue: 'var(--inth-font-weight-normal)',
		hooks: [],
		parts: 'Dialog: the intro weight',
		probes: [
			{
				part: 'intro',
				property: 'font-weight',
				surface: 'dialog',
				value: '700',
			},
		],
	},
	{
		classic: '--consent-dialog-description-line-height',
		defaultValue: 'var(--inth-line-height-normal)',
		hooks: [],
		parts: 'Dialog: the intro line height',
		probes: [
			{
				part: 'intro',
				property: 'line-height',
				surface: 'dialog',
				value: '33px',
			},
		],
	},
	{
		classic: '--consent-dialog-footer-gap',
		defaultValue: 'var(--inth-space-sm)',
		hooks: [],
		parts: 'Dialog: the footer gap',
		probes: [
			{
				part: 'footer',
				property: 'column-gap',
				surface: 'dialog',
				value: '19px',
			},
		],
	},
	{
		classic: '--consent-dialog-footer-font-size',
		defaultValue: 'var(--inth-font-size-sm)',
		hooks: [],
		parts: 'Dialog: the footer note size',
		probes: [
			{
				part: 'footerNote',
				property: 'font-size',
				surface: 'dialog',
				value: '17px',
			},
		],
	},
	...(
		[
			[
				'stroke-color',
				'var(--inth-border)',
				'the footer divider',
				'footer',
				'border-top-color',
			],
			[
				'border-color',
				'var(--inth-border)',
				'the card edge',
				'card',
				'box-shadow',
			],
			[
				'background-color',
				'var(--inth-surface)',
				'the card background',
				'card',
				'background-color',
			],
			[
				'foreground-color',
				'var(--inth-text)',
				'the card text',
				'card',
				'color',
			],
			['muted-color', 'var(--inth-text-muted)', 'the intro', 'intro', 'color'],
		] as const
	).flatMap(([name, defaultValue, target, part, property]): ClassicMapping[] =>
		[false, true].map((dark) => ({
			classic: `--consent-dialog-${name}${dark ? '-dark' : ''}`,
			defaultValue,
			hooks: [],
			parts: `Dialog: ${target}${dark ? ' in dark mode' : ''}`,
			probes: [colorProbe({ part, property, surface: 'dialog' }, dark)],
		}))
	),
	{
		classic: '--consent-dialog-card-padding',
		defaultValue: 'var(--inth-space-lg)',
		hooks: [],
		parts: 'Dialog: the outer gap and the inset of the header, body and footer',
		probes: [
			{
				part: 'backdrop',
				property: 'padding-top',
				surface: 'dialog',
				value: '29px',
			},
			{
				part: 'header',
				property: 'padding-left',
				surface: 'dialog',
				value: '29px',
			},
			{
				part: 'footer',
				property: 'padding-left',
				surface: 'dialog',
				value: '29px',
			},
		],
	},
	{
		classic: '--consent-dialog-card-padding-mobile',
		defaultValue: 'var(--inth-space-md)',
		hooks: [],
		parts: 'Dialog: the inset of the header, body and footer on phone',
		probes: [
			{
				part: 'header',
				phone: true,
				property: 'padding-left',
				surface: 'dialog',
				value: '13px',
			},
		],
	},
	{
		classic: '--consent-dialog-card-gap',
		defaultValue: 'var(--inth-space-xs)',
		hooks: [],
		parts: 'Dialog: the space above the intro',
		probes: [
			{
				part: 'intro',
				property: 'margin-top',
				surface: 'dialog',
				value: '11px',
			},
		],
	},
	{
		classic: '--consent-dialog-footer-padding-y',
		defaultValue: 'var(--inth-space-md)',
		hooks: [],
		parts: 'Dialog: the footer padding above and below',
		probes: [
			{
				part: 'footer',
				property: 'padding-top',
				surface: 'dialog',
				value: '25px',
			},
			{
				part: 'footer',
				property: 'padding-bottom',
				surface: 'dialog',
				value: '25px',
			},
		],
	},
	{
		classic: '--consent-dialog-card-radius',
		defaultValue: 'var(--inth-radius-lg)',
		hooks: ['--consent-dialog-radius'],
		parts: 'Dialog: the card corners',
		probes: [
			{
				hook: '--consent-dialog-radius',
				part: 'card',
				property: 'border-top-left-radius',
				surface: 'dialog',
				value: '21px',
			},
		],
	},
	{
		classic: '--consent-dialog-max-width',
		defaultValue: '28rem',
		hooks: ['--consent-dialog-width'],
		parts: 'Dialog: the card width',
		probes: [
			{
				hook: '--consent-dialog-width',
				part: 'card',
				property: 'width',
				surface: 'dialog',
				value: '333px',
			},
		],
	},
	{
		classic: '--consent-dialog-max-height',
		defaultValue:
			'calc(100dvh - 2 * var(--consent-dialog-card-padding-mobile))',
		hooks: [],
		parts: 'Dialog: the card height cap (read under the same name)',
		probes: [
			{
				part: 'card',
				property: 'max-height',
				surface: 'dialog',
				value: '301px',
			},
		],
	},
	{
		classic: '--consent-dialog-z-index',
		defaultValue: '999999',
		hooks: [],
		parts: 'Dialog: the layer stacking (read under the same name)',
		probes: [
			{ part: 'backdrop', property: 'z-index', surface: 'dialog', value: '43' },
		],
	},
	{
		classic: '--consent-dialog-card-shadow',
		defaultValue: 'var(--inth-shadow-sm)',
		hooks: [],
		parts: 'Dialog: the card shadow, under its edge',
		probes: [
			{
				part: 'card',
				property: 'box-shadow',
				surface: 'dialog',
				value: SHADOW,
			},
		],
	},
	{
		classic: '--consent-dialog-border-width',
		defaultValue: '1px',
		hooks: [],
		parts: 'Dialog: the card edge and the footer divider',
		probes: [
			{ part: 'card', property: 'box-shadow', surface: 'dialog', value: '3px' },
			{
				part: 'footer',
				property: 'border-top-width',
				surface: 'dialog',
				value: '3px',
			},
		],
	},
	{
		classic: '--consent-dialog-border-style',
		defaultValue: 'solid',
		hooks: [],
		parts: 'Dialog: the footer divider style',
		probes: [
			{
				part: 'footer',
				property: 'border-top-style',
				surface: 'dialog',
				value: 'dashed',
			},
		],
	},

	{
		classic: '--consent-dialog-animation-timing',
		defaultValue: 'var(--inth-easing-out)',
		hooks: [],
		parts: 'Dialog: the backdrop and card entrance easing',
		probes: [
			{
				part: 'card',
				property: 'animation-timing-function',
				surface: 'dialog',
				value: 'linear',
			},
		],
	},
];

export const CLASSIC_VARIABLES: readonly ClassicMapping[] = [
	...CLASSIC_BANNER_VARIABLES,
	...CLASSIC_DIALOG_VARIABLES,
];

/** Classic variables the consent UI doesn't read, and why. */
export const CLASSIC_UNMAPPED: readonly ClassicUnmapped[] = [
	{
		classic: '--consent-banner-animation-duration',
		reason:
			'The prompt exit keeps its own duration. Adapters that still time an exit read it and fall back to `--inth-duration-fast`.',
	},
	{
		classic: '--consent-banner-border-radius-sm',
		reason:
			'Rounded the focus ring of the old footer rights links. The prompt has no rights links; they live in the dialog.',
	},
	{
		classic: '--consent-banner-branding-tag-offset',
		reason: 'Read by no rule.',
	},
	{
		classic: '--consent-banner-border-width-hairline',
		reason: 'Read by no rule.',
	},
	{
		classic: '--consent-banner-overlay-z-index',
		reason:
			'The scrim sits inside the layer, under the card, so it has no stacking order of its own. `--consent-banner-z-index` moves both.',
	},
	{
		classic: '--consent-banner-space-y-reverse',
		reason:
			'An internal helper the classic header sets on itself for its spacing, not a customisation hook.',
	},
	{
		classic: '--consent-banner-tab-size',
		reason: 'The prompt sets no tab size; it holds no preformatted text.',
	},
	{
		classic: '--consent-banner-widget-max-width',
		reason: 'Sized the old `widget` chip, which has no container.',
	},
	{
		classic: '--consent-dialog-animation-duration',
		reason:
			'The dialog keeps its own duration. Adapters that still time an exit read it and fall back to `--inth-duration-normal`.',
	},
	{
		classic: '--consent-dialog-border-width-hairline',
		reason: 'Read by no rule.',
	},
	{
		classic: '--consent-dialog-content-gap',
		reason:
			'Spaced the old dialog body sections. The rights rows are divided by borders and padding instead.',
	},
	{
		classic: '--consent-dialog-header-gap',
		reason:
			'Spaced the old header stack. The header sets the title beside the close button; `--consent-dialog-card-gap` spaces the title and intro.',
	},
	{
		classic: '--consent-dialog-height',
		reason: 'Sized the old sidebar dialog, which has no counterpart.',
	},
	{
		classic: '--consent-dialog-link-text-color',
		reason:
			'Coloured the old overlay, which held no text. Nothing replaces it.',
	},
	{
		classic: '--consent-dialog-link-text-color-dark',
		reason:
			'Coloured the old overlay, which held no text. Nothing replaces it.',
	},
	{
		classic: '--consent-dialog-overlay-background-color',
		reason: 'The backdrop reads `--inth-overlay`.',
	},
	{
		classic: '--consent-dialog-overlay-background-color-dark',
		reason: 'The backdrop reads `--inth-overlay`.',
	},
	{
		classic: '--consent-dialog-overlay-z-index',
		reason:
			'The backdrop is the overlay, so `--consent-dialog-z-index` orders both.',
	},
	{
		classic: '--consent-manager-text-muted-color',
		reason:
			'The preference widget declares and reads it for its own descriptions; the prompt and the dialog do not.',
	},
	{
		classic: '--consent-manager-text-muted-color-dark',
		reason:
			'The preference widget declares and reads it for its own descriptions; the prompt and the dialog do not.',
	},
];
