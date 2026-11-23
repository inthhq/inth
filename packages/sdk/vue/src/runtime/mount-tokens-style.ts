import type { ConsentConfig } from './config';
import { generateTokensCSS } from './theme-tokens.model';
import { TOKENS_STYLE_ID } from './tokens-style-id';

/**
 * How many installed plugins use each `<style>` element a plugin created.
 * Server-rendered elements are not tracked: the page owns them.
 */
const pluginStyleUsers = new Map<HTMLElement, number>();

/**
 * Put the token CSS in `document.head`, reusing an element with the same
 * id that the server rendered or another app's plugin added.
 *
 * @returns A function that releases this call's use of the element. The
 * element is removed once every plugin that added or reused it has
 * released it; a server-rendered element is never removed.
 * @internal
 */
export const mountTokensStyle = function mountTokensStyle(
	config: Pick<ConsentConfig, 'colorScheme' | 'theme' | 'tokens'> & {
		nonce?: string;
	}
): () => void {
	if (typeof document === 'undefined') {
		return () => undefined;
	}
	const existing = document.getElementById(TOKENS_STYLE_ID);
	const style = existing ?? document.createElement('style');
	style.id = TOKENS_STYLE_ID;
	if (config.nonce) {
		style.setAttribute('nonce', config.nonce);
	}
	style.textContent = generateTokensCSS(config.tokens, config);
	if (existing && !pluginStyleUsers.has(existing)) {
		return () => undefined;
	}
	if (!existing) {
		document.head.append(style);
	}
	pluginStyleUsers.set(style, (pluginStyleUsers.get(style) ?? 0) + 1);
	let released = false;
	return () => {
		if (released) {
			return;
		}
		released = true;
		const users = (pluginStyleUsers.get(style) ?? 1) - 1;
		if (users > 0) {
			pluginStyleUsers.set(style, users);
			return;
		}
		pluginStyleUsers.delete(style);
		style.remove();
	};
};
