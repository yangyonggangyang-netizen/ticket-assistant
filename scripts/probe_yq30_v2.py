#!/usr/bin/env python3
"""Further API probing - test register with URL params and other methods."""
import requests
import json

BASE_URL = "https://860753002.api.yq30.com/jeecg-boot"

HEADERS = {
    "X-Requested-With": "XMLHttpRequest",
    "Access-Control-Max-Age": "86400",
    "Accept": "application/json",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "checktoken": "0",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MicroMessenger/8.0.49"
}

def probe(method, path, params=None, data=None, json_data=None, desc=""):
    url = BASE_URL + path
    print(f"\n{'='*60}")
    print(f"[{method}] {path} - {desc}")
    
    try:
        if method == "GET":
            resp = requests.get(url, params=params, headers=HEADERS, timeout=10)
        elif method == "POST":
            if json_data:
                h = {**HEADERS, "Content-Type": "application/json; charset=UTF-8"}
                resp = requests.post(url, params=params, json=json_data, headers=h, timeout=10)
            else:
                resp = requests.post(url, params=params, data=data, headers=HEADERS, timeout=10)
        
        print(f"Status: {resp.status_code}")
        try:
            j = resp.json()
            print(f"Response: {json.dumps(j, ensure_ascii=False, indent=2)[:500]}")
        except:
            print(f"Response: {resp.text[:500]}")
    except Exception as e:
        print(f"Error: {e}")

# 1. Get full cinema list to find cinema IDs
probe("GET", "/api/film/getCinemaList", params={"memberId": ""}, desc="Get full cinema list")

# 2. Try register with phone as URL param
probe("POST", "/api/member/register", params={"phone": "13800138000", "cinemaId": "0"}, desc="Register with URL params")

# 3. Try register with form data
probe("POST", "/api/member/register", data={"phone": "13800138000", "cinemaId": "0"}, desc="Register with form data")

# 4. Try POST getNowPlayMovies
probe("POST", "/api/film/getNowPlayMovies", params={"cinemaId": "0", "memberId": ""}, desc="Get now playing movies (POST)")

# 5. Try getNowPlayMovies with form data
probe("POST", "/api/film/getNowPlayMovies", data={"cinemaId": "0", "memberId": ""}, desc="Get now playing movies (form)")

# 6. Try getNowPlayMovies with JSON
probe("POST", "/api/film/getNowPlayMovies", json_data={"cinemaId": "0", "memberId": ""}, desc="Get now playing movies (JSON)")

# 7. Try captcha create with memberId
probe("GET", "/api/captcha/create", params={"phone": "13800138000", "memberId": "1"}, desc="Send SMS with memberId")

# 8. Try queryByPhone with a real phone (we know the user has a phone)
# Let's try querying with empty phone to see response format
probe("GET", "/member/memberInfo/queryByPhone", params={"phone": "", "flag": 1}, desc="Query with empty phone")

# 9. Try login with different parameter names
probe("GET", "/api/member/login", params={"code": "test", "phone": "13800138000", "smsCode": "123456"}, desc="Login with code+phone+smsCode")

# 10. Try to find other login endpoints
probe("POST", "/api/member/phoneLogin", params={"phone": "13800138000", "code": "123456"}, desc="Try phoneLogin endpoint")
probe("POST", "/api/member/smsLogin", params={"phone": "13800138000", "code": "123456"}, desc="Try smsLogin endpoint")
probe("GET", "/api/member/phoneLogin", params={"phone": "13800138000", "code": "123456"}, desc="Try phoneLogin GET")
