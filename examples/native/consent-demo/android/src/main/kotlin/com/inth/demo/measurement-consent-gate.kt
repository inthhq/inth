// #region docs:android-measurement-gate title="MeasurementConsentGate.kt"
package com.inth.demo

import android.os.Handler
import android.os.Looper
import com.inth.core.Inth
import com.inth.core.model.ConsentCategory

class MeasurementConsentGate(
    private val setCollectionEnabled: (Boolean) -> Unit,
) : AutoCloseable {
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var closed = false
    private val onPermission: (Boolean) -> Unit = {
        main.post {
            if (!closed) setCollectionEnabled(Inth.isAllowed(ConsentCategory.MEASUREMENT))
        }
    }
    private val subscription = Inth.gate(ConsentCategory.MEASUREMENT, onPermission)

    override fun close() {
        closed = true
        subscription.close()
        main.post { setCollectionEnabled(false) }
    }
}
// #endregion docs:android-measurement-gate
