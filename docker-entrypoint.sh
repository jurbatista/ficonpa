#!/bin/sh
set -e
# Volumes montados (Docker/Easypanel) podem chegar como root: garante que o app consegue gravar.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data/attachments
  chown -R nextjs:nodejs /app/data 2>/dev/null || true
  exec su-exec nextjs:nodejs "$@"
fi
exec "$@"
