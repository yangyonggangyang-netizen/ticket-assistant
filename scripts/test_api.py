"""Quick API connectivity test for yq30 API endpoints."""
import requests
import json
import sys

BASE = "https://860753002.api.yq30.com/jeecg-boot"
HEADERS = {
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MicroMessenger/8.0.49",
}

def test(name, method, path, **kwargs):
    url = BASE + path
    try:
        if method == "GET":
            resp = requests.get(url, headers=HEADERS, timeout=10, **kwargs)
        else:
            resp = requests.post(url, headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded"}, timeout=10, **kwargs)
        data = resp.json()
        success = data.get("success", False)
        result = data.get("result")
        # Truncate result for display
        result_str = json.dumps(result, ensure_ascii=False)[:200] if result else "null"
        status = "✅" if success else "❌"
        print(f"{status} {name}: success={success}, code={data.get('code')}, result={result_str}")
        return data
    except Exception as e:
        print(f"❌ {name}: ERROR - {e}")
        return None

# Test 1: getCinemaList (GET, no auth)
test("getCinemaList", "GET", "/api/film/getCinemaList")

# Test 2: getNowPlayMovies (POST, no auth needed for list)
from datetime import datetime
now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
test("getNowPlayMovies", "POST", "/api/film/getNowPlayMovies",
     data={"startDate": now_str, "endDate": "", "pageSize": 5, "pageNo": 1, "cinemaId": "", "infoType": 1})

# Test 3: getMemberInfoById (GET, no token -> should fail auth)
test("getMemberInfoById (no token)", "GET", "/api/member/getMemberInfoById")

# Test 4: getMemberLevelList (GET)
test("getMemberLevelList", "GET", "/api/member/getMemberLevelList")

# Test 5: getOrderList (GET, no token)
test("getOrderList (no token)", "GET", "/api/order/getSaleOrder",
     params={"pageNo": 1, "pageSize": 5, "flag": 1})

# Test 6: getScheduleAllFilm (GET, with cinemaId)
test("getScheduleAllFilm", "GET", "/api/film/getScheduleAllFilm",
     params={"cinemaId": "", "startDate": now_str})

# Test 7: getShareConfig (GET)
test("getShareConfig", "GET", "/api/film/getShareConfig")

print("\n=== Test Complete ===")
