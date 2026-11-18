/**
 * The Expo in-code policy against the backend's `PolicyRule`.
 *
 * The plugin keeps its own copy of the type so a phone app never installs the
 * web kernel. Every rule it accepts must still be a rule `@c15t/backend` reads,
 * under the same names. `tsc -p tsconfig.type-tests.json` runs this file.
 */

import type { PolicyRule } from '@c15t/core';
import { expectTypeOf } from 'vitest';

import type { InthPolicyRule } from '../params';

type Mutable<Type> = {
	-readonly [Key in keyof Type]: Type[Key] extends readonly (infer Item)[]
		? Mutable<Item>[]
		: Type[Key] extends object | undefined
			? Mutable<Type[Key]>
			: Type[Key];
};

expectTypeOf<Mutable<InthPolicyRule>>().toExtend<PolicyRule>();
expectTypeOf<keyof InthPolicyRule>().toExtend<keyof PolicyRule>();
