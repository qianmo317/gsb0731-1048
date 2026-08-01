# IoT 温湿度监控系统

## 🛠 技术栈
- Frontend: Vue 3 + Vite + Element Plus + ECharts
- 容器化: Docker + Docker Compose + Nginx

## 🚀 启动指南 (How to Run)
1. 确保 Docker Desktop 已启动。
2. 在根目录执行：`docker compose up --build`
3. 等待容器启动完成（首次构建可能需要几分钟下载依赖）
4. 访问 http://localhost:3000 查看页面

## 🔗 服务地址 (Services)
- Frontend: http://localhost:3000

## ✨ 功能特性
- **设备选择**: 顶部下拉选择框，支持选择设备1、设备2、设备3
- **实时图表**: 使用 ECharts 展示近10条温湿度数据的折线图
  - X轴：时间（每分钟一条数据）
  - Y轴：温度（°C）和湿度（%）
  - 双Y轴设计，温度用蓝色，湿度用绿色
- **当前状态**: 底部显示当前温度和湿度数值
- **设备控制**: 设备重启按钮，点击后弹出确认对话框

## 🎨 设计特点
- **工业风格**: 深灰背景 + 蓝色主题配色
- **响应式布局**: 适配 1920*1080 屏幕
- **现代化UI**: 使用 Element Plus 组件库，界面美观
- **交互反馈**: 卡片悬停效果、按钮动画等微交互

## 📦 项目结构
```
.
├── src/
│   ├── App.vue          # 主组件
│   └── main.js          # 入口文件
├── Dockerfile           # Docker 构建文件
├── docker-compose.yml   # Docker Compose 配置
├── nginx.conf           # Nginx 配置
├── package.json         # 项目依赖
├── vite.config.js       # Vite 配置
└── README.md            # 项目说明
```

## 🐳 Docker 镜像源配置
- **npm 源**: 使用淘宝镜像 (https://registry.npmmirror.com) 加速依赖下载
- **基础镜像**: node:20-alpine (构建) + nginx:alpine (运行)

## 📝 注意事项
- 本项目为前端演示项目，使用模拟数据
- 设备重启功能仅前端提示，未对接后端API
- 图表数据每分钟自动更新（模拟）
