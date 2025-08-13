# Используем официальный образ Node.js
FROM node:18-alpine

# Устанавливаем необходимые пакеты
RUN apk add --no-cache postgresql-client

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json из корня проекта
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем остальные файлы
COPY . .

# Создаем необходимые директории
RUN node server/pars.js

# Устанавливаем правильные права доступа
RUN chown -R node:node /app
USER node

# Открываем порт, на котором работает приложение
EXPOSE 3000

# Запускаем приложение
CMD ["node", "server/index.js"]