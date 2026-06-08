@echo off
title Center Business Services Launcher
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-website.ps1"
if errorlevel 1 pause
