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

private object SnapshotLog {
  const val TAG = "CMP_BENCH"
  private const val MAX_PAYLOAD_BYTES = 4068
  private const val MAX_PARTS = 1000

  private fun record(body: String, pid: Int, sequence: Int, part: Int, parts: Int): String =
    JSONObject().put("event", "SNAPSHOT").put("pid", pid).put("sequence", sequence).put("part", part).put("parts", parts).put("body", body).toString()

  private fun entryBytes(record: String): Int {
    // Log.i uses JNI modified UTF-8. Include priority, tag NUL and message NUL.
    var bytes = 1 + TAG.length + 1 + 1
    for (unit in record) bytes += when (unit.code) {
      0 -> 2
      in 1..0x7f -> 1
      in 0x80..0x7ff -> 2
      else -> 3
    }
    return bytes
  }

  fun records(payload: String, pid: Int, sequence: Int): List<String> {
    val chunks = mutableListOf<String>()
    var start = 0
    while (start < payload.length) {
      var lower = start + 1
      var upper = start + minOf(payload.length - start, MAX_PAYLOAD_BYTES)
      var end = start
      while (lower <= upper) {
        val middle = lower + (upper - lower) / 2
        val boundary = if (middle < payload.length && Character.isHighSurrogate(payload[middle - 1]) && Character.isLowSurrogate(payload[middle])) middle - 1 else middle
        // Reserve the widest possible indices before the final part count is known.
        if (entryBytes(record(payload.substring(start, boundary), pid, sequence, Int.MAX_VALUE, Int.MAX_VALUE)) <= MAX_PAYLOAD_BYTES) {
          end = maxOf(end, boundary)
          lower = middle + 1
        } else {
          upper = middle - 1
        }
      }
      check(end > start) { "Snapshot character exceeds log entry limit" }
      check(chunks.size < MAX_PARTS) { "Snapshot exceeds parser part limit" }
      chunks.add(payload.substring(start, end))
      start = end
    }
    return chunks.mapIndexed { index, chunk -> record(chunk, pid, sequence, index, chunks.size) }
  }
}

object BenchmarkClock {
  var startNanos: Long = 0
  var resumeNanos: Long = 0
  fun resume() {
    resumeNanos = SystemClock.elapsedRealtimeNanos()
    Log.i("CMP_BENCH", JSONObject().put("event", "ACTIVITY_RESUME").put("pid", Process.myPid()).put("nanos", resumeNanos.toString()).toString())
  }
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
  fun warmLayout(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val decor = context.currentActivity?.window?.decorView
      if (decor == null || !decor.isAttachedToWindow) { promise.reject("NO_DECOR", "Activity has no attached decor"); return@runOnUiThread }
      val start = BenchmarkClock.resumeNanos
      var drawn = false
      val listener = object : ViewTreeObserver.OnDrawListener {
        override fun onDraw() {
          if (drawn) return
          drawn = true
          val end = SystemClock.elapsedRealtimeNanos()
          Log.i("CMP_BENCH", JSONObject().put("event", "WARM_DRAW").put("pid", Process.myPid()).put("startNanos", start.toString()).put("nanos", end.toString()).put("elapsedNanos", (end-start).toString()).toString())
          decor.post { if(decor.viewTreeObserver.isAlive) decor.viewTreeObserver.removeOnDrawListener(this); promise.resolve(end.toString()) }
        }
      }
      decor.viewTreeObserver.addOnDrawListener(listener)
      decor.postInvalidateOnAnimation()
    }
  }

  @ReactMethod
  fun actionStart(event: String, promise: Promise) {
    val now=SystemClock.elapsedRealtimeNanos()
    Log.i("CMP_BENCH", JSONObject().put("event", event).put("pid", Process.myPid()).put("nanos", now.toString()).toString())
    promise.resolve(now.toString())
  }

  @ReactMethod
  fun readDefaultPreference(key: String, promise: Promise) {
    val prefs = context.getSharedPreferences(context.packageName + "_preferences", android.content.Context.MODE_PRIVATE)
    promise.resolve(prefs.getString(key, null))
  }

  @ReactMethod
  fun snapshot(payload: String) {
    sequence += 1
    SnapshotLog.records(payload, Process.myPid(), sequence).forEach { Log.i(SnapshotLog.TAG, it) }
  }
}

class BenchmarkPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(BenchmarkModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
