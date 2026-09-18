import React from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Aurora from './Aurora';
import { metrics } from '../theme';

type Props = {
  children: React.ReactNode;
  variant?: 'idle' | 'live';
  style?: ViewStyle;
  /**
   * Centraliza e limita a largura do conteúdo. Ligado por padrão: sem isso, no
   * tablet ou no celular deitado o formulário estica até virar uma linha de
   * texto de ponta a ponta, que é onde a leitura quebra.
   */
  constrain?: boolean;
};

/** Casca de todas as telas: aurora no fundo, conteúdo com largura sob controle. */
export default function Screen({ children, variant = 'idle', style, constrain = true }: Props) {
  const { width } = useWindowDimensions();
  const m = metrics(width);

  return (
    <View style={[styles.root, style]}>
      <Aurora variant={variant} />
      {constrain ? (
        <View style={styles.center}>
          <View style={{ flex: 1, width: '100%', maxWidth: m.content }}>{children}</View>
        </View>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center' },
});
