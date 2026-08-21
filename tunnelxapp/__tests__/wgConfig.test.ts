import { parseWireGuardConf, toWireGuardConf } from '../src/utils/wgConfig';

describe('wgConfig', () => {
  it('parses basic config', () => {
    const conf = `[Interface]
PrivateKey = AAAAA
Address = 10.0.0.1/32

[Peer]
PublicKey = BBBBB
Endpoint = 1.2.3.4:51820
AllowedIPs = 0.0.0.0/0`;

    const tunnel = parseWireGuardConf(conf);
    expect(tunnel.interface.privateKey).toBe('AAAAA');
    expect(tunnel.interface.addresses).toBe('10.0.0.1/32');
    expect(tunnel.peers).toHaveLength(1);
    expect(tunnel.peers[0].publicKey).toBe('BBBBB');
    expect(tunnel.peers[0].endpoint).toBe('1.2.3.4:51820');
  });

  it('parses config with BOM', () => {
    const conf = `\uFEFF[Interface]
PrivateKey = AAAAA`;
    const tunnel = parseWireGuardConf(conf);
    expect(tunnel.interface.privateKey).toBe('AAAAA');
  });

  it('parses config with leading spaces', () => {
    const conf = `
 [Interface] 
 PrivateKey = AAAAA
 `;
    const tunnel = parseWireGuardConf(conf);
    expect(tunnel.interface.privateKey).toBe('AAAAA');
  });

  it('parses config with spaces around equals', () => {
    const conf = `[Interface]
PrivateKey = AAAAA`;
    const tunnel = parseWireGuardConf(conf);
    expect(tunnel.interface.privateKey).toBe('AAAAA');
  });

  it('parses wg:// scheme', () => {
    // Encoded version of:
    // [Interface]
    // PrivateKey = WGKEY
    const raw = `[Interface]
PrivateKey = WGKEY`;
    const encoded = 'wg://' + encodeURIComponent(raw);
    
    const tunnel = parseWireGuardConf(encoded);
    expect(tunnel.interface.privateKey).toBe('WGKEY');
  });

  it('parses wg:// scheme with spaces', () => {
     const raw = `[Interface]
PrivateKey = WGKEY`;
    const encoded = '   wg://' + encodeURIComponent(raw) + '   ';
    
    const tunnel = parseWireGuardConf(encoded);
    expect(tunnel.interface.privateKey).toBe('WGKEY');
  });
});
