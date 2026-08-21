package com.tunnelxapp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.IBinder
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.tunnelxapp.wireguard.WgEngine
import com.tunnelxapp.wireguard.WgEngineGo

class TunnelXVpnService : VpnService() {
  companion object {
    private const val TAG = "TunnelXVpnService"
    const val ACTION_START_TUNNEL = "com.tunnelxapp.action.START_TUNNEL"
    const val ACTION_STOP_TUNNEL = "com.tunnelxapp.action.STOP_TUNNEL"
    const val EXTRA_TUNNEL_ID = "extra_tunnel_id"
    private const val CHANNEL_ID = "tunnelx_vpn_channel"
    private const val NOTIFICATION_ID = 1001
    @Volatile var isActive: Boolean = false
    @Volatile var currentTunnelId: String? = null
    const val STATUS_EVENT = "TunnelXVpnStatus"
  }

  private var vpnInterface: ParcelFileDescriptor? = null
  private val workerExecutor: java.util.concurrent.ExecutorService = java.util.concurrent.Executors.newSingleThreadExecutor()
  private var wgEngine: WgEngine? = WgEngineGo()
  private var lastConfText: String? = null

  override fun onBind(intent: Intent): IBinder? {
    // Control via startService/stopService intents; not a bound service
    return null
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START_TUNNEL -> {
        try {
          startForeground(NOTIFICATION_ID, buildNotification())
        } catch (e: Exception) {
          // Fallback para evitar crash caso ícone/canal ou tipo de FGS falhe
          Log.e(TAG, "onStartCommand: startForeground failed, using minimal notification", e)
          val minimal = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle("TunnelX VPN")
            .setContentText("Serviço em primeiro plano")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
          try {
            startForeground(NOTIFICATION_ID, minimal)
          } catch (_: Exception) {
            // Se ainda falhar, pare o serviço para evitar crash
            stopSelf()
            return START_NOT_STICKY
          }
        }
        val tunnelId = intent.getStringExtra(EXTRA_TUNNEL_ID)
        Log.d(TAG, "onStartCommand: ACTION_START_TUNNEL tunnelId=$tunnelId")
        // Mover trabalho pesado para thread de fundo para evitar ANR no main thread
        workerExecutor.execute {
          try {
            if (tunnelId != null) {
              currentTunnelId = tunnelId
              establishTunFromConfig(tunnelId)
            } else {
              Log.w(TAG, "onStartCommand: START without tunnelId, using basic TUN")
              establishBasicTun()
            }
          } catch (e: Exception) {
            Log.e(TAG, "onStartCommand: exception while establishing TUN on worker thread", e)
            try { establishBasicTun() } catch (_: Exception) {}
          }
        }
        // Uma VPN jamais deve reaparecer sozinha: na recriacao o intent vem null e cai
    // no ramo else vazio, deixando um servico zumbi sem TUN e sem notificacao.
    return START_NOT_STICKY
      }
      ACTION_STOP_TUNNEL -> {
        Log.d(TAG, "onStartCommand: ACTION_STOP_TUNNEL")
        // Também executar o teardown em thread de fundo
        workerExecutor.execute {
          teardownTun()
        }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        return START_NOT_STICKY
      }
      else -> {
        // Unknown action; do nothing
        Log.w(TAG, "onStartCommand: unknown action=${intent?.action}")
      }
    }
    return START_NOT_STICKY
  }

  private fun establishBasicTun() {
    // Demo: cria uma interface TUN básica para mostrar o ícone de VPN ativo
    try {
      Log.d(TAG, "establishBasicTun: session=TunnelX mtu=1280 address=10.0.0.2/32 dns=1.1.1.1 route=0.0.0.0/0")
      try { FileLogger.d(TAG, "establishBasicTun starting") } catch (_: Exception) {}
      val builder = Builder()
        .setSession("TunnelX")
        .setMtu(1280)
        .addAddress("10.0.0.2", 32)
        .addDnsServer("1.1.1.1")
        .addRoute("0.0.0.0", 0)
      // Configure intent ajuda o sistema a identificar a origem do VPN e exibir UI adequada
      builder.setConfigureIntent(createConfigureIntent())

      vpnInterface = builder.establish()
      if (vpnInterface != null) {
        Log.i(TAG, "establishBasicTun: TUN established successfully")
        try { FileLogger.d(TAG, "establishBasicTun: TUN established successfully") } catch (_: Exception) {}
        isActive = true
        emitStatusEvent(true)
      } else {
        Log.e(TAG, "establishBasicTun: failed to establish TUN (null ParcelFileDescriptor)")
        try { FileLogger.e(TAG, "establishBasicTun: failed to establish TUN (null ParcelFileDescriptor)") } catch (_: Exception) {}
        isActive = false
        emitStatusEvent(false)
      }
    } catch (_: Exception) {
      // Silencioso por enquanto; podemos adicionar logs posteriormente
      Log.e(TAG, "establishBasicTun: exception while establishing basic TUN")
      try { FileLogger.e(TAG, "establishBasicTun: exception while establishing basic TUN") } catch (_: Exception) {}
      isActive = false
      emitStatusEvent(false)
    }
  }

  private fun establishTunFromConfig(tunnelId: String) {
    try {
      val dir = java.io.File(filesDir, "wg")
      val file = java.io.File(dir, "$tunnelId.conf")
      Log.d(TAG, "establishTunFromConfig: dir=${dir.absolutePath} file=${file.absolutePath}")
      try { FileLogger.d(TAG, "establishTunFromConfig: path=${file.absolutePath}") } catch (_: Exception) {}
      if (!file.exists()) {
        // Fallback para TUN básico se não encontrar o conf
        Log.e(TAG, "establishTunFromConfig: conf not found for tunnelId=$tunnelId, using basic TUN")
        try { FileLogger.e(TAG, "establishTunFromConfig: conf not found for id=$tunnelId, fallback basic TUN") } catch (_: Exception) {}
        establishBasicTun()
        return
      }

      val conf = file.readText()
      lastConfText = conf
      Log.d(TAG, "establishTunFromConfig: conf length=${conf.length}")
      val parsed = parseWgQuickConf(conf)
      Log.d(TAG, "parsed: session=${parsed.session} mtu=${parsed.mtu} addresses=${parsed.addresses} dns=${parsed.dns} allowedIps=${parsed.allowedIps}")

      val builder = Builder()
        .setSession(parsed.session ?: "WireGuard-$tunnelId")
        .setMtu(parsed.mtu ?: 1280)
      // Configure intent para integração com UI do sistema
      builder.setConfigureIntent(createConfigureIntent())

      // Addresses
      parsed.addresses.forEach { addr ->
        val parts = addr.split("/")
        if (parts.size == 2) {
          val ip = parts[0].trim()
          val prefix = parts[1].trim().toIntOrNull() ?: 32
          Log.d(TAG, "builder.addAddress $ip/$prefix")
          builder.addAddress(ip, prefix)
        }
      }

      // DNS servers
      parsed.dns.forEach { dns ->
        Log.d(TAG, "builder.addDnsServer $dns")
        builder.addDnsServer(dns.trim())
      }

      // Routes from AllowedIPs (IPv4/IPv6)
      parsed.allowedIps.forEach { cidr ->
        val parts = cidr.split("/")
        if (parts.size == 2) {
          val ip = parts[0].trim()
          val prefix = parts[1].trim().toIntOrNull() ?: 0
          Log.d(TAG, "builder.addRoute $ip/$prefix")
          builder.addRoute(ip, prefix)
        } else if (cidr.equals("0.0.0.0/0", ignoreCase = true)) {
          Log.d(TAG, "builder.addRoute default IPv4 0.0.0.0/0")
          builder.addRoute("0.0.0.0", 0)
        } else if (cidr.equals("::/0", ignoreCase = true)) {
          Log.d(TAG, "builder.addRoute default IPv6 ::/0")
          builder.addRoute("::", 0)
        }
      }

      vpnInterface = builder.establish()
      if (vpnInterface != null) {
        Log.i(TAG, "establishTunFromConfig: TUN established successfully from conf, starting WG engine")
        try { FileLogger.d(TAG, "establishTunFromConfig: TUN established, starting WG engine") } catch (_: Exception) {}
        val started = try {
          wgEngine?.start(vpnInterface!!, conf) ?: false
        } catch (e: Exception) {
          Log.e(TAG, "establishTunFromConfig: wgEngine.start failed", e)
          try { FileLogger.e(TAG, "establishTunFromConfig: wgEngine.start failed: ${e.message}") } catch (_: Exception) {}
          false
        }
        if (started) {
          isActive = true
          emitStatusEvent(true)
          Log.i(TAG, "establishTunFromConfig: WG engine started successfully")
          try { FileLogger.d(TAG, "establishTunFromConfig: WG engine started successfully") } catch (_: Exception) {}
        } else {
          Log.e(TAG, "establishTunFromConfig: WG engine failed to start, tearing down TUN")
          try { FileLogger.e(TAG, "establishTunFromConfig: WG engine failed to start, tearing down") } catch (_: Exception) {}
          try { vpnInterface?.close() } catch (_: Exception) {}
          vpnInterface = null
          isActive = false
          emitStatusEvent(false)
        }
      } else {
        Log.e(TAG, "establishTunFromConfig: failed to establish TUN from conf (null ParcelFileDescriptor)")
        try { FileLogger.e(TAG, "establishTunFromConfig: failed to establish TUN (null PFD)") } catch (_: Exception) {}
        isActive = false
        emitStatusEvent(false)
      }
    } catch (_: Exception) {
      // Se falhar, tenta TUN básico
      Log.e(TAG, "establishTunFromConfig: exception establishing TUN from conf, falling back to basic TUN")
      try { FileLogger.e(TAG, "establishTunFromConfig: exception establishing TUN, fallback basic TUN") } catch (_: Exception) {}
      try { establishBasicTun() } catch (_: Exception) {}
    }
  }

  private fun emitStatusEvent(connected: Boolean) {
    try {
      val reactApp = (applicationContext as? ReactApplication) ?: return
      val reactContext = reactApp.reactNativeHost.reactInstanceManager.currentReactContext ?: return
      val emitter = reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      emitter.emit(STATUS_EVENT, if (connected) "connected" else "disconnected")
      Log.d(TAG, "emitStatusEvent: ${connected}")
    } catch (e: Exception) {
      Log.w(TAG, "emitStatusEvent: failed to emit", e)
    }
  }

  private data class ParsedConf(
    val session: String?,
    val mtu: Int?,
    val addresses: List<String>,
    val dns: List<String>,
    val allowedIps: List<String>,
    val privateKey: String?,
    val peerPublicKey: String?,
    val endpoint: String?
  )

  private fun parseWgQuickConf(conf: String): ParsedConf {
    var session: String? = null
    var mtu: Int? = null
    val addresses = mutableListOf<String>()
    val dns = mutableListOf<String>()
    val allowedIps = mutableListOf<String>()
    var privateKey: String? = null
    var peerPublicKey: String? = null
    var endpoint: String? = null

    var section = ""
    conf.lines().forEach { raw ->
      val line = raw.trim()
      if (line.isEmpty() || line.startsWith("#")) return@forEach
      if (line.startsWith("[")) {
        section = line.lowercase()
        return@forEach
      }
      val idx = line.indexOf('=')
      if (idx <= 0) return@forEach
      val key = line.substring(0, idx).trim().lowercase()
      val value = line.substring(idx + 1).trim()

      when (section) {
        "[interface]" -> {
          when (key) {
            "address" -> value.split(',').forEach { addresses.add(it.trim()) }
            "dns" -> value.split(',').forEach { dns.add(it.trim()) }
            "mtu" -> mtu = value.toIntOrNull()
            "name", "session" -> session = value
            "privatekey" -> privateKey = value
          }
        }
        "[peer]" -> {
          when (key) {
            "allowedips" -> value.split(',').forEach { allowedIps.add(it.trim()) }
            "publickey" -> peerPublicKey = value
            "endpoint" -> endpoint = value
          }
        }
      }
    }

    if (allowedIps.isEmpty()) {
      // fallback para rota padrão
      allowedIps.add("0.0.0.0/0")
    }

    return ParsedConf(session, mtu, addresses, dns, allowedIps, privateKey, peerPublicKey, endpoint)
  }

  private fun teardownTun() {
    try {
      // Para o motor WireGuard antes de fechar a interface
      try {
        val stopped = wgEngine?.stop() ?: false
        Log.d(TAG, "teardownTun: wgEngine.stop returned=$stopped")
        try { FileLogger.d(TAG, "teardownTun: wgEngine.stop returned=$stopped") } catch (_: Exception) {}
      } catch (e: Exception) {
        Log.w(TAG, "teardownTun: wgEngine.stop failed", e)
        try { FileLogger.e(TAG, "teardownTun: wgEngine.stop failed: ${e.message}") } catch (_: Exception) {}
      }
      Log.d(TAG, "teardownTun: closing TUN interface")
      try { FileLogger.d(TAG, "teardownTun: closing TUN interface") } catch (_: Exception) {}
      vpnInterface?.close()
    } catch (_: Exception) {
      Log.w(TAG, "teardownTun: error closing TUN (ignored)")
      try { FileLogger.e(TAG, "teardownTun: error closing TUN (ignored)") } catch (_: Exception) {}
    } finally {
      vpnInterface = null
      isActive = false
      emitStatusEvent(false)
      currentTunnelId = null
      lastConfText = null
    }
  }

  private fun buildNotification(): Notification {
    try { ensureNotificationChannel() } catch (e: Exception) {
      Log.w(TAG, "buildNotification: ensureNotificationChannel failed", e)
    }

    val openAppIntent = Intent(this, MainActivity::class.java)
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      openAppIntent,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT else 0
    )

    return try {
      NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("TunnelX VPN")
        .setContentText("Túnel ativo (demo)")
        .setContentIntent(pendingIntent)
        .setOngoing(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()
    } catch (e: Exception) {
      Log.w(TAG, "buildNotification: fallback minimal notification", e)
      NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.stat_sys_warning)
        .setContentTitle("TunnelX VPN")
        .setContentText("Serviço em primeiro plano")
        .setOngoing(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()
    }
  }

  private fun createConfigureIntent(): PendingIntent {
    val openAppIntent = Intent(this, MainActivity::class.java)
    return PendingIntent.getActivity(
      this,
      1,
      openAppIntent,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT else 0
    )
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(NotificationManager::class.java)
      val existing = nm.getNotificationChannel(CHANNEL_ID)
      if (existing == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          "TunnelX VPN",
          NotificationManager.IMPORTANCE_LOW
        )
        nm.createNotificationChannel(channel)
        Log.d(TAG, "ensureNotificationChannel: created channel id=$CHANNEL_ID")
      } else {
        Log.d(TAG, "ensureNotificationChannel: channel already exists id=$CHANNEL_ID")
      }
    }
  }

  override fun onDestroy() {
    try { teardownTun() } catch (_: Exception) {}
    try { workerExecutor.shutdownNow() } catch (_: Exception) {}
    super.onDestroy()
  }
}
