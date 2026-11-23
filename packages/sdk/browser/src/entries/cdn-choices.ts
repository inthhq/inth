/**
 * `dist/inth.choices.js`: the Privacy Choices design (the prompt in each
 * presentation, the in-place options, the "Your Privacy Choices" dialog and
 * the opt-in confirmation it hosts). The engine (`inth.hosted.js`) fetches
 * it the first time the design applies, after publishing the functions
 * that keep per-kernel state for it to call. See
 * `../ui/privacy-choices-file.ts`.
 */

import * as optInConfirmation from '../ui/opt-in-confirmation';
import type { ChoicesFile } from '../ui/privacy-choices-file';
import { CHOICES_KEY } from '../ui/privacy-choices-file';
import * as bar from '../ui/privacy-choices/bar';
import * as card from '../ui/privacy-choices/card';
import * as dialog from '../ui/privacy-choices/dialog';
import * as drawer from '../ui/privacy-choices/drawer';
import * as panel from '../ui/privacy-choices/panel';
import { version } from '../version';

const file: ChoicesFile = {
	bar,
	card,
	dialog,
	drawer,
	optInConfirmation,
	panel,
	version,
};
(window as unknown as Record<string, ChoicesFile>)[CHOICES_KEY] = file;
