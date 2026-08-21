package com.tunnelxapp

import android.app.Activity
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.module.annotations.ReactModule
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.nio.charset.Charset

@ReactModule(name = "FilePicker")
class FilePickerModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {
  private var pendingPromise: Promise? = null

  companion object {
    private const val REQUEST_CODE = 9101
    private const val TAG = "FilePickerModule"
  }

  override fun getName(): String = "FilePicker"

  init {
    reactContext.addActivityEventListener(this)
  }

  @ReactMethod
  fun pickConf(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      Log.e(TAG, "pickConf: no current Activity available")
      promise.reject("E_NO_ACTIVITY", "Activity não disponível")
      return
    }
    if (pendingPromise != null) {
      Log.w(TAG, "pickConf: already in progress")
      promise.reject("E_ALREADY_PICKING", "Já existe uma operação de seleção em andamento")
      return
    }
    pendingPromise = promise

    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      type = "*/*"
      putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/plain", "application/octet-stream", "application/*", "*/*"))
    }
    Log.d(TAG, "pickConf: launching ACTION_OPEN_DOCUMENT")
    activity.startActivityForResult(intent, REQUEST_CODE)
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_CODE) return
    val promise = pendingPromise
    pendingPromise = null
    if (promise == null) return

    if (resultCode != Activity.RESULT_OK || data == null) {
      Log.w(TAG, "onActivityResult: canceled or no data")
      promise.reject("E_CANCELED", "Seleção cancelada")
      return
    }
    val uri: Uri? = data.data
    if (uri == null) {
      Log.e(TAG, "onActivityResult: null Uri")
      promise.reject("E_NO_URI", "Nenhum arquivo selecionado")
      return
    }
    try {
      // Tenta persistir a permissão de leitura
      try {
        reactContext.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      } catch (_: SecurityException) { /* ignore */ }

      Log.d(TAG, "onActivityResult: reading content from uri=$uri")
      val content = readContentFromUri(uri)
      val name = getDisplayName(uri)
      Log.d(TAG, "onActivityResult: got name=$name contentLength=${content.length}")
      val map = Arguments.createMap()
      map.putString("name", name)
      map.putString("uri", uri.toString())
      map.putString("content", content)
      promise.resolve(map)
    } catch (e: Exception) {
      Log.e(TAG, "onActivityResult: error reading file", e)
      promise.reject("E_READ_FAIL", e.message ?: "Falha ao ler conteúdo do arquivo")
    }
  }

  override fun onNewIntent(intent: Intent) { /* no-op */ }

  private fun readContentFromUri(uri: Uri): String {
    return when (uri.scheme) {
      "content" -> {
        val resolver = reactContext.contentResolver
        resolver.openInputStream(uri).use { input ->
          if (input == null) throw IllegalStateException("InputStream nulo para URI")
          val reader = BufferedReader(InputStreamReader(input, Charset.forName("UTF-8")))
          val sb = StringBuilder()
          var line: String?
          while (reader.readLine().also { line = it } != null) {
            sb.append(line).append('\n')
          }
          Log.d(TAG, "readContentFromUri: read ${sb.length} chars from content://")
          sb.toString()
        }
      }
      "file" -> {
        val path = uri.path ?: throw IllegalStateException("Caminho inválido para URI de arquivo")
        Log.d(TAG, "readContentFromUri: reading file path=$path")
        File(path).readText(Charset.forName("UTF-8"))
      }
      else -> throw IllegalArgumentException("Esquema de URI não suportado: ${uri.scheme}")
    }
  }

  private fun getDisplayName(uri: Uri): String {
    var name = "arquivo.conf"
    val resolver = reactContext.contentResolver
    var cursor: Cursor? = null
    try {
      cursor = resolver.query(uri, null, null, null, null)
      if (cursor != null && cursor.moveToFirst()) {
        val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (idx >= 0) {
          name = cursor.getString(idx) ?: name
        }
      }
    } finally {
      cursor?.close()
    }
    Log.d(TAG, "getDisplayName: resolved name=$name for uri=$uri")
    return name
  }
}