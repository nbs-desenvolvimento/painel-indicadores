#!/bin/sh
set -e

node migrate.mjs
node seed-db.mjs
node backfill-user-companies.mjs

exec node dist/index.js
