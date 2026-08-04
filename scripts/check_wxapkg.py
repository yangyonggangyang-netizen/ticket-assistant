#!/usr/bin/env python3
"""Check wxapkg file headers and try to find wxid for decryption."""
import os
import struct

PKG_DIR = r"C:\Users\Administrator\AppData\Roaming\Tencent\xwechat\radium\users\2c80f4a9749009175ee4f0fe1697c2c5\applet\packages\wx4fd7f63cb29a8891\23"

wxapkg_files = ["__APP__.wxapkg", "_pagesA_.wxapkg", "_pagesB_.wxapkg", "_pagesC_.wxapkg"]

for fname in wxapkg_files:
    fpath = os.path.join(PKG_DIR, fname)
    print(f"\n{'='*50}")
    print(f"File: {fname}")
    if not os.path.exists(fpath):
        print("  [NOT FOUND]")
        continue
    fsize = os.path.getsize(fpath)
    print(f"  Size: {fsize} bytes ({fsize/1024:.1f} KB)")
    
    with open(fpath, 'rb') as f:
        header = f.read(32)
    
    print(f"  First 32 bytes (hex): {header.hex()}")
    print(f"  First 6 bytes (text): {header[:6]}")
    
    # Check if encrypted with V1MMWX
    if header[:6] == b'V1MMWX':
        print("  [ENCRYPTED] - V1MMWX header (WeChat encrypted wxapkg)")
        # The salt and encrypted data follow
        print(f"  Salt (bytes 6-10): {header[6:10].hex()}")
    elif header[:2] == b'BE':
        print("  [UNENCRYPTED] - Standard wxapkg format")
        # Parse wxapkg header
        first_mark = header[0]
        unknown_info = header[1:5]
        index_info = header[5:9]
        # Read more header info
        with open(fpath, 'rb') as f:
            data = f.read()
        first_mark = data[0]
        unknown_info = struct.unpack('>I', data[1:5])[0]
        index_info = struct.unpack('>I', data[5:9])[0]
        page_size = struct.unpack('>I', data[9:13])[0]
        print(f"  firstMark: {first_mark} (0x{first_mark:02x})")
        print(f"  unknownInfo: {unknown_info}")
        print(f"  indexInfoLength: {index_info}")
        print(f"  pageSize: {page_size}")
    else:
        print(f"  [UNKNOWN FORMAT] - Header doesn't match known patterns")
        # Check if it might be encrypted differently
        print(f"  Byte 0: 0x{header[0]:02x}")
        # Try to detect if it's raw encrypted data
        if header[0] == 0x00:
            print("  Starts with 0x00 - might be encrypted or different format")
