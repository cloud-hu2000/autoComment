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

| 积分 | 价格 |
|------|------|
| 10 | ¥10 |
| 30 | ¥25 |
| 100 | ¥70 |

## 注意事项

1. 内存存储仅用于演示，生产环境建议使用Redis或数据库
2. 请妥善保管支付宝密钥，不要提交到公开仓库
3. 用户ID基于浏览器生成，更换浏览器需要重新充值
