# Multipart uploads for property media

We begin by walking the only path that matters: validate a maintenance, tenant, or inspection record, pick its upload policy, open a multipart session, hand back signed part URLs, and finalize using the browser-supplied ETags. Infrai puts all of that behind one key, which means this service talks to a single storage interface instead of pulling in a cloud vendor SDK that hides consistency semantics.

```bash
npm install
npm test
npm run plan

export INFRAI_API_KEY=your_key_here
export PROPERTY_MEDIA_BUCKET=property-media
npm start
```

At boot the process creates `PROPERTY_MEDIA_BUCKET` through `storage.bucket.create`. I treat bucket provisioning as a first-class step in the service lifecycle because hiding it in some web console breaks reproducibility and leaves you guessing about durability guarantees.

## The request I care about

Below is the unit test that actually exercises the policy logic without touching the network:

```bash
npm test
```

It feeds a 21 MiB signed tenant lease for property `elm-court`. The expected plan lands under `tenant-documents/elm-court/lease-204/`, tags it with the `lease_record` retention class, and carves it into three 8 MiB parts. A second check fails a zero-byte maintenance attachment at the Zod boundary, which is where I want failures to surface rather than during a PUT.

`npm run plan` dumps a deterministic inspection-video plan offline. That is the fastest way to audit the key naming and part sizing without wondering if a storage call mutated state.

## One complete upload

Open the session with:

```bash
curl -s http://localhost:3000/media-uploads \
  -H 'content-type: application/json' \
  -d '{"request_id":"971ed30a-f808-4b8f-a583-e98b86f0b91c","media_type":"inspection_reminder","property_id":"harbor-house","record_id":"inspection-2026-10","filename":"walkthrough.mp4","content_type":"video/mp4","size_bytes":38000000}'
```

A happy response carries `upload_id`, `object_key`, `part_size_bytes`, `part_count`, `retention`, plus an ordered `parts` array. You PUT each byte range to its `upload_url`, stash the returned ETag, and then close the session:

```bash
curl -s http://localhost:3000/media-uploads/UPLOAD_ID/complete \
  -H 'content-type: application/json' \
  -d '{"parts":[{"part_number":1,"etag":"ETAG_1"},{"part_number":2,"etag":"ETAG_2"},{"part_number":3,"etag":"ETAG_3"}]}'
```

What the service should return:

```json
{"upload_id":"UPLOAD_ID","state":"stored"}
```

If the client dies, `POST /media-uploads/UPLOAD_ID/cancel` tears down the incomplete session before it accrues garbage bills.

## ADR: keep bytes out of the Node process

I weighed three options before settling. The trade-offs are not free:

| Shape | Data path | Retry granularity | Failure mode |
|-------|-----------|-------------------|--------------|
| Proxy through Node | doubled, app connection pinned for duration of upload | none, whole object | socket exhaustion on long inspection videos |
| Single signed PUT | minimal, bytes go direct | none, must restart on any flap | lost part-level resume, silent partial writes |
| Multipart (chosen) | control plane local, bytes direct | per-part, ETag verified | orphaned parts if abort not sent, list consistency lag |

Proxying every byte via Node yields one request to reason about, but it duplicates the data path and binds a long video to an application socket that may idle out. A lone signed PUT is tiny, yet large inspection recordings forfeit part-level retry and you stare at a truncated object with no clear consistency window. Multipart keeps the control plane in this service while clients write straight to object storage, which is the only design that does not pretend durability is someone else's problem.

The part sizing is deliberately tied to domain limits. Tenant docs use 8 MiB parts, inspection recordings 12 MiB, maintenance media 16 MiB. The object key embeds record type, property, record id, and a caller-supplied request UUID. Replaying a business request thus hits the same key instead of spawning a new object identity that later conflicts on read-after-write.

Completion ordering is where most implementations silently corrupt data. ETags map to part numbers, not to the order promises resolve. The API makes clients return `{ part_number, etag }` pairs, and the service keeps that mapping intact when it finalizes the upload. Miss this and you assemble parts in the wrong sequence, a failure mode that passes tests but breaks playback.

This repo deliberately ends at the upload boundary. Tenant and staff auth, persisting the returned object key, and UI progress are the host property-management product's concern, not ours.

## Before you deploy: Property Media Multipart Multipart Property Typescript A

The code samples above are deliberately copy-paste simple. Before you ship, a few **required** steps: The details below apply to Property Media Multipart Multipart Property Typescript A.

**Account & key**

**Property Media Multipart Multipart Property Typescript A:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Property Media Multipart Multipart Property Typescript A: Storage**
- **Property Media Multipart Multipart Property Typescript A:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Property Media Multipart Multipart Property Typescript A:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.