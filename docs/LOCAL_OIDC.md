# Sviluppo locale con PostgreSQL e OIDC

Il profilo locale usa PostgreSQL per workspace/sessioni, Keycloak come provider
OIDC e Mailpit per ricevere le email di verifica. Tutte le porte pubblicate
sono associate a loopback. I segreti e le password inclusi sono esclusivi
dell'ambiente locale: non riutilizzarli in staging o produzione.

## Avvio

Requisiti: Docker Engine con Compose v2, Node.js 22 o 24, npm e dipendenze
installate (`npm ci`). Da questa directory:

```sh
cp .env.oidc-dev.example .env.oidc-dev
docker compose --env-file .env.oidc-dev -f compose.oidc-dev.yaml up -d --wait
set -a
. ./.env.oidc-dev
set +a
node scripts/wait-oidc-dev.js
npm run migrate:up
npm start
```

Aprire l'app su `http://localhost:3000`. Keycloak è su
`http://localhost:8080`; l'amministratore realm iniziale è `local-admin` con
password `local-admin-only-password`. La registrazione OIDC è abilitata nel
realm e `SELF_SERVICE_SIGNUP=true` fa comparire il pulsante di registrazione
nella pagina account. Registrando un utente, Keycloak invia il link di verifica
a Mailpit (`http://localhost:8025`); aprirlo per completare il flusso. Dopo il
callback, l'app crea il profilo e il workspace personale in PostgreSQL.

La route `/api/v1/session` restituisce l'identità della sessione attiva; senza
sessione valida risponde `401`. Logout revoca il record sul database e azzera
il cookie. La scadenza viene verificata a ogni richiesta.

## Arresto e reset

Per arrestare i servizi mantenendo il database:

```sh
docker compose --env-file .env.oidc-dev -f compose.oidc-dev.yaml down
```

Per eliminare anche il database locale e ricominciare da zero:

```sh
docker compose --env-file .env.oidc-dev -f compose.oidc-dev.yaml down --volumes
```

Il Compose è isolato dal deployment: non configura DNS, redirect URI, account,
database o credenziali del sito pubblico. Non usare questo profilo per un
servizio esposto in rete.
