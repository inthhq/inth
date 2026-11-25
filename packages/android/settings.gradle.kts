pluginManagement {
	repositories {
		google {
			mavenContent {
				includeGroupAndSubgroups("androidx")
				includeGroupAndSubgroups("com.android")
				includeGroupAndSubgroups("com.google")
			}
		}
		maven("https://maven-central.storage-download.googleapis.com/maven2/") {
			name = "MavenCentralGoogleMirror"
			mavenContent { releasesOnly() }
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
		// Maven Central answers GitHub runners with 429 under load; Google's
		// mirror serves the same releases, and Gradle falls through to Central
		// only for an artifact the mirror lacks.
		maven("https://maven-central.storage-download.googleapis.com/maven2/") {
			name = "MavenCentralGoogleMirror"
			mavenContent { releasesOnly() }
		}
		mavenCentral()
	}
}

rootProject.name = "inth-native-core-android"

include(":inth-core")
include(":inth-android")

include(":inth-consent-ui")
include(":consent-demo")
project(":consent-demo").projectDir = file("../../examples/native/consent-demo/android")
