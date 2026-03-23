FROM node:18-slim

# Pin Chrome for Testing to an exact build so local and remote behavior stay aligned.
ARG CHROME_VERSION=133.0.6943.141

# OS 패키지로 Chromium을 미리 설치하여 npm install 중 수백 메가의 브라우저 다운로드를 스킵합니다.
# (apt 미러가 npm에서 다운받는 것보다 훨씬 빠르고 안정적입니다)
RUN apt-get update && apt-get install -y \
  wget gnupg ca-certificates unzip \
  chromium \
  fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    wget -q -O /tmp/chrome-linux64.zip "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip"; \
    rm -rf /opt/chrome; \
    unzip -q /tmp/chrome-linux64.zip -d /opt/chrome; \
    rm -f /tmp/chrome-linux64.zip; \
    ln -sf /opt/chrome/chrome-linux64/chrome /usr/local/bin/chrome-for-testing; \
    ln -sf /opt/chrome/chrome-linux64/chrome /usr/bin/chromium; \
    /opt/chrome/chrome-linux64/chrome --version

RUN useradd -u 1001 -m user

WORKDIR /app
RUN chown -R user:user /app

# npm install 시 Puppeteer가 자체적으로 Chrome을 다운로드하지 않도록 환경 변수 설정
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/opt/chrome/chrome-linux64/chrome

USER user
COPY --chown=user:user src/package*.json ./src/

WORKDIR /app/src
RUN npm install --no-fund --no-audit

WORKDIR /app
COPY --chown=user:user src/ ./src/
COPY --chown=user:user template/ ./template/
COPY --chown=user:user exploit/ ./exploit/

ENV NODE_ENV=production
ENV PORT=1337

WORKDIR /app/src
CMD ["npm", "start"]
