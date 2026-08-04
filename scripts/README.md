# 大埔嘉逸影联 - 桌面客户端抓包工具

## 快速开始

### 第一步：启动抓包代理

双击运行 `start-capture.bat`

这会启动 mitmproxy 代理服务器，监听端口 8080。

### 第二步：安装 CA 证书

1. 保持 mitmproxy 运行（不要关闭第一步的窗口）
2. 双击运行 `install-ca.bat`
3. 按提示完成证书安装

### 第三步：配置代理

**方式一：系统代理（先试这个）**

双击运行 `set-proxy.bat on`

**方式二：Proxifier（如果方式一抓不到包）**

1. 下载安装 Proxifier
2. Profile → Proxy Servers → Add
   - Address: 127.0.0.1
   - Port: 8080
   - Protocol: HTTPS
3. Profile → Proxification Rules → Add
   - Name: WeChat Mini Program
   - Applications: WeChatAppEx.exe; WeChat.exe
   - Action: 选择上面创建的代理

### 第四步：在微信中操作小程序

1. 打开微信 PC 版
2. 搜索并打开"大埔嘉逸影联"小程序
3. 依次操作以下功能（每个停留几秒）：
   - 浏览首页（影片列表）
   - 点击一部电影查看详情
   - 查看场次排期
   - 点击一个场次查看座位图
   - 返回，查看"我的"/"会员中心"（余额、积分）
   - 查看"积分商城"
   - 查看"订单管理"
   - 如果方便，尝试选座下单（到支付前停止）

### 第五步：停止抓包

回到 mitmproxy 窗口，按 `Ctrl+C` 停止。

### 第六步：分析数据

双击运行 `analyze.bat`（或手动运行 `python analyze.py`）

会生成两个文件：
- `captured_api/api-spec.json` - API 规格文件
- `captured_api/analysis-report.txt` - 可读的分析报告

### 第七步：清理代理

双击运行 `set-proxy.bat off` 移除系统代理。

## 文件说明

| 文件 | 说明 |
|---|---|
| `start-capture.bat` | 启动 mitmproxy 抓包 |
| `install-ca.bat` | 安装 CA 证书 |
| `set-proxy.bat` | 设置/移除系统代理 |
| `analyze.py` | 分析抓包数据 |
| `mitm_capture.py` | mitmproxy 拦截脚本 |

## 常见问题

**Q: 抓不到任何请求？**
A: 微信 PC 版可能绕过系统代理。请使用 Proxifier 进行进程级代理。

**Q: 小程序打不开/网络错误？**
A: CA 证书未正确安装。重新运行 `install-ca.bat`，或手动安装证书。

**Q: 看到很多无关请求？**
A: 正常，脚本会自动过滤静态资源和微信框架请求。分析脚本会按分类整理。

**Q: 需要抓多个账号吗？**
A: 先抓一个账号即可。后续在桌面应用中可以逐个添加。
