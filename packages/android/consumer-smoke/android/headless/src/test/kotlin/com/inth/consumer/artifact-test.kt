package com.inth.consumer

import com.inth.core.Inth
import com.inth.core.NativeConfig
import com.inth.core.model.ConsentCategory
import com.inth.core.transport.InthProtocol
import org.junit.Assert.*
import org.junit.Test
import java.util.Properties

class ArtifactTest {
    @Test fun artifactAndRequestVersionsAgreeBeforeBootstrap() {
        val expected = System.getProperty("inth.expectedVersion")
        val metadata = Properties().apply {
            load(requireNotNull(ArtifactTest::class.java.getResourceAsStream("/META-INF/inth/inth-core.properties")))
        }
        assertEquals(expected, metadata.getProperty("version"))
        assertEquals(expected, NativeConfig("https://your-project.inth.app").sdkVersion)
        assertEquals(expected, InthProtocol.protocolHeaders()[InthProtocol.VERSION_HEADER])
        assertEquals("android->$expected", InthProtocol.protocolHeaders(platform = InthProtocol.PLATFORM_ANDROID)[InthProtocol.PLATFORM_HEADER])
        assertFalse(Inth.isAllowed(ConsentCategory.MARKETING))
    }
}
