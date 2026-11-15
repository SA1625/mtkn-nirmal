import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const difficulties = [
  "Foundation", "Beginner", "Intermediate",
  "Moderate", "Advanced", "Expert",
];

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateQuestion(q: any, index: number) {
  if (!q || typeof q !== "object") {
    throw new Error(`Invalid question at position ${index + 1}.`);
  }

  if (!cleanText(q.question_text) || !cleanText(q.correct_answer)) {
    throw new Error(`Question ${index + 1} is missing its question or answer.`);
  }

  if (!cleanText(q.topic) || !difficulties.includes(q.difficulty)) {
    throw new Error(`Question ${index + 1} has invalid topic or difficulty.`);
  }

  if (q.question_type === "true_false" && q.section === "A") {
    if (!["True", "False"].includes(q.correct_answer)) {
      throw new Error(`Question ${index + 1} has an invalid True/False answer.`);
    }
    q.options = null;
  } else if (q.question_type === "mcq" && q.section === "B") {
    if (
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      q.options.some((v: unknown) => typeof v !== "string" || !v.trim()) ||
      new Set(q.options.map((v: string) => v.trim().toLowerCase())).size !== 4 ||
      !q.options.some((v: string) => v.trim() === q.correct_answer.trim())
    ) {
      throw new Error(`Question ${index + 1} has invalid MCQ options or answer.`);
    }
  } else {
    throw new Error(`Question ${index + 1} has an invalid section or type.`);
  }

  return {
    section: q.section,
    question_type: q.question_type,
    question_text: cleanText(q.question_text),
    options: q.options,
    correct_answer: cleanText(q.correct_answer),
    topic: cleanText(q.topic),
    difficulty: q.difficulty,
    explanation: cleanText(q.explanation) || null,
    source_page: Number.isInteger(q.source_page) ? q.source_page : null,
    source_question: cleanText(q.source_question) || null,
  };
}

async function generateBatch(
  apiKey: string,
  source: string,
  batchNumber: number,
) {
  const prompt = `
You are an educational question generator. Use ONLY facts supported by the source.
The source may contain Roman English, Urdu, or both. Preserve the original script.

Generate exactly 10 questions from this source:
- Exactly 4 Section A true_false questions.
- Exactly 6 Section B mcq questions.
- Each MCQ must have exactly four distinct string options.
- Exactly one MCQ option must be correct.
- True/False correct_answer must be exactly "True" or "False".
- MCQ correct_answer must exactly match one option.
- Use only these difficulties: Foundation, Beginner, Intermediate, Moderate, Advanced, Expert.
- Include source_question and source_page when identifiable.
- Do not invent religious rulings, names, dates, quotations, or facts.
- Use plausible distractors, but never present unsupported claims as facts.
- Keep Urdu in Urdu script and Roman English in Roman script.

Return JSON only:
{
  "questions": [
    {
      "section": "A",
      "question_type": "true_false",
      "question_text": "Statement",
      "options": null,
      "correct_answer": "True",
      "topic": "Topic",
      "difficulty": "Beginner",
      "explanation": "Explanation supported by source",
      "source_page": 1,
      "source_question": "Original source text"
    }
  ]
}
This is generation batch ${batchNumber} of 10.
`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      max_completion_tokens: 4500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: source },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI batch ${batchNumber} failed: ${await response.text()}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error(`AI batch ${batchNumber} returned an empty response.`);

  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed.questions) || parsed.questions.length !== 10) {
    throw new Error(`AI batch ${batchNumber} did not return exactly 10 questions.`);
  }

  const normalized = parsed.questions.map(validateQuestion);
  const tf = normalized.filter((q: any) => q.section === "A" && q.question_type === "true_false");
  const mcq = normalized.filter((q: any) => q.section === "B" && q.question_type === "mcq");

  if (tf.length !== 4 || mcq.length !== 6) {
    throw new Error(`AI batch ${batchNumber} did not meet the 4/6 split.`);
  }

  return normalized;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let adminClient: ReturnType<typeof createClient> | null = null;
  let batchId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey || !openaiKey) {
      throw new Error("Required Supabase or OpenAI environment secret is missing.");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Login required." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Invalid login session." }, 401);

    adminClient = createClient(supabaseUrl, serviceKey);

    const { data: profile } = await adminClient
      .from("profiles").select("role").eq("id", user.id).single();

    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return jsonResponse({ error: "Admin access required." }, 403);
    }

    const body = await req.json();
    batchId = body.batch_id;

    if (!batchId || typeof batchId !== "string") {
      return jsonResponse({ error: "A valid batch_id is required." }, 400);
    }

    const { data: batch, error: batchError } = await adminClient
      .from("question_import_batches")
      .select("id, ocr_text, status")
      .eq("id", batchId)
      .single();

    if (batchError || !batch) return jsonResponse({ error: "Import batch not found." }, 404);
    if (batch.status !== "needs_review") {
      return jsonResponse({ error: "Complete OCR before AI generation." }, 400);
    }

    const ocr = cleanText(batch.ocr_text);
    if (ocr.length < 100) return jsonResponse({ error: "OCR text is missing or too short." }, 400);
    if (ocr.length > 120000) return jsonResponse({ error: "OCR text is too large. Split the PDF into smaller imports." }, 413);

    const { count, error: countError } = await adminClient
      .from("question_import_drafts")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId);

    if (countError) throw countError;
    if ((count || 0) > 0) {
      return jsonResponse({ error: "Drafts already exist. Review or clear them before regenerating." }, 409);
    }

    await adminClient.from("question_import_batches")
      .update({ status: "processing", notes: "Generating questions in 10 validated batches." })
      .eq("id", batchId);

    // Split OCR into 10 overlapping text segments to keep each AI request smaller.
    const chunkSize = Math.ceil(ocr.length / 10);
    const overlap = Math.min(800, Math.floor(chunkSize / 10));
    const chunks = Array.from({ length: 10 }, (_, i) => {
      const start = Math.max(0, i * chunkSize - (i > 0 ? overlap : 0));
      const end = Math.min(ocr.length, (i + 1) * chunkSize + overlap);
      return ocr.slice(start, end);
    });

    const allQuestions: any[] = [];

    // Two requests at a time to reduce timeout and rate-limit risk.
    for (let i = 0; i < 10; i += 2) {
      const pair = await Promise.all([
        generateBatch(openaiKey, chunks[i], i + 1),
        generateBatch(openaiKey, chunks[i + 1], i + 2),
      ]);
      allQuestions.push(...pair[0], ...pair[1]);
    }

    if (allQuestions.length !== 100) throw new Error("Generation did not produce 100 questions.");

    const tf = allQuestions.filter(q => q.section === "A" && q.question_type === "true_false");
    const mcq = allQuestions.filter(q => q.section === "B" && q.question_type === "mcq");
    if (tf.length !== 40 || mcq.length !== 60) {
      throw new Error("Final question distribution is not 40 True/False and 60 MCQ.");
    }

    const seen = new Set<string>();
    for (const q of allQuestions) {
      const key = q.question_text.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(key)) throw new Error("Duplicate question detected across generated batches. Please retry.");
      seen.add(key);
    }

    const rows = allQuestions.map(q => ({
      batch_id: batchId,
      ...q,
      review_status: "pending",
    }));

    const { error: insertError } = await adminClient
      .from("question_import_drafts").insert(rows);
    if (insertError) throw insertError;

    await adminClient.from("question_import_batches")
      .update({
        status: "needs_review",
        notes: "Generated 40 True/False and 60 MCQ drafts in 10 batches. Admin approval required.",
      })
      .eq("id", batchId);

    return jsonResponse({
      success: true,
      message: "100 draft questions generated and saved for admin review.",
      total: 100,
      true_false_count: 40,
      mcq_count: 60,
      batches_completed: 10,
    });
  } catch (error) {
    console.error("Question generation error:", error);

    if (adminClient && batchId) {
      await adminClient.from("question_import_batches")
        .update({ status: "needs_review", notes: `AI generation failed: ${String(error).slice(0, 500)}` })
        .eq("id", batchId);
    }

    return jsonResponse({
      error: error instanceof Error ? error.message : "Question generation failed.",
    }, 500);
  }
});