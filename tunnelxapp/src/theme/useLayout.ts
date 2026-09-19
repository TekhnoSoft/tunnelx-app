import { useEffect, useState } from 'react';
import { Keyboard, useWindowDimensions, type KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { metrics, spacing } from './index';

/**
 * Medidas de página para telas COM header.
 *
 * O header é transparente (ver App.tsx) para a aurora correr por baixo dele —
 * o preço é que o conteúdo começa em y=0, atrás do título. `paddingTop` é o que
 * devolve esse espaço; sem ele a primeira linha de cada tela nasce escondida.
 */
export function useLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const m = metrics(width);

  return {
    ...m,
    insets,
    headerHeight,
    /** Aplicar no contentContainerStyle de qualquer ScrollView/FlatList com header. */
    paddingTop: headerHeight + spacing.md,
    paddingBottom: insets.bottom + spacing.xl,
  };
}

/**
 * Quanto o teclado realmente cobre da tela, em pixels.
 *
 * Existe porque o caminho padrão não funciona nesta configuração: as telas
 * usavam `KeyboardAvoidingView` com `behavior={undefined}` no Android, contando
 * com o `windowSoftInputMode="adjustResize"` do manifesto. Só que o app roda com
 * `edgeToEdgeEnabled=true` — a janela desenha atrás das barras do sistema e o
 * adjustResize deixa de encolher a área útil. Resultado: o teclado subia por
 * cima dos campos e dos botões.
 *
 * A conta é `altura da janela - topo do teclado`, e ela se autocorrige: onde o
 * adjustResize FUNCIONA, a janela já vem menor e a sobreposição dá ~0, sem
 * empurrar nada duas vezes. Serve para Android e iOS com o mesmo código.
 */
export function useKeyboardOverlap(): number {
  const { height: alturaJanela } = useWindowDimensions();
  const [sobreposicao, setSobreposicao] = useState(0);

  useEffect(() => {
    const aoMostrar = (e: KeyboardEvent) => {
      // screenY é o topo do teclado em coordenadas de tela.
      const topoDoTeclado = e.endCoordinates?.screenY ?? alturaJanela;
      setSobreposicao(Math.max(0, alturaJanela - topoDoTeclado));
    };
    const aoEsconder = () => setSobreposicao(0);

    // `did` e não `will`: no Android só o `did` dispara, e é ele que traz a
    // altura final (o `will` do iOS chegaria antes da animação terminar).
    const s1 = Keyboard.addListener('keyboardDidShow', aoMostrar);
    const s2 = Keyboard.addListener('keyboardDidHide', aoEsconder);
    return () => {
      s1.remove();
      s2.remove();
    };
  }, [alturaJanela]);

  return sobreposicao;
}
