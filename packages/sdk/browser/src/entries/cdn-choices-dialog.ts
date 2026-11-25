/**
 * `dist/inth.choices-dialog.js`: the "Your Privacy Choices" dialog and the
 * opt-in confirmation it hosts. Not an entry of its own: a chunk of
 * `inth.choices.js`, which loads it on demand (`./cdn-choices.ts`) and
 * whose runtime it runs on, so it carries only what the banner does not
 * use. See `../ui/load-choices-file.ts`.
 */

import * as dialog from '../ui/dialog/dialog';
import type { DialogFile } from '../ui/load-choices-file';
import * as optInConfirmation from '../ui/opt-in-confirmation';

export const file: DialogFile = { dialog, optInConfirmation };
