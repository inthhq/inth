pluginManagement {
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
	// Every coordinate resolves from a repository declaration here; no
	// per-module repository blocks.
	repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
	repositories {
		google()
		mavenCentral()
	}
}

rootProject.name = "inth-native-core-android"

include(":inth-core")
include(":inth-android")

include(":inth-consent-ui")
include(":consent-demo")
project(":consent-demo").projectDir = file("../../examples/native/consent-demo/android")
