FROM node:18-slim

# Chromium 의존성 설치
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto-cjk \
    fonts-noto-cjk-extra \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer가 시스템 Chromium 사용하도록 설정
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
