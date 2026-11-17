package com.inth.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The storage layer's Android-free edge.
 *
 * Everything else in this module needs a device, so this covers the part where a
 * wrong answer is a silent data problem: a key that resolves to a path outside the
 * Inth directory, or to a file the SDK cannot read back.
 */
class StorePathsTest {
	@Test
	fun `the contract keys map to themselves`() {
		assertEquals("com.inth.snapshot", StorePaths.fileName("com.inth.snapshot"))
		assertEquals("com.inth.subject", StorePaths.fileName("com.inth.subject"))
		assertEquals("com.inth.pending", StorePaths.fileName("com.inth.pending"))
	}

	@Test
	fun `a key that could escape the directory is refused`() {
		assertNull(StorePaths.fileName("../evil"))
		assertNull(StorePaths.fileName("a/b"))
		assertNull(StorePaths.fileName("/absolute"))
		assertNull(StorePaths.fileName("com\\Inth"))
		assertNull(StorePaths.fileName(""))
		assertNull(StorePaths.fileName("   "))
		assertNull(StorePaths.fileName(".hidden"))
		assertNull(StorePaths.fileName("key with space"))
		assertNull(StorePaths.fileName("a".repeat(65)))
	}
}
