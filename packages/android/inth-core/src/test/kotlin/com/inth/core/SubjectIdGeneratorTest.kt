package com.inth.core

import com.inth.core.spi.Clock
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long

/**
 * The subject id generator and the stored-id rule, checked against
 * `packages/native-protocol/subject-id/uuidv7.json`, which the Swift core reads too.
 */
class SubjectIdGeneratorTest {
	private val fixture = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
		.map { File(it, "packages/native-protocol/subject-id/uuidv7.json") }
		.first { it.exists() }
		.let { Json.parseToJsonElement(it.readText()).jsonObject }

	@Test
	fun `the shared vectors mint byte for byte`() {
		val vectors = fixture.getValue("vectors").jsonArray
		assertTrue(vectors.isNotEmpty())
		for (element in vectors) {
			val vector = element.jsonObject
			val clock = vector.getValue("clock").jsonPrimitive.long
			val random = vector.getValue("randomHex").jsonPrimitive.content
			val generator = SubjectIdGenerator(clock = Clock { clock }, entropy = entropyFor(random))
			assertEquals(vector.getValue("id").jsonPrimitive.content, generator.generate(), "$random at $clock")
		}
		println("SubjectIdGeneratorTest: ${vectors.size} uuidv7 vectors")
	}

	@Test
	fun `the shared read cases decide which stored ids are adopted`() {
		val cases = fixture.getValue("read").jsonArray
		for (element in cases) {
			val case = element.jsonObject
			val id = case.getValue("id").jsonPrimitive.content
			when (val kind = case.getValue("kind").jsonPrimitive.content) {
				"uuidv7" -> {
					assertTrue(SubjectIdGenerator.isUuidV7(id), "$id is a UUIDv7")
					assertTrue(SubjectIdGenerator.isValid(id), "$id is adopted")
				}
				"c15t" -> {
					assertTrue(SubjectIdGenerator.isC15tId(id), "$id is a c15t id")
					assertTrue(SubjectIdGenerator.isValid(id), "$id is adopted")
				}
				"unusable" -> assertTrue(!SubjectIdGenerator.isValid(id), "$id must not be adopted")
				else -> error("unknown read kind $kind")
			}
		}
		println("SubjectIdGeneratorTest: ${cases.size} read cases")
	}

	@Test
	fun `every minted id is a UUIDv7 and a thousand are distinct`() {
		val ids = List(1_000) { SubjectIdGenerator.generate() }
		for (id in ids) assertTrue(SubjectIdGenerator.isUuidV7(id), "$id is not a lowercase UUIDv7")
		assertEquals(1_000, ids.distinct().size, "a repeated id is two installs, one subject")
	}

	@Test
	fun `each id draws its own ten random bytes`() {
		val requested = mutableListOf<Int>()
		val generator = SubjectIdGenerator(
			clock = Clock { 1_770_000_000_000L },
			entropy = SubjectEntropy { count -> requested += count; ByteArray(count) },
		)
		repeat(3) { generator.generate() }
		assertEquals(listOf(10, 10, 10), requested)
	}

	@Test
	fun `an entropy source with the wrong byte count is refused`() {
		val generator = SubjectIdGenerator(
			clock = Clock { 1_770_000_000_000L },
			entropy = SubjectEntropy { count -> ByteArray(count - 1) },
		)
		assertFailsWith<IllegalArgumentException> { generator.generate() }
	}
}

/** The vector's random bytes as an entropy source. */
private fun entropyFor(hex: String): SubjectEntropy = SubjectEntropy { count ->
	val bytes = ByteArray(hex.length / 2) { index -> hex.substring(index * 2, index * 2 + 2).toInt(16).toByte() }
	require(bytes.size == count) { "vector carries ${bytes.size} random bytes, needs $count" }
	bytes
}
