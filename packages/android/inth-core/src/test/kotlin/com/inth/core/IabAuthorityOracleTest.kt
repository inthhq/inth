package com.inth.core

import com.inth.core.iab.*
import com.inth.core.tc.*
import java.io.File
import kotlin.test.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

class IabAuthorityOracleTest {
	@Serializable data class Restriction(val purposeId: Int, val type: Int, val vendorIds: List<Int>)
	@Serializable data class Case(val id: String, val tcString: String, val gvl: GlobalVendorList? = null,
		val restrictions: List<Restriction> = emptyList(), val createdDaysAgo: Long? = null,
		val purposeConsents: List<Int> = emptyList(), val purposeLegitimateInterests: List<Int> = emptyList(),
		val vendorConsents: List<Int> = emptyList(), val vendorLegitimateInterests: List<Int> = emptyList())
	@Serializable data class Oracle(val gvl: GlobalVendorList, val now: Long, val cases: List<Case>)
	// TCF-CHECK: T6
	// TCF-CHECK: T8
	// TCF-CHECK: T10
	// TCF-CHECK: T11
	// TCF-CHECK: T13
	@Test fun `actual native bytes match the independent reference on every vector`() {
		val file = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "packages/native-protocol/iab/authority-oracle.json") }.first { it.exists() }
		val oracle = Json { ignoreUnknownKeys = true }.decodeFromString<Oracle>(file.readText())
		for (row in oracle.cases) {
			val gvl = row.gvl ?: oracle.gvl
			val config = IabConfiguration(53, 7, "GB", numCustomPurposes = 0,
				publisherRestrictions = row.restrictions.map { IabPublisherRestriction(it.purposeId, it.type, it.vendorIds) })
			val choices = IabChoices(purposeConsents = row.purposeConsents, purposeLegitimateInterests = row.purposeLegitimateInterests,
				vendorConsents = row.vendorConsents, vendorLegitimateInterests = row.vendorLegitimateInterests)
			val previous = row.createdDaysAgo?.let { IabAuthority.build(config, IabChoices(), gvl, "sub_x", null, "f", oracle.now - it * 86_400_000, null) }
			val built = IabAuthority.build(config, choices, gvl, "sub_x", null, "f", oracle.now, previous)
			assertEquals(row.tcString, built.tcString, row.id)
			// A decision first saved days earlier still writes Created == LastUpdated.
			val core = TcStringDecoder.decode(built.tcString).core
			assertEquals(core.lastUpdatedDeciseconds, core.createdDeciseconds, row.id)
			assertEquals(Math.floorDiv(oracle.now, 86_400_000L) * 864_000L, core.lastUpdatedDeciseconds, row.id)
			if (row.createdDaysAgo != null) assertTrue(built.createdAt < built.actionAt, row.id)
		}
	}
}
