package com.c15t.expodev

import android.os.Process
import android.os.SystemClock
import android.util.Log
import android.view.ViewTreeObserver
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject

object BenchmarkClock {
  var startNanos: Long = 0
  fun start() {
    startNanos = SystemClock.elapsedRealtimeNanos()
    Log.i("CMP_BENCH", JSONObject().put("event", "ATTACH_BASE_CONTEXT").put("pid", Process.myPid()).put("nanos", startNanos.toString()).toString())
  }
}

class BenchmarkModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var armed = false
  private var marked = false
  private var sequence = 0
  override fun getName() = "CmpBenchmark"

  @ReactMethod
  fun readyLayout(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      if (armed) { promise.reject("DUPLICATE_READY", "Ready was already armed"); return@runOnUiThread }
      val decor = context.currentActivity?.window?.decorView
      if (decor == null || !decor.isAttachedToWindow) { promise.reject("NO_DECOR", "Activity has no attached decor"); return@runOnUiThread }
      armed = true
      Log.i("CMP_BENCH", JSONObject().put("event", "READY_LAYOUT").put("pid", Process.myPid()).put("nanos", SystemClock.elapsedRealtimeNanos().toString()).toString())
      val listener = object : ViewTreeObserver.OnDrawListener {
        override fun onDraw() {
          if (marked) return
          marked = true
          val end = SystemClock.elapsedRealtimeNanos()
          Log.i("CMP_BENCH", JSONObject().put("event", "READY_DRAW").put("pid", Process.myPid()).put("startNanos", BenchmarkClock.startNanos.toString()).put("nanos", end.toString()).put("elapsedNanos", (end - BenchmarkClock.startNanos).toString()).toString())
          decor.post {
            if (decor.viewTreeObserver.isAlive) decor.viewTreeObserver.removeOnDrawListener(this)
            promise.resolve(end.toString())
          }
        }
      }
      decor.viewTreeObserver.addOnDrawListener(listener)
      decor.postInvalidateOnAnimation()
    }
  }

  @ReactMethod
  fun snapshot(payload: String) {
    sequence += 1
    val chunks = payload.chunked(2400)
    chunks.forEachIndexed { index, chunk ->
      Log.i("CMP_BENCH", JSONObject().put("event", "SNAPSHOT").put("pid", Process.myPid()).put("sequence", sequence).put("part", index).put("parts", chunks.size).put("body", chunk).toString())
    }
  }
}

class BenchmarkPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(BenchmarkModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
