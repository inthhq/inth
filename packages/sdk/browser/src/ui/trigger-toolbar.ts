import type { TriggerTranslations } from '@inth/sdk-core';
import { nextToolbarItem, toolbarOrder } from '@inth/sdk-ui/utils';
import type { CornerPosition } from '@inth/sdk-ui/utils';

import { classes } from '../generated/styles';
import { h, svg } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The `</>` mark, stroked like the React toolbar's `DevToolsIcon`. */
const DEVTOOLS_MARK = ['m18 16 4-4-4-4', 'm6 8-4 4 4 4', 'm14.5 4-5 16'];

const createDevToolsIcon = function createDevToolsIcon(): SVGSVGElement {
	const icon = svg('0 0 24 24', [], {
		fill: 'none',
		stroke: 'currentColor',
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
		'stroke-width': 2,
	});
	for (const d of DEVTOOLS_MARK) {
		const path = document.createElementNS(SVG_NS, 'path');
		path.setAttribute('d', d);
		icon.append(path);
	}
	return icon;
};

/** What {@link createTriggerToolbar} needs. */
export interface TriggerToolbarParams {
	/** Accessible names of the preferences item, the toolbar and DevTools. */
	labels: TriggerTranslations;
	/** Icon of the preferences item. */
	icon: SVGSVGElement;
	/** Ship the DOM without class names. */
	noStyle: boolean;
	/** Item size. */
	size: 'sm' | 'md' | 'lg';
	/** Runs on a click or key press on an item; `false` cancels it. */
	shouldActivate: (event: MouseEvent) => boolean;
	/** Opens the preference centre. */
	onPreferences: () => void;
	/** Opens or closes DevTools. */
	onDevTools: () => void;
}

/** The two-item trigger shown while DevTools is mounted. */
export interface TriggerToolbar {
	/** The `role="toolbar"` root. */
	element: HTMLDivElement;
	/** Put the preferences item in `corner`, DevTools farthest from it. */
	setCorner: (corner: CornerPosition) => void;
	/** Reflect whether the DevTools panel is open. */
	setOpen: (isOpen: boolean) => void;
	/** Swap the preferences item's icon, for example after a branding change. */
	setIcon: (icon: SVGSVGElement) => void;
	/** Rename the items and the toolbar, for example after a language change. */
	setLabels: (labels: TriggerTranslations) => void;
}

/**
 * Build the toolbar the trigger becomes while a DevTools panel is mounted:
 * the preferences item and a DevTools item, with the same classes, data
 * attributes and ARIA as the React `ConsentDialogTrigger` toolbar. The
 * caller owns drag, position classes and visibility.
 *
 * @param params - Labels, icon and handlers.
 * @returns The toolbar.
 * @internal
 */
export const createTriggerToolbar = function createTriggerToolbar(
	params: TriggerToolbarParams
): TriggerToolbar {
	const styles = classes.trigger;
	const { noStyle } = params;

	const item = function item(
		action: 'preferences' | 'devtools',
		label: string,
		icon: SVGSVGElement,
		onSelect: () => void
	): HTMLButtonElement {
		return h(
			'button',
			{
				'aria-label': label,
				class: noStyle ? '' : `${styles.toolbarItem} ${styles[params.size]}`,
				'data-inth-trigger-action': action,
				'data-inth-trigger-item': action,
				onclick: (event: Event) => {
					if (params.shouldActivate(event as MouseEvent)) {
						onSelect();
					}
				},
				type: 'button',
			},
			h(
				'span',
				{ 'aria-hidden': 'true', class: noStyle ? '' : styles.toolbarIcon },
				icon
			)
		);
	};

	const preferences = item(
		'preferences',
		params.labels.label,
		params.icon,
		params.onPreferences
	);
	const devtools = item(
		'devtools',
		params.labels.devToolsLabel,
		createDevToolsIcon(),
		params.onDevTools
	);
	const buttons = { devtools, preferences };
	devtools.setAttribute('aria-expanded', 'false');

	const element = h('div', {
		'aria-label': params.labels.toolbarLabel,
		'aria-orientation': 'horizontal',
		'data-inth-trigger': 'true',
		'data-inth-trigger-toolbar': 'true',
		dir: 'ltr',
		role: 'toolbar',
		tabindex: -1,
	});

	// One tab stop; the arrow keys move between items.
	let active = preferences;
	const focusItem = function focusItem(next: HTMLButtonElement): void {
		active = next;
		for (const button of [preferences, devtools]) {
			button.tabIndex = button === active ? 0 : -1;
		}
	};
	for (const button of [preferences, devtools]) {
		button.addEventListener('focus', () => {
			focusItem(button);
		});
	}
	focusItem(preferences);
	element.addEventListener('keydown', (event) => {
		const next = nextToolbarItem(
			[...element.children] as HTMLButtonElement[],
			active,
			event.key
		);
		if (next) {
			event.preventDefault();
			next.focus();
		}
	});

	return {
		element,
		setCorner(corner) {
			const order = toolbarOrder(corner).map((kind) => buttons[kind]);
			if (element.firstElementChild !== order[0]) {
				element.append(...order);
			}
		},
		setIcon(icon) {
			preferences.firstElementChild?.replaceChildren(icon);
		},
		setLabels(labels) {
			preferences.setAttribute('aria-label', labels.label);
			devtools.setAttribute('aria-label', labels.devToolsLabel);
			element.setAttribute('aria-label', labels.toolbarLabel);
		},
		setOpen(isOpen) {
			devtools.setAttribute('aria-expanded', String(isOpen));
		},
	};
};
