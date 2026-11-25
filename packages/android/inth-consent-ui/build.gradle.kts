plugins {
    `maven-publish`
    signing
    id("org.jetbrains.dokka")
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.compose)
}
android {
    namespace = "com.inth.consentui"
    compileSdk = 36
    defaultConfig { minSdk = 24 }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
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
    buildFeatures { compose = true }
    publishing { singleVariant("release") { withSourcesJar() } }
    testOptions.unitTests.isReturnDefaultValues = true
    testOptions.unitTests.isIncludeAndroidResources = true
}
dependencies {
    api(project(":inth-core"))
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.16")
    testImplementation(libs.androidx.test.core)
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    implementation(platform("androidx.compose:compose-bom:2025.08.00"))
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}

apply(from = "../gradle/publishing.gradle")

dokka {
    dokkaSourceSets.register("main") {
        sourceRoots.from(file("src/main/kotlin"))
        classpath.from(configurations.named("releaseCompileClasspath"))
    }
}

// Robolectric 4.16's own downloader has no retry, so its android-all jars come
// through Gradle instead and the tests run offline against this directory. List
// one jar per SDK level the tests' @Config names (34 and 35); CI caches the
// directory keyed on this file.
val robolectricAndroidAll = listOf(
    "14-robolectric-10818077-i7",
    "15-robolectric-13954326-i7",
)
// One configuration per jar: in a shared one, Gradle keeps only the newest version.
val robolectricRuntime = robolectricAndroidAll.map { version ->
    configurations.create("robolectricAndroidAll$version".filter { it.isLetterOrDigit() }) {
        isTransitive = false
        dependencies.add(project.dependencies.create("org.robolectric:android-all-instrumented:$version"))
    }
}
val robolectricRuntimeDir = layout.buildDirectory.dir("robolectric-runtime")
val fetchRobolectricRuntime by tasks.registering(Sync::class) {
    val jars = robolectricAndroidAll.map { "android-all-instrumented-$it.jar" }
    val dir = robolectricRuntimeDir.get().asFile
    from(robolectricRuntime)
    into(dir)
    // A directory restored from CI's cache already holds every jar; skip before
    // Gradle resolves (and downloads) them again.
    onlyIf { jars.any { !dir.resolve(it).isFile } }
}

tasks.withType<Test>().configureEach {
    dependsOn(fetchRobolectricRuntime)
    systemProperty("robolectric.offline", "true")
    systemProperty("robolectric.dependency.dir", robolectricRuntimeDir.get().asFile.absolutePath)
}
