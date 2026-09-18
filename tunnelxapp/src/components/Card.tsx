import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing, type } from '../theme';

type Props = {
  children: React.ReactNode;
  /** Rótulo em versalete no topo do card, nomeando a seção. */
  label?: string;
  accent?: string;
  style?: ViewStyle;
  padded?: boolean;
};

/**
 * Cartão branco — a superfície de conteúdo do app.
 *
 * É o mesmo card de antes (branco, cantos arredondados, elevação), com três
 * ajustes: a sombra virou difusa em vez do `elevation: 2` duro, ganhou uma
 * borda quase invisível para não sumir em tela de baixo brilho, e o rótulo da
 * seção passou a fazer parte do componente em vez de cada tela repetir um
 * `<Text style={styles.title}>`.
 */
export default function Card({ children, label, accent, style, padded = true }: Props) {
  return (
    <View style={[styles.card, padded && styles.padded, style]}>
      {label ? (
        <View style={styles.cabecalho}>
          {/* Traço colorido antes do rótulo: identifica a seção de relance
              (azul = interface, verde = conexão, violeta = pares). */}
          <View style={[styles.traco, accent ? { backgroundColor: accent } : null]} />
          <Text style={styles.label}>{label}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  padded: { padding: spacing.lg },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  traco: {
    width: 3,
    height: 12,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  label: { ...type.label, color: colors.textDim },
});
