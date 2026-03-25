for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4783 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>nul
start /b pnpm.cmd dev > codex-web-dev.log 2> codex-web-dev.err.log
timeout /t 8 >nul
curl -I http://localhost:4783/
