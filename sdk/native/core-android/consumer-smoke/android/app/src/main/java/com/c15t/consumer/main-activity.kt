package com.c15t.consumer

import android.app.Activity
import android.os.Bundle
import android.widget.TextView
import com.c15t.android.C15tAndroid
import com.c15t.core.C15t
import com.c15t.core.NativeConfig
import com.c15t.core.model.ConsentCategory
import com.c15t.core.wire.SnapshotWire

class MainActivity : Activity() {
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        C15tAndroid.install(this, NativeConfig("https://your-project.inth.app"))
        setContentView(TextView(this).apply {
            text = "${C15t.isAllowed(ConsentCategory.MARKETING)}: ${C15t.snapshot()?.let { SnapshotWire.encodeToString(it) }}"
        })
    }
}
