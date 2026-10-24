FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-venv python3-pip ca-certificates coreutils \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir faster-whisper 'av<19'
ENV PYTHON=/opt/venv/bin/python3

WORKDIR /app
COPY screenshare/package.json ./
RUN npm install --omit=dev
COPY screenshare/server.js screenshare/render.js screenshare/fonts.js ./screenshare/
COPY media.js transcribe.js transcribe.py cuts.js plan.js config.js draw.js ./
COPY *.woff2 ./fonts/

ENV NODE_ENV=production PORT=8080 DATA_DIR=/data/screenshare \
    MUSIC_DIR=/bedit-data/music MUSIC_STATE=/bedit-data/state.json \
    WHISPER_MODEL=small X264_PRESET=veryfast X264_CRF=19
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "screenshare/server.js"]
