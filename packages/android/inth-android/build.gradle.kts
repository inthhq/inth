plugins {
	`maven-publish`
	signing
	id("org.jetbrains.dokka")
	// AGP 9 compiles Kotlin itself, so there is no separate Kotlin Android plugin to
	// apply here; adding it collides with the `kotlin` extension AGP registers.
	alias(libs.plugins.android.library)
}

android {
	namespace = "com.inth.android"
	compileSdk = libs.versions.compileSdk.get().toInt()

	defaultConfig {
		minSdk = libs.versions.minSdk.get().toInt()
		consumerProguardFiles("consumer-rules.pro")
		// Instrumented tests for the parts of this module that only exist on a device:
		// AndroidKeyStore, the merged manifest read behind `configFrom`, the
		// androidx.startup Initializer, and the lifecycle ports. Nothing in CI boots an
		// emulator, so `:inth-android:connectedDebugAndroidTest` is a local gate; see
		// README.md.
		testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
	}

	publishing {
		singleVariant("release") { withSourcesJar() }
	}

	buildTypes {
		release {
			isMinifyEnabled = false
		}
	}

	compileOptions {
		sourceCompatibility = JavaVersion.VERSION_17
		targetCompatibility = JavaVersion.VERSION_17
	}

	kotlin {
		coreLibrariesVersion = "2.1.20"
		compilerOptions {
			apiVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_1)
			languageVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_1)
			jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
			// Inth's own modules and tests use the internal transport door.
			optIn.add("com.inth.core.InthInternalApi")
		}
	}

	buildFeatures {
		buildConfig = false
	}

	lint {
		warningsAsErrors = true

		// Every coordinate in gradle/libs.versions.toml is pinned on purpose, so the
		// "a newer version exists" nag is noise here, not a finding.
		disable += setOf(
			"GradleDependency",
			"AndroidGradlePluginVersion",
		)
	}

	testOptions {
		unitTests {
			// The unit tests here cover the module's Android-free helpers only;
			// the consent logic itself is tested in :inth-core on a plain JVM.
			isReturnDefaultValues = true
		}
	}
}

dependencies {
	api(project(":inth-core"))
	// StateFlow and suspend functions are part of this module's public API. The
	// coroutines runtime already reaches every host through androidx.lifecycle, so
	// declaring it costs no new dependency; it pins the version this code is built on.
	api(libs.kotlinx.coroutines.core)

	implementation(libs.androidx.startup)
	implementation(libs.androidx.lifecycle.process)
	implementation(libs.androidx.webkit)
	compileOnly(libs.androidx.annotation)

	// JUnit directly: AGP's built-in Kotlin does not register a test framework, so
	// the plain kotlin-test artifact would carry the assertions but not @Test.
	testImplementation(libs.junit)
	testImplementation(libs.kotlinx.coroutines.test)

	// The runner is what `testInstrumentationRunner` names, `core` supplies the
	// application context, and the ext bridge gives `@RunWith(AndroidJUnit4::class)`,
	// which is what makes a JUnit4 test run on the device at all.
	androidTestImplementation(libs.androidx.test.runner)
	androidTestImplementation(libs.androidx.test.core)
	androidTestImplementation(libs.androidx.test.junit)
	androidTestImplementation(libs.junit)
}

apply(from = "../gradle/publishing.gradle")

// Dokka 2.1 does not discover AGP 9's built-in Kotlin source set automatically.
dokka {
	dokkaSourceSets.register("main") {
		sourceRoots.from(file("src/main/kotlin"))
		classpath.from(configurations.named("releaseCompileClasspath"))
	}
}
