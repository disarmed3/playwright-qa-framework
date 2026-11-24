@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem Place this file at <framework>\tools\qa-dashboard\start.cmd.
rem Change 0 to 1 only for a reviewed Codemify course framework.
rem Course mode unsets BASE_URL and LOCAL_SANDBOX_DIR for this process only.
set "QA_DASHBOARD_CODEMIFY_COURSE=1"

set "QA_DASHBOARD_EXIT=1"
set "QA_DASHBOARD_PORT=4173"
pushd "%~dp0..\.." >nul 2>&1
if errorlevel 1 goto location_error

if not exist "qa-dashboard.config.json" goto configuration_error
if not exist "node_modules\@codemify\qa-dashboard\bin\qa-dashboard.mjs" goto package_error

node --version >nul 2>&1
if errorlevel 1 goto node_missing
node --input-type=commonjs -e "process.exit(Number(process.versions.node.split('.')[0]) === 24 ? 0 : 1)" >nul 2>&1
if errorlevel 1 goto node_version

:arguments
if "%~1"=="" goto launch
if /i "%~1"=="--help" goto help
if /i not "%~1"=="--port" goto arguments_error
if "%~2"=="" goto arguments_error
set "QA_DASHBOARD_PORT=%~2"
node --input-type=commonjs -e "const p=process.env.QA_DASHBOARD_PORT; process.exit(/^\d+$/.test(p) && Number(p) >= 1024 && Number(p) <= 65535 ? 0 : 1)" >nul 2>&1
if errorlevel 1 goto arguments_error
shift
shift
goto arguments

:launch
if "%QA_DASHBOARD_CODEMIFY_COURSE%"=="0" goto start_server
if not "%QA_DASHBOARD_CODEMIFY_COURSE%"=="1" goto mode_error
set "BASE_URL="
set "LOCAL_SANDBOX_DIR="
echo Codemify course startup: BASE_URL and LOCAL_SANDBOX_DIR are unset for this dashboard.

:start_server
echo Starting this framework's QA dashboard. Keep this window open.
echo Open the URL printed after startup. Press Ctrl+C here to stop.
node "node_modules\@codemify\qa-dashboard\bin\qa-dashboard.mjs" start --root "%CD%" --port "%QA_DASHBOARD_PORT%"
set "QA_DASHBOARD_EXIT=%ERRORLEVEL%"
if not "%QA_DASHBOARD_EXIT%"=="0" goto failed
goto finish

:help
echo Double-click start.cmd after setup, or run start.cmd --port 4180.
echo The kit must be at your framework's tools\qa-dashboard folder.
set "QA_DASHBOARD_EXIT=0"
goto finish

:configuration_error
echo Dashboard configuration was not found in the expected framework.
echo Place the kit at your framework's tools\qa-dashboard folder and complete
echo the setup in docs\STUDENT-START-HERE.md before starting it.
goto failed

:package_error
echo The dashboard package is not installed in this framework.
echo Follow this kit's docs\STUDENT-START-HERE.md to install the reviewed archive.
goto failed

:node_missing
echo Node.js was not found. Install Node.js 24 LTS, then open a new window.
goto failed

:node_version
echo This dashboard requires Node.js 24 LTS. Select Node 24 and try again.
goto failed

:arguments_error
echo Use start.cmd or start.cmd --port 4180. The port must be 1024 through 65535.
goto failed

:mode_error
echo QA_DASHBOARD_CODEMIFY_COURSE in start.cmd must be 0 or 1.
goto failed

:failed
echo.
echo Dashboard startup stopped. Review the message above.
pause

:finish
popd
endlocal & exit /b %QA_DASHBOARD_EXIT%

:location_error
echo Could not open the framework folder. Place this kit in tools\qa-dashboard.
pause
endlocal & exit /b 1
