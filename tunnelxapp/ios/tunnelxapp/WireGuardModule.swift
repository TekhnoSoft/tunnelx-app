import Foundation
import NetworkExtension
import WireGuardKit

@objc(WireGuardModule)
class WireGuardModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { return false }

  @objc(applyConfig:resolver:rejecter:)
  func applyConfig(params: [String: Any], resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guard let id = params["id"] as? String,
          let name = params["name"] as? String,
          let conf = params["conf"] as? String else {
      reject("EINVAL", "Missing parameters", nil)
      return
    }
    // Store conf for use by Network Extension (e.g., in UserDefaults/App Group)
    let defaults = UserDefaults.standard
    defaults.set(conf, forKey: "wg_\(id)_conf")
    resolve(nil)
  }

  @objc(start:resolver:rejecter:)
  func start(id: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    // NOTE: A Packet Tunnel Provider extension target is required to actually start the tunnel.
    // Here we attempt to find an existing NETunnelProviderManager and start it.
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      if let error = error {
        reject("EPREFS", "Failed to load tunnel managers", error)
        return
      }
      guard let manager = managers?.first else {
        reject("ENOTFOUND", "No tunnel provider configured. Add the Network Extension.", nil)
        return
      }
      do {
        try manager.connection.startVPNTunnel()
        resolve(nil)
      } catch {
        reject("ESTART", "Failed to start tunnel", error)
      }
    }
  }

  @objc(stop:resolver:rejecter:)
  func stop(id: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      if let error = error {
        reject("EPREFS", "Failed to load tunnel managers", error)
        return
      }
      guard let manager = managers?.first else {
        reject("ENOTFOUND", "No tunnel provider configured.", nil)
        return
      }
      manager.connection.stopVPNTunnel()
      resolve(nil)
    }
  }

  @objc(status:resolver:rejecter:)
  func status(id: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      if let error = error {
        reject("EPREFS", "Failed to load tunnel managers", error)
        return
      }
      guard let manager = managers?.first else {
        resolve("unknown")
        return
      }
      switch manager.connection.status {
      case .connected: resolve("up")
      case .connecting: resolve("up")
      case .reasserting: resolve("up")
      case .disconnected: resolve("down")
      case .disconnecting: resolve("down")
      @unknown default: resolve("unknown")
      }
    }
  }
}