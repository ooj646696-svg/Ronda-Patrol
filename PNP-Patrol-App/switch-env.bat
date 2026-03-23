@echo off
if "%1"=="dev" (
    copy .env.development .env
    echo Switched to development environment
) else if "%1"=="prod" (
    copy .env.production .env
    echo Switched to production environment
) else (
    echo Usage: npm run switch-env [dev|prod]
    exit /b 1
)
npx expo start --clear
