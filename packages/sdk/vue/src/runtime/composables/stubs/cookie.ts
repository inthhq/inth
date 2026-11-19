import { customRef } from 'vue';
import type { Ref } from 'vue';

const getDefined = <Value>(
	value: Value,
	message = 'Expected value to be defined'
): NonNullable<Value> => {
	if (value === null || value === undefined) {
		throw new Error(message);
	}
	return value;
};

export interface UseCookieOptions<T> {
	default?: () => T;
}

const decode = function decode<T>(value: string): T {
	try {
		return JSON.parse(value) as T;
	} catch {
		return value as T;
	}
};
const encode = function encode<T>(value: T): string {
	try {
		return JSON.stringify(value);
	} catch {
		return value as string;
	}
};
export const useCookie = function useCookie<T extends object | string | null>(
	name: string,
	options: UseCookieOptions<T> = {}
): Ref<T> {
	const defaultValue = options.default?.() ?? (null as T);
	return customRef((track, trigger) => ({
		get() {
			track();

			if (typeof document === 'undefined') {
				console.warn([
					'[inth] For SSR support, please use Nuxt or make an issue',
				]);
				return defaultValue;
			}

			const match = document.cookie.match(
				new RegExp(`(?:^|; )${name}=([^;]*)`, 'u')
			);
			return match
				? decode(decodeURIComponent(getDefined(match[1])))
				: defaultValue;
		},
		set(newValue) {
			if (typeof document !== 'undefined') {
				if (newValue) {
					const maxAge = 60 * 60 * 24 * 365;
					document.cookie = `${name}=${encodeURIComponent(encode(newValue))}; path=/; max-age=${maxAge}`;
				} else {
					document.cookie = `${name}=; max-age=0; path=/`;
				}
			}

			trigger();
		},
	}));
};
