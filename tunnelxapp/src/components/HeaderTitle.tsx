import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';

export default function HeaderTitle() {
  return (
    <View style={styles.container}>
      <Image source={require('../../logo.png')} style={styles.logo} />
      <Text style={styles.title}>TunnelX</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
});