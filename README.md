# did

[did:nostr](https://did-nostr.com/) identity documents for nostr keys.
**Zero dependencies. No build step.** One file: [`did.js`](did.js). Works in
browsers, node, and workers.

Part of [nostr-client](https://github.com/nostr-client) — a modular, composable
nostr client where each repo does one thing.

**Live demo:** https://nostr-client.github.io/did/

## The data model

A nostr public key **is** the identifier:

```
did:nostr:82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2
```

Hex is the primitive — as everywhere in nostr-client — and the DID wraps it in
a W3C-standard envelope, so nostr identities interoperate with DID tooling,
Solid/WebID (`alsoKnownAs`), and HTTP auth (NIP-98).

## Use

```js
import { didFromPubkey, pubkeyFromDid, didDocument, resolve }
  from 'https://nostr-client.github.io/did/did.js'

didFromPubkey(hex)              // 'did:nostr:<hex>'
pubkeyFromDid('did:nostr:…')    // back to the hex primitive

// Tier 1 — offline, derived from the key alone
didDocument(hex)                // minimal W3C DID document (Multikey, auth, assertion)

// Tier 2 + 3 — enhanced from .well-known and relays
import { defaultPool } from 'https://nostr-client.github.io/pool/pool.js'
const { did, document, profile, source } = await resolve(hex, { pool: defaultPool() })
// kind 0     → alsoKnownAs (website, acct:nip05)
// kind 10002 → NostrRelay service endpoints
// nip05 domain → tries https://<domain>/.well-known/did/nostr/<pubkey>.json
```

## Resolution tiers

1. **offline** — `didDocument(pubkey)`: no network, always works
2. **http** — `https://<domain>/.well-known/did/nostr/<pubkey>.json`
3. **relays** — profile + relay list events enhance the document

## License

AGPL-3.0-or-later
