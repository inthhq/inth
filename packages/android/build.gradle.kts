plugins {
	alias(libs.plugins.android.application) apply false
	alias(libs.plugins.kotlin.compose) apply false
	id("org.jetbrains.dokka") version "2.1.0" apply false
	alias(libs.plugins.android.library) apply false
	alias(libs.plugins.kotlin.jvm) apply false
	alias(libs.plugins.kotlin.serialization) apply false
}

// The artifact version and default request/bridge metadata describe the same native SDK.
tasks.register("verifyNativeVersion") {
	val nativeVersion = providers.gradleProperty("inth.native.version").get()
	val protocolSource = file("inth-core/src/main/kotlin/com/inth/core/transport/InthProtocol.kt")
	inputs.property("nativeVersion", nativeVersion)
	inputs.file(protocolSource)
	doLast {
		val declared = Regex("DEFAULT_SDK_VERSION = \"([^\"]+)\"").find(protocolSource.readText())?.groupValues?.get(1)
		check(declared == nativeVersion) {
			"inth.native.version=$nativeVersion differs from request metadata $declared"
		}
	}
}

// Unit tests find the shared fixtures by walking up from the module, so Gradle cannot see
// them. Declared as inputs, a changed fixture reruns the tests instead of replaying a cached
// pass.
subprojects {
	tasks.withType<Test>().configureEach {
		inputs.dir(rootDir.resolve("../native-protocol"))
			.withPropertyName("nativeProtocolFixtures")
			.withPathSensitivity(PathSensitivity.RELATIVE)
		inputs.dir(rootDir.resolve("../../examples/native/consent-demo/fixtures"))
			.withPropertyName("consentDemoFixtures")
			.withPathSensitivity(PathSensitivity.RELATIVE)
	}
}
