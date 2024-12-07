###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM node:20-alpine As development

# Create app directory
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure copying both package.json AND package-lock.json (when available).
# Copying this first prevents re-running npm install on every code change.
COPY --chown=node:node package*.json ./

RUN apk add --update python3 make g++\
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

FROM node:20-alpine As build

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./

# In order to run `npm run build` we need access to the Nest CLI which is a dev dependency. In the previous development stage we ran `npm ci` which installed all dependencies, so we can copy over the node_modules directory from the development image
COPY --chown=node:node --from=development /usr/src/app/node_modules ./node_modules

COPY --chown=node:node . .

# Run the build command which creates the production bundle
RUN npm run build

# Set NODE_ENV environment variable
ENV NODE_ENV production

RUN apk add --update python3 make g++\
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
    musl-dev

#( musl-dev link to execute epoll/bindings )    
# RUN ln -s /usr/lib/aarch64-linux-musl/libc.so /lib/libc.musl-armv7.so.1    
RUN ln -s /usr/lib/aarch64-linux-musl/libc.so /lib/libc.musl-aarch64.so.1
ENV APP_PORT 3000
ENV SOCKET_SERVER "http://192.168.1.11:5001"
ENV SOCKET_SERVER_LOCAL "http://127.0.0.1:5001"
ENV INITIAL_PASSWORD 'CLV_Box-121715!'

# Copy the bundled code from the build stage to the production image
COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=build /usr/src/app/dist ./dist

COPY entrypoint.sh .
CMD ./entrypoint.sh

# Start the server using the production build
CMD [ "node", "dist/src/main.js" ]
