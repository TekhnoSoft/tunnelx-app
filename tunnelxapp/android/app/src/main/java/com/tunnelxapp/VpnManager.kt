package com.tunnelxapp

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.util.Log
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import java.util.concurrent.Executors

/**
 * Dono unico do ciclo de vida da VPN.
 *
 * Motivo de existir: antes, WireGuardModule.start criava GoBackend e WgTunnel como
 * variaveis LOCAIS e as descartava, e StopVpnActivity criava OUTRO par para pedir DOWN.
 * O GoBackend rastreia o tunel ativo em campo de instancia e descarta setState(DOWN)
 * quando currentTunnel != tunnel ("bogus call") -- entao wgTurnOff nunca rodava e o TUN
 * com rota 0.0.0.0/0 ficava instalado ate a morte do processo, derrubando Wi-Fi e dados
 * moveis ao mesmo tempo.
 *
 * Aqui existe UM GoBackend e UM WgTunnel por processo, e todas as transicoes passam por
 * um executor serial (nunca duas operacoes concorrentes sobre o mesmo TUN).
 */
object VpnManager {
  private const val TAG = "VpnManager"

  private val io = Executors.newSingleThreadExecutor { r ->
    Thread(r, "vpn-manager").apply { isDaemon = true }
  }

  @Volatile private var backend: GoBackend? = null
  @Volatile private var tunnel: WgTunnel? = null
  @Volatile private var activeId: String? = null

  /**
   * O TEXTO do .conf do tunel ativo, nao o Config ja montado.
   *
   * Guardado como texto de proposito: reconectar exige RE-RESOLVER o
   * hostname do Endpoint, e um objeto Config carrega o IP que foi resolvido
   * uma vez, na primeira subida. O endpoint do produto e um DDNS
   * (tunnelx.ddns.net) num link residencial, onde o IP publico muda em toda
   * renovacao de PPPoE — rotina diaria ou semanal no Brasil. Reaplicar o
   * Config antigo mandaria trafego para o IP velho indefinidamente, que e
   * exatamente o sintoma de "conectado, sem internet".
   */
  @Volatile private var activeConfText: String? = null

  fun submit(task: () -> Unit) {
    io.execute(task)
  }

  private fun backend(ctx: Context): GoBackend = synchronized(this) {
    backend ?: GoBackend(ctx.applicationContext).also { backend = it }
  }

  private fun tunnelFor(ctx: Context, id: String): WgTunnel = synchronized(this) {
    val cur = tunnel
    if (cur != null && cur.getName() == id) {
      cur
    } else {
      WgTunnel(ctx.applicationContext as Application, id).also { tunnel = it }
    }
  }

  /** Sobe o tunel. Lanca em qualquer falha -- e nunca deixa TUN meio-montado (ver finally). */
  @Throws(Exception::class)
  fun startBlocking(ctx: Context, id: String, cfg: Config) {
    if (VpnService.prepare(ctx.applicationContext) != null) {
      throw IllegalStateException("E_NEEDS_PREPARE")
    }

    // Troca de tunel: derruba o anterior ANTES de subir o novo.
    // A lib so admite um userspace tunnel por vez.
    val previous = activeId
    if (previous != null && previous != id) {
      Log.i(TAG, "startBlocking: trocando de tunel $previous -> $id, derrubando o anterior")
      stopBlocking(ctx)
    }

    var ok = false
    try {
      // Antes do UP: o foreground service e o que impede o processo de ser morto
      // ao sair do recents, e com ele o GoBackend.VpnService que segura o TUN.
      // Subir depois deixaria uma janela em que o tunel ja esta de pe e ainda
      // desprotegido. Se o setState falhar, o finally derruba os dois.
      TunnelKeepAliveService.start(ctx, id)

      backend(ctx).setState(tunnelFor(ctx, id), Tunnel.State.UP, cfg)
      ok = true
      activeId = id
      TunnelXVpnService.isActive = true
      TunnelXVpnService.currentTunnelId = id
      VpnStatus.emit("connected", id, null)
      Log.i(TAG, "startBlocking: tunel UP id=$id")
    } finally {
      // Se o setState lancou no meio (ex.: establish() ok mas wgTurnOn falhou),
      // nao pode sobrar interface de pe -- seria exatamente o blackhole.
      if (!ok) {
        Log.e(TAG, "startBlocking: falhou, executando teardown defensivo")
        try {
          stopBlocking(ctx)
        } catch (t: Throwable) {
          Log.w(TAG, "teardown defensivo falhou", t)
        }
      }
    }
  }

  /**
   * Teardown IDEMPOTENTE e a prova de excecao. Pode ser chamado N vezes, de qualquer
   * thread, com ou sem tunel ativo. O bloco finally e o que garante que o TUN morre
   * mesmo se a engine explodir ou se o setState for descartado pela lib.
   */
  /**
   * @param manterKeepAlive nao derruba o TunnelKeepAliveService.
   *
   * Serve a UM caso: a reconexao para re-resolver o DNS, que derruba e sobe o
   * tunel de dentro do proprio servico. Sem isto acontecem duas coisas ruins:
   *
   *   1. O servico e destruido no meio da operacao, e com ele a thread do
   *      watchdog que esta executando ESTA chamada.
   *   2. O startBlocking seguinte tenta subir o servico de novo com
   *      startForegroundService a partir do BACKGROUND — recusado desde o
   *      Android 12 com ForegroundServiceStartNotAllowedException. O tunel
   *      ficaria fora do ar justamente na tentativa de conserta-lo.
   */
  fun stopBlocking(ctx: Context, manterKeepAlive: Boolean = false) {
    val app = ctx.applicationContext
    try {
      val b = backend
      val t = tunnel
      if (b != null && t != null) {
        b.setState(t, Tunnel.State.DOWN, null)
        Log.i(TAG, "stopBlocking: setState(DOWN) concluido para ${t.getName()}")
      } else {
        Log.w(TAG, "stopBlocking: sem backend/tunnel em memoria, indo direto ao fallback")
      }
    } catch (t: Throwable) {
      Log.w(TAG, "stopBlocking: setState(DOWN) falhou -- o fallback assume", t)
    } finally {
      // FALLBACK DURO: destruir o VpnService dono do descritor. O onDestroy da lib
      // chama wgTurnOff e o sistema desmonta a interface. Idempotente: stopService
      // sobre servico ja morto e no-op.
      try {
        app.stopService(Intent(app, GoBackend.VpnService::class.java))
      } catch (t: Throwable) {
        Log.w(TAG, "stopService(GoBackend.VpnService) falhou", t)
      }
      try {
        app.stopService(Intent(app, TunnelXVpnService::class.java))
      } catch (t: Throwable) {
        Log.w(TAG, "stopService(TunnelXVpnService) falhou", t)
      }
      // Sem tunel nao ha o que preservar: a notificacao permanente some junto.
      if (!manterKeepAlive) {
        TunnelKeepAliveService.stop(app)
      } else {
        Log.i(TAG, "stopBlocking: mantendo o keep-alive (reconexao em andamento)")
      }

      activeId = null
      tunnel = null
      TunnelXVpnService.isActive = false
      TunnelXVpnService.currentTunnelId = null
      VpnStatus.emit("disconnected", null, null)
      Log.i(TAG, "stopBlocking: teardown concluido")
    }
  }

  /** Verdade do backend, nao flag manual. */
  fun isUp(): Boolean {
    val b = backend ?: return false
    val t = tunnel ?: return false
    return try {
      b.getState(t) == Tunnel.State.UP
    } catch (e: Throwable) {
      Log.w(TAG, "isUp: getState falhou", e)
      false
    }
  }

  fun activeTunnelId(): String? = activeId

  /** Guarda o texto do .conf para poder reconectar re-resolvendo o DNS. */
  fun rememberConf(text: String?) {
    activeConfText = text
  }

  fun activeConf(): String? = activeConfText

  /**
   * Quando foi o ultimo handshake, em milissegundos desde a epoca.
   *
   * Zero significa "nunca" — inclusive quando o tunel acabou de subir e
   * ainda nao trocou o primeiro handshake, entao quem chama precisa dar um
   * tempo de graca antes de concluir que algo esta errado.
   *
   * Por que isto importa: hoje "conectado" no aplicativo significa apenas
   * que a interface TUN existe. A interface continua de pe quando o servidor
   * sumiu, quando o IP do endpoint mudou, ou quando outro aparelho roubou o
   * endpoint do peer. O handshake e o unico sinal que distingue um tunel vivo
   * de um cano fechado.
   */
  fun lastHandshakeMillis(): Long {
    return try {
      val b = backend ?: return 0L
      val t = tunnel ?: return 0L
      val stats = b.getStatistics(t) ?: return 0L
      var maior = 0L
      for (chave in stats.peers()) {
        val p = stats.peer(chave) ?: continue
        val quando = p.latestHandshakeEpochMillis()
        if (quando > maior) maior = quando
      }
      maior
    } catch (t: Throwable) {
      Log.w(TAG, "lastHandshakeMillis falhou", t)
      0L
    }
  }

  /**
   * Derruba e sobe de novo, re-parseando o .conf guardado.
   *
   * E o re-parse que resolve o DNS outra vez: `Config.parse` recria os
   * Endpoint a partir do texto, e o hostname volta a ser consultado. Sem
   * isso, reconectar reaplicaria o mesmo IP morto.
   *
   * Bloqueante. Chamar da thread de IO (VpnManager.submit) ou de um servico.
   */
  @Throws(Exception::class)
  fun reconnectBlocking(ctx: Context) {
    val id = activeId ?: throw IllegalStateException("nenhum tunel ativo")

    // O texto em memoria e o caminho normal; o arquivo e a rede de seguranca
    // para o caso de o servico ter sobrevivido a uma reciclagem do processo
    // que levou o campo junto.
    val texto = activeConfText
      ?: java.io.File(ctx.applicationContext.filesDir, "wg/$id.conf")
        .takeIf { it.exists() }?.readText()
      ?: throw IllegalStateException("conf do tunel $id nao encontrado")

    Log.i(TAG, "reconnectBlocking: derrubando $id para re-resolver o endpoint")
    stopBlocking(ctx, manterKeepAlive = true)

    val cfg = com.wireguard.config.Config.parse(
      java.io.BufferedReader(java.io.StringReader(texto))
    )
    startBlocking(ctx, id, cfg)
    Log.i(TAG, "reconnectBlocking: $id de volta com o endpoint re-resolvido")
  }
}
