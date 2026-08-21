package com.tunnelxapp

import android.content.Context
import android.util.Log
import java.io.File
import java.io.PrintWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

object FileLogger {
  private const val TAG = "FileLogger"
  private val executor = Executors.newSingleThreadExecutor()
  private var logDir: File? = null
  private var logFile: File? = null
  private val dateFmt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)

  fun init(ctx: Context) {
    try {
      val dir = File(ctx.filesDir, "log")
      if (!dir.exists()) dir.mkdirs()
      logDir = dir
      logFile = File(dir, "app.log")
      Log.d(TAG, "init: logDir=${dir.absolutePath}")
      write("INFO", TAG, "FileLogger initialized")
    } catch (e: Exception) {
      Log.e(TAG, "init: failed", e)
    }
  }

  fun write(level: String, tag: String, msg: String, tr: Throwable? = null) {
    val lf = logFile ?: return
    executor.execute {
      try {
        // simples rotação se o arquivo passar de ~2MB
        if (lf.exists() && lf.length() > 2_000_000) {
          val rotated = File(lf.parentFile, "app-${System.currentTimeMillis()}.log")
          lf.renameTo(rotated)
        }
        lf.appendText(formatLine(level, tag, msg))
        if (tr != null) {
          lf.appendText("\n")
          val pw = PrintWriter(lf.outputStream().buffered())
          tr.printStackTrace(pw)
          pw.flush()
        }
        lf.appendText("\n")
      } catch (_: Exception) {
        // Evita crash por falha de escrita
      }
    }
  }

  fun e(tag: String, msg: String, tr: Throwable? = null) = write("ERROR", tag, msg, tr)
  fun d(tag: String, msg: String) = write("DEBUG", tag, msg, null)

  private fun formatLine(level: String, tag: String, msg: String): String {
    val ts = dateFmt.format(Date())
    return "$ts [$level/$tag] $msg"
  }
}