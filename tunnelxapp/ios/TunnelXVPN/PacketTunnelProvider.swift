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

    let configuration: TunnelConfiguration
    do {
      configuration = try TunnelConfiguration(fromWgQuickConfig: Self.sanitize(confText))
    } catch {
      // Engolir o erro com `try?` escondia exatamente qual chave derrubou o
      // parse -- e o sintoma era o tunel "conectar e cair" sem explicacao.
      os_log("Config invalida: %{public}@", log: Self.log, type: .error, String(describing: error))
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

  // MARK: - Saneamento do .conf

  /// Chaves que o parser do WireGuardKit aceita em cada secao.
  private static let interfaceKeys: Set<String> = ["privatekey", "listenport", "address", "dns", "mtu"]
  private static let peerKeys: Set<String> = ["publickey", "presharedkey", "allowedips", "endpoint", "persistentkeepalive"]

  /// Remove chaves que o parser rejeitaria, preservando o resto intacto.
  ///
  /// O app emite `Name = ...` dentro de [Interface] porque o servico do Android
  /// usa esse valor como titulo da sessao. O parser do WireGuardKit, porem,
  /// lanca `interfaceHasUnrecognizedKey` em qualquer chave fora da lista dele --
  /// entao TODO tunel falhava aqui, em qualquer configuracao. Tirar `Name` do
  /// gerador quebraria o Android, logo o filtro fica deste lado.
  ///
  /// Isso tambem destrava .conf de terceiros com chaves de wg-quick que nao se
  /// aplicam ao iOS (Table, PostUp, PreDown, SaveConfig, FwMark): sao hooks de
  /// shell, sem efeito dentro de uma Network Extension.
  static func sanitize(_ conf: String) -> String {
    var out: [String] = []
    var inInterface = false
    var inPeer = false
    var dropped: [String] = []

    for rawLine in conf.split(whereSeparator: { $0 == "\n" || $0 == "\r" }) {
      let line = String(rawLine)
      let trimmed = line.trimmingCharacters(in: .whitespaces)
      let withoutComment = trimmed.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)[0]
        .trimmingCharacters(in: .whitespaces)

      if withoutComment.lowercased() == "[interface]" {
        inInterface = true; inPeer = false; out.append(line); continue
      }
      if withoutComment.lowercased() == "[peer]" {
        inPeer = true; inInterface = false; out.append(line); continue
      }

      // Linha vazia, comentario puro ou sem '=' segue como esta.
      guard (inInterface || inPeer), withoutComment.contains("=") else {
        out.append(line); continue
      }

      let key = withoutComment.split(separator: "=", maxSplits: 1)[0]
        .trimmingCharacters(in: .whitespaces)
        .lowercased()
      let allowed = inInterface ? interfaceKeys : peerKeys
      if allowed.contains(key) {
        out.append(line)
      } else {
        dropped.append(key)
      }
    }

    if !dropped.isEmpty {
      os_log("Chaves ignoradas no .conf: %{public}@",
             log: log, type: .info, dropped.joined(separator: ", "))
    }
    return out.joined(separator: "\n")
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
