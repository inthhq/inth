package com.c15t.bare

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  companion object {
    @Volatile var fixtureGeneration: Int = 0
      private set
  }
  private fun appE2e(): Boolean = packageManager.getApplicationInfo(packageName, android.content.pm.PackageManager.GET_META_DATA).metaData?.getBoolean("com.c15t.APP_E2E", false) == true

  override fun onCreate(savedInstanceState: android.os.Bundle?) {
    super.onCreate(savedInstanceState)
    if (appE2e()) fixtureGeneration++
  }

  override fun onNewIntent(intent: android.content.Intent) {
    if (appE2e() && intent.getBooleanExtra("c15t.fixture.recreate", false)) {
      recreate()
      return
    }
    super.onNewIntent(intent)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "C15tBare"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
