plugins { alias(libs.plugins.android.application); alias(libs.plugins.kotlin.compose) }
android {
    namespace = "com.c15t.prototype"
    compileSdk = 36
    defaultConfig { applicationId = "com.c15t.prototype.consent"; versionCode = 1; versionName = "1.0"; minSdk = 24; targetSdk = 36; testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner" }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
    buildFeatures { compose = true; buildConfig = true }
    sourceSets["main"].assets.srcDir("../fixtures")
}
dependencies {
    implementation(project(":c15t-consent-ui")); implementation(project(":c15t-android"))
    implementation(platform("androidx.compose:compose-bom:2025.08.00"))
    implementation("androidx.compose.material3:material3"); implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    testImplementation(libs.junit)
    androidTestImplementation(platform("androidx.compose:compose-bom:2025.08.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    androidTestImplementation(libs.androidx.test.runner); androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
    // Real vendor SDKs for the consent journeys in RealVendorSdkTest. Debug only,
    // so release builds of the demo carry none of them; src/release has a stub.
    // Never add these to c15t-core, c15t-android or c15t-consent-ui.
    debugImplementation("com.posthog:posthog-android:3.75.0")
    debugImplementation("com.mixpanel.android:mixpanel-android:8.12.0")
    debugImplementation("io.sentry:sentry-android:8.62.0")
    debugImplementation("com.google.firebase:firebase-analytics:23.2.0")
}
