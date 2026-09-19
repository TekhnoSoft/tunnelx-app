# wireguard-apple (vendorizado)

Copia de https://github.com/WireGuard/wireguard-apple (branch `master`).

## Por que esta aqui em vez de ser dependencia remota

1. O repositorio **nao publica podspec** — so `Package.swift`. As linhas
   `pod 'WireGuardKit'` / `pod 'WireGuardKitGo'` que existiam no Podfile deste
   projeto nunca poderiam ter funcionado.
2. Nenhuma **tag** (`1.0.x-yy`) contem `Package.swift`; elas versionam o app
   WireGuard, nao o pacote. Entao `exactVersion` tambem nao resolve.
3. O `Package.swift` do `master` declara `swift-tools-version:5.3` mas usa
   `.iOS(.v15)` / `.macOS(.v12)`, disponiveis so a partir da 5.5. O SPM do
   Xcode 27 rejeita com `'v15' is unavailable` e o build inteiro nao resolve.

## Alteracoes feitas

1. `Package.swift`, linha 1: `swift-tools-version:5.3` -> `5.9`.
   O manifesto usa `.iOS(.v15)`/`.macOS(.v12)`, que exigem 5.5+.
2. `Sources/WireGuardKitC/WireGuardKitC.h`: adicionado `#include <sys/types.h>`.
   O header redeclara `struct ctl_info`/`sockaddr_ctl` usando `u_int32_t`,
   `u_char` e `u_int16_t` sem incluir quem os declara. Funciona em build nao
   modular, mas o Xcode 26/27 compila com explicit modules e rejeita.

O restante e copia literal. Licenca original em `COPYING` (MIT).

## Atualizacao

Recopiar de `master` e reaplicar a mudanca da linha 1.
