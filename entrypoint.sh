#!/bin/bash

# start services
service dbus start
service bluetooth start

exec node dist/src/main.js