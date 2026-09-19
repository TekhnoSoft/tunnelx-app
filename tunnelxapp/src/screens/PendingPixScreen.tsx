import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Clipboard,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QrCode, Copy, Check, ArrowsClockwise } from 'phosphor-react-native';
import { fetchSubscription, syncSubscription, cancelSubscription, type PendingPix } from '../api/client';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import { colors, metrics, radius, spacing, type } from '../theme';

type Props = {
  pix: PendingPix;
  /** O servidor confirmou o pagamento — o app pode seguir. */
  onLiberado: () => void;
  /** Desistiu deste Pix: a assinatura pendente é cancelada e volta aos planos. */
  onDesistir: () => void;
};

/**
 * Pix criado e ainda não pago.
 *
 * Existe porque fechar o app no meio do pagamento deixava o cliente sem saída:
 * a assinatura pendente bloqueia criar outra, e o QR da primeira tinha se
 * perdido na resposta que ninguém guardou. Aqui o mesmo código volta, buscado
 * da autorização no Asaas.
 */
export default function PendingPixScreen({ pix, onLiberado, onDesistir }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const m = metrics(width);

  const [copiado, setCopiado] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pagou pelo banco? O app percebe sozinho, sem precisar tocar em nada.
  useEffect(() => {
    timer.current = setInterval(async () => {
      try {
        const r = await fetchSubscription();
        if (r.access.allowed) onLiberado();
      } catch {}
    }, 6000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [onLiberado]);

  const copiar = () => {
    if (!pix.payload) return;
    Clipboard.setString(pix.payload);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const [semConfirmacao, setSemConfirmacao] = useState<string | null>(null);

  const verificar = async () => {
    setVerificando(true);
    setSemConfirmacao(null);
    try {
      // syncSubscription, e nao fetchSubscription: este pergunta ao ASAAS.
      // Reler o banco so repetiria o que o webhook (que pode nao ter chegado)
      // deixou la — era por isso que o botao parecia nao fazer nada.
      const r = await syncSubscription();
      if (r.access.allowed) onLiberado();
      else setSemConfirmacao(r.message || 'Ainda não consta pagamento confirmado.');
    } catch (e: any) {
      setSemConfirmacao(e?.message || 'Não foi possível verificar agora.');
    } finally {
      setVerificando(false);
    }
  };

  const desistir = async () => {
    setCancelando(true);
    try {
      await cancelSubscription();
    } catch {
      // Mesmo se o cancelamento falhar, devolve o usuário aos planos: ficar
      // preso nesta tela é pior que uma assinatura pendente no servidor.
    } finally {
      setCancelando(false);
      onDesistir();
    }
  };

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
        <View style={styles.topo}>
          <View style={styles.icone}>
            <QrCode size={30} color={colors.primary} weight="duotone" />
          </View>
          <Text style={styles.titulo}>Pagamento em aberto</Text>
          <Text style={styles.subtitulo}>
            Você já iniciou uma assinatura por Pix. Pague o código abaixo para ativá-la.
          </Text>
        </View>

        <Card label="Pague e autorize">
          {pix.encoded_image ? (
            <Image
              source={{ uri: `data:image/png;base64,${pix.encoded_image}` }}
              style={styles.qr}
              resizeMode="contain"
            />
          ) : null}

          {/* O Pix Automático precisa de autorização, não só de um pagamento:
              ao pagar este QR o cliente consente com o débito dos próximos
              ciclos. Sem dizer isso, ele acha que pagou um mês avulso. */}
          <Text style={styles.explica}>
            Ao pagar, você também autoriza no app do seu banco a cobrança automática dos próximos
            meses. Sem essa autorização a assinatura não fica ativa.
          </Text>

          {pix.payload ? (
            <Button
              label={copiado ? 'Código copiado' : 'Copiar código Pix'}
              variant={copiado ? 'success' : 'ghost'}
              onPress={copiar}
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

        {semConfirmacao ? <Text style={styles.semConfirmacao}>{semConfirmacao}</Text> : null}

        <Button
          label="Já paguei, verificar"
          onPress={verificar}
          loading={verificando}
          icon={<ArrowsClockwise size={17} color="#fff" weight="bold" />}
          style={styles.botao}
        />

        <Pressable onPress={desistir} disabled={cancelando} style={styles.desistir} hitSlop={8}>
          <Text style={styles.desistirTexto}>
            {cancelando ? 'Cancelando…' : 'Cancelar e escolher outro plano'}
          </Text>
        </Pressable>

        <Text style={styles.rodape}>Esta tela libera sozinha assim que o pagamento é confirmado.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  topo: { alignItems: 'center', marginBottom: spacing.xl },
  icone: {
    width: 68,
    height: 68,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  titulo: { ...type.title, color: colors.text, marginTop: spacing.lg },
  subtitulo: {
    ...type.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  qr: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  explica: { ...type.small, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.lg },
  botao: { marginTop: spacing.lg },
  semConfirmacao: {
    ...type.small,
    color: colors.warning,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 19,
  },
  desistir: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm },
  desistirTexto: { ...type.small, color: colors.textDim, fontWeight: '600' },
  rodape: {
    ...type.tiny,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.md,
    fontWeight: '500',
  },
});
