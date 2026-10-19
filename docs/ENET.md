# eNET by ZDOS: stato e implementazione locale

## Disponibile in questa repository

- Le pagine ZDOS sono servite dallo stesso processo Fastify dell'API.
- Tutti i percorsi web interni sono relativi allo stesso host. Le pagine non caricano font, script o immagini da host esterni.
- Il service worker blocca risorse e fetch cross-origin, conserva in cache la shell pubblica e non memorizza risposte API, health check o sessioni. Le navigazioni complete verso l’issuer OIDC configurato restano consentite per il login; missioni e generazione richiedono il server online.
- Non ci sono annunci o popup del browser. Le azioni non disponibili aggiornano messaggi inline.

Questa è una shell web locale/offline, non una rete eNET autonoma: non implementa discovery di nodi, routing, DNS, identità distribuite, chat ZComm o trasporto voce. L'IP/rete indicato come `80.24` non è definito nei sorgenti disponibili come CIDR, interfaccia o servizio; non viene assegnato automaticamente.

La pagina `/enet.html` riepiloga lo stato host/API e separa la shell web dai servizi di rete ancora mancanti. Il Wallet include una challenge PoW SHA-256 generata localmente per misurare l’hashrate del dispositivo. Il risultato non è una share inviata a un protocollo, non crea saldo e non accredita $DSN TokenAI.

## Avvio sicuro nella rete privata

1. Scegli un indirizzo LAN stabile per il nodo ZDOS e una rete privata amministrata dall'operatore. Non riutilizzare un indirizzo o prefisso finché non è verificato che non sia già assegnato.
2. Configura `HOST` sull'indirizzo LAN specifico del nodo, non su `0.0.0.0`, e imposta `APP_BASE_URL` sull'origine interna usata dai client.
3. Metti database, OIDC e modello generativo sulla stessa rete privata. L'app richiede PostgreSQL/OIDC per le funzioni protette; l'AI va configurata con un endpoint locale compatibile. Nessun provider esterno è preimpostato.
4. Usa TLS con una CA fidata dai dispositivi interni. Consenti nel firewall soltanto le porte necessarie dalla LAN autorizzata; blocca forwarding WAN e accessi in ingresso non richiesti.
5. Verifica dal browser e dai log di rete che pagine, manifest, service worker, login, API e AI contattino solo host interni. La protezione del service worker vale dopo la sua installazione e non sostituisce firewall o policy server-side.

`src/config.js` usa loopback come default. Nessuna migrazione, binding LAN, regola firewall o servizio di rete viene attivato automaticamente.

## ZComm ed estensione eNET

ZComm non è implementato in questo checkout. Prima di aggiungere messaggistica, SIP o WebRTC servono un repository sorgente verificabile, un protocollo/versione, un modello di identità e gruppi, limiti di discovery, cifratura e chiavi, policy di conservazione dei dati, gestione abuso e test isolati tra due nodi locali. La prima integrazione dovrebbe essere LAN-only e non fornire gateway Internet o relay esterni. Voice/video, annunci e pop-up non vengono simulati.
