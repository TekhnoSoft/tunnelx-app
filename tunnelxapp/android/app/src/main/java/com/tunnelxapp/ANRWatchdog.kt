package com.tunnelxapp

import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class ANRWatchdog(
  private val timeoutMs: Long = 8000L
) {
  companion object {
    private const val TAG = "ANRWatchdog"
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
  @Volatile private var lastTickMs: Long = System.currentTimeMillis()
  private val tickRunnable = object : Runnable {
    override fun run() {
      lastTickMs = System.currentTimeMillis()
      mainHandler.postDelayed(this, 1000)
    }
  }

  fun start() {
    try {
      mainHandler.post(tickRunnable)
      scheduler.scheduleAtFixedRate({
        val elapsed = System.currentTimeMillis() - lastTickMs
        if (elapsed > timeoutMs) {
          val st = Looper.getMainLooper().thread.stackTrace.joinToString(separator = "\n")
          Log.e(TAG, "Main thread blocked for ${elapsed}ms\n$st")
          try { FileLogger.e(TAG, "Main thread blocked for ${elapsed}ms\n$st") } catch (_: Exception) {}
        }
      }, 2, 2, TimeUnit.SECONDS)
      Log.d(TAG, "started with timeoutMs=$timeoutMs")
      try { FileLogger.d(TAG, "started with timeoutMs=$timeoutMs") } catch (_: Exception) {}
    } catch (e: Exception) {
      Log.e(TAG, "error starting watchdog", e)
      try { FileLogger.e(TAG, "error starting watchdog", e) } catch (_: Exception) {}
    }
  }

  fun stop() {
    try {
      scheduler.shutdownNow()
      mainHandler.removeCallbacks(tickRunnable)
      Log.d(TAG, "stopped")
    } catch (e: Exception) {
      Log.e(TAG, "error stopping watchdog", e)
    }
  }
}