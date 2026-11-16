import fs from 'node:fs/promises';
import path from 'node:path';

/** A native platform a project directory builds for. */
export type NativePlatform = 'ios' | 'android';

/** A React Native app: Expo, or bare React Native with its own native projects. */
export interface ReactNativeProject {
	readonly kind: 'expo' | 'react-native';
	readonly root: string;
	/** Whether `tsconfig.json` exists, which picks `.tsx` over `.jsx`. */
	readonly typescript: boolean;
	/** Whether `@c15t/react-native` is already a dependency. */
	readonly installed: boolean;
	/** Whether `@c15t/cli` is a dependency, which `bundleManifest` needs at prebuild. */
	readonly cliInstalled: boolean;
}

/** A Swift or Kotlin app with no `package.json`. */
export interface NativeProject {
	readonly kind: 'native';
	readonly root: string;
	readonly platforms: readonly NativePlatform[];
}

/** A mobile project the setup command handles instead of the web setup. */
export type MobileProject = ReactNativeProject | NativeProject;

const IOS_MARKERS = [/\.xcodeproj$/u, /\.xcworkspace$/u, /^Package\.swift$/u];
/** Markers that name a whole project, not one module inside it. */
const PROJECT_MARKERS = [...IOS_MARKERS, /^settings\.gradle(?:\.kts)?$/u];
const ANDROID_MARKERS = [
	/^settings\.gradle(?:\.kts)?$/u,
	/^build\.gradle(?:\.kts)?$/u,
	/^gradlew$/u,
];

const readPackageJson = async (
	dir: string
): Promise<Record<string, unknown> | null> => {
	try {
		return JSON.parse(
			await fs.readFile(path.join(dir, 'package.json'), 'utf8')
		) as Record<string, unknown>;
	} catch {
		return null;
	}
};

const exists = async (file: string): Promise<boolean> => {
	try {
		await fs.access(file);
		return true;
	} catch {
		return false;
	}
};

/**
 * The native platforms a directory without `package.json` builds for.
 *
 * Only the directory's own entries count: an Xcode project, workspace or
 * `Package.swift` means iOS, a Gradle build means Android. A directory with a
 * `package.json` returns none, so a web or React Native project never reads as
 * a native one.
 *
 * @param dir - The directory `c15t` runs in.
 * @returns The detected platforms, empty when the directory is not native.
 */
export const detectNativePlatforms = async (
	dir: string
): Promise<NativePlatform[]> => {
	if (await exists(path.join(dir, 'package.json'))) {
		return [];
	}
	let entries: string[];
	try {
		entries = await fs.readdir(dir);
	} catch {
		return [];
	}
	const platforms: NativePlatform[] = [];
	if (
		entries.some((entry) => IOS_MARKERS.some((marker) => marker.test(entry)))
	) {
		platforms.push('ios');
	}
	if (
		entries.some((entry) =>
			ANDROID_MARKERS.some((marker) => marker.test(entry))
		)
	) {
		platforms.push('android');
	}
	return platforms;
};

/**
 * The nearest Swift or Gradle project at or above `dir`, or `null`.
 *
 * The walk stops at the first `package.json`, because a JavaScript project there
 * owns the directory. An Xcode project, a workspace, `Package.swift` or a Gradle
 * settings file names a project, so the nearest one wins. A module's own
 * `build.gradle` is only used when no settings file is found above it, so
 * `app/src/main` resolves to the Gradle project, not to `app/`.
 *
 * @param dir - The directory `c15t` runs in.
 * @param maxDepth - How many levels to climb.
 * @returns The native project root, or `null` when there is none.
 */
export const findNativeRoot = async (
	dir: string,
	maxDepth = 10
): Promise<string | null> => {
	let module: string | null = null;
	let current = path.resolve(dir);
	for (let depth = 0; depth <= maxDepth; depth += 1) {
		// oxlint-disable-next-line no-await-in-loop -- Nearest directory first.
		if (await exists(path.join(current, 'package.json'))) {
			return null;
		}
		let entries: string[] = [];
		try {
			// oxlint-disable-next-line no-await-in-loop -- Nearest directory first.
			entries = await fs.readdir(current);
		} catch {
			entries = [];
		}
		if (
			entries.some((entry) =>
				PROJECT_MARKERS.some((marker) => marker.test(entry))
			)
		) {
			return current;
		}
		if (
			module === null &&
			entries.some((entry) =>
				ANDROID_MARKERS.some((marker) => marker.test(entry))
			)
		) {
			module = current;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}
	return module;
};

/**
 * Detect an Expo, bare React Native, Swift or Android project.
 *
 * Web projects return `null`, so the web setup runs exactly as before. A
 * `package.json` that depends on `expo` is Expo; one that depends on
 * `react-native` without `expo` is bare React Native.
 *
 * @param dir - The project directory.
 * @returns The project, or `null` when it is not a mobile project.
 */
export const detectMobileProject = async (
	dir: string
): Promise<MobileProject | null> => {
	const packageJson = await readPackageJson(dir);
	if (packageJson === null) {
		const platforms = await detectNativePlatforms(dir);
		return platforms.length > 0
			? { kind: 'native', platforms, root: dir }
			: null;
	}
	const deps = {
		...(packageJson.dependencies as Record<string, unknown> | undefined),
		...(packageJson.devDependencies as Record<string, unknown> | undefined),
	};
	let kind: ReactNativeProject['kind'] | null = null;
	if ('expo' in deps) {
		kind = 'expo';
	} else if ('react-native' in deps) {
		kind = 'react-native';
	}
	if (kind === null) {
		return null;
	}
	return {
		cliInstalled: '@c15t/cli' in deps,
		installed: '@c15t/react-native' in deps,
		kind,
		root: dir,
		typescript: await exists(path.join(dir, 'tsconfig.json')),
	};
};
