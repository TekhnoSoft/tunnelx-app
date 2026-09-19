import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Clipboard,
  useWindowDimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  QrCode,
  Users,
  Clock,
  Copy,
  Check,
  Trash,
  ArrowLeft,
  UserPlus,
} from 'phosphor-react-native';
import {
  fetchShareOverview,
  createShare,
  revokeShare,
  type ShareOverview,
  type ApiShare,
  ApiError,
} from '../api/client';
import Button from './Button';
import { brand, colors, radius, spacing, type } from '../theme';

type Props = {
  connectionId: number;
  connectionName: string;
  /** Avisa a Home que as vagas mudaram, para o card refletir sem recarregar tudo. */
  onChanged?: () => void;
  onClose: () => void;
};

type Etapa = 'lista' | 'periodo' | 'qr';

/**
 * Compartilhar o túnel com a família.
 *
 * Três telas dentro de uma folha, porque são três momentos de uma coisa só:
 * ver quem já tem acesso, escolher o prazo do próximo, e mostrar o QR.
 *
 * O QR desenha o TOKEN que o servidor devolveu — nunca a configuração do
 * WireGuard. É a diferença entre um convite e uma chave: a configuração, uma
 * vez fotografada, vale para sempre e não há como pedi-la de volta. O token o
 * servidor confere a cada passo, aplica o prazo e corta quando o titular mandar.
 */
export default function ShareSheet({ connectionId, connectionName, onChanged, onClose }: Props) {
  const { width } = useWindowDimensions();

  const [etapa, setEtapa] = useState<Etapa>('lista');
  const [dados, setDados] = useState<ShareOverview | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [duracao, setDuracao] = useState<string>('30d');
  const [gerando, setGerando] = useState(false);
  const [convite, setConvite] = useState<{ payload: string; label: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setErro(null);
      const r = await fetchShareOverview(connectionId);
      setDados(r);
      // Pré-seleciona o que o servidor mandar no meio da lista em vez de fixar
      // uma chave no app: se as durações mudarem, isto continua válido.
      if (!r.durations.some(d => d.key === duracao)) {
        setDuracao(r.durations[Math.floor(r.durations.length / 2)]?.key || r.durations[0]?.key);
      }
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível carregar o compartilhamento.');
    } finally {
      setCarregando(false);
    }
  }, [connectionId, duracao]);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  const gerar = async () => {
    setGerando(true);
    try {
      const r = await createShare(connectionId, duracao);
      const label = dados?.durations.find(d => d.key === duracao)?.label || '';
      setConvite({ payload: r.qr_payload, label });
      setEtapa('qr');
      onChanged?.();
      carregar();
    } catch (e: any) {
      Alert.alert(
        e instanceof ApiError && e.status === 409 ? 'Sem vaga' : 'Não foi possível gerar',
        e?.message || 'Tente de novo.'
      );
    } finally {
      setGerando(false);
    }
  };

  const remover = (share: ApiShare) => {
    const quem = share.guest?.name || share.guest_label || 'este convite';
    Alert.alert(
      share.status === 'ACTIVE' ? 'Remover acesso' : 'Cancelar convite',
      share.status === 'ACTIVE'
        ? `${quem} deixará de usar este túnel. A vaga fica livre para outra pessoa.`
        : 'O QR deixa de funcionar e a vaga volta a ficar livre.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: share.status === 'ACTIVE' ? 'Remover' : 'Cancelar convite',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeShare(share.id);
              onChanged?.();
              carregar();
            } catch (e: any) {
              Alert.alert('Erro', e?.message || 'Não foi possível remover.');
            }
          },
        },
      ]
    );
  };

  const copiar = () => {
    if (!convite) return;
    Clipboard.setString(convite.payload);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  /* ------------------------------------------------------------------ carga -- */

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (erro || !dados) {
    return (
      <View style={styles.centro}>
        <Text style={styles.erro}>{erro || 'Erro ao carregar.'}</Text>
        <Button label="Tentar de novo" variant="ghost" onPress={carregar} style={styles.botao} />
      </View>
    );
  }

  /* --------------------------------------------------------------------- QR -- */

  if (etapa === 'qr' && convite) {
    // O QR precisa caber na folha e continuar legível de longe: a câmera do
    // outro aparelho vai ler isto da tela, não de papel.
    const lado = Math.min(width - spacing.xl * 4, 240);

    return (
      <View>
        <Cabecalho
          titulo="Mostre este QR"
          subtitulo={`Acesso de ${convite.label.toLowerCase()} · vale por ${dados.invite_ttl_minutes} min`}
          onVoltar={() => {
            setConvite(null);
            setEtapa('lista');
          }}
        />

        <View style={styles.molduraQr}>
          <QRCode value={convite.payload} size={lado} backgroundColor="#FFFFFF" color="#111827" />
        </View>

        <Text style={styles.instrucao}>
          No aparelho da outra pessoa, abra o TunnelX e toque em{' '}
          <Text style={styles.destaque}>Acesso provisionado</Text> na tela de entrada.
        </Text>

        <View style={styles.avisoCaixa}>
          <Clock size={15} color={colors.textMuted} weight="bold" />
          <Text style={styles.avisoTexto}>
            O convite serve para uma pessoa só e expira em {dados.invite_ttl_minutes} minutos se
            ninguém escanear. O prazo de {convite.label.toLowerCase()} começa a contar quando ela
            aceitar.
          </Text>
        </View>

        <Button
          label={copiado ? 'Link copiado' : 'Copiar link do convite'}
          variant={copiado ? 'success' : 'ghost'}
          onPress={copiar}
          icon={
            copiado ? (
              <Check size={17} color="#fff" weight="bold" />
            ) : (
              <Copy size={17} color={colors.primary} weight="bold" />
            )
          }
          style={styles.botao}
        />
        <Button label="Concluir" onPress={onClose} style={styles.botao} />
      </View>
    );
  }

  /* ---------------------------------------------------------------- período -- */

  if (etapa === 'periodo') {
    return (
      <View>
        <Cabecalho
          titulo="Por quanto tempo?"
          subtitulo="O prazo começa quando a pessoa aceitar, não agora."
          onVoltar={() => setEtapa('lista')}
        />

        <ScrollView style={styles.listaPeriodos} showsVerticalScrollIndicator={false}>
          {dados.durations.map(d => {
            const escolhido = d.key === duracao;
            return (
              <Pressable
                key={d.key}
                onPress={() => setDuracao(d.key)}
                style={({ pressed }) => [
                  styles.opcao,
                  escolhido && styles.opcaoEscolhida,
                  pressed && styles.pressionado,
                ]}
              >
                <View style={[styles.radio, escolhido && styles.radioAceso]}>
                  {escolhido ? <View style={styles.radioMiolo} /> : null}
                </View>
                <Text style={[styles.opcaoTexto, escolhido && styles.opcaoTextoEscolhido]}>
                  {d.label}
                </Text>
                {d.minutes === null ? (
                  <Text style={styles.opcaoNota}>não expira</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <Button
          label="Gerar QR do convite"
          onPress={gerar}
          loading={gerando}
          icon={<QrCode size={17} color="#fff" weight="bold" />}
          style={styles.botao}
        />
      </View>
    );
  }

  /* ----------------------------------------------------------------- lista -- */

  const { slots, shares } = dados;
  const semVaga = slots.free <= 0;

  return (
    <View>
      <Text style={styles.titulo}>Compartilhar túnel</Text>
      <Text style={styles.subtitulo} numberOfLines={1}>
        {connectionName}
      </Text>

      {/* Ocupação em números: é o que responde "posso convidar mais alguém?" */}
      <View style={styles.vagas}>
        <Users size={18} color={colors.greenInk} weight="duotone" />
        <Text style={styles.vagasTexto}>
          <Text style={styles.vagasNumero}>{slots.free}</Text>
          {slots.free === 1 ? ' vaga livre' : ' vagas livres'} de {slots.total}
        </Text>
        <Text style={styles.vagasNota}>você ocupa 1</Text>
      </View>

      {slots.total <= 1 ? (
        <View style={styles.avisoCaixa}>
          <Text style={styles.avisoTexto}>
            Seu plano é para uma pessoa. Para dividir o túnel com a família, troque para um plano
            com mais conexões.
          </Text>
        </View>
      ) : null}

      {shares.length ? (
        <ScrollView style={styles.listaPessoas} showsVerticalScrollIndicator={false}>
          {shares.map(s => (
            <View key={s.id} style={styles.pessoa}>
              <View style={styles.pessoaInfo}>
                <Text style={styles.pessoaNome} numberOfLines={1}>
                  {s.guest?.name || s.guest_label || 'Convite aguardando'}
                </Text>
                <Text style={styles.pessoaDetalhe} numberOfLines={1}>
                  {s.status === 'ACTIVE'
                    ? s.expires_text
                    : `Convite não usado · ${s.duration_label || ''}`}
                </Text>
              </View>
              <View style={[styles.selo, s.status === 'ACTIVE' ? styles.seloAtivo : styles.seloPendente]}>
                <Text
                  style={[
                    styles.seloTexto,
                    s.status === 'ACTIVE' ? styles.seloTextoAtivo : styles.seloTextoPendente,
                  ]}
                >
                  {s.status === 'ACTIVE' ? 'NO TÚNEL' : 'PENDENTE'}
                </Text>
              </View>
              <Pressable onPress={() => remover(s)} hitSlop={8} style={styles.lixeira}>
                <Trash size={17} color={colors.danger} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.vazio}>
          Ninguém usa este túnel além de você. Gere um convite e mostre o QR para quem vai entrar.
        </Text>
      )}

      <Button
        label={semVaga ? 'Sem vagas livres' : 'Convidar alguém'}
        onPress={() => setEtapa('periodo')}
        disabled={semVaga || slots.total <= 1}
        icon={<UserPlus size={17} color="#fff" weight="bold" />}
        style={styles.botao}
      />
    </View>
  );
}

function Cabecalho({
  titulo,
  subtitulo,
  onVoltar,
}: {
  titulo: string;
  subtitulo: string;
  onVoltar: () => void;
}) {
  return (
    <View style={styles.cabecalho}>
      <Pressable onPress={onVoltar} hitSlop={10} style={styles.voltar}>
        <ArrowLeft size={18} color={colors.textMuted} weight="bold" />
      </Pressable>
      <View style={styles.cabecalhoTexto}>
        <Text style={styles.titulo}>{titulo}</Text>
        <Text style={styles.subtitulo}>{subtitulo}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centro: { alignItems: 'center', paddingVertical: spacing.xxl },
  erro: { ...type.small, color: colors.danger, textAlign: 'center' },

  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  voltar: { paddingTop: 2 },
  cabecalhoTexto: { flex: 1 },

  titulo: { ...type.title, color: colors.text },
  subtitulo: { ...type.small, color: colors.textMuted, marginTop: 2 },

  vagas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.greenSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.green,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  vagasTexto: { ...type.small, color: colors.text, flex: 1 },
  vagasNumero: { ...type.heading, color: colors.greenInk },
  vagasNota: { ...type.tiny, color: colors.textMuted, fontWeight: '600' },

  listaPessoas: { maxHeight: 220, marginTop: spacing.md },
  pessoa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pessoaInfo: { flex: 1 },
  pessoaNome: { ...type.body, color: colors.text, fontWeight: '600' },
  pessoaDetalhe: { ...type.tiny, color: colors.textMuted, marginTop: 2 },
  lixeira: { padding: spacing.xs },

  selo: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  seloAtivo: { backgroundColor: '#FFFFFF', borderColor: colors.green },
  seloPendente: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  seloTexto: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  seloTextoAtivo: { color: colors.greenInk },
  seloTextoPendente: { color: colors.textMuted },

  vazio: {
    ...type.small,
    color: colors.textMuted,
    lineHeight: 20,
    marginTop: spacing.lg,
  },

  listaPeriodos: { maxHeight: 300, marginTop: spacing.lg },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  opcaoEscolhida: { backgroundColor: colors.greenSoft, borderColor: colors.green },
  pressionado: { opacity: 0.7 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioAceso: { borderColor: brand.green },
  radioMiolo: { width: 10, height: 10, borderRadius: 5, backgroundColor: brand.green },
  opcaoTexto: { ...type.body, color: colors.text, flex: 1 },
  opcaoTextoEscolhido: { fontWeight: '700' },
  opcaoNota: { ...type.tiny, color: colors.textMuted },

  molduraQr: {
    alignSelf: 'center',
    padding: spacing.lg,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginTop: spacing.xl,
  },
  instrucao: {
    ...type.small,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.lg,
  },
  destaque: { color: colors.greenInk, fontWeight: '700' },

  avisoCaixa: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  avisoTexto: { ...type.tiny, color: colors.textMuted, lineHeight: 17, flex: 1 },

  botao: { marginTop: spacing.md },
});
