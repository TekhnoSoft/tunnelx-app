import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { colors, radius, type } from '../theme';

export default function HeaderTitle() {
  return (
    <View style={styles.container}>
      <View style={styles.marca}>
        <Image source={require('../../logo.png')} style={styles.logo} />
      </View>
      <Text style={styles.title}>
        Tunnel<Text style={styles.x}>X</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center' },
  marca: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 22, height: 22, borderRadius: 4 },
  title: { ...type.heading, color: colors.text, marginLeft: 10, letterSpacing: 0.3 },
  x: { color: colors.greenInk },
});
