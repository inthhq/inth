package com.c15t.bare

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  private fun fixtureControl(): org.json.JSONObject {
    val result = java.util.concurrent.FutureTask {
      val connection = java.net.URL("http://localhost:3000/e2e/control").openConnection() as java.net.HttpURLConnection
      try {
        connection.connectTimeout = 2000; connection.readTimeout = 2000
        org.json.JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
      } finally { connection.disconnect() }
    }
    Thread(result, "c15t-fixture-control").start()
    return result.get(5, java.util.concurrent.TimeUnit.SECONDS)
  }

  override fun onCreate() {
    super.onCreate()
    val metadata = packageManager.getApplicationInfo(packageName, android.content.pm.PackageManager.GET_META_DATA).metaData
    if (metadata?.getBoolean("com.c15t.APP_E2E", false) == true) {
      val control = fixtureControl()
      val clock = java.util.concurrent.atomic.AtomicLong(control.optLong("now", System.currentTimeMillis()))
      val declared = control.optJSONArray("categories")?.let { values ->
        (0 until values.length()).map { name -> com.c15t.core.model.ConsentCategory.entries.first { it.wireName == values.getString(name) } }
      } ?: com.c15t.core.model.ConsentCategory.entries.toList()
      com.c15t.android.C15tAndroid.install(this, com.c15t.core.NativeConfig(
        backendUrl = "http://localhost:3000/api/self-host",
        bundledPolicy = assets.open("c15t-policy.json").bufferedReader().use { it.readText() },
        consentCategories = declared,
        iab = com.c15t.core.iab.IabConfiguration(cmpId = 53, cmpVersion = 7, publisherCountryCode = "GB")
      ), clock = com.c15t.core.spi.Clock { if (control.has("now")) clock.get() else System.currentTimeMillis() })
      java.util.Timer("c15t-fixture-observer", true).scheduleAtFixedRate(object : java.util.TimerTask() {
        override fun run() {
          try {
            val latest = fixtureControl()
            if (latest.has("now")) clock.set(latest.getLong("now"))
            val snapshot = com.c15t.core.C15t.snapshot()
            val gates = org.json.JSONObject()
            listOf(com.c15t.core.model.ConsentCategory.FUNCTIONALITY, com.c15t.core.model.ConsentCategory.EXPERIENCE, com.c15t.core.model.ConsentCategory.MEASUREMENT, com.c15t.core.model.ConsentCategory.MARKETING).forEach {
              gates.put(it.wireName, com.c15t.core.C15t.isAllowed(it))
            }
            val body = org.json.JSONObject().put("source", "native-core").put("gates", gates)
              .put("activityGeneration", MainActivity.fixtureGeneration).put("process", android.os.Process.myPid()).put("clock", clock.get()).put("control", latest)
              .put("snapshot", org.json.JSONObject(com.c15t.reactnative.C15tPayload.snapshot(snapshot)))
              .put("iabConsent", com.c15t.core.C15t.current?.iabConsent?.let {
                org.json.JSONObject(com.c15t.core.store.C15tJson.storage.encodeToString(com.c15t.core.iab.IabCommittedConsent.serializer(), it))
              } ?: org.json.JSONObject.NULL)
            val connection = java.net.URL("http://localhost:3000/e2e/native").openConnection() as java.net.HttpURLConnection
            try {
              connection.connectTimeout = 2000; connection.readTimeout = 2000
              connection.requestMethod = "POST"; connection.doOutput = true
              connection.outputStream.use { it.write(body.toString().toByteArray()) }
              connection.inputStream.close()
            } finally { connection.disconnect() }
          } catch (_: Exception) { /* Backend may stop before the fixture process. */ }
        }
      }, 0, 500)
    }
    loadReactNative(this)
  }
}
