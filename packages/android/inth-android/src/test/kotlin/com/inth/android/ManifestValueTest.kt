package com.inth.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The manifest read, over the types the parser actually produces.
 *
 * The manifest merger decides whether an `android:value` arrives as a `Boolean`, a
 * `Long`, or a `String`, and the app does not: the Expo config plugin writes a bare
 * `true`, a bare-app manifest edited by hand often quotes one, and a staged-build
 * switch typed as `1` is a switch that was meant on. A reader pinned to one of those
 * types answers "not declared" to the others, and the flag it drops is the one that
 * forces GPC on for a review build, where the whole point is the signal being sent.
 *
 * This runs over the raw bundle values because a `Bundle` on the JVM is the stub
 * `android.jar`, which returns defaults for everything; the interpretation rule is the
 * part worth pinning, so it lives where a test can reach it.
 */
class ManifestValueTest {
	/** The rule this replaces: `bundle.getString(key)?.toBooleanStrictOrNull()`. */
	private val stringOnlyBoolean = { raw: Any? -> raw?.toString()?.toBooleanStrictOrNull() }

	@Test
	fun `a flag survives every type the parser can hand back`() {
		assertEquals(true, InthManifestValue.boolean(true))
		assertEquals(false, InthManifestValue.boolean(false))
		assertEquals(true, InthManifestValue.boolean("true"))
		assertEquals(true, InthManifestValue.boolean("TRUE"))
		assertEquals(true, InthManifestValue.boolean(" True "))
		assertEquals(false, InthManifestValue.boolean("false"))
		assertEquals(true, InthManifestValue.boolean(1L))
		assertEquals(false, InthManifestValue.boolean(0L))
		assertEquals(true, InthManifestValue.boolean(1))
		assertEquals(true, InthManifestValue.boolean("1"))
		assertEquals(false, InthManifestValue.boolean("0"))
	}

	@Test
	fun `the string-only read lost the spellings that reach a device`() {
		// Each of these is a real manifest, and each one silently did nothing before
		// the reader knew about more than one type.
		assertEquals(true, stringOnlyBoolean(true))
		assertNull(stringOnlyBoolean("TRUE"))
		assertNull(stringOnlyBoolean(" True "))
		assertNull(stringOnlyBoolean(1L))
		assertNull(stringOnlyBoolean(0L))
	}

	@Test
	fun `an absent or unreadable flag stays absent`() {
		// `false` would be an answer, and the core treats a missing GPC report as
		// "derive it" and a declared one as "this is the host's signal".
		assertNull(InthManifestValue.boolean(null))
		assertNull(InthManifestValue.boolean(""))
		assertNull(InthManifestValue.boolean("   "))
		assertNull(InthManifestValue.boolean("maybe"))
		assertNull(InthManifestValue.boolean("yes"))
	}

	@Test
	fun `text keeps its value and drops a blank`() {
		assertEquals("https://consent.example.com", InthManifestValue.string(" https://consent.example.com "))
		assertEquals("1234", InthManifestValue.string(1234L))
		assertEquals("true", InthManifestValue.string(true))
		assertNull(InthManifestValue.string(null))
		assertNull(InthManifestValue.string(""))
		assertNull(InthManifestValue.string("   "))
	}
}
