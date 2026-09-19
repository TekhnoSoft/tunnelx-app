import React from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, Alert } from 'react-native';
import { ShieldCheck, Eye, Prohibit, Lock } from 'phosphor-react-native';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import { colors, radius, spacing, type } from '../theme';
import { useLayout } from '../theme/useLayout';
import { URL_PRIVACIDADE } from '../config/legal';

/**
 * Declaração de dados exigida para apps de VPN.
 *
 * A diretriz 5.4 pede que o app declare, em tela, o que coleta e como usa
 * ANTES de qualquer ação de compra ou de uso do serviço — não vale só a
 * política de privacidade na ficha da App Store. Por isso esta tela é o
 * primeiro portão do roteamento, antes do login e antes das telas de plano.
 *
 * O texto precisa espelhar o que o app realmente faz. Se a coleta mudar,
 * mudam também `PrivacyInfo.xcprivacy`, o rótulo de privacidade na ficha e
 * esta tela — os três são conferidos pelo revisor e divergir reprova.
 */

type Props = {
  onAceitar: () => void;
};

function Item({
  icone,
  titulo,
  texto,
}: {
  icone: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <View style={styles.item}>
      <View style={styles.itemIcone}>{icone}</View>
      <View style={styles.itemTexto}>
        <Text style={styles.itemTitulo}>{titulo}</Text>
        <Text style={styles.itemCorpo}>{texto}</Text>
      </View>
    </View>
  );
}

export default function VpnDisclosureScreen({ onAceitar }: Props) {
  const m = useLayout();

  const abrirPolitica = async () => {
    try {
      await Linking.openURL(URL_PRIVACIDADE);
    } catch {
      Alert.alert('Não foi possível abrir', URL_PRIVACIDADE);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: m.gutter,
          /*
           * Esta tela roda com `headerShown: false`, e aí `useHeaderHeight()`
           * devolve 0 — o `paddingTop` do useLayout vira só um respiro e o
           * conteúdo nasce atrás do notch (o selo do topo ficava cortado).
           * Sem header, quem reserva o espaço é o inset da safe area.
           */
          paddingTop: (m.headerHeight || m.insets.top) + spacing.lg,
          paddingBottom: m.paddingBottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cabecalho}>
          <View style={styles.selo}>
            <ShieldCheck size={30} color={colors.primary} weight="duotone" />
          </View>
          <Text style={styles.titulo}>Antes de começar</Text>
          <Text style={styles.subtitulo}>
            O TunnelX cria um túnel VPN no seu aparelho. Veja o que isso
            significa para os seus dados.
          </Text>
        </View>

        <Card label="O que coletamos" style={styles.card}>
          <Item
            icone={<Eye size={18} color={colors.textMuted} weight="duotone" />}
            titulo="Dados de cadastro"
            texto="Nome, CPF, e-mail, WhatsApp e endereço. Servem para identificar sua conta, emitir a cobrança e dar suporte."
          />
          <Item
            icone={<Lock size={18} color={colors.textMuted} weight="duotone" />}
            titulo="Dados de pagamento"
            texto="Usados apenas para processar a assinatura. Não ficam guardados no aparelho."
          />
        </Card>

        <Card label="O que NÃO fazemos" accent={colors.green} style={styles.card}>
          <Item
            icone={<Prohibit size={18} color={colors.greenInk} weight="duotone" />}
            titulo="Não registramos sua navegação"
            texto="O tráfego que passa pelo túnel não é gravado, inspecionado nem armazenado."
          />
          <Item
            icone={<Prohibit size={18} color={colors.greenInk} weight="duotone" />}
            titulo="Não vendemos nem compartilhamos"
            texto="Seus dados não são vendidos, alugados nem repassados a terceiros para publicidade ou qualquer outro fim alheio ao serviço."
          />
        </Card>

        <Text style={styles.linkPolitica} onPress={abrirPolitica}>
          Ler a política de privacidade completa
        </Text>

        <Button label="Entendi e concordo" onPress={onAceitar} style={styles.botao} />

        <Text style={styles.rodape}>
          Ao continuar você concorda com a coleta descrita acima.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cabecalho: { alignItems: 'center', marginBottom: spacing.lg },
  selo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  titulo: { ...type.title, color: colors.text, textAlign: 'center' },
  subtitulo: {
    ...type.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  card: { marginBottom: spacing.md },
  item: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.sm },
  itemIcone: { width: 28, paddingTop: 2 },
  itemTexto: { flex: 1 },
  itemTitulo: { ...type.body,
    fontWeight: '700' as const, color: colors.text },
  itemCorpo: { ...type.small, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  linkPolitica: {
    ...type.body,
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  botao: { marginBottom: spacing.md },
  rodape: { ...type.small, color: colors.textDim, textAlign: 'center' },
});
