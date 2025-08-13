# PowerShell скрипт для полной пересборки Foxhole приложения

Write-Host "🔨 Полная пересборка Foxhole приложения..." -ForegroundColor Green

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

# Останавливаем и удаляем все контейнеры
Write-Host "🛑 Останавливаем и удаляем существующие контейнеры..." -ForegroundColor Yellow
docker-compose down

# Удаляем все образы
Write-Host "🗑️  Удаляем старые образы..." -ForegroundColor Yellow
docker-compose down --rmi all

# Очищаем Docker кэш
Write-Host "🧹 Очищаем Docker кэш..." -ForegroundColor Yellow
docker system prune -f

# Собираем и запускаем приложение
Write-Host "🔨 Собираем и запускаем приложение..." -ForegroundColor Yellow
docker-compose up --build -d

# Ждем запуска базы данных
Write-Host "⏳ Ждем запуска базы данных..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Проверяем статус
Write-Host "📊 Статус контейнеров:" -ForegroundColor Cyan
docker-compose ps

# Проверяем логи приложения
Write-Host "📋 Логи приложения:" -ForegroundColor Cyan
docker-compose logs app

Write-Host "✅ Приложение пересобрано и запущено!" -ForegroundColor Green
Write-Host "🌐 Веб-интерфейс: http://localhost:3000" -ForegroundColor Cyan
Write-Host "🗄️  База данных: localhost:5432" -ForegroundColor Cyan
Write-Host ""
Write-Host "Для просмотра логов используйте: docker-compose logs -f app" -ForegroundColor Yellow
Write-Host "Для остановки используйте: docker-compose down" -ForegroundColor Yellow 