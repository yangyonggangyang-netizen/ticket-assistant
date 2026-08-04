#!/usr/bin/env python3
"""Extract readable strings from MMKV binary files to find Token and API data."""
import os
import re
import json

BASE = r"C:\Users\Administrator\AppData\Roaming\Tencent\xwechat\radium\users\2c80f4a9749009175ee4f0fe1697c2c5\applet\local\wx4fd7f63cb29a8891"

mmkv_files = [
    os.path.join(BASE, "usrmmkvstorage0", "wx4fd7f63cb29a8891"),
    os.path.join(BASE, "usrmmkvstorage1", "wx4fd7f63cb29a8891"),
    os.path.join(BASE, "mmkvadapterstorage", "wx4fd7f63cb29a8891"),
    os.path.join(BASE, "..", "globalmmkvstorage", "applet_global_storage"),
]

for fpath in mmkv_files:
    fpath = os.path.normpath(fpath)
    print(f"\n{'='*60}")
    print(f"File: {fpath}")
    if not os.path.exists(fpath):
        print("  [NOT FOUND]")
        continue
    fsize = os.path.getsize(fpath)
    print(f"  Size: {fsize} bytes")
    if fsize == 0:
        print("  [EMPTY]")
        continue
    with open(fpath, 'rb') as f:
        data = f.read()
    # Extract printable ASCII and UTF-8 strings (min length 4)
    strings = re.findall(rb'[\x20-\x7e\xe4-\xef][\x20-\x7e\x80-\xff]{3,}', data)
    print(f"  Found {len(strings)} strings")
    for s in strings:
        try:
            decoded = s.decode('utf-8', errors='ignore')
            if len(decoded) >= 4:
                print(f"    {decoded}")
        except:
            pass
