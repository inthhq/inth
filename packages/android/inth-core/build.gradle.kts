plugins {
	`maven-publish`
	signing
	id("org.jetbrains.dokka")
	alias(libs.plugins.kotlin.jvm)
	alias(libs.plugins.kotlin.serialization)
}

// Pure JVM on purpose: nothing in this module may import android.*, so the whole
// consent engine is testable without an emulator.
kotlin {
	coreLibrariesVersion = "2.1.20"
	compilerOptions {
		apiVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_1)
		languageVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_1)
		// The transport door is internal API. This module and its tests own it.
		optIn.add("com.inth.core.InthInternalApi")
	}
	jvmToolchain(17)
}

dependencies {
	api(libs.kotlinx.serialization.json)

	testImplementation(libs.junit)
	testImplementation(libs.kotlin.test)
}

// The conformance suite prints the fixture files it opened, one per line, so a CI
// log names the fixtures that were checked instead of only a count. Failures print
// their diff, and a skipped fixture says which task owns the fix.
tasks.withType<Test>().configureEach {
	testLogging {
		events("failed", "skipped")
		exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
		showExceptions = true
		showStandardStreams = true
	}
}

// The benchmark lives in its own source set so it never ships in the library
// artifact and cannot be reached from a host app's classpath.
val benchSource = sourceSets.create("bench")

// The bench source set sees main's classes and its dependencies, so the
// benchmark drives exactly the code that ships.
configurations.named("benchImplementation") {
	extendsFrom(configurations.named("implementation").get())
}

dependencies {
	"benchImplementation"(sourceSets.main.get().output)
}

tasks.register<JavaExec>("bench") {
	group = "verification"
	description = "Measures hydrate, policy evaluation, snapshot(), and offline save."
	dependsOn("compileBenchKotlin")
	mainClass.set("com.inth.core.bench.Bench")
	classpath = benchSource.output + configurations.named("benchRuntimeClasspath").get()
	// One collector keeps the numbers comparable between runs.
	jvmArgs = listOf("-XX:+UseSerialGC")
}

java { withSourcesJar() }

apply(from = "../gradle/publishing.gradle")

// Existing bundle tooling reads this stable build path; Maven still uses versioned filenames.
tasks.named<Jar>("jar") { archiveFileName.set("inth-core.jar") }
