"""Capture all network connections from WeChat processes."""
import subprocess
import socket
import json
import sys

def run_cmd(cmd, encoding='utf-8'):
    """Run command and return output, handling encoding issues."""
    result = subprocess.run(cmd, capture_output=True)
    try:
        return result.stdout.decode(encoding, errors='replace')
    except:
        return result.stdout.decode('gbk', errors='replace')

def get_wechat_pids():
    """Get PIDs of Weixin.exe and WeChatAppEx.exe via tasklist"""
    output = run_cmd(['tasklist', '/FO', 'CSV', '/NH'], encoding='gbk')
    pids = {}
    for line in output.split('\n'):
        line = line.strip()
        if not line:
            continue
        # CSV format: "Name","PID","SessionName","Session#","MemUsage"
        parts = line.split('","')
        if len(parts) >= 2:
            name = parts[0].strip('"')
            try:
                pid = int(parts[1].strip('"'))
            except:
                continue
            if name in ('Weixin.exe', 'WeChatAppEx.exe'):
                pids[pid] = name
    return pids

def get_all_connections():
    """Get all connections via netstat"""
    output = run_cmd(['netstat', '-ano'], encoding='gbk')
    connections = []
    for line in output.split('\n'):
        line = line.strip()
        if not any(s in line for s in ['ESTABLISHED', 'TIME_WAIT', 'CLOSE_WAIT', 'SYN_SENT']):
            continue
        parts = line.split()
        if len(parts) >= 4:
            proto = parts[0]
            local = parts[1]
            foreign = parts[2]
            state = parts[3] if len(parts) > 4 else ''
            try:
                pid = int(parts[-1])
            except:
                pid = 0
            if ':' in foreign:
                ip, port = foreign.rsplit(':', 1)
            else:
                ip, port = foreign, ''
            connections.append({
                'proto': proto,
                'local': local,
                'foreign': foreign,
                'ip': ip,
                'port': port,
                'state': state,
                'pid': pid
            })
    return connections

def resolve_hostname(ip):
    """Try reverse DNS lookup"""
    if ip in ('127.0.0.1', '0.0.0.0', '::1', 'localhost'):
        return 'localhost'
    try:
        parts = ip.split('.')
        if len(parts) == 4:
            first = int(parts[0])
            if first == 10 or (first == 172 and 16 <= int(parts[1]) <= 31) or (first == 192 and int(parts[1]) == 168):
                return f'internal({ip})'
    except:
        pass
    try:
        hostname = socket.gethostbyaddr(ip)
        return hostname[0]
    except:
        return ip

def main():
    print("=" * 80)
    print("WeChat Network Connection Capture")
    print("=" * 80)

    wechat_pids = get_wechat_pids()
    print(f"\nFound {len(wechat_pids)} WeChat processes:")
    for pid, name in sorted(wechat_pids.items()):
        print(f"  PID {pid}: {name}")

    all_conns = get_all_connections()
    wechat_conns = [c for c in all_conns if c['pid'] in wechat_pids]

    print(f"\nTotal connections: {len(all_conns)}")
    print(f"WeChat connections: {len(wechat_conns)}")

    # Group by remote IP and resolve
    seen_ips = {}
    for c in wechat_conns:
        ip = c['ip']
        if ip not in seen_ips:
            seen_ips[ip] = []
        seen_ips[ip].append(c)

    print(f"\n{'=' * 80}")
    print(f"WeChat Remote Connections (unique IPs: {len(seen_ips)})")
    print(f"{'=' * 80}")

    for ip, conns in sorted(seen_ips.items()):
        hostname = resolve_hostname(ip)
        process_name = wechat_pids.get(conns[0]['pid'], 'unknown')
        ports = sorted(set(c['port'] for c in conns))
        states = sorted(set(c['state'] for c in conns))
        print(f"\n  IP: {ip}")
        print(f"  Hostname: {hostname}")
        print(f"  Process: {process_name} (PID {conns[0]['pid']})")
        print(f"  Ports: {', '.join(ports)}")
        print(f"  States: {', '.join(states)}")
        print(f"  Connections: {len(conns)}")

    # Highlight non-internal IPs with resolved hostnames
    print(f"\n{'=' * 80}")
    print("External WeChat connections (resolved hostnames):")
    print(f"{'=' * 80}")
    for ip, conns in sorted(seen_ips.items()):
        hostname = resolve_hostname(ip)
        if hostname != ip and 'internal' not in hostname and hostname != 'localhost':
            print(f"  {ip:20s} -> {hostname}")

if __name__ == '__main__':
    main()
