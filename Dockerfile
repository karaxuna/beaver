FROM node:16.10.0-alpine

# Define working dir
WORKDIR /usr/src/app

# Install deps
RUN apk add --update bash \
    curl \
    git \
    openssl \
    ncurses \
    socat \
    nodejs \
    nodejs-npm

# from https://github.com/Neilpang/acme.sh/releases/tag/3.0.1
RUN git clone https://github.com/Neilpang/acme.sh.git && \
    cd acme.sh && \
    git fetch && git fetch --tags && \
    git checkout 3.0.1 . && \
    ./acme.sh --install  \
    --cert-home /acme.sh

# Copy deps
COPY package*.json ./
RUN true

# Install deps
RUN npm i --loglevel notice --unsafe-perm

# Build
COPY ./src ./src
COPY tsconfig.json .
RUN npm run build

# Copy bin
COPY ./bin ./bin

# CMD
CMD [ "npm", "start" ]
