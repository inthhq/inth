/**
 * Theming, platform adaptation, and the plumbing under the sheets.
 *
 * These reach past the three public surfaces into the shared ones, because the
 * theme and the back gesture are what a host app relies on once it builds its
 * own layout out of the same parts.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	captureErrorMessage,
	flush,
	flushPromises,
} from '../../__tests__/helpers/fake-native';
import {
	animationState,
	pressBack,
	resetNativeStub,
	setColorScheme,
	setFontScale,
	setPlatformOS,
	setReduceMotion,
} from '../../__tests__/helpers/react-native-stub';
import { resetConsentClient } from '../../native/client';
import { ConsentBanner } from '../consent-banner';
import { ConsentDialog } from '../consent-dialog';
import {
	ConsentSurface,
	ConsentSurfaceBody,
	ConsentSurfaceHeader,
} from '../internal/consent-surface';
import type { ConsentPartStyles } from '../theme/consent-theme-parts';
import {
	isConsentThemePart,
	MIN_TAP_TARGET,
} from '../theme/consent-theme-parts';
import {
	createConsentTheme,
	defaultConsentTheme,
	resolveConsentColorScheme,
	resolveConsentTypeRoles,
} from '../theme/create-consent-theme';
import type { ConsentTheme } from '../theme/create-consent-theme';
import { useConsentStyles } from '../theme/use-consent-styles';
import {
	hitSlop,
	mountSurface,
	nodeStyle,
	requireRole,
	roleNodes,
	surfaceNode,
	translatedSnapshot,
} from './harness';
import type { SurfaceTree } from './harness';

afterEach(() => {
	resetConsentClient();
	resetNativeStub();
});

/**
 * The style facts a probe render reports.
 *
 * Reported as text rather than through a variable the component writes, because
 * writing to something outside the component during render is exactly the side
 * effect React forbids.
 */
interface ProbeFacts {
	/** Corner radius the sheet resolved to. */
	border: number;
	/** Smallest height a control may take. */
	controlMinHeight: number;
	/** Effective font scale. */
	fontScale: number;
	/** Height the body may reach. */
	maxBodyHeight: number;
	/** Scheme the palette came from. */
	scheme: string;
	/** Color the title part resolved to. */
	titleColor: string;
	/** Weight the title part resolved to. */
	titleWeight: string;
}

/** Render the style resolution a surface would use, as readable text. */
const StylesProbe = (props: {
	readonly styles?: ConsentPartStyles;
	readonly theme?: ConsentTheme;
}): ReactNode => {
	const { controlMinHeight, fontScale, maxBodyHeight, parts, scheme } =
		useConsentStyles({ styles: props.styles, theme: props.theme });
	const facts: ProbeFacts = {
		border: parts.sheet.borderRadius ?? 0,
		controlMinHeight,
		fontScale,
		maxBodyHeight,
		scheme,
		titleColor: String(parts.title.color ?? ''),
		titleWeight: String(parts.title.fontWeight ?? ''),
	};

	return <Text>{JSON.stringify(facts)}</Text>;
};

/** Resolve styles for a host's theme and overrides. */
const probeFacts = function probeFacts(
	props: {
		readonly styles?: ConsentPartStyles;
		readonly theme?: ConsentTheme;
	} = {}
): ProbeFacts {
	const tree = mountSurface(<StylesProbe {...props} />);
	const facts = JSON.parse(tree.text()) as ProbeFacts;

	tree.unmount();

	return facts;
};

/** The face each part draws with, for a host theme. */
const FontProbe = (props: {
	readonly styles?: ConsentPartStyles;
	readonly theme?: ConsentTheme;
}): ReactNode => {
	const { parts } = useConsentStyles({
		styles: props.styles,
		theme: props.theme,
	});
	const faces = Object.fromEntries(
		Object.entries(parts).map(([part, style]) => [part, style.fontFamily])
	);

	return <Text>{JSON.stringify(faces)}</Text>;
};

/** Resolve the face of every part for a host theme. */
const probeFonts = function probeFonts(props: {
	readonly styles?: ConsentPartStyles;
	readonly theme?: ConsentTheme;
}): Record<string, string | undefined> {
	const tree = mountSurface(<FontProbe {...props} />);
	const faces = JSON.parse(tree.text()) as Record<string, string | undefined>;

	tree.unmount();

	return faces;
};

/** Render a bare banner layer through the shared surface, as a host would. */
const HostBanner = ({
	onRequestClose,
}: {
	readonly onRequestClose?: () => void;
}): ReactNode => {
	const surface = useConsentStyles({});

	return (
		<ConsentSurface
			label="Host sheet"
			onRequestClose={onRequestClose}
			open
			presentation="banner"
			styles={surface}
		>
			<ConsentSurfaceHeader>
				<Text>Heading</Text>
			</ConsentSurfaceHeader>
			<ConsentSurfaceBody>
				<Text>Body</Text>
			</ConsentSurfaceBody>
		</ConsentSurface>
	);
};

/** Tap the switch for one category label. */
const tapSwitch = function tapSwitch(
	container: HTMLElement,
	label: string
): void {
	requireRole(container, 'switch', label).click();
};

/**
 * The style one piece of rendered text was drawn with.
 *
 * The banner keeps its copy in the scrolling body and the sheet keeps its beside
 * the heading, so reading a role's sibling would only work for one of them.
 *
 * @param tree - Mounted surface.
 * @param text - The exact string on screen.
 * @returns The flattened style of the text node.
 */
const textStyleOf = function textStyleOf(
	tree: SurfaceTree,
	text: string
): Record<string, unknown> {
	const drawn = [...tree.container().querySelectorAll('span')].find(
		(node) => node.textContent === text
	);

	if (drawn === undefined) {
		throw new Error(`no rendered text ${text}`);
	}

	return nodeStyle(drawn);
};

/** The stock type roles, from the stock type tokens. */
const lightRoles = resolveConsentTypeRoles(defaultConsentTheme.typography);

describe('theme', () => {
	test('follows the platform scheme', () => {
		setColorScheme('dark');
		const dark = mountSurface(<ConsentBanner />);

		expect(
			nodeStyle(surfaceNode(dark.container(), 'Deine Privatsphaere'))
				.backgroundColor
		).toBe(defaultConsentTheme.dark.surface);
		dark.unmount();

		setColorScheme('light');
		const light = mountSurface(<ConsentBanner />);

		expect(
			nodeStyle(surfaceNode(light.container(), 'Deine Privatsphaere'))
				.backgroundColor
		).toBe(defaultConsentTheme.colors.surface);
		light.unmount();
	});

	test('an unset scheme reads light', () => {
		expect(resolveConsentColorScheme(null)).toBe('light');
		expect(resolveConsentColorScheme(undefined)).toBe('light');
		expect(resolveConsentColorScheme('unspecified')).toBe('light');
		expect(resolveConsentColorScheme('light')).toBe('light');
		expect(resolveConsentColorScheme('dark')).toBe('dark');
		expect(createConsentTheme().colors.surface).toBe('#FFFFFF');
	});

	test('the built-in palettes carry the web tokens', () => {
		// The values are the ones `packages/sdk/ui` ships, so the banner a subject saw
		// in a browser and the banner they see in the app are one design. The
		// accent is the point of the exercise: it used to be near-black.
		expect(defaultConsentTheme.colors.primary).toBe('#2563EB');
		expect(defaultConsentTheme.colors.switchTrackActive).toBe('#2563EB');
		expect(defaultConsentTheme.colors.text).toBe('#1A1A1A');
		expect(defaultConsentTheme.colors.textMuted).toBe('#666666');
		expect(defaultConsentTheme.colors.border).toBe('#E6E6E6');
		expect(defaultConsentTheme.colors.surfaceHover).toBe('#FAFAFA');
		expect(defaultConsentTheme.dark.primary).toBe('#2F66DF');
		// The dark accent is a fill, not a text colour: its label takes the web's
		// lighter blue.
		expect(defaultConsentTheme.dark.primaryText).toBe('#8AB4FF');

		// The branding tab is filled with the accent, so web outlines it with the
		// accent 14% toward black. React Native has no `color-mix` to run at render,
		// so the resolved literal is the token: 0.86 of each channel.
		expect(defaultConsentTheme.colors.primaryBorder).toBe('#2055CA');
		expect(defaultConsentTheme.dark.primaryBorder).toBe('#2858C0');

		// 4 8 16 24 32, the web step scale.
		expect(defaultConsentTheme.spacing).toEqual({
			lg: 24,
			md: 16,
			sm: 8,
			xl: 32,
			xs: 4,
		});
		expect(defaultConsentTheme.radius).toEqual({
			full: 9999,
			lg: 16,
			md: 10,
			sm: 4,
		});
		expect(defaultConsentTheme.typography).toEqual({
			fontFamily: undefined,
			fontSize: { base: 16, lg: 18, sm: 14 },
			fontWeight: { medium: 500, normal: 400, semibold: 600 },
			headlineFont: undefined,
			lineHeight: { normal: 1.5, relaxed: 1.75, tight: 1.25 },
		});

		// A button label is 14 at medium on the web tight line, and the sheet
		// pairs a 17 semibold heading, set tight, over 13 regular copy.
		expect(lightRoles.body).toEqual({
			fontSize: 13,
			lineHeight: 19.5,
			weight: '400',
		});
		expect(lightRoles.label).toEqual({
			fontSize: 14,
			lineHeight: 17.5,
			weight: '500',
		});

		// `.title` in `consent-dialog.module.css` is `base * 1.0625` over
		// `--inth-line-height-tight`, so the heading sits in a 21.25 line box.
		expect(lightRoles.title).toEqual({
			fontSize: 17,
			lineHeight: 21.25,
			weight: '600',
		});

		// The banner card's `.title` is `1rem` over a `0.875rem` description,
		// so the heading leads the copy there too.
		expect(lightRoles.bannerTitle).toEqual({
			fontSize: 16,
			lineHeight: 24,
			weight: '500',
		});
		expect(lightRoles.bannerBody).toEqual({
			fontSize: 14,
			lineHeight: 21,
			weight: '400',
		});

		// The neutral outline reads `border` and `text`, so the filled pair that
		// would have served a solid button is gone rather than parked.
		expect(defaultConsentTheme.colors).not.toHaveProperty('secondary');
		expect(defaultConsentTheme.colors).not.toHaveProperty('onSecondary');
		expect(defaultConsentTheme.dark).not.toHaveProperty('secondary');
	});

	test('the banner heading leads its copy and the sheet heading follows its', () => {
		// One shared pair can only be right about one of these surfaces, which is
		// what put a 14 heading under 16 copy on the banner in the first place.
		// The sheet follows the web dialog: a 17 heading over a 13 intro.
		const banner = mountSurface(<ConsentBanner />);

		expect(textStyleOf(banner, 'Deine Privatsphaere')).toMatchObject({
			fontSize: 16,
			fontWeight: '500',
		});
		expect(textStyleOf(banner, 'Wir verarbeiten deine Daten.')).toMatchObject({
			fontSize: 14,
			fontWeight: '400',
		});

		const sheet = mountSurface(
			<ConsentDialog
				onRequestClose={vi.fn()}
				open
			/>
		);

		expect(textStyleOf(sheet, 'Zustimmung verwalten')).toMatchObject({
			fontSize: 17,
			fontWeight: '600',
		});
		expect(
			textStyleOf(sheet, 'Waehle die Kategorien, die du erlaubst.')
		).toMatchObject({
			fontSize: 13,
			fontWeight: '400',
		});

		banner.unmount();
		sheet.unmount();
	});

	test('a category is a bordered card and the list owns the gap', () => {
		const tree = mountSurface(
			<ConsentDialog
				onRequestClose={vi.fn()}
				open
			/>
		);

		// The switch sits in the trigger row, and the trigger row sits in the card.
		const trigger = requireRole(tree.container(), 'switch', 'Werbung')
			.parentElement as HTMLElement;
		const card = trigger.parentElement as HTMLElement;

		// `.item` is a card in its own border, not a row between two dividers, and it
		// carries nothing but that border.
		expect(nodeStyle(card)).toMatchObject({
			backgroundColor: defaultConsentTheme.colors.surface,
			borderColor: defaultConsentTheme.colors.border,
			borderRadius: defaultConsentTheme.radius.md,
			borderWidth: 1,
			flexDirection: 'column',
		});

		// `.triggerRow` is where the 8 of padding and the 4 step live, over the
		// disclosure's `calc(icon + 0.25rem)` floor. They have to sit there rather
		// than on the card, because the description a tap reveals falls outside the
		// row and still has to line up with the label above it.
		//
		// That web floor is 24 on a content box and React Native reads `minHeight` as
		// the border box, so the part has to carry the padding with it: 24 + 8 + 8,
		// which is what lands the closed card on the web's 42. The 24 this assertion
		// used to pin was the web's number dropped onto the wrong box, and it let the
		// row draw 36 with the disclosure paying for it.
		expect(nodeStyle(trigger)).toMatchObject({
			alignItems: 'center',
			gap: 4,
			minHeight: 40,
			padding: 8,
		});

		// The separation sits between the cards rather than on one of them, so the
		// last card does not push the footer down by an extra step.
		const list = card.parentElement as HTMLElement;

		expect(nodeStyle(list).gap).toBe(12);
		expect(list.children.length).toBe(5);

		tree.unmount();
	});

	test('the row reaches the tap floor without drawing it', () => {
		// The default row: 40 drawn, and slop on the press for the 4pt the fingertip
		// still short of the platform minimum.
		const plain = mountSurface(
			<ConsentDialog
				onRequestClose={vi.fn()}
				open
			/>
		);
		const plainSlop = hitSlop(
			requireRole(plain.container(), 'button', 'Werbung')
		);

		expect(40 + plainSlop.top + plainSlop.bottom).toBeGreaterThanOrEqual(
			MIN_TAP_TARGET
		);

		plain.unmount();

		// A host that already sets a row past the floor through `categoryTrigger` has paid
		// for the fingertip itself, so the row has to stop reaching past its box: slop
		// derived from a hardcoded inset would overlap whatever the host put there.
		const tall = mountSurface(
			<ConsentDialog
				onRequestClose={vi.fn()}
				open
				styles={{ categoryTrigger: { minHeight: 56 } }}
			/>
		);

		expect(hitSlop(requireRole(tall.container(), 'button', 'Werbung'))).toEqual(
			{ bottom: 0, left: 0, right: 0, top: 0 }
		);

		tall.unmount();

		// Three times the default text, where the label's own line box is 52.5 and well
		// past the disclosure's 24. The drawn row follows the text instead of holding
		// the design's height and clipping the label, and needs no slop either.
		setFontScale(3);

		const large = mountSurface(
			<ConsentDialog
				onRequestClose={vi.fn()}
				open
			/>
		);
		const row = requireRole(large.container(), 'button', 'Werbung');

		expect(Number(nodeStyle(row).minHeight) - 16).toBeGreaterThanOrEqual(
			17.5 * 3
		);
		expect(hitSlop(row)).toEqual({ bottom: 0, left: 0, right: 0, top: 0 });

		large.unmount();
	});

	test('each footer keeps the rhythm of its own surface', () => {
		const banner = mountSurface(<ConsentBanner />);
		const bannerFooter = surfaceNode(banner.container())
			.lastElementChild as HTMLElement;

		// `1rem 1.25rem` on `.footer`, on the muted band, under a hairline. The
		// row gap is 8 rather than the 16 `.actionRoot` opens with, because
		// `[data-split]` overrides it as soon as a banner has two action groups,
		// which is every banner that opts in. It is what keeps the card 238 tall
		// instead of 271.6.
		expect(nodeStyle(bannerFooter)).toMatchObject({
			backgroundColor: defaultConsentTheme.colors.surfaceHover,
			borderTopColor: defaultConsentTheme.colors.border,
			borderTopWidth: 1,
			gap: 8,
			paddingBottom: 16,
			paddingHorizontal: 20,
			paddingTop: 16,
		});

		const dialog = mountSurface(
			<ConsentDialog
				onRequestClose={vi.fn()}
				open
			/>
		);
		const dialogFooter = surfaceNode(dialog.container())
			.lastElementChild as HTMLElement;

		// The dialog's actions sit on the card itself with nothing above them: the
		// composition renders them in a plain container, and the live surface measures
		// `border-top-width: 0` over a transparent fill. What it does keep is the
		// card's own 24 gutter, 24 above, and the run of the card padding below, so the
		// row lines up with the heading and the list over it. The 24 above comes from
		// `--consent-manager-footer-padding`, which is `var(--inth-space-lg) 0 0 0`:
		// those actions are the manager's footer, not the dialog frame's, so the 16 in
		// `panel.module.css` never paints and reading it instead left the row 8 short.
		expect(nodeStyle(dialogFooter)).toMatchObject({
			backgroundColor: defaultConsentTheme.colors.surface,
			borderTopWidth: 0,
			gap: 8,
			paddingBottom: 24,
			paddingHorizontal: 24,
			paddingTop: 24,
		});

		const sheet = mountSurface(
			<ConsentDialog
				onRequestClose={vi.fn()}
				open
				presentation="sheet"
			/>
		);
		const sheetFooter = surfaceNode(sheet.container())
			.lastElementChild as HTMLElement;

		// A bottom sheet runs to the screen edges, so it has no card gutter to take
		// and keeps 16 all round. Same card fill and no rule either: the two are one
		// card anchored two ways, and the host's `presentation` prop should not also
		// restyle its footer.
		expect(nodeStyle(sheetFooter)).toMatchObject({
			backgroundColor: defaultConsentTheme.colors.surface,
			borderTopWidth: 0,
			gap: 8,
			paddingBottom: 16,
			paddingHorizontal: 16,
			paddingTop: 16,
		});

		banner.unmount();
		dialog.unmount();
		sheet.unmount();
	});

	test('a button is padded by its label and sized by the tap target', () => {
		const tree = mountSurface(<ConsentBanner />);
		const action = nodeStyle(
			requireRole(tree.container(), 'button', 'Alle akzeptieren')
		);

		// `0.5rem 0.75rem`. The drawn box is 35.5 tall, which is under the
		// platform minimum on purpose: the 44 is a touch requirement, so it grows
		// the hit area rather than the control. See
		// `web-token-parity.test.tsx` for the assertion on that hit area.
		expect(action.paddingVertical).toBe(8);
		expect(action.paddingHorizontal).toBe(12);
		expect(action.minHeight ?? null).toBeNull();

		tree.unmount();
	});

	test('the switch is the web track inside a platform tap target', async () => {
		const tree = mountSurface(
			<ConsentDialog
				onRequestClose={vi.fn()}
				open
			/>
		);

		await flushPromises();

		// The 28x16 fully rounded track the consent surfaces ask the primitive
		// for, rather than the native control tinted to look near it. The thumb

		// lives inside the track's own padding.
		const trackStyle = () =>
			nodeStyle(
				requireRole(tree.container(), 'switch', 'Werbung')
					.firstElementChild as HTMLElement
			);

		expect(trackStyle()).toMatchObject({
			borderRadius: 8,
			height: 16,
			padding: 2,
			width: 28,
		});

		// The visible control is small; the finger still gets the platform minimum.
		// It reaches that minimum through its hit area now rather than a 44pt box laid
		// around the track. That box was the same size of touch target, but it drew: a
		// row is only as tall as the tallest thing inside it, so the card around this
		// control measured 60 instead of the web's 42.
		const control = requireRole(tree.container(), 'switch', 'Werbung');

		expect(nodeStyle(control).height ?? null).toBeNull();

		const slop = hitSlop(control);

		expect(16 + slop.top + slop.bottom).toBe(MIN_TAP_TARGET);
		expect(28 + slop.left + slop.right).toBe(MIN_TAP_TARGET);

		expect(trackStyle().backgroundColor).toBe(
			defaultConsentTheme.colors.switchTrack
		);

		flush(() => {
			tapSwitch(tree.container(), 'Werbung');
		});

		expect(
			requireRole(tree.container(), 'switch', 'Werbung').getAttribute(
				'aria-checked'
			)
		).toBe('true');
		expect(trackStyle().backgroundColor).toBe(
			defaultConsentTheme.colors.switchTrackActive
		);

		tree.unmount();
	});

	test('the branding tab is the web tag, and a host can restyle it', () => {
		const tree = mountSurface(<ConsentBanner />);

		// `0.6875rem` at `line-height: 1`, so the line box is the font size rather
		// than a step on the type scale. It is the one piece of text in a consent
		// surface that is not the subject's own language.
		expect(textStyleOf(tree, 'Consent by')).toEqual(
			expect.objectContaining({
				color: defaultConsentTheme.colors.textOnPrimary,
				fontSize: 11,
				lineHeight: 11,
			})
		);

		expect(
			nodeStyle(roleNodes(tree.container(), 'link')[0] as HTMLElement).gap
		).toBe(6);
		tree.unmount();

		const styled = mountSurface(
			<ConsentBanner styles={{ branding: { backgroundColor: '#010203' } }} />
		);

		expect(
			nodeStyle(roleNodes(styled.container(), 'link')[0] as HTMLElement)
				.backgroundColor
		).toBe('#010203');
		styled.unmount();
	});

	test('a host theme replaces the palette wholesale', () => {
		const tree = mountSurface(
			<ConsentBanner
				theme={createConsentTheme({ colors: { surface: '#123456' } })}
			/>
		);

		expect(
			nodeStyle(surfaceNode(tree.container(), 'Deine Privatsphaere'))
				.backgroundColor
		).toBe('#123456');

		tree.unmount();
	});

	test('a per-part override beats the theme', () => {
		const styles: ConsentPartStyles = { title: { color: '#AA0000' } };
		const tree = mountSurface(<ConsentBanner styles={styles} />);

		expect(nodeStyle(requireRole(tree.container(), 'header')).color).toBe(
			'#AA0000'
		);

		tree.unmount();
	});

	test('array overrides flatten and unknown parts are dropped', () => {
		// A host writing plain JavaScript has nothing stopping it from naming a
		// part that does not exist, so the map has to survive that.
		const styles = {
			'not-a-part': { color: '#00FF00' },
			title: [{ color: '#0000AA' }, false, { fontWeight: '700' }],
		} as ConsentPartStyles;
		const resolved = probeFacts({ styles });

		expect(resolved.titleColor).toBe('#0000AA');
		expect(resolved.titleWeight).toBe('700');
		expect(resolved.border).toBe(16);

		expect(isConsentThemePart('title')).toBe(true);
		expect(isConsentThemePart('not-a-part')).toBe(false);
	});

	test('large text grows the controls and caps the body', () => {
		setFontScale(1);
		const small = probeFacts();

		expect(small.fontScale).toBe(1);
		expect(small.controlMinHeight).toBe(44);

		// Three times the default, which is the smallest scale where the label's
		// own line box is what clears the platform minimum rather than merely
		// reaching it.
		setFontScale(3);
		const large = probeFacts();

		expect(large.controlMinHeight).toBeGreaterThan(44);
		// The body gives up screen height rather than pushing the footer off it.
		expect(large.maxBodyHeight).toBeLessThan(844);

		setFontScale(8);

		// Beyond a scale this package can lay out, it sizes for the largest one
		// it knows instead of building something unrenderable.
		expect(probeFacts().fontScale).toBe(3.5);
	});

	test('a host theme keeps its own tokens', () => {
		const theme = createConsentTheme({
			radius: { lg: 2 },
			spacing: { lg: 4 },
		});
		const resolved = probeFacts({ theme });

		expect(resolved.border).toBe(2);
		expect(resolved.scheme).toBe('light');
	});

	test('a host theme follows the platform scheme, and colors apply to both unless dark overrides', () => {
		const theme = createConsentTheme({
			colors: { primary: '#7C3AED', surface: '#FAF5FF' },
			dark: { surface: '#1E1033' },
		});

		expect(theme.colors.primary).toBe('#7C3AED');
		expect(theme.dark.primary).toBe('#7C3AED');
		expect(theme.dark.surface).toBe('#1E1033');
		// Unset colours keep each appearance's stock value.
		expect(theme.dark.text).toBe(defaultConsentTheme.dark.text);

		setColorScheme('dark');
		const dark = mountSurface(<ConsentBanner theme={theme} />);
		expect(
			nodeStyle(surfaceNode(dark.container(), 'Deine Privatsphaere'))
				.backgroundColor
		).toBe('#1E1033');
		dark.unmount();
	});

	test('colours only the native presenter draws stay out of the palette', () => {
		const theme = createConsentTheme({
			colors: { canvas: '#F8F4EE', decision: '#172554', primary: '#2563EB' },
			dark: { textOnDecision: '#172554' },
		});

		expect(theme.colors).not.toHaveProperty('canvas');
		expect(theme.colors).not.toHaveProperty('decision');
		expect(theme.dark).not.toHaveProperty('textOnDecision');
		expect(theme.colors.primary).toBe('#2563EB');
	});

	test('the type roles scale with the type tokens and keep their ratios', () => {
		const roles = resolveConsentTypeRoles(
			createConsentTheme({
				typography: {
					fontSize: { base: 18, sm: 16 },
					fontWeight: { medium: 600 },
				},
			}).typography
		);

		expect(roles.bannerTitle).toEqual({
			fontSize: 18,
			lineHeight: 27,
			weight: '600',
		});
		expect(roles.bannerBody.lineHeight).toBe(24);
		expect(roles.title.fontSize).toBeCloseTo((18 * 17) / 16);
		expect(roles.body.fontSize).toBeCloseTo((16 * 13) / 14);
		expect(roles.label).toEqual({
			fontSize: 16,
			lineHeight: 20,
			weight: '600',
		});
		expect(roles.caption.fontSize).toBeCloseTo((16 * 13) / 14);
	});

	test('a font family reaches every text part, and a named headline font the heading', () => {
		const faces = probeFonts({
			theme: createConsentTheme({
				typography: { fontFamily: 'Inter', headlineFont: 'Fraunces' },
			}),
		});

		expect(faces.title).toBe('Fraunces');
		expect(faces.description).toBe('Inter');
		expect(faces.primaryLabel).toBe('Inter');
		// A container draws no text and takes no face.
		expect(faces.banner).toBeUndefined();

		// A part override restyles the part; it does not take the theme's face away.
		const overridden = probeFonts({
			styles: {
				description: { color: '#123456' },
				title: { color: '#123456' },
			},
			theme: createConsentTheme({
				typography: { fontFamily: 'Inter', headlineFont: 'Fraunces' },
			}),
		});
		expect(overridden.title).toBe('Fraunces');
		expect(overridden.description).toBe('Inter');

		const keyword = probeFonts({
			theme: createConsentTheme({ typography: { headlineFont: 'serif' } }),
		});
		expect(keyword.title).toBeUndefined();
	});

	test('one theme names each font per platform, as the Expo plugin takes it', () => {
		const theme = createConsentTheme({
			typography: {
				fontFamily: { android: 'inter_regular', ios: 'Inter-Regular' },
				headlineFont: { android: 'fraunces_bold', ios: 'Fraunces-Bold' },
			},
		});

		setPlatformOS('ios');
		const ios = probeFonts({ theme });
		expect(ios.title).toBe('Fraunces-Bold');
		expect(ios.description).toBe('Inter-Regular');

		setPlatformOS('android');
		const android = probeFonts({ theme });
		expect(android.title).toBe('fraunces_bold');
		expect(android.description).toBe('inter_regular');
	});
});

describe('platform behaviour', () => {
	test('the Android back gesture closes a sheet that can close', () => {
		setPlatformOS('android');
		const onRequestClose = vi.fn();
		const tree = mountSurface(<HostBanner onRequestClose={onRequestClose} />);

		expect(pressBack()).toBe(true);
		expect(onRequestClose).toHaveBeenCalledTimes(1);

		tree.unmount();
	});

	test('a sheet with no exit leaves the back gesture to the app', () => {
		setPlatformOS('android');
		const tree = mountSurface(<HostBanner />);

		expect(pressBack()).toBe(false);

		tree.unmount();
	});

	test('iOS never takes the back gesture', () => {
		setPlatformOS('ios');
		const onRequestClose = vi.fn();
		const tree = mountSurface(<HostBanner onRequestClose={onRequestClose} />);

		expect(pressBack()).toBe(false);
		expect(onRequestClose).not.toHaveBeenCalled();

		tree.unmount();
	});

	test('a late reduce-motion request takes over the running animation', async () => {
		const tree = mountSurface(<ConsentBanner />);

		await flushPromises();
		expect(animationState.durations).toEqual([260]);

		flush(() => {
			setReduceMotion(true);
		});
		await flushPromises();

		expect(animationState.durations).toContain(1);
		expect(animationState.jsDriverStarts).toBe(0);

		tree.unmount();
	});

	test('the sheet content refuses to render outside a surface', () => {
		const message = captureErrorMessage(() => {
			mountSurface(<ConsentSurfaceHeader>orphan</ConsentSurfaceHeader>);
		});

		expect(message).toContain('ConsentBanner');
	});
});

describe('copy and scope changes', () => {
	test('new copy replaces what is on screen', async () => {
		const tree = mountSurface(<ConsentBanner />);

		await flushPromises();
		tree.resetCommits();

		flush(() => {
			tree.fake.pushSnapshot(
				translatedSnapshot({
					revision: 5,
					translations: {
						language: 'de',
						translations: {
							cookieBanner: {
								description: 'Neue Beschreibung.',
								title: 'Neue Ueberschrift',
							},
						},
					},
				})
			);
		});
		await flushPromises();

		expect(tree.text()).toContain('Neue Beschreibung.');
		// The group the bundle left out falls back instead of going blank.
		expect(tree.text()).toContain('Accept All');
		expect(tree.commits()).toBe(1);

		tree.unmount();
	});

	test('a narrowed scope drops rows from an open sheet', async () => {
		const tree = mountSurface(
			<ConsentDialog
				onRequestClose={vi.fn()}
				open
			/>
		);

		await flushPromises();
		expect(roleNodes(tree.container(), 'switch')).toHaveLength(5);

		flush(() => {
			tree.fake.pushSnapshot(
				translatedSnapshot({
					consentCategories: ['necessary', 'measurement'],
					revision: 6,
				})
			);
		});
		await flushPromises();

		expect(roleNodes(tree.container(), 'switch')).toHaveLength(2);
		expect(tree.text()).toContain('Messung');
		expect(tree.text()).not.toContain('Werbung');

		tree.unmount();
	});

	test('an unrelated grant moves a switch the subject never touched', async () => {
		const tree = mountSurface(
			<ConsentDialog
				onRequestClose={vi.fn()}
				open
			/>
		);

		await flushPromises();

		expect(
			requireRole(tree.container(), 'switch', 'Werbung').getAttribute(
				'aria-checked'
			)
		).toBe('false');

		flush(() => {
			tree.fake.pushSnapshot(
				translatedSnapshot({
					effectivePermissions: {
						experience: true,
						functionality: true,
						marketing: true,
						measurement: true,
						necessary: true,
					},
					revision: 7,
				})
			);
		});
		await flushPromises();

		expect(
			requireRole(tree.container(), 'switch', 'Werbung').getAttribute(
				'aria-checked'
			)
		).toBe('true');
		// A row the subject has not touched follows the policy.
		tapSwitch(tree.container(), 'Messung');

		expect(
			requireRole(tree.container(), 'switch', 'Messung').getAttribute(
				'aria-checked'
			)
		).toBe('true');

		tree.unmount();
	});
});

describe('closing', () => {
	test('a sheet that was never opened holds no category list', async () => {
		const ToggleHost = (): ReactNode => {
			const [open, setOpen] = useState(false);

			return (
				<ConsentDialog
					onRequestClose={() => {
						setOpen(false);
					}}
					open={open}
				/>
			);
		};

		const tree = mountSurface(<ToggleHost />);

		await flushPromises();
		expect(roleNodes(tree.container(), 'switch')).toEqual([]);

		// A shut sheet holds no subscription either, so a grant costs it nothing.
		flush(() => {
			tree.fake.pushSnapshot(
				translatedSnapshot({
					effectivePermissions: {
						experience: true,
						functionality: true,
						marketing: true,
						measurement: true,
						necessary: true,
					},
					revision: 8,
				})
			);
		});
		await flushPromises();

		expect(roleNodes(tree.container(), 'switch')).toEqual([]);

		tree.unmount();
	});
});
