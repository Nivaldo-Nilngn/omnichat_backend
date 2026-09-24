FROM node:18-slim

# Instala as dependências do sistema operacionais necessárias para o Chromium (Puppeteer/WhatsApp) rodar na nuvem
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libnss3 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala os pacotes do Node
COPY package*.json ./
RUN npm install

# Copia o resto do código
COPY . .

# Expõe a porta que o Render vai usar
EXPOSE 3000

# Comando para iniciar o robô
CMD ["npm", "start"]
