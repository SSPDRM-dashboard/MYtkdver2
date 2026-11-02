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
  let data: any = {};
  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => ({}));
  } else {
    const textErr = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`Server error (${res.status}): ${textErr.slice(0, 150) || res.statusText}`);
    }
  }

  if (!res.ok) {
    throw new Error(data.error || `Server returned error (${res.status}) when analyzing bracket.`);
  }

  if (!data.rawText || !data.rawText.trim()) {
    throw new Error(data.error || "The AI service returned an empty analysis. Please retry or verify the bracket document.");
  }

  return data.rawText;
}

export async function refineBracketWithGemini(params: {
  previewData: any;
  isPoomsaeMode: boolean;
  customApiKey?: string;
}): Promise<string> {
  const { previewData, isPoomsaeMode, customApiKey } = params;

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
  let data: any = {};
  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => ({}));
  } else {
    const textErr = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`Server error (${res.status}): ${textErr.slice(0, 150) || res.statusText}`);
    }
  }

  if (!res.ok) {
    throw new Error(data.error || `Server returned error (${res.status}) when refining bracket.`);
  }

  if (!data.rawText || !data.rawText.trim()) {
    throw new Error(data.error || "The AI service returned an empty refinement result.");
  }

  return data.rawText;
}

export async function chatWithGemini(params: {
  context?: string;
  messages: any[];
  input?: string;
  customApiKey?: string;
}): Promise<string> {
  const { context, messages, input, customApiKey } = params;

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
  let data: any = {};
  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => ({}));
  } else {
    const textErr = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`Server error (${res.status}): ${textErr.slice(0, 150) || res.statusText}`);
    }
  }

  if (!res.ok) {
    throw new Error(data.error || `Server returned error (${res.status}) when generating chat response.`);
  }

  if (typeof data.text !== "string") {
    throw new Error("No text content returned from server chat endpoint.");
  }

  return data.text;
}
