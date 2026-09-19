import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, WifiHigh, Users, ArrowRight, ArrowLeft, Package } from 'phosphor-react-native';
import { fetchPlans, type ApiPlan } from '../api/client';
import Screen from '../components/Screen';
import Button from '../components/Button';
import { colors, metrics, radius, spacing, type } from '../theme';

type Props = {
  /** Texto do servidor explicando por que esta tela apareceu (atraso, cancelamento…). */
  aviso?: string | null;
  onEscolher: (plano: ApiPlan) => void;
  onSair?: () => void;
  /**
   * Fecha a tela sem assinar.
   *
   * Só existe quando o cliente JÁ tem acesso por outro caminho — hoje, o
   * convidado que usa o túnel de um familiar. Para quem não tem acesso nenhum a
   * tela continua sem saída: um "voltar" ali levaria a uma Home vazia, porque o
   * servidor recusa as conexões sem assinatura.
   */
  onVoltar?: () => void;
  /** Título alternativo, para quem está aqui por vontade e não por bloqueio. */
  titulo?: string;
  subtitulo?: string;
};

/** 1024 MB vira "1 GB" — ninguém lê pacote de dados em megabyte. */
function formatarDados(mb: number): string {
  if (!mb) return '—';
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

function formatarPreco(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "Mensal" -> "/mês", para o preço não ficar solto. */
function sufixoDoCiclo(cycle: string): string {
  const c = String(cycle || '').toLowerCase();
  if (c.includes('anual')) return '/ano';
  if (c.includes('semestral')) return '/semestre';
  if (c.includes('trimestral')) return '/trimestre';
  if (c.includes('bimestral')) return '/bimestre';
  return '/mês';
}

export default function PlansScreen({
  aviso,
  onEscolher,
  onSair,
  onVoltar,
  titulo,
  subtitulo,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const m = metrics(width);

  const [planos, setPlanos] = useState<ApiPlan[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    setCarregando(true);
    try {
      setPlanos(await fetchPlans());
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível carregar os planos.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: m.gutter,
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {onVoltar ? (
          <Pressable onPress={onVoltar} hitSlop={10} style={styles.voltar}>
            <ArrowLeft size={18} color={colors.textMuted} weight="bold" />
            <Text style={styles.voltarTexto}>Voltar</Text>
          </Pressable>
        ) : null}

        <Text style={styles.titulo}>{titulo || 'Escolha seu plano'}</Text>
        <Text style={styles.subtitulo}>
          {subtitulo || 'Assinatura mensal, sem fidelidade. Você pode cancelar quando quiser.'}
        </Text>

        {aviso ? (
          <View style={styles.aviso}>
            <Text style={styles.avisoTexto}>{aviso}</Text>
          </View>
        ) : null}

        {carregando ? (
          <View style={styles.centro}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.carregandoTexto}>Carregando planos…</Text>
          </View>
        ) : erro ? (
          <View style={styles.centro}>
            <Text style={styles.erro}>{erro}</Text>
            <Button label="Tentar de novo" variant="ghost" onPress={carregar} style={styles.botaoErro} />
          </View>
        ) : planos.length === 0 ? (
          <View style={styles.centro}>
            <Text style={styles.carregandoTexto}>Nenhum plano disponível no momento.</Text>
          </View>
        ) : (
          planos.map((p, i) => (
            <CartaoPlano
              key={p.id}
              plano={p}
              // O primeiro é o mais barato (o servidor ordena por preço) e
              // recebe o destaque: é onde a maioria entra.
              destaque={i === 0 && planos.length > 1}
              onPress={() => onEscolher(p)}
            />
          ))
        )}

        {onSair ? (
          <Pressable onPress={onSair} style={styles.sair} hitSlop={8}>
            <Text style={styles.sairTexto}>Sair da conta</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function CartaoPlano({
  plano,
  destaque,
  onPress,
}: {
  plano: ApiPlan;
  destaque?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, destaque && styles.cardDestaque, pressed && styles.cardPress]}
    >
      {destaque ? (
        <View style={styles.selo}>
          <Text style={styles.seloTexto}>MAIS ESCOLHIDO</Text>
        </View>
      ) : null}

      <Text style={styles.nome}>{plano.name}</Text>
      {plano.description ? <Text style={styles.descricao}>{plano.description}</Text> : null}

      <View style={styles.linhaPreco}>
        <Text style={styles.preco}>{formatarPreco(plano.price)}</Text>
        <Text style={styles.ciclo}>{sufixoDoCiclo(plano.cycle)}</Text>
      </View>

      {/* Os dois números que decidem a compra ficam juntos e grandes. */}
      <View style={styles.numeros}>
        <View style={styles.numero}>
          <WifiHigh size={18} color={colors.primary} weight="duotone" />
          <Text style={styles.numeroValor}>{formatarDados(plano.dataLimit)}</Text>
          <Text style={styles.numeroRotulo}>de dados</Text>
        </View>
        <View style={styles.divisorVertical} />
        <View style={styles.numero}>
          <Users size={18} color={colors.primary} weight="duotone" />
          <Text style={styles.numeroValor}>{plano.total_connections}</Text>
          <Text style={styles.numeroRotulo}>
            {plano.total_connections === 1 ? 'conexão' : 'conexões'}
          </Text>
        </View>
      </View>

      <View style={styles.beneficios}>
        <Beneficio texto="Conexão protegida em todo o aparelho" />
        <Beneficio texto="Sem limite de velocidade" />
        <Beneficio texto="Cancele quando quiser" />
        {plano.benefits.map((b, i) => (
          <Beneficio key={i} texto={b.descricao || b.tipo} equipamento />
        ))}
      </View>

      <View style={styles.rodape}>
        <Text style={styles.escolher}>Escolher este plano</Text>
        <ArrowRight size={16} color={colors.primary} weight="bold" />
      </View>
    </Pressable>
  );
}

function Beneficio({ texto, equipamento }: { texto: string; equipamento?: boolean }) {
  return (
    <View style={styles.beneficio}>
      {equipamento ? (
        <Package size={14} color={colors.primary} weight="duotone" />
      ) : (
        <Check size={14} color={colors.greenInk} weight="bold" />
      )}
      <Text style={styles.beneficioTexto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  titulo: { ...type.display, fontSize: 28, color: colors.text },
  subtitulo: {
    ...type.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },

  voltar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  voltarTexto: { ...type.small, color: colors.textMuted, fontWeight: '600' },
  aviso: {
    backgroundColor: '#FEF3C7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  avisoTexto: { ...type.small, color: '#92400E', lineHeight: 19 },

  centro: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.md },
  carregandoTexto: { ...type.small, color: colors.textMuted },
  erro: { ...type.small, color: colors.danger, textAlign: 'center' },
  botaoErro: { alignSelf: 'stretch' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardDestaque: { borderColor: colors.primary, borderWidth: 2 },
  cardPress: { opacity: 0.85 },

  selo: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  seloTexto: { fontSize: 9, fontWeight: '800', color: colors.primary, letterSpacing: 0.8 },

  nome: { ...type.title, color: colors.text },
  descricao: { ...type.small, color: colors.textMuted, marginTop: 2, lineHeight: 19 },

  linhaPreco: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: spacing.md },
  preco: { ...type.display, fontSize: 30, color: colors.text },
  ciclo: { ...type.small, color: colors.textMuted, marginBottom: 5 },

  numeros: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  numero: { flex: 1, alignItems: 'center', gap: 2 },
  numeroValor: { ...type.heading, color: colors.text, marginTop: 2 },
  numeroRotulo: { ...type.tiny, color: colors.textMuted, fontWeight: '500' },
  divisorVertical: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },

  beneficios: { marginTop: spacing.lg, gap: spacing.sm },
  beneficio: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  beneficioTexto: { ...type.small, color: colors.textMuted, flex: 1 },

  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  escolher: { ...type.body, color: colors.primary, fontWeight: '700' },

  sair: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm },
  sairTexto: { ...type.small, color: colors.textDim, fontWeight: '600' },
});
