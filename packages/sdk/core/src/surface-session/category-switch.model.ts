/**
 * How a category switch and its vendors' switches move together, as pure
 * plans a renderer stages on its preference draft.
 *
 * @packageDocumentation
 */

/** A category's switch and its vendors' grants, as the draft shows them. */
export interface CategorySwitchState {
	/** The category's switch. */
	readonly on: boolean;
	/** Each listed vendor's grant, by id. A vendor counts only while the category is on. */
	readonly vendors: Readonly<Record<string, boolean>>;
}

/** What a switch press stages. */
export interface CategorySwitchPlan {
	readonly on: boolean;
	/** Vendor grants to stage; vendors left out keep theirs. */
	readonly vendors: Readonly<Record<string, boolean>>;
	/** The category switch moved on its own, so it is announced (CAT-04). */
	readonly categoryChanged: boolean;
}

/**
 * Press a category's switch (CAT-02). Turning it on with none of its
 * vendors on turns them all on, so a category is never on with nothing
 * in it. Turning it off keeps the vendors' grants for when it returns.
 */
export const planCategorySwitch = function planCategorySwitch(
	state: CategorySwitchState,
	on: boolean
): CategorySwitchPlan {
	const ids = Object.keys(state.vendors);
	const vendors: Record<string, boolean> = {};
	if (on && ids.length > 0 && !ids.some((id) => state.vendors[id])) {
		for (const id of ids) {
			vendors[id] = true;
		}
	}
	return { categoryChanged: on !== state.on, on, vendors };
};

/**
 * Press a vendor's switch (CAT-02, CAT-03). Vendor switches are never
 * disabled: turning one on while its category is off turns the category
 * on with only that vendor. Turning off the last vendor turns the category
 * off.
 */
export const planVendorSwitch = function planVendorSwitch(
	state: CategorySwitchState,
	vendorId: string,
	granted: boolean
): CategorySwitchPlan {
	if (!state.on) {
		if (!granted) {
			return { categoryChanged: false, on: false, vendors: {} };
		}
		const vendors: Record<string, boolean> = {};
		for (const id of Object.keys(state.vendors)) {
			vendors[id] = id === vendorId;
		}
		vendors[vendorId] = true;
		return { categoryChanged: true, on: true, vendors };
	}
	const next = { ...state.vendors, [vendorId]: granted };
	const anyOn = Object.values(next).some(Boolean);
	return {
		categoryChanged: !anyOn,
		on: anyOn,
		vendors: { [vendorId]: granted },
	};
};
