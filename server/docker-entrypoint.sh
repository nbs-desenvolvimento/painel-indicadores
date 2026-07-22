#!/bin/sh
set -e

node migrate.mjs
node seed-db.mjs

exec node dist/index.js
