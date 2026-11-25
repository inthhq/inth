/**
 * A container's rules beat the surface's by specificity, never by source
 * order.
 *
 * The Card, Banner and Drawer classes sit next to the surface's on the same
 * elements. Where both set a property on the same part, the container's
 * value is the one meant to show. Source order cannot promise that: a Nuxt
 * server render inlines the surface's and the Card's sheets, then the
 * browser's chunk links both again, and the two links load one at a time.
 * Until the Card's link loads, the surface's linked copy comes after the
 * Card's inline one and takes over. With an equal selector the surface's
 * `.shell { width: 100% }` widened the server-rendered card for a frame,
 * and the Nuxt manifest SSR journey measured a layout shift of 0.05 to
 * 0.1 on about one load in fifty.
 *
 * So no container rule may set a property the surface sets on the same
 * part with a selector of the same weight, unless both set the same
 * value: a heavier selector wins in any order, a lighter one loses in any
 * order.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'postcss';
import type { Rule } from 'postcss';
import { describe, expect, test } from 'vite-plus/test';

const SOURCE_DIR = join(__dirname, '..', 'components');
const CONTAINERS = ['consent-card', 'consent-banner', 'consent-drawer'];

/**
 * A 0s or `none` animation moves nothing, and the surface's entrance and
 * exit pairs are settled by heavier selectors already (see its sheet).
 */
const EXEMPT_FAMILIES = new Set(['animation']);

type Specificity = [number, number, number];

/** An id, a class, or a type selector. */
const SIMPLE_WEIGHTS: Record<'' | '#' | '.', Specificity> = {
	'': [0, 0, 1],
	'#': [1, 0, 0],
	'.': [0, 1, 0],
};

interface Declaration {
	family: string;
	prop: string;
	selector: string;
	specificity: Specificity;
	subject: string;
	value: string;
}

/** The part of `text` inside the parentheses that open at `open`. */
const parenthesised = function parenthesised(
	text: string,
	open: number
): string {
	let depth = 0;
	for (let index = open; index < text.length; index += 1) {
		if (text[index] === '(') {
			depth += 1;
		} else if (text[index] === ')') {
			depth -= 1;
			if (depth === 0) {
				return text.slice(open + 1, index);
			}
		}
	}
	throw new Error(`Unbalanced parentheses in ${text}`);
};

/** `:global(x)` is CSS Modules' escape: the selector is `x`. */
const unwrapGlobal = function unwrapGlobal(selector: string): string {
	const at = selector.indexOf(':global(');
	if (at === -1) {
		return selector;
	}
	const inner = parenthesised(selector, at + ':global'.length);
	return unwrapGlobal(
		selector.slice(0, at) +
			inner +
			selector.slice(at + ':global('.length + inner.length + 1)
	);
};

const add = (a: Specificity, b: Specificity): Specificity => [
	a[0] + b[0],
	a[1] + b[1],
	a[2] + b[2],
];

/** Selectors Level 4 specificity, for the selectors these sheets use. */
const specificityOf = function specificityOf(selector: string): Specificity {
	let total: Specificity = [0, 0, 0];
	let index = 0;
	while (index < selector.length) {
		const rest = selector.slice(index);
		const pseudo = /^::?(?<name>[\w-]+)/u.exec(rest);
		if (rest.startsWith('::') && pseudo) {
			total = add(total, [0, 0, 1]);
			index += pseudo[0].length;
		} else if (pseudo) {
			const { name } = pseudo.groups as { name: string };
			index += pseudo[0].length;
			const argument =
				selector[index] === '(' ? parenthesised(selector, index) : undefined;
			if (argument !== undefined) {
				index += argument.length + 2;
			}
			if (name === 'where') {
				// Adds nothing.
			} else if (['is', 'not', 'has'].includes(name) && argument) {
				const [heaviest] = argument
					.split(',')
					.map(specificityOf)
					.toSorted((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
				total = add(total, heaviest ?? [0, 0, 0]);
			} else {
				total = add(total, [0, 1, 0]);
			}
		} else if (rest.startsWith('[')) {
			total = add(total, [0, 1, 0]);
			index += rest.indexOf(']') + 1;
		} else {
			const simple = /^(?<sigil>[.#]?)[\w-]+/u.exec(rest);
			if (simple) {
				const { sigil } = simple.groups as { sigil: '' | '#' | '.' };
				total = add(total, SIMPLE_WEIGHTS[sigil]);
				index += simple[0].length;
			} else {
				index += 1;
			}
		}
	}
	return total;
};

/** The compound a selector styles: its type, classes and pseudo-element. */
const subjectOf = function subjectOf(selector: string): string {
	let depth = 0;
	let start = 0;
	for (let index = 0; index < selector.length; index += 1) {
		const char = selector[index] as string;
		if (char === '(' || char === '[') {
			depth += 1;
		} else if (char === ')' || char === ']') {
			depth -= 1;
		} else if (depth === 0 && /[\s>+~]/u.test(char)) {
			start = index + 1;
		}
	}
	const compound = selector.slice(start).replaceAll(/\([^)]*\)/gu, '');
	const type = /^[a-z][\w-]*/u.exec(compound)?.[0] ?? '';
	const classes = (compound.match(/\.[\w-]+/gu) ?? []).toSorted();
	const element = /::[\w-]+/u.exec(compound)?.[0] ?? '';
	return type + classes.join('') + element;
};

/** Properties that set the same value through a shorthand share a family. */
const familyOf = function familyOf(prop: string): string {
	if (/^(?:inset|top|right|bottom|left)(?:-|$)/u.test(prop)) {
		return 'inset';
	}
	if (/^border(?:-[\w]+)*-radius$/u.test(prop)) {
		return 'border-radius';
	}
	const shorthand =
		/^(?<family>padding|margin|border|animation|transition|gap|background|font|overflow|text-decoration|outline)(?:-|$)/u.exec(
			prop
		);
	if (shorthand) {
		return (shorthand.groups as { family: string }).family;
	}
	if (/^(?:row-|column-)gap$/u.test(prop)) {
		return 'gap';
	}
	if (/^flex(?:-grow|-shrink|-basis)?$/u.test(prop)) {
		return 'flex';
	}
	return prop;
};

const declarationsOf = function declarationsOf(sheet: string): Declaration[] {
	const css = readFileSync(join(SOURCE_DIR, `${sheet}.module.css`), 'utf8');
	const declarations: Declaration[] = [];
	parse(css).walkRules((rule: Rule) => {
		if (
			rule.parent?.type === 'atrule' &&
			rule.parent.name.endsWith('keyframes')
		) {
			return;
		}
		for (const raw of rule.selectors) {
			const selector = unwrapGlobal(raw.trim());
			rule.each((node) => {
				if (node.type !== 'decl' || node.prop.startsWith('--')) {
					return;
				}
				declarations.push({
					family: familyOf(node.prop),
					prop: node.prop,
					selector,
					specificity: specificityOf(selector),
					subject: subjectOf(selector),
					value: node.value,
				});
			});
		}
	});
	return declarations;
};

describe('the container sheets against the surface sheet', () => {
	const surface = declarationsOf('consent-surface');

	test('the selector helpers weigh and name a selector as browsers do', () => {
		expect(specificityOf('.root .shell')).toEqual([0, 2, 0]);
		expect(specificityOf(".root[data-placement='card-end'] .shell")).toEqual([
			0, 3, 0,
		]);
		expect(specificityOf('.footer > :only-child')).toEqual([0, 2, 0]);
		expect(specificityOf('.footer a')).toEqual([0, 1, 1]);
		expect(specificityOf('.tag::before')).toEqual([0, 1, 1]);
		expect(specificityOf('.root:dir(rtl)')).toEqual([0, 2, 0]);
		expect(specificityOf('.button:not(.headless)')).toEqual([0, 2, 0]);
		expect(unwrapGlobal(':global(.dark) .root')).toBe('.dark .root');
		expect(subjectOf(".root[data-state='closed'] .shell")).toBe('.shell');
		expect(subjectOf('.tag::before')).toBe('.tag::before');
		expect(subjectOf('.description a')).toBe('a');
		expect(familyOf('padding-inline')).toBe(familyOf('padding'));
		expect(familyOf('inset-inline')).toBe(familyOf('bottom'));
	});

	test.each(CONTAINERS)(
		'%s never ties the surface on a property of the same part',
		(sheet) => {
			const ties = declarationsOf(sheet).flatMap((own) =>
				surface
					.filter(
						(shared) =>
							!EXEMPT_FAMILIES.has(own.family) &&
							shared.family === own.family &&
							shared.subject === own.subject &&
							shared.specificity.join(',') === own.specificity.join(',') &&
							shared.value !== own.value
					)
					.map(
						(shared) =>
							`${own.selector} { ${own.prop} } ties surface ${shared.selector} { ${shared.prop} }`
					)
			);
			expect([...new Set(ties)]).toEqual([]);
		}
	);
});
