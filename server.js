// server.js — Node 18+, Express + Mongoose (MongoDB Atlas)
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const dns = require("dns");
const crypto = require("crypto");

const app = express();
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

const Batch = mongoose.model(
  "Batch",
  new mongoose.Schema({
    id: { type: String, unique: true },                    // B-ASHWA-YYYYMMDD-farmer-123
    scientificName: { type: String, required: true },
    collectorId: { type: String, required: true },
    dateUtc: { type: String, required: true },             // YYYY-MM-DD
    statusPhase: { type: String, default: "CREATED" },     // CREATED → ... → READY_FOR_QA
    chainStatus: {                                         // READY | IN_PROGRESS | COMPLETE
      type: String,
      enum: ["READY", "IN_PROGRESS", "COMPLETE"],
      default: "READY"
    }
  }, { timestamps: true })
);

const CollectionEvent = mongoose.model(
  "CollectionEvent",
  new mongoose.Schema({
    id: { type: String, unique: true },                    // CE-xxxxxxxx
    clientEventId: { type: String, unique: true, sparse: true },
    scientificName: { type: String, required: true },
    vernacularName: String,
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
    notes: String
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
    const p = req.body || {};
    if (!p.scientificName || !p.collectorId || !p.geo || typeof p.geo.lat !== "number" || typeof p.geo.lng !== "number" || !p.timestamp)
      return res.status(400).json({ error: "scientificName, collectorId, geo.lat, geo.lng, timestamp required" });

    // idempotency by clientEventId
    if (p.clientEventId) {
      const exists = await CollectionEvent.findOne({ clientEventId: p.clientEventId }).lean();
      if (exists) {
        return res.json({
          collectionEvent: {
            id: exists.id,
            scientificName: exists.scientificName,
            vernacularName: exists.vernacularName,
            collectorId: exists.collectorId,
            geo: exists.geo,
            timestamp: isoZ(exists.timestampUtc),
            ai: exists.ai || {},
            status: exists.status,
            violations: exists.violations,
            hash: exists.hash
          },
          batch: { id: exists.batchId, status_phase: "CREATED" }
        });
      }
    }

    // ensure batch (day-batch per species+collector)
    const code = await speciesCodeFor(p.scientificName);
    const batchId = makeBatchId(code, p.timestamp, p.collectorId);
    const dateUtc = isoZ(p.timestamp).slice(0,10);
    await Batch.updateOne(
      { id: batchId },
      { $setOnInsert: { id: batchId, scientificName: p.scientificName, collectorId: p.collectorId, dateUtc, statusPhase: "CREATED" } },
      { upsert: true }
    );

    // CE id + canonical hash (your own integrity check)
    const ceid = "CE-" + crypto.randomBytes(4).toString("hex");
    const hashBody = {
      id: ceid,
      scientificName: p.scientificName,
      vernacularName: p.vernacularName || null,
      collectorId: p.collectorId,
      geo: p.geo,
      timestamp: isoZ(p.timestamp),
      ai: p.ai || {},
      status: "ACCEPTED",
      violations: []
    };
    const canon = stableStringify(hashBody);
    const digest = sha256Hex(canon);

    await CollectionEvent.create({
      id: ceid,
      clientEventId: p.clientEventId || null,
      scientificName: p.scientificName,
      vernacularName: p.vernacularName || null,
      collectorId: p.collectorId,
      geo: p.geo,
      timestampUtc: new Date(p.timestamp),
      ai: p.ai || null,
      status: "ACCEPTED",
      violations: [],
      batchId,
      hash: digest
    });

    return res.status(201).json({
      collectionEvent: { ...hashBody, hash: digest },
      batch: { id: batchId, status_phase: "CREATED" }
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
    vernacularName: doc.vernacularName,
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
  const doc = await ProcessingStep.create({
    id,
    batchId: p.batch_id,
    stepType: p.step_type,
    status: p.status || "COMPLETED",
    startedAt: p.started_at ? new Date(p.started_at) : undefined,
    endedAt: p.ended_at ? new Date(p.ended_at) : undefined,
    params: p.params || {},
    postMetrics: p.post_step_metrics || {},
    notes: p.notes || ""
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
  const { status } = req.body || {};
  const allowed = new Set(["READY", "IN_PROGRESS", "COMPLETE"]);
  if (!status || !allowed.has(String(status).toUpperCase())) {
    return res.status(400).json({ error: "Invalid status. Use READY | IN_PROGRESS | COMPLETE" });
  }
  const next = String(status).toUpperCase();
  const r = await Batch.updateOne({ id }, { $set: { chainStatus: next } });
  if (r.matchedCount === 0) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ id, chain_status: next });
});

// health
app.get("/healthz", (_, res) => res.json({ ok: true }));

