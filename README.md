# Auto Register Filler 付费版 - 部署指南

## 功能说明

- 自动填充注册/评论表单
- AI生成推广文案（通义千问）
- 积分制付费系统（支付宝）

## 部署步骤

### 1. 部署后端API到Vercel

```bash
# 克隆或进入后端目录
cd api

# 安装依赖
npm install

# 本地测试
npm start
```

#### 配置环境变量

在Vercel项目中添加以下环境变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| ALIPAY_APP_ID | 支付宝应用ID | 2021xxxxxxxx |
| ALIPAY_PRIVATE_KEY | 应用私钥 | -----BEGIN RSA PRIVATE KEY-----... |
| ALIPAY_PUBLIC_KEY | 支付宝公钥 | MIIBIjANBgkqhkiG9w0BAQEF... |
| BASE_URL | 你的Vercel域名 | https://your-project.vercel.app |

### 2. 修改扩展配置

在 `content.js` 中修改API地址：

```javascript
const POINTS_API_BASE = 'https://你的Vercel项目名.vercel.app/api';
```

在 `options.js` 中同样修改API地址。

### 3. 支付宝配置

1. 登录支付宝开放平台：https://open.alipay.com/
2. 创建应用并获取 AppID
3. 配置应用公钥，获取支付宝公钥
4. 生成应用私钥
5. 在Vercel中配置环境变量

### 4. 安装扩展

1. 打开Chrome扩展管理页面：`chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `autoComment` 目录

## 充值套餐

| 积分数量 | 价格 |
|------|------|
| 200 积分 | ¥9.9 |
| 500 积分 | ¥19.9 |
| 2000 积分 | ¥49.9 |

**新用户初始赠送 10 积分**

## 开发者模式

扩展内置了开发者模式，方便测试调试。开启后：
- 积分固定为 1000（不受充值影响）
- 生成文案不消耗积分

### 开启/关闭开发者模式

分别在 `content.js` 和 `options.js` 文件中修改：

```javascript
// content.js 第 287 行
const DEV_MODE = true; // 改为 false 关闭

// options.js 第 186 行
const DEV_MODE = true; // 改为 false 关闭
```

> **重要**：部署到生产环境前，请务必将 `DEV_MODE` 设为 `false`，否则所有用户都将获得无限积分！

## 数据存储说明

### 积分数据

- **存储位置**：后端 API 服务器（Vercel）内存中
- **存储方式**：使用 JavaScript `Map` 对象存储（`api/storage.js`）
- **用户识别**：通过浏览器指纹生成用户 ID（存储在 Chrome 扩展本地存储中）

### 给自己预设积分

由于积分存在 Vercel 服务器内存中，无法直接在网页上修改。你可以：

1. **开启开发者模式**（推荐）：将 `content.js` 和 `options.js` 中的 `DEV_MODE` 设为 `true`，积分固定为 1000

2. **预设固定积分**：在 `api/storage.js` 中直接写入你的用户 ID 和积分：

```javascript
// api/storage.js
users.set('你的用户ID', 10000); // 预设 10000 积分
```

**获取用户 ID 的方法**：
1. 安装扩展后，打开扩展选项页面
2. 按 `F12` 打开浏览器开发者工具
3. 在控制台执行：
```javascript
chrome.storage.local.get('auto_comment_user_id', console.log)
```
4. 在控制台输出中找到 `auto_comment_user_id` 的值，复制到 `storage.js` 中

存储在 Chrome 扩展的 `chrome.storage` 中：
- API Key、Skill 模板、推广网站地址 → `chrome.storage.sync`
- 用户 ID、生成记录、冷却时间 → `chrome.storage.local`

> **注意**：当前使用内存存储，Vercel 服务器重启后数据会丢失。生产环境建议使用 Redis 或数据库持久化存储。

## 注意事项

1. 请妥善保管支付宝密钥，不要提交到公开仓库
2. 用户ID基于浏览器生成，更换浏览器需要重新充值
