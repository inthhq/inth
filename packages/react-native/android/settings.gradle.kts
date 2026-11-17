pluginManagement {
	plugins {
		// The bridge module applies com.android.library by id, without a version: a host app
		// already has AGP on its buildscript classpath and a version there would fight it.
		// This is the standalone build's pin, kept equal to the AGP React Native 0.87's own
		// Gradle plugin is built against, and to packages/android.
		id("com.android.library") version "9.2.1"
	}

	repositories {
		google {
			mavenContent {
				includeGroupAndSubgroups("androidx")
				includeGroupAndSubgroups("com.android")
				includeGroupAndSubgroups("com.google")
			}
		}
		mavenCentral()
		gradlePluginPortal()
	}
}

dependencyResolutionManagement {
	// Every coordinate resolves here; no per-module repository blocks.
	repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
	repositories {
		google()
		mavenCentral()
		providers.environmentVariable("C15T_MAVEN_URL").orNull?.let { repositoryUrl ->
			exclusiveContent {
				forRepository {
					maven {
						url = uri(repositoryUrl)
						if (repositoryUrl.startsWith("https://")) {
							credentials {
								username = providers.environmentVariable("C15T_MAVEN_USERNAME").orNull
								password = providers.environmentVariable("C15T_MAVEN_TOKEN").orNull
							}
						}
					}
				}
				filter { includeGroup("com.c15t") }
			}
		}
	}
}

rootProject.name = "c15t-react-native-android"

include(":c15t-react-native")

// The Codegen output belongs to the host app, not to this library. See
// c15t-spec/build.gradle.kts for why that is a compileOnly module.
include(":c15t-spec")
