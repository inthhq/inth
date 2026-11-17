package android.os

import java.util.concurrent.ConcurrentLinkedQueue

class Looper {
    companion object {
        @JvmStatic
        fun getMainLooper() = Looper()
    }
}

class Handler(@Suppress("UNUSED_PARAMETER") looper: Looper) {
    fun post(task: Runnable): Boolean = queue.add(task)

    companion object {
        private val queue = ConcurrentLinkedQueue<Runnable>()

        fun drain() {
            while (true) (queue.poll() ?: return).run()
        }
    }
}
