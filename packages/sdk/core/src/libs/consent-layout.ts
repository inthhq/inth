/**
 * Resolve where a consent prompt sits and how it behaves: Card, Banner or
 * Drawer, its position, whether it expands in place or shows every choice
 * at once, its edge style, and whether it blocks the page.
 *
 * This is the one decision matrix every renderer uses, so React, Vue,
 * Svelte, Angular, Astro and the script-tag build show the same surface for
 * the same input. It is pure.
 *
 * The container types are defined once, in `@inth/sdk-schema`, because a
 * policy rule's `surface` carries them too; they are re-exported here under
 * the same names.
 */
import {
	CONSENT_BANNER_EDGES,
	CONSENT_CARD_POSITIONS,
	CONSENT_DRAWER_SIDES,
} from '@inth/sdk-schema/types';
import type {
	BannerEdge,
	CardPosition,
	ConsentBlockingConstraint,
	ConsentContainer,
	ConsentContainerType,
	ConsentEdgeStyle,
	DrawerSide,
	PolicyPrompt,
	PolicyRuleModel,
} from '@inth/sdk-schema/types';

export type {
	BannerEdge,
	CardPosition,
	ConsentBlockingConstraint,
	ConsentContainer,
	ConsentContainerType,
	ConsentEdgeStyle,
	DrawerSide,
} from '@inth/sdk-schema/types';

/** Viewport class the layout is resolved for. */
export type ConsentViewport = 'desktop' | 'phone';

/**
 * Widest viewport, in CSS pixels, that renders the phone layout. A side
 * Drawer needs about 460px plus room for the page, so narrower windows
 * get the bottom Drawer instead.
 */
export const PHONE_LAYOUT_MAX_WIDTH = 640;

/** Media query matching {@link PHONE_LAYOUT_MAX_WIDTH}. */
export const PHONE_LAYOUT_QUERY = `(max-width: ${PHONE_LAYOUT_MAX_WIDTH}px)`;

/** Every resolved placement. One renderer branch per value. */
export type ConsentPlacement =
	| 'card-start'
	| 'card-end'
	| 'card-center'
	| 'banner-bottom'
	| 'banner-top'
	| 'drawer-bottom'
	| 'drawer-top'
	| 'drawer-start'
	| 'drawer-end';

/**
 * `expand-in-place` shows a summary first; Customize opens the choices
 * inside the same surface. `all-in-one` shows the choices from the start
 * and has no Customize.
 */
export type ConsentFlow = 'expand-in-place' | 'all-in-one';

/** Host layout options for the consent prompt. */
export interface ConsentLayoutOptions {
	/** @default { type: 'card', position: 'start' } */
	container?: ConsentContainer;
	/** @default 'inset' */
	edgeStyle?: ConsentEdgeStyle;
	/**
	 * Block the page until the visitor makes a choice. A centred Card always
	 * blocks. Never applies to a notice, to a rule without a prompt, or under
	 * an opt-out model.
	 * @default false
	 */
	blockUntilChoice?: boolean;
}

/** Inputs to {@link resolveLayout}. */
export interface ResolveLayoutInput extends ConsentLayoutOptions {
	/** First-layer interaction the active policy requires. */
	prompt: PolicyPrompt;
	/** Permission model of the active policy. */
	model: PolicyRuleModel;
	/** @default 'allowed' */
	blockingConstraint?: ConsentBlockingConstraint;
	/** @default 'desktop' */
	viewport?: ConsentViewport;
}

/** Mechanical findings about a layout request. */
export interface ConsentLayoutDiagnostic {
	code:
		| 'invalid-container'
		| 'center-unavailable'
		| 'blocking-forbidden'
		| 'blocking-required'
		| 'edge-style-ignored'
		| 'invalid-edge-style';
	message: string;
}

/** Resolved layout for one viewport. */
export interface ResolvedConsentLayout {
	type: ConsentContainerType;
	placement: ConsentPlacement;
	flow: ConsentFlow;
	blocking: boolean;
	edgeStyle: ConsentEdgeStyle;
	diagnostics: ConsentLayoutDiagnostic[];
}

/** Quote a value for a diagnostic without calling into a hostile object. */
const describeValue = (value: unknown): string =>
	typeof value === 'string' ? `"${value}"` : `a ${typeof value}`;

const CARD_POSITIONS: readonly CardPosition[] = CONSENT_CARD_POSITIONS;
const BANNER_EDGES: readonly BannerEdge[] = CONSENT_BANNER_EDGES;
const DRAWER_SIDES: readonly DrawerSide[] = CONSENT_DRAWER_SIDES;

/** Default layout when the host supplies none. */
export const DEFAULT_CONSENT_CONTAINER: Readonly<{
	type: 'card';
	position: 'start';
}> = Object.freeze({ position: 'start', type: 'card' });

/**
 * Fill defaults and replace anything invalid with the type's default, so
 * the rest of the resolver only sees valid layouts.
 */
const normalizeContainer = function normalizeContainer(
	container: ConsentContainer | undefined,
	diagnostics: ConsentLayoutDiagnostic[]
):
	| { type: 'card'; position: CardPosition }
	| { type: 'banner'; edge: BannerEdge }
	| { type: 'drawer'; side: DrawerSide } {
	if (container === undefined) {
		return DEFAULT_CONSENT_CONTAINER;
	}
	if (container === null || typeof container !== 'object') {
		diagnostics.push({
			code: 'invalid-container',
			message: 'The container is not an object; using a card at "start".',
		});
		return DEFAULT_CONSENT_CONTAINER;
	}
	switch (container.type) {
		case 'card': {
			const position = container.position ?? 'start';
			if (CARD_POSITIONS.includes(position)) {
				return { position, type: 'card' };
			}
			diagnostics.push({
				code: 'invalid-container',
				message: `Card position ${describeValue(position)} is not valid; using "start".`,
			});
			return DEFAULT_CONSENT_CONTAINER;
		}
		case 'banner': {
			const edge = container.edge ?? 'bottom';
			if (BANNER_EDGES.includes(edge)) {
				return { edge, type: 'banner' };
			}
			diagnostics.push({
				code: 'invalid-container',
				message: `Banner edge ${describeValue(edge)} is not valid; using "bottom".`,
			});
			return { edge: 'bottom', type: 'banner' };
		}
		case 'drawer': {
			const side = container.side ?? 'bottom';
			if (DRAWER_SIDES.includes(side)) {
				return { side, type: 'drawer' };
			}
			diagnostics.push({
				code: 'invalid-container',
				message: `Drawer side ${describeValue(side)} is not valid; using "bottom".`,
			});
			return { side: 'bottom', type: 'drawer' };
		}
		default: {
			diagnostics.push({
				code: 'invalid-container',
				message: `Container type ${describeValue((container as { type?: unknown }).type)} is not valid; using a card at "start".`,
			});
			return DEFAULT_CONSENT_CONTAINER;
		}
	}
};

/**
 * Whether this policy may block the page at all. Only a choice prompt
 * outside an opt-out model has something to block for; blocking a notice
 * or an opt-out regime would be a wall with nothing to consent to.
 */
const canBlock = function canBlock(
	prompt: PolicyPrompt,
	model: PolicyRuleModel,
	constraint: ConsentBlockingConstraint
): boolean {
	return (
		constraint !== 'forbidden' && prompt === 'choice' && model !== 'opt-out'
	);
};

type NormalizedContainer = ReturnType<typeof normalizeContainer>;

/**
 * Move the container where this policy and viewport can show it. A centred
 * Card needs blocking; side Drawers have no room on phone.
 */
const placeContainer = function placeContainer(
	container: NormalizedContainer,
	blockable: boolean,
	viewport: ConsentViewport,
	diagnostics: ConsentLayoutDiagnostic[]
): NormalizedContainer {
	if (
		container.type === 'card' &&
		container.position === 'center' &&
		!blockable
	) {
		diagnostics.push({
			code: 'center-unavailable',
			message:
				'A centred card always blocks the page, and this policy cannot block; using "start".',
		});
		return DEFAULT_CONSENT_CONTAINER;
	}
	if (
		container.type === 'drawer' &&
		viewport === 'phone' &&
		(container.side === 'start' || container.side === 'end')
	) {
		return { side: 'bottom', type: 'drawer' };
	}
	return container;
};

/** Decide blocking from the host request, the policy and the container. */
const resolveContainerBlocking = function resolveContainerBlocking(
	input: ResolveLayoutInput,
	container: NormalizedContainer,
	constraint: ConsentBlockingConstraint,
	blockable: boolean,
	diagnostics: ConsentLayoutDiagnostic[]
): boolean {
	const wantsBlocking =
		input.blockUntilChoice === true ||
		constraint === 'required' ||
		(container.type === 'card' && container.position === 'center');
	if (wantsBlocking && !blockable) {
		diagnostics.push({
			code: 'blocking-forbidden',
			message:
				constraint === 'forbidden'
					? 'The policy forbids blocking; the prompt does not block the page.'
					: 'Only a choice prompt outside an opt-out model can block the page; the prompt does not block.',
		});
		return false;
	}
	if (wantsBlocking && input.blockUntilChoice === false) {
		diagnostics.push({
			code: 'blocking-required',
			message:
				constraint === 'required'
					? 'The policy requires blocking; the prompt blocks the page.'
					: 'A centred card always blocks the page; the prompt blocks.',
		});
	}
	return wantsBlocking;
};

/** A Card is always inset; Banners and Drawers take the host's edge style. */
const resolveEdgeStyle = function resolveEdgeStyle(
	requested: ConsentEdgeStyle | undefined,
	container: NormalizedContainer,
	diagnostics: ConsentLayoutDiagnostic[]
): ConsentEdgeStyle {
	if (
		requested !== undefined &&
		requested !== 'inset' &&
		requested !== 'flush'
	) {
		diagnostics.push({
			code: 'invalid-edge-style',
			message: `Edge style ${describeValue(requested)} is not valid; using "inset".`,
		});
		return 'inset';
	}
	if (container.type === 'card') {
		if (requested === 'flush') {
			diagnostics.push({
				code: 'edge-style-ignored',
				message:
					'A card is always inset; edge style applies to banners and drawers.',
			});
		}
		return 'inset';
	}
	return requested ?? 'inset';
};

/** Placement and flow for a container already placed for its viewport. */
const toPlacement = function toPlacement(
	container: NormalizedContainer
): Pick<ResolvedConsentLayout, 'placement' | 'flow'> {
	switch (container.type) {
		case 'card':
			return {
				flow: 'expand-in-place',
				placement: `card-${container.position}`,
			};
		case 'banner':
			return { flow: 'expand-in-place', placement: `banner-${container.edge}` };
		default:
			return {
				flow:
					container.side === 'start' || container.side === 'end'
						? 'all-in-one'
						: 'expand-in-place',
				placement: `drawer-${container.side}`,
			};
	}
};

/**
 * Resolve the consent prompt's layout for one viewport.
 *
 * - A centred Card always blocks. Where blocking is not possible, it falls
 *   back to the `start` corner.
 * - Blocking applies when the host asks for it, the Card is centred or the
 *   policy requires it, and only for a choice prompt outside an opt-out
 *   model. A `forbidden` constraint always wins.
 * - `start` and `end` Drawers show every choice at once on desktop. On phone
 *   they become a bottom Drawer that expands in place. A top Drawer stays
 *   on top.
 * - A Card is always inset; edge style applies to Banners and Drawers.
 */
export const resolveLayout = function resolveLayout(
	input: ResolveLayoutInput
): ResolvedConsentLayout {
	const diagnostics: ConsentLayoutDiagnostic[] = [];
	const constraint = input.blockingConstraint ?? 'allowed';
	const blockable = canBlock(input.prompt, input.model, constraint);
	const container = placeContainer(
		normalizeContainer(input.container, diagnostics),
		blockable,
		input.viewport ?? 'desktop',
		diagnostics
	);
	const blocking = resolveContainerBlocking(
		input,
		container,
		constraint,
		blockable,
		diagnostics
	);
	const edgeStyle = resolveEdgeStyle(input.edgeStyle, container, diagnostics);
	return {
		blocking,
		diagnostics,
		edgeStyle,
		...toPlacement(container),
		type: container.type,
	};
};
