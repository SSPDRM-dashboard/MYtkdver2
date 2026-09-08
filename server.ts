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

      const ai = getGeminiClient(customApiKey);
      const prompt = `
        You are an expert tournament bracket analyzer. Extract the bracket structure from this image.
        
        CRITICAL RULES:
        - Vertical Hierarchy: Flow is LEFT to RIGHT.
        - Match IDs: Rectangular boxes with alphanumeric codes (e.g., A01, A05, 2001) are Bout IDs.
        - Color Assignment: Upper line = Blue Side (Chung), Lower line = Red Side (Hong).
        - Advancement: Winner of a previous match fills the slot (Upper=Blue, Lower=Red) in the next Bout ID box.
        - Player Names: Often start with "090 - ". Extract only the name.
        - Club Names: Located directly BELOW the player's name.
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

        Return JSON:
        {
          "matches": [{"bout": "A01", "ring": 1, "category": "...", "blue_name": "...", "blue_club": "...", "red_name": "...", "red_club": "..."}],
          "mappings": [{"sourceBout": "A01", "nextBout": "A05", "slot": "Chung"}]
        }

        CRITICAL FORMATTING RULES:
        - Do not include unescaped double quotes inside string values under any circumstances (e.g., nicknames, abbreviations, or club names). If a name has quotes like "John "The Dragon" Smith", return "John \\"The Dragon\\" Smith" or "John 'The Dragon' Smith".
        - The output must be standard compliant JSON, with all property names and string values strictly enclosed in double quotes.
      `;

      const response = await ai.models.generateContent({
        model: isThinkingMode ? "gemini-3.1-pro-preview" : "gemini-3.8-flash",
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType || "image/png",
                  data: base64Data,
                },
              },
            ],
          },
        ],
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
          thinkingConfig: isThinkingMode ? { thinkingLevel: ThinkingLevel.HIGH } : undefined,
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
                  required: ["bout", "category", "blue_name", "red_name"],
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
      });

      return res.json({ rawText: response.text });
    } catch (err: any) {
      console.error("Server Bracket Analysis Error:", err);
      return res.status(500).json({ error: err.message || "Failed to analyze bracket file." });
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
        - Do not include unescaped double quotes inside string values under any circumstances (e.g., nicknames, abbreviations, or club names). If a name has quotes like "John "The Dragon" Smith", return "John \\"The Dragon\\" Smith" or "John 'The Dragon' Smith".
        - The output must be standard compliant JSON, with all property names and string values strictly enclosed in double quotes.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
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
      });

      return res.json({ rawText: response.text });
    } catch (err: any) {
      console.error("Server Bracket Refinement Error:", err);
      return res.status(500).json({ error: err.message || "Failed to refine bracket data." });
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

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: formattedContents,
        config: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
        },
      });

      return res.json({ text: response.text || "" });
    } catch (err: any) {
      console.error("Server Chat Error:", err);
      return res.status(500).json({ error: err.message || "Failed to generate assistant response." });
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
