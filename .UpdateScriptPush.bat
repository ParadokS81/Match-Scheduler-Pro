@echo off
cd /d "%~dp0"

echo Pushing local code changes to Google Apps Script...

clasp push

echo Done.
pause
