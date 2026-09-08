import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const STORAGE_KEY = "tkd_gemini_api_key";

export function getCustomGeminiApiKey(): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  }
  return (
    (typeof import.meta !== "undefined" && import.meta.env
      ? (import.meta.env.VITE_CUSTOM_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || "")
      : "") ||
    (typeof process !== "undefined" && process.env
      ? (process.env.CUSTOM_API_KEY || process.env.GEMINI_API_KEY || "")
      : "")
  );
}

export function setCustomGeminiApiKey(key: string) {
  if (typeof window !== "undefined") {
    if (!key || !key.trim()) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, key.trim());
    }
  }
}

export async function analyzeBracketWithGemini(params: {
  base64Data: string;
  mimeType: string;
  isPoomsaeMode: boolean;
  isThinkingMode: boolean;
  adminNote?: string;
  customApiKey?: string;
}): Promise<string> {
  const { base64Data, mimeType, isPoomsaeMode, isThinkingMode, adminNote, customApiKey } = params;

  // Auto-detect PDF magic bytes (%PDF = JVBERi)
  let effectiveMimeType = mimeType || "image/png";
  if (base64Data.startsWith("JVBERi") || (mimeType && mimeType.includes("pdf"))) {
    effectiveMimeType = "application/pdf";
  }

  // 1. Try server-side endpoint first (for Node / Cloud Run containers)
  try {
    const res = await fetch("/api/gemini/analyze-bracket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base64Data,
        mimeType: effectiveMimeType,
        isPoomsaeMode,
        isThinkingMode,
        adminNote,
        customApiKey: customApiKey || getCustomGeminiApiKey(),
      }),
    });

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      if (res.ok && data.rawText) {
        return data.rawText;
      }
      if (res.status === 503) {
        throw new Error(data.error || "The AI service is currently experiencing high demand. Please try again in a moment.");
      }
      if (!res.ok && data.error && !data.error.includes("404") && !data.error.includes("Not Found")) {
        throw new Error(data.error);
      }
    }
    // If not JSON or 404/405, this is a static web host (Vercel, Netlify, etc.) -> fall back to client SDK
  } catch (err: any) {
    if (err.message && (err.message.includes("high demand") || err.message.includes("503"))) {
      throw err;
    }
    console.warn("Server endpoint unavailable or returned HTML, switching to client-side Gemini fallback:", err.message);
  }

  // 2. Client-side fallback for static web versions
  const apiKey = customApiKey || getCustomGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Web Version API Key Required: When using the web-hosted version without a backend proxy, please click the API Key button to enter your Google Gemini API Key."
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
    You are an expert tournament bracket analyzer. Extract all bracket structures and match data from this document/image.
    
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

  const model = isThinkingMode ? "gemini-3.1-pro-preview" : "gemini-3.8-flash";

  const response = await ai.models.generateContent({
    model,
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

  return response.text || "";
}

export async function refineBracketWithGemini(params: {
  previewData: any;
  isPoomsaeMode: boolean;
  customApiKey?: string;
}): Promise<string> {
  const { previewData, isPoomsaeMode, customApiKey } = params;

  try {
    const res = await fetch("/api/gemini/refine-bracket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        previewData,
        isPoomsaeMode,
        customApiKey: customApiKey || getCustomGeminiApiKey(),
      }),
    });

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      if (res.ok && data.rawText) {
        return data.rawText;
      }
      if (res.status === 503) {
        throw new Error(data.error || "The AI service is currently experiencing high demand. Please try again in a moment.");
      }
    }
  } catch (err: any) {
    if (err.message && (err.message.includes("high demand") || err.message.includes("503"))) {
      throw err;
    }
    console.warn("Server refine endpoint unavailable, switching to client-side fallback:", err.message);
  }

  const apiKey = customApiKey || getCustomGeminiApiKey();
  if (!apiKey) {
    throw new Error("Web Version API Key Required: Please configure your Gemini API Key in the settings.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
    You are an expert tournament bracket auditor. I have extracted match data and advancement mappings from a bracket.
    Please review the following JSON and fix any logical inconsistencies.
    
    COMMON ISSUES TO FIX:
    1. Bout numbers that don't match the ring (e.g. Bout 101 should be Ring 1).
    2. Mappings where the sourceBout doesn't exist in the matches list.
    3. Mappings where sourceBout and nextBout are the same.
    4. Inconsistent capitalization (everything should be UPPERCASE).
    5. Missing categories or club names if they can be inferred from context.
    
    DATA TO REVIEW:
    ${JSON.stringify(previewData, null, 2)}
    
    Return ONLY the corrected JSON in the same format.

    CRITICAL FORMATTING RULES:
    - Start directly with { and return ONLY the JSON.
    - Do not include unescaped double quotes inside string values under any circumstances.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: prompt,
    config: {
      systemInstruction: "You are an automated tournament bracket auditor. Return strictly valid JSON conforming to the schema.",
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

  return response.text || "";
}

export async function chatWithGemini(params: {
  context?: string;
  messages: any[];
  input?: string;
  customApiKey?: string;
}): Promise<string> {
  const { context, messages, input, customApiKey } = params;

  try {
    const res = await fetch("/api/gemini/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context,
        messages,
        input,
        customApiKey: customApiKey || getCustomGeminiApiKey(),
      }),
    });

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      if (res.ok && data.text) {
        return data.text;
      }
      if (res.status === 503) {
        throw new Error(data.error || "The AI service is currently experiencing high demand. Please try again in a moment.");
      }
    }
  } catch (err: any) {
    if (err.message && (err.message.includes("high demand") || err.message.includes("503"))) {
      throw err;
    }
    console.warn("Server chat endpoint unavailable, switching to client-side fallback:", err.message);
  }

  const apiKey = customApiKey || getCustomGeminiApiKey();
  if (!apiKey) {
    throw new Error("Web Version API Key Required: Please configure your Gemini API Key in the settings.");
  }

  const ai = new GoogleGenAI({ apiKey });
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

  return response.text || "";
}
