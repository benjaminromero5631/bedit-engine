FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-venv python3-pip ca-certificates coreutils \
    && rm -rf /var/lib/apt/lists/*

# Whisper (faster-whisper) en un entorno aislado
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir faster-whisper
ENV PYTHON=/opt/venv/bin/python3

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# Los archivos están sueltos en el repo; aquí se ordenan en sus carpetas
RUN mkdir -p src/core python fonts
COPY cuts.js config.js draw.js plan.js ./src/core/
COPY server.js jobs.js pipeline.js render.js media.js transcribe.js fonts.js ./src/
COPY transcribe.py ./python/
COPY *.woff2 ./fonts/

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=8080 \
    WHISPER_MODEL=small \
    X264_PRESET=slow \
    X264_CRF=17

VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
