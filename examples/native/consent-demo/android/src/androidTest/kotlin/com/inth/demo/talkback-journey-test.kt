package com.c15t.demo

import android.app.UiAutomation
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.Configurator
import androidx.test.uiautomator.UiDevice
import org.junit.Assert
import org.junit.Assume
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * One step of a live TalkBack journey: records the node that holds accessibility focus, with a
 * capture, under the name passed as `-e step NAME`. The journey itself is driven from the host
 * (`a11y/talkback-journey.sh` in the review evidence): TalkBack only sees touches that come through
 * the kernel input device, which the emulator console's `event send` provides, while `adb shell input`
 * and UiAutomation inject above the accessibility input filter and reach the app as plain taps.
 * Run with `am instrument --no-restart`, so the app keeps its state between steps, and the probe
 * connects with [UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES] so TalkBack keeps running
 * while it looks. Without `-e C15T_TALKBACK 1` the test skips.
 */
@RunWith(AndroidJUnit4::class)
class TalkBackJourneyTest {
    @Test fun recordFocus() {
        val arguments = InstrumentationRegistry.getArguments()
        Assume.assumeTrue("TalkBack is not on for this run", arguments.getString("C15T_TALKBACK") == "1")
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val flags = UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES
        Configurator.getInstance().uiAutomationFlags = flags
        val automation = instrumentation.getUiAutomation(flags)
        val device = UiDevice.getInstance(instrumentation)
        val context = instrumentation.targetContext
        val manager = context.getSystemService(android.view.accessibility.AccessibilityManager::class.java)
        Assert.assertTrue("TalkBack is not running", manager.getEnabledAccessibilityServiceList(android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_SPOKEN).any { it.id.contains("talkback") })
        val step = arguments.getString("step") ?: "step"
        SystemClock.sleep(300)
        val node = automation.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
        val line = if (node == null) "(no accessibility focus)" else {
            val b = android.graphics.Rect(); node.getBoundsInScreen(b)
            "${node.className?.toString()?.substringAfterLast('.')} id=${node.viewIdResourceName ?: ""} text=${node.text ?: ""} desc=${node.contentDescription ?: ""} state=${node.stateDescription ?: ""} checked=${node.isChecked} clickable=${node.isClickable} bounds=$b"
        }
        val evidence = File(context.getExternalFilesDir(null), "prototype-evidence").apply { mkdirs() }
        File(evidence, "talkback-focus.log").appendText("$step: $line\n")
        Assert.assertTrue(device.takeScreenshot(File(evidence, "$step.png")))
        if (arguments.getString("activate") == "1") {
            Assert.assertNotNull("nothing to activate", node)
            Assert.assertTrue("click refused on $line", node!!.performAction(AccessibilityNodeInfo.ACTION_CLICK))
        }
    }
}
