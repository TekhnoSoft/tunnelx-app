import Foundation
import NetworkExtension
import os
import WireGuardKit

/// Packet Tunnel Provider do TunnelX.
///
/// Este e o processo que de fato fala WireGuard. O app **nao** encaminha
/// pacotes: ele apenas grava o `.conf` e pede ao iOS para subir esta extensao
/// via `NETunnelProviderManager`. Sem este alvo embarcado, `startVPNTunnel()`
/// falha com "IPC failed", que era o sintoma relatado.
///
/// O `.conf` chega por dois caminhos, nesta ordem:
///   1. `providerConfiguration["conf"]`, gravado pelo app ao salvar a config;
///   2. o App Group, que e o fallback quando o iOS reaproveita uma configuracao
///      antiga e o `providerConfiguration` vem vazio.
class PacketTunnelProvider: NEPacketTunnelProvider {

  private lazy var adapter: WireGuardAdapter = {
    WireGuardAdapter(with: self) { logLevel, message in
      os_log("%{public}s", log: Self.log, type: logLevel == .verbose ? .debug : .info, message)
    }
  }()

  private static let log = OSLog(subsystem: "com.tunnelxapp.vpn", category: "PacketTunnel")

  /// Precisa bater com o App Group configurado nos entitlements dos dois alvos.
  private static let appGroup = "group.com.tunnelxapp"

  override func startTunnel(
    options: [String: NSObject]?,
    completionHandler: @escaping (Error?) -> Void
  ) {
    guard let confText = resolveConfiguration() else {
      os_log("Nenhum .conf disponivel para iniciar o tunel", log: Self.log, type: .error)
      completionHandler(PacketTunnelError.missingConfiguration)
      return
    }

    guard let configuration = try? TunnelConfiguration(fromWgQuickConfig: confText) else {
      os_log("O .conf existe mas nao e um wg-quick valido", log: Self.log, type: .error)
      completionHandler(PacketTunnelError.invalidConfiguration)
      return
    }

    adapter.start(tunnelConfiguration: configuration) { adapterError in
      if let adapterError = adapterError {
        os_log("Falha ao subir o tunel: %{public}@",
               log: Self.log, type: .error, String(describing: adapterError))
        completionHandler(adapterError)
        return
      }
      os_log("Tunel ativo", log: Self.log, type: .info)
      completionHandler(nil)
    }
  }

  override func stopTunnel(
    with reason: NEProviderStopReason,
    completionHandler: @escaping () -> Void
  ) {
    os_log("Parando o tunel (motivo: %d)", log: Self.log, type: .info, reason.rawValue)
    adapter.stop { _ in
      completionHandler()
    }
  }

  /// Permite ao app consultar o handshake sem derrubar o tunel.
  override func handleAppMessage(
    _ messageData: Data,
    completionHandler: ((Data?) -> Void)?
  ) {
    guard let command = String(data: messageData, encoding: .utf8) else {
      completionHandler?(nil)
      return
    }

    switch command {
    case "stats":
      adapter.getRuntimeConfiguration { conf in
        completionHandler?(conf?.data(using: .utf8))
      }
    default:
      completionHandler?(nil)
    }
  }

  // MARK: - Origem da configuracao

  private func resolveConfiguration() -> String? {
    let proto = protocolConfiguration as? NETunnelProviderProtocol

    if let conf = proto?.providerConfiguration?["conf"] as? String, !conf.isEmpty {
      return conf
    }

    // Fallback via App Group: cobre o caso de uma configuracao ja salva nas
    // preferencias do iOS, cujo providerConfiguration nao foi reescrito.
    guard let id = proto?.providerConfiguration?["id"] as? String,
          let defaults = UserDefaults(suiteName: Self.appGroup) else {
      return nil
    }
    return defaults.string(forKey: "wg_\(id)_conf")
  }
}

enum PacketTunnelError: LocalizedError {
  case missingConfiguration
  case invalidConfiguration

  var errorDescription: String? {
    switch self {
    case .missingConfiguration:
      return "Nenhuma configuracao de tunel foi entregue a extensao."
    case .invalidConfiguration:
      return "A configuracao do tunel nao esta em formato wg-quick valido."
    }
  }
}
