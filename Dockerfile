# downydowndown — single image that serves the UI and runs yt-dlp + ffmpeg.
FROM node:20-slim

# System deps: ffmpeg for merging/converting, python3 + yt-dlp for fetching.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ffmpeg python3 ca-certificates curl \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["npm", "start"]
