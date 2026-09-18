import { useWindowDimensions } from 'react-native';
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
