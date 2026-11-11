/**
 * The public surface of the native `ConsentPrompt` coordinators.
 *
 * Every way an app can open the stock prompt must go through the coordinator,
 * which applies the host rules and the App Tracking Transparency order. A public
 * presenter would let `prompt.presenter.presentPrompt()` or
 * `prompt.presenter.autoPresent = true` skip both, so the presenter stays
 * internal and this pins the public members by name.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The text between a declaration's opening brace and its matching close. */
const body = function body(source: string, declaration: string): string {
	const start = source.indexOf(declaration);
	if (start === -1) {
		throw new Error(`missing ${declaration}`);
	}
	const open = source.indexOf('{', start);
	let depth = 0;
	for (let index = open; index < source.length; index += 1) {
		if (source[index] === '{') {
			depth += 1;
		} else if (source[index] === '}') {
			depth -= 1;
			if (depth === 0) {
				return source.slice(open + 1, index);
			}
		}
	}
	throw new Error(`unbalanced ${declaration}`);
};

/** Lines of `text` at brace depth zero, so nested bodies are skipped. */
const topLevelLines = function topLevelLines(text: string): string[] {
	const lines: string[] = [];
	let depth = 0;
	for (const line of text.split('\n')) {
		if (depth === 0) {
			lines.push(line.trim());
		}
		for (const character of line) {
			if (character === '{') {
				depth += 1;
			} else if (character === '}') {
				depth -= 1;
			}
		}
	}
	return lines;
};

const swiftName = (line: string): string =>
	line
		.replace(/^public\s+(?:private\(set\)\s+)?/u, '')
		.replace(/^(?:static\s+)?(?:func|var|let)\s+/u, '')
		.replace(/[\s:(=].*$/u, '')
		.trim();

describe('ConsentPrompt public surface', () => {
	test('Swift: only the coordinator opens the prompt', () => {
		const source = readFileSync(
			join(
				root,
				'native/core-swift/Sources/C15tConsentUI/consent-prompt.swift'
			),
			'utf8'
		);
		const members = topLevelLines(
			body(source, 'public final class ConsentPrompt')
		)
			.filter((line) => line.startsWith('public '))
			.map(swiftName)
			.toSorted();
		expect(members).toStrictEqual([
			'core',
			'current',
			'onFinished',
			'presentPreferences',
			'presentPrompt',
			'shared',
			'trackingRequest',
		]);
		// trackingRequest is readable, never settable from outside.
		expect(source).toMatch(/public private\(set\) var trackingRequest/u);
		expect(source).not.toMatch(/public\s+extension\s+ConsentPrompt\b/u);
	});

	test('Kotlin: only the coordinator opens the prompt', () => {
		const source = readFileSync(
			join(
				root,
				'native/core-android/c15t-consent-ui/src/main/kotlin/com/c15t/consentui/consent-prompt.kt'
			),
			'utf8'
		);
		const classBody = body(source, 'class ConsentPrompt private constructor');
		const declarations = /^(?:@\w+\s+)*(?:val|var|fun)\s+(?<name>\w+)/u;
		const publicNames = (lines: string[]): string[] =>
			lines
				.filter(
					(line) =>
						declarations.test(line) &&
						!/^(?:private|internal|protected)\b/u.test(line)
				)
				.map((line) => declarations.exec(line)?.groups?.name ?? '');
		const companion = body(classBody, 'companion object');
		// Kotlin members are public unless marked otherwise.
		const members = [
			'core',
			...publicNames(topLevelLines(classBody)),
			...publicNames(topLevelLines(companion)),
		].toSorted();
		expect(members).toStrictEqual([
			'core',
			'current',
			'of',
			'onFinished',
			'presentPreferences',
			'presentPrompt',
		]);
		expect(source).not.toMatch(/^fun\s+ConsentPrompt\.\w+/mu);
	});
});
