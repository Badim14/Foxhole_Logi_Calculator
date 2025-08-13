# 🚨 Устранение неполадок Docker

## Общие проблемы

### 1. Порт уже занят

**Ошибка**: `Error: listen EADDRINUSE: address already in use :::3000`

**Решение**:
```bash
# Остановить все контейнеры
docker-compose down

# Проверить, что порт свободен
netstat -an | grep :3000

# Если порт занят другим процессом, остановить его
# В Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# В Linux/macOS:
lsof -i :3000
kill -9 <PID>
```

### 2. Проблемы с базой данных

**Ошибка**: `Connection refused` или `timeout`

**Решение**:
```bash
# Проверить статус контейнера БД
docker-compose ps db

# Перезапустить БД
docker-compose restart db

# Проверить логи БД
docker-compose logs db

# Если проблема в данных, пересоздать том
docker-compose down -v
docker-compose up -d
```

### 3. Проблемы с правами доступа

**Ошибка**: `Permission denied` при монтировании томов

**Решение**:
```bash
# В Windows: запустить PowerShell от имени администратора
# В Linux/macOS:
sudo chown -R $USER:$USER .

# Или изменить права на папки
chmod -R 755 .
```

### 4. Проблемы с памятью

**Ошибка**: `Out of memory` или медленная работа

**Решение**:
```bash
# Увеличить лимиты Docker в настройках
# В Docker Desktop: Settings -> Resources -> Memory

# Очистить неиспользуемые ресурсы
docker system prune -a
docker volume prune
```

## Специфичные проблемы

### 1. Node.js приложение не запускается

**Проверка**:
```bash
# Посмотреть логи приложения
docker-compose logs app

# Проверить, что все файлы скопированы
docker exec -it foxhole-app-1 ls -la /app

# Проверить зависимости
docker exec -it foxhole-app-1 npm list
```

**Решение**:
```bash
# Пересобрать образ
docker-compose build --no-cache app

# Перезапустить
docker-compose up -d

# Или использовать полную пересборку:
# В Windows PowerShell:
.\rebuild.ps1

# В Linux/macOS:
./rebuild.sh
```

### 2. Модули не найдены (Cannot find module)

**Ошибка**: `Error: Cannot find module 'axios'` или подобные

**Причина**: Зависимости не установлены корректно в контейнере

**Решение**:
```bash
# Остановить контейнеры
docker-compose down

# Удалить образы
docker-compose down --rmi all

# Очистить Docker кэш
docker system prune -f

# Пересобрать с нуля
docker-compose up --build -d
```

### 3. Проблемы с парсером данных

**Проверка**:
```bash
# Запустить парсер вручную
docker exec -it foxhole-app-1 node server/pars.js

# Проверить логи
docker-compose logs app | grep -i parser
```

**Решение**:
```bash
# Проверить доступ к интернету из контейнера
docker exec -it foxhole-app-1 ping google.com

# Проверить права на папку images
docker exec -it foxhole-app-1 ls -la server/images
```

### 4. Проблемы с изображениями

**Ошибка**: Изображения не загружаются

**Решение**:
```bash
# Проверить, что папка images смонтирована
docker exec -it foxhole-app-1 ls -la /app/server/images

# Пересоздать папку images
rm -rf server/images
mkdir -p server/images/items server/images/materials

# Перезапустить приложение
docker-compose restart app
```

## Полезные команды

### Диагностика
```bash
# Статус всех контейнеров
docker-compose ps

# Использование ресурсов
docker stats

# Информация о сети
docker network ls
docker network inspect foxhole_foxhole-network

# Информация о томах
docker volume ls
docker volume inspect foxhole_postgres_data
```

### Очистка
```bash
# Остановить и удалить все контейнеры
docker-compose down

# Удалить все образы
docker-compose down --rmi all

# Удалить все тома (ВНИМАНИЕ: данные будут потеряны!)
docker-compose down -v

# Полная очистка Docker
docker system prune -a --volumes
```

### Восстановление
```bash
# Создать резервную копию БД
docker exec foxhole-db-1 pg_dump -U foxhole foxhole > backup.sql

# Восстановить БД из резервной копии
docker exec -i foxhole-db-1 psql -U foxhole foxhole < backup.sql
```

## Логи и отладка

### Включение подробного логирования
```bash
# В docker-compose.yml добавить:
environment:
  - NODE_ENV=development
  - DEBUG=*
  - LOG_LEVEL=debug
```

### Просмотр логов в реальном времени
```bash
# Все сервисы
docker-compose logs -f

# Только приложение
docker-compose logs -f app

# Только БД
docker-compose logs -f db

# Последние 100 строк
docker-compose logs --tail=100 app
```

## Контакты

Если проблема не решается, создайте Issue в репозитории с:
1. Описанием проблемы
2. Логами ошибок
3. Версией Docker
4. Операционной системой
5. Шагами для воспроизведения 