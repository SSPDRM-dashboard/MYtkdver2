import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server. Please check your configuration in Settings > Secrets.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Helper to call with timeout so hung network requests fail fast and trigger the fallback
async function callWithTimeout<T>(promise: Promise<T>, timeoutMs = 90000, modelName = ""): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout (${timeoutMs}ms) awaiting response from ${modelName}`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

// Resilient helper to handle temporary 503 / high demand spikes / 404s / empty outputs with model fallbacks
async function generateWithRetry(
  ai: GoogleGenAI,
  primaryModel: string,
  params: any,
  timeoutMs = 75000
) {
  // Ordered fallback models: start with primary (gemini-4-hydrogen), then fast gemini-3.1-flash-lite
  const candidateModels = [
    primaryModel,
    "gemini-4-hydrogen",
    "gemini-3.1-flash-lite",
  ];
  const modelsToTry = Array.from(new Set(candidateModels));

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Gemini Server] Requesting model ${model} (timeout ${timeoutMs}ms)...`);
      
      const modelParams = JSON.parse(JSON.stringify(params));
      
      // Only use thinkingConfig on gemini-4-hydrogen/argon/carbon or gemini-3-pro; strip for flash-lite fallback for maximum speed
      if (model === "gemini-3.1-flash-lite" && modelParams.config?.thinkingConfig) {
        delete modelParams.config.thinkingConfig;
      } else if (modelParams.config?.thinkingConfig && !model.startsWith("gemini-3") && !model.startsWith("gemini-4")) {
        delete modelParams.config.thinkingConfig;
      }

      try {
        let response = await callWithTimeout(
          ai.models.generateContent({
            ...modelParams,
            model,
          }),
          timeoutMs,
          model
        );

        let txt = extractResponseText(response);

        // If high thinking caused token exhaustion without returning text/JSON, retry with LOW thinking level
        if ((!txt || !txt.trim() || (modelParams.config?.responseMimeType === "application/json" && !txt.includes("{"))) &&
            modelParams.config?.thinkingConfig?.thinkingLevel === ThinkingLevel.HIGH) {
          console.warn(`[Gemini Server] Output lacked expected JSON with HIGH thinking. Retrying ${model} with LOW thinking level...`);
          modelParams.config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
          response = await callWithTimeout(
            ai.models.generateContent({
              ...modelParams,
              model,
            }),
            timeoutMs,
            model
          );
          txt = extractResponseText(response);
        }

        if (txt && txt.trim()) {
          return response;
        }

        throw new Error(`Model ${model} returned an empty analysis.`);
      } catch (innerErr: any) {
        const innerMsg = (innerErr?.message || "").toLowerCase();
        // If responseSchema or thinkingConfig caused a 400/schema/thinking error on this model, attempt fallback without those constraints
        if (
          !innerMsg.includes("404") &&
          !innerMsg.includes("not_found") &&
          !innerMsg.includes("api_key_invalid") &&
          (innerMsg.includes("schema") || innerMsg.includes("thinking") || innerMsg.includes("400") || innerMsg.includes("invalid_argument")) &&
          (modelParams.config?.responseSchema || modelParams.config?.thinkingConfig)
        ) {
          console.warn(`[Gemini Server] Retrying ${model} without strict responseSchema/thinkingConfig constraints...`);
          delete modelParams.config.responseSchema;
          delete modelParams.config.responseMimeType;
          delete modelParams.config.thinkingConfig;
          const fallbackResp = await callWithTimeout(
            ai.models.generateContent({
              ...modelParams,
              model,
            }),
            timeoutMs,
            model
          );
          const fallbackTxt = extractResponseText(fallbackResp);
          if (fallbackTxt && fallbackTxt.trim()) {
            return fallbackResp;
          }
          throw new Error(`Fallback retry on ${model} returned an empty analysis.`);
        }
        throw innerErr;
      }
    } catch (err: any) {
      lastError = err;
      const msg = (err?.message || "").toLowerCase();
      console.warn(`[Gemini Server] Issue with model ${model}: ${err?.message || 'Error'}.`);

      // If it's a fatal client error not solvable by switching models (e.g. malformed base64 image or invalid API key)
      if (
        (msg.includes("invalid_argument") && (msg.includes("image") || msg.includes("base64"))) ||
        msg.includes("api_key_invalid")
      ) {
        throw err;
      }
    }
  }

  throw lastError || new Error("All AI models failed to return a valid analysis.");
}

function extractResponseText(response: any): string {
  if (typeof response?.text === "string" && response.text.trim()) {
    return response.text;
  }

  const candidates = response?.candidates;
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts;
      if (Array.isArray(parts)) {
        // Collect all non-thought parts that contain text
        const nonThoughtText = parts
          .filter((p: any) => p && !p.thought && typeof p.text === "string" && p.text.trim())
          .map((p: any) => p.text)
          .join("");

        if (nonThoughtText) return nonThoughtText;

        // Fallback: look for parts containing JSON delimiters '{' or '['
        const jsonParts = parts
          .filter((p: any) => p && typeof p.text === "string" && (p.text.includes("{") || p.text.includes("[")))
          .map((p: any) => p.text)
          .join("");

        if (jsonParts) return jsonParts;

        // Fallback: any text part
        const anyText = parts
          .filter((p: any) => p && typeof p.text === "string" && p.text.trim())
          .map((p: any) => p.text)
          .join("");

        if (anyText) return anyText;
      }
    }
  }

  return "";
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for large payload (e.g., base64 bracket images / PDFs)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // ============================================================================
  // WAYCHAMP OVR & HTTP MATCH ACTION BRIDGE (Bidirectional)
  // ============================================================================
  interface WaychampLogEntry {
    id: string;
    timestamp: string;
    endpoint: 'ovr' | 'match-action';
    method: string;
    path: string;
    query: Record<string, any>;
    mat: string;
    body: any;
    summary: string;
  }

  interface WaychampMatStatus {
    mat: string;
    ringNumber: number;
    connected: boolean;
    lastSeenAt: string;
    lastAction: string;
    boutNumber?: string;
    round?: number | string;
    blueScore?: number;
    redScore?: number;
    blueGamJeom?: number;
    redGamJeom?: number;
    winner?: 'blue' | 'red' | null;
    rawPayload?: any;
  }

  interface WaychampPendingResult {
    id: string;
    receivedAt: string;
    mat: string;
    ringNumber: number;
    boutNumber: string;
    winner: 'blue' | 'red';
    blueScore?: number;
    redScore?: number;
    rawPayload?: any;
  }

  const waychampState: {
    enabled: boolean;
    eventName: string;
    eventDate: string;
    rings: any[];
    lastSyncedAt: string | null;
    incomingLogs: WaychampLogEntry[];
    liveMatStatus: Record<string, WaychampMatStatus>;
    pendingResults: WaychampPendingResult[];
  } = {
    enabled: false,
    eventName: "",
    eventDate: "",
    rings: [],
    lastSyncedAt: null,
    incomingLogs: [],
    liveMatStatus: {},
    pendingResults: [],
  };

  function resolveMatAndRing(rawMat: any): { mat: string; ringNumber: number } {
    const str = String(rawMat ?? "").trim().toUpperCase();
    if (!str) return { mat: "A", ringNumber: 1 };
    if (/^[A-Z]$/.test(str)) {
      return { mat: str, ringNumber: str.charCodeAt(0) - 64 };
    }
    const numMatch = str.match(/\d+/);
    if (numMatch) {
      const n = Math.max(1, parseInt(numMatch[0], 10));
      const letter = n >= 1 && n <= 26 ? String.fromCharCode(64 + n) : String(n);
      return { mat: letter, ringNumber: n };
    }
    return { mat: str, ringNumber: 1 };
  }

  function extractMatFromReq(req: express.Request): { mat: string; ringNumber: number } {
    const q = req.query || {};
    const b = (req.body && typeof req.body === "object") ? req.body : {};
    const candidate =
      q.mat ?? q.Mat ?? q.court ?? q.Court ?? q.ring ?? q.Ring ?? q.field ??
      b.mat ?? b.Mat ?? b.court ?? b.Court ?? b.ring ?? b.Ring ?? b.field ??
      b.matName ?? b.courtName ?? "";
    return resolveMatAndRing(candidate);
  }

  function parseWaychampPayload(body: any) {
    if (!body || typeof body !== "object") return {};
    const blueScoreRaw = body.blueScore ?? body.chungScore ?? body.blue_score ?? body.scoreBlue ?? body.blue?.score;
    const redScoreRaw = body.redScore ?? body.hongScore ?? body.red_score ?? body.scoreRed ?? body.red?.score;
    const blueGjRaw = body.blueGamJeom ?? body.chungGamJeom ?? body.blue_gamjeom ?? body.blue?.gamJeom;
    const redGjRaw = body.redGamJeom ?? body.hongGamJeom ?? body.red_gamjeom ?? body.red?.gamJeom;
    const roundRaw = body.round ?? body.currentRound ?? body.roundNumber;
    const boutRaw = body.boutNumber ?? body.bout ?? body.matchNumber ?? body.matchNo ?? body.matchId ?? body.MatchNumber;
    const actionRaw = body.action ?? body.event ?? body.type ?? body.status ?? body.Action ?? "update";

    let winner: 'blue' | 'red' | null = null;
    const winnerRaw = String(body.winner ?? body.winnerSide ?? body.Winner ?? "").trim().toLowerCase();
    if (winnerRaw === "blue" || winnerRaw === "chung" || winnerRaw === "b") winner = "blue";
    else if (winnerRaw === "red" || winnerRaw === "hong" || winnerRaw === "r") winner = "red";

    return {
      boutNumber: boutRaw !== undefined ? String(boutRaw) : undefined,
      round: roundRaw,
      blueScore: blueScoreRaw !== undefined ? Number(blueScoreRaw) : undefined,
      redScore: redScoreRaw !== undefined ? Number(redScoreRaw) : undefined,
      blueGamJeom: blueGjRaw !== undefined ? Number(blueGjRaw) : undefined,
      redGamJeom: redGjRaw !== undefined ? Number(redGjRaw) : undefined,
      winner,
      action: String(actionRaw),
    };
  }

  function formatRingForWaychamp(ringObj: any, mat: string, ringNumber: number) {
    const bouts: any[] = [];
    const pushBout = (b: any, statusLabel: string) => {
      if (!b) return;
      bouts.push({
        matchNumber: String(b.bout ?? ""),
        boutNumber: String(b.bout ?? ""),
        mat,
        ring: ringNumber,
        status: statusLabel,
        category: String(b.category ?? ""),
        stage: String(b.stage ?? ""),
        blue: {
          name: String(b.blue_name ?? ""),
          club: String(b.blue_club ?? ""),
          country: String(b.blue_club ?? ""),
        },
        red: {
          name: String(b.red_name ?? ""),
          club: String(b.red_club ?? ""),
          country: String(b.red_club ?? ""),
        },
        blueName: String(b.blue_name ?? ""),
        blueClub: String(b.blue_club ?? ""),
        redName: String(b.red_name ?? ""),
        redClub: String(b.red_club ?? ""),
      });
    };

    if (ringObj) {
      pushBout(ringObj.currentBout, "LIVE");
      pushBout(ringObj.onDeck, "ON_DECK");
      pushBout(ringObj.inTheHole, "IN_THE_HOLE");
    }

    return {
      status: "ok",
      connected: true,
      supplier: "Waychamp",
      system: "MY-TKD",
      eventName: waychampState.eventName,
      eventDate: waychampState.eventDate,
      mat,
      ringNumber,
      currentMatch: bouts[0] || null,
      matches: bouts,
      timestamp: new Date().toISOString(),
    };
  }

  // Permissive CORS for Waychamp desktop PSS client on mat laptops
  app.use("/api/waychamp", (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Frontend -> Server: sync current tournament rings & bouts so Waychamp can pull them
  app.post("/api/waychamp/sync-rings", (req, res) => {
    const { eventName, eventDate, rings } = req.body || {};
    waychampState.eventName = String(eventName ?? "");
    waychampState.eventDate = String(eventDate ?? "");
    waychampState.rings = Array.isArray(rings) ? rings : [];
    waychampState.lastSyncedAt = new Date().toISOString();
    return res.json({
      status: "ok",
      syncedRingCount: waychampState.rings.length,
      lastSyncedAt: waychampState.lastSyncedAt,
    });
  });

  // Frontend -> Server: toggle Waychamp integration ON / OFF
  app.post("/api/waychamp/toggle", (req, res) => {
    const { enabled } = req.body || {};
    waychampState.enabled = Boolean(enabled);
    return res.json({ status: "ok", enabled: waychampState.enabled });
  });

  // Frontend -> Server: inspect Waychamp connection status, logs, and pending results
  app.get("/api/waychamp/status", (_req, res) => {
    return res.json({
      status: "ok",
      enabled: waychampState.enabled,
      eventName: waychampState.eventName,
      eventDate: waychampState.eventDate,
      syncedRingCount: waychampState.rings.length,
      lastSyncedAt: waychampState.lastSyncedAt,
      liveMatStatus: waychampState.liveMatStatus,
      incomingLogs: waychampState.incomingLogs,
      pendingResults: waychampState.pendingResults,
    });
  });

  app.post("/api/waychamp/clear-logs", (_req, res) => {
    waychampState.incomingLogs = [];
    waychampState.pendingResults = [];
    return res.json({ status: "ok" });
  });

  app.post("/api/waychamp/ack-result", (req, res) => {
    const { id } = req.body || {};
    waychampState.pendingResults = waychampState.pendingResults.filter((r) => r.id !== id);
    return res.json({ status: "ok" });
  });

  // Waychamp OVR Endpoint (handles GET/POST on /api/waychamp/ovr and any sub-paths Waychamp appends)
  const handleWaychampOvr = (req: express.Request, res: express.Response) => {
    if (!waychampState.enabled) {
      return res.status(503).json({
        status: "disabled",
        connected: false,
        message: "Waychamp OVR integration is currently turned OFF by admin.",
      });
    }
    const { mat, ringNumber } = extractMatFromReq(req);
    const parsed = parseWaychampPayload(req.body);
    const nowIso = new Date().toISOString();

    const prev = waychampState.liveMatStatus[mat];
    waychampState.liveMatStatus[mat] = {
      mat,
      ringNumber,
      connected: true,
      lastSeenAt: nowIso,
      lastAction: req.method === "GET" ? "OVR Poll / Connection Check" : (parsed.action || "OVR Update"),
      boutNumber: parsed.boutNumber ?? prev?.boutNumber,
      round: parsed.round ?? prev?.round,
      blueScore: parsed.blueScore ?? prev?.blueScore,
      redScore: parsed.redScore ?? prev?.redScore,
      blueGamJeom: parsed.blueGamJeom ?? prev?.blueGamJeom,
      redGamJeom: parsed.redGamJeom ?? prev?.redGamJeom,
      winner: parsed.winner ?? prev?.winner ?? null,
      rawPayload: req.method === "GET" ? req.query : req.body,
    };

    if (parsed.winner && parsed.boutNumber) {
      waychampState.pendingResults.unshift({
        id: `wc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        receivedAt: nowIso,
        mat,
        ringNumber,
        boutNumber: parsed.boutNumber,
        winner: parsed.winner,
        blueScore: parsed.blueScore,
        redScore: parsed.redScore,
        rawPayload: req.body,
      });
      if (waychampState.pendingResults.length > 30) {
        waychampState.pendingResults.length = 30;
      }
    }

    waychampState.incomingLogs.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      endpoint: "ovr",
      method: req.method,
      path: req.originalUrl,
      query: req.query as Record<string, any>,
      mat,
      body: req.body,
      summary:
        req.method === "GET"
          ? `Mat ${mat} (Ring ${ringNumber}) OVR GET / Connection`
          : `Mat ${mat} (Ring ${ringNumber}) ${parsed.action || "POST"}${parsed.winner ? ` — Winner: ${parsed.winner.toUpperCase()}` : ""}`,
    });
    if (waychampState.incomingLogs.length > 50) {
      waychampState.incomingLogs.length = 50;
    }

    const ringObj = waychampState.rings.find((r: any) => Number(r.ringNumber) === ringNumber);
    return res.json(formatRingForWaychamp(ringObj, mat, ringNumber));
  };

  app.all("/api/waychamp/ovr", handleWaychampOvr);
  app.all("/api/waychamp/ovr/*", handleWaychampOvr);

  // Waychamp HTTP Match Action Endpoint
  const handleWaychampMatchAction = (req: express.Request, res: express.Response) => {
    if (!waychampState.enabled) {
      return res.status(503).json({
        status: "disabled",
        received: false,
        message: "Waychamp HTTP Match Action integration is currently turned OFF by admin.",
      });
    }
    const { mat, ringNumber } = extractMatFromReq(req);
    const parsed = parseWaychampPayload(req.body);
    const nowIso = new Date().toISOString();

    const prev = waychampState.liveMatStatus[mat];
    waychampState.liveMatStatus[mat] = {
      mat,
      ringNumber,
      connected: true,
      lastSeenAt: nowIso,
      lastAction: parsed.action || `HTTP Match Action (${req.method})`,
      boutNumber: parsed.boutNumber ?? prev?.boutNumber,
      round: parsed.round ?? prev?.round,
      blueScore: parsed.blueScore ?? prev?.blueScore,
      redScore: parsed.redScore ?? prev?.redScore,
      blueGamJeom: parsed.blueGamJeom ?? prev?.blueGamJeom,
      redGamJeom: parsed.redGamJeom ?? prev?.redGamJeom,
      winner: parsed.winner ?? prev?.winner ?? null,
      rawPayload: req.method === "GET" ? req.query : req.body,
    };

    if (parsed.winner && parsed.boutNumber) {
      waychampState.pendingResults.unshift({
        id: `wc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        receivedAt: nowIso,
        mat,
        ringNumber,
        boutNumber: parsed.boutNumber,
        winner: parsed.winner,
        blueScore: parsed.blueScore,
        redScore: parsed.redScore,
        rawPayload: req.body,
      });
      if (waychampState.pendingResults.length > 30) {
        waychampState.pendingResults.length = 30;
      }
    }

    waychampState.incomingLogs.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      endpoint: "match-action",
      method: req.method,
      path: req.originalUrl,
      query: req.query as Record<string, any>,
      mat,
      body: req.body,
      summary: `Mat ${mat} (Ring ${ringNumber}) Match Action: ${parsed.action || req.method}`,
    });
    if (waychampState.incomingLogs.length > 50) {
      waychampState.incomingLogs.length = 50;
    }

    return res.json({
      status: "ok",
      received: true,
      mat,
      ringNumber,
      timestamp: nowIso,
    });
  };

  app.all("/api/waychamp/match-action", handleWaychampMatchAction);
  app.all("/api/waychamp/match-action/*", handleWaychampMatchAction);

  // Analyze Bracket Endpoint
  app.post("/api/gemini/analyze-bracket", async (req, res) => {
    try {
      const { base64Data, mimeType, isPoomsaeMode, isThinkingMode, adminNote } = req.body;

      if (!base64Data) {
        return res.status(400).json({ error: "Missing base64Data in request payload." });
      }

      // Auto-detect PDF via magic bytes (%PDF = JVBERi in base64)
      let effectiveMimeType = mimeType || "image/png";
      if (base64Data.startsWith("JVBERi") || (mimeType && mimeType.includes("pdf"))) {
        effectiveMimeType = "application/pdf";
      }

      const ai = getGeminiClient();
      const prompt = `
        You are an expert tournament bracket analyzer. Extract all bracket structures and match data from this document/image.
        
        CRITICAL RULES:
        - Vertical Hierarchy: Flow is LEFT to RIGHT.
        - Match IDs: Rectangular boxes with alphanumeric codes (e.g., A01, A05, 2001) are Bout IDs.
        - Color Assignment: Upper line = Blue Side (Chung), Lower line = Red Side (Hong).
        - Advancement: Winner of a previous match fills the slot (Upper=Blue, Lower=Red) in the next Bout ID box.
        - Player Names: Often start with "090 - ". Extract only the name.
        - Club Names: Located directly BELOW or beside the player's name. CRITICAL: Always extract both blue_club (Chung) AND red_club (Hong). Never leave red_club blank if a club/team/state name or acronym is present for the Red/Hong corner competitor.
        - Ring Mapping: 
          - 1000s=Ring 1, 2000s=Ring 2, 3000s=Ring 3, 4000s=Ring 4, 5000s=Ring 5, 6000s=Ring 6, 
          - 7000s=Ring 7, 8000s=Ring 8, 9000s=Ring 9, 10000s=Ring 10, 11000s=Ring 11, 12000s=Ring 12.
          - If alphanumeric (e.g. A01), A=1, B=2, C=3, D=4, E=5, F=6, G=7, H=8, I=9, J=10, K=11, L=12.

        ${isPoomsaeMode ? `
        INDIVIDUAL POOMSAE MODE ACTIVE:
        - This document contains Poomsae performances that should be treated as individual solo entries.
        - Map EACH player as their own separate SOLO entry (put player in "blue_name", leave "red_name" and "red_club" EMPTY).
        - Use sequential bout numbers (e.g., 1, 2, 3, 4, 5...) based on the performance order in the document.
        - Every single participant in the category must get an individual match record.
        - The category name MUST include the suffix "INDIVIDUAL POOMSAE" (e.g., "Junior Female INDIVIDUAL POOMSAE").
        - If the document is a bracket, treat every individual player slot in that bracket as a unique solo bout.
        ` : 'STRICT RULE: Do NOT treat as Individual Poomsae. Every match MUST have a Blue and Red corner if data is available.'}

        ${adminNote ? `ADMIN NOTE: ${adminNote}` : ''}

        Return JSON matching this schema:
        {
          "matches": [{"bout": "A01", "ring": 1, "category": "...", "blue_name": "...", "blue_club": "...", "red_name": "...", "red_club": "..."}],
          "mappings": [{"sourceBout": "A01", "nextBout": "A05", "slot": "Chung"}]
        }

        CRITICAL FORMATTING RULES:
        - Start your output directly with { and return ONLY the JSON object.
        - Do not output any conversational remarks, notes, or explanations like 'The page contains...'.
        - Do not include unescaped double quotes inside string values under any circumstances.
      `;

      const requestedModel = "gemini-4-hydrogen";

      const response = await generateWithRetry(
        ai,
        requestedModel,
        {
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: effectiveMimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          config: {
            systemInstruction: "You are an automated tournament bracket data extractor. Extract match bouts, solo poomsae entries, and bout advancement trees from documents and images. You strictly output valid JSON matching the schema with no conversational filler, notes, or explanations.",
            responseMimeType: "application/json",
            thinkingConfig: isThinkingMode 
              ? { thinkingLevel: ThinkingLevel.HIGH } 
              : { thinkingLevel: ThinkingLevel.LOW },
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                matches: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      ring: { type: Type.NUMBER },
                      bout: { type: Type.STRING },
                      category: { type: Type.STRING },
                      blue_name: { type: Type.STRING },
                      blue_club: { type: Type.STRING },
                      red_name: { type: Type.STRING },
                      red_club: { type: Type.STRING },
                    },
                    required: ["bout", "category", "blue_name", "blue_club", "red_name", "red_club"],
                  },
                },
                mappings: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      sourceBout: { type: Type.STRING },
                      nextBout: { type: Type.STRING },
                      slot: { type: Type.STRING, enum: ["Chung", "Hong"] },
                    },
                    required: ["sourceBout", "nextBout", "slot"],
                  },
                },
              },
            },
          },
        },
        55000 // 55s timeout per model attempt so fallback completes cleanly before proxy timeouts
      );

      const rawText = extractResponseText(response);
      if (!rawText || !rawText.trim()) {
        return res.status(502).json({ error: "The AI service returned an empty analysis result. Please retry." });
      }

      return res.json({ rawText });
    } catch (err: any) {
      console.error("Server Bracket Analysis Error:", err);
      const msg = err?.message || "";
      const lower = msg.toLowerCase();
      const is503 = msg.includes("503") || lower.includes("high demand") || msg.includes("UNAVAILABLE");
      const isTimeout = lower.includes("timeout");
      const is403 = msg.includes("403") || msg.includes("PERMISSION_DENIED") || msg.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT") || msg.includes("API_KEY_INVALID");
      const is429 = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || lower.includes("quota");
      const isModel404 = msg.includes("404") || msg.includes("NOT_FOUND");

      let userMsg = msg || "Failed to analyze bracket file.";
      let status = 500;
      if (is503) {
        status = 503;
        userMsg = "The AI service is currently experiencing high demand. Please wait a moment and try again.";
      } else if (isTimeout) {
        status = 504;
        userMsg = "Bracket analysis timed out while processing the document. If uploading a large or multi-page PDF, try splitting it into 1-2 pages at a time or turn off 'Deep Thinking Mode' for faster extraction.";
      } else if (is403) {
        status = 403;
        userMsg = "Gemini API Key Permission Denied. Please check your API key configuration in the Settings > Secrets panel.";
      } else if (is429) {
        status = 429;
        userMsg = "API quota exceeded. Please wait a minute and retry.";
      } else if (isModel404) {
        status = 502;
        userMsg = `Upstream AI model error: ${msg}`;
      }
      return res.status(status).json({ error: userMsg });
    }
  });

  // Refine Bracket Endpoint
  app.post("/api/gemini/refine-bracket", async (req, res) => {
    try {
      const { previewData, isPoomsaeMode } = req.body;

      if (!previewData) {
        return res.status(400).json({ error: "Missing previewData in request payload." });
      }

      const ai = getGeminiClient();
      const prompt = `
        You are an expert tournament bracket auditor. I have extracted match data and advancement mappings from a bracket.
        Please review the following JSON and fix any logical inconsistencies.
        
        COMMON ISSUES TO FIX:
        1. Bout numbers that don't match the ring (e.g. Bout 101 should be Ring 1).
        2. Mappings where the sourceBout doesn't exist in the matches list.
        3. Mappings where sourceBout and nextBout are the same.
        4. Inconsistent capitalization (everything should be UPPERCASE).
        5. Missing categories or club names if they can be inferred from context.
        6. Missing red_club: If red_name is present but red_club is empty, infer red_club from red_name (e.g. if name contains club in parentheses or dash) or from team context in the same category. Never leave red_club blank when red_name exists.
        
        ${isPoomsaeMode ? `
        POOMSAE MODE ACTIVE:
        - This event is Poomsae/Freestyle.
        - Ensure solo performers are correctly placed (Blue slot active, Red slot empty).
        - Explicitly include "POOMSAE" in categories.
        ` : ''}

        Current Data:
        ${JSON.stringify(previewData, null, 2)}
        
        Return ONLY the corrected JSON in the same format.

        CRITICAL FORMATTING RULES:
        - Start directly with { and return ONLY the JSON.
        - Do not include unescaped double quotes inside string values under any circumstances.
      `;

      const response = await generateWithRetry(
        ai,
        "gemini-4-hydrogen",
        {
          contents: prompt,
          config: {
            systemInstruction: "You are an automated tournament bracket auditor. Return strictly valid JSON conforming to the schema.",
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                matches: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      ring: { type: Type.NUMBER },
                      bout: { type: Type.STRING },
                      category: { type: Type.STRING },
                      blue_name: { type: Type.STRING },
                      blue_club: { type: Type.STRING },
                      red_name: { type: Type.STRING },
                      red_club: { type: Type.STRING },
                    }
                  }
                },
                mappings: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      sourceBout: { type: Type.STRING },
                      nextBout: { type: Type.STRING },
                      slot: { type: Type.STRING }
                    }
                  }
                }
              }
            }
          }
        },
        90000
      );

      const rawText = extractResponseText(response);
      if (!rawText || !rawText.trim()) {
        return res.status(502).json({ error: "The AI service returned an empty refinement result. Please retry." });
      }

      return res.json({ rawText });
    } catch (err: any) {
      console.error("Server Bracket Refinement Error:", err);
      const is503 = (err?.message || "").includes("503") || (err?.message || "").includes("high demand") || (err?.message || "").includes("UNAVAILABLE");
      const isTimeout = (err?.message || "").toLowerCase().includes("timeout");
      let userMsg = err?.message || "Failed to refine bracket data.";
      if (is503) {
        userMsg = "The AI service is currently experiencing high demand. Please wait a moment and try again.";
      } else if (isTimeout) {
        userMsg = "Bracket audit timed out. Please try refining with a smaller batch of bouts.";
      }
      return res.status(is503 ? 503 : (isTimeout ? 504 : 500)).json({ error: userMsg });
    }
  });

  // Tournament Assistant Chat Endpoint
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { context, messages, input } = req.body;

      if (!input && (!messages || messages.length === 0)) {
        return res.status(400).json({ error: "Missing message input in request." });
      }

      const ai = getGeminiClient();

      const formattedContents: any[] = [];
      if (context) {
        formattedContents.push({ role: "user", parts: [{ text: context }] });
      }

      if (Array.isArray(messages)) {
        messages.forEach((m: any) => {
          formattedContents.push({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content || "" }],
          });
        });
      }

      if (input) {
        formattedContents.push({ role: "user", parts: [{ text: input }] });
      }

      const response = await generateWithRetry(
        ai,
        "gemini-4-hydrogen",
        {
          contents: formattedContents,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        },
        45000
      );

      const text = extractResponseText(response);
      return res.json({ text });
    } catch (err: any) {
      console.error("Server Chat Error:", err);
      const is503 = (err?.message || "").includes("503") || (err?.message || "").includes("high demand") || (err?.message || "").includes("UNAVAILABLE");
      const userMsg = is503 
        ? "The AI service is currently experiencing high demand. Please wait a moment and try again."
        : (err.message || "Failed to generate assistant response.");
      return res.status(is503 ? 503 : 500).json({ error: userMsg });
    }
  });

  // Vite middleware in dev; static file serving in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MY-TKD Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
