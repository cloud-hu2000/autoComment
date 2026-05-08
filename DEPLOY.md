# 部署指南：阿里云 Linux + GitHub Actions 自动部署

## 一、阿里云服务器准备

### 1.1 购买与连接
- 推荐配置：**2核2G / Ubuntu 22.04 LTS**（最低）
- 开放端口：**22（SSH）**、**80（HTTP）**、**443（HTTPS，可选）**
- 通过 SSH 连接服务器：
  ```bash
  ssh root@你的服务器IP
  ```

### 1.2 安装基础环境
```bash
# 更新系统
dnf check-update
dnf update -y

# 安装 Node.js 20.x（通过 NodeSource 仓库）
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

# 安装 Git
dnf install -y git

# 安装 PM2（进程管理器）
npm install -g pm2

# 安装 Nginx
dnf install -y nginx

# 验证版本
node -v    # v20.x.x
pm2 -v
nginx -v
```

### 1.3 初始化数据库
> 当前代码使用 Neon PostgreSQL（云数据库），**无需在服务器上安装数据库**。
> 只要服务器能访问外网（调用 DashScope API 和 Neon DB），即可直接使用。

确保服务器能访问外网：
```bash
curl -I https://dashscope.aliyuncs.com
curl -I https://console.neon.tech
```

### 1.4 创建项目目录
```bash
mkdir -p /var/www/auto-comment-api
cd /var/www/auto-comment-api
```

---

## 二、手动首次部署

### 2.1 上传代码到服务器

**方式 A：直接在服务器上克隆 GitHub 仓库**
```bash
cd /var/www/auto-comment-api
git init
git remote add origin https://github.com/你的用户名/autoComment.git
git pull origin master
npm ci
```

**方式 B：本地打包后上传（推荐用于首次）**
```bash
# 在本地打包
npm ci
tar -czvf auto-comment.tar.gz api/ server.js package.json package-lock.json

# 上传到服务器（Linux/macOS）
scp auto-comment.tar.gz root@你的服务器IP:/tmp/
# Windows 可用 WinSCP 或 scp 命令

# 在服务器解压
cd /var/www/auto-comment-api
tar -xzvf /tmp/auto-comment.tar.gz --strip-components=1
rm /tmp/auto-comment.tar.gz
```

### 2.2 配置环境变量
```bash
# 创建 .env 文件
vi /var/www/auto-comment-api/.env
```

添加以下内容：
```env
# Neon PostgreSQL 连接地址（从 Neon 控制台获取）
DATABASE_URL=postgresql://用户名:密码@ep-xxx.aws.neon.tech/autocomment?sslmode=require

# 通义千问 API Key（从阿里云 DashScope 控制台获取）
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# 服务端口
PORT=3000
NODE_ENV=production
```

> **安全建议**：不要将 `.env` 文件提交到 GitHub！确保 `.gitignore` 中包含 `.env`。

### 2.3 启动服务
```bash
cd /var/www/auto-comment-api
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # 设置开机自启（按提示复制执行输出的命令）
```

验证启动成功：
```bash
pm2 list
#(如果这里有问题，则运行pm2 logs auto-comment-api --lines 50 --nostream)
# 解决问题后运行 pm2 restart auto-comment-api
curl http://localhost:3000/health
```

### 2.4 配置 Nginx 反向代理
```bash
# 在 dnf 系统（Fedora/RHEL/CentOS）上，配置文件放在 conf.d 目录
# 复制并重命名配置
cp /var/www/auto-comment-api/deploy/nginx.conf /etc/nginx/conf.d/auto-comment-api.conf

# 编辑配置（替换 server_name）
nano /etc/nginx/conf.d/auto-comment-api.conf

# 测试并重载
nginx -t
systemctl start nginx

systemctl enable nginx
systemctl reload nginx
```

验证：
```bash
curl http://localhost/health
# 或通过 IP 访问
curl http://你的服务器IP/health
```

### 2.5 配置域名（可选）
在阿里云 DNS 解析中添加 A 记录指向服务器 IP，然后在 Nginx 中配置 `server_name` 为你的域名。

---

## 三、配置 GitHub Secrets

进入 GitHub 仓库 → **Settings → Secrets and variables → Actions**，添加以下 Secrets：

| Secret 名称 | 值说明 |
|------------|--------|
| `ALIYUN_HOST` | 阿里云服务器公网 IP |
| `ALIYUN_USER` | SSH 用户名（如 `root`） |
| `ALIYUN_PASSWORD` | SSH 密码（或使用 `ALIYUN_SSH_KEY` 私钥） |
| `ALIYUN_SSH_PORT` | SSH 端口（默认 `22`） |
| `ALIYUN_DEPLOY_PATH` | 部署路径（如 `/var/www/auto-comment-api`） |

> **安全建议**：建议使用 SSH 私钥认证代替密码，替换 `ALIYUN_PASSWORD` 为 `ALIYUN_SSH_KEY`。

---

## 四、启用 GitHub Actions 自动部署

### 4.1 推送代码触发
将修改后的代码推送到 GitHub master 分支：
```bash
git add .
git commit -m "feat: 支持阿里云服务器部署"
git push origin master
```

### 4.2 查看部署状态
进入 GitHub 仓库 → **Actions** 页面，可以查看部署日志。

### 4.3 手动触发部署
在 GitHub Actions 页面点击 **"Deploy to Production"** → **"Run workflow"** 手动触发。

---

## 五、日常维护命令

```bash
# 查看日志
pm2 logs auto-comment-api

# 重启服务
pm2 restart auto-comment-api

# 查看实时日志
pm2 logs auto-comment-api --lines 50 --nostream

# 查看进程状态
pm2 list

# 更新代码后重启（SSH 进入服务器手动操作时）
cd /var/www/auto-comment-api
git pull origin master
npm ci
pm2 restart auto-comment-api
```

---

## 六、Nginx HTTPS 配置（可选）

### 使用 Let's Encrypt 免费证书
```bash
# 安装 Certbot 及 Nginx 插件
dnf install -y certbot python3-certbot-nginx

# 获取证书（确保域名已解析）
certbot --nginx -d your-domain.com

# 自动续期测试
certbot renew --dry-run
```

---

## 七、扩展：API 地址变更说明

部署到阿里云后，需要将扩展代码中的 API 地址从 Vercel 改为你的服务器地址：

**需要修改的文件**：
- `content.js`（第 259、270 行）：`QWEN_API_BASE`、`POINTS_API_BASE`
- `options.js`（第 13 行）：`POINTS_API_BASE`

将：
```javascript
const QWEN_API_BASE = 'https://auto-comment-beta.vercel.app/api';
```
改为：
```javascript
const QWEN_API_BASE = 'https://你的域名.com/api';
// 或使用 IP
const QWEN_API_BASE = 'http://你的服务器IP/api';
```

> 建议使用 HTTPS + 域名方式，Chrome 扩展对 HTTP 请求有一些限制。

---

## 八、部署 MySQL 数据库（可选）

如果需要使用自建 MySQL 替代 Neon PostgreSQL，请按以下步骤操作：

### 8.1 安装 MySQL

```bash
# CentOS/RHEL/Fedora（dnf）
dnf install -y mysql-server mysql

# 启动并设置开机自启
systemctl start mysqld
systemctl enable mysqld

# 安全初始化（设置 root 密码，移除匿名用户等）
mysql_secure_installation
```

> **提示**：如果使用阿里云服务器，需在安全组中开放 **3306** 端口。

### 8.2 创建数据库和用户

```bash
# 登录 MySQL
mysql -u root -p
```

执行以下 SQL：

```sql
-- 创建数据库
CREATE DATABASE IF NOT EXISTS autocomment CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建用户并授权
CREATE USER 'autocomment'@'localhost' IDENTIFIED BY '你的强密码';
GRANT ALL PRIVILEGES ON autocomment.* TO 'autocomment'@'localhost';
FLUSH PRIVILEGES;

-- 退出
EXIT;
```

### 8.3 验证连接

```bash
mysql -u autocomment -p -h localhost autocomment
```

### 8.4 修改 .env 文件

编辑 `/var/www/auto-comment-api/.env`，将 `DATABASE_URL` 从 PostgreSQL 改为 MySQL：

```env
# MySQL 连接地址
DATABASE_URL=mysql://autocomment:你的密码@localhost:3306/autocomment
```

> **注意**：如果代码中使用的是 Prisma 或其他 ORM，需要确保已安装 MySQL 驱动（如 `npm install mysql2`），并确认 schema.prisma 中的 `datasource db.provider` 已改为 `"mysql"`。

### 8.5 运行数据库迁移

```bash
cd /var/www/auto-comment-api
npx prisma migrate deploy
```

### 8.6 重启服务

```bash
pm2 restart auto-comment-api
```

### 8.7 远程连接配置（可选）

如果需要从其他机器连接 MySQL：

```bash
# 编辑 MySQL 配置文件（CentOS/RHEL 路径）
nano /etc/my.cnf.d/mysql.server.cnf

# 或者
nano /etc/my.cnf

# 将 bind-address 改为 0.0.0.0（允许所有 IP 连接，不推荐生产环境）
bind-address = 0.0.0.0

# 重启 MySQL
systemctl restart mysqld

# 授权远程用户
mysql -u root -p
```

```sql
CREATE USER 'autocomment'@'%' IDENTIFIED BY '你的强密码';
GRANT ALL PRIVILEGES ON autocomment.* TO 'autocomment'@'%';
FLUSH PRIVILEGES;
```

> **安全建议**：生产环境建议使用阿里云数据库（RDS），不要直接暴露 MySQL 端口。

### 8.8 常用 MySQL 维护命令

```bash
# 查看 MySQL 状态
systemctl status mysqld

# 登录 MySQL
mysql -u root -p

# 查看数据库
SHOW DATABASES;

# 使用数据库
USE autocomment;

# 查看表
SHOW TABLES;

# 导出数据库
mysqldump -u root -p autocomment > /tmp/autocomment.sql

# 导入数据库
mysql -u root -p autocomment < /tmp/autocomment.sql
```