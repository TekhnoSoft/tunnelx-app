package com.tunnelxapp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Mantem o processo vivo enquanto o tunel estiver de pe.
 *
 * O TUN pertence ao GoBackend.VpnService, do AAR oficial, que e um Service COMUM:
 * sem foregroundServiceType e sem notificacao. Quando o usuario tira o app do
 * recents, ou quando o sistema precisa de memoria, o processo morre - e o tunel
 * morre junto, no meio de um download ou de uma chamada. Era exatamente o que
 * acontecia: nao havia foreground service nenhum no caminho real (o
 * TunnelXVpnService, unico com notificacao, nunca chegou a ser iniciado).
 *
 * Este servico nao toca no tunel. Ele so segura uma notificacao permanente, o que
 * basta: enquanto ha um foreground service no processo, o Android o preserva, e o
 * GoBackend.VpnService - que vive no mesmo processo - continua com o descritor
 * aberto.
 *
 * Nao e VpnService de proposito. Um segundo VpnService no pacote disputaria a
 * eleicao de always-on VPN com o do AAR (ver o comentario no AndroidManifest).
 */
class TunnelKeepAliveService : android.app.Service() {

  companion object {
    private const val TAG = "TunnelKeepAlive"
    private const val CHANNEL_ID = "tunnelx_vpn_channel"
    private const val NOTIFICATION_ID = 1001

    /** Id separado: o aviso sobrevive ao servico que segurava a notificacao fixa. */
    private const val NOTIFICATION_ID_AVISO = 1002

    const val ACTION_START = "com.tunnelxapp.action.KEEPALIVE_START"
    const val ACTION_STOP_TUNNEL = "com.tunnelxapp.action.KEEPALIVE_STOP_TUNNEL"
    private const val EXTRA_TUNNEL_NAME = "extra_tunnel_name"

    /**
     * De quanto em quanto tempo perguntar ao servidor se o tunel ainda vale.
     *
     * Um minuto: perto o bastante para quem foi desconectado parar de usar a
     * rede quase na hora, e uma requisicao de algumas centenas de bytes por
     * minuto enquanto a VPN esta ligada nao pesa em bateria nem em dados.
     *
     * O vigia em JavaScript usa 30s, mas so com a tela aberta. Este aqui cobre
     * justamente o resto: app minimizado ou fora do recents.
     */
    private const val INTERVALO_CHECAGEM_MS = 60_000L

    /** Espera antes da PRIMEIRA checagem, para o tunel terminar de subir. */
    private const val ESPERA_INICIAL_MS = 20_000L

    /**
     * Prefixo dos tuneis que vieram da CONTA (ver models/Tunnel.ts).
     *
     * O vigia so manda derrubar o que a conta paga. Um .conf importado a mao
     * pelo usuario - por arquivo ou pelo QR de configuracao - nao pertence a
     * assinatura nenhuma: o servidor nunca soube dele, e uma assinatura vencida
     * ou uma sessao derrubada nao tem autoridade para desliga-lo.
     */
    private const val PREFIXO_DA_CONTA = "tunnelx_conn_"

    /**
     * Sem handshake por este tempo, o tunel e considerado morto.
     *
     * O WireGuard renova o handshake a cada ~2 minutos quando ha trafego, e o
     * PersistentKeepalive de 15s garante troca mesmo ocioso. Tres minutos sem
     * nenhum handshake nao e silencio normal: ou o servidor sumiu, ou o IP do
     * endpoint mudou, ou outro aparelho tomou o endpoint deste peer.
     */
    private const val HANDSHAKE_MORTO_MS = 180_000L

    /** Espera depois de subir antes de cobrar o primeiro handshake. */
    private const val GRACA_HANDSHAKE_MS = 45_000L

    /** Teto de reconexoes automaticas seguidas antes de desistir. */
    private const val MAX_RECONEXOES = 3

    /**
     * Sobe o servico. Chamado com o tunel ja UP e a partir de uma acao do usuario
     * com o app em primeiro plano - startForegroundService a partir do background
     * e recusado desde o Android 12.
     */
    fun start(ctx: Context, tunnelName: String?) {
      val intent = Intent(ctx, TunnelKeepAliveService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_TUNNEL_NAME, tunnelName)
      }
      try {
        val app = ctx.applicationContext
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          app.startForegroundService(intent)
        } else {
          app.startService(intent)
        }
      } catch (t: Throwable) {
        // Falhar aqui nao pode derrubar o tunel: sem o servico ele fica de pe do
        // mesmo jeito, so volta a ser vulneravel ao fim do processo.
        Log.w(TAG, "start: nao foi possivel subir o foreground service", t)
      }
    }

    fun stop(ctx: Context) {
      try {
        ctx.applicationContext.stopService(Intent(ctx, TunnelKeepAliveService::class.java))
      } catch (t: Throwable) {
        Log.w(TAG, "stop: stopService falhou", t)
      }
    }
  }

  /**
   * Vigia enquanto o servico existe.
   *
   * Thread propria, e nao um Handler no main looper: a verificacao e uma
   * chamada de rede bloqueante, e a thread principal do processo continua
   * servindo o React quando o app volta para a frente.
   */
  @Volatile private var vigiando = false
  private var vigia: Thread? = null

  /** Reconexoes automaticas seguidas sem que o handshake volte. */
  @Volatile private var reconexoes = 0

  /** Quando este servico subiu — base da graca do primeiro handshake. */
  @Volatile private var subiuEm = 0L

  private fun iniciarVigia() {
    if (vigiando) return
    vigiando = true

    vigia = Thread({
      try {
        Thread.sleep(ESPERA_INICIAL_MS)
      } catch (_: InterruptedException) {
        return@Thread
      }

      while (vigiando) {
        // O tunel pode ter caido por outro caminho enquanto dormiamos.
        if (!VpnManager.isUp()) {
          Log.i(TAG, "vigia: tunel ja esta fora, encerrando")
          return@Thread
        }

        // Tunel que nao veio da conta nao responde a ela. Nada a vigiar.
        val ativo = VpnManager.activeTunnelId()
        if (ativo == null || !ativo.startsWith(PREFIXO_DA_CONTA)) {
          Log.i(TAG, "vigia: tunel ativo nao pertence a conta (id=$ativo), encerrando")
          return@Thread
        }

        // Antes da sessao: o tunel esta VIVO?
        //
        // Esta checagem e local e barata (le estatisticas do proprio backend),
        // e cobre uma falha que a verificacao de sessao nao ve: o servidor
        // trocou de IP publico e o aparelho segue mandando UDP para o
        // endereco velho. A interface continua de pe, o aplicativo mostra
        // "conectado", e nao passa um byte.
        if (tunelMudo()) {
          if (reconexoes >= MAX_RECONEXOES) {
            Log.w(TAG, "vigia: $reconexoes reconexoes sem handshake, parando de tentar")
          } else {
            reconexoes++
            Log.w(TAG, "vigia: sem handshake ha $HANDSHAKE_MORTO_MS ms, reconectando ($reconexoes/$MAX_RECONEXOES)")
            try {
              VpnManager.reconnectBlocking(applicationContext)
            } catch (t: Throwable) {
              /*
               * A reconexao falhou e o usuario ficou SEM tunel.
               *
               * Quando o startBlocking falha, o teardown defensivo dele derruba
               * tambem este servico — e com ele a notificacao permanente que
               * dizia "TunnelX conectado". Sem avisar, o unico sinal seria a
               * notificacao sumindo sozinha, que ninguem lê como "sua VPN caiu".
               */
              Log.e(TAG, "vigia: reconexao falhou", t)
              avisarFalhaDeReconexao()
              return@Thread
            }
            // Da tempo de o handshake novo acontecer antes de reavaliar.
            try { Thread.sleep(GRACA_HANDSHAKE_MS) } catch (_: InterruptedException) { return@Thread }
            continue
          }
        } else {
          // Handshake fresco: o contador zera, senao tres quedas ao longo de
          // um dia inteiro somariam e desligariam o watchdog para sempre.
          reconexoes = 0
        }

        when (SessionGuard.verificar(applicationContext)) {
          SessionGuard.Resultado.NEGADO -> {
            Log.w(TAG, "vigia: servidor negou o acesso, derrubando o tunel")
            derrubarPorFaltaDeAcesso()
            return@Thread
          }
          // AUTORIZADO e DESCONHECIDO seguem iguais: so a negacao explicita
          // desliga. Ver o comentario em SessionGuard.Resultado.
          else -> Unit
        }

        try {
          Thread.sleep(INTERVALO_CHECAGEM_MS)
        } catch (_: InterruptedException) {
          return@Thread
        }
      }
    }, "tunnelx-session-guard").apply {
      isDaemon = true
      start()
    }
  }

  /**
   * O tunel esta de pe mas sem trocar handshake ha tempo demais?
   *
   * `-1` (nunca houve handshake) so conta como mudo depois da graca inicial:
   * um tunel recem-subido ainda nao trocou nada, e reconectar nesse momento
   * criaria um laco de subir-e-derrubar.
   */
  private fun tunelMudo(): Boolean {
    val quando = VpnManager.lastHandshakeMillis()

    if (quando <= 0L) {
      // Nunca houve handshake. So e sintoma se ja passou a graca desde que
      // este servico subiu — e o servico sobe junto com o tunel.
      return System.currentTimeMillis() - subiuEm > GRACA_HANDSHAKE_MS + HANDSHAKE_MORTO_MS
    }

    return System.currentTimeMillis() - quando > HANDSHAKE_MORTO_MS
  }

  private fun pararVigia() {
    vigiando = false
    vigia?.interrupt()
    vigia = null
  }

  /**
   * Corta o tunel porque o servidor deixou de autorizar este aparelho.
   *
   * Troca a notificacao ANTES do teardown: o teardown leva este servico junto
   * (stopBlocking chama TunnelKeepAliveService.stop), e sem o aviso o usuario
   * veria a VPN cair sem explicacao nenhuma - parecendo defeito, quando foi
   * exatamente o comportamento pedido.
   */
  private fun derrubarPorFaltaDeAcesso() {
    // Recheca na hora do corte: entre a resposta do servidor e este ponto o
    // usuario pode ter trocado para um tunel proprio, que nao deve cair junto.
    val ativo = VpnManager.activeTunnelId()
    if (ativo == null || !ativo.startsWith(PREFIXO_DA_CONTA)) {
      Log.i(TAG, "derrubarPorFaltaDeAcesso: tunel ativo mudou (id=$ativo), nao derruba")
      return
    }

    try {
      val nm = getSystemService(NotificationManager::class.java)
      nm?.notify(NOTIFICATION_ID_AVISO, buildNotificacaoDesconectado())
    } catch (t: Throwable) {
      Log.w(TAG, "nao foi possivel avisar sobre a desconexao", t)
    }

    // A sessao tambem deixa de valer neste aparelho: manter o token guardado
    // faria a proxima conexao tentar de novo com uma credencial ja recusada.
    try {
      SessionGuard.limpar(applicationContext)
    } catch (t: Throwable) {
      Log.w(TAG, "nao foi possivel limpar as credenciais", t)
    }

    val app = applicationContext
    VpnManager.submit {
      try {
        VpnManager.stopBlocking(app)
      } catch (t: Throwable) {
        Log.e(TAG, "falha ao derrubar o tunel apos negacao do servidor", t)
      }
    }
  }

  /** Diz ao usuario que a VPN caiu e nao voltou sozinha. */
  private fun avisarFalhaDeReconexao() {
    try {
      val nm = getSystemService(NotificationManager::class.java) ?: return
      ensureChannel()
      val abrirApp = PendingIntent.getActivity(
        this,
        3,
        Intent(this, MainActivity::class.java),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      nm.notify(
        NOTIFICATION_ID_AVISO,
        NotificationCompat.Builder(this, CHANNEL_ID)
          .setSmallIcon(R.mipmap.ic_launcher)
          .setContentTitle("VPN desconectada")
          .setContentText("Nao foi possivel reconectar sozinho.")
          .setStyle(
            NotificationCompat.BigTextStyle().bigText(
              "O tunel parou de responder e a reconexao automatica falhou. " +
                "Abra o TunnelX e ligue a conexao de novo."
            )
          )
          .setContentIntent(abrirApp)
          .setAutoCancel(true)
          .setPriority(NotificationCompat.PRIORITY_DEFAULT)
          .build()
      )
    } catch (t: Throwable) {
      Log.w(TAG, "nao foi possivel avisar sobre a falha de reconexao", t)
    }
  }

  private fun buildNotificacaoDesconectado(): Notification {
    ensureChannel()
    val abrirApp = PendingIntent.getActivity(
      this,
      2,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("VPN desconectada")
      .setContentText("Sua conta foi aberta em outro aparelho ou o acesso terminou.")
      .setStyle(
        NotificationCompat.BigTextStyle().bigText(
          "A VPN foi desligada porque este aparelho não está mais autorizado. " +
            "Abra o TunnelX e entre novamente para reconectar."
        )
      )
      .setContentIntent(abrirApp)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .build()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP_TUNNEL -> {
        // Botao "Desconectar" da notificacao: o mesmo teardown que a tela usa.
        Log.i(TAG, "onStartCommand: desconectar pedido pela notificacao")
        val app = applicationContext
        VpnManager.submit {
          try {
            VpnManager.stopBlocking(app)
          } catch (t: Throwable) {
            Log.e(TAG, "falha ao derrubar o tunel pela notificacao", t)
          }
        }
        // Quem chama stopSelf e o proprio stopBlocking, via TunnelKeepAliveService.stop.
        return START_NOT_STICKY
      }

      else -> {
        val nome = intent?.getStringExtra(EXTRA_TUNNEL_NAME)
        try {
          startForeground(NOTIFICATION_ID, buildNotification(nome))
          Log.i(TAG, "onStartCommand: foreground ativo, tunel=$nome")
          // A partir daqui o tunel sobrevive ao fechamento do app — e por isso
          // mesmo passa a precisar de alguem conferindo se ainda e autorizado,
          // e se ainda esta trocando handshake com o servidor.
          // `iniciarVigia` ja retorna cedo se a thread existe — o
          // startForegroundService do reconnect cai aqui de novo e nao deve
          // criar um segundo watchdog nem zerar o contador de tentativas no
          // meio de uma sequencia de reconexoes.
          if (!vigiando) {
            subiuEm = System.currentTimeMillis()
            reconexoes = 0
          }
          iniciarVigia()
        } catch (t: Throwable) {
          // Sem a notificacao nao ha protecao a oferecer - insistir deixaria um
          // servico invisivel de pe sem cumprir funcao nenhuma.
          Log.e(TAG, "onStartCommand: startForeground falhou", t)
          stopSelf()
        }
      }
    }

    // START_NOT_STICKY: se o processo morrer mesmo assim, o tunel ja se foi com
    // ele. Ressuscitar este servico sozinho so acenderia uma notificacao dizendo
    // "conectado" sem nada por tras - e uma VPN nao pode voltar sem o usuario
    // pedir (mesmo motivo registrado no AndroidManifest).
    return START_NOT_STICKY
  }

  private fun buildNotification(tunnelName: String?): Notification {
    ensureChannel()

    val abrirApp = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    val desconectar = PendingIntent.getService(
      this,
      1,
      Intent(this, TunnelKeepAliveService::class.java).setAction(ACTION_STOP_TUNNEL),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("TunnelX conectado")
      .setContentText(if (tunnelName.isNullOrBlank()) "Túnel ativo" else "Túnel $tunnelName ativo")
      .setContentIntent(abrirApp)
      .addAction(0, "Desconectar", desconectar)
      .setOngoing(true)
      .setShowWhen(false)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      // LOW e sem som: a notificacao fica no lugar o tempo todo da conexao.
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(NotificationManager::class.java) ?: return
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "TunnelX VPN", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Mostra que o túnel está ativo e permite desconectar."
        setShowBadge(false)
      }
    )
  }

  /**
   * O app saiu do recents.
   *
   * Nao derruba o tunel: e justamente o caso que este servico existe para
   * atravessar. Quem esta com a VPN de pe e fecha a tela espera continuar
   * conectado - a saida e o botao "Desconectar" da notificacao.
   */
  override fun onTaskRemoved(rootIntent: Intent?) {
    Log.i(TAG, "onTaskRemoved: app saiu do recents, tunel permanece ativo")
  }

  override fun onDestroy() {
    Log.i(TAG, "onDestroy: keep-alive encerrado")
    pararVigia()
    super.onDestroy()
  }
}
