/**
 * The consent prompt's container, edge style and blocking constraint: the
 * one place a policy rule speaks about layout.
 *
 * A rule's `surface` is mostly soft. Its `container` and `edgeStyle` are
 * defaults the host's own presentation overrides, so script-tag and
 * dashboard installs, which have no host props, still get a layout.
 * `blocking` is the one hard rule: a host cannot block the page where the
 * rule forbids it, or leave it unblocked where the rule requires it.
 *
 * None of it is behavior. `surface` stays out of the policy, choice and
 * notice fingerprints, so changing it never asks anyone again; it is hashed
 * in the presentation domain instead.
 *
 * These are the container types core's layout resolver reads
 * (`@inth/sdk-core`'s `resolveLayout`). No valibot here, for the same reason
 * as `policy-rule.ts`.
 */

/**
 * Where a Card sits: a bottom corner or the centre. `start` and `end` are
 * logical, like CSS `inset-inline-start`: they follow the page's writing
 * direction, so on a right-to-left page `start` is the bottom-right corner.
 */
export type CardPosition = 'start' | 'end' | 'center';

/** Viewport edges a Banner may occupy. */
export type BannerEdge = 'bottom' | 'top';

/**
 * Viewport side a Drawer slides in from. `start` and `end` are the inline
 * sides and follow the page's writing direction, as a Card's corners do.
 */
export type DrawerSide = 'bottom' | 'top' | 'start' | 'end';

/**
 * The container a consent prompt renders in. All three show the same
 * content, copy and decisions; only the container changes.
 */
export type ConsentContainer =
	| {
			type: 'card';
			/** @default 'start' */
			position?: CardPosition;
	  }
	| {
			type: 'banner';
			/** @default 'bottom' */
			edge?: BannerEdge;
	  }
	| {
			type: 'drawer';
			/** @default 'bottom' */
			side?: DrawerSide;
	  };

/** Container types, in the order hosts usually meet them. */
export type ConsentContainerType = ConsentContainer['type'];

/**
 * `inset` floats the surface 12px from the edges it touches with rounded
 * corners. `flush` runs it edge to edge with square corners. Banners,
 * Drawers and phone sheets use it; a Card is always inset.
 */
export type ConsentEdgeStyle = 'inset' | 'flush';

/**
 * Policy constraint on blocking the page until a choice is made.
 * `forbidden` never blocks, `required` always blocks a choice prompt, and
 * `allowed` lets the host decide.
 */
export type ConsentBlockingConstraint = 'forbidden' | 'allowed' | 'required';

export const CONSENT_CARD_POSITIONS = [
	'start',
	'end',
	'center',
] as const satisfies readonly CardPosition[];

export const CONSENT_BANNER_EDGES = [
	'bottom',
	'top',
] as const satisfies readonly BannerEdge[];

export const CONSENT_DRAWER_SIDES = [
	'bottom',
	'top',
	'start',
	'end',
] as const satisfies readonly DrawerSide[];

export const CONSENT_CONTAINER_TYPES = [
	'card',
	'banner',
	'drawer',
] as const satisfies readonly ConsentContainerType[];

export const CONSENT_EDGE_STYLES = [
	'inset',
	'flush',
] as const satisfies readonly ConsentEdgeStyle[];

export const CONSENT_BLOCKING_CONSTRAINTS = [
	'forbidden',
	'allowed',
	'required',
] as const satisfies readonly ConsentBlockingConstraint[];

/** Author-facing layout defaults and blocking constraint of a rule. */
export interface PolicySurface {
	/**
	 * Container the prompt uses when the host picks none. A host
	 * `container`, or a legacy `variant` or `position`, wins.
	 */
	container?: ConsentContainer;
	/** Edge style when the host picks none. */
	edgeStyle?: ConsentEdgeStyle;
	/**
	 * Hard constraint on blocking the page. `required` needs a `choice`
	 * prompt outside the `opt-out` model.
	 * @default 'allowed'
	 */
	blocking?: ConsentBlockingConstraint;
}

/**
 * Canonical `surface`. The container carries its position, edge or side.
 * A `blocking` the rule already implies (`allowed`, or `forbidden` on a
 * rule that cannot block) is left out, and so is a `surface` with nothing
 * left in it, so a rule without layout reads exactly as it did before
 * `surface` existed.
 */
export interface ResolvedPolicySurface {
	container?: ConsentContainer;
	edgeStyle?: ConsentEdgeStyle;
	blocking?: ConsentBlockingConstraint;
}

/** Own keys a `surface` and each container type may carry. */
export const POLICY_SURFACE_KEYS = [
	'container',
	'edgeStyle',
	'blocking',
] as const;

const CONTAINER_FIELDS = {
	banner: { key: 'edge', values: CONSENT_BANNER_EDGES },
	card: { key: 'position', values: CONSENT_CARD_POSITIONS },
	drawer: { key: 'side', values: CONSENT_DRAWER_SIDES },
} as const satisfies Record<
	ConsentContainerType,
	{ key: string; values: readonly string[] }
>;

const includes = (values: readonly string[], value: unknown): boolean =>
	typeof value === 'string' && values.includes(value);

const isPlainObject = function isPlainObject(
	value: unknown
): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value) as unknown;
	return prototype === Object.prototype || prototype === null;
};

const own = (value: Record<string, unknown>, key: string): unknown =>
	Object.hasOwn(value, key) ? value[key] : undefined;

const collectContainerIssues = function collectContainerIssues(
	container: unknown,
	path: string
): string[] {
	if (!isPlainObject(container)) {
		return [`${path} must be an object`];
	}
	const type = own(container, 'type');
	if (!includes(CONSENT_CONTAINER_TYPES, type)) {
		return [
			`${path}.type must be one of ${CONSENT_CONTAINER_TYPES.join(', ')}`,
		];
	}
	const field = CONTAINER_FIELDS[type as ConsentContainerType];
	const issues: string[] = [];
	for (const key of Object.getOwnPropertyNames(container)) {
		if (key !== 'type' && key !== field.key) {
			issues.push(`${path} has unknown field "${key}"`);
		}
	}
	const member = own(container, field.key);
	if (member !== undefined && !includes(field.values, member)) {
		issues.push(
			`${path}.${field.key} must be one of ${field.values.join(', ')}`
		);
	}
	return issues;
};

/**
 * Problems with a `surface` value, each phrased after `path` (for example
 * `surface.container.type must be …`). Only own fields of plain objects
 * count; unknown fields are problems.
 *
 * @param value - The raw `surface`.
 * @param path - Prefix for each message, usually `surface`.
 */
export const collectPolicySurfaceFieldIssues =
	function collectPolicySurfaceFieldIssues(
		value: unknown,
		path = 'surface'
	): string[] {
		if (!isPlainObject(value)) {
			return [`${path} must be an object`];
		}
		const issues: string[] = [];
		for (const key of Object.getOwnPropertyNames(value)) {
			if (!(POLICY_SURFACE_KEYS as readonly string[]).includes(key)) {
				issues.push(`${path} has unknown field "${key}"`);
			}
		}
		const container = own(value, 'container');
		if (container !== undefined) {
			issues.push(...collectContainerIssues(container, `${path}.container`));
		}
		const edgeStyle = own(value, 'edgeStyle');
		if (edgeStyle !== undefined && !includes(CONSENT_EDGE_STYLES, edgeStyle)) {
			issues.push(`${path}.edgeStyle must be one of inset, flush`);
		}
		const blocking = own(value, 'blocking');
		if (
			blocking !== undefined &&
			!includes(CONSENT_BLOCKING_CONSTRAINTS, blocking)
		) {
			issues.push(
				`${path}.blocking must be one of ${CONSENT_BLOCKING_CONSTRAINTS.join(', ')}`
			);
		}
		return issues;
	};

/**
 * Whether a rule can block the page at all. Only a choice prompt outside
 * the opt-out model has something to block for, which is the rule core's
 * layout resolver applies.
 */
export const canPolicyBlock = function canPolicyBlock(rule: {
	model: string;
	prompt: string;
}): boolean {
	return rule.prompt === 'choice' && rule.model !== 'opt-out';
};

/**
 * Problems with a well-formed `surface` against its rule: `required`
 * blocking on a rule that can never block.
 */
export const collectPolicySurfaceRuleIssues =
	function collectPolicySurfaceRuleIssues(
		surface: PolicySurface,
		rule: { model: string; prompt: string },
		path = 'surface'
	): string[] {
		if (surface.blocking === 'required' && !canPolicyBlock(rule)) {
			return [
				`${path}.blocking "required" needs prompt "choice" outside the opt-out model, received model "${rule.model}" and prompt "${rule.prompt}"`,
			];
		}
		return [];
	};

const canonicalContainer = function canonicalContainer(
	container: ConsentContainer
): ConsentContainer {
	switch (container.type) {
		case 'card':
			return { position: container.position ?? 'start', type: 'card' };
		case 'banner':
			return { edge: container.edge ?? 'bottom', type: 'banner' };
		default:
			return { side: container.side ?? 'bottom', type: 'drawer' };
	}
};

/**
 * The canonical form of a well-formed `surface` for its rule, or
 * `undefined` when nothing in it is left. Fills the container's default
 * position, edge or side, and drops a blocking constraint the rule already
 * implies.
 *
 * @param surface - A `surface` that passed {@link collectPolicySurfaceFieldIssues}.
 * @param rule - The rule's model and prompt.
 */
export const canonicalizePolicySurface = function canonicalizePolicySurface(
	surface: PolicySurface | undefined,
	rule: { model: string; prompt: string }
): ResolvedPolicySurface | undefined {
	if (surface === undefined) {
		return undefined;
	}
	const resolved: ResolvedPolicySurface = {};
	if (surface.container !== undefined) {
		resolved.container = canonicalContainer(surface.container);
	}
	if (surface.edgeStyle !== undefined) {
		resolved.edgeStyle = surface.edgeStyle;
	}
	const implied = canPolicyBlock(rule) ? 'allowed' : 'forbidden';
	if (
		surface.blocking !== undefined &&
		surface.blocking !== 'allowed' &&
		surface.blocking !== implied
	) {
		resolved.blocking = surface.blocking;
	}
	return Object.keys(resolved).length > 0 ? resolved : undefined;
};
