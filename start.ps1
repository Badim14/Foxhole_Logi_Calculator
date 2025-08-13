# PowerShell скрипт для запуска Foxhole приложения

Write-Host "🚀 Запуск Foxhole приложения..." -ForegroundColor Green

# Проверяем, установлен ли Docker
try {
    docker --version | Out-Null
    Write-Host "✅ Docker найден" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker не установлен. Пожалуйста, установите Docker." -ForegroundColor Red
    exit 1
}

# Проверяем, запущен ли Docker
try {
    docker info | Out-Null
    Write-Host "✅ Docker запущен" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker не запущен. Пожалуйста, запустите Docker." -ForegroundColor Red
    exit 1
}

# Останавливаем существующие контейнеры
Write-Host "🛑 Останавливаем существующие контейнеры..." -ForegroundColor Yellow
docker-compose down

# Собираем и запускаем приложение
Write-Host "🔨 Собираем и запускаем приложение..." -ForegroundColor Yellow
docker-compose up --build -d

# Ждем запуска базы данных
Write-Host "⏳ Ждем запуска базы данных..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Проверяем статус
Write-Host "📊 Статус контейнеров:" -ForegroundColor Cyan
docker-compose ps

Write-Host "✅ Приложение запущено!" -ForegroundColor Green
Write-Host "🌐 Веб-интерфейс: http://localhost:3000" -ForegroundColor Cyan
Write-Host "🗄️  База данных: localhost:5432" -ForegroundColor Cyan
Write-Host ""
Write-Host "Для просмотра логов используйте: docker-compose logs -f app" -ForegroundColor Yellow
Write-Host "Для остановки используйте: docker-compose down" -ForegroundColor Yellow 