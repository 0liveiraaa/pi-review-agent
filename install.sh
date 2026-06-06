#!/usr/bin/env bash
# pi-review-agent 一键安装脚本 (bash 版)
# Windows 用户推荐使用 install.cmd，此脚本适用于 Git Bash / WSL

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_VERSION=$(node -v 2>/dev/null || true)

echo "============================================="
echo "  pi-review-agent 一键安装"
echo "  AI 驱动的 C++ OOP 复习助手"
echo "============================================="
echo ""

# ---------- 1. 检查 Node.js ----------
echo "[1/4] 检查 Node.js 环境..."
if [ -z "$NODE_VERSION" ]; then
    echo "!!! 未检测到 Node.js，请先安装 Node.js >= 22"
    echo "    下载地址：https://nodejs.org/"
    exit 1
fi

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 22 ]; then
    echo "!!! Node.js 版本过低（当前：$NODE_VERSION），需要 >= 22"
    exit 1
fi
echo "    ✓ Node.js $NODE_VERSION 已就绪"
echo ""

# ---------- 2. 安装 pi-agent ----------
echo "[2/4] 安装 pi-agent（复习助手运行平台）..."
echo "    正在全局安装 @earendil-works/pi-coding-agent..."
npm install -g @earendil-works/pi-coding-agent
echo "    ✓ pi-agent 已就绪"
echo ""

# ---------- 3. 安装 workspace 依赖 ----------
echo "[3/4] 安装项目依赖（workspace）..."
cd "$SCRIPT_DIR/workspace"
npm install
echo "    ✓ workspace 依赖已安装"
echo ""

# ---------- 4. 安装根目录依赖 ----------
echo "[4/4] 安装根目录依赖..."
cd "$SCRIPT_DIR"
npm install
echo "    ✓ 根目录依赖已安装"
echo ""

# ---------- 验证 ----------
echo ""
echo "============================================="
echo "  安装完成！正在验证..."
echo "============================================="
echo ""

cd "$SCRIPT_DIR/workspace"
echo "检查项目文件完整性..."
npm run setup-review || true

echo ""
echo "语法检查..."
npm run check || true

echo ""
echo "============================================="
echo "  ✓✓✓ 安装成功！使用方法："
echo ""
echo "  1. 在 workspace 目录下输入 pi 启动"
echo "  2. 在 pi 中输入 /review 开始复习"
echo "  3. 输入 /review-init 创建复习档案"
echo "  4. 输入 /review-fix 修改已有档案"
echo "============================================="
