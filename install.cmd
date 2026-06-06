@echo off
setlocal EnableExtensions

title pi-review-agent installer

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo =============================================
echo   pi-review-agent installer
echo =============================================
echo.

echo [1/5] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found.
  echo Install Node.js 22 or newer from https://nodejs.org/
  pause
  exit /b 1
)

for /f "usebackq delims=" %%v in (`node -v`) do set "NODE_VERSION=%%v"
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if errorlevel 1 (
  echo ERROR: Node.js %NODE_VERSION% is too old. Node.js 22 or newer is required.
  pause
  exit /b 1
)
echo OK: Node.js %NODE_VERSION%
echo.

echo [2/5] Checking pi-agent...
where pi >nul 2>nul
if errorlevel 1 (
  echo pi-agent was not found. Installing @earendil-works/pi-coding-agent...
  call npm install -g @earendil-works/pi-coding-agent
  if errorlevel 1 (
    echo ERROR: Failed to install pi-agent.
    pause
    exit /b 1
  )
)
where pi >nul 2>nul
if errorlevel 1 (
  echo ERROR: pi command is still unavailable. Restart this terminal and try again.
  pause
  exit /b 1
)
for /f "usebackq delims=" %%v in (`pi --version 2^>nul`) do set "PI_VERSION=%%v"
if not defined PI_VERSION set "PI_VERSION=installed"
echo OK: pi-agent %PI_VERSION%
echo.

echo [3/5] Installing package dependencies...
cd /d "%ROOT%"
call npm install
if errorlevel 1 (
  echo ERROR: Root npm install failed.
  pause
  exit /b 1
)

if exist "%ROOT%\workspace\package.json" (
  call npm --prefix "%ROOT%\workspace" install
  if errorlevel 1 (
    echo ERROR: Workspace npm install failed.
    pause
    exit /b 1
  )
)
echo OK: dependencies installed
echo.

echo [4/5] Registering this package with pi...
call pi install "%ROOT%"
if errorlevel 1 (
  echo ERROR: pi install failed.
  pause
  exit /b 1
)
echo OK: package registered
echo.

echo [5/5] Verifying project...
call npm run check-package
if errorlevel 1 (
  echo ERROR: package check failed.
  pause
  exit /b 1
)

call npm run check
if errorlevel 1 (
  echo ERROR: syntax check failed.
  pause
  exit /b 1
)

echo.
echo =============================================
echo   Install complete
echo =============================================
echo.
echo Next steps:
echo   1. Run: pi
echo   2. Inside pi, type: /review
echo.
echo If you installed an older git copy before, run:
echo   pi update git:git@github.com:0liveiraaa/pi-review-agent
echo or remove and reinstall it.
echo.
pause
