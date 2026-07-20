#!/bin/bash

# Create certs directory if it doesn't exist
mkdir -p certs

# Generate a self-signed certificate and private key
# -nodes: Don't encrypt the private key
# -days 365: Valid for one year
# -newkey rsa:2048: Generate a new 2048-bit RSA key
# -keyout: Where to save the private key
# -out: Where to save the certificate
# -subj: Provide certificate information to avoid interactive prompts
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -subj "/C=US/ST=State/L=City/O=Organization/OU=Unit/CN=localhost"

echo "Certificates generated in ./certs folder:"
echo "  - certs/server.key"
echo "  - certs/server.crt"
