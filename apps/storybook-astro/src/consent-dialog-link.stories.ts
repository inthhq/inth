import { linkOpensDialog } from '@inth/conformance/play/consent-dialog-link';
import type { Meta, StoryObj } from '@storybook/html-vite';

import { renderAstroStory } from './render-astro-story';

const meta = {
	parameters: {
		layout: 'centered',
	},
	title: 'COMPONENTS - ASTRO/Core/Consent Dialog Link',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * `<ConsentDialogLink>` with `<ConsentDialog />`. React's `Default` story
 * renders its link as a styled button (`noStyle={false}`); Astro's link has
 * no styled mode and leaves the look to the site, so this story does not
 * take the name the other frameworks pair on. It still runs the shared
 * play: the link is reachable by keyboard and opens the dialog.
 */
export const Unstyled: Story = {
	play: linkOpensDialog,
	render: () => renderAstroStory('consent-dialog-link--default'),
};
