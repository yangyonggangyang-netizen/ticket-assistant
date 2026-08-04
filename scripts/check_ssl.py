"""Connect to IPs from netstat and check their SSL certificates."""
import ssl
import socket
import subprocess
import json

# IPs from netstat (WeChat connections)
ips_to_check = [
    ('101.226.144.240', 80),
    ('101.226.131.167', 80),
    ('180.101.242.227', 80),
    ('61.151.230.226', 80),
    # IPv6 addresses
    ('240e:978:d04:3002::13', 443),
    ('240e:e1:a800:121::26', 443),
    ('240e:ff:f100:5002::e', 8080),
    # Also check piaoxf.com IPs
    ('150.158.106.188', 443),  # film-api.piaoxf.com / film-yun.piaoxf.com
    ('117.68.24.87', 443),     # piaoxf.com (Tencent COS)
]

def check_ssl_cert(ip, port, timeout=5):
    """Check SSL certificate for a given IP:port."""
    try:
        # Create SSL context
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        # Connect and get cert
        sock = socket.create_connection((ip, port), timeout=timeout)
        ssock = ctx.wrap_socket(sock, server_hostname=ip)
        
        cert = ssock.getpeercert()
        cert_binary = ssock.getpeercert(binary_form=True)
        
        # Get certificate details
        subject = dict(x[0] for x in cert.get('subject', []))
        issuer = dict(x[0] for x in cert.get('issuer', []))
        san = cert.get('subjectAltName', [])
        
        ssock.close()
        sock.close()
        
        return {
            'subject': subject,
            'issuer': issuer,
            'san': san,
            'cert': cert
        }
    except Exception as e:
        return {'error': str(e)}

def check_http_response(ip, port, timeout=5):
    """Check HTTP response from IP."""
    try:
        sock = socket.create_connection((ip, port), timeout=timeout)
        request = f'GET / HTTP/1.1\r\nHost: {ip}\r\nUser-Agent: Mozilla/5.0\r\nConnection: close\r\n\r\n'
        sock.sendall(request.encode())
        
        response = b''
        while True:
            data = sock.recv(4096)
            if not data:
                break
            response += data
            if len(response) > 8192:
                break
        
        sock.close()
        
        # Parse response
        lines = response.decode('utf-8', errors='replace').split('\n')
        status_line = lines[0] if lines else ''
        
        # Look for Server header and other useful headers
        headers = {}
        for line in lines[1:]:
            if ':' in line:
                key, value = line.split(':', 1)
                headers[key.strip().lower()] = value.strip()
        
        return {
            'status': status_line,
            'headers': headers,
            'body_preview': response.decode('utf-8', errors='replace')[:500]
        }
    except Exception as e:
        return {'error': str(e)}

# 1. Check SSL certificates
print("=" * 80)
print("1. SSL Certificate Check")
print("=" * 80)

for ip, port in ips_to_check:
    print(f"\n  IP: {ip}:{port}")
    
    if port == 443:
        cert_info = check_ssl_cert(ip, port)
        if 'error' in cert_info:
            print(f"    SSL Error: {cert_info['error']}")
        else:
            print(f"    Subject: {cert_info.get('subject', {})}")
            print(f"    Issuer: {cert_info.get('issuer', {})}")
            san_list = cert_info.get('san', [])
            if san_list:
                print(f"    SAN (domains):")
                for san_type, san_value in san_list:
                    print(f"      {san_type}: {san_value}")
    else:
        # Try HTTP
        http_info = check_http_response(ip, port)
        if 'error' in http_info:
            print(f"    HTTP Error: {http_info['error']}")
        else:
            print(f"    HTTP Status: {http_info.get('status', '')}")
            server = http_info.get('headers', {}).get('server', '')
            if server:
                print(f"    Server: {server}")
            location = http_info.get('headers', {}).get('location', '')
            if location:
                print(f"    Location: {location}")

# 2. Also check port 443 for all IPs
print(f"\n{'='*80}")
print("2. Checking port 443 for all IPs")
print("=" * 80)

for ip, _ in ips_to_check:
    print(f"\n  IP: {ip}:443")
    cert_info = check_ssl_cert(ip, 443)
    if 'error' in cert_info:
        print(f"    SSL Error: {cert_info['error'][:100]}")
    else:
        subject = cert_info.get('subject', {})
        san_list = cert_info.get('san', [])
        if subject:
            print(f"    Subject CN: {subject.get('commonName', 'N/A')}")
        if san_list:
            print(f"    SAN domains:")
            for san_type, san_value in san_list:
                if san_type == 'DNS':
                    print(f"      {san_value}")

# 3. Also check piaoxf.com SSL cert
print(f"\n{'='*80}")
print("3. piaoxf.com SSL Certificate (for reference)")
print("=" * 80)

for domain in ['film-api.piaoxf.com', 'film-yun.piaoxf.com', 'piaoxf.com']:
    print(f"\n  Domain: {domain}")
    cert_info = check_ssl_cert(domain, 443)
    if 'error' in cert_info:
        print(f"    SSL Error: {cert_info['error'][:100]}")
    else:
        subject = cert_info.get('subject', {})
        san_list = cert_info.get('san', [])
        if subject:
            print(f"    Subject CN: {subject.get('commonName', 'N/A')}")
            print(f"    Subject O: {subject.get('organizationName', 'N/A')}")
        if san_list:
            print(f"    SAN domains:")
            for san_type, san_value in san_list:
                if san_type == 'DNS':
                    print(f"      {san_value}")
