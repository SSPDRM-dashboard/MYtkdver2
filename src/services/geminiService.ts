async function parseApiResponse(res: Response, fallbackError: string): Promise<any> {
  const contentType = res.headers.get("content-type") || "";
  if (res.status === 404) {
    throw new Error(
      `API endpoint not found (404): This web host is not running the MY-TKD backend server (/api/gemini). Please open the full-stack app URL or start the Node server to use AI features.`
    );
  }

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
    throw new Error(data.error || `${fallbackError} (HTTP ${res.status})`);
  }

  return data;
}

export async function analyzeBracketWithGemini(params: {
  base64Data: string;
  mimeType: string;
  isPoomsaeMode: boolean;
  isThinkingMode: boolean;
  adminNote?: string;
}): Promise<string> {
  const { base64Data, mimeType, isPoomsaeMode, isThinkingMode, adminNote } = params;

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
    }),
  });

  const data = await parseApiResponse(res, "Server returned an error when analyzing bracket");

  if (!data.rawText || !data.rawText.trim()) {
    throw new Error(data.error || "The AI service returned an empty analysis. Please retry or verify the bracket document.");
  }

  return data.rawText;
}

export async function refineBracketWithGemini(params: {
  previewData: any;
  isPoomsaeMode: boolean;
}): Promise<string> {
  const { previewData, isPoomsaeMode } = params;

  const res = await fetch("/api/gemini/refine-bracket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      previewData,
      isPoomsaeMode,
    }),
  });

  const data = await parseApiResponse(res, "Server returned an error when refining bracket");

  if (!data.rawText || !data.rawText.trim()) {
    throw new Error(data.error || "The AI service returned an empty refinement result.");
  }

  return data.rawText;
}

export async function chatWithGemini(params: {
  context?: string;
  messages: any[];
  input?: string;
}): Promise<string> {
  const { context, messages, input } = params;

  const res = await fetch("/api/gemini/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context,
      messages,
      input,
    }),
  });

  const data = await parseApiResponse(res, "Server returned an error when generating chat response");

  if (typeof data.text !== "string") {
    throw new Error("No text content returned from server chat endpoint.");
  }

  return data.text;
}
