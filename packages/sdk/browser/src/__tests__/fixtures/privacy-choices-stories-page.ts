/**
 * Renders one Privacy Choices story, named by `?story=`, or a list of
 * links to every story. Served at `/__inth-test__/privacy-choices` by the
 * browser suite's dev server (`vitest.config.ts`).
 */
import {
	mountPrivacyChoicesStory,
	PRIVACY_CHOICES_STORIES,
} from './privacy-choices-stories';

const name = new URLSearchParams(location.search).get('story');
if (name) {
	void mountPrivacyChoicesStory(name);
} else {
	const list = document.createElement('ul');
	for (const [story, { group }] of Object.entries(PRIVACY_CHOICES_STORIES)) {
		const item = document.createElement('li');
		const link = document.createElement('a');
		link.href = `?story=${story}`;
		link.textContent = `Privacy Choices/${group}/${story}`;
		item.append(link);
		list.append(item);
	}
	document.body.append(list);
}
