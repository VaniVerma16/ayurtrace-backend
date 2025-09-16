// server.js — Node 18+, Express + Mongoose (MongoDB Atlas)
require("dotenv").config();
const express = require("express");
const cors = require('cors'); // <-- Added
const mongoose = require("mongoose");
const dns = require("dns");
const crypto = require("crypto");

const app = express();
app.use(cors()); // <-- Added
app.use(express.json({ limit: "5mb" }));

// Force reliable DNS for SRV lookups (fixes intermittent macOS resolver issues)
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (_) {}

// ---- DB ----
const { MONGODB_URI, PORT = 8000 } = process.env;

// Handle the case where MONGODB_URI might not be set properly in .env
let connectionUri = MONGODB_URI || "mongodb://127.0.0.1:27017/trace";

// If MONGODB_URI is not set, try to get it from the first line of .env file
if (!MONGODB_URI) {
  try {
    const fs = require('fs');
    const envContent = fs.readFileSync('.env', 'utf8');
    const firstLine = envContent.split('\n')[0].trim();
    if (firstLine.startsWith('mongodb')) {
      connectionUri = firstLine;
    }
  } catch (e) {
    console.log('Could not read .env file, using default connection');
  }
}

// Fix MongoDB connection string if it's missing database name
if (connectionUri.includes('mongodb+srv://') && !connectionUri.includes('/ayurtrace')) {
  // Check if there's already a slash before the query parameters
  if (connectionUri.includes('/?')) {
    connectionUri = connectionUri.replace('/?', '/ayurtrace?');
  } else {
    connectionUri = connectionUri.replace('?', '/ayurtrace?');
  }
}

// Alternative: Try using direct connection if SRV fails
// This converts mongodb+srv:// to mongodb:// with explicit hostnames
let alternativeUri = null;
if (connectionUri.includes('mongodb+srv://')) {
  // Extract the base connection string
  const baseUri = connectionUri.replace('mongodb+srv://', 'mongodb://');
  // Use one of the resolved hostnames from the SRV record
  alternativeUri = baseUri.replace('cluster0.wvwosp6.mongodb.net', 'ac-mzkmjxy-shard-00-00.wvwosp6.mongodb.net:27017,ac-mzkmjxy-shard-00-01.wvwosp6.mongodb.net:27017,ac-mzkmjxy-shard-00-02.wvwosp6.mongodb.net:27017');
}

console.log("Attempting to connect to MongoDB Atlas...");
console.log("Connection URI:", connectionUri.replace(/\/\/.*@/, '//***:***@'));

let serverStarted = false;
const startServerOnce = () => {
  if (serverStarted) return;
  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
  serverStarted = true;
};

const connectToMongoDB = async (uri, isRetry = false) => {
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000, // Keep trying to send operations for 30 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      bufferCommands: false, // Disable mongoose buffering
      connectTimeoutMS: 30000, // Give up initial connection after 30 seconds
      maxPoolSize: 10, // Maintain up to 10 socket connections
      retryWrites: true,
    });
    console.log("✅ MongoDB Atlas connected successfully");
    startServerOnce();
  } catch (error) {
    if (!isRetry && alternativeUri) {
      console.log("🔄 SRV connection failed, trying direct connection...");
      return connectToMongoDB(alternativeUri, true);
    }
    
    console.error("❌ MongoDB Atlas connection failed:", error.message);
    console.log("\n🔧 Troubleshooting steps:");
    console.log("1. Check your internet connection");
    console.log("2. Verify your MongoDB Atlas cluster is running (not paused)");
    console.log("3. Check if your IP address is whitelisted in MongoDB Atlas");
    console.log("4. Verify your connection string is correct");
    console.log("\n📋 Connection details:");
    console.log("- Cluster: cluster0.wvwosp6.mongodb.net");
    console.log("- Database: ayurtrace");
    console.log("- User: vaniverma5002_db_user");
    process.exit(1);
  }
};

connectToMongoDB(connectionUri);

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
});

// ---- Schemas ----
const Species = mongoose.model(
  "Species",
  new mongoose.Schema({
    scientificName: { type: String, unique: true, required: true },
    speciesCode: { type: String, required: true },         // e.g., ASHWA
    vernaculars: { type: [String], default: [] },
    seasonMonths: { type: [Number], default: [] }          // optional
  }, { timestamps: true })
);

const CollectionEvent = mongoose.model(
  "CollectionEvent",
  new mongoose.Schema({
    id: { type: String, unique: true },                    // CE-xxxxxxxx
    clientEventId: { type: String, unique: true, sparse: true },
    scientificName: { type: String, required: true },     // always provided directly by farmer
    collectorId: { type: String, required: true },
    geo: {
      lat: Number, lng: Number, accuracy_m: Number
    },
    timestampUtc: { type: Date, required: true },
    ai: { type: mongoose.Schema.Types.Mixed },             // stored verbatim if sent (not used now)
    status: { type: String, default: "ACCEPTED" },         // ACCEPTED|REJECTED
    violations: { type: Array, default: [] },
    batchId: String,
    hash: String                                           // canonical hash (for your own integrity checks)
  }, { timestamps: true })
);

const Batch = mongoose.model(
  "Batch",
  new mongoose.Schema({
    id: { type: String, unique: true },                    // B-ASHWA-YYYYMMDD-farmer-123
    scientificName: { type: String, required: true },     // always provided directly by farmer
    collectorId: { type: String, required: true },
    dateUtc: { type: String, required: true },             // YYYY-MM-DD
    statusPhase: { type: String, default: "CREATED" },     // CREATED → ... → READY_FOR_QA
    qualityGate: {
      type: String,
      enum: ["PASS", "FAIL", "PENDING"],
      default: "PENDING"
    },
    qrCodeUrl: String                                    // QR code link for provenance
  }, { timestamps: true })
);

const ProcessingStep = mongoose.model(
  "ProcessingStep",
  new mongoose.Schema({
    id: { type: String, unique: true },                    // PS-xxxxxxxx
    batchId: { type: String, required: true },
    stepType: { type: String, required: true },            // DRYING|GRINDING|...
    status: { type: String, default: "COMPLETED" },
    startedAt: Date,
    endedAt: Date,
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    postMetrics: { type: mongoose.Schema.Types.Mixed, default: {} },
    notes: String,
    hash: String                                           // blockchain hash, auto-generated at creation
  }, { timestamps: true })
);

// Lab test results for quality gate
const LabTest = mongoose.model(
  "LabTest",
  new mongoose.Schema({
    id: { type: String, unique: true },                    // LT-xxxxxxxx
    batchId: { type: String, required: true },
    moisturePct: { type: Number, required: true },
    pesticidePass: { type: Boolean, required: true },
    pdfUrl: { type: String },                               // optional
    gate: { type: String, enum: ["PASS", "FAIL"], required: true },
    evaluatedAt: { type: Date, default: Date.now },
    status: { type: String, default: "READY", enum: ["READY", "IN_PROGRESS", "COMPLETE"] },
    hash: String                                           // blockchain hash, auto-generated at creation
  }, { timestamps: true })
);

// ---- Helpers ----
const speciesCodeFor = async (scientificName) => {
  const s = await Species.findOne({ scientificName }).lean();
  if (s?.speciesCode) return s.speciesCode;
  return (scientificName.split(" ")[0] || "SPEC").slice(0,5).toUpperCase();
};
const makeBatchId = (code, ts, collectorId) => {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,"0");
  const day = String(d.getUTCDate()).padStart(2,"0");
  return `B-${code}-${y}${m}${day}-${collectorId}`;
};
const isoZ = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "Z");
const stableStringify = (obj) => {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k)+":"+stableStringify(obj[k])).join(",") + "}";
};
const sha256Hex = (v) => crypto.createHash("sha256").update(v).digest("hex");

// ---- Endpoints ----

// 0) Seed one species (dev utility)
app.post("/dev/seed-species", async (req, res) => {
  const s = req.body || {};
  if (!s.scientificName || !s.speciesCode) return res.status(400).json({ error: "scientificName & speciesCode required" });
  await Species.updateOne({ scientificName: s.scientificName }, { $set: s }, { upsert: true });
  return res.json({ ok: true });
});

// 1) Create CollectionEvent (no AI here; client provides names)
app.post("/collection", async (req, res) => {
  try {
    const {
      scientificName,
      collectorId,
      geo,
      timestamp,
      clientEventId,
      ai_verified_confidence
    } = req.body;

    // idempotency by clientEventId
    if (clientEventId) {
      const exists = await CollectionEvent.findOne({ clientEventId }).lean();
      if (exists) {
        return res.json({
          collectionEvent: {
            id: exists.id,
            scientificName: exists.scientificName,
            collectorId: exists.collectorId,
            geo: exists.geo,
            timestamp: isoZ(exists.timestampUtc),
            ai: exists.ai || {},
            status: exists.status,
            violations: exists.violations,
            hash: exists.hash || null
          },
          batch: { id: exists.batchId, status_phase: "CREATED" }
        });
      }
    }

    // ensure batch (day-batch per species+collector)
    const code = await speciesCodeFor(scientificName);
    const batchId = makeBatchId(code, timestamp, collectorId);
    const dateUtc = isoZ(timestamp).slice(0,10);
    const batchInfoRaw = JSON.stringify({
      id: batchId,
      scientificName,
      collectorId,
      dateUtc,
      statusPhase: "CREATED"
    });
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(batchInfoRaw)}`;
    await Batch.updateOne(
      { id: batchId },
      { $setOnInsert: { id: batchId, scientificName, collectorId, dateUtc, statusPhase: "CREATED", qrCodeUrl } },
      { upsert: true }
    );
    const batchDoc = await Batch.findOne({ id: batchId }).lean();

    // CE id (no hash at creation)
    const ceid = "CE-" + crypto.randomBytes(4).toString("hex");
    await CollectionEvent.create({
      id: ceid,
      clientEventId: clientEventId || null,
      scientificName,
      collectorId,
      geo,
      timestampUtc: new Date(timestamp),
      ai: ai_verified_confidence !== undefined ? { confidence: ai_verified_confidence } : null,
      status: "ACCEPTED",
      violations: [],
      batchId,
      hash: null // hash will be set by blockchain team
    });

    return res.status(201).json({
      collectionEvent: {
        id: ceid,
        scientificName,
        collectorId,
        geo,
        timestamp: isoZ(timestamp),
        ai: null,
        status: "ACCEPTED",
        violations: [],
        hash: null
      },
      batch: {
        id: batchId,
        status_phase: "CREATED",
        qr_code_url: batchDoc?.qrCodeUrl || null
      }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// 2) Get a CollectionEvent
app.get("/collection/:id", async (req, res) => {
  const doc = await CollectionEvent.findOne({ id: req.params.id }).lean();
  if (!doc) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({
    id: doc.id,
    scientificName: doc.scientificName,
    collectorId: doc.collectorId,
    geo: doc.geo,
    timestamp: isoZ(doc.timestampUtc),
    ai: doc.ai || {},
    status: doc.status,
    violations: doc.violations,
    batch_id: doc.batchId,
    hash: doc.hash
  });
});

// 3) List CollectionEvents (filters for dashboard/map)
app.get("/collections", async (req, res) => {
  const { species, collectorId, from, to, page = 1, page_size = 50 } = req.query;
  const q = {};
  if (species) q.scientificName = species;
  if (collectorId) q.collectorId = collectorId;
  if (from || to) q.timestampUtc = {};
  if (from) q.timestampUtc.$gte = new Date(from);
  if (to) q.timestampUtc.$lte = new Date(to);
  const limit = Math.min(parseInt(page_size,10) || 50, 200);
  const skip = (parseInt(page,10) - 1) * limit;
  const [items, total] = await Promise.all([
    CollectionEvent.find(q).sort({ timestampUtc: -1 }).skip(skip).limit(limit).lean(),
    CollectionEvent.countDocuments(q)
  ]);
  return res.json({ items, page: Number(page), total });
});

// 4) Processor: add ProcessingStep (kept minimal)
app.post("/processing", async (req, res) => {
  const p = req.body || {};
  if (!p.batch_id || !p.step_type) return res.status(400).json({ error: "batch_id and step_type required" });
  const id = "PS-" + crypto.randomBytes(4).toString("hex");
  const autoHash = sha256Hex(id + ":" + p.batch_id);
  const doc = await ProcessingStep.create({
    id,
    batchId: p.batch_id,
    stepType: p.step_type,
    status: p.status || "COMPLETED",
    startedAt: p.started_at ? new Date(p.started_at) : undefined,
    endedAt: p.ended_at ? new Date(p.ended_at) : undefined,
    params: p.params || {},
    postMetrics: p.post_step_metrics || {},
    notes: p.notes || "",
    hash: autoHash // auto-generated hash
  });
  // Bump batch phase naïvely based on stepType
  const phaseMap = { RECEIPT: "RECEIPT_DONE", DRYING: "DRYING_DONE", GRINDING: "GRINDING_DONE" };
  const nextPhase = phaseMap[p.step_type];
  if (nextPhase) await Batch.updateOne({ id: p.batch_id }, { $set: { statusPhase: nextPhase } });
  return res.status(201).json({ processing_step: { id: doc.id, step_type: doc.stepType }, batch: { id: p.batch_id, status_phase: nextPhase || undefined } });
});

// 5) List batches for processor
app.get("/batches", async (req, res) => {
  const { species, status } = req.query;
  const q = {};
  if (species) q.scientificName = species;
  if (status) q.statusPhase = status;
  const rows = await Batch.find(q).sort({ createdAt: -1 }).lean();
  res.json(rows.map(r => ({
    id: r.id, species: r.scientificName, status_phase: r.statusPhase, date_utc: r.dateUtc
})));
});

// 6) Blockchain team: list batches by chainStatus (READY by default)
app.get("/batches/chain", async (req, res) => {
  const { status = "READY", page = 1, page_size = 100 } = req.query;
  const limit = Math.min(parseInt(page_size,10) || 100, 500);
  const skip = (parseInt(page,10) - 1) * limit;
  const q = { chainStatus: String(status).toUpperCase() };
  const [items, total] = await Promise.all([
    Batch.find(q).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
    Batch.countDocuments(q)
  ]);
  res.json({
    items: items.map(b => ({ id: b.id, species: b.scientificName, date_utc: b.dateUtc, chain_status: b.chainStatus })),
    page: Number(page), total
  });
});

// 7) Blockchain team: update chainStatus for a batch
app.patch("/batches/:id/chain-status", async (req, res) => {
  const { id } = req.params;
  const { status, hash } = req.body || {};
  const allowed = new Set(["READY", "IN_PROGRESS", "COMPLETE"]);
  if (!status || !allowed.has(String(status).toUpperCase())) {
    return res.status(400).json({ error: "Invalid status. Use READY | IN_PROGRESS | COMPLETE" });
  }
  const next = String(status).toUpperCase();
  const r = await Batch.updateOne({ id }, { $set: { chainStatus: next } });
  if (r.matchedCount === 0) return res.status(404).json({ error: "NOT_FOUND" });

  // If hash is supplied, update all CollectionEvents for this batch
  if (hash) {
    await CollectionEvent.updateMany({ batchId: id }, { $set: { hash } });
  }

  return res.json({ id, chain_status: next, hash: hash || null });
});

// PATCH /batches/:id/chain-status
// :id must be the full batch id, e.g. B-ASHWA-YYYYMMDD-farmer-123
app.patch("/batches/:id/chain-status", async (req, res) => {
  const { id } = req.params;
  const { status, hash } = req.body || {};
  const allowed = new Set(["READY", "IN_PROGRESS", "COMPLETE"]);
  if (!status || !allowed.has(String(status).toUpperCase())) {
    return res.status(400).json({ error: "Invalid status. Use READY | IN_PROGRESS | COMPLETE" });
  }
  const next = String(status).toUpperCase();
  const r = await Batch.updateOne({ id }, { $set: { chainStatus: next } });
  if (r.matchedCount === 0) return res.status(404).json({ error: "NOT_FOUND" });

  // If hash is supplied, update all CollectionEvents for this batch
  if (hash) {
    await CollectionEvent.updateMany({ batchId: id }, { $set: { hash } });
  }

  return res.json({ id, chain_status: next, hash: hash || null });
});

// 8) Lab: submit quality test (moisture/pesticide) and update batch gate
// Env threshold or default to 12%
const MOISTURE_THRESHOLD_PCT = Number(process.env.MOISTURE_THRESHOLD_PCT || 12);
app.post("/labtest", async (req, res) => {
  const p = req.body || {};
  if (!p.batch_id || typeof p.moisture_pct !== "number" || typeof p.pesticide_pass !== "boolean") {
    return res.status(400).json({ error: "batch_id, moisture_pct(number), pesticide_pass(boolean) required" });
  }
  const gate = (p.moisture_pct <= MOISTURE_THRESHOLD_PCT && p.pesticide_pass) ? "PASS" : "FAIL";
  const id = "LT-" + crypto.randomBytes(4).toString("hex");
  const autoHash = sha256Hex(id + ":" + p.batch_id);
  const doc = await LabTest.create({
    id,
    batchId: p.batch_id,
    moisturePct: p.moisture_pct,
    pesticidePass: p.pesticide_pass,
    pdfUrl: p.pdf_url || undefined,
    gate,
    hash: autoHash // auto-generated hash
  });
  await Batch.updateOne({ id: p.batch_id }, { $set: { qualityGate: gate } });
  return res.status(201).json({
    lab_test: {
      id: doc.id,
      batch_id: doc.batchId,
      moisture_pct: doc.moisturePct,
      pesticide_pass: doc.pesticidePass,
      pdf_url: doc.pdfUrl || null,
      gate: doc.gate,
      threshold_pct: MOISTURE_THRESHOLD_PCT
    },
    batch: { id: p.batch_id, quality_gate: gate }
  });
});

// Optional: list lab tests for a batch
app.get("/labtests", async (req, res) => {
  const { batch_id, page = 1, page_size = 50 } = req.query;
  const q = {};
  if (batch_id) q.batchId = batch_id;
  const limit = Math.min(parseInt(page_size,10) || 50, 200);
  const skip = (parseInt(page,10) - 1) * limit;
  const [items, total] = await Promise.all([
    LabTest.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    LabTest.countDocuments(q)
  ]);
  res.json({ items, page: Number(page), total });
});

// 9) Consumer: provenance bundle for a batch
// Assembles off-chain JSON from our DB. On-chain verification is left as a placeholder.
app.get("/provenance/:batchId", async (req, res) => {
  const batchId = req.params.batchId;
  // Fetch core pieces
  const [batch, collEvents, steps, labTests] = await Promise.all([
    Batch.findOne({ id: batchId }).lean(),
    CollectionEvent.find({ batchId }).sort({ timestampUtc: 1 }).lean(),
    ProcessingStep.find({ batchId }).sort({ createdAt: 1 }).lean(),
    LabTest.find({ batchId }).sort({ createdAt: -1 }).lean()
  ]);

  if (!batch) return res.status(404).json({ error: "BATCH_NOT_FOUND" });

  // Mask collector id (simple masking)
  const mask = (s) => (typeof s === 'string' && s.length > 4) ? s.slice(0,2) + "***" + s.slice(-1) : s;

  // Build map marker from first collection event
  const firstCE = collEvents[0] || null;
  const map = firstCE?.geo ? { lat: firstCE.geo.lat, lng: firstCE.geo.lng } : null;

  // AI chip confidence (if present in CE.ai)
  const ai = firstCE?.ai && typeof firstCE.ai === 'object' ? firstCE.ai : {};
  const aiConfidence = typeof ai.confidence === 'number' ? ai.confidence : null;

  // Lab gate summary (latest)
  const latestLab = labTests[0] || null;
  const labSummary = latestLab ? {
    moisture_pct: latestLab.moisturePct,
    pesticide_pass: latestLab.pesticidePass,
    gate: latestLab.gate,
    pdf_url: latestLab.pdfUrl || null,
    evaluated_at: latestLab.evaluatedAt ? isoZ(latestLab.evaluatedAt) : null
  } : null;

  // Logical formatting, exclude hash and id fields
  const batchInfo = {
    species_scientific: batch.scientificName,
    collector_id_masked: mask(batch.collectorId),
    date_utc: batch.dateUtc,
    status_phase: batch.statusPhase,
    quality_gate: batch.qualityGate || "PENDING"
  };

  const collection = collEvents.map(e => ({
    scientific_name: e.scientificName,
    collector_id_masked: mask(e.collectorId),
    geo: e.geo || null,
    timestamp: isoZ(e.timestampUtc),
    ai: e.ai || {},
    status: e.status,
    violations: e.violations || []
  }));

  const processing_steps = steps.map(s => ({
    step_type: s.stepType,
    status: s.status,
    started_at: s.startedAt ? isoZ(s.startedAt) : null,
    ended_at: s.endedAt ? isoZ(s.endedAt) : null,
    params: s.params || {},
    post_step_metrics: s.postMetrics || {},
    notes: s.notes || ""
  }));

  const lab_results = labTests.map(l => ({
    moisture_pct: l.moisturePct,
    pesticide_pass: l.pesticidePass,
    gate: l.gate,
    pdf_url: l.pdfUrl || null,
    evaluated_at: l.evaluatedAt ? isoZ(l.evaluatedAt) : null
  }));

  // Placeholder on-chain verification section
  const onChain = {
    verified: false,
    notes: "On-chain verification placeholder. Integrate with chain index and compare hashes.",
  };

  const bundle = {
    batch: batchInfo,
    collection,
    processing_steps,
    lab_results,
    ui: {
      map,
      herb_names: {
        scientific: batch.scientificName,
        ai_verified_confidence: aiConfidence
      },
      processing_summary: steps.map(s => s.stepType),
      recall_banner: false
    }
  };

  return res.json(bundle);
});

// health
app.get("/healthz", (_, res) => res.json({ ok: true }));

// Blockchain team: list CollectionEvents by status
app.get("/collections/chain", async (req, res) => {
  const { status = "READY", page = 1, page_size = 100 } = req.query;
  const limit = Math.min(parseInt(page_size,10) || 100, 500);
  const skip = (parseInt(page,10) - 1) * limit;
  const q = { status: String(status).toUpperCase() };
  const [items, total] = await Promise.all([
    CollectionEvent.find(q).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
    CollectionEvent.countDocuments(q)
  ]);
  res.json({
    items: items.map(e => ({ id: e.id, scientific_name: e.scientificName, collector_id: e.collectorId, status: e.status, hash: e.hash })),
    page: Number(page), total
  });
});

// Blockchain team: list ProcessingSteps by status
app.get("/processing/chain", async (req, res) => {
  const { status = "READY", page = 1, page_size = 100 } = req.query;
  const limit = Math.min(parseInt(page_size,10) || 100, 500);
  const skip = (parseInt(page,10) - 1) * limit;
  const q = { status: String(status).toUpperCase() };
  const [items, total] = await Promise.all([
    ProcessingStep.find(q).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
    ProcessingStep.countDocuments(q)
  ]);
  res.json({
    items: items.map(s => ({ id: s.id, batch_id: s.batchId, step_type: s.stepType, status: s.status, hash: s.hash })),
    page: Number(page), total
  });
});

// Blockchain team: list LabTests by status
app.get("/labtests/chain", async (req, res) => {
  const { status = "READY", page = 1, page_size = 100 } = req.query;
  const limit = Math.min(parseInt(page_size,10) || 100, 500);
  const skip = (parseInt(page,10) - 1) * limit;
  const q = { status: String(status).toUpperCase() };
  const [items, total] = await Promise.all([
    LabTest.find(q).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
    LabTest.countDocuments(q)
  ]);
  res.json({
    items: items.map(l => ({ id: l.id, batch_id: l.batchId, status: l.status, gate: l.gate, hash: l.hash })),
    page: Number(page), total
  });
});

// Blockchain team: update status/hash for a ProcessingStep
app.patch("/processing/:id/blockchain", async (req, res) => {
  const { id } = req.params;
  const { status, hash } = req.body || {};
  const allowed = new Set(["READY", "IN_PROGRESS", "COMPLETE"]);
  if (status && !allowed.has(String(status).toUpperCase())) {
    return res.status(400).json({ error: "Invalid status. Use READY | IN_PROGRESS | COMPLETE" });
  }
  const update = {};
  if (status) update.status = String(status).toUpperCase();
  if (hash) update.hash = hash;
  const r = await ProcessingStep.updateOne({ id }, { $set: update });
  if (r.matchedCount === 0) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ id, ...update });
});

// Blockchain team: update hash for a LabTest
app.patch("/labtest/:id/blockchain", async (req, res) => {
  const { id } = req.params;
  const { status, hash } = req.body || {};
  const allowed = new Set(["READY", "IN_PROGRESS", "COMPLETE"]);
  if (status && !allowed.has(String(status).toUpperCase())) {
    return res.status(400).json({ error: "Invalid status. Use READY | IN_PROGRESS | COMPLETE" });
  }
  const update = {};
  if (status) update.status = String(status).toUpperCase();
  if (hash) update.hash = hash;
  const r = await LabTest.updateOne({ id }, { $set: update });
  if (r.matchedCount === 0) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ id, ...update });
});

// Blockchain team: update status/hash for a CollectionEvent
app.patch("/collection/:id/blockchain", async (req, res) => {
  const { id } = req.params;
  const { status, hash } = req.body || {};
  const allowed = new Set(["READY", "IN_PROGRESS", "COMPLETE"]);
  if (status && !allowed.has(String(status).toUpperCase())) {
    return res.status(400).json({ error: "Invalid status. Use READY | IN_PROGRESS | COMPLETE" });
  }
  const update = {};
  if (status) update.status = String(status).toUpperCase();
  if (hash) update.hash = hash;
  const r = await CollectionEvent.updateOne({ id }, { $set: update });
  if (r.matchedCount === 0) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ id, ...update });
});

