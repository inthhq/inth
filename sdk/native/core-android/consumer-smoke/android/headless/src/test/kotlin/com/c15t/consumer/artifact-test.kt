package com.c15t.consumer

import com.c15t.core.C15t
import com.c15t.core.NativeConfig
import com.c15t.core.model.ConsentCategory
import com.c15t.core.transport.C15tProtocol
import org.junit.Assert.*
import org.junit.Test
import java.util.Properties

class ArtifactTest {
    @Test fun artifactAndRequestVersionsAgreeBeforeBootstrap() {
        val expected = System.getProperty("c15t.expectedVersion")
        val metadata = Properties().apply {
            load(requireNotNull(ArtifactTest::class.java.getResourceAsStream("/META-INF/c15t/c15t-core.properties")))
        }
        assertEquals(expected, metadata.getProperty("version"))
        assertEquals(expected, NativeConfig("https://consent.example.com").sdkVersion)
        assertEquals(C15tProtocol.VERSION_PREFIX + expected, C15tProtocol.protocolHeaders()[C15tProtocol.VERSION_HEADER])
        assertFalse(C15t.isAllowed(ConsentCategory.MARKETING))
    }
}
