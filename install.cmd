@echo off
chcp 65001 >nul
title pi-review-agent 一键安装脚本
color 0A

echo =============================================
echo   pi-review-agent 一键安装
echo   AI 驱动的 C++ OOP 复习助手
echo =============================================
echo.

:: ---------- 1. 检查 Node.js ----------
echo [1/4] 检查 Node.js 环境...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo !!! 未检测到 Node.js，请先安装 Node.js (>=22)
    echo     下载地址：https://nodejs.org/
    echo.
    echo     安装完成后，重新运行本脚本即可。
    pause
    exit /b 1
)

for /f "tokens=2 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
if %NODE_MAJOR% lss 22 (
    echo !!! Node.js 版本过低（当前：%NODE_VERSION%），需要 ^>=22
    echo     请升级后重试。
    pause
    exit /b 1
)
echo     ✓ Node.js %NODE_VERSION% 已就绪
echo.

:: ---------- 2. 检查/安装 pi-agent ----------
echo [2/4] 检查 pi-agent（复习助手运行平台）...

where pi >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('pi --version 2^>nul') do set PI_VER=%%i
    if not defined PI_VER set PI_VER=已安装
    echo     发现已有 pi-agent（%PI_VER%），跳过安装。
    echo     如需更新，可手动运行：npm update -g @earendil-works/pi-coding-agent
) else (
    echo     正在安装 @earendil-works/pi-coding-agent...
    call npm install -g @earendil-works/pi-coding-agent
    if %errorlevel% neq 0 (
        echo !!! pi-agent 安装失败，请检查网络后重试。
        pause
        exit /b 1
    )
    where pi >nul 2>nul
    if %errorlevel% neq 0 (
        echo !!! pi 命令已安装但未生效，请关闭本窗口后重新打开。
        pause
        exit /b 1
    )
    echo     ✓ pi-agent 安装成功
)
echo.

:: ---------- 3. 安装 workspace 依赖 ----------
echo [3/4] 安装项目依赖（workspace）...
cd /d "%~dp0workspace"
if exist node_modules (
    echo     发现已有 node_modules，执行增量更新...
) else (
    echo     正在安装...
)
call npm install
if %errorlevel% neq 0 (
    echo !!! 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
)
echo     ✓ workspace 依赖已就绪
echo.

:: ---------- 4. 安装根目录依赖 ----------
echo [4/4] 安装根目录依赖...
cd /d "%~dp0"
if not exist node_modules (
    call npm install
    if %errorlevel% neq 0 (
        echo !!! 依赖安装失败，请检查网络后重试。
        pause
        exit /b 1
    )
) else (
    echo     根目录依赖已就绪，跳过。
)
echo     ✓ 根目录依赖已就绪
echo.

:: ---------- 验证安装 ----------
echo.
echo =============================================
echo   安装完成！正在验证...
echo =============================================

cd /d "%~dp0workspace"

echo.
echo 检查项目文件完整性...
call npm run setup-review

echo.
echo 语法检查...
call npm run check

echo.
echo =============================================
echo   ✓✓✓ 安装成功！使用方法：
echo.
echo   1. 在 workspace 目录下输入 pi 启动
echo   2. 在 pi 中输入 /review 开始复习
echo   3. 输入 /review-init 创建复习档案
echo   4. 输入 /review-fix 修改已有档案
echo.
echo   提示：在任意目录下输入 pi 都可启动
echo =============================================
echo.
pause
