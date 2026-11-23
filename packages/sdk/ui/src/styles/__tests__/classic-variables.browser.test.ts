/**
 * A site that styled the old banner or dialog through their component
 * variables keeps that styling: each mapped classic variable, set on an
 * ancestor, changes the computed style of the part it maps to, and the
 * part's own hook wins over it.
 *
 * The cases come from `scripts/classic-variables.ts`, the list the docs
 * table is checked against, so a newly mapped variable is tested here
 * without a new case.
 *
 * Both stylesheet deliveries are covered: the whole `styles.css`, which
 * also holds the widget's rules, and the per-surface sheets. With nothing
 * set, each part must compute as it does with the variable set to
 * `initial`, so no classic default reaches a part from either.
 *
 * These read the built artifacts: build `@inth/sdk/ui` first.
 */
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';

import bar from '../../../dist/styles/components/consent-banner.js';
import card from '../../../dist/styles/components/consent-card.js';
import dialog from '../../../dist/styles/components/consent-dialog.js';
import drawer from '../../../dist/styles/components/consent-drawer.js';
import surface from '../../../dist/styles/components/consent-surface.js';
import * as barSheet from '../../../dist/styles/sheets/banner.js';
import * as buttonSheet from '../../../dist/styles/sheets/button.js';
import * as cardSheet from '../../../dist/styles/sheets/card.js';
import * as dialogSheet from '../../../dist/styles/sheets/dialog.js';
import * as drawerSheet from '../../../dist/styles/sheets/drawer.js';
import * as expandSheet from '../../../dist/styles/sheets/expand.js';
import * as surfaceSheet from '../../../dist/styles/sheets/surface.js';
import * as tokensSheet from '../../../dist/styles/sheets/tokens.js';
import { CLASSIC_VARIABLES } from '../../../scripts/classic-variables';
import type {
	ClassicMapping,
	ClassicProbe,
	ClassicProbeSurface,
} from '../../../scripts/classic-variables';

import stylesCss from '../../../dist/styles.css?raw';

type ClassMap = Record<string, string>;

type Delivery = 'sheets' | 'whole';

const DELIVERIES: Record<Delivery, string> = {
	sheets: [
		tokensSheet,
		buttonSheet,
		surfaceSheet,
		cardSheet,
		barSheet,
		drawerSheet,
		expandSheet,
		dialogSheet,
	]
		.map((sheet) => sheet.css)
		.join('\n'),
	whole: stylesCss,
};

const PRESENTATION: Record<
	Exclude<ClassicProbeSurface, 'dialog'>,
	{ attributes: Record<string, string>; classes: ClassMap }
> = {
	bar: {
		attributes: { 'edge-style': 'inset', placement: 'banner-bottom' },
		classes: bar as ClassMap,
	},
	'bar-flush-top': {
		attributes: { 'edge-style': 'flush', placement: 'banner-top' },
		classes: bar as ClassMap,
	},
	card: {
		attributes: { 'edge-style': 'inset', placement: 'card-start' },
		classes: card as ClassMap,
	},
	'card-center': {
		attributes: { 'edge-style': 'inset', placement: 'card-center' },
		classes: card as ClassMap,
	},
	'drawer-flush-end': {
		attributes: {
			'edge-style': 'flush',
			flow: 'all-in-one',
			placement: 'drawer-end',
		},
		classes: drawer as ClassMap,
	},
};

// Long enough that the corner card reaches its width, as real copy does: a
// short line would shrink-wrap the layer.
const DESCRIPTION =
	'We and our partners use cookies to run this site, measure how it is used and show relevant ads. Choose which ones we may use.';

const styleElement = document.createElement('style');
let host: HTMLDivElement | undefined;

/** Renders the surface inside a host the variables are set on. */
const render = function render(
	surfaceName: ClassicProbeSurface,
	closing: boolean
): HTMLDivElement {
	host?.remove();
	host = document.createElement('div');
	document.body.append(host);

	if (surfaceName === 'dialog') {
		const classes = dialog as ClassMap;
		host.innerHTML = `
			<div class="${classes.backdrop}" data-part="backdrop" data-edge-style="inset">
				<div class="${classes.card}" data-part="card">
					<div class="${classes.header}" data-part="header">
						<div>
							<h2 class="${classes.title}" data-part="title">Your Privacy Choices</h2>
							<p class="${classes.intro}" data-part="intro">How this site uses your data.</p>
						</div>
						<button type="button" class="${classes.close}">x</button>
					</div>
					<div class="${classes.footer}" data-part="footer">
						<span class="${classes.footerNote}" data-part="footerNote">Saved on this device</span>
						<div class="${classes.footerActions}"><button type="button">Done</button></div>
					</div>
				</div>
			</div>`;
		return host;
	}

	const { attributes, classes } = PRESENTATION[surfaceName];
	const own = surface as ClassMap;
	const part = (name: string) =>
		`class="${[own[name], classes[name]].filter(Boolean).join(' ')}" data-part="${name}"`;
	const data = Object.entries(attributes)
		.map(([name, value]) => `data-${name}="${value}"`)
		.join(' ');
	host.innerHTML = `
		<div ${part('root')} ${data}${closing ? ' data-state="closed"' : ''}>
			<div ${part('scrim')}></div>
			<div ${part('shell')}>
				<div ${part('card')}>
					<div ${part('row')}>
						<p ${part('text')}>We use cookies.</p>
					</div>
					<div ${part('head')}>
						<h2 ${part('title')}>Your privacy</h2>
						<p ${part('description')}>${DESCRIPTION}</p>
					</div>
					<div ${part('footer')}><button type="button">Accept</button></div>
				</div>
			</div>
		</div>`;
	return host;
};

const computed = function computed(
	probe: ClassicProbe,
	variables: Record<string, string> = {}
): string {
	const element = render(probe.surface, probe.closing === true);
	for (const [name, value] of Object.entries(variables)) {
		element.style.setProperty(name, value);
	}
	const part = element.querySelector(`[data-part="${probe.part}"]`);
	if (!part) {
		throw new Error(`No ${probe.part} part on ${probe.surface}`);
	}
	return getComputedStyle(part).getPropertyValue(probe.property);
};

/** A second value of the same kind, for the hook to set. */
const otherValue = (value: string): string =>
	value.includes('rgb(1, 2, 3)')
		? value.replace('rgb(1, 2, 3)', 'rgb(4, 5, 6)')
		: value.replace(/\d+/u, (digits) => String(Number(digits) + 7));

const deliver = async function deliver(
	delivery: Delivery,
	probe: ClassicProbe
): Promise<void> {
	styleElement.textContent = DELIVERIES[delivery];
	document.documentElement.classList.toggle('inth-dark', probe.dark === true);
	await (probe.phone ? page.viewport(400, 800) : page.viewport(1280, 800));
};

const label = (mapping: ClassicMapping, probe: ClassicProbe): string =>
	`${mapping.classic} → ${probe.surface} ${probe.part} ${probe.property}${probe.dark ? ' (dark)' : ''}${probe.phone ? ' (phone)' : ''}${probe.closing ? ' (closing)' : ''}`;

const probes = CLASSIC_VARIABLES.flatMap((mapping) =>
	mapping.probes.map((probe) => ({ mapping, probe }))
);

const cases = probes.flatMap(({ mapping, probe }) =>
	(['whole', 'sheets'] as const).map(
		(delivery) =>
			[
				`${label(mapping, probe)}, ${delivery}`,
				mapping,
				probe,
				delivery,
			] as const
	)
);

const hookCases = probes.flatMap(({ mapping, probe }) =>
	probe.hook
		? [[label(mapping, probe), mapping, probe, probe.hook] as const]
		: []
);

beforeAll(() => {
	document.head.append(styleElement);
});

afterEach(async () => {
	host?.remove();
	host = undefined;
	document.documentElement.classList.remove('inth-dark');
	await page.viewport(1280, 800);
});

describe('classic component variables', () => {
	test('every mapped variable has a case', () => {
		expect(
			CLASSIC_VARIABLES.filter((mapping) => mapping.probes.length === 0)
		).toEqual([]);
	});

	test.each(cases)('%s', async (_name, mapping, probe, delivery) => {
		await deliver(delivery, probe);
		const unset = computed(probe);

		// `initial` clears anything the part would inherit, so an unset
		// variable matches it only when no stylesheet declares a default.
		expect(unset).toBe(computed(probe, { [mapping.classic]: 'initial' }));
		expect(computed(probe, { [mapping.classic]: probe.value })).not.toBe(unset);
	});

	test.each(hookCases)('%s: %s wins', async (_name, mapping, probe, hook) => {
		await deliver('whole', probe);
		const classic = computed(probe, { [mapping.classic]: probe.value });
		const hookValue = otherValue(probe.value);
		const hookOnly = computed(probe, { [hook]: hookValue });

		expect(hookOnly).not.toBe(classic);
		expect(
			computed(probe, { [hook]: hookValue, [mapping.classic]: probe.value })
		).toBe(hookOnly);
	});
});
