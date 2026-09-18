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

    const val ACTION_START = "com.tunnelxapp.action.KEEPALIVE_START"
    const val ACTION_STOP_TUNNEL = "com.tunnelxapp.action.KEEPALIVE_STOP_TUNNEL"
    private const val EXTRA_TUNNEL_NAME = "extra_tunnel_name"

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
    super.onDestroy()
  }
}
