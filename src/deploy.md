# 方案A Docker完整分步部署（零宿主机Node环境冲突，最稳）
## 前置确认
游戏代码目录：`/vol1/1000/Nginx/basketball-game_copy`
服务默认端口：3000（确保app.js监听`0.0.0.0:3000`，不能只写127.0.0.1）

---
## 步骤1：进入游戏项目根目录
```bash
cd /vol1/1000/Nginx/basketball-game_copy
```
## 步骤2：创建docker-compose.yml配置文件
```bash
nano docker-compose.yml
```
复制粘贴以下完整配置：
```yaml
version: '3'
services:
  basketball-game:
    image: node:18-alpine
    container_name: basketball-game
    working_dir: /app
    # 把NAS本地整个游戏目录挂载到容器内/app
    volumes:
      - ./:/app
    # 端口映射：宿主机3000 <-> 容器3000
    ports:
      - "3000:3000"
    # 启动逻辑：先装依赖，再启动Express
    # command: sh -c "npm install && node app.js"
    command: sh -c "node server/main.js"
    
    # 异常崩溃、NAS重启自动重启容器
    restart: always
    # 时区统一为国内
    environment:
      TZ: Asia/Shanghai
```
保存退出：`Ctrl+O` → 回车确认 → `Ctrl+X`

## 步骤3：首次后台启动容器
```bash
docker-compose up -d
```
- `-d` = 后台静默运行
- 首次执行会自动拉取`node:18-alpine`镜像，然后自动执行`npm install`安装全部项目依赖

## 步骤4：查看启动日志，排查报错
### 实时看完整日志
```bash
docker logs -f basketball-game
```
正常成功标志：日志末尾输出 `listening on 0.0.0.0:3000`
### 常见日志报错处理
1. **sqlite3编译失败**
进入容器手动安装预编译包：
```bash
docker exec -it basketball-game sh
npm install sqlite3 --build-from-source=false
exit
# 重启容器
docker-compose restart
```
2. **端口3000被占用**
修改`docker-compose.yml`里端口映射为`"3001:3000"`，同步后续CF隧道端口；然后`docker-compose up -d`重载

## 步骤5：内网验证服务可用性
拿同一台局域网设备浏览器访问：
`http://你的NAS内网IP:3000`
能正常打开像素篮球卡牌游戏页面、可以交互对战=内网部署完成

## 步骤6：修改Cloudflare Tunnel配置对外网开放
1. 打开CF隧道配置文件
```bash
nano ~/.cloudflared/config.yml
```
2. 在`ingress`段添加游戏域名转发，示例（替换为你自己的域名）：
```yaml
tunnel: 这里填你的隧道UUID
credentials-file: /root/.cloudflared/你的隧道UUID.json

ingress:
  # 新增篮球游戏域名映射
  - hostname: game.taoy1.xyz
    service: http://127.0.0.1:3000
  # 保留你原本静态网页配置
  - hostname: web.taoy1.xyz
    service: http://127.0.0.1:8080
  # 兜底404
  - service: http_status:404
```
保存退出。

3. 重启cloudflared隧道生效
```bash
sudo systemctl restart cloudflared
```

## 步骤7：DNS与HTTPS核对
1. CF域名DNS页：确认`game.taoy1.xyz`解析类型为**CNAME**，值复制隧道后台给出的CF地址
2. CF面板 → SSL/TLS → 概述：加密模式选择**完全（Full）**
3. 等待1-3分钟证书签发，浏览器访问 `https://game.taoy1.xyz` 即可外网游玩

---
# 日常运维常用命令
1. 重启游戏服务
```bash
sudo docker compose restart
```
2. 停止服务
```bash
docker compose stop
```
3. 更新代码后重载（改完代码直接执行）
```bash
docker compose up -d
```
4. 进入容器内部调试
```bash
docker exec -it basketball-game sh
```
5. 彻底删除容器（数据不会丢，代码/数据库都存在NAS本地文件夹）
```bash
docker compose down
```

---
# SQLite数据持久化说明
- 数据库`db/game.db`全程存在NAS本地`/vol1/1000/Nginx/basketball-game_copy/db/`
- 容器删除、重启、重装镜像都不会删除对战存档数据
- 备份直接复制NAS本地db文件夹即可，无需操作容器内部