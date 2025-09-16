const axios = require('axios');
const BASE = 'https://ayurtrace-farmer.onrender.com';

async function run() {
  try {
    // 1. Seed species
    console.log('Seeding species...');
    await axios.post(`${BASE}/dev/seed-species`, {
      scientificName: 'Withania somnifera',
      speciesCode: 'WITHA'
    });

    // 2. Create collection event
    console.log('Creating collection event...');
    const collectionRes = await axios.post(`${BASE}/collection`, {
      scientificName: 'Withania somnifera',
      collectorId: 'farmer-123',
      geo: { lat: 28.6, lng: 77.2 },
      timestamp: '2025-09-16T10:00:00Z',
      clientEventId: 'event-001',
      ai_verified_confidence: 0.92
    });
    const ceId = collectionRes.data.collectionEvent.id;
    const batchId = collectionRes.data.batch.id;
    const qrCodeUrl = collectionRes.data.batch.qr_code_url;
    console.log('CollectionEvent ID:', ceId);
    console.log('Batch ID:', batchId);
    console.log('QR Code URL:', qrCodeUrl);

    // 3. Add processing step
    console.log('Adding processing step...');
    const procRes = await axios.post(`${BASE}/processing`, {
      batch_id: batchId,
      step_type: 'DRYING'
    });
    const psId = procRes.data.processing_step.id;
    console.log('ProcessingStep ID:', psId);

    // 4. Add lab test
    console.log('Adding lab test...');
    const labRes = await axios.post(`${BASE}/labtest`, {
      batch_id: batchId,
      moisture_pct: 10.5,
      pesticide_pass: true
    });
    const ltId = labRes.data.lab_test.id;
    console.log('LabTest ID:', ltId);

    // 5. PATCH hash/status for collection event
    console.log('Updating hash/status for collection event...');
    await axios.patch(`${BASE}/collection/${ceId}/blockchain`, {
      status: 'READY',
      hash: 'hash-ce-123'
    });

    // 6. PATCH hash/status for processing step
    console.log('Updating hash/status for processing step...');
    await axios.patch(`${BASE}/processing/${psId}/blockchain`, {
      status: 'READY',
      hash: 'hash-ps-123'
    });

    // 7. PATCH hash/status for lab test
    console.log('Updating hash/status for lab test...');
    await axios.patch(`${BASE}/labtest/${ltId}/blockchain`, {
      status: 'READY',
      hash: 'hash-lt-123'
    });

    // 8. List ready collection events
    console.log('Listing ready collection events...');
    const readyCE = await axios.get(`${BASE}/collections/chain?status=READY`);
    console.log('Ready CollectionEvents:', readyCE.data.items);

    // 9. List ready processing steps
    console.log('Listing ready processing steps...');
    const readyPS = await axios.get(`${BASE}/processing/chain?status=READY`);
    console.log('Ready ProcessingSteps:', readyPS.data.items);

    // 10. List ready lab tests
    console.log('Listing ready lab tests...');
    const readyLT = await axios.get(`${BASE}/labtests/chain?status=READY`);
    readyLT.data.items.forEach(lt => {
      console.log(`LabTest: id=${lt.id}, batch_id=${lt.batch_id}, status=${lt.status}, gate=${lt.gate}, hash=${lt.hash}`);
    });

    // 11. Get provenance bundle
    console.log('Getting provenance bundle...');
    const prov = await axios.get(`${BASE}/provenance/${batchId}`);
    console.log('Provenance bundle:', prov.data);

    // 12. Health check
    console.log('Health check...');
    const health = await axios.get(`${BASE}/healthz`);
    console.log('Health:', health.data);

    console.log('All tests completed.');
  } catch (err) {
    console.error('Test failed:', err.response?.data || err.message);
  }
}

run();
