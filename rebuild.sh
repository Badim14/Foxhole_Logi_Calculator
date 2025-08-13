#!/bin/bash

echo "🔨 Полная пересборка Foxhole приложения..."

# Проверяем, установлен ли Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен. Пожалуйста, установите Docker."
    exit 1
fi

# Проверяем, запущен ли Docker
if ! docker info &> /dev/null; then
    echo "❌ Docker не запущен. Пожалуйста, запустите Docker."
    exit 1
fi

# Останавливаем и удаляем все контейнеры
echo "🛑 Останавливаем и удаляем существующие контейнеры..."
docker-compose down

# Удаляем все образы
echo "🗑️  Удаляем старые образы..."
docker-compose down --rmi all

# Очищаем Docker кэш
echo "🧹 Очищаем Docker кэш..."
docker system prune -f

# Собираем и запускаем приложение
echo "🔨 Собираем и запускаем приложение..."
docker-compose up --build -d

# Ждем запуска базы данных
echo "⏳ Ждем запуска базы данных..."
sleep 15

# Проверяем статус
echo "📊 Статус контейнеров:"
docker-compose ps

# Проверяем логи приложения
echo "📋 Логи приложения:"
docker-compose logs app

echo "✅ Приложение пересобрано и запущено!"
echo "🌐 Веб-интерфейс: http://localhost:3000"
echo "🗄️  База данных: localhost:5432"
echo ""
echo "Для просмотра логов используйте: docker-compose logs -f app"
echo "Для остановки используйте: docker-compose down" 