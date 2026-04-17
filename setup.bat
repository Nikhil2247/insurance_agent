@echo off
echo ========================================
echo AI Insurance Agent - Setup Script
echo ========================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.10+
    pause
    exit /b 1
)

echo Python found.
echo.

REM Create virtual environment if it doesn't exist
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Create .env if it doesn't exist
if not exist ".env" (
    echo Creating .env file...
    copy .env.example .env
    echo.
    echo IMPORTANT: Edit .env and add your OPENROUTER_API_KEY
)

REM Run tests
echo.
echo Running setup tests...
python test_setup.py

echo.
echo ========================================
echo Setup complete!
echo.
echo To start the chat interface:
echo   1. Activate venv: venv\Scripts\activate
echo   2. Run: python run_chat.py
echo.
echo Or run the API server:
echo   python run_api.py
echo ========================================
pause
