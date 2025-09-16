# AyurTrace Farmer API Usage Guide

Base URL: `https://ayurtrace-farmer.onrender.com`

---

## Health Check
**Endpoint:** `GET /healthz`
- **Purpose:** Check if the API is running and reachable.
- **Request:** No parameters.
- **Expected Response:**
```json
{ "ok": true }
```

---

## Seed Species (Dev Only)
**Endpoint:** `POST /dev/seed-species`
- **Purpose:** Add or update a species in the database. Used for initial setup or adding new herbs.
- **Request Body:**
  - `scientificName` (string, required): Full scientific name (e.g., "Withania somnifera").
  - `speciesCode` (string, required): Short code (e.g., "WITHA").
- **Expected Response:**
```json
{ "ok": true }
```
- **Error Response:**
```json
{ "error": "scientificName & speciesCode required" }
```

---

## Create Collection Event
**Endpoint:** `POST /collection`
- **Purpose:** Record a new collection event and auto-create a batch for the day/species/collector.
- **Request Body:**
  - `scientificName` (string, required): Herb name.
  - `collectorId` (string, required): Farmer/collector ID.
  - `geo` (object, required):
    - `lat` (number): Latitude.
    - `lng` (number): Longitude.
  - `timestamp` (string, required): ISO 8601 UTC timestamp.
  - `clientEventId` (string, optional): Unique event ID for idempotency.
  - `ai_verified_confidence` (number, optional): AI confidence (0-1).
- **Expected Response:**
```json
{
  "collectionEvent": {
    "id": "CE-12345678",
    "scientificName": "Withania somnifera",
    "collectorId": "farmer-123",
    "geo": { "lat": 12.93, "lng": 77.61 },
    "timestamp": "2025-09-16T09:00:00Z",
    "ai": { "confidence": 0.92 },
    "status": "ACCEPTED",
    "violations": [],
    "hash": null
  },
  "batch": {
    "id": "B-WITHA-20250916-farmer-123",
    "status_phase": "CREATED",
    "qr_code_url": "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=..."
  }
}
```
- **Notes:**
  - If `clientEventId` is reused, the same event is returned (idempotency).
  - `ai` field is present only if `ai_verified_confidence` is sent.

---

## Get Collection Event
**Endpoint:** `GET /collection/:id`
- **Purpose:** Fetch a single collection event by its ID.
- **Expected Response:**
```json
{
  "id": "CE-12345678",
  "scientificName": "Withania somnifera",
  "collectorId": "farmer-123",
  "geo": { "lat": 12.93, "lng": 77.61 },
  "timestamp": "2025-09-16T09:00:00Z",
  "ai": { "confidence": 0.92 },
  "status": "ACCEPTED",
  "violations": [],
  "batch_id": "B-WITHA-20250916-farmer-123",
  "hash": null
}
```
- **Error Response:**
```json
{ "error": "NOT_FOUND" }
```

---

## List Collection Events
**Endpoint:** `GET /collections`
- **Purpose:** List collection events with filters for dashboards/maps.
- **Query Params:**
  - `species` (string, optional): Filter by scientific name.
  - `collectorId` (string, optional): Filter by collector.
  - `from` (string, optional): Start date (ISO).
  - `to` (string, optional): End date (ISO).
  - `page` (number, optional): Page number.
  - `page_size` (number, optional): Items per page (max 200).
- **Expected Response:**
```json
{
  "items": [ /* array of collection events */ ],
  "page": 1,
  "total": 1
}
```

---

## Add Processing Step
**Endpoint:** `POST /processing`
- **Purpose:** Record a processing step for a batch.
- **Request Body:**
  - `batch_id` (string, required): Batch ID.
  - `step_type` (string, required): RECEIPT | DRYING | GRINDING | ...
  - `status` (string, optional): Status of the step (default: COMPLETED).
  - `started_at` (string, optional): ISO timestamp.
  - `ended_at` (string, optional): ISO timestamp.
  - `params` (object, optional): Step parameters.
  - `post_step_metrics` (object, optional): Metrics after step.
  - `notes` (string, optional): Notes.
- **Expected Response:**
```json
{
  "processing_step": {
    "id": "PS-12345678",
    "step_type": "DRYING"
  },
  "batch": {
    "id": "B-WITHA-20250916-farmer-123",
    "status_phase": "DRYING_DONE"
  }
}
```
- **Error Response:**
```json
{ "error": "batch_id and step_type required" }
```

---

## List Batches
**Endpoint:** `GET /batches`
- **Purpose:** List batches for processor dashboard.
- **Query Params:**
  - `species` (string, optional): Filter by scientific name.
  - `status` (string, optional): Filter by batch statusPhase.
- **Expected Response:**
```json
[
  {
    "id": "B-WITHA-20250916-farmer-123",
    "species": "Withania somnifera",
    "status_phase": "DRYING_DONE",
    "date_utc": "2025-09-16"
  }
]
```

---

## Add Lab Test
**Endpoint:** `POST /labtest`
- **Purpose:** Record a lab test for a batch.
- **Request Body:**
  - `batch_id` (string, required): Batch ID.
  - `moisture_pct` (number, required): Moisture percentage.
  - `pesticide_pass` (boolean, required): Pesticide test pass/fail.
  - `pdf_url` (string, optional): Link to lab PDF.
- **Expected Response:**
```json
{
  "lab_test": {
    "id": "LT-12345678",
    "batch_id": "B-WITHA-20250916-farmer-123",
    "moisture_pct": 10.5,
    "pesticide_pass": true,
    "pdf_url": null,
    "gate": "PASS",
    "threshold_pct": 12
  },
  "batch": {
    "id": "B-WITHA-20250916-farmer-123",
    "quality_gate": "PASS"
  }
}
```
- **Error Response:**
```json
{ "error": "batch_id, moisture_pct(number), pesticide_pass(boolean) required" }
```

---

## List Lab Tests
**Endpoint:** `GET /labtests`
- **Purpose:** List lab tests for a batch.
- **Query Params:**
  - `batch_id` (string, optional): Batch ID.
  - `page` (number, optional): Page number.
  - `page_size` (number, optional): Items per page (max 200).
- **Expected Response:**
```json
{
  "items": [ /* array of lab tests */ ],
  "page": 1,
  "total": 1
}
```

---

## Provenance Bundle (Consumer)
**Endpoint:** `GET /provenance/:batchId`
- **Purpose:** Get full provenance for a batch (for consumer display).
- **Expected Response:**
```json
{
  "batch": {
    "species_scientific": "Withania somnifera",
    "collector_id_masked": "fa***3",
    "date_utc": "2025-09-16",
    "status_phase": "DRYING_DONE",
    "quality_gate": "PASS"
  },
  "collection": [ /* array of collection events */ ],
  "processing_steps": [ /* array of steps */ ],
  "lab_results": [ /* array of lab tests */ ],
  "ui": {
    "map": { "lat": 12.93, "lng": 77.61 },
    "herb_names": {
      "scientific": "Withania somnifera",
      "ai_verified_confidence": 0.92
    },
    "processing_summary": [ "DRYING" ],
    "recall_banner": false
  }
}
```
- **Notes:**
  - `collector_id_masked` is a privacy mask.
  - `ai_verified_confidence` is present if provided in collection event.

---

## Blockchain Team Endpoints
### List Ready Collection Events
**Endpoint:** `GET /collections/chain?status=READY`
- **Purpose:** List collection events with status READY.
- **Expected Response:**
```json
{
  "items": [
    {
      "id": "CE-12345678",
      "scientific_name": "Withania somnifera",
      "collector_id": "farmer-123",
      "status": "READY",
      "hash": "hash-ce-123"
    }
  ],
  "page": 1,
  "total": 1
}
```

### List Ready Processing Steps
**Endpoint:** `GET /processing/chain?status=READY`
- **Purpose:** List processing steps with status READY.
- **Expected Response:**
```json
{
  "items": [
    {
      "id": "PS-12345678",
      "batch_id": "B-WITHA-20250916-farmer-123",
      "step_type": "DRYING",
      "status": "READY",
      "hash": "hash-ps-123"
    }
  ],
  "page": 1,
  "total": 1
}
```

### List Ready Lab Tests
**Endpoint:** `GET /labtests/chain?status=READY`
- **Purpose:** List lab tests with status READY.
- **Expected Response:**
```json
{
  "items": [
    {
      "id": "LT-12345678",
      "batch_id": "B-WITHA-20250916-farmer-123",
      "status": "READY",
      "gate": "PASS",
      "hash": "hash-lt-123"
    }
  ],
  "page": 1,
  "total": 1
}
```

### Update Hash/Status for Collection Event
**Endpoint:** `PATCH /collection/:id/blockchain`
- **Purpose:** Update status and/or hash for a collection event.
- **Request Body:**
  - `status` (string, optional): READY | IN_PROGRESS | COMPLETE
  - `hash` (string, optional): Blockchain hash
- **Expected Response:**
```json
{ "id": "CE-12345678", "status": "READY", "hash": "hash-ce-123" }
```

### Update Hash/Status for Processing Step
**Endpoint:** `PATCH /processing/:id/blockchain`
- **Purpose:** Update status and/or hash for a processing step.
- **Request Body:**
  - `status` (string, optional): READY | IN_PROGRESS | COMPLETE
  - `hash` (string, optional): Blockchain hash
- **Expected Response:**
```json
{ "id": "PS-12345678", "status": "READY", "hash": "hash-ps-123" }
```

### Update Hash/Status for Lab Test
**Endpoint:** `PATCH /labtest/:id/blockchain`
- **Purpose:** Update status and/or hash for a lab test.
- **Request Body:**
  - `status` (string, optional): READY | IN_PROGRESS | COMPLETE
  - `hash` (string, optional): Blockchain hash
- **Expected Response:**
```json
{ "id": "LT-12345678", "status": "READY", "hash": "hash-lt-123" }
```

---

## Parameter Explanations
- **scientificName**: Full scientific name of the herb/species.
- **speciesCode**: Short code for the species (e.g., ASHWA, WITHA).
- **collectorId**: Unique identifier for the farmer/collector.
- **geo.lat / geo.lng**: Latitude and longitude of collection location.
- **timestamp**: ISO 8601 UTC timestamp for event.
- **clientEventId**: Unique event ID for idempotency (prevents duplicates).
- **ai_verified_confidence**: AI model confidence (0-1, optional).
- **batch_id**: Unique batch identifier (auto-generated per day/species/collector).
- **step_type**: Type of processing step (RECEIPT, DRYING, GRINDING, etc).
- **status**: Status of event/step/lab (ACCEPTED, READY, IN_PROGRESS, COMPLETE, etc).
- **moisture_pct**: Moisture percentage from lab test.
- **pesticide_pass**: Boolean, true if pesticide test passed.
- **gate**: Lab test result (PASS/FAIL).
- **hash**: Blockchain hash (set by blockchain team).
- **pdf_url**: Link to lab test PDF (optional).

---

## General Notes
- All endpoints accept and return JSON.
- Timestamps should be in ISO 8601 UTC format.
- No authentication is enabled by default.
- Use PATCH endpoints to update status/hash for blockchain integration.
- Use GET endpoints with filters for dashboard and reporting.
