
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "gemini-3.1-flash-lite";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const BATCH_SIZE = 20;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function parseJSON(raw: string) {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start < 0 || end <= start) {
      throw new Error("AI returned invalid JSON.");
    }

    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function buildPrompt(input: any[]) {
  return `
You are a professional Urdu educational translator.

Translate the supplied quiz content into complete, natural Urdu script.

STRICT RULES:
1. Translate English and Roman Urdu into Urdu script.
2. Use clear, standard Urdu suitable for students.
3. Preserve the exact meaning of every question.
4. Translate every MCQ option.
5. Translate explanations and topics.
6. Do not answer or solve any question.
7. Do not change question difficulty or question type.
8. Preserve option keys and option order exactly.
9. Copy the exact options structure from the input.
10. If options are an array, return an array in exactly the same order and length.
11. If options are an object, return an object using exactly the same keys.
12. Translate only option text values; never change option labels or keys.
13. If an option is itself an object or array, preserve its nested structure.
14. Do not translate names as unrelated words.
15. Never invent additional information.
16. Return one translation for every input index.
17. Return valid JSON only.
18. Do not omit any question.
19. Never return options as a numbered list or a differently shaped object.

Required output:
{
  "items": [
    {
      "index": 0,
      "question_text_ur": "اردو سوال",
      "options_ur": null,
      "topic_ur": "موضوع",
      "explanation_ur": null
    }
  ]
}

INPUT:
${JSON.stringify(input)}
`;
}

/**
 * Converts AI-returned options into the exact shape used by the source row.
 * Supports array/object shape swaps while preserving the original key order.
 * It never changes the source options or answer fields.
 */
function alignOptionShape(original: any, translated: any, index: number): any {
  if (original === null || original === undefined) {
    return translated ?? null;
  }

  // Some models wrap JSON values as strings. Parse only when it is valid JSON.
  if (typeof translated === "string") {
    const trimmed = translated.trim();
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        translated = JSON.parse(trimmed);
      } catch {
        // Keep it as a normal translated string.
      }
    }
  }

  if (Array.isArray(original)) {
    let values: any[];

    if (Array.isArray(translated)) {
      values = translated;
    } else if (
      translated &&
      typeof translated === "object" &&
      !Array.isArray(translated)
    ) {
      // Convert {A: "...", B: "..."} or {"0": "..."} into array order.
      const keys = Object.keys(translated);
      const letterKeys = ["A", "B", "C", "D", "E", "F"];
      const orderedKeys = letterKeys.every((key) => keys.includes(key))
        ? letterKeys.filter((key) => keys.includes(key))
        : keys.sort((a, b) => {
          const na = Number(a);
          const nb = Number(b);
          return Number.isNaN(na) || Number.isNaN(nb)
            ? 0
            : na - nb;
        });
      values = orderedKeys.map((key) => translated[key]);
    } else {
      throw new Error(`AI returned missing or invalid options at question ${index + 1}.`);
    }

    if (values.length !== original.length) {
      throw new Error(
        `Option count mismatch at question ${index + 1}: expected ${original.length}, received ${values.length}.`,
      );
    }

    return original.map((value, optionIndex) =>
      alignOptionShape(value, values[optionIndex], index)
    );
  }

  if (
    original &&
    typeof original === "object" &&
    !Array.isArray(original)
  ) {
    const originalKeys = Object.keys(original);
    let translatedObject: Record<string, any>;

    if (
      translated &&
      typeof translated === "object" &&
      !Array.isArray(translated)
    ) {
      const translatedKeys = Object.keys(translated);

      if (originalKeys.every((key) => translatedKeys.includes(key))) {
        translatedObject = translated;
      } else if (translatedKeys.length === originalKeys.length) {
        // Re-map same-count keys back to the original keys, in original order.
        const translatedValues = translatedKeys.map((key) => translated[key]);
        translatedObject = Object.fromEntries(
          originalKeys.map((key, i) => [key, translatedValues[i]]),
        );
      } else {
        throw new Error(
          `Option count mismatch at question ${index + 1}: original keys cannot be matched.`,
        );
      }
    } else if (Array.isArray(translated)) {
      if (translated.length !== originalKeys.length) {
        throw new Error(
          `Option count mismatch at question ${index + 1}: expected ${originalKeys.length}, received ${translated.length}.`,
        );
      }
      translatedObject = Object.fromEntries(
        originalKeys.map((key, i) => [key, translated[i]]),
      );
    } else {
      throw new Error(`AI returned missing or invalid options at question ${index + 1}.`);
    }

    return Object.fromEntries(
      originalKeys.map((key) => [
        key,
        alignOptionShape(original[key], translatedObject[key], index),
      ]),
    );
  }

  if (translated === null || translated === undefined) {
    throw new Error(`AI omitted an option value at question ${index + 1}.`);
  }

  return translated;
}

function validateResults(raw: string, questions: any[]) {
  const parsed = parseJSON(raw);

  if (!Array.isArray(parsed.items)) {
    throw new Error("AI response is missing its items array.");
  }

  const translated = new Map<number, any>();

  for (const item of parsed.items) {
    const index = Number(item.index);

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= questions.length ||
      translated.has(index)
    ) {
      throw new Error("AI returned an invalid or duplicate question index.");
    }

    if (
      typeof item.question_text_ur !== "string" ||
      !item.question_text_ur.trim()
    ) {
      throw new Error(`Missing Urdu question at index ${index}.`);
    }

    const originalOptions = questions[index].options;
    const alignedOptions = alignOptionShape(
      originalOptions,
      item.options_ur,
      index,
    );

    translated.set(index, {
      ...item,
      options_ur: alignedOptions,
      topic_ur: typeof item.topic_ur === "string" ? item.topic_ur : null,
      explanation_ur:
        typeof item.explanation_ur === "string" ? item.explanation_ur : null,
    });
  }

  if (translated.size !== questions.length) {
    throw new Error(
      `AI translated ${translated.size} of ${questions.length} questions.`,
    );
  }

  return translated;
}

async function callGemini(apiKey: string, prompt: string) {
  const response = await fetch(
    `${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      }),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Gemini HTTP ${response.status}: ${details.slice(0, 500)}`,
    );
  }

  const data = await response.json();

  return (data.candidates?.[0]?.content?.parts || [])
    .map((part: any) => part.text || "")
    .join("\n");
}

async function callOpenAI(apiKey: string, prompt: string) {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: "You are a precise Urdu educational translator. Return valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `OpenAI HTTP ${response.status}: ${details.slice(0, 500)}`,
    );
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGroq(apiKey: string, prompt: string) {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: "You are a precise Urdu educational translator. Return valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Groq HTTP ${response.status}: ${details.slice(0, 500)}`,
    );
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function translateWithFallback(
  prompt: string,
  questions: any[],
  providers: any[],
) {
  const failures: string[] = [];

  for (const provider of providers) {
    try {
      console.log(`Trying Urdu translation provider: ${provider.name}`);

      const raw = await provider.run();
      if (!raw?.trim()) {
        throw new Error("Provider returned an empty response.");
      }

      const translated = validateResults(raw, questions);

      console.log(`Urdu translation succeeded with: ${provider.name}`);

      return {
        translated,
        provider: provider.name,
      };
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : String(error);

      console.error(`${provider.name} failed:`, message);
      failures.push(`${provider.name}: ${message}`);
    }
  }

  throw new Error(
    `All AI providers failed. ${failures.join(" | ")}`,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      throw new Error("Required Supabase secrets are missing.");
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return json({ error: "Login required." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ error: "Invalid login session." }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !["admin", "super_admin"].includes(profile?.role)) {
      return json({ error: "Administrator access required." }, 403);
    }

    const body = await req.json().catch(() => ({}));

    const requestedLimit = Number(body.limit) || BATCH_SIZE;
    const limit = Math.min(
      BATCH_SIZE,
      Math.max(1, Math.floor(requestedLimit)),
    );

    const { data: questions, error: fetchError } = await adminClient
      .from("quiz_questions")
      .select(
        "id, question_type, question_text, options, topic, explanation",
      )
      .eq("review_status", "approved")
      .is("question_text_ur", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchError) throw fetchError;

    if (!questions?.length) {
      return json({
        success: true,
        complete: true,
        translated: 0,
        batch_size: limit,
        message: "All approved questions already have Urdu translations.",
      });
    }

    const input = questions.map((q, index) => ({
      index,
      question_type: q.question_type,
      question_text: q.question_text,
      options: q.options,
      topic: q.topic,
      explanation: q.explanation,
    }));

    const prompt = buildPrompt(input);

    // Use only configured secrets. Never expose API keys to the client.
    const providers: any[] = [];

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const groqBackupKey = Deno.env.get("GROQ_API_KEY_1");

    if (geminiKey) {
      providers.push({
        name: "Gemini",
        run: () => callGemini(geminiKey, prompt),
      });
    }

    if (openaiKey) {
      providers.push({
        name: "OpenAI",
        run: () => callOpenAI(openaiKey, prompt),
      });
    }

    if (groqKey) {
      providers.push({
        name: "Groq",
        run: () => callGroq(groqKey, prompt),
      });
    }

    if (groqBackupKey) {
      providers.push({
        name: "Groq Backup",
        run: () => callGroq(groqBackupKey, prompt),
      });
    }

    if (!providers.length) {
      throw new Error("No AI provider API keys are configured.");
    }

    const result = await translateWithFallback(
      prompt,
      questions,
      providers,
    );

    let saved = 0;

    for (let index = 0; index < questions.length; index++) {
      const original = questions[index];
      const item = result.translated.get(index);

      const { data: updated, error: updateError } = await adminClient
        .from("quiz_questions")
        .update({
          question_text_ur: item.question_text_ur.trim(),
          options_ur: item.options_ur ?? null,
          topic_ur: item.topic_ur ?? null,
          explanation_ur: item.explanation_ur ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", original.id)
        .is("question_text_ur", null)
        .select("id");

      if (updateError) throw updateError;

      saved += updated?.length || 0;
    }

    return json({
      success: true,
      complete: false,
      translated: saved,
      batch_size: limit,
      provider: result.provider,
      message:
        `${saved} questions translated and saved successfully using ${result.provider}.`,
    });
  } catch (error) {
    console.error("Urdu translation error:", error);

    return json(
      {
        success: false,
        error: error instanceof Error
          ? error.message
          : String(error),
      },
      500,
    );
  }
});
