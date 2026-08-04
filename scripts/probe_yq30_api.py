#!/usr/bin/env python3
"""Probe the yq30 API to verify connectivity and test login methods."""
import requests
import json
import sys

BASE_URL = "https://860753002.api.yq30.com/jeecg-boot"

HEADERS = {
    "X-Requested-With": "XMLHttpRequest",
    "Access-Control-Max-Age": "86400",
    "Accept": "application/json",
    "Content-Type": "application/json; charset=UTF-8",
    "checktoken": "0",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 MicroMessenger/8.0.49"
}

def probe_endpoint(method, path, data=None, desc=""):
    """Probe an API endpoint and print the result."""
    url = BASE_URL + path
    print(f"\n{'='*60}")
    print(f"[{method}] {path}")
    print(f"Description: {desc}")
    print(f"URL: {url}")
    if data:
        print(f"Data: {json.dumps(data, ensure_ascii=False)}")
    
    try:
        if method == "GET":
            resp = requests.get(url, params=data, headers=HEADERS, timeout=10, verify=True)
        else:
            resp = requests.post(url, json=data, headers=HEADERS, timeout=10, verify=True)
        
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:500]}")
        
        try:
            j = resp.json()
            print(f"JSON: {json.dumps(j, ensure_ascii=False, indent=2)[:500]}")
        except:
            pass
    except Exception as e:
        print(f"Error: {e}")
    
    return None

# 1. Test basic connectivity - get cinema list (no auth needed)
probe_endpoint("GET", "/api/film/getCinemaList", {}, "Get cinema list (no auth)")

# 2. Test get now playing movies
probe_endpoint("GET", "/api/film/getNowPlayMovies", {}, "Get now playing movies")

# 3. Test login with phone (instead of WeChat code)
probe_endpoint("GET", "/api/member/login", {"phone": "13800138000", "code": "123456"}, "Try phone login")

# 4. Test login with just phone
probe_endpoint("GET", "/api/member/login", {"phone": "13800138000"}, "Try phone only login")

# 5. Test captcha create (send SMS)
probe_endpoint("GET", "/api/captcha/create", {"phone": "13800138000"}, "Send SMS (test)")

# 6. Test query member by phone
probe_endpoint("GET", "/member/memberInfo/queryByPhone", {"phone": "13800138000", "flag": 1}, "Query member by phone")

# 7. Test register
probe_endpoint("POST", "/api/member/register", {"phone": "13800138000", "cinemaId": ""}, "Register (test)")

# 8. Test system parameter
probe_endpoint("GET", "/film/sysParameter/queryParameter", {"setName": "phoneVerify", "cinemaId": ""}, "Get phone verify setting")

# 9. Try DNS resolution
print(f"\n{'='*60}")
print("DNS Resolution check")
print("="*60)
import socket
try:
    ip = socket.gethostbyname("860753002.api.yq30.com")
    print(f"860753002.api.yq30.com -> {ip}")
except Exception as e:
    print(f"DNS error: {e}")

try:
    ip2 = socket.gethostbyname("film-api.piaoxf.com")
    print(f"film-api.piaoxf.com -> {ip2}")
except Exception as e:
    print(f"DNS error: {e}")

# 10. Check if same server
try:
    resp1 = requests.get(f"https://860753002.api.yq30.com/jeecg-boot/", headers=HEADERS, timeout=10, verify=True)
    print(f"\nBase URL response: {resp1.status_code} - {resp1.text[:200]}")
except Exception as e:
    print(f"Base URL error: {e}")
