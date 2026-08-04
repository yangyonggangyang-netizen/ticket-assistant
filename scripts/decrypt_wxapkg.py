#!/usr/bin/env python3
"""Decrypt and unpack V1MMWX encrypted wxapkg files.
Algorithm:
- Bytes 0-5: "V1MMWX" magic
- Bytes 6-1029: AES-256-CBC encrypted (first 1023 bytes of original wxapkg)
- Bytes 1030+: XOR encrypted (remaining bytes of original wxapkg)
- AES key: PBKDF2(password=appid, salt="saltiest", iterations=1000, dklen=32, hash=SHA1)
- AES IV: "the iv: 16 bytes"
- XOR key: ord(appid[-2])
"""
import os
import sys
import struct
import hashlib

sys.path.insert(0, r"C:\Users\Administrator\.workbuddy\binaries\python\envs\default\Lib\site-packages")
from Crypto.Cipher import AES

APPID = "wx4fd7f63cb29a8891"
PKG_DIR = r"C:\Users\Administrator\AppData\Roaming\Tencent\xwechat\radium\users\2c80f4a9749009175ee4f0fe1697c2c5\applet\packages\wx4fd7f63cb29a8891\23"
OUTPUT_DIR = r"D:\巴蒂哥\2026-08-03-21-45-13\movie-ticket-desktop\wxapkg_unpacked"

wxapkg_files = ["__APP__.wxapkg", "_pagesA_.wxapkg", "_pagesB_.wxapkg", "_pagesC_.wxapkg"]

def decrypt_wxapkg(data, appid):
    """Decrypt V1MMWX encrypted wxapkg file."""
    if data[:6] != b'V1MMWX':
        raise ValueError("Not a V1MMWX encrypted file")
    
    # AES key derivation
    salt = b"saltiest"
    key = hashlib.pbkdf2_hmac('sha1', appid.encode('utf-8'), salt, 1000, 32)
    iv = b"the iv: 16 bytes"
    
    # AES-CBC decrypt first 1024 bytes (bytes 6-1029)
    aes_encrypted = data[6:1030]
    cipher = AES.new(key, AES.MODE_CBC, iv)
    aes_decrypted = cipher.decrypt(aes_encrypted)
    
    # Remove PKCS7 padding (last byte tells padding length)
    pad_len = aes_decrypted[-1]
    if 1 <= pad_len <= 16:
        aes_decrypted = aes_decrypted[:-pad_len]
    
    # XOR decrypt remaining bytes (bytes 1030+)
    xor_key = ord(appid[-2])  # second-to-last character of appid
    xor_encrypted = data[1030:]
    xor_decrypted = bytes(b ^ xor_key for b in xor_encrypted)
    
    # Concatenate: AES decrypted (first 1023 bytes) + XOR decrypted (rest)
    original = aes_decrypted + xor_decrypted
    return original

def unpack_wxapkg(data, output_dir):
    """Unpack a standard (decrypted) wxapkg file."""
    # Check for V1 format (magic: BE BA 01 00)
    if len(data) >= 4 and data[0:4] == b'\xbe\xba\x01\x00':
        print(f"  Format: V1 (magic: BE BA 01 00)")
        return unpack_v1(data, output_dir)
    
    # Check for V2 format (magic: BE followed by metadata)
    if len(data) >= 1 and data[0] == 0xBE:
        print(f"  Format: V2 (magic: BE)")
        return unpack_v2(data, output_dir)
    
    print(f"  Unknown format. First 4 bytes: {data[:4].hex()}")
    # Save raw for inspection
    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "_raw_decrypted.bin"), 'wb') as f:
        f.write(data)
    return

def unpack_v1(data, output_dir):
    """Unpack V1 format wxapkg."""
    # V1: [0-3] magic BE BA 01 00, [4-7] InfoLength, [8-11] DataLength
    info_length = struct.unpack('>I', data[4:8])[0]
    data_length = struct.unpack('>I', data[8:12])[0]
    print(f"  InfoLength: {info_length}, DataLength: {data_length}")
    
    # File table starts at byte 12
    pos = 12
    os.makedirs(output_dir, exist_ok=True)
    file_count = 0
    
    while pos < 12 + info_length:
        name_len = struct.unpack('>I', data[pos:pos+4])[0]
        pos += 4
        name = data[pos:pos+name_len].decode('utf-8', errors='replace')
        pos += name_len
        offset = struct.unpack('>I', data[pos:pos+4])[0]
        pos += 4
        size = struct.unpack('>I', data[pos:pos+4])[0]
        pos += 4
        
        # File data starts at 12 + info_length
        file_data = data[12 + info_length + offset : 12 + info_length + offset + size]
        
        # Strip leading / to avoid os.path.join treating it as absolute path
        clean_name = name.lstrip('/')
        out_path = os.path.join(output_dir, clean_name.replace('/', os.sep))
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, 'wb') as f:
            f.write(file_data)
        file_count += 1
    
    print(f"  Extracted {file_count} files")

def unpack_v2(data, output_dir):
    """Unpack V2 format wxapkg."""
    # V2: [0] 0xBE, [1-15] metadata, [16-17] FileCount (uint16 big-endian)
    file_count = struct.unpack('>H', data[16:18])[0]
    print(f"  FileCount: {file_count}")
    
    pos = 18
    os.makedirs(output_dir, exist_ok=True)
    
    for i in range(file_count):
        name_len = struct.unpack('>I', data[pos:pos+4])[0]
        pos += 4
        name = data[pos:pos+name_len].decode('utf-8', errors='replace')
        pos += name_len
        offset = struct.unpack('>I', data[pos:pos+4])[0]
        pos += 4
        size = struct.unpack('>I', data[pos:pos+4])[0]
        pos += 4
        
        file_data = data[offset:offset+size]
        
        # Strip leading / to avoid os.path.join treating it as absolute path
        clean_name = name.lstrip('/')
        out_path = os.path.join(output_dir, clean_name.replace('/', os.sep))
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, 'wb') as f:
            f.write(file_data)
    
    print(f"  Extracted {file_count} files")

# Process each wxapkg file
for fname in wxapkg_files:
    fpath = os.path.join(PKG_DIR, fname)
    pkg_name = fname.replace('.wxapkg', '').replace('__', 'app').strip('_')
    out_dir = os.path.join(OUTPUT_DIR, pkg_name)
    
    print(f"\n{'='*60}")
    print(f"Processing: {fname} -> {pkg_name}")
    
    if not os.path.exists(fpath):
        print(f"  [NOT FOUND]")
        continue
    
    with open(fpath, 'rb') as f:
        encrypted_data = f.read()
    
    print(f"  Encrypted size: {len(encrypted_data)} bytes")
    
    try:
        decrypted = decrypt_wxapkg(encrypted_data, APPID)
        print(f"  Decrypted size: {len(decrypted)} bytes")
        print(f"  First 8 bytes: {decrypted[:8].hex()}")
        
        unpack_wxapkg(decrypted, out_dir)
    except Exception as e:
        print(f"  Error: {e}")
        import traceback
        traceback.print_exc()

print(f"\n{'='*60}")
print("Done! Extracted files:")
for root, dirs, files in os.walk(OUTPUT_DIR):
    for f in files:
        relpath = os.path.relpath(os.path.join(root, f), OUTPUT_DIR)
        fsize = os.path.getsize(os.path.join(root, f))
        print(f"  {relpath} ({fsize} bytes)")
