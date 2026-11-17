package com.inth.core.store

import com.inth.core.model.QueuedSave
import kotlinx.serialization.Serializable

/** Wire envelope for the persisted queue, so the top level stays an object. */
@Serializable
internal data class PendingQueue(val entries: List<QueuedSave> = emptyList())
