/**
 * Turns an OpenAPI 3.1 document into Valibot schemas: one for each component
 * schema, and one for the query, path parameters, request body and success
 * response of each operation.
 *
 * A generated schema accepts exactly the JSON values the document's JSON
 * Schema accepts. Where Valibot checks something else, the output uses a
 * helper from the runtime module (`json-schema.ts` in the schema package):
 * an object is a plain object with only the keys a strict schema declares, a
 * record checks the keys `v.record` passes over, a string length counts code
 * points, and formats follow their RFCs. On a keyword, value or construct it
 * cannot convert exactly, the generator throws with the path in the
 * document, rather than produce a schema that checks less or more than the
 * document says.
 */

type JsonSchema = Readonly<Record<string, unknown>>;

interface Parameter {
	readonly $ref?: string;
	readonly name: string;
	readonly in: string;
	readonly required?: boolean;
	readonly description?: string;
	readonly schema?: JsonSchema;
}

interface MediaTypes {
	readonly $ref?: string;
	readonly content?: Readonly<Record<string, { readonly schema?: JsonSchema }>>;
}

interface Operation {
	readonly operationId?: string;
	readonly summary?: string;
	readonly parameters?: readonly Parameter[];
	readonly requestBody?: MediaTypes & { readonly required?: boolean };
	readonly responses?: Readonly<Record<string, MediaTypes>>;
}

export interface OpenApiDocument {
	readonly openapi: string;
	readonly paths?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
	readonly components?: {
		readonly schemas?: Readonly<Record<string, JsonSchema>>;
	};
}

export interface OpenApiToValibotOptions {
	/** Comment lines at the top of the file. */
	readonly header: string;
	/**
	 * Module of the openapi-typescript types for the same document. A
	 * component that refers to itself is typed with them, since TypeScript
	 * cannot infer the type of a recursive schema.
	 */
	readonly typesModule: string;
	/** Module of the helpers in `json-schema.ts`, as the output imports it. */
	readonly runtimeModule: string;
}

/** One property or parameter: its name, schema, and whether it is required. */
type Field = readonly [string, JsonSchema, boolean];

const METHODS = [
	'get',
	'put',
	'post',
	'delete',
	'options',
	'head',
	'patch',
	'trace',
] as const;

/** Keys a path item may hold besides its operations. */
const PATH_ITEM_KEYS = new Set(['parameters', 'summary', 'description']);

const COMPONENT_REF = '#/components/schemas/';

const SUCCESS_STATUS = /^2\d\d$/u;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

/** Every keyword the generator turns into Valibot. */
const KEYWORDS = new Set([
	'$ref',
	'additionalProperties',
	'allOf',
	'anyOf',
	'const',
	'default',
	'description',
	'enum',
	'examples',
	'exclusiveMaximum',
	'exclusiveMinimum',
	'format',
	'items',
	'maxItems',
	'maxLength',
	'maximum',
	'minItems',
	'minLength',
	'minimum',
	'oneOf',
	'pattern',
	'properties',
	'propertyNames',
	'required',
	'title',
	'type',
]);

/** Keywords that describe a value and check nothing. */
const ANNOTATIONS = new Set(['description', 'examples', 'title']);

const NUMBER_KEYWORDS = new Set([
	'exclusiveMaximum',
	'exclusiveMinimum',
	'maximum',
	'minimum',
]);

const OBJECT_KEYWORDS = new Set([
	'additionalProperties',
	'properties',
	'propertyNames',
	'required',
]);

/** The keywords each type may carry, beyond annotations. */
const TYPE_KEYWORDS: Readonly<Record<string, ReadonlySet<string>>> = {
	array: new Set(['items', 'maxItems', 'minItems']),
	boolean: new Set(),
	integer: NUMBER_KEYWORDS,
	null: new Set(),
	number: NUMBER_KEYWORDS,
	object: OBJECT_KEYWORDS,
	string: new Set(['format', 'maxLength', 'minLength', 'pattern']),
};

/** Each format, and the helper or Valibot action that checks it. */
const FORMATS: Readonly<
	Record<string, { readonly action: string; readonly helper?: string }>
> = {
	'date-time': {
		action: "v.check(isDateTime, 'Invalid date-time')",
		helper: 'isDateTime',
	},
	uri: { action: "v.check(isUri, 'Invalid URI')", helper: 'isUri' },
	uuid: { action: 'v.uuid()' },
};

/**
 * Property names `v.object` reads from the prototype when the input lacks
 * them, so a missing key looks present.
 */
const INHERITED_NAMES = new Set([
	...Object.getOwnPropertyNames(Object.prototype),
	'__proto__',
]);

/** The types a `default` may have: those whose value needs no other check. */
const DEFAULT_TYPES = new Set(['boolean', 'integer', 'number', 'string']);

/** Each numeric keyword that becomes one action, and the action. */
const NUMERIC_ACTIONS = [
	['minItems', 'v.minLength'],
	['maxItems', 'v.maxLength'],
	['minimum', 'v.minValue'],
	['exclusiveMinimum', 'v.gtValue'],
	['maximum', 'v.maxValue'],
	['exclusiveMaximum', 'v.ltValue'],
] as const;

/** Throws an error that names where in the document the problem is. */
const fail = (at: string, message: string): never => {
	throw new Error(`${at}: ${message}`);
};

const isSchema = (value: unknown): value is JsonSchema =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const literal = (value: unknown): string => JSON.stringify(value);

/** Line terminators a regular expression literal cannot hold as they are. */
const LINE_TERMINATORS: Readonly<Record<string, string>> = {
	'\n': String.raw`\n`,
	'\r': String.raw`\r`,
	'\u2028': String.raw`\u2028`,
	'\u2029': String.raw`\u2029`,
};

/**
 * A regular expression literal that matches what `pattern` matches. With the
 * `u` flag, as JSON Schema validators such as Ajv apply a pattern.
 */
const regexLiteral = function regexLiteral(pattern: string, at: string) {
	try {
		RegExp(pattern, 'u');
	} catch (error) {
		fail(at, `pattern does not compile: ${(error as Error).message}`);
	}
	let body = '';
	let escaped = false;
	for (const char of pattern) {
		const terminator = Object.hasOwn(LINE_TERMINATORS, char)
			? LINE_TERMINATORS[char]
			: undefined;
		if (terminator === undefined) {
			body += char === '/' && !escaped ? '\\/' : char;
		} else {
			body += escaped ? terminator.slice(1) : terminator;
		}
		escaped = !escaped && char === '\\';
	}
	return `/${body === '' ? '(?:)' : body}/u`;
};

/** `ConsentRecordRequest` → `consentRecordRequestSchema`. */
export const componentSchemaName = (name: string): string =>
	`${name.charAt(0).toLowerCase()}${name.slice(1)}Schema`;

/** `name`, once checked to be a JavaScript identifier. */
const identifier = (name: string, at: string): string =>
	IDENTIFIER.test(name) ? name : fail(at, `${name} is not a valid name`);

const componentName = (ref: string, at: string): string =>
	ref.startsWith(COMPONENT_REF)
		? ref.slice(COMPONENT_REF.length)
		: fail(at, `$ref ${ref} is not a component schema`);

/** Throws when `schema` holds a keyword besides the given ones. */
const assertOnly = function assertOnly(
	schema: JsonSchema,
	at: string,
	...keywords: string[]
): void {
	for (const key of Object.keys(schema)) {
		if (!keywords.includes(key) && !ANNOTATIONS.has(key)) {
			fail(at, `"${key}" beside "${keywords.join('" or "')}"`);
		}
	}
};

/** Whether `value` is an instance of the JSON Schema `type`. */
const matchesType = function matchesType(
	value: unknown,
	type: unknown
): boolean {
	switch (type) {
		case 'boolean':
			return typeof value === 'boolean';
		case 'integer':
			return Number.isInteger(value);
		case 'null':
			return value === null;
		case 'number':
			return typeof value === 'number';
		case 'string':
			return typeof value === 'string';
		default:
			return false;
	}
};

/** The schema's type, after checking every keyword it holds fits it. */
const typeOf = function typeOf(
	schema: JsonSchema,
	at: string
): string | undefined {
	const { type } = schema;
	if (type !== undefined && typeof type !== 'string') {
		fail(at, 'type is not a string');
	}
	if (type !== undefined && !Object.hasOwn(TYPE_KEYWORDS, type as string)) {
		fail(at, `unsupported type ${String(type)}`);
	}
	const allowed =
		type === undefined
			? new Set<string>()
			: (TYPE_KEYWORDS[type as string] as ReadonlySet<string>);
	for (const key of Object.keys(schema)) {
		if (key !== 'type' && !ANNOTATIONS.has(key) && !allowed.has(key)) {
			const where =
				type === undefined ? 'a schema without a type' : `type ${type}`;
			fail(at, `"${key}" on ${where}`);
		}
	}
	return type as string | undefined;
};

const schemaList = function schemaList(
	value: unknown,
	at: string
): JsonSchema[] {
	if (!Array.isArray(value) || !value.every(isSchema)) {
		return fail(at, 'expected a list of schemas');
	}
	if (value.length === 0) {
		return fail(at, 'an empty list of schemas');
	}
	return value;
};

/**
 * `const` or `enum`: the values, each a string, number or boolean, as
 * `v.literal` compares them with `===`. `null` makes the rest nullable.
 */
const enumeration = function enumeration(
	values: readonly unknown[],
	at: string
): string {
	if (values.length === 0) {
		return fail(at, 'empty enum');
	}
	for (const value of values) {
		if (value !== null && typeof value === 'object') {
			fail(at, `${literal(value)}: an object or array value`);
		}
	}
	const rest = values.filter((value) => value !== null);
	let base: string;
	if (rest.length === 0) {
		return 'v.null()';
	} else if (rest.length === 1) {
		base = `v.literal(${literal(rest[0])})`;
	} else if (rest.every((value) => typeof value === 'string')) {
		base = `v.picklist(${literal(rest)})`;
	} else {
		base = `v.union([${rest.map((value) => `v.literal(${literal(value)})`).join(', ')}])`;
	}
	return rest.length < values.length ? `v.nullable(${base})` : base;
};

/** The values a branch fixes `key` to, when it requires `key`. */
const fixedValues = function fixedValues(
	branch: JsonSchema,
	key: string
): readonly unknown[] | undefined {
	const required = branch.required as readonly string[] | undefined;
	const property = (
		branch.properties as Record<string, JsonSchema> | undefined
	)?.[key];
	if (!required?.includes(key) || property === undefined) {
		return undefined;
	}
	if ('const' in property) {
		return [property.const];
	}
	return Array.isArray(property.enum) ? property.enum : undefined;
};

/**
 * A key every branch requires and fixes to values of its own, when each
 * branch is a plain inline object. No value can match two such branches, so
 * `v.variant` on the key checks `oneOf` exactly, and reports a failure
 * against the branch the key picks.
 */
const discriminator = function discriminator(
	branches: readonly JsonSchema[]
): string | undefined {
	const plain = branches.every(
		(branch) =>
			branch.type === 'object' &&
			Object.keys(branch).every(
				(key) => key === 'type' || OBJECT_KEYWORDS.has(key)
			)
	);
	if (!plain || branches.length < 2) {
		return undefined;
	}
	const [first] = branches;
	const candidates = Object.keys(
		(first?.properties as object | undefined) ?? {}
	);
	return candidates.find((key) => {
		const seen = new Set<unknown>();
		return branches.every((branch) => {
			const values = fixedValues(branch, key);
			if (values === undefined || values.some((value) => seen.has(value))) {
				return false;
			}
			for (const value of values) {
				seen.add(value);
			}
			return true;
		});
	});
};

/** An object schema's properties, each with whether it is required. */
const objectFields = function objectFields(
	schema: JsonSchema,
	at: string
): Field[] {
	if ('properties' in schema && !isSchema(schema.properties)) {
		fail(at, 'properties is not an object');
	}
	const { required: requiredList = [] } = schema;
	if (
		!Array.isArray(requiredList) ||
		!requiredList.every((name) => typeof name === 'string')
	) {
		fail(at, 'required is not a list of names');
	}
	const properties = (schema.properties ?? {}) as Record<string, unknown>;
	const required = new Set(requiredList as string[]);
	for (const name of required) {
		if (!Object.hasOwn(properties, name)) {
			fail(at, `"${name}" is required but has no schema in properties`);
		}
	}
	return Object.entries(properties).map(([name, property]): Field =>
		isSchema(property)
			? [name, property, required.has(name)]
			: fail(`${at}.${name}`, 'not a schema')
	);
};

/**
 * Converts schemas, and remembers which components and helpers they use.
 * The methods recurse into each other, one per kind of schema.
 */
class Converter {
	/** Components referred to directly, which must be declared first. */
	readonly references = new Set<string>();

	readonly #components: Readonly<Record<string, JsonSchema>>;

	/** Components to refer to through `v.lazy`. */
	readonly #lazy: ReadonlySet<string>;

	/** Helpers the output needs, shared by every converter of one document. */
	readonly #helpers: Set<string>;

	/**
	 * @param lazy - Components to refer to through `v.lazy`: those that refer
	 * back to the one being converted.
	 */
	constructor(
		components: Readonly<Record<string, JsonSchema>>,
		helpers: Set<string>,
		lazy: ReadonlySet<string> = new Set()
	) {
		this.#components = components;
		this.#helpers = helpers;
		this.#lazy = lazy;
	}

	/**
	 * The Valibot expression for `schema`. A `bare` object is left without
	 * `jsonObject`, as a branch of a variant, which `jsonVariant` checks
	 * instead.
	 */
	schema(schema: JsonSchema, at: string, bare = false): string {
		for (const key of Object.keys(schema)) {
			if (!KEYWORDS.has(key)) {
				fail(at, `unsupported keyword "${key}"`);
			}
		}
		if (Array.isArray(schema.type)) {
			fail(at, 'a list of types; use anyOf with one type each');
		}
		if ('default' in schema) {
			fail(
				at,
				'"default" is only supported on an optional property or parameter'
			);
		}
		if (typeof schema.$ref === 'string') {
			return this.#reference(schema, schema.$ref, at);
		}
		return this.#withActions(this.#base(schema, at, bare), schema, at);
	}

	/** An object of named entries, such as an operation's query. */
	entries(fields: readonly Field[], at: string): string {
		for (const [name] of fields) {
			if (INHERITED_NAMES.has(name)) {
				fail(
					`${at}.${name}`,
					'a property named after an Object.prototype member, which v.object reads as present'
				);
			}
		}
		const body = fields.map(
			([name, schema, required]) =>
				`${literal(name)}: ${this.#entry(schema, required, `${at}.${name}`)}`
		);
		return `{${body.join(',\n')}}`;
	}

	/** Wraps an object schema so it refuses an array. */
	jsonObject(code: string): string {
		this.#helpers.add('jsonObject');
		return `/* @__PURE__ */ jsonObject(${code})`;
	}

	/** Whether no value of `schema` is `null`. */
	excludesNull(schema: JsonSchema, seen = new Set<string>()): boolean {
		if (typeof schema.$ref === 'string') {
			const name = schema.$ref.slice(COMPONENT_REF.length);
			const target = this.#component(name);
			if (target === undefined || seen.has(name)) {
				return false;
			}
			return this.excludesNull(target, new Set([...seen, name]));
		}
		if ('const' in schema) {
			return schema.const !== null;
		}
		if (Array.isArray(schema.enum)) {
			return !schema.enum.includes(null);
		}
		return typeof schema.type === 'string' && schema.type !== 'null';
	}

	/** Whether every value of `schema` is a string, as in a URL. */
	isString(schema: JsonSchema, seen = new Set<string>()): boolean {
		if (typeof schema.$ref === 'string') {
			const name = schema.$ref.slice(COMPONENT_REF.length);
			const target = this.#component(name);
			return (
				target !== undefined &&
				!seen.has(name) &&
				this.isString(target, new Set([...seen, name]))
			);
		}
		if ('const' in schema) {
			return typeof schema.const === 'string';
		}
		if (Array.isArray(schema.enum)) {
			return schema.enum.every((value) => typeof value === 'string');
		}
		return schema.type === 'string';
	}

	/** The component named `name`, if the document declares it. */
	#component(name: string): JsonSchema | undefined {
		return Object.hasOwn(this.#components, name)
			? this.#components[name]
			: undefined;
	}

	#reference(schema: JsonSchema, ref: string, at: string): string {
		if (Object.keys(schema).length > 1) {
			fail(at, '$ref with sibling keywords');
		}
		const name = componentName(ref, at);
		if (this.#component(name) === undefined) {
			fail(at, `$ref to missing ${name}`);
		}
		if (this.#lazy.has(name)) {
			return `v.lazy(() => ${componentSchemaName(name)})`;
		}
		this.references.add(name);
		return componentSchemaName(name);
	}

	/** An object entry: optional unless `required`, with its default. */
	#entry(schema: JsonSchema, required: boolean, at: string): string {
		if (!('default' in schema)) {
			const value = this.schema(schema, at);
			return required ? value : `v.optional(${value})`;
		}
		if (required) {
			fail(at, '"default" on a required property');
		}
		const { default: fallback, ...rest } = schema;
		const plain =
			DEFAULT_TYPES.has(rest.type as string) &&
			Object.keys(rest).every((key) => key === 'type' || ANNOTATIONS.has(key));
		if (!plain || !matchesType(fallback, rest.type)) {
			fail(
				at,
				'"default" beside anything but a boolean, number or string type, which v.optional would check the default against'
			);
		}
		return `v.optional(${this.schema(rest, at)}, ${literal(fallback)})`;
	}

	#base(schema: JsonSchema, at: string, bare: boolean): string {
		if ('const' in schema || Array.isArray(schema.enum)) {
			const keyword = 'const' in schema ? 'const' : 'enum';
			assertOnly(schema, at, keyword, 'type');
			const values =
				'const' in schema ? [schema.const] : (schema.enum as unknown[]);
			if (
				'type' in schema &&
				!values.every((value) => matchesType(value, schema.type))
			) {
				fail(
					at,
					`a ${keyword} value that is not of type ${String(schema.type)}`
				);
			}
			return enumeration(values, at);
		}
		if ('oneOf' in schema || 'anyOf' in schema) {
			assertOnly(schema, at, 'oneOf', 'anyOf');
			if ('oneOf' in schema && 'anyOf' in schema) {
				fail(at, 'both oneOf and anyOf');
			}
			return 'oneOf' in schema
				? this.#union(schema.oneOf, `${at}.oneOf`, true)
				: this.#union(schema.anyOf, `${at}.anyOf`, false);
		}
		if ('allOf' in schema) {
			fail(
				at,
				'allOf; v.intersect merges what each branch outputs, so it can refuse a value every branch accepts'
			);
		}
		return this.#typed(schema, at, bare);
	}

	#typed(schema: JsonSchema, at: string, bare: boolean): string {
		const type = typeOf(schema, at);
		switch (type) {
			case 'array': {
				if ('items' in schema && !isSchema(schema.items)) {
					fail(`${at}.items`, 'items that is not a schema');
				}
				const items = isSchema(schema.items)
					? this.schema(schema.items, `${at}[]`)
					: 'v.unknown()';
				return `v.array(${items})`;
			}
			case 'boolean':
				return 'v.boolean()';
			case 'integer':
				return 'v.number()';
			case 'number':
				return 'v.pipe(v.number(), v.finite())';
			case 'null':
				return 'v.null()';
			case 'object':
				return this.#object(schema, at, bare);
			case 'string':
				return 'v.string()';
			default:
				return 'v.unknown()';
		}
	}

	/**
	 * `oneOf` or `anyOf`. A `null` branch makes the rest nullable, and object
	 * branches that each fix one required key to their own values become a
	 * variant on that key. A `oneOf` needs exactly one branch to match, so it
	 * is refused unless its branches cannot overlap.
	 */
	#union(value: unknown, at: string, exactlyOne: boolean): string {
		const branches = schemaList(value, at);
		const isNull = (branch: JsonSchema) =>
			branch.type === 'null' && Object.keys(branch).length === 1;
		const rest = branches.filter((branch) => !isNull(branch));
		const nullable = rest.length < branches.length;
		if (exactlyOne && branches.length - rest.length > 1) {
			fail(at, 'a oneOf with two null branches, which both match null');
		}
		if (rest.length === 0) {
			fail(at, 'a union of null alone');
		}
		const key = discriminator(rest);
		if (exactlyOne && rest.length > 1 && key === undefined) {
			fail(
				at,
				'a oneOf whose branches no required key tells apart; a value could match more than one'
			);
		}
		if (
			exactlyOne &&
			nullable &&
			!rest.every((branch) => this.excludesNull(branch))
		) {
			fail(at, 'a oneOf whose null branch another branch may match too');
		}
		const rendered = rest.map((branch, index) =>
			this.schema(branch, `${at}[${index}]`, key !== undefined)
		);
		let union = `v.union([${rendered.join(', ')}])`;
		if (rendered.length === 1) {
			union = rendered[0] as string;
		} else if (key !== undefined) {
			this.#helpers.add('jsonVariant');
			union = `/* @__PURE__ */ jsonVariant(v.variant(${literal(key)}, [${rendered.join(', ')}]))`;
		}
		return nullable ? `v.nullable(${union})` : union;
	}

	#object(schema: JsonSchema, at: string, bare: boolean): string {
		const fields = objectFields(schema, at);
		const { additionalProperties: rest, propertyNames } = schema;
		if (rest !== undefined && typeof rest !== 'boolean' && !isSchema(rest)) {
			fail(at, 'additionalProperties is not a schema');
		}
		if (propertyNames !== undefined) {
			if (!isSchema(propertyNames)) {
				fail(`${at}.propertyNames`, 'propertyNames that is not a schema');
			}
			if (fields.length > 0 || !isSchema(rest)) {
				fail(
					at,
					'"propertyNames" is only supported on a record: additionalProperties and no properties'
				);
			}
		}
		if (isSchema(rest) && fields.length > 0) {
			fail(
				at,
				'properties beside an additionalProperties schema; v.objectWithRest skips some keys, and its type cannot hold both'
			);
		}
		if (isSchema(rest)) {
			const key = isSchema(propertyNames)
				? this.schema(propertyNames, `${at}.propertyNames`)
				: 'v.string()';
			if (key !== 'v.string()' && !this.isString(propertyNames as JsonSchema)) {
				fail(
					`${at}.propertyNames`,
					'propertyNames that is not a string schema'
				);
			}
			this.#helpers.add('jsonRecord');
			return `/* @__PURE__ */ jsonRecord(${key}, ${this.schema(rest, `${at}.*`)})`;
		}
		if (fields.length === 0 && rest !== false) {
			this.#helpers.add('jsonRecord');
			return '/* @__PURE__ */ jsonRecord(v.string(), v.unknown())';
		}
		let code: string;
		if (rest === false) {
			code = `v.strictObject(${this.entries(fields, at)})`;
		} else if (rest === true) {
			code = `v.looseObject(${this.entries(fields, at)})`;
		} else {
			code = `v.object(${this.entries(fields, at)})`;
		}
		return bare ? code : this.jsonObject(code);
	}

	/** `base` with the checks and annotations `schema` adds, as a pipe. */
	#withActions(base: string, schema: JsonSchema, at: string): string {
		const actions: string[] = [];
		const number = (keyword: string): number => {
			const value = schema[keyword];
			return typeof value === 'number'
				? value
				: fail(at, `"${keyword}" is not a number`);
		};
		if (schema.type === 'integer') {
			actions.push('v.integer()');
		}
		for (const keyword of ['format', 'pattern']) {
			if (keyword in schema && typeof schema[keyword] !== 'string') {
				fail(at, `"${keyword}" is not a string`);
			}
		}
		if (typeof schema.format === 'string') {
			const format =
				(Object.hasOwn(FORMATS, schema.format)
					? FORMATS[schema.format]
					: undefined) ?? fail(at, `unsupported format "${schema.format}"`);
			if (format.helper !== undefined) {
				this.#helpers.add(format.helper);
			}
			actions.push(format.action);
		}
		if (typeof schema.pattern === 'string') {
			actions.push(`v.regex(${regexLiteral(schema.pattern, at)})`);
		}
		for (const [keyword, comparison] of [
			['minLength', '>='],
			['maxLength', '<='],
		] as const) {
			if (keyword in schema) {
				const limit = number(keyword);
				this.#helpers.add('characters');
				actions.push(
					`v.check((value: string) => characters(value) ${comparison} ${limit}, ${literal(
						`Invalid length: Expected ${comparison}${limit} characters`
					)})`
				);
			}
		}
		for (const [keyword, action] of NUMERIC_ACTIONS) {
			if (keyword in schema) {
				actions.push(`${action}(${String(number(keyword))})`);
			}
		}
		if (typeof schema.title === 'string') {
			actions.push(`v.title(${literal(schema.title)})`);
		}
		if (typeof schema.description === 'string') {
			actions.push(`v.description(${literal(schema.description)})`);
		}
		if (Array.isArray(schema.examples)) {
			actions.push(`v.examples(${literal(schema.examples)})`);
		}
		return actions.length === 0
			? base
			: `v.pipe(${base}, ${actions.join(', ')})`;
	}
}

/** A JSDoc comment. */
const jsDoc = (text: string): string =>
	`/** ${text.replaceAll('*/', String.raw`*\/`)} */\n`;

interface Declaration {
	readonly code: string;
	readonly references: ReadonlySet<string>;
}

/**
 * For each component, the components that refer to it again: each one it
 * refers to and that reaches back to it. An empty set for a component outside
 * any cycle.
 */
const cyclesOf = function cyclesOf(
	references: ReadonlyMap<string, ReadonlySet<string>>
): Map<string, Set<string>> {
	const reachable = (from: string): Set<string> => {
		const seen = new Set<string>();
		const stack = [...(references.get(from) ?? [])];
		while (stack.length > 0) {
			const name = stack.pop() as string;
			if (!seen.has(name)) {
				seen.add(name);
				stack.push(...(references.get(name) ?? []));
			}
		}
		return seen;
	};
	const reach = new Map(
		[...references.keys()].map((name) => [name, reachable(name)])
	);
	return new Map(
		[...references].map(([name, targets]) => [
			name,
			new Set([...targets].filter((target) => reach.get(target)?.has(name))),
		])
	);
};

/** The component declarations, each after the components it refers to. */
const orderComponents = function orderComponents(
	declarations: ReadonlyMap<string, Declaration>
): Declaration[] {
	const ordered: Declaration[] = [];
	const done = new Set<string>();
	const visit = (name: string) => {
		if (done.has(name)) {
			return;
		}
		done.add(name);
		const declaration = declarations.get(name) as Declaration;
		for (const reference of declaration.references) {
			visit(reference);
		}
		ordered.push(declaration);
	};
	for (const name of declarations.keys()) {
		visit(name);
	}
	return ordered;
};

/** Hands out each exported name once. */
const nameRegistry = function nameRegistry() {
	const names = new Set<string>();
	return (name: string, at: string): string => {
		identifier(name, at);
		if (names.has(name)) {
			fail(at, `two schemas named ${name}`);
		}
		names.add(name);
		return name;
	};
};

type Claim = ReturnType<typeof nameRegistry>;

/**
 * One declaration per component. A component in a cycle refers to the rest
 * of it through `v.lazy`, which a later declaration may fill, and is typed
 * with the document's type, since TypeScript cannot infer it.
 */
const componentDeclarations = function componentDeclarations(
	components: Readonly<Record<string, JsonSchema>>,
	helpers: Set<string>,
	claim: Claim
): { readonly code: string[]; readonly typed: boolean } {
	const direct = new Map(
		Object.entries(components).map(([component, schema]) => {
			const converter = new Converter(components, new Set());
			converter.schema(schema, COMPONENT_REF + component);
			return [component, converter.references] as const;
		})
	);
	const cycles = cyclesOf(direct);
	const declarations = new Map<string, Declaration>();
	for (const [component, schema] of Object.entries(components)) {
		const lazy = cycles.get(component) ?? new Set<string>();
		const converter = new Converter(components, helpers, lazy);
		const at = COMPONENT_REF + component;
		const name = claim(componentSchemaName(component), at);
		const code = converter.schema(schema, at);
		const annotation =
			lazy.size === 0
				? ''
				: `: v.GenericSchema<components['schemas'][${literal(component)}]>`;
		const doc = jsDoc(`The \`${component}\` schema of the document.`);
		declarations.set(component, {
			code: `${doc}export const ${name}${annotation} = ${code};`,
			references: converter.references,
		});
	}
	return {
		code: orderComponents(declarations).map(({ code }) => code),
		typed: [...cycles.values()].some((lazy) => lazy.size > 0),
	};
};

const operationsOf = function* operationsOf(document: OpenApiDocument) {
	for (const [path, item] of Object.entries(document.paths ?? {})) {
		for (const key of Object.keys(item)) {
			if (
				!PATH_ITEM_KEYS.has(key) &&
				!(METHODS as readonly string[]).includes(key)
			) {
				fail(path, `unsupported path item key "${key}"`);
			}
		}
		const shared = (item.parameters ?? []) as readonly Parameter[];
		for (const method of METHODS) {
			const operation = item[method] as Operation | undefined;
			if (operation !== undefined) {
				yield { operation, route: `${method.toUpperCase()} ${path}`, shared };
			}
		}
	}
};

/** The schema of the one JSON media type `media` holds. */
const jsonSchemaOf = function jsonSchemaOf(
	media: MediaTypes,
	at: string
): JsonSchema | undefined {
	if (media.$ref !== undefined) {
		return fail(
			at,
			`$ref ${media.$ref}; only inline responses and bodies are supported`
		);
	}
	const content = media.content ?? {};
	const types = Object.keys(content);
	if (types.length === 0) {
		return undefined;
	}
	if (types.length > 1 || types[0] !== 'application/json') {
		fail(at, `unsupported media types ${types.join(', ')}`);
	}
	const schema = content['application/json']?.schema;
	return isSchema(schema)
		? schema
		: fail(at, 'application/json without a schema');
};

/** An operation's path and query parameters, by where they go. */
const parametersOf = function parametersOf(
	converter: Converter,
	route: string,
	parameters: readonly Parameter[]
): Record<'path' | 'query', Field[]> {
	const byKey = new Map<string, Parameter>();
	for (const parameter of parameters) {
		if (parameter.$ref !== undefined) {
			fail(
				route,
				`parameter $ref ${parameter.$ref}; only inline parameters are supported`
			);
		}
		byKey.set(`${parameter.in}:${parameter.name}`, parameter);
	}
	const grouped: Record<'path' | 'query', Field[]> = { path: [], query: [] };
	for (const parameter of byKey.values()) {
		const at = `${route} ${parameter.in} parameter ${parameter.name}`;
		if (parameter.in !== 'path' && parameter.in !== 'query') {
			return fail(at, `unsupported location "${parameter.in}"`);
		}
		const schema = isSchema(parameter.schema)
			? parameter.schema
			: fail(at, 'parameter without a schema');
		if (!converter.isString(schema)) {
			fail(
				at,
				'a parameter that is not a string, where a URL holds strings only'
			);
		}
		const described =
			parameter.description === undefined ||
			'description' in schema ||
			'$ref' in schema
				? schema
				: { ...schema, description: parameter.description };
		grouped[parameter.in].push([
			parameter.name,
			described,
			parameter.in === 'path' || parameter.required === true,
		]);
	}
	return grouped;
};

/** The JSON body of the operation's one success response, if it has one. */
const successOf = function successOf(
	route: string,
	operation: Operation
): readonly [string, JsonSchema] | undefined {
	const successes = Object.entries(operation.responses ?? {}).flatMap(
		([status, response]) => {
			if (!status.startsWith('2')) {
				return [];
			}
			if (!SUCCESS_STATUS.test(status)) {
				return fail(
					`${route} ${status}`,
					'unsupported status; name each 2xx status'
				);
			}
			const schema = jsonSchemaOf(response, `${route} ${status}`);
			return schema === undefined ? [] : [[status, schema] as const];
		}
	);
	if (successes.length > 1) {
		const statuses = successes.map(([status]) => status);
		fail(route, `JSON bodies for ${statuses.join(' and ')}`);
	}
	return successes[0];
};

/** The declarations of one operation's parts. */
const operationDeclarations = function operationDeclarations(
	components: Readonly<Record<string, JsonSchema>>,
	helpers: Set<string>,
	claim: Claim,
	{
		operation,
		route,
		shared,
	}: { operation: Operation; route: string; shared: readonly Parameter[] }
): string[] {
	const id = identifier(
		operation.operationId ?? fail(route, 'operation without operationId'),
		route
	);
	const converter = new Converter(components, helpers);
	const code: string[] = [];
	const emit = (suffix: string, doc: string, schema: string) => {
		const name = claim(`${id}${suffix}Schema`, route);
		code.push(`${jsDoc(doc)}export const ${name} = ${schema};`);
	};
	const parameters = parametersOf(converter, route, [
		...shared,
		...(operation.parameters ?? []),
	]);
	if (parameters.path.length > 0) {
		const entries = converter.entries(parameters.path, `${route} path`);
		emit(
			'Path',
			`Path parameters of \`${route}\`.`,
			converter.jsonObject(`v.object(${entries})`)
		);
	}
	if (parameters.query.length > 0) {
		const entries = converter.entries(parameters.query, `${route} query`);
		emit(
			'Query',
			`Query of \`${route}\`.`,
			converter.jsonObject(`v.object(${entries})`)
		);
	}
	if (operation.requestBody !== undefined) {
		const at = `${route} request body`;
		const schema = jsonSchemaOf(operation.requestBody, at);
		if (operation.requestBody.required !== true) {
			fail(at, 'an optional request body');
		}
		if (schema !== undefined) {
			emit('Body', `Body of \`${route}\`.`, converter.schema(schema, at));
		}
	}
	const success = successOf(route, operation);
	if (success !== undefined) {
		const [status, schema] = success;
		emit(
			'Response',
			`The ${status} body of \`${route}\`.`,
			converter.schema(schema, `${route} ${status}`)
		);
	}
	return code;
};

/**
 * Valibot source for `document`, unformatted. Error responses are left out:
 * only the 2xx JSON body of each operation becomes a schema.
 */
export const openApiToValibot = function openApiToValibot(
	document: OpenApiDocument,
	options: OpenApiToValibotOptions
): string {
	if (!document.openapi.startsWith('3.1.')) {
		fail(
			'openapi',
			`version ${document.openapi}; only 3.1 documents use JSON Schema keywords as written`
		);
	}
	const components = document.components?.schemas ?? {};
	const claim = nameRegistry();
	const helpers = new Set<string>();
	const declared = componentDeclarations(components, helpers, claim);
	const operations = [...operationsOf(document)].flatMap((operation) =>
		operationDeclarations(components, helpers, claim, operation)
	);
	const imports = ["import * as v from 'valibot';"];
	if (declared.typed) {
		imports.push(
			`import type { components } from ${literal(options.typesModule)};`
		);
	}
	if (helpers.size > 0) {
		imports.push(
			`import { ${[...helpers].toSorted().join(', ')} } from ${literal(options.runtimeModule)};`
		);
	}
	const parts = [...declared.code, ...operations];
	return `${options.header}\n${imports.join('\n\n')}\n\n${parts.join('\n\n')}\n`;
};
