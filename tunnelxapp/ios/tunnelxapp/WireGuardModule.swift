import Foundation
import NetworkExtension
import React

/// Ponte entre o JS e o NetworkExtension do iOS.
///
/// Importante: este modulo NAO depende de WireGuardKit. Quem fala WireGuard de
/// fato e o Packet Tunnel Provider (uma *app extension* separada); o app apenas
/// cria/inicia/para a configuracao de VPN via `NETunnelProviderManager`.
/// Por isso aqui so entra o framework de sistema `NetworkExtension`.
@objc(WireGuardModule)
class WireGuardModule: RCTEventEmitter {

  /// Nome do evento consumido em `src/native/WireGuard.ts` (STATUS_EVENT).
  private static let statusEvent = "TunnelXVpnStatus"

  /// Bundle id da extensao Packet Tunnel Provider. Convencao: bundle do app +
  /// ".WireGuardExtension". Precisa bater com o alvo da extensao no Xcode.
  private var providerBundleIdentifier: String {
    let appBundleId = Bundle.main.bundleIdentifier ?? "com.tunnelx.app"
    return "\(appBundleId).WireGuardExtension"
  }

  private var listening = false
  private var currentTunnelId: String?

  /// Referencia FORTE ao manager.
  ///
  /// O iOS publica `.NEVPNStatusDidChange` a partir do `NEVPNConnection` do
  /// manager carregado. Enquanto o manager existia apenas como variavel local
  /// do closure de `loadAllFromPreferences`, ele era desalocado ao fim do
  /// closure e nenhuma notificacao chegava -- o observer existia, mas nada o
  /// alimentava. Sem esta referencia viva, o evento `TunnelXVpnStatus` nunca
  /// dispara por mudanca real de estado e a UI so muda por polling.
  private var manager: NETunnelProviderManager?

  // MARK: - Ciclo de vida do modulo

  override static func requiresMainQueueSetup() -> Bool { return false }

  override func supportedEvents() -> [String]! { return [WireGuardModule.statusEvent] }

  override func startObserving() {
    listening = true
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(vpnStatusDidChange(_:)),
      name: .NEVPNStatusDidChange,
      object: nil
    )
    // Carrega e RETEM o manager ja existente, para que o iOS tenha de onde
    // postar as notificacoes de status assim que o JS comeca a ouvir.
    retainExistingManager()
  }

  /// Guarda o manager provisionado, se houver, sem cria-lo.
  private func retainExistingManager(completion: (() -> Void)? = nil) {
    NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, _ in
      if let existing = managers?.first { self?.manager = existing }
      completion?()
    }
  }

  override func stopObserving() {
    listening = false
    NotificationCenter.default.removeObserver(self, name: .NEVPNStatusDidChange, object: nil)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  @objc private func vpnStatusDidChange(_ note: Notification) {
    guard let connection = note.object as? NEVPNConnection else { return }
    emit(state: Self.mapState(connection.status), message: nil)
  }

  private func emit(state: String, message: String?) {
    guard listening else { return }
    sendEvent(
      withName: WireGuardModule.statusEvent,
      body: [
        "state": state,
        "tunnelId": currentTunnelId as Any,
        "message": message as Any,
      ]
    )
  }

  /// O JS so conhece connected/disconnected/error.
  private static func mapState(_ status: NEVPNStatus) -> String {
    switch status {
    case .connected: return "connected"
    case .connecting, .reasserting: return "connected"
    case .disconnected, .disconnecting, .invalid: return "disconnected"
    @unknown default: return "disconnected"
    }
  }

  /// "up"/"down"/"unknown", que e o contrato de `status()` no JS.
  private static func mapUpDown(_ status: NEVPNStatus) -> String {
    switch status {
    case .connected, .connecting, .reasserting: return "up"
    case .disconnected, .disconnecting: return "down"
    case .invalid: return "unknown"
    @unknown default: return "unknown"
    }
  }

  // MARK: - Armazenamento da config

  /// App Group compartilhado com o Packet Tunnel Provider. Precisa bater com o
  /// valor nos entitlements dos dois alvos e com `PacketTunnelProvider.appGroup`.
  private static let appGroup = "group.com.tunnelxapp"

  /// Grava no App Group quando ele existe, e sempre tambem no padrao.
  ///
  /// A extensao roda em outro processo e nao enxerga o `UserDefaults.standard`
  /// do app -- so o suite do App Group e comum aos dois. O fallback cobre o
  /// periodo em que o App Group ainda nao foi provisionado no portal da Apple.
  private static func defaultsStores() -> [UserDefaults] {
    var stores = [UserDefaults.standard]
    if let shared = UserDefaults(suiteName: appGroup) {
      stores.insert(shared, at: 0)
    }
    return stores
  }

  private func confKey(_ id: String) -> String { return "wg_\(id)_conf" }

  private func storedConf(for id: String) -> String? {
    for store in Self.defaultsStores() {
      if let conf = store.string(forKey: confKey(id)), !conf.isEmpty {
        return conf
      }
    }
    return nil
  }

  // MARK: - Metodos expostos ao JS

  @objc(applyConfig:resolver:rejecter:)
  func applyConfig(
    params: [String: Any],
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let id = params["id"] as? String,
          let name = params["name"] as? String,
          let conf = params["conf"] as? String else {
      reject("EINVAL", "Missing parameters", nil)
      return
    }

    for store in Self.defaultsStores() {
      store.set(conf, forKey: confKey(id))
      store.set(name, forKey: "wg_\(id)_name")
    }
    currentTunnelId = id
    resolve(nil)
  }

  /// Carrega o manager existente ou cria um novo ja configurado com o `.conf`.
  ///
  /// Antes este modulo exigia que a VPN ja existisse nas preferencias, o que
  /// nunca acontecia porque nada a criava -- `start` falhava sempre com
  /// ENOTFOUND. Aqui a configuracao e provisionada sob demanda.
  private func loadOrCreateManager(
    id: String,
    completion: @escaping (Result<NETunnelProviderManager, NSError>) -> Void
  ) {
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      if let error = error as NSError? {
        completion(.failure(error))
        return
      }

      let manager = managers?.first ?? NETunnelProviderManager()

      guard let conf = self.storedConf(for: id) else {
        completion(.failure(NSError(
          domain: "WireGuardModule",
          code: 404,
          userInfo: [NSLocalizedDescriptionKey:
            "Nenhuma configuracao salva para o tunel \(id). Chame applyConfig antes de start."]
        )))
        return
      }

      let proto = NETunnelProviderProtocol()
      proto.providerBundleIdentifier = self.providerBundleIdentifier
      // O endpoint do peer serve de `serverAddress` (exibido nos Ajustes do iOS).
      proto.serverAddress = Self.endpoint(from: conf) ?? "WireGuard"
      proto.providerConfiguration = ["conf": conf, "id": id]

      manager.protocolConfiguration = proto
      manager.localizedDescription =
        Self.defaultsStores()
          .compactMap { $0.string(forKey: "wg_\(id)_name") }
          .first ?? "TunnelX"
      manager.isEnabled = true

      manager.saveToPreferences { saveError in
        if let saveError = saveError as NSError? {
          completion(.failure(saveError))
          return
        }
        // Recarrega: sem isso a conexao pode continuar apontando para a
        // configuracao antiga e `startVPNTunnel` lanca NEVPNErrorConfigurationInvalid.
        manager.loadFromPreferences { loadError in
          if let loadError = loadError as NSError? {
            completion(.failure(loadError))
            return
          }
          // Retem: e deste manager que saem as notificacoes de status.
          self.manager = manager
          completion(.success(manager))
        }
      }
    }
  }

  /// Extrai `Endpoint = host:porta` do texto do .conf.
  private static func endpoint(from conf: String) -> String? {
    for rawLine in conf.split(whereSeparator: { $0 == "\n" || $0 == "\r" }) {
      let line = rawLine.trimmingCharacters(in: .whitespaces)
      guard line.lowercased().hasPrefix("endpoint") else { continue }
      let parts = line.split(separator: "=", maxSplits: 1)
      guard parts.count == 2 else { continue }
      return parts[1].trimmingCharacters(in: .whitespaces)
    }
    return nil
  }

  /// O tunel so sobe se existir um Packet Tunnel Provider (.appex) embarcado.
  /// Sem ele o `startVPNTunnel()` falha com "IPC failed", que nao diz nada a
  /// quem esta usando o app -- por isso a checagem acontece antes.
  private func providerExtensionExists() -> Bool {
    guard let plugins = Bundle.main.builtInPlugInsURL,
          let contents = try? FileManager.default.contentsOfDirectory(
            at: plugins,
            includingPropertiesForKeys: nil
          ) else {
      return false
    }
    return contents.contains { $0.pathExtension == "appex" }
  }

  @objc(start:resolver:rejecter:)
  func start(
    id: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    currentTunnelId = id

    #if targetEnvironment(simulator)
    let simMessage = "O Simulador do iOS nao executa VPN: o iOS nao roda Packet "
      + "Tunnel Provider fora de um iPhone real. Teste em um dispositivo fisico."
    emit(state: "error", message: simMessage)
    reject("ESIMULATOR", simMessage, nil)
    #else
    guard providerExtensionExists() else {
      let message = "A extensao de VPN (Packet Tunnel Provider) nao esta embarcada "
        + "neste app, entao nao existe nada para o iOS iniciar -- e o que produz o "
        + "erro 'IPC failed'. E preciso adicionar o target da Network Extension e "
        + "habilitar a capability 'Network Extensions' no App ID."
      emit(state: "error", message: message)
      reject("ENOEXTENSION", message, nil)
      return
    }

    loadOrCreateManager(id: id) { result in
      switch result {
      case .failure(let error):
        self.emit(state: "error", message: error.localizedDescription)
        reject("ESTART", error.localizedDescription, error)
      case .success(let manager):
        do {
          try manager.connection.startVPNTunnel()
          resolve(nil)
        } catch {
          let nsError = error as NSError
          self.emit(state: "error", message: nsError.localizedDescription)
          reject("ESTART", "Falha ao iniciar o tunel: \(nsError.localizedDescription)", nsError)
        }
      }
    }
    #endif
  }

  @objc(stop:resolver:rejecter:)
  func stop(
    id: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      if let error = error as NSError? {
        reject("EPREFS", "Falha ao carregar as preferencias de VPN", error)
        return
      }
      guard let manager = managers?.first else {
        // Nada provisionado == nada de pe: o teardown ja esta satisfeito.
        self.emit(state: "disconnected", message: nil)
        resolve(nil)
        return
      }
      self.manager = manager
      manager.connection.stopVPNTunnel()
      resolve(nil)
    }
  }

  @objc(status:resolver:rejecter:)
  func status(
    id: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      if error != nil {
        resolve("unknown")
        return
      }
      guard let manager = managers?.first else {
        resolve("down")
        return
      }
      self.manager = manager
      resolve(Self.mapUpDown(manager.connection.status))
    }
  }

  @objc(isConnected:rejecter:)
  func isConnected(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      guard error == nil, let manager = managers?.first else {
        resolve(false)
        return
      }
      self.manager = manager
      resolve(manager.connection.status == .connected)
    }
  }

  @objc(getVpnState:rejecter:)
  func getVpnState(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      guard error == nil, let manager = managers?.first else {
        resolve(["connected": false, "tunnelId": self.currentTunnelId as Any])
        return
      }
      self.manager = manager
      let proto = manager.protocolConfiguration as? NETunnelProviderProtocol
      let id = proto?.providerConfiguration?["id"] as? String ?? self.currentTunnelId
      resolve([
        "connected": manager.connection.status == .connected,
        "tunnelId": id as Any,
      ])
    }
  }

  /// Bytes realmente trafegados, perguntados ao provider.
  ///
  /// A tela de detalhe mostrava um contador FABRICADO (somava 0,05 MiB/s
  /// enquanto estivesse ligado). Quem implementa o tunel e a extensao, e so ela
  /// sabe o volume real -- que vem do proprio WireGuard no formato uapi
  /// (`rx_bytes=`/`tx_bytes=`), somado sobre todos os peers.
  ///
  /// Resolve `null` quando nao ha sessao ativa: a tela deve mostrar traco, e
  /// nunca um numero inventado.
  @objc(getStats:resolver:rejecter:)
  func getStats(
    id: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let session = manager?.connection as? NETunnelProviderSession,
          session.status == .connected,
          let payload = "stats".data(using: .utf8) else {
      resolve(nil)
      return
    }

    do {
      try session.sendProviderMessage(payload) { response in
        guard let response = response,
              let texto = String(data: response, encoding: .utf8) else {
          resolve(nil)
          return
        }
        var rx: Int64 = 0
        var tx: Int64 = 0
        for linha in texto.split(whereSeparator: { $0 == "\n" || $0 == "\r" }) {
          let partes = linha.split(separator: "=", maxSplits: 1)
          guard partes.count == 2, let valor = Int64(partes[1].trimmingCharacters(in: .whitespaces)) else { continue }
          switch partes[0].trimmingCharacters(in: .whitespaces) {
          case "rx_bytes": rx += valor
          case "tx_bytes": tx += valor
          default: break
          }
        }
        resolve(["rxBytes": rx, "txBytes": tx])
      }
    } catch {
      resolve(nil)
    }
  }

  /// No Android isto abre o dialogo de consentimento de VPN. No iOS o consentimento
  /// acontece no `saveToPreferences` (dentro de `start`), entao aqui nada a fazer.
  @objc(prepareVpn:rejecter:)
  func prepareVpn(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(true)
  }
}
