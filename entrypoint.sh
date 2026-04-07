#!/bin/bash

# Use the host dbus socket (mounted via docker-compose)
# Do NOT start dbus-daemon here — it would overwrite the host socket at /var/run/dbus/system_bus_socket
service bluetooth start

exec node dist/src/main.js