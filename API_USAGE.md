# AyurTrace Farmer API Usage Guide

Base URL: `http://localhost:8000` (local) or your deployed endpoint

---

## Health Check
**Endpoint:** `GET /healthz`
- **Purpose:** Check if the API is running.
- **Test:**
  ```bash
  curl -s http://localhost:8000/healthz
  ```
- **Response:**
  ```json
  { "ok": true }
  ```

---

## Seed Species (Dev Only)
**Endpoint:** `POST /dev/seed-species`
- **Purpose:** Add or update a species in the database.
- **Request Body:**
  - `scientificName` (string, required): Scientific name of the species.
  - `speciesCode` (string, required): Short code for the species.
- **Test:**
  ```bash
  curl -X POST http://localhost:8000/dev/seed-species -H "Content-Type: application/json" -d '{"scientificName":"Withania somnifera","speciesCode":"WITHA"}'
  ```
- **Response:**
  ```json
  { "ok": true }
  ```

---

## Create Collection Event
**Endpoint:** `POST /collection`
- **Purpose:** Record a new collection event and auto-create a batch for the day/species/collector.
- **Request Body:**
  - `scientificName` (string, required): Scientific name of the herb.
  - `collectorId` (string, required): Unique ID for the collector/farmer.
  - `geo` (object, required):
    - `lat` (number): Latitude.
    - `lng` (number): Longitude.
  - `timestamp` (string, required): ISO 8601 UTC timestamp.
  - `clientEventId` (string, optional): Unique event ID for idempotency.
  - `ai_verified_confidence` (number, optional): AI confidence value (0-1).
- **Test:**
  ```bash
  curl -X POST http://localhost:8000/collection -H "Content-Type: application/json" -d '{
    "scientificName": "Withania somnifera",
    "collectorId": "farmer-123",
    "geo": { "lat": 12.93, "lng": 77.61 },
    "timestamp": "2025-09-16T09:00:00Z",
    "clientEventId": "ce-123",
    "ai_verified_confidence": 0.92
  }'
  ```
- **Response:**
  ```json
  {
    "collectionEvent": {
      "id": "CE-xxxxxxx",
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
      "qr_code_url": "..."
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
- **Test:**
  ```bash
  curl -s http://localhost:8000/collection/CE-xxxxxxx
  ```
- **Response:**
  ```json
  {
    "id": "CE-xxxxxxx",
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
- **Test:**
  ```bash
  curl -s "http://localhost:8000/collections?species=Withania%20somnifera&collectorId=farmer-123&from=2025-09-01&to=2025-09-30&page=1&page_size=50"
  ```
- **Response:**
  ```json
  {
    "items": [ ... ],
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
- **Test:**
  ```bash
  curl -X POST http://localhost:8000/processing -H "Content-Type: application/json" -d '{
    "batch_id": "B-WITHA-20250916-farmer-123",
    "step_type": "DRYING",
    "status": "COMPLETED"
  }'
  ```
- **Response:**
  ```json
  {
    "processing_step": {
      "id": "PS-xxxxxxx",
      "step_type": "DRYING"
    },
    "batch": {
      "id": "B-WITHA-20250916-farmer-123",
      "status_phase": "DRYING_DONE"
    }
  }
  ```

---

## List Batches
**Endpoint:** `GET /batches`
- **Purpose:** List batches for processor dashboard.
- **Query Params:**
  - `species` (string, optional): Filter by scientific name.
  - `status` (string, optional): Filter by batch statusPhase.
- **Test:**
  ```bash
  curl -s "http://localhost:8000/batches?species=Withania%20somnifera&status=DRYING_DONE"
  ```
- **Response:**
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
- **Test:**
  ```bash
  curl -X POST http://localhost:8000/labtest -H "Content-Type: application/json" -d '{
    "batch_id": "B-WITHA-20250916-farmer-123",
    "moisture_pct": 10.5,
    "pesticide_pass": true
  }'
  ```
- **Response:**
  ```json
  {
    "lab_test": {
      "id": "LT-xxxxxxx",
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

---

## List Lab Tests
**Endpoint:** `GET /labtests`
- **Purpose:** List lab tests for a batch.
- **Query Params:**
  - `batch_id` (string, optional): Batch ID.
  - `page` (number, optional): Page number.
  - `page_size` (number, optional): Items per page (max 200).
- **Test:**
  ```bash
  curl -s "http://localhost:8000/labtests?batch_id=B-WITHA-20250916-farmer-123"
  ```
- **Response:**
  ```json
  {
    "items": [ ... ],
    "page": 1,
    "total": 1
  }
  ```

---

## Provenance Bundle (Consumer)
**Endpoint:** `GET /provenance/:batchId`
- **Purpose:** Get full provenance for a batch (for consumer display).
- **Test:**
  ```bash
  curl -s http://localhost:8000/provenance/B-WITHA-20250916-farmer-123
  ```
- **Response:**
  ```json
  {
    "batch": {
      "species_scientific": "Withania somnifera",
      "collector_id_masked": "fa***3",
      "date_utc": "2025-09-16",
      "status_phase": "DRYING_DONE",
      "quality_gate": "PASS"
    },
    "collection": [ ... ],
    "processing_steps": [ ... ],
    "lab_results": [ ... ],
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
- **GET `/collections/chain?status=READY`**
  - Lists collection events with status READY.
  - Response: `{ items: [{ id, scientific_name, collector_id, status, hash }], page, total }`

### List Ready Processing Steps
- **GET `/processing/chain?status=READY`**
  - Lists processing steps with status READY.
  - Response: `{ items: [{ id, batch_id, step_type, status, hash }], page, total }`

### List Ready Lab Tests
- **GET `/labtests/chain?status=READY`**
  - Lists lab tests with status READY.
  - Response: `{ items: [{ id, batch_id, status, gate, hash }], page, total }`

### Update Hash/Status for Collection Event
- **PATCH `/collection/:id/blockchain`**
  - Body: `{ status: "READY"|"IN_PROGRESS"|"COMPLETE", hash: "..." }`
  - Updates status and/or hash for the event.

### Update Hash/Status for Processing Step
- **PATCH `/processing/:id/blockchain`**
  - Body: `{ status: "READY"|"IN_PROGRESS"|"COMPLETE", hash: "..." }`
  - Updates status and/or hash for the step.

### Update Hash/Status for Lab Test
- **PATCH `/labtest/:id/blockchain`**
  - Body: `{ status: "READY"|"IN_PROGRESS"|"COMPLETE", hash: "..." }`
  - Updates status and/or hash for the lab test.

---

## Postman Test Examples

### Health Check
- **GET**
  - URL: `http://localhost:8000/healthz`
  - No body required.
  - Expected Response:
    ```json
    { "ok": true }
    ```

### Seed Species
- **POST**
  - URL: `http://localhost:8000/dev/seed-species`
  - Headers: `Content-Type: application/json`
  - Body (raw JSON):
    ```json
    { "scientificName": "Withania somnifera", "speciesCode": "WITHA" }
    ```
  - Expected Response:
    ```json
    { "ok": true }
    ```

### Create Collection Event
- **POST**
  - URL: `http://localhost:8000/collection`
  - Headers: `Content-Type: application/json`
  - Body (raw JSON):
    ```json
    {
      "scientificName": "Withania somnifera",
      "collectorId": "farmer-123",
      "geo": { "lat": 12.93, "lng": 77.61 },
      "timestamp": "2025-09-16T09:00:00Z",
      "clientEventId": "ce-123",
      "ai_verified_confidence": 0.92
    }
    ```
  - Expected Response: See above.

### Get Collection Event
- **GET**
  - URL: `http://localhost:8000/collection/CE-xxxxxxx`
  - No body required.
  - Expected Response: See above.

### List Collection Events
- **GET**
  - URL: `http://localhost:8000/collections?species=Withania%20somnifera&collectorId=farmer-123&from=2025-09-01&to=2025-09-30&page=1&page_size=50`
  - No body required.
  - Expected Response: See above.

### Add Processing Step
- **POST**
  - URL: `http://localhost:8000/processing`
  - Headers: `Content-Type: application/json`
  - Body (raw JSON):
    ```json
    {
      "batch_id": "B-WITHA-20250916-farmer-123",
      "step_type": "DRYING",
      "status": "COMPLETED"
    }
    ```
  - Expected Response: See above.

### List Batches
- **GET**
  - URL: `http://localhost:8000/batches?species=Withania%20somnifera&status=DRYING_DONE`
  - No body required.
  - Expected Response: See above.

### Add Lab Test
- **POST**
  - URL: `http://localhost:8000/labtest`
  - Headers: `Content-Type: application/json`
  - Body (raw JSON):
    ```json
    {
      "batch_id": "B-WITHA-20250916-farmer-123",
      "moisture_pct": 10.5,
      "pesticide_pass": true
    }
    ```
  - Expected Response: See above.

### List Lab Tests
- **GET**
  - URL: `http://localhost:8000/labtests?batch_id=B-WITHA-20250916-farmer-123`
  - No body required.
  - Expected Response: See above.

### Provenance Bundle
- **GET**
  - URL: `http://localhost:8000/provenance/B-WITHA-20250916-farmer-123`
  - No body required.
  - Expected Response: See above.

### Blockchain Endpoints
#### Update Hash/Status for Collection Event
- **PATCH**
  - URL: `http://localhost:8000/collection/CE-xxxxxxx/blockchain`
  - Headers: `Content-Type: application/json`
  - Body (raw JSON):
    ```json
    { "status": "READY", "hash": "hash-ce-123" }
    ```
  - Expected Response:
    ```json
    { "id": "CE-xxxxxxx", "status": "READY", "hash": "hash-ce-123" }
    ```

#### Update Hash/Status for Processing Step
- **PATCH**
  - URL: `http://localhost:8000/processing/PS-xxxxxxx/blockchain`
  - Headers: `Content-Type: application/json`
  - Body (raw JSON):
    ```json
    { "status": "READY", "hash": "hash-ps-123" }
    ```
  - Expected Response:
    ```json
    { "id": "PS-xxxxxxx", "status": "READY", "hash": "hash-ps-123" }
    ```

#### Update Hash/Status for Lab Test
- **PATCH**
  - URL: `http://localhost:8000/labtest/LT-xxxxxxx/blockchain`
  - Headers: `Content-Type: application/json`
  - Body (raw JSON):
    ```json
    { "status": "READY", "hash": "hash-lt-123" }
    ```
  - Expected Response:
    ```json
    { "id": "LT-xxxxxxx", "status": "READY", "hash": "hash-lt-123" }
    ```

#### List Ready Collection Events
- **GET**
  - URL: `http://localhost:8000/collections/chain?status=READY`
  - No body required.
  - Expected Response:
    ```json
    { "items": [ ... ], "page": 1, "total": ... }
    ```

#### List Ready Processing Steps
- **GET**
  - URL: `http://localhost:8000/processing/chain?status=READY`
  - No body required.
  - Expected Response:
    ```json
    { "items": [ ... ], "page": 1, "total": ... }
    ```

#### List Ready Lab Tests
- **GET**
  - URL: `http://localhost:8000/labtests/chain?status=READY`
  - No body required.
  - Expected Response:
    ```json
    { "items": [ ... ], "page": 1, "total": ... }
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
