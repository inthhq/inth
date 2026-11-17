package com.inth.android

import android.content.SharedPreferences
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PreferencesDurabilityTest {
	@Test
	fun `durable writes use disk acknowledgement and restore a failed memory update`() {
		val memory = mutableMapOf<String, String?>()
		val disk = mutableMapOf<String, String?>()
		var fail = false
		val preferences =
			Proxy.newProxyInstance(
				SharedPreferences::class.java.classLoader,
				arrayOf(SharedPreferences::class.java),
			) { _, method, arguments ->
				when (method.name) {
					"getString" -> memory[arguments[0]] ?: arguments[1]
					"edit" -> {
						val pending = mutableMapOf<String, String?>()
						lateinit var editor: SharedPreferences.Editor
						editor =
							Proxy.newProxyInstance(
								SharedPreferences.Editor::class.java.classLoader,
								arrayOf(SharedPreferences.Editor::class.java),
							) { _, edit, values ->
								when (edit.name) {
									"putString" -> {
										pending[values[0] as String] = values[1] as String?
										editor
									}
									"remove" -> {
										pending[values[0] as String] = null
										editor
									}
									"commit" -> {
										memory.putAll(pending)
										if (!fail) disk.putAll(pending)
										!fail
									}
									else -> error("Unexpected editor operation ${edit.name}")
								}
							} as SharedPreferences.Editor
						editor
					}
					else -> error("Unexpected preference operation ${method.name}")
				}
			} as SharedPreferences
		val store = PreferencesStore(preferences)
		assertTrue(store.writeDurably("snapshot", "before"))
		assertEquals("before", disk["snapshot"])
		fail = true
		assertFalse(store.writeDurably("snapshot", "after"))
		assertEquals("before", disk["snapshot"])
		assertEquals("before", store.read("snapshot"))
	}
}
