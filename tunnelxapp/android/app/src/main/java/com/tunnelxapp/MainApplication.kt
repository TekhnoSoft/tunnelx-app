package com.tunnelxapp

import android.app.Application
import android.os.StrictMode
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.soloader.SoLoader
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    val basePackages = PackageList(this).packages
    val extra = mutableListOf(
      // Packages that cannot be autolinked yet can be added manually here:
      WireGuardPackage(),
      FilePickerPackage(),
    )
    val allPackages = basePackages.toMutableList().apply { addAll(extra) }

    getDefaultReactHost(
      context = applicationContext,
      packageList = allPackages,
    )
  }

  override fun onCreate() {
    super.onCreate()
    try { FileLogger.init(this) } catch (_: Exception) {}
    // Log crashes globally to help debugging unexpected app closures
    Thread.setDefaultUncaughtExceptionHandler { t, e ->
      android.util.Log.e("AppCrash", "Uncaught exception in thread=${t.name}", e)
      try { FileLogger.e("AppCrash", "Uncaught exception in thread=${t.name}", e) } catch (_: Exception) {}
    }
    // Enable StrictMode in debug builds to log violations without killing the app
    try {
      if (BuildConfig.DEBUG) {
        StrictMode.setThreadPolicy(
          StrictMode.ThreadPolicy.Builder()
            .detectAll()
            .penaltyLog()
            .build()
        )
        StrictMode.setVmPolicy(
          StrictMode.VmPolicy.Builder()
            .detectAll()
            .penaltyLog()
            .build()
        )
      }
    } catch (_: Exception) {}

    // Start ANR Watchdog to capture stack traces when app becomes unresponsive
    try {
      ANRWatchdog(8000L).start()
      FileLogger.d("ANRWatchdog", "started with 8000ms timeout")
    } catch (_: Exception) {}
    // Initialize React Native per generated entrypoint (required on RN 0.82)
    try {
      com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative(this)
    } catch (_: Exception) {}
  }
}
