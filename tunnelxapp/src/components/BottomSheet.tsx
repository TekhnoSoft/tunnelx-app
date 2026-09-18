import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow, spacing, type } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

/** Fora da tela enquanto a altura real não é medida — evita o flash no 1º frame. */
const FORA = 900;

/** Arrastou mais que isto da própria altura, fecha. */
const FRACAO_PARA_FECHAR = 0.3;

/** Ou jogou o dedo para baixo mais rápido que isto (px/ms). */
const VELOCIDADE_PARA_FECHAR = 0.7;

/**
 * Bottom sheet arrastável.
 *
 * Feito com `PanResponder` + `Animated`, ambos embutidos no React Native. A
 * alternativa pronta (@gorhom/bottom-sheet) traz reanimated e gesture-handler
 * junto: duas dependências nativas, plugin de Babel e rebuild — caro demais
 * para uma folha de três opções.
 *
 * O gesto segue o dedo em tempo real em vez de só disparar uma animação no fim.
 * É isso que separa uma folha moderna de um modal que sobe: o conteúdo fica
 * preso ao toque, e soltar no meio do caminho devolve ele ao lugar.
 */
export default function BottomSheet({ visible, onClose, title, children }: Props) {
  const insets = useSafeAreaInsets();
  // `montado` sobrevive ao `visible` virar false: sem ele o Modal desapareceria
  // no mesmo frame e a animação de saída nunca seria vista.
  const [montado, setMontado] = useState(visible);

  const y = useRef(new Animated.Value(FORA)).current;
  // A altura vive em ref E em estado: a ref é o que o PanResponder lê (ele é
  // criado uma vez e não enxerga estado novo), o estado é o que faz a
  // interpolação do fundo ser recalculada depois da medição.
  const altura = useRef(0);
  const [alturaMedida, setAlturaMedida] = useState(0);
  const aberto = useRef(false);

  const abrir = useCallback(() => {
    y.setValue(altura.current || FORA);
    // Spring, e não timing: a folha chega com um peso que a curva linear não
    // tem. `damping` alto o bastante para não quicar — isto é uma gaveta, não
    // um brinquedo.
    Animated.spring(y, {
      toValue: 0,
      useNativeDriver: true,
      damping: 24,
      stiffness: 260,
      mass: 0.9,
    }).start();
  }, [y]);

  const fechar = useCallback(
    (avisar: boolean) => {
      Animated.timing(y, {
        toValue: altura.current || FORA,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        aberto.current = false;
        setMontado(false);
        if (avisar) onClose();
      });
    },
    [onClose, y]
  );

  // O PanResponder é criado uma vez só; sem esta ref ele ficaria preso ao
  // `fechar` do primeiro render e chamaria um `onClose` velho.
  const fecharRef = useRef(fechar);
  useEffect(() => {
    fecharRef.current = fechar;
  }, [fechar]);

  useEffect(() => {
    if (visible) {
      setMontado(true);
    } else if (aberto.current) {
      fechar(false);
    }
  }, [visible, fechar]);

  const pan = useRef(
    PanResponder.create({
      // Só assume o gesto depois de 6px na vertical: abaixo disso o toque ainda
      // pertence aos botões da folha, que precisam continuar clicáveis.
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        // Para cima a folha resiste (divide por 4) em vez de travar seco. Um
        // limite duro dá a impressão de que o app engasgou.
        y.setValue(g.dy < 0 ? g.dy / 4 : g.dy);
      },
      onPanResponderRelease: (_, g) => {
        const longe = g.dy > (altura.current || FORA) * FRACAO_PARA_FECHAR;
        const rapido = g.vy > VELOCIDADE_PARA_FECHAR;
        // A velocidade conta junto com a distância: um lance curto e rápido é
        // uma intenção tão clara de fechar quanto arrastar a folha inteira.
        if (longe || rapido) {
          fecharRef.current(true);
        } else {
          Animated.spring(y, {
            toValue: 0,
            useNativeDriver: true,
            damping: 26,
            stiffness: 300,
            mass: 0.9,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 26, stiffness: 300 }).start();
      },
    })
  ).current;

  // O escurecimento acompanha o arraste: a folha na metade do caminho mostra
  // metade do fundo. Opacidade fixa entregaria o gesto pela metade.
  const opacidadeFundo = y.interpolate({
    inputRange: [0, alturaMedida || 400],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Modal
      visible={montado}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => fechar(true)}
    >
      <Animated.View style={[styles.backdrop, { opacity: opacidadeFundo }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => fechar(true)}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl, transform: [{ translateY: y }] }]}
        onLayout={e => {
          const h = e.nativeEvent.layout.height;
          altura.current = h;
          setAlturaMedida(h);
          if (!aberto.current) {
            aberto.current = true;
            abrir();
          }
        }}
        {...pan.panHandlers}
      >
        {/* Puxador: além de alça, é o que anuncia que a folha se arrasta. Sem
            ele o gesto existe mas ninguém descobre. */}
        <View style={styles.areaPuxador}>
          <View style={styles.puxador} />
        </View>

        {title ? <Text style={styles.titulo}>{title}</Text> : null}
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    ...shadow.floating,
  },
  // Área de toque generosa em volta do puxador: o alvo visual tem 4px de
  // altura, mas o dedo precisa de bem mais que isso.
  areaPuxador: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: spacing.sm },
  puxador: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
  },
  titulo: { ...type.label, color: colors.textDim, marginTop: spacing.sm, marginBottom: spacing.md },
});
