import { expectTypeOf } from 'vite-plus/test';

import type { InthProviderProps } from '../root';
import type { ConsentState } from '../server';

// An awaited root loader hands over the state; a streamed one hands over the
// pending server function call.
expectTypeOf<ConsentState>().toExtend<InthProviderProps['state']>();
expectTypeOf<Promise<ConsentState>>().toExtend<InthProviderProps['state']>();
