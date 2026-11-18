
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "gemini-3.1-flash-lite";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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
      throw new Error("Gemini returned invalid JSON.");
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
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
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey || !geminiKey) {
      throw new Error("Required Supabase or Gemini secrets are missing.");
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

    // Only administrators can run translations.
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !["admin", "super_admin"].includes(profile?.role)) {
      return json({ error: "Administrator access required." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(
      5,
      Math.max(1, Number(body.limit) || 5),
    );

    // Fetch approved questions that do not have Urdu translations yet.
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

    const prompt = `
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
9. If options are an array, return an array in the same order.
10. If options are an object, return an object with exactly the same keys.
11. Do not translate names as unrelated words.
12. Never invent additional information.
13. Return one translation for every input index.
14. Return valid JSON only.

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

    const aiResponse = await fetch(
      `${GEMINI_URL}?key=${encodeURIComponent(geminiKey)}`,
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
            maxOutputTokens: 6000,
          },
        }),
      },
    );

    if (!aiResponse.ok) {
      const details = await aiResponse.text();
      throw new Error(
        `Gemini error ${aiResponse.status}: ${details.slice(0, 500)}`,
      );
    }

    const aiData = await aiResponse.json();
    const raw = (
      aiData.candidates?.[0]?.content?.parts || []
    )
      .map((part: any) => part.text || "")
      .join("\n");

    if (!raw.trim()) {
      throw new Error("Gemini returned an empty response.");
    }

    const parsed = parseJSON(raw);

    if (!Array.isArray(parsed.items)) {
      throw new Error("Gemini response is missing its items array.");
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
        throw new Error("Gemini returned an invalid or duplicate index.");
      }

      if (
        typeof item.question_text_ur !== "string" ||
        !item.question_text_ur.trim()
      ) {
        throw new Error(`Missing Urdu question at index ${index}.`);
      }

      const originalOptions = questions[index].options;
      const urduOptions = item.options_ur;

      if (originalOptions !== null && originalOptions !== undefined) {
        if (
          Array.isArray(originalOptions) &&
          (!Array.isArray(urduOptions) ||
            urduOptions.length !== originalOptions.length)
        ) {
          throw new Error(`Option structure mismatch at index ${index}.`);
        }

        if (
          !Array.isArray(originalOptions) &&
          typeof originalOptions === "object" &&
          (
            !urduOptions ||
            Array.isArray(urduOptions) ||
            JSON.stringify(Object.keys(originalOptions).sort()) !==
              JSON.stringify(Object.keys(urduOptions).sort())
          )
        ) {
          throw new Error(`Option keys mismatch at index ${index}.`);
        }
      }

      translated.set(index, item);
    }

    if (translated.size !== questions.length) {
      throw new Error(
        `Gemini translated ${translated.size} of ${questions.length} questions.`,
      );
    }

    let saved = 0;

    for (let index = 0; index < questions.length; index++) {
      const original = questions[index];
      const item = translated.get(index);

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
      message: `${saved} questions translated and saved successfully.`,
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
