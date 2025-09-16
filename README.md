# AyurTrace API (Farmer Service)

Base URL: https://ayurtrace-farmer.onrender.com

## Health
- GET `/healthz` → `{ "ok": true }`

## For App/Field team (create data)
- POST `/dev/seed-species`
  - Body: `{ "scientificName":"Withania somnifera", "speciesCode":"ASHWA" }`
  - Dev utility; seed once per species.
- POST `/collection`
  - Required body fields:
    - `scientificName` (string)
    - `collectorId` (string)
    - `geo.lat` (number), `geo.lng` (number)
    - `timestamp` (ISO string)
  - Optional: `vernacularName`, `clientEventId` (idempotency), `ai` (object)
  - Creates a CollectionEvent and auto‑ensures a per‑day Batch for (species + collector).

Example:
```bash
curl -s -X POST https://ayurtrace-farmer.onrender.com/collection -H "Content-Type: application/json" -d '{
  "scientificName": "Withania somnifera",
  "collectorId": "farmer-123",
  "geo": { "lat": 12.93, "lng": 77.61 },
  "timestamp": "2025-09-16T09:00:00Z",
  "clientEventId": "ce-123"
}'
```

## For Processing/Ops (record steps)
- POST `/processing`
  - Body: `batch_id`, `step_type` (RECEIPT|DRYING|GRINDING), optional `status`, `started_at`, `ended_at`, `params`, `post_step_metrics`, `notes`
  - Auto‑advances batch `statusPhase` via mapping:
    - RECEIPT → RECEIPT_DONE
    - DRYING → DRYING_DONE
    - GRINDING → GRINDING_DONE

Example:
```bash
curl -s -X POST https://ayurtrace-farmer.onrender.com/processing -H "Content-Type: application/json" -d '{
  "batch_id": "B-ASHWA-20250916-farmer-123",
  "step_type": "DRYING",
  "status": "COMPLETED"
}'
```

## Batches (general)
- GET `/batches`
  - Query params: `species`, `status` (filters `statusPhase`)
  - Returns: `[{ id, species, status_phase, date_utc }]`

## For Blockchain team (fetch + update on‑chain status)
- GET `/batches/chain?status=READY&page=1&page_size=100`
  - `status`: READY | IN_PROGRESS | COMPLETE (default READY)
  - Response: `{ items: [{ id, species, date_utc, chain_status }], page, total }`
- PATCH `/batches/:id/chain-status`
  - Body: `{ "status":"READY"|"IN_PROGRESS"|"COMPLETE" }`
  - Updates `chainStatus` for that batch.

Examples:
```bash
# fetch READY batches
curl -s "https://ayurtrace-farmer.onrender.com/batches/chain?status=READY&page=1&page_size=50"

# mark IN_PROGRESS
curl -s -X PATCH https://ayurtrace-farmer.onrender.com/batches/B-ASHWA-20250916-farmer-123/chain-status \
  -H "Content-Type: application/json" -d '{"status":"IN_PROGRESS"}'

# mark COMPLETE
curl -s -X PATCH https://ayurtrace-farmer.onrender.com/batches/B-ASHWA-20250916-farmer-123/chain-status \
  -H "Content-Type: application/json" -d '{"status":"COMPLETE"}'
```

## Collections query (dashboards/integrations)
- GET `/collection/:id`
- GET `/collections?species=Withania%20somnifera&collectorId=farmer-123&from=2025-09-01&to=2025-09-30&page=1&page_size=50`

## Notes
- No auth enabled currently; share URL privately or front with a gateway if needed.
- Timestamps should be ISO 8601 (UTC).
