#!/bin/bash

# start services
service dbus start
service bluetooth start

exec NODE_ENV=production node dist/src/main.js