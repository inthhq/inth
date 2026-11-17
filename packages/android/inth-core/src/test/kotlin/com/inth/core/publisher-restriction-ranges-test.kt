package com.inth.core

import com.inth.core.iab.*
import com.inth.core.tc.*
import kotlin.test.*

class PublisherRestrictionRangesTest {
	@Test
	fun `sparse disclosed vendors do not restrict numeric gaps`() {
		assertRoundTrip(listOf(1, 3), listOf(1, 3), listOf(TcIdRange(1, 1), TcIdRange(3, 3)))
	}

	@Test
	fun `unselected disclosed vendors do not enter a restriction`() {
		assertRoundTrip(listOf(1, 2, 3), listOf(1, 3), listOf(TcIdRange(1, 1), TcIdRange(3, 3)))
	}

	@Test
	fun `numerically consecutive vendors still share a range`() {
		assertRoundTrip(listOf(1, 2, 3), listOf(3, 1, 2), listOf(TcIdRange(1, 3)))
	}

	@Test
	fun `mixed runs stop at each numeric gap`() {
		assertRoundTrip(listOf(1, 2, 4, 5, 7), listOf(7, 2, 5, 1, 4),
			listOf(TcIdRange(1, 2), TcIdRange(4, 5), TcIdRange(7, 7)))
	}

	private fun assertRoundTrip(disclosed: List<Int>, restricted: List<Int>, ranges: List<TcIdRange>) {
		val gvl = GlobalVendorList(
			vendorListVersion = 10, tcfPolicyVersion = 5,
			purposes = listOf(1, 2).associateWith { GvlLocalizedEntry(id = it.toLong()) },
			vendors = disclosed.associateWith {
				GvlVendorEntry(id = it.toLong(), purposes = listOf(1, 2),
					legIntPurposes = listOf(2), flexiblePurposes = listOf(2))
			},
		)
		val choices = IabChoices(purposeConsents = listOf(1), vendorConsents = disclosed)
		for (type in 0..2) {
			val config = IabConfiguration(53, 7, "GB",
				publisherRestrictions = listOf(IabPublisherRestriction(2, type, restricted)))
			val built = IabAuthority.build(config, choices, gvl, "sub_test", null, "test", 1_700_000_000_000, null)
			val decoded = TcStringDecoder.decode(built.tcString).core
			val restriction = decoded.publisherRestrictions.restrictions.single()
			println("type=$type disclosed=$disclosed configured=$restricted decoded=${restriction.vendorIds} ranges=${restriction.ranges}")
			assertEquals(restricted.sorted(), restriction.vendorIds)
			assertEquals(ranges, restriction.ranges)
			assertEquals(2, restriction.purposeId)
			assertEquals(type, restriction.restrictionTypeValue)
			assertEquals(config, built.configuration)
			assertEquals(choices, built.choices)
			assertEquals(config.cmpId, decoded.cmpId)
			assertEquals(config.cmpVersion, decoded.cmpVersion)
			assertEquals(choices.purposeConsents, decoded.purposeConsents)
		}
	}
}
