import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Clipboard,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarningCircle, Copy, Check, ArrowsClockwise } from 'phosphor-react-native';
import {
  fetchPendingPayment,
  fetchSubscription,
  type PendingPayment,
  type Access,
} from '../api/client';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import { colors, metrics, radius, spacing, type } from '../theme';

type Props = {
  access: Access;
  /** Servidor voltou a liberar — o app pode seguir. */
  onLiberado: () => void;
  onVerPlanos: () => void;
  onSair: () => void;
};

function formatarPreco(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Acesso bloqueado por falta de pagamento.
 *
 * Tela sem saída de propósito: não existe "continuar mesmo assim". O servidor
 * já recusa as conexões neste estado, então um botão de pular só levaria a uma
 * Home vazia com erro — pior que dizer a verdade aqui.
 */
export default function BlockedScreen({ access, onLiberado, onVerPlanos, onSair }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const m = metrics(width);

  const [cobranca, setCobranca] = useState<PendingPayment | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [verificando, setVerificando] = useState(false);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setCobranca(await fetchPendingPayment());
    } catch {
      // Sem cobrança em aberto (ex.: assinatura cancelada). A tela ainda vale:
      // o caminho então é escolher um plano.
      setCobranca(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Pagou pelo banco? O app percebe sozinho, sem precisar reabrir.
  useEffect(() => {
    timer.current = setInterval(async () => {
      try {
        const r = await fetchSubscription();
        if (r.access.allowed) onLiberado();
      } catch {}
    }, 8000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [onLiberado]);

  const verificarAgora = async () => {
    setVerificando(true);
    try {
      const r = await fetchSubscription();
      if (r.access.allowed) onLiberado();
      else await carregar();
    } catch {
    } finally {
      setVerificando(false);
    }
  };

  const copiar = () => {
    if (!cobranca?.pix?.payload) return;
    Clipboard.setString(cobranca.pix.payload);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: m.gutter,
            paddingTop: insets.top + spacing.xxl,
            paddingBottom: insets.bottom + spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topo}>
          <View style={styles.icone}>
            <WarningCircle size={32} color={colors.danger} weight="duotone" />
          </View>
          <Text style={styles.titulo}>Acesso bloqueado</Text>
          <Text style={styles.subtitulo}>
            {access.message || 'Regularize o pagamento para voltar a usar sua conexão.'}
          </Text>
        </View>

        {carregando ? (
          <View style={styles.centro}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : cobranca ? (
          <Card label="Cobrança em aberto">
            <View style={styles.linhaValor}>
              <Text style={styles.valorRotulo}>Valor</Text>
              <Text style={styles.valor}>{formatarPreco(cobranca.value)}</Text>
            </View>
            <View style={styles.linhaValor}>
              <Text style={styles.valorRotulo}>Vencimento</Text>
              <Text style={styles.vencimento}>{cobranca.due_date}</Text>
            </View>

            {cobranca.pix?.encoded_image ? (
              <>
                <Image
                  source={{ uri: `data:image/png;base64,${cobranca.pix.encoded_image}` }}
                  style={styles.qr}
                  resizeMode="contain"
                />
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
              </>
            ) : null}
          </Card>
        ) : (
          <Card>
            <Text style={styles.semCobranca}>
              Não encontramos uma cobrança em aberto. Escolha um plano para reativar seu acesso.
            </Text>
          </Card>
        )}

        <Button
          label="Já paguei, verificar"
          onPress={verificarAgora}
          loading={verificando}
          icon={<ArrowsClockwise size={17} color="#fff" weight="bold" />}
          style={styles.botao}
        />

        <Button label="Ver planos" variant="ghost" onPress={onVerPlanos} style={styles.botao} />

        <Pressable onPress={onSair} style={styles.sair} hitSlop={8}>
          <Text style={styles.sairTexto}>Sair da conta</Text>
        </Pressable>

        <Text style={styles.rodape}>
          Esta tela libera sozinha assim que o pagamento é confirmado.
        </Text>
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
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  titulo: { ...type.title, color: colors.text, marginTop: spacing.lg },
  subtitulo: {
    ...type.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },

  centro: { alignItems: 'center', paddingVertical: spacing.xl },

  linhaValor: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  valorRotulo: { ...type.small, color: colors.textMuted },
  valor: { ...type.title, color: colors.text },
  vencimento: { ...type.mono, color: colors.text },

  qr: {
    width: 200,
    height: 200,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.md,
    marginVertical: spacing.lg,
  },

  semCobranca: { ...type.small, color: colors.textMuted, lineHeight: 20 },

  botao: { marginTop: spacing.md },
  sair: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm },
  sairTexto: { ...type.small, color: colors.textDim, fontWeight: '600' },
  rodape: {
    ...type.tiny,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.md,
    fontWeight: '500',
  },
});
