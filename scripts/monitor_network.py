#!/usr/bin/env python3
"""
Monitor WeChatAppEx.exe network connections in real-time.
Captures new connections and resolves IPs to domain names.
This does NOT set system proxy and will NOT break WeChat.
"""
import subprocess
import socket
import re
import time
import sys
from collections import defaultdict

def get_wechat_pids():
    """Get all WeChatAppEx.exe PIDs"""
    result = subprocess.run(
        ['tasklist', '/FI', 'IMAGENAME eq WeChatAppEx.exe', '/FO', 'CSV', '/NH'],
        capture_output=True, text=True, encoding='gbk', errors='replace'
    )
    pids = set()
    for line in result.stdout.strip().split('\n'):
        parts = line.strip('"').split('","')
        if len(parts) >= 2:
            pids.add(parts[1].strip('"'))
    return pids

def get_all_connections():
    """Get all ESTABLISHED connections with PIDs"""
    result = subprocess.run(
        ['netstat', '-ano'],
        capture_output=True, text=True, encoding='gbk', errors='replace'
    )
    connections = []
    for line in result.stdout.split('\n'):
        line = line.strip()
        if 'ESTABLISHED' not in line:
            continue
        parts = line.split()
        if len(parts) >= 5:
            remote = parts[2]
            pid = parts[-1]
            match = re.match(r'(\d+\.\d+\.\d+\.\d+):(\d+)', remote)
            if match:
                ip = match.group(1)
                port = match.group(2)
                connections.append((pid, ip, port))
    return connections

def resolve_ip(ip):
    """Try to resolve IP to hostname"""
    try:
        hostname = socket.gethostbyaddr(ip)
        return hostname[0]
    except:
        return None

def main():
    print("=" * 60)
    print("WeChat Mini-Program Network Monitor")
    print("=" * 60)
    print()
    print("This script monitors WeChatAppEx.exe network connections.")
    print("It does NOT set system proxy and will NOT break WeChat.")
    print()
    print("Please open the mini-program in WeChat and interact with it.")
    print("New connections will be shown below.")
    print()
    print("Press Ctrl+C to stop.")
    print("-" * 60)

    # Get initial connections
    wechat_pids = get_wechat_pids()
    print(f"Found {len(wechat_pids)} WeChatAppEx.exe processes")

    seen_connections = set()
    initial_conns = get_all_connections()
    for pid, ip, port in initial_conns:
        if pid in wechat_pids:
            seen_connections.add((pid, ip, port))

    # Also track ALL new connections (not just from WeChatAppEx)
    for pid, ip, port in initial_conns:
        seen_connections.add((pid, ip, port))

    print(f"Baseline: {len(seen_connections)} existing connections")
    print("-" * 60)
    print()

    resolved_cache = {}
    new_count = 0

    try:
        while True:
            current_conns = get_all_connections()
            wechat_pids = get_wechat_pids()
            
            for pid, ip, port in current_conns:
                key = (pid, ip, port)
                if key not in seen_connections:
                    seen_connections.add(key)
                    
                    # Check if it's from WeChat
                    is_wechat = pid in wechat_pids
                    
                    # Try to resolve
                    if ip not in resolved_cache:
                        resolved_cache[ip] = resolve_ip(ip)
                    hostname = resolved_cache[ip] or "N/A"
                    
                    # Skip localhost
                    if ip == '127.0.0.1':
                        continue
                    
                    timestamp = time.strftime('%H:%M:%S')
                    marker = "🔍 [WeChatAppEx]" if is_wechat else "  [Other]"
                    print(f"{timestamp} {marker} PID:{pid} -> {ip}:{port} ({hostname})")
                    new_count += 1
            
            time.sleep(0.5)
    except KeyboardInterrupt:
        print(f"\n\nStopped. Captured {new_count} new connections.")

if __name__ == '__main__':
    main()
