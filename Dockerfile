###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM node@sha256:b5b9467fe7b33aad47f1ec3f6e0646a658f85f05c18d4243024212a91f3b7554 As development

# Create app directory
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure copying both package.json AND package-lock.json (when available).
# Copying this first prevents re-running npm install on every code change.
COPY --chown=node:node package*.json ./

RUN apk add --update python3 make g++ linux-headers\
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

FROM node@sha256:b5b9467fe7b33aad47f1ec3f6e0646a658f85f05c18d4243024212a91f3b7554 As build

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./

# In order to run `npm run build` we need access to the Nest CLI which is a dev dependency. In the previous development stage we ran `npm ci` which installed all dependencies, so we can copy over the node_modules directory from the development image
COPY --chown=node:node --from=development /usr/src/app/node_modules ./node_modules

COPY --chown=node:node . .

# Run the build command which creates the production bundle
RUN npm run build

RUN apk add --update python3 make g++ linux-headers\
   && rm -rf /var/cache/apk/*

# Running `npm ci` removes the existing node_modules directory and passing in --only=production ensures that only the production dependencies are installed. This ensures that the node_modules directory is as optimized as possible
RUN npm ci --only=production && npm cache clean --force

USER node

###################
# PRODUCTION
###################

# need to be on node and not node:aline because we can't install needed packages for bluetooth on it
FROM node:20 As production

# install needed packages for bluetooth to work ( musl-dev needed to build epoll on/off access lib )
RUN apt-get update && apt-get install -y \
    bluez \
    dbus \
    musl-dev \
    network-manager \
    python3 \
    python3-pip \
    python3-gpiozero
    

#( musl-dev link to execute epoll/bindings )    
# RUN ln -s /usr/lib/aarch64-linux-musl/libc.so /lib/libc.musl-armv7.so.1    
RUN ln -s /usr/lib/aarch64-linux-musl/libc.so /lib/libc.musl-aarch64.so.1

ENV APP_PORT 3000
ENV SOCKET_SERVER "http://ec2-35-180-231-37.eu-west-3.compute.amazonaws.com:5001"
ENV SOCKET_SERVER_LOCAL "http://127.0.0.1:5001"
ENV INITIAL_PASSWORD 'CLV_Box-121715!'
ENV DB_PATH '/home/clv/db'

# Copy the bundled code from the build stage to the production image
COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=build /usr/src/app/dist ./dist
COPY ./ctrl-pwm.py /app/ctrl-pwm.py

COPY entrypoint.sh .
# create folder for data base db
CMD ./entrypoint.sh


CMD node dist/src/main.js & \
    python3 /app/ctrl-pwm.py

# # Start the server using the production build
# CMD [ "node", "dist/src/main.js" ]
