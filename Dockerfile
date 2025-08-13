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

# Копируем остальные файлы (исключая .env)
COPY . .

# Создаем необходимые директории
RUN mkdir -p logs server/images/items server/images/materials

# Устанавливаем правильные права доступа
RUN chown -R node:node /app
USER node

# Открываем порт, на котором работает приложение
EXPOSE 3000

# Создаем точку входа, которая сначала запустит парсер, затем сервер
ENTRYPOINT ["sh", "-c"]
CMD ["node /app/server/pars.js && node server/index.js"]