import { Platform, type TextStyle } from 'react-native';

/**
 * Design system do TunnelX.
 *
 * Tema CLARO, como o app sempre foi — o que mudou foi a origem das cores. Antes
 * o primário era o azul padrão da Apple (#007AFF) e o verde o do iOS (#34C759):
 * cores de sistema, iguais às de qualquer app. Agora vêm do próprio logo, dele
 * extraídas: azul #1356C1 e verde #5CF463 sobre o cinza #F7F7F7 do fundo da
 * marca. É a mesma identidade de antes, só que própria.
 */

/** Cores lidas diretamente do logo.png — não são aproximações. */
export const brand = {
  blue: '#1356C1',
  green: '#5CF463',
  paper: '#F7F7F7',
} as const;

export const colors = {
  // Fundo do app = fundo do logo. Cards em branco puro sobem sobre ele, que é o
  // que dá a separação sem precisar de borda pesada.
  bg: brand.paper,
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3F7',

  border: '#E3E6ED',
  borderStrong: '#CFD5E2',

  // Escala de texto herdada do app anterior (#333/#666/#888), só encorpada no
  // topo: títulos em #111 ganham o contraste que #333 não dava.
  text: '#111827',
  textMuted: '#5B6478',
  textDim: '#8A93A6',

  primary: brand.blue,
  primaryDark: '#0E43A0',
  primarySoft: '#E8EFFC',

  /**
   * Verde da marca em dois pesos.
   *
   * O #5CF463 é claríssimo: excelente para preenchimento e indicador, ilegível
   * como texto sobre branco (contraste ~1.4:1). `greenInk` é o mesmo verde
   * rebaixado até passar em texto — sem ele, "Conectado" seria uma palavra que
   * some no sol.
   */
  green: brand.green,
  greenInk: '#0F7B17',
  greenSoft: '#E8FCEA',

  danger: '#D92D20',
  dangerSoft: '#FEECEA',
  warning: '#B45309',

  scrim: 'rgba(17,24,39,0.45)',
} as const;

/** Gradientes nomeados — sempre em pares [de, para], consumidos pelo SVG. */
export const gradients = {
  primary: [brand.blue, '#2E74E6'] as const,
  success: ['#17A52A', brand.green] as const,
  danger: ['#D92D20', '#F04438'] as const,
};

/** Escala de 4: qualquer espaçamento fora dela é acidente, não decisão. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** O app usava raio 8; mantido como `sm` e ampliado só onde a peça é maior. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Fonte monoespaçada para dado técnico — chave, IP, endpoint, senha gerada.
 *
 * Não é enfeite: são strings que o usuário confere caractere a caractere, e o
 * alinhamento de largura fixa é o que torna isso possível.
 */
export const monoFont = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const type = {
  display: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 } as TextStyle,
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 } as TextStyle,
  heading: { fontSize: 17, fontWeight: '700' } as TextStyle,
  body: { fontSize: 15, fontWeight: '500' } as TextStyle,
  small: { fontSize: 13, fontWeight: '500' } as TextStyle,
  tiny: { fontSize: 11, fontWeight: '600' } as TextStyle,
  /** Versaletes para rótulos de seção. */
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' } as TextStyle,
  mono: { fontFamily: monoFont, fontSize: 13 } as TextStyle,
};

/**
 * Sombras suaves.
 *
 * No claro a profundidade vem da sombra, não da borda — o oposto do escuro. Por
 * isso os cards têm sombra difusa e borda quase invisível: a borda só existe
 * para o card não sumir onde a sombra não pega, como em tela de baixo brilho.
 */
export const shadow = {
  card: {
    shadowColor: '#0B1A3A',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  floating: {
    shadowColor: '#0B1A3A',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
};

/**
 * Responsividade por largura real, não por "é tablet".
 *
 * `content` é o que impede a tela de virar uma linha de texto de 900px de
 * largura no tablet ou no celular deitado: o conteúdo para de crescer e passa a
 * centralizar.
 */
export function metrics(width: number) {
  const compact = width < 360;
  const wide = width >= 600;
  return {
    compact,
    wide,
    content: Math.min(width, 560),
    gutter: compact ? spacing.lg : wide ? spacing.xxl : spacing.xl,
    /** Diâmetro do orbe da Home: acompanha a tela sem encostar nas bordas. */
    orb: Math.min(wide ? 280 : width * 0.58, 280),
  };
}

export type Metrics = ReturnType<typeof metrics>;
