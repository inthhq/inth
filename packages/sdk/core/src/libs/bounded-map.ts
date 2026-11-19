/**
 * Map plumbing the in-process caches share: per-cache side tables and a
 * size cap that drops the oldest entry first.
 */

/**
 * The value `maps` holds for `owner`, created and stored on first use.
 *
 * @internal
 */
export const mapFor = function mapFor<Owner extends object, Value>(
	maps: WeakMap<Owner, Map<string, Value>>,
	owner: Owner
): Map<string, Value> {
	let map = maps.get(owner);
	if (!map) {
		map = new Map();
		maps.set(owner, map);
	}
	return map;
};

/**
 * Stores `value` as the newest entry under `key`, first dropping the oldest
 * entries so the map stays under `max`. Insertion order is age.
 *
 * @internal
 */
export const boundedSet = function boundedSet<Key, Value>(
	map: Map<Key, Value>,
	key: Key,
	value: Value,
	max: number
): void {
	map.delete(key);
	while (map.size >= max) {
		const oldest = map.keys().next();
		if (oldest.done) {
			break;
		}
		map.delete(oldest.value);
	}
	map.set(key, value);
};
