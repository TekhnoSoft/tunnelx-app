package com.tunnelxapp.wireguard

import android.os.ParcelFileDescriptor

interface WgEngine {
  fun start(tunPfd: ParcelFileDescriptor, confText: String): Boolean
  fun stop(): Boolean
}