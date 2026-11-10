// #region docs:android-quickstart title="ConsentApplication.kt"
// #region docs:android-install title="ConsentApplication.kt"
package com.c15t.demo

import android.app.Application
import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.c15t.android.C15tAndroid
import com.c15t.consentui.C15tConsent
import com.c15t.consentui.ConsentPresenter
import com.c15t.core.C15t
import com.c15t.core.NativeConfig
import com.c15t.core.model.ConsentCategory

fun installConsent(context: Context) {
    C15tAndroid.install(context, NativeConfig(
        backendUrl = "https://your-project.inth.app",
        consentCategories = listOf(ConsentCategory.NECESSARY, ConsentCategory.MEASUREMENT, ConsentCategory.MARKETING),
    ))
}

fun measurementMayStart(): Boolean = C15t.isAllowed(ConsentCategory.MEASUREMENT)
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
        val core = checkNotNull(C15t.current) { "Install c15t in Application first" }
        setContent {
            MaterialTheme {
                val presenter: ConsentPresenter = viewModel(
                    factory = object : ViewModelProvider.Factory {
                        override fun <T : ViewModel> create(modelClass: Class<T>): T {
                            @Suppress("UNCHECKED_CAST")
                            return ConsentPresenter(core) as T
                        }
                    }
                )
                Box(Modifier.fillMaxSize().safeDrawingPadding()) {
                    Button(onClick = presenter::presentPreferences) {
                        Text("Privacy settings")
                    }
                    C15tConsent(presenter, "https://your-app.example/privacy")
                }
            }
        }
    }
}
// #endregion docs:android-quickstart
