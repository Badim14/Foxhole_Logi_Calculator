# Используем официальный образ Node.js
FROM node:18-alpine

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY ./package*.json ./server/

# Устанавливаем зависимости сервера
RUN cd server && npm install

# Копируем остальные файлы
COPY . .

# Собираем приложение (если нужно)
# RUN npm run build

# Открываем порт, на котором работает приложение
EXPOSE 3000

# Запускаем приложение
CMD ["node", "server/index.js"]