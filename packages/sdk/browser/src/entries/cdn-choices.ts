/**
 * `dist/inth.choices.js`: the consent UI (the prompt in each container,
 * the in-place options, the "Your Privacy Choices" dialog and the opt-in
 * confirmation it hosts). The engine (`inth.hosted.js`) fetches it the
 * first time the page needs one of them, after publishing the functions
 * that keep per-kernel state for it to call. See `../ui/choices-file.ts`.
 */

import type { ChoicesFile } from '../ui/choices-file';
import { CHOICES_KEY } from '../ui/choices-file';
import * as dialog from '../ui/dialog/dialog';
import * as optInConfirmation from '../ui/opt-in-confirmation';
import * as card from '../ui/prompt/card';
import * as drawer from '../ui/prompt/drawer';
import * as panel from '../ui/prompt/panel';
import * as banner from '../ui/prompt/strip';
import { version } from '../version';

const file: ChoicesFile = {
	banner,
	card,
	dialog,
	drawer,
	optInConfirmation,
	panel,
	version,
};
(window as unknown as Record<string, ChoicesFile>)[CHOICES_KEY] = file;
