#!/usr/bin/env bash

# the acme.sh client script, installed via Git in the Dockerfile...
ACME_BIN="$(realpath ~/.acme.sh/acme.sh)"

# Setting dns service api env vars
export DO_API_KEY=$DIGITALOCEAN_API_TOKEN

# issue certs
"$ACME_BIN" --issue -d "${TLD}" -d "*.${TLD}" --dns dns_dgon --log

echo "Running reverse proxy..."
npm start
