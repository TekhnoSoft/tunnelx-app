import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { QrCode } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Screen from './Screen';
import Button from './Button';
import { colors, radius, spacing, type } from '../theme';

type Props = {
  /** Texto sob o visor. Diz o que se espera ler AGORA. */
  hint: string;
  /** Explicação usada na tela de permissão — muda conforme o que será lido. */
  motivoPermissao: string;
  /**
   * Chamado UMA vez por leitura.
   *
   * Devolver `true` mantém a câmera parada (o chamador assumiu o fluxo);
   * devolver `false` rearma o leitor, para um QR errado não travar a tela.
   */
  onCode: (valor: string) => Promise<boolean> | boolean;
};

/** Cantos do visor: quatro L desenhados com bordas, sem imagem. */
function Canto({ style }: { style: object }) {
  return <View style={[styles.canto, style]} />;
}

/**
 * Leitor de QR com visor.
 *
 * Vive num componente porque duas telas leem QR por motivos diferentes —
 * importar um .conf e aceitar um convite de acesso. O que muda entre elas é o
 * texto e o que fazer com o código; a câmera, a permissão, a máscara e a linha
 * de varredura são as mesmas, e mantê-las em dois lugares garantiria que só uma
 * receberia a próxima correção.
 */
export default function QrScanner({ hint, motivoPermissao, onCode }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [temPermissao, setTemPermissao] = useState(false);
  const [ativa, setAtiva] = useState(true);
  const varredura = useRef(new Animated.Value(0)).current;

  // Trava de reentrada: a câmera dispara o mesmo código várias vezes por
  // segundo enquanto ele estiver no quadro. Sem isto, um convite seria enviado
  // ao servidor dezenas de vezes antes da primeira resposta chegar.
  const lendo = useRef(false);

  const device = useCameraDevice('back');

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (lendo.current) return;
      const valor = codes?.[0]?.value;
      if (!valor) return;

      lendo.current = true;
      setAtiva(false);

      Promise.resolve(onCode(valor))
        .then((assumiu) => {
          if (!assumiu) {
            lendo.current = false;
            setAtiva(true);
          }
        })
        .catch(() => {
          lendo.current = false;
          setAtiva(true);
        });
    },
  });

  const pedirPermissao = useCallback(async () => {
    const status: any = await Camera.requestCameraPermission();
    setTemPermissao(status === 'authorized' || status === 'granted');
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const status: any = await Camera.requestCameraPermission();
      if (vivo) setTemPermissao(status === 'authorized' || status === 'granted');
    })();
    return () => {
      vivo = false;
    };
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

  if (!temPermissao) {
    return (
      <Screen>
        <View style={styles.permissao}>
          <View style={styles.icone}>
            <QrCode size={30} color={colors.greenInk} weight="duotone" />
          </View>
          <Text style={styles.permissaoTitulo}>Permissão de câmera</Text>
          <Text style={styles.permissaoTexto}>{motivoPermissao}</Text>
          <Button
            label="Permitir acesso"
            variant="success"
            style={styles.permissaoBotao}
            onPress={pedirPermissao}
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

  const visor = Math.min(width * 0.68, 280);

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={ativa}
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
        <Text style={styles.hint}>{hint}</Text>
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
