import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
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
 * Bottom sheet arrastável, desenhado DENTRO da árvore da tela.
 *
 * Sem `<Modal>`, e esse é o ponto. O Modal do Android abre uma janela nativa
 * nova, e o primeiro toque depois que essa janela ganha foco é engolido pelo
 * sistema — por isso cada opção exigia dois toques: o primeiro só entregava o
 * foco à janela. Não era o gesto nem o Pressable; era a janela.
 *
 * Como uma View comum no topo da árvore, a folha vive na mesma janela do resto
 * do app: o toque chega direto no item, de primeira.
 *
 * O que o Modal dava de graça e agora é feito à mão:
 *   - fechar no botão voltar do Android  -> BackHandler
 *   - ficar por cima de todo o conteúdo  -> ser o último filho da tela + zIndex
 */
export default function BottomSheet({ visible, onClose, title, children }: Props) {
  const insets = useSafeAreaInsets();
  // `montado` sobrevive ao `visible` virar false: sem ele a folha sumiria no
  // mesmo frame e a animação de saída nunca seria vista.
  const [montado, setMontado] = useState(visible);

  const y = useRef(new Animated.Value(FORA)).current;
  // A altura vive em ref E em estado: a ref é o que o PanResponder lê (ele é
  // criado uma vez e não enxerga estado novo), o estado é o que faz a
  // interpolação do fundo ser recalculada depois da medição.
  const altura = useRef(0);
  const [alturaMedida, setAlturaMedida] = useState(0);
  const aberto = useRef(false);

  /*
   * useNativeDriver fica FALSE em todas as animacoes deste arquivo, de proposito.
   *
   * No Android a area de toque nao acompanha `transform: translateY` quando a
   * animacao roda no driver nativo: o transform e aplicado direto na view, sem
   * passar pela arvore de layout - que e justamente a arvore consultada no
   * hit-test. A folha aparecia no lugar certo e o alvo de toque ficava onde ela
   * comecou (fora da tela), por isso o primeiro toque em cada opcao se perdia.
   *
   * E aqui o driver nativo nao custava nada em troca: o arraste e feito por
   * PanResponder, que ja roda em JavaScript. Pagava-se o preco sem receber a
   * vantagem.
   */
  const abrir = useCallback(() => {
    y.setValue(altura.current || FORA);
    // Spring, e não timing: a folha chega com um peso que a curva linear não
    // tem. `damping` alto o bastante para não quicar — isto é uma gaveta, não
    // um brinquedo.
    Animated.spring(y, {
      toValue: 0,
      useNativeDriver: false,
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
        useNativeDriver: false,
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

  // Botão voltar do Android fecha a folha em vez de sair da tela — era o que o
  // onRequestClose do Modal fazia.
  useEffect(() => {
    if (!montado) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      fecharRef.current(true);
      return true; // consome o evento: a navegação não recua junto
    });
    return () => sub.remove();
  }, [montado]);

  const pan = useRef(
    PanResponder.create({
      // A faixa de arraste não tem nada clicável dentro, então o gesto pode ser
      // assumido já no toque: a folha gruda no dedo desde o primeiro pixel.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
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
            useNativeDriver: false,
            damping: 26,
            stiffness: 300,
            mass: 0.9,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(y, { toValue: 0, useNativeDriver: false, damping: 26, stiffness: 300 }).start();
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

  // Desmontada não deixa nada no caminho do toque da tela de baixo.
  if (!montado) return null;

  return (
    // collapsable={false}: o Android "achata" Views que julga sem efeito
    // visual, removendo-as da hierarquia nativa. A camada some da arvore e o
    // alvo de toque dos filhos vai junto - e uma das causas conhecidas de toque
    // perdido em sobreposicao. Aqui a otimizacao nao pode agir.
    <View style={styles.camada} collapsable={false}>
      <Animated.View style={[styles.backdrop, { opacity: opacidadeFundo }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => fechar(true)}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        />
      </Animated.View>

      <Animated.View
        collapsable={false}
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
      >
        {/*
          O gesto de arraste vive SÓ nesta faixa do topo — puxador e título.
          No container inteiro ele disputava o toque com os itens e precisava
          hesitar 6px antes de assumir; aqui não disputa com ninguém.
        */}
        <View style={styles.areaArraste} {...pan.panHandlers}>
          <View style={styles.puxador} />
          {title ? <Text style={styles.titulo}>{title}</Text> : null}
        </View>

        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Cobre a tela inteira e fica acima de tudo que veio antes na árvore.
  camada: { ...StyleSheet.absoluteFillObject, zIndex: 100, elevation: 100 },
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
  // Faixa de arraste: alvo generoso. O puxador tem 4px de altura, mas o dedo
  // precisa de bem mais — e esta é a única região que responde ao gesto.
  areaArraste: { alignSelf: 'stretch', paddingTop: spacing.sm, paddingBottom: spacing.md },
  puxador: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
  },
  titulo: { ...type.label, color: colors.textDim, marginTop: spacing.lg },
});
