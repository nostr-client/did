/**
 * did.js — did:nostr identity documents. No build, no deps.
 * Spec: https://did-nostr.com/
 *
 * Part of https://github.com/nostr-client — one repo, one thing.
 * License: AGPL-3.0-or-later
 *
 * The data model: a nostr public key IS the identifier.
 *   did:nostr:<64-char lowercase hex pubkey>
 * Hex is the primitive (as everywhere in nostr-client); the DID wraps it in
 * a W3C-standard envelope so nostr identities interop with DID tooling,
 * Solid/WebID, and NIP-98-style auth.
 *
 * Three resolution tiers:
 *   1. offline — didDocument(pubkey): derived from the key alone
 *   2. http    — https://<domain>/.well-known/did/nostr/<pubkey>.json
 *   3. relays  — enhance with kind 0 (profile) and kind 10002 (relay list)
 */

const HEX32 = /^[0-9a-f]{64}$/

export const DID_CONTEXT = [
  'https://www.w3.org/ns/cid/v1',
  'https://w3id.org/nostr/context',
]

function assertPubkey(hex) {
  if (typeof hex !== 'string' || !HEX32.test(hex)) {
    throw new Error('expected 64-char lowercase hex pubkey, got: ' + hex)
  }
  return hex
}

/** hex pubkey → 'did:nostr:<hex>' */
export function didFromPubkey(pubkey) {
  return 'did:nostr:' + assertPubkey(pubkey)
}

/** 'did:nostr:<hex>' → hex pubkey (the primitive) */
export function pubkeyFromDid(did) {
  const m = /^did:nostr:([0-9a-f]{64})$/.exec(String(did).trim())
  if (!m) throw new Error('not a did:nostr identifier: ' + did)
  return m[1]
}

/**
 * Multikey encoding of a secp256k1 x-only pubkey:
 * 'f' (base16 multibase) + 'e701' (secp256k1-pub multicodec) + parity + hex.
 * Nostr keys are x-only; parity defaults to 02 (even y).
 */
export function multikeyFromPubkey(pubkey, parity = '02') {
  return 'f' + 'e701' + parity + assertPubkey(pubkey)
}

/** Tier 1 — minimal DID document, derived offline from the pubkey alone. */
export function didDocument(pubkey, { relays = [], alsoKnownAs = [] } = {}) {
  const did = didFromPubkey(pubkey)
  const doc = {
    '@context': DID_CONTEXT,
    id: did,
    type: 'DIDNostr',
    verificationMethod: [
      {
        id: did + '#key1',
        type: 'Multikey',
        controller: did,
        publicKeyMultibase: multikeyFromPubkey(pubkey),
      },
    ],
    authentication: ['#key1'],
    assertionMethod: ['#key1'],
    service: relays.map((url, i) => ({
      id: did + '#relay' + i,
      type: 'NostrRelay',
      serviceEndpoint: url,
    })),
  }
  if (alsoKnownAs.length) doc.alsoKnownAs = alsoKnownAs
  return doc
}

/** Tier 2 — fetch a hosted document from a domain's .well-known, or null. */
export async function fetchWellKnown(domain, pubkey, { fetchFn = fetch } = {}) {
  assertPubkey(pubkey)
  try {
    const res = await fetchFn(`https://${domain}/.well-known/did/nostr/${pubkey}.json`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Tier 3 — resolve a did:nostr (or bare hex pubkey) into an enhanced document
 * using nostr relays: kind 0 fills alsoKnownAs (website, nip05), kind 10002
 * fills relay service endpoints. Falls back gracefully to the offline doc.
 *
 * `pool` is anything with .get(filter) / .list(filters) — e.g.
 * https://nostr-client.github.io/pool/pool.js
 */
export async function resolve(didOrPubkey, { pool, wellKnown = true } = {}) {
  const pubkey = String(didOrPubkey).startsWith('did:')
    ? pubkeyFromDid(didOrPubkey)
    : assertPubkey(String(didOrPubkey).toLowerCase())

  let profile = null
  const relays = []
  const alsoKnownAs = []

  if (pool) {
    const [profileEvent, relayListEvent] = await Promise.all([
      pool.get({ kinds: [0], authors: [pubkey] }),
      pool.get({ kinds: [10002], authors: [pubkey] }),
    ])
    if (profileEvent) {
      try { profile = JSON.parse(profileEvent.content) } catch {}
    }
    if (relayListEvent) {
      for (const tag of relayListEvent.tags) if (tag[0] === 'r' && tag[1]) relays.push(tag[1])
    }
    if (profile?.website) alsoKnownAs.push(profile.website)
    if (profile?.nip05) alsoKnownAs.push('acct:' + profile.nip05.replace(/^_@/, ''))
  }

  let hosted = null
  const nip05Domain = profile?.nip05?.split('@')[1]
  if (wellKnown && nip05Domain) {
    hosted = await fetchWellKnown(nip05Domain, pubkey)
  }

  const doc = hosted ?? didDocument(pubkey, { relays, alsoKnownAs })
  return { did: didFromPubkey(pubkey), document: doc, profile, source: hosted ? 'well-known' : pool ? 'relays' : 'offline' }
}
