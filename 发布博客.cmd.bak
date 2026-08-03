@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" goto missing
node scripts\publish.js "%~1"
if errorlevel 1 goto failed
echo.
echo Publish command finished successfully.
goto success

:missing
echo.
echo Drag one HTML file onto this launcher.
goto failed

:failed
echo.
echo Publish failed. See the message above.
pause
exit /b 1

:success
pause
exit /b 0
