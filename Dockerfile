# Используем официальный образ Node.js
FROM node:18-alpine

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json из корня проекта
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем остальные файлы
COPY . .

# Создаем директорию для логов
RUN mkdir -p logs

# Открываем порт, на котором работает приложение
EXPOSE 3000

# Запускаем приложение
CMD ["node", "server/index.js"]