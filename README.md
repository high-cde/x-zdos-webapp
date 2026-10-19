# ZDOS eNET web app

Interfaccia locale per i moduli web ZDOS. Le pagine mantengono i layout esistenti e usano solo risorse servite dallo stesso host. Non caricano font, script, immagini o tracker pubblicitari di terze parti. Il service worker blocca le richieste cross-origin e mette in cache la shell statica per la consultazione offline.

## Stato reale

- `src/server.js` avvia un server Fastify che serve le pagine, le immagini locali, la manifest e il service worker.
- `/api/v1/session` restituisce l’identità della sessione OIDC corrente senza esporre il token; la pagina account collega login, stato registrazione, workspace e logout alle route server.
- L'app web è installabile e offre pagine statiche offline. API, login, workspace e generazione richiedono il server online sulla rete locale.
- zFLOW collega l'interfaccia al servizio missioni persistenti per workspace già presente nell'API.
- La console admin in `/admin.html` mostra i workspace amministrati, conteggi missioni, roster e registro eventi; permette di aggiornare missioni e ruoli dei membri esistenti. L'ultimo amministratore non può essere rimosso. Non offre accesso alla VPS o alle impostazioni segrete del server.
- `/auth/register` avvia l’iscrizione OIDC con email verificata. È disabilitata per impostazione predefinita; `SELF_SERVICE_SIGNUP=true` consente all’utente nuovo di creare un workspace personale e diventarne admin. Applica `npm run migrate:up` e abilita la registrazione nel provider OIDC prima di attivarla.
- `/enet.html` descrive servizi realmente presenti e componenti non ancora implementati. Il miner Wallet esegue un benchmark PoW SHA-256 locale, con start/stop e intensità configurabile; non emette né accredita $DSN.
- `/downloads.html` collega il download ISO e checksum alle release ufficiali del repository ZDOS. Il workflow di release pubblica gli asset dopo la build e il boot QEMU; una release apparirà dopo la creazione/push di un tag `zdos-v*` e il completamento della pipeline.
- ZDOS Organism offre un gateway per un modello configurato sul server tramite protocollo OpenAI-compatible. Il gateway non è inferenza nativa ZLang; il runtime residente ZDOS è un componente distinto.
- PostgreSQL e OIDC sono necessari per sessioni e dati di workspace. Pagamenti e operazioni on-chain restano disattivati.

Questa app non è la distro ZDOS, non implementa il compilatore ZLang e non attesta che una rete eNET sia stata avviata. La disponibilità del servizio dipende dalla configurazione e dai test sul nodo locale.

## Avvio locale

Requisiti: Node.js 22 o 24 e dipendenze dal `package-lock.json`.

```sh
npm ci
npm start
```

Apri `http://127.0.0.1:3000`. Per renderla raggiungibile dalla rete privata, imposta `HOST` sull'indirizzo LAN del server e `APP_BASE_URL` sull'origine usata dai client. Configura un PostgreSQL e un provider OIDC raggiungibili solo dalla rete privata; i dettagli e le credenziali restano in variabili d'ambiente, mai nel repository. Configura `ORGANISM_API_BASE_URL`, `ORGANISM_MODEL` e, se richiesto, `ORGANISM_API_KEY` per un modello compatibile ospitato nella rete locale.

Il server non migra né inizializza database automaticamente. Esegui le migrazioni e il bootstrap workspace solo contro il database locale scelto dall'operatore. Non esporre le porte su interfacce Internet.

## Verifiche

```sh
npm test
bash tests/smoke.sh
```

I test API usano dipendenze iniettate e non sostituiscono una prova con database, OIDC e modello reali. Prima di aprire il servizio ad altri dispositivi, verificare login, ruoli, isolamento workspace, modalità offline, firewall e assenza di traffico verso host esterni.

## Componenti ZDOS

Vedi [architettura](docs/ARCHITECTURE.md), [stato della repository](docs/OVERVIEW.md), [ZDOS Organism](docs/ORGANISM.md) e la specifica [eNET](docs/ENET.md). La web app è uno strato d'interfaccia; distro, runtime residente e compilatore ZLang hanno build e verifiche proprie.
