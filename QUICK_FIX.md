# 🚀 Быстрое исправление проблемы с модулями

## Проблема
```
Error: Cannot find module 'axios'
```

## Быстрое решение (1 минута)

### В Windows PowerShell:
```powershell
.\rebuild.ps1
```

### В Linux/macOS:
```bash
./rebuild.sh
```

### Вручную:
```bash
# Остановить контейнеры
docker-compose down

# Удалить образы
docker-compose down --rmi all

# Очистить кэш
docker system prune -f

# Пересобрать
docker-compose up --build -d
```

## Что происходит
1. **Проблема**: Зависимости не установлены в контейнере
2. **Причина**: Неправильное монтирование томов или кэш Docker
3. **Решение**: Полная пересборка образа

## Проверка
После пересборки проверьте:
```bash
# Статус контейнеров
docker-compose ps

# Логи приложения
docker-compose logs app

# Веб-интерфейс
http://localhost:3000
```

## Если проблема повторяется
1. Проверьте, что Docker Desktop запущен
2. Убедитесь, что у Docker достаточно памяти (минимум 4GB)
3. Перезапустите Docker Desktop
4. Используйте скрипт `rebuild.ps1` или `rebuild.sh` 