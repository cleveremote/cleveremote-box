###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM node@sha256:86961ea56cf2f0fb3ab06be4f3881714980413c57ef0b8d3860d69234d94bcbf As development

# Create app directory
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure copying both package.json AND package-lock.json (when available).
# Copying this first prevents re-running npm install on every code change.
COPY --chown=node:node package*.json ./

RUN apk add --update python3 make g++ linux-headers \
   && rm -rf /var/cache/apk/*

# Install app dependencies using the `npm ci` command instead of `npm install`
RUN npm ci

# Bundle app source
COPY --chown=node:node . .

# Use the node user from the image (instead of the root user)
USER node

###################
# BUILD FOR PRODUCTION
###################

FROM node@sha256:86961ea56cf2f0fb3ab06be4f3881714980413c57ef0b8d3860d69234d94bcbf As build

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./

# In order to run `npm run build` we need access to the Nest CLI which is a dev dependency. In the previous development stage we ran `npm ci` which installed all dependencies, so we can copy over the node_modules directory from the development image
COPY --chown=node:node --from=development /usr/src/app/node_modules ./node_modules

COPY --chown=node:node . .

# Run the build command which creates the production bundle
RUN npm run build

RUN apk add --update python3 make g++ linux-headers \
   && rm -rf /var/cache/apk/*

# Running `npm ci` removes the existing node_modules directory and passing in --only=production ensures that only the production dependencies are installed. This ensures that the node_modules directory is as optimized as possible
RUN npm ci --only=production && npm cache clean --force

USER node

###################
# PRODUCTION
###################

# need to be on node and not node:aline because we can't install needed packages for bluetooth on it
FROM node@sha256:51870906e4c02a9c8076848dfaca4fd2329630c945e81e06d1cb1a475c042919 As production

# install needed packages for bluetooth to work + build tools to recompile native modules for glibc
RUN apt-get update && apt-get install -y \
    bluez \
    dbus \
    musl-dev \
    network-manager \
    python3 \
    python3-pip \
    python3-gpiozero \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

#( musl-dev link to execute epoll/bindings )
# RUN ln -s /usr/lib/aarch64-linux-musl/libc.so /lib/libc.musl-armv7.so.1
RUN ln -s /usr/lib/aarch64-linux-musl/libc.so /lib/libc.musl-aarch64.so.1

ENV APP_PORT 3000
ENV SOCKET_SERVER "http://ec2-35-180-231-37.eu-west-3.compute.amazonaws.com:5001"
ENV SOCKET_SERVER_LOCAL "http://127.0.0.1:5001"
ENV INITIAL_PASSWORD 'CLV_Box-121715!'
ENV DB_PATH '/home/clv/db'

COPY --chown=node:node --from=build /usr/src/app/package*.json ./

# Copy the bundled code from the build stage to the production image
COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=build /usr/src/app/dist ./dist

# Recompile native modules for glibc (production stage is Debian, build stage was Alpine/musl)
RUN npm rebuild
COPY ./ctrl-pwm.py /app/ctrl-pwm.py

COPY entrypoint.sh .
# create folder for data base db
CMD ./entrypoint.sh


CMD node dist/src/main.js

# # Start the server using the production build
# CMD [ "node", "dist/src/main.js" ]
