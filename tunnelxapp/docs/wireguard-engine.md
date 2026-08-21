# WireGuard Engine (JNI) – libwg-go

Para ativar handshake/criptografia reais, o serviço carrega a biblioteca nativa `libwg-go.so` via `System.loadLibrary("wg-go")`.

## Onde colocar os .so

Coloque os binários em:

- `android/app/src/main/jniLibs/arm64-v8a/libwg-go.so`
- `android/app/src/main/jniLibs/armeabi-v7a/libwg-go.so` (opcional)
- `android/app/src/main/jniLibs/x86_64/libwg-go.so` (para emulador)

O Gradle já inclui `src/main/jniLibs` no APK. Após copiar, rode `npx react-native run-android`.

## Como obter `libwg-go.so`

- Compilar a partir do projeto WireGuard-go para Android, ou
- Usar artefatos pré‑compilados compatíveis com seu NDK/ABI.

Certifique-se de que o nome do arquivo é exatamente `libwg-go.so`.

## Logs de verificação

- Sucesso ao carregar: `Loaded libwg-go` (tag `WgEngineGo`)
- Falha/ausente: `libwg-go not loaded` ou `start: libwg-go missing`

## Fluxo no app

- Ao estabelecer o TUN via `.conf`, o serviço chama `wgEngine.start(tunPfd, confText)`.
- No teardown/parada, chama `wgEngine.stop()` antes de fechar o TUN.

Se o engine não iniciar, o serviço desmonta o TUN e emite status `disconnected`.