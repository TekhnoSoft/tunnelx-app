package com.tunnelxapp

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.util.Log
import com.facebook.react.bridge.*
import java.io.File
import java.net.InetAddress
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import com.wireguard.config.Interface
import com.wireguard.config.Peer
import com.wireguard.config.InetNetwork
import com.wireguard.config.InetEndpoint

class WireGuardModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {
  companion object {
    private const val TAG = "WireGuardModule"
    private const val REQ_PREPARE = 10001
  }

  @Volatile private var preparePromise: Promise? = null

  init {
    VpnStatus.attach(reactContext)
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "WireGuardModule"

  // Exigidos pelo NativeEventEmitter do lado JS; sem eles o RN avisa e, sob
  // TurboModules, a assinatura do modulo pode falhar.
  @ReactMethod fun addListener(eventName: String) { /* no-op: quem emite e o VpnStatus */ }
  @ReactMethod fun removeListeners(count: Int) { /* no-op */ }

  // A permissao de VPN agora e resolvida pelo resultado REAL do dialogo, nao chutada.
  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQ_PREPARE) return
    val p = preparePromise
    preparePromise = null
    val granted = resultCode == Activity.RESULT_OK
    Log.i(TAG, "onActivityResult: prepare granted=$granted")
    if (!granted) VpnStatus.emit("error", null, "Permissao de VPN negada pelo usuario")
    p?.resolve(granted)
  }

  override fun onNewIntent(intent: Intent) { /* no-op */ }

  @ReactMethod
  fun applyConfig(params: ReadableMap, promise: Promise) {
    try {
      val id = params.getString("id") ?: return promise.reject("EINVAL", "Missing id")
      val conf = params.getString("conf") ?: return promise.reject("EINVAL", "Missing conf")
      val dir = File(reactContext.filesDir, "wg")
      if (!dir.exists()) dir.mkdirs()
      val file = File(dir, "$id.conf")
      file.writeText(conf)
      Log.d(TAG, "applyConfig: wrote conf id=$id path=${file.absolutePath} length=${conf.length}")
      promise.resolve(null)
    } catch (e: Exception) {
      Log.e(TAG, "applyConfig: error writing conf", e)
      promise.reject("EWRITE", "Failed to write WireGuard config", e)
    }
  }

  @ReactMethod
  fun start(id: String, promise: Promise) {
    try {
      // Check for permissions
      val intent = VpnService.prepare(reactContext)
      if (intent != null) {
         promise.reject("E_NEEDS_PREPARE", "VPN permission not granted")
         return
      }

      val confFile = File(reactContext.filesDir, "wg/$id.conf")
      if (!confFile.exists()) {
        promise.reject("ECONF", "Config file not found")
        return
      }
      
      val confText = confFile.readText()
      val cfg: Config
      try {
        cfg = buildConfigFromText(confText)
      } catch (e: Exception) {
        promise.reject("EPARSE", "Failed to parse config: ${e.message}")
        return
      }

      // Antes, GoBackend/WgTunnel eram criados aqui como variaveis locais e descartados
      // ao fim do metodo -- ninguem guardava referencia ao dono do TUN, e por isso o
      // desligamento nunca alcancava quem realmente segurava o descritor.
      // O TEXTO do conf vai junto: reconectar precisa re-parsear para o DNS do
      // endpoint ser resolvido de novo. Ver VpnManager.reconnectBlocking.
      VpnManager.rememberConf(confText)

      VpnManager.submit {
        try {
          VpnManager.startBlocking(reactContext, id, cfg)
          Log.i(TAG, "start: tunel UP via VpnManager id=$id")
          reactContext.runOnJSQueueThread { promise.resolve(null) }
        } catch (e: Exception) {
          Log.e(TAG, "start: falhou id=$id", e)
          VpnStatus.emit("error", id, e.message)
          val code = if (e.message?.contains("E_NEEDS_PREPARE") == true) "E_NEEDS_PREPARE" else "ESTART"
          reactContext.runOnJSQueueThread { promise.reject(code, e.message ?: "Failed to start tunnel") }
        }
      }

    } catch (e: Exception) {
      Log.e(TAG, "start: error starting tunnel id=$id", e)
      promise.reject("ESTART", "Failed to start tunnel", e)
    }
  }

  private fun buildConfigFromText(text: String): Config {
    val ifaceBuilder = Interface.Builder()
    var peerBuilder: Peer.Builder? = null
    val peers = mutableListOf<Peer>()

    var section = ""
    text.lines().forEach { raw ->
      val line = raw.trim()
      if (line.isEmpty() || line.startsWith("#")) return@forEach
      if (line.startsWith("[") && line.endsWith("]")) {
        section = line.lowercase()
        if (section == "[peer]") {
           if (peerBuilder != null) {
             peers.add(peerBuilder!!.build())
           }
           peerBuilder = Peer.Builder()
        }
        return@forEach
      }
      val idx = line.indexOf('=')
      if (idx <= 0) return@forEach
      val key = line.substring(0, idx).trim().lowercase()
      val value = line.substring(idx + 1).trim()

      when (section) {
        "[interface]" -> {
          when (key) {
            "privatekey" -> ifaceBuilder.parsePrivateKey(value)
            "address" -> value.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach {
              try { ifaceBuilder.addAddress(InetNetwork.parse(it)) } catch (_: Exception) {}
            }
            "dns" -> value.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach {
              try { ifaceBuilder.addDnsServer(InetAddress.getByName(it)) } catch (_: Exception) {}
            }
            "mtu" -> try { ifaceBuilder.setMtu(value.toInt()) } catch (_: Exception) {}
          }
        }
        "[peer]" -> {
          if (peerBuilder != null) {
            when (key) {
              "publickey" -> peerBuilder!!.parsePublicKey(value)
              "allowedips" -> value.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach {
                try { peerBuilder!!.addAllowedIp(InetNetwork.parse(it)) } catch (_: Exception) {}
              }
              "endpoint" -> try { peerBuilder!!.setEndpoint(InetEndpoint.parse(value)) } catch (_: Exception) {}
              "persistentkeepalive" -> try { peerBuilder!!.setPersistentKeepalive(value.toInt()) } catch (_: Exception) {}
              "presharedkey" -> try { peerBuilder!!.parsePreSharedKey(value) } catch (_: Exception) {}
            }
          }
        }
      }
    }
    // Add last peer
    if (peerBuilder != null) {
      peers.add(peerBuilder!!.build())
    }

    val builder = Config.Builder()
      .setInterface(ifaceBuilder.build())
    
    peers.forEach { builder.addPeer(it) }
    
    return builder.build()
  }

  @ReactMethod
  fun stop(id: String, promise: Promise) {
    // Sem Intent e sem Activity: teardown direto no dono do tunel, VERIFICADO antes de
    // resolver. O codigo anterior chamava stopService com uma action (que stopService
    // nunca entrega, pois nao invoca onStartCommand), lancava uma Activity que criava
    // um GoBackend novo (cujo DOWN a lib descarta) e resolvia a promise
    // incondicionalmente -- por isso a UI dizia "desconectado" com o TUN de pe.
    VpnManager.submit {
      var err: Throwable? = null
      try {
        VpnManager.stopBlocking(reactContext)
      } catch (t: Throwable) {
        err = t
        Log.e(TAG, "stop: teardown lancou id=$id", t)
      } finally {
        if (VpnManager.isUp()) {
          Log.e(TAG, "stop: TUNEL AINDA ATIVO apos teardown id=$id")
          VpnStatus.emit("error", id, err?.message ?: "tunel continua ativo apos teardown")
          reactContext.runOnJSQueueThread {
            promise.reject("ESTOP", err?.message ?: "Tunel continua ativo apos o teardown")
          }
        } else {
          VpnStatus.emit("disconnected", null, null)
          reactContext.runOnJSQueueThread { promise.resolve(null) }
        }
      }
    }
  }

  // status/isConnected passam a consultar o BACKEND, nao flags estaticas que o app
  // escrevia manualmente e que ficavam mentindo quando o teardown falhava.
  /**
   * Entrega ao lado nativo o que ele precisa para conferir a sessao sozinho.
   *
   * O keep-alive mantem o tunel de pe depois que o app sai do recents, e nesse
   * estado nao ha JavaScript para vigiar nada. Sem estas credenciais, uma sessao
   * derrubada em outro aparelho deixaria este telefone tunelando ate alguem
   * reabrir o app. Ver SessionGuard.
   */
  /**
   * Ha quanto tempo foi o ultimo handshake, em segundos. -1 = nunca houve.
   *
   * "Conectado" no aplicativo significa hoje apenas que a interface TUN
   * existe — e ela continua existindo com o servidor fora do ar, com o IP do
   * endpoint trocado, ou com outro aparelho tendo roubado o endpoint do peer.
   * O handshake e o unico sinal que separa um tunel vivo de um cano fechado.
   */
  @ReactMethod
  fun getHandshakeAge(promise: Promise) {
    try {
      val quando = VpnManager.lastHandshakeMillis()
      if (quando <= 0L) {
        promise.resolve(-1.0)
        return
      }
      promise.resolve(((System.currentTimeMillis() - quando) / 1000.0))
    } catch (t: Throwable) {
      promise.resolve(-1.0)
    }
  }

  /**
   * Derruba e sobe o tunel re-resolvendo o hostname do endpoint.
   *
   * Existe para o caso do DDNS: o endpoint do produto e um nome, resolvido
   * UMA vez quando o tunel sobe. Quando o IP publico do servidor muda, o
   * aparelho segue mandando UDP para o endereco velho ate alguem reconectar.
   */
  @ReactMethod
  fun reconnect(promise: Promise) {
    VpnManager.submit {
      try {
        VpnManager.reconnectBlocking(reactContext)
        reactContext.runOnJSQueueThread { promise.resolve(null) }
      } catch (e: Exception) {
        Log.e(TAG, "reconnect falhou", e)
        reactContext.runOnJSQueueThread { promise.reject("ERECONNECT", e.message) }
      }
    }
  }

  @ReactMethod
  fun setSessionGuard(baseUrl: String?, token: String?, promise: Promise) {
    try {
      SessionGuard.configurar(reactContext, baseUrl, token)
      promise.resolve(null)
    } catch (t: Throwable) {
      Log.e(TAG, "setSessionGuard falhou", t)
      // Nao rejeita: isto e reforco de seguranca, nao deve quebrar o login.
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun clearSessionGuard(promise: Promise) {
    try {
      SessionGuard.limpar(reactContext)
    } catch (t: Throwable) {
      Log.w(TAG, "clearSessionGuard falhou", t)
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun status(id: String, promise: Promise) {
    val up = VpnManager.isUp() && VpnManager.activeTunnelId() == id
    Log.d(TAG, "status: id=$id => ${if (up) "up" else "down"}")
    promise.resolve(if (up) "up" else "down")
  }

  @ReactMethod
  fun isConnected(promise: Promise) {
    promise.resolve(VpnManager.isUp())
  }

  /** Estado completo, para a UI reconciliar no foreground em vez de confiar no disco. */
  @ReactMethod
  fun getVpnState(promise: Promise) {
    val map = Arguments.createMap().apply {
      putBoolean("connected", VpnManager.isUp())
      putString("tunnelId", VpnManager.activeTunnelId())
    }
    promise.resolve(map)
  }

  // Optional helper: initiate VpnService.prepare flow from current Activity
  @ReactMethod
  fun prepareVpn(promise: Promise) {
    val current = reactContext.currentActivity
    try {
      if (current != null) {
        val intent = VpnService.prepare(current)
        if (intent == null) {
          // Already prepared
          Log.d(TAG, "prepareVpn: already prepared via Activity context")
          promise.resolve(true)
          return
        }
        // NAO resolve aqui: a resposta real chega em onActivityResult. Resolver true
        // na hora fazia o JS acreditar que a permissao fora concedida mesmo quando o
        // usuario negava.
        preparePromise?.reject("EPREP_CANCELLED", "Nova solicitacao de permissao substituiu a anterior")
        preparePromise = promise
        current.startActivityForResult(intent, REQ_PREPARE)
        Log.d(TAG, "prepareVpn: dialogo lancado, aguardando onActivityResult")
        return
      }

      // Fallback: use application context with NEW_TASK flag
      val appIntent = VpnService.prepare(reactContext)
      if (appIntent == null) {
        Log.d(TAG, "prepareVpn: already prepared via App context")
        promise.resolve(true)
        return
      }
      appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(appIntent)
      Log.d(TAG, "prepareVpn: dialogo aberto sem Activity; sem callback de resultado")
      // Sem Activity nao ha onActivityResult: rejeitar e melhor que mentir.
      promise.reject("E_NEEDS_PREPARE", "Dialogo de permissao aberto sem Activity; refaca a acao com o app em primeiro plano")
    } catch (e: Exception) {
      Log.e(TAG, "prepareVpn: error launching prepare", e)
      promise.reject("EPREP", "Failed to start VPN prepare activity", e)
    }
  }
}
