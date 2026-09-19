import Foundation
import UIKit
import UniformTypeIdentifiers
import React

/// Equivalente iOS do `FilePickerModule.kt` do Android.
///
/// Mesmo contrato do JS (`src/screens/ConfImportScreen.tsx`):
/// `FilePicker.pickConf()` resolve `{ name, uri, content }` ou rejeita com
/// `E_CANCELED` quando o usuario desiste.
@objc(FilePicker)
class FilePickerModule: NSObject {

  private var pendingResolve: RCTPromiseResolveBlock?
  private var pendingReject: RCTPromiseRejectBlock?
  /// O UIDocumentPickerViewController nao retem o delegate; sem isto o picker
  /// aparece e os callbacks nunca chegam.
  private var picker: UIDocumentPickerViewController?

  @objc static func requiresMainQueueSetup() -> Bool { return true }

  @objc(pickConf:rejecter:)
  func pickConf(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      if self.pendingResolve != nil {
        reject("E_ALREADY_PICKING", "Ja existe uma operacao de selecao em andamento", nil)
        return
      }

      guard let presenter = Self.topViewController() else {
        reject("E_NO_ACTIVITY", "Nenhuma tela disponivel para abrir o seletor", nil)
        return
      }

      self.pendingResolve = resolve
      self.pendingReject = reject

      // .conf nao tem UTI registrado no sistema, entao o filtro precisa ser
      // amplo (.item) -- senao o arquivo aparece esmaecido e nao selecionavel.
      let types: [UTType] = [.item, .text, .plainText, .data]
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
      picker.allowsMultipleSelection = false
      picker.delegate = self
      self.picker = picker

      presenter.present(picker, animated: true)
    }
  }

  private func finishWithError(_ code: String, _ message: String) {
    let reject = pendingReject
    pendingResolve = nil
    pendingReject = nil
    picker = nil
    reject?(code, message, nil)
  }

  private static func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
      ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first

    let root = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
      ?? scene?.windows.first?.rootViewController
    guard var top = root else { return nil }
    while let presented = top.presentedViewController {
      top = presented
    }
    return top
  }
}

extension FilePickerModule: UIDocumentPickerDelegate {

  func documentPicker(
    _ controller: UIDocumentPickerViewController,
    didPickDocumentsAt urls: [URL]
  ) {
    guard let url = urls.first else {
      finishWithError("E_NO_URI", "Nenhum arquivo selecionado")
      return
    }

    // Com `asCopy: true` o arquivo ja vem para a sandbox do app, mas manter o
    // escopo de seguranca e o que garante a leitura de provedores externos
    // (iCloud Drive, Google Drive, etc.).
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }

    do {
      let data = try Data(contentsOf: url)
      guard let content = String(data: data, encoding: .utf8)
              ?? String(data: data, encoding: .isoLatin1) else {
        finishWithError("E_READ_FAIL", "Arquivo nao esta em texto legivel")
        return
      }

      let resolve = pendingResolve
      pendingResolve = nil
      pendingReject = nil
      picker = nil

      resolve?([
        "name": url.lastPathComponent,
        "uri": url.absoluteString,
        "content": content,
      ])
    } catch {
      finishWithError("E_READ_FAIL", error.localizedDescription)
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finishWithError("E_CANCELED", "Selecao cancelada")
  }
}
