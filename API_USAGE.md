# AyurTrace Farmer API Usage Guide

Base URL: `https://ayurtrace-farmer.onrender.com` (production)

---

## Health Check
**Endpoint:** `GET /healthz`
- **Purpose:** Check if the API is running.
- **Postman Test:**
  - Method: GET
  - URL: `https://ayurtrace-farmer.onrender.com/healthz`
  - No body required.
  - Expected Response:
    ```json
    { "ok": true }
    ```

---

## Seed Species (Dev Only)
**Endpoint:** `POST /dev/seed-species`
- **Purpose:** Add or update a species in the database.
- **Postman Test:**
  - Method: POST
  - URL: `https://ayurtrace-farmer.onrender.com/dev/seed-species`
  - Headers: `Content-Type: application/json`
  - Body (raw JSON):
    ```json
    { "scientificName": "Withania somnifera", "speciesCode": "WITHA" }
    ```
  - Expected Response:
    ```json
    { "ok": true }
    ```

---

## Create Collection Event
**Endpoint:** `POST /collection`
- **Purpose:** Record a new collection event and auto-create a batch for the day/species/collector.
- **Postman Test:**
  - Method: POST
  - URL: `https://ayurtrace-farmer.onrender.com/collection`
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

---

## Get Collection Event
**Endpoint:** `GET /collection/:id`
- **Purpose:** Fetch a single collection event by its ID.
- **Postman Test:**
  - Method: GET
  - URL: `https://ayurtrace-farmer.onrender.com/collection/CE-xxxxxxx`
  - No body required.
  - Expected Response: See above.

---

## List Collection Events
**Endpoint:** `GET /collections`
- **Purpose:** List collection events with filters for dashboards/maps.
- **Postman Test:**
  - Method: GET
  - URL: `https://ayurtrace-farmer.onrender.com/collections?species=Withania%20somnifera&collectorId=farmer-123&from=2025-09-01&to=2025-09-30&page=1&page_size=50`
  - No body required.
  - Expected Response: See above.

---

## Add Processing Step
**Endpoint:** `POST /processing`
- **Purpose:** Record a processing step for a batch.
- **Postman Test:**
  - Method: POST
  - URL: `https://ayurtrace-farmer.onrender.com/processing`
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

---

## List Batches
**Endpoint:** `GET /batches`
- **Purpose:** List batches for processor dashboard.
- **Postman Test:**
  - Method: GET
  - URL: `https://ayurtrace-farmer.onrender.com/batches?species=Withania%20somnifera&status=DRYING_DONE`
  - No body required.
  - Expected Response: See above.

---

## Add Lab Test
**Endpoint:** `POST /labtest`
- **Purpose:** Record a lab test for a batch.
- **Postman Test:**
  - Method: POST
  - URL: `https://ayurtrace-farmer.onrender.com/labtest`
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

---

## List Lab Tests
**Endpoint:** `GET /labtests`
- **Purpose:** List lab tests for a batch.
- **Postman Test:**
  - Method: GET
  - URL: `https://ayurtrace-farmer.onrender.com/labtests?batch_id=B-WITHA-20250916-farmer-123`
  - No body required.
  - Expected Response: See above.

---

## Provenance Bundle (Consumer)
**Endpoint:** `GET /provenance/:batchId`
- **Purpose:** Get full provenance for a batch (for consumer display).
- **Postman Test:**
  - Method: GET
  - URL: `https://ayurtrace-farmer.onrender.com/provenance/B-WITHA-20250916-farmer-123`
  - No body required.
  - Expected Response: See above.

---

## Blockchain Team Endpoints
### List Ready Collection Events
- **GET**
  - URL: `https://ayurtrace-farmer.onrender.com/collections/chain?status=READY`
  - No body required.
  - Expected Response: See above.

### List Ready Processing Steps
- **GET**
  - URL: `https://ayurtrace-farmer.onrender.com/processing/chain?status=READY`
  - No body required.
  - Expected Response: See above.

### List Ready Lab Tests
- **GET**
  - URL: `https://ayurtrace-farmer.onrender.com/labtests/chain?status=READY`
  - No body required.
  - Expected Response: See above.

### Update Hash/Status for Collection Event
- **PATCH**
  - URL: `https://ayurtrace-farmer.onrender.com/collection/CE-xxxxxxx/blockchain`
  - Headers: `Content-Type: application/json`
  - Body (raw JSON):
    ```json
    { "status": "READY", "hash": "hash-ce-123" }
    ```
  - Expected Response: See above.

### Update Hash/Status for Processing Step
- **PATCH**
  - URL: `https://ayurtrace-farmer.onrender.com/processing/PS-xxxxxxx/blockchain`
  - Headers: `Content-Type: application/json`
  - Body (raw JSON):
    ```json
    { "status": "READY", "hash": "hash-ps-123" }
    ```
  - Expected Response: See above.

### Update Hash/Status for Lab Test
- **PATCH**
  - URL: `https://ayurtrace-farmer.onrender.com/labtest/LT-xxxxxxx/blockchain`
  - Headers: `Content-Type: application/json`
  - Body (raw JSON):
    ```json
    { "status": "READY", "hash": "hash-lt-123" }
    ```
  - Expected Response: See above.

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
