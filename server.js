require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");

const app = express();
const port = Number(process.env.PORT) || 3000;

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.XAI_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || process.env.XAI_MODEL || "llama-3.1-8b-instant";
const CHAT_TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS) || 16000;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

const API_JSON_LIMIT = process.env.API_JSON_LIMIT || "12mb";
const DATA_DIR = path.join(__dirname, "data");
const ITINERARY_STORE_FILE = path.join(DATA_DIR, "itineraries.json");
const ITINERARY_PROOF_DIR = path.join(__dirname, "uploads", "itinerary-proofs");
const MAX_ITINERARY_IMAGE_BYTES = Number(process.env.MAX_ITINERARY_IMAGE_BYTES) || 5 * 1024 * 1024;
const MAX_ITINERARY_ITEMS = Number(process.env.MAX_ITINERARY_ITEMS) || 500;

const projectContext = [
  "TripTales is a tourism planning website for Jammu and Kashmir.",
  "Pages include Home, Explore, About, Admin, and Login.",
  "Main focus: practical itineraries, budget guidance, safety insights, and execution support.",
  "Users may ask to optimize budgets, shorten/expand day-wise plans, and improve women-safety guidance.",
  "Assistant should help modify itinerary plans while staying within Jammu and Kashmir travel scope.",
  "Featured itineraries:",
  "1) Kashmir Budget Explorer: 5 days, INR 18,000-22,000.",
  "2) Kashmir Luxury Couple Trip: 3 days, INR 35,000-45,000.",
  "3) Jammu Pilgrimage Family Plan: 4 days, INR 9,000-12,000.",
  "4) Jammu Culture and History Trail: 3 days, INR 8,000-10,000.",
  "5) Kashmir Adventure Circuit: 6 days, INR 28,000-35,000."
].join("\n");

const blockedReply =
  "I can only help with TripTales project topics like Jammu and Kashmir itineraries, budgets, routes, features, and how to use this website.";

const projectKeywords = [
  "triptales",
  "project",
  "website",
  "travel",
  "trip",
  "tour",
  "jammu",
  "kashmir",
  "itinerary",
  "budget",
  "route",
  "explore",
  "admin",
  "login",
  "plan"
];

const reviewStatuses = new Set(["pending", "approved", "rejected"]);
let itineraryWriteQueue = Promise.resolve();

function hasProjectKeyword(text) {
  if (!text || typeof text !== "string") return false;
  const normalized = text.toLowerCase();
  return projectKeywords.some((word) => normalized.includes(word));
}

function isLikelyFollowUp(text) {
  if (!text || typeof text !== "string") return false;
  const normalized = text
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:]+$/g, "");
  if (normalized.length > 40) return false;
  const followUps = ["yes", "yep", "yeah", "ok", "okay", "sure", "go ahead", "continue", "next", "no", "nope"];
  return followUps.some((item) => normalized === item);
}

function isProjectQuestion(text, history) {
  if (hasProjectKeyword(text)) return true;
  if (!isLikelyFollowUp(text)) return false;
  if (!Array.isArray(history) || !history.length) return false;

  const recentContext = history
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .slice(-6)
    .some((item) => hasProjectKeyword(String(item.content || "")));

  return recentContext;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeTextField(value, label, maxLength) {
  const result = String(value || "").trim();
  if (!result) throw createHttpError(400, `${label} is required.`);
  if (result.length > maxLength) throw createHttpError(400, `${label} must be ${maxLength} characters or fewer.`);
  return result;
}

function parseCoordinate(raw, label, min, max) {
  const value = Number(raw);
  if (!Number.isFinite(value)) throw createHttpError(400, `${label} must be a valid number.`);
  if (value < min || value > max) throw createHttpError(400, `${label} must be between ${min} and ${max}.`);
  return Number(value.toFixed(6));
}

function parseProofDataUrl(dataUrl) {
  const input = String(dataUrl || "").trim();
  if (!input) throw createHttpError(400, "capturedPhotoDataUrl is required.");

  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(input);
  if (!match) {
    throw createHttpError(400, "capturedPhotoDataUrl must be a valid base64 image data URL.");
  }

  const mimeType = String(match[1] || "").toLowerCase();
  const base64Payload = String(match[2] || "").replace(/\s+/g, "");
  if (!base64Payload) {
    throw createHttpError(400, "capturedPhotoDataUrl is empty.");
  }

  const buffer = Buffer.from(base64Payload, "base64");
  if (!buffer.length) {
    throw createHttpError(400, "capturedPhotoDataUrl cannot be decoded.");
  }
  if (buffer.length > MAX_ITINERARY_IMAGE_BYTES) {
    throw createHttpError(413, `Captured photo exceeds ${MAX_ITINERARY_IMAGE_BYTES} bytes.`);
  }

  let extension = "jpg";
  if (mimeType === "image/png") extension = "png";
  if (mimeType === "image/webp") extension = "webp";

  return { mimeType, extension, buffer };
}

function parseListLimit(rawLimit) {
  const fallback = 50;
  const value = Number(rawLimit);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), 200);
}

function parseReviewStatus(value) {
  const status = String(value || "")
    .trim()
    .toLowerCase();
  if (!reviewStatuses.has(status)) {
    throw createHttpError(400, "reviewStatus must be one of: pending, approved, rejected.");
  }
  return status;
}

function toPublicPath(absolutePath) {
  const relative = path.relative(__dirname, absolutePath);
  return "/" + relative.split(path.sep).join("/");
}

async function ensureStorageInfrastructure() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(ITINERARY_PROOF_DIR, { recursive: true });

  try {
    await fs.access(ITINERARY_STORE_FILE);
  } catch (error) {
    await fs.writeFile(ITINERARY_STORE_FILE, "[]\n", "utf8");
  }
}

async function readItineraryStore() {
  await ensureStorageInfrastructure();
  const raw = await fs.readFile(ITINERARY_STORE_FILE, "utf8");
  if (!raw.trim()) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw createHttpError(500, "Itinerary data store is corrupted.");
  }
  if (!Array.isArray(parsed)) {
    throw createHttpError(500, "Itinerary data store is invalid.");
  }
  return parsed;
}

async function writeItineraryStore(items) {
  await fs.writeFile(ITINERARY_STORE_FILE, JSON.stringify(items, null, 2) + "\n", "utf8");
}

function withItineraryWriteLock(task) {
  itineraryWriteQueue = itineraryWriteQueue.then(task, task);
  return itineraryWriteQueue;
}

async function saveProofImage(itineraryId, parsedPhoto) {
  await ensureStorageInfrastructure();
  const fileName = `${itineraryId}.${parsedPhoto.extension}`;
  const absolutePath = path.join(ITINERARY_PROOF_DIR, fileName);
  await fs.writeFile(absolutePath, parsedPhoto.buffer);
  return toPublicPath(absolutePath);
}

function buildItineraryFromPayload(payload) {
  const title = normalizeTextField(payload?.title, "title", 120);
  const route = normalizeTextField(payload?.route, "route", 220);
  const duration = normalizeTextField(payload?.duration, "duration", 60);
  const budget = normalizeTextField(payload?.budget, "budget", 80);
  const highlights = normalizeTextField(payload?.highlights, "highlights", 1800);
  const locationLatitude = parseCoordinate(payload?.locationLatitude, "locationLatitude", -90, 90);
  const locationLongitude = parseCoordinate(payload?.locationLongitude, "locationLongitude", -180, 180);
  const parsedPhoto = parseProofDataUrl(payload?.capturedPhotoDataUrl);

  return {
    title,
    route,
    duration,
    budget,
    highlights,
    locationLatitude,
    locationLongitude,
    parsedPhoto
  };
}

function sendInternalApiError(res, error, fallbackMessage) {
  const statusCode = Number(error?.statusCode) || 500;
  return res.status(statusCode).json({
    error: statusCode >= 500 ? fallbackMessage : error.message,
    details: statusCode >= 500 ? error.message : undefined
  });
}

app.use(cors());
app.use(express.json({ limit: API_JSON_LIMIT }));
app.use(express.static(path.join(__dirname)));

app.get("/api/public-config", (req, res) => {
  return res.json({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY
  });
});

app.get("/api/itineraries", async (req, res) => {
  try {
    const allItems = await readItineraryStore();
    const statusQuery = String(req.query?.status || "")
      .trim()
      .toLowerCase();
    const limit = parseListLimit(req.query?.limit);

    const filtered = reviewStatuses.has(statusQuery)
      ? allItems.filter((item) => String(item?.reviewStatus || "").toLowerCase() === statusQuery)
      : allItems;

    return res.json({
      total: filtered.length,
      items: filtered.slice(0, limit)
    });
  } catch (error) {
    return sendInternalApiError(res, error, "Failed to read itineraries.");
  }
});

app.get("/api/itineraries/:id", async (req, res) => {
  try {
    const itineraryId = String(req.params?.id || "").trim();
    if (!itineraryId) throw createHttpError(400, "itinerary id is required.");

    const items = await readItineraryStore();
    const found = items.find((item) => String(item?.id || "") === itineraryId);
    if (!found) throw createHttpError(404, "Itinerary not found.");

    return res.json({ itinerary: found });
  } catch (error) {
    return sendInternalApiError(res, error, "Failed to fetch itinerary.");
  }
});

app.post("/api/itineraries", async (req, res) => {
  try {
    const parsed = buildItineraryFromPayload(req.body);
    const itineraryId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const proofPhotoUrl = await saveProofImage(itineraryId, parsed.parsedPhoto);

    const itineraryRecord = {
      id: itineraryId,
      title: parsed.title,
      route: parsed.route,
      duration: parsed.duration,
      budget: parsed.budget,
      highlights: parsed.highlights,
      reviewStatus: "pending",
      createdAt,
      proof: {
        location: {
          latitude: parsed.locationLatitude,
          longitude: parsed.locationLongitude
        },
        photo: {
          mimeType: parsed.parsedPhoto.mimeType,
          sizeBytes: parsed.parsedPhoto.buffer.length,
          url: proofPhotoUrl
        }
      }
    };

    await withItineraryWriteLock(async () => {
      const items = await readItineraryStore();
      items.unshift(itineraryRecord);
      if (items.length > MAX_ITINERARY_ITEMS) {
        items.length = MAX_ITINERARY_ITEMS;
      }
      await writeItineraryStore(items);
    });

    return res.status(201).json({
      message: "Itinerary created successfully.",
      itinerary: itineraryRecord
    });
  } catch (error) {
    return sendInternalApiError(res, error, "Failed to create itinerary.");
  }
});

app.patch("/api/itineraries/:id/status", async (req, res) => {
  try {
    const itineraryId = String(req.params?.id || "").trim();
    if (!itineraryId) throw createHttpError(400, "itinerary id is required.");

    const reviewStatus = parseReviewStatus(req.body?.reviewStatus);
    const reviewNote = String(req.body?.reviewNote || "").trim().slice(0, 500);
    let updatedRecord = null;

    await withItineraryWriteLock(async () => {
      const items = await readItineraryStore();
      const index = items.findIndex((item) => String(item?.id || "") === itineraryId);
      if (index < 0) throw createHttpError(404, "Itinerary not found.");

      const record = items[index];
      record.reviewStatus = reviewStatus;
      record.reviewedAt = new Date().toISOString();
      if (reviewNote) {
        record.reviewNote = reviewNote;
      } else {
        delete record.reviewNote;
      }
      updatedRecord = record;

      await writeItineraryStore(items);
    });

    return res.json({
      message: "Itinerary review status updated.",
      itinerary: updatedRecord
    });
  } catch (error) {
    return sendInternalApiError(res, error, "Failed to update itinerary status.");
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    if (!isProjectQuestion(message, history)) {
      return res.json({ reply: blockedReply });
    }

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: "Missing GROQ_API_KEY in environment." });
    }

    const sanitizedHistory = history
      .filter((item) => item && (item.role === "user" || item.role === "assistant"))
      .slice(-8)
      .map((item) => ({
        role: item.role,
        content: String(item.content || "").slice(0, 1200)
      }));

    const systemPrompt = [
      "You are TripTales Assistant.",
      "Only answer questions related to this TripTales project.",
      "If user asks anything outside project scope, politely refuse and redirect to TripTales topics.",
      "Keep answers concise and useful.",
      "When asked to modify itinerary plans, return practical execution advice in sections where useful:",
      "1) Summary",
      "2) Day-wise adjustments",
      "3) Budget impact",
      "4) Safety notes (include women-safety where relevant).",
      "",
      "Project context:",
      projectContext
    ].join("\n");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, CHAT_TIMEOUT_MS);

    let response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.2,
          messages: [{ role: "system", content: systemPrompt }, ...sanitizedHistory, { role: "user", content: message }]
        })
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const details = await response.text();
      return res.status(response.status).json({ error: "Groq request failed.", details });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(502).json({ error: "No response generated by Groq." });
    }

    return res.json({ reply });
  } catch (error) {
    if (error && error.name === "AbortError") {
      return res.status(504).json({ error: "Chat request timed out. Please try again." });
    }
    return res.status(500).json({ error: "Failed to process chat request.", details: error.message });
  }
});

app.use((error, req, res, next) => {
  if (error && error.type === "entity.too.large") {
    return res.status(413).json({ error: `Request payload is too large. Limit is ${API_JSON_LIMIT}.` });
  }
  return next(error);
});

ensureStorageInfrastructure().catch((error) => {
  console.error("Failed to initialize itinerary storage:", error.message);
});

app.listen(port, () => {
  console.log(`TripTales server running on http://localhost:${port}`);
});
