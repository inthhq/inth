// #region docs:android-quickstart title="ConsentApplication.kt"
// #region docs:android-install title="ConsentApplication.kt"
package com.inth.demo

import android.app.Application
import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.inth.android.InthAndroid
import com.inth.android.decisionFlow
import com.inth.consentui.InthConsent
import com.inth.consentui.ConsentPrompt
import com.inth.consentui.attachConsent
import com.inth.core.Inth
import com.inth.core.NativeConfig
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentDecision

fun installConsent(context: Context) {
    InthAndroid.install(context, NativeConfig(
        backendUrl = "https://your-project.inth.app",
        consentCategories = listOf(ConsentCategory.NECESSARY, ConsentCategory.MEASUREMENT, ConsentCategory.MARKETING),
    ))
}

fun measurementMayStart(): Boolean = Inth.isAllowed(ConsentCategory.MEASUREMENT)
// #endregion docs:android-install

class ConsentApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        installConsent(this)
        // Start optional SDKs only through a consent gate.
    }
}

class ConsentActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val core = checkNotNull(Inth.current) { "Install Inth in Application first" }
        setContent {
            MaterialTheme {
                // Recomposes when the decision changes, on the main thread.
                val measurement by core.decisionFlow(ConsentCategory.MEASUREMENT).collectAsState()
                Box(Modifier.fillMaxSize().safeDrawingPadding()) {
                    Column {
                        Text(if (measurement == ConsentDecision.GRANTED) "Measurement allowed" else "Measurement off")
                        Button(onClick = { ConsentPrompt.of(core).presentPreferences() }) {
                            Text("Privacy settings")
                        }
                    }
                    InthConsent(privacyPolicyUrl = "https://your-app.example/privacy")
                }
            }
        }
    }
}
// #endregion docs:android-quickstart

// #region docs:android-views title="SettingsActivity.kt"
class SettingsActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val privacySettings = android.widget.Button(this).apply { text = "Privacy settings" }
        setContentView(privacySettings)
        val consent = attachConsent("https://your-app.example/privacy")
        privacySettings.setOnClickListener { consent.presentPreferences() }
    }
}
// #endregion docs:android-views
