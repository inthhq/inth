import type { AndroidConfig } from 'expo/config-plugins';

import { C15tPluginError } from './errors';
import type { C15tAndroidMavenRepository } from './maven';

/** A `build.gradle` as the mod hands it over. */
export type GradleFile = AndroidConfig.Paths.GradleProjectFile;

const MAVEN_BLOCK =
	/\n?\/\/ @generated begin c15t-maven\n[\s\S]*?\/\/ @generated end c15t-maven\n?/gu;

const groovyString = (value: string): string =>
	`'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

/**
 * Configure an explicit, exclusive binary repository.
 *
 * SDK levels are checked, not raised, by `android-sdk-floor.ts`.
 *
 * @param gradleFile - The root `build.gradle` the mod was given.
 * @param repository - Validated build-only repository, or null to remove its managed block.
 * @returns The file to write back.
 */
export const applyProjectBuildGradle = function applyProjectBuildGradle(
	gradleFile: GradleFile,
	repository: C15tAndroidMavenRepository | null = null
): GradleFile {
	const contents = gradleFile.contents.replaceAll(MAVEN_BLOCK, '');
	if (repository === null) {
		return { ...gradleFile, contents };
	}
	if (gradleFile.language !== 'groovy') {
		throw new C15tPluginError(
			'androidMavenRepository requires the Expo Groovy root build.gradle template. Configure exclusiveContent in settings.gradle.kts for a Kotlin DSL host.'
		);
	}
	const { credentials } = repository;
	const authentication =
		credentials === undefined
			? ''
			: `
          credentials {
            username = System.getenv(${groovyString(credentials.usernameEnvironmentVariable)})
            password = System.getenv(${groovyString(credentials.passwordEnvironmentVariable)})
            if (!username || !password) {
              throw new GradleException('c15t Maven credentials are missing. Set the configured environment variables in the build environment.')
            }
          }`;
	return {
		...gradleFile,
		contents: `${contents.trimEnd()}
// @generated begin c15t-maven
allprojects {
  repositories {
    exclusiveContent {
      forRepository {
        maven {
          url = uri(${groovyString(repository.url)})${authentication}
        }
      }
      filter { includeGroup('com.c15t') }
    }
  }
}
// @generated end c15t-maven
`,
	};
};
