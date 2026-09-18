import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { QrCode } from 'phosphor-react-native';
import { parseWireGuardConf, toWireGuardConf } from '../utils/wgConfig';
import { upsertTunnel } from '../storage/tunnels';
import * as WireGuard from '../native/WireGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Screen from '../components/Screen';
import Button from '../components/Button';
import { colors, radius, spacing, type } from '../theme';

type Props = { navigation: any };

/** Cantos do visor: quatro L desenhados com bordas, sem imagem. */
function Canto({ style }: { style: object }) {
  return <View style={[styles.canto, style]} />;
}

export default function QRScanScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [handled, setHandled] = useState<boolean>(false);
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);
  const varredura = useRef(new Animated.Value(0)).current;

  const visor = Math.min(width * 0.68, 280);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      if (handled) return;
      const value = codes?.[0]?.value;
      if (!value) return;
      setHandled(true);
      onCode(value);
    },
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const status : any = await Camera.requestCameraPermission();
      if (!mounted) return;
      setHasPermission(status === 'authorized' || status === 'granted');
    })();
    return () => { mounted = false; };
  }, []);

  // Linha de varredura: diz que a câmera está lendo AGORA. Sem ela, um QR que
  // demora a ser reconhecido parece tela travada.
  useEffect(() => {
    const l = Animated.loop(
      Animated.timing(varredura, {
        toValue: 1,
        duration: 2200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    l.start();
    return () => l.stop();
  }, [varredura]);

  // With CodeScanner, we handle codes in onCodeScanned

  const onCode = useCallback(async (text: string) => {
    try {
      const tunnel = parseWireGuardConf(text);
      const next = await upsertTunnel(tunnel);
      const conf = toWireGuardConf(tunnel);
      await WireGuard.applyConfig({ id: tunnel.id, name: tunnel.name, conf });
      setIsActive(false);
      Alert.alert('QR lido', `Túnel "${tunnel.name}" importado.`);
      navigation.reset({ index: 0, routes: [{ name: 'Home', params: { initialTunnels: next } }] });
    } catch (e: any) {
      setHandled(false);
      Alert.alert('Falha ao importar do QR', e?.message || 'Erro desconhecido');
    }
  }, [navigation]);

  if (!hasPermission) {
    return (
      <Screen>
        <View style={styles.permissao}>
          <View style={styles.icone}>
            <QrCode size={30} color={colors.greenInk} weight="duotone" />
          </View>
          <Text style={styles.permissaoTitulo}>Permissão de câmera</Text>
          <Text style={styles.permissaoTexto}>
            A câmera é usada apenas para ler o QR com a configuração do túnel.
          </Text>
          <Button
            label="Permitir acesso"
            variant="success"
            style={styles.permissaoBotao}
            onPress={async () => {
              const status : any = await Camera.requestCameraPermission();
              setHasPermission(status === 'authorized' || status === 'granted');
            }}
          />
        </View>
      </Screen>
    );
  }

  if (!device) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.carregando}>Carregando câmera…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        codeScanner={codeScanner}
      />

      {/* Máscara: escurece tudo menos o visor. Quatro faixas em volta, porque o
          React Native não recorta um buraco numa View. */}
      <View style={styles.mascara} pointerEvents="none">
        <View style={styles.faixa} />
        <View style={styles.faixaMeio}>
          <View style={styles.faixa} />
          <View style={{ width: visor, height: visor }}>
            <Canto style={styles.cantoTE} />
            <Canto style={styles.cantoTD} />
            <Canto style={styles.cantoBE} />
            <Canto style={styles.cantoBD} />
            <Animated.View
              style={[
                styles.linha,
                {
                  transform: [
                    {
                      translateY: varredura.interpolate({
                        inputRange: [0, 1],
                        outputRange: [4, visor - 4],
                      }),
                    },
                  ],
                  opacity: varredura.interpolate({
                    inputRange: [0, 0.1, 0.9, 1],
                    outputRange: [0, 1, 1, 0],
                  }),
                },
              ]}
            />
          </View>
          <View style={styles.faixa} />
        </View>
        <View style={styles.faixa} />
      </View>

      <View style={[styles.overlay, { bottom: insets.bottom + spacing.xxl }]}>
        <Text style={styles.hint}>Aponte para o QR com a configuração</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Unica tela escura do app: a camera ocupa tudo e qualquer cromo claro
  // rouba contraste do que esta sendo enquadrado.
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  carregando: { ...type.body, color: colors.textMuted },

  mascara: { ...StyleSheet.absoluteFillObject },
  faixa: { flex: 1, backgroundColor: 'rgba(17,24,39,0.66)' },
  faixaMeio: { flexDirection: 'row' },

  canto: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: colors.green,
  },
  cantoTE: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: radius.md },
  cantoTD: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: radius.md },
  cantoBE: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: radius.md },
  cantoBD: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: radius.md },
  linha: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.green,
  },

  // a camera ocupa a tela toda (absoluteFill); quem precisa de inset e o overlay.
  // bottom vem do inline no JSX: insets.bottom + spacing.xxl
  overlay: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hint: {
    ...type.small,
    color: '#fff',
    backgroundColor: 'rgba(17,24,39,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },

  permissao: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  icone: {
    width: 68,
    height: 68,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.greenSoft,
    borderWidth: 1,
    borderColor: colors.green,
  },
  permissaoTitulo: { ...type.title, color: colors.text, marginTop: spacing.lg },
  permissaoTexto: {
    ...type.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  permissaoBotao: { alignSelf: 'stretch', marginTop: spacing.xl },
});
