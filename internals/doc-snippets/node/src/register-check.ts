import { Inth } from '@inth/node';

const inth = new Inth();

// Checks the augmentation above: an undeclared type no longer compiles
// @ts-expect-error -- `dpa` is not one of the declared document types
await inth.documents.current({ type: 'dpa' });
