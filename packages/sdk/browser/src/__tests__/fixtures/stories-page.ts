/**
 * Renders one consent story, named by `?story=`, or a list of
 * links to every story. Served at `/__inth-test__/stories` by the
 * browser suite's dev server (`vitest.config.ts`).
 */
import { mountStory, CONSENT_STORIES } from './stories';

const name = new URLSearchParams(location.search).get('story');
if (name) {
	void mountStory(name);
} else {
	const list = document.createElement('ul');
	for (const [story, { group }] of Object.entries(CONSENT_STORIES)) {
		const item = document.createElement('li');
		const link = document.createElement('a');
		link.href = `?story=${story}`;
		link.textContent = `${group}/${story}`;
		item.append(link);
		list.append(item);
	}
	document.body.append(list);
}
