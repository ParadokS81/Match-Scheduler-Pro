@echo off
rem Ensures the script runs in its own directory
cd /d "%~dp0"

echo Staging all changes for commit...
git add .

echo Committing with a standard message...
set "commit_datetime=%date% %time%"
git commit -m "Sync project files on %commit_datetime%"

echo Pushing changes to GitHub...
git push

echo --- PUSH COMPLETE ---
pause