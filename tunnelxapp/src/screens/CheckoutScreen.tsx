import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Clipboard,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CreditCard, QrCode, Copy, ShieldCheck, Check } from 'phosphor-react-native';
import {
  subscribe,
  fetchSubscription,
  type ApiPlan,
  type SubscribeResult,
} from '../api/client';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import Field from '../components/Field';
import { colors, metrics, radius, spacing, type } from '../theme';
import { useKeyboardOverlap } from '../theme/useLayout';

type Props = {
  plano: ApiPlan;
  onVoltar: () => void;
  /** Pagamento confirmado pelo servidor — libera o app. */
  onAtivado: () => void;
};

type Forma = 'CREDIT_CARD' | 'PIX';

/** Número do cartão em grupos de 4, como está impresso nele. */
function mascaraCartao(v: string): string {
  return v.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function mascaraValidade(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
}

function formatarPreco(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function CheckoutScreen({ plano, onVoltar, onAtivado }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const m = metrics(width);
  const tecladoCobre = useKeyboardOverlap();

  const [forma, setForma] = useState<Forma>('CREDIT_CARD');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<SubscribeResult | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Cartão
  const [nome, setNome] = useState('');
  const [numero, setNumero] = useState('');
  const [validade, setValidade] = useState('');
  const [cvv, setCvv] = useState('');

  const digitosCartao = numero.replace(/\D/g, '');
  const [mes, ano] = validade.split('/');
  const cartaoCompleto =
    nome.trim().length > 2 &&
    digitosCartao.length >= 13 &&
    (mes?.length === 2) &&
    (ano?.length === 2) &&
    cvv.length >= 3;

  /**
   * Depois de enviar, o app pergunta ao servidor se o pagamento confirmou.
   *
   * Quem confirma é o webhook do Asaas, que chega quando chegar: no cartão
   * costuma ser em segundos, no Pix depois que a pessoa paga no banco. Por isso
   * a tela pergunta em vez de assumir — tratar a resposta do POST como "pago"
   * liberaria acesso para cartão que ainda vai ser recusado.
   */
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const pararDeChecar = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => pararDeChecar, [pararDeChecar]);

  const comecarAChecar = useCallback(() => {
    pararDeChecar();
    timer.current = setInterval(async () => {
      try {
        const r = await fetchSubscription();
        if (r.access.allowed) {
          pararDeChecar();
          onAtivado();
        }
      } catch {
        // Falha de rede numa checagem não interrompe: a próxima tenta de novo.
      }
    }, 4000);
  }, [onAtivado, pararDeChecar]);

  const enviar = async () => {
    setErro(null);
    setEnviando(true);
    try {
      const r = await subscribe(
        plano.id,
        forma,
        forma === 'CREDIT_CARD'
          ? {
              holderName: nome.trim(),
              number: digitosCartao,
              expiryMonth: mes,
              // O Asaas aceita o ano com 2 dígitos; mandar 4 evita ambiguidade.
              expiryYear: ano?.length === 2 ? `20${ano}` : ano,
              ccv: cvv,
            }
          : undefined
      );
      setResultado(r);
      comecarAChecar();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível concluir a assinatura.');
    } finally {
      setEnviando(false);
    }
  };

  const copiarPix = () => {
    if (!resultado?.pix?.payload) return;
    Clipboard.setString(resultado.pix.payload);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  // ---- Depois de enviar: aguardando confirmação --------------------------
  if (resultado) {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal: m.gutter, paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl + tecladoCobre },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.aguardando}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.aguardandoTitulo}>
              {resultado.billing_type === 'PIX' ? 'Aguardando o Pix' : 'Confirmando o pagamento'}
            </Text>
            <Text style={styles.aguardandoTexto}>{resultado.message}</Text>
          </View>

          {resultado.billing_type === 'PIX' && resultado.pix ? (
            <Card label="Pague e autorize">
              {resultado.pix.encoded_image ? (
                <Image
                  source={{ uri: `data:image/png;base64,${resultado.pix.encoded_image}` }}
                  style={styles.qr}
                  resizeMode="contain"
                />
              ) : null}

              {/* O Pix Automático precisa de uma autorização, não só de um
                  pagamento: ao pagar este QR o cliente consente com o débito
                  dos próximos ciclos. Sem dizer isso, ele acha que pagou um mês
                  avulso. */}
              <Text style={styles.pixExplica}>
                Ao pagar este Pix você também autoriza, no app do seu banco, a cobrança automática
                dos próximos meses. Sem essa autorização a assinatura não fica ativa.
              </Text>

              {resultado.pix.payload ? (
                <Button
                  label={copiado ? 'Código copiado' : 'Copiar código Pix'}
                  variant={copiado ? 'success' : 'ghost'}
                  onPress={copiarPix}
                  icon={
                    copiado ? (
                      <Check size={17} color="#fff" weight="bold" />
                    ) : (
                      <Copy size={17} color={colors.primary} weight="bold" />
                    )
                  }
                />
              ) : null}
            </Card>
          ) : null}

          <Text style={styles.rodapeAviso}>
            Esta tela libera sozinha assim que o pagamento é confirmado. Pode deixar aberta.
          </Text>
        </ScrollView>
      </Screen>
    );
  }

  // ---- Formulário --------------------------------------------------------
  return (
    <Screen>
      {/* Sem `behavior`: quem empurra o conteudo e o useKeyboardOverlap, que
          mede a sobreposicao real. Com 'padding' no iOS os dois somariam e o
          formulario subiria o dobro do necessario. */}
      <KeyboardAvoidingView style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal: m.gutter, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl + tecladoCobre },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={onVoltar} style={styles.voltar} hitSlop={8}>
            <ArrowLeft size={18} color={colors.textMuted} />
            <Text style={styles.voltarTexto}>Trocar de plano</Text>
          </Pressable>

          <Card label="Seu plano" style={styles.resumo}>
            <View style={styles.resumoLinha}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resumoNome}>{plano.name}</Text>
                <Text style={styles.resumoDetalhe}>
                  {plano.total_connections} {plano.total_connections === 1 ? 'conexão' : 'conexões'}
                </Text>
              </View>
              <Text style={styles.resumoPreco}>{formatarPreco(plano.price)}</Text>
            </View>
          </Card>

          <Text style={styles.secao}>Como você quer pagar</Text>

          <View style={styles.formas}>
            <OpcaoForma
              ativa={forma === 'CREDIT_CARD'}
              icone={<CreditCard size={20} color={forma === 'CREDIT_CARD' ? colors.primary : colors.textMuted} weight="duotone" />}
              titulo="Cartão"
              descricao="Débito automático todo mês"
              onPress={() => setForma('CREDIT_CARD')}
            />
            <OpcaoForma
              ativa={forma === 'PIX'}
              icone={<QrCode size={20} color={forma === 'PIX' ? colors.primary : colors.textMuted} weight="duotone" />}
              titulo="Pix automático"
              descricao="Você autoriza uma vez no banco"
              onPress={() => setForma('PIX')}
            />
          </View>

          {forma === 'CREDIT_CARD' ? (
            <Card label="Dados do cartão">
              <Field
                label="Nome impresso no cartão"
                value={nome}
                onChangeText={setNome}
                placeholder="Como está no cartão"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Field
                label="Número do cartão"
                value={numero}
                onChangeText={t => setNumero(mascaraCartao(t))}
                placeholder="0000 0000 0000 0000"
                keyboardType="number-pad"
                mono
                maxLength={23}
              />
              <View style={styles.linha}>
                <Field
                  label="Validade"
                  value={validade}
                  onChangeText={t => setValidade(mascaraValidade(t))}
                  placeholder="MM/AA"
                  keyboardType="number-pad"
                  mono
                  maxLength={5}
                  containerStyle={styles.meio}
                />
                <Field
                  label="CVV"
                  value={cvv}
                  onChangeText={t => setCvv(t.replace(/\D/g, '').slice(0, 4))}
                  placeholder="000"
                  keyboardType="number-pad"
                  mono
                  secret
                  maxLength={4}
                  containerStyle={styles.meio}
                />
              </View>

              <View style={styles.seguranca}>
                <ShieldCheck size={15} color={colors.greenInk} weight="duotone" />
                <Text style={styles.segurancaTexto}>
                  O número do cartão vai direto para o Asaas e não fica guardado no TunnelX.
                </Text>
              </View>
            </Card>
          ) : (
            <Card label="Pix automático">
              <Text style={styles.pixInfo}>
                Você paga um Pix agora e autoriza, no app do seu banco, a cobrança automática dos
                próximos meses. Não precisa lembrar de pagar todo mês — e dá para cancelar quando
                quiser, aqui mesmo.
              </Text>
            </Card>
          )}

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}

          <Button
            label={forma === 'PIX' ? 'Gerar Pix' : 'Assinar agora'}
            onPress={enviar}
            loading={enviando}
            disabled={forma === 'CREDIT_CARD' && !cartaoCompleto}
            style={styles.botao}
          />

          <Text style={styles.termos}>
            Assinatura de {formatarPreco(plano.price)} por mês, renovada automaticamente. Cancele
            quando quiser pelo app.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function OpcaoForma({
  ativa,
  icone,
  titulo,
  descricao,
  onPress,
}: {
  ativa: boolean;
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.forma, ativa && styles.formaAtiva, pressed && { opacity: 0.8 }]}
    >
      {icone}
      <Text style={[styles.formaTitulo, ativa && styles.formaTituloAtivo]}>{titulo}</Text>
      <Text style={styles.formaDescricao}>{descricao}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },

  voltar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  voltarTexto: { ...type.small, color: colors.textMuted, fontWeight: '600' },

  resumo: { marginBottom: spacing.xl },
  resumoLinha: { flexDirection: 'row', alignItems: 'center' },
  resumoNome: { ...type.heading, color: colors.text },
  resumoDetalhe: { ...type.tiny, color: colors.textMuted, marginTop: 2, fontWeight: '500' },
  resumoPreco: { ...type.title, color: colors.text },

  secao: { ...type.label, color: colors.textDim, marginBottom: spacing.md },
  formas: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  forma: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  formaAtiva: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  formaTitulo: { ...type.body, color: colors.text, marginTop: 4 },
  formaTituloAtivo: { color: colors.primary },
  formaDescricao: { ...type.tiny, color: colors.textMuted, fontWeight: '500', lineHeight: 15 },

  linha: { flexDirection: 'row', gap: spacing.md },
  meio: { flex: 1 },

  seguranca: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.xs },
  segurancaTexto: { ...type.tiny, color: colors.textMuted, flex: 1, lineHeight: 16, fontWeight: '500' },

  pixInfo: { ...type.small, color: colors.textMuted, lineHeight: 20 },

  erro: {
    ...type.small,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
  },

  botao: { marginTop: spacing.xl },
  termos: {
    ...type.tiny,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 17,
    fontWeight: '500',
  },

  aguardando: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  aguardandoTitulo: { ...type.title, color: colors.text },
  aguardandoTexto: { ...type.small, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  qr: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  pixExplica: { ...type.small, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.lg },

  rodapeAviso: {
    ...type.tiny,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.xl,
    fontWeight: '500',
  },
});
