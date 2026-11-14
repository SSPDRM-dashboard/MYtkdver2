import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

function getGeminiClient(customApiKey?: string) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY || process.env.CUSTOM_API_KEY;
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
        // If responseSchema or thinkingConfig caused a 400/404 on this model, attempt fallback without those constraints
        if (
          (innerMsg.includes("schema") || innerMsg.includes("thinking") || innerMsg.includes("400") || innerMsg.includes("404")) &&
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

  // Analyze Bracket Endpoint
  app.post("/api/gemini/analyze-bracket", async (req, res) => {
    try {
      const { base64Data, mimeType, isPoomsaeMode, isThinkingMode, adminNote, customApiKey } = req.body;

      if (!base64Data) {
        return res.status(400).json({ error: "Missing base64Data in request payload." });
      }

      // Auto-detect PDF via magic bytes (%PDF = JVBERi in base64)
      let effectiveMimeType = mimeType || "image/png";
      if (base64Data.startsWith("JVBERi") || (mimeType && mimeType.includes("pdf"))) {
        effectiveMimeType = "application/pdf";
      }

      const ai = getGeminiClient(customApiKey);
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
        75000 // 75s timeout per model attempt so fallback can run cleanly within request limits
      );

      const rawText = extractResponseText(response);
      if (!rawText || !rawText.trim()) {
        return res.status(502).json({ error: "The AI service returned an empty analysis result. Please retry." });
      }

      return res.json({ rawText });
    } catch (err: any) {
      console.error("Server Bracket Analysis Error:", err);
      const msg = err?.message || "";
      const is503 = msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE");
      const isTimeout = msg.toLowerCase().includes("timeout");
      const is403 = msg.includes("403") || msg.includes("PERMISSION_DENIED") || msg.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT");

      let userMsg = msg || "Failed to analyze bracket file.";
      if (is503) {
        userMsg = "The AI service is currently experiencing high demand. Please wait a moment and try again.";
      } else if (isTimeout) {
        userMsg = "Bracket analysis timed out while processing the document. If uploading a large or multi-page PDF, try splitting it into 1-2 pages at a time or turn off 'Deep Thinking Mode' for faster extraction.";
      } else if (is403) {
        userMsg = "Gemini API Key Permission Denied (403). Please check your API key configuration in the Settings > Secrets panel.";
      }
      return res.status(is503 ? 503 : (isTimeout ? 504 : (is403 ? 403 : 500))).json({ error: userMsg });
    }
  });

  // Refine Bracket Endpoint
  app.post("/api/gemini/refine-bracket", async (req, res) => {
    try {
      const { previewData, isPoomsaeMode, customApiKey } = req.body;

      if (!previewData) {
        return res.status(400).json({ error: "Missing previewData in request payload." });
      }

      const ai = getGeminiClient(customApiKey);
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
      const { context, messages, input, customApiKey } = req.body;

      if (!input && (!messages || messages.length === 0)) {
        return res.status(400).json({ error: "Missing message input in request." });
      }

      const ai = getGeminiClient(customApiKey);

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
