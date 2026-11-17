
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "gemini-3.1-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const LEVELS = ["Foundation", "Beginner", "Intermediate", "Moderate", "Advanced", "Expert"];
const BATCH_ID = "c6b6585b-3590-4f06-bcf2-2eb57f029a48";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const clean = (v: unknown) => typeof v === "string" ? v.trim() : "";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function parseJSON(raw: string): any {
  const s = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error("Gemini returned invalid JSON.");
  }
}

async function assess(apiKey: string, source: any, mcq: any, tf: any) {
  const prompt = `
Assess the difficulty of the following two quiz questions independently.
Use ONLY the supplied original answer as factual evidence.
Do not change the questions, options or correct answers.
Do not add external religious claims.
Score each question from 1 to 100 based on cognitive difficulty.
1 = very basic recall; 100 = highly detailed and complex understanding.
Consider actual reasoning required, not merely question length or topic sensitivity.

Return JSON only:
{
 "mcq_score": 1,
 "mcq_reason": "short reason",
 "true_false_score": 1,
 "true_false_reason": "short reason"
}

Original question: ${clean(source.question_text)}
Original answer: ${clean(source.answer_text)}
Topic: ${clean(source.topic)}

MCQ: ${clean(mcq.question_text)}
MCQ options: ${JSON.stringify(mcq.options || [])}
MCQ correct answer: ${clean(mcq.correct_answer)}

True/False: ${clean(tf.question_text)}
True/False correct answer: ${clean(tf.correct_answer)}
`;

  const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 700,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }

  const payload = await response.json();
  const raw = (payload.candidates?.[0]?.content?.parts || [])
    .map((p: any) => p.text || "").join("\n");

  if (!raw.trim()) throw new Error("Gemini returned an empty response.");

  const result = parseJSON(raw);
  const mcqScore = Number(result.mcq_score);
  const tfScore = Number(result.true_false_score);

  if (!Number.isInteger(mcqScore) || mcqScore < 1 || mcqScore > 100) {
    throw new Error("Invalid MCQ score.");
  }
  if (!Number.isInteger(tfScore) || tfScore < 1 || tfScore > 100) {
    throw new Error("Invalid True/False score.");
  }

  return {
    mcqScore,
    tfScore,
    reason: `MCQ: ${clean(result.mcq_reason)} | TF: ${clean(result.true_false_reason)}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!url || !anon || !service || !geminiKey) {
      throw new Error("Required Supabase/Gemini secrets are missing.");
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Login required." }, 401);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Invalid login session." }, 401);

    const admin = createClient(url, service);
    const { data: profile, error: profileError } = await admin
      .from("profiles").select("role").eq("id", user.id).single();

    if (profileError || !["admin", "super_admin"].includes(profile?.role)) {
      return json({ error: "Admin access required." }, 403);
    }

    const body = await req.json();
    const action = clean(body.action);
    const batchId = clean(body.batch_id) || BATCH_ID;

    if (!["classify", "finalize"].includes(action)) {
      return json({ error: "Invalid action." }, 400);
    }

    const { data: batch, error: batchError } = await admin
      .from("question_import_batches")
      .select("id, notes, extracted_questions")
      .eq("id", batchId).single();

    if (batchError || !batch) return json({ error: "Batch not found." }, 404);
    if (!clean(batch.notes).toUpperCase().includes("IMPORT_TYPE=ISLAMIC_BOOK_QA")) {
      return json({ error: "This is not an Islamic Book Q&A batch." }, 400);
    }

    const extracted = batch.extracted_questions;
    const items = Array.isArray(extracted) ? extracted : extracted?.items || [];

    if (items.length !== 474) {
      return json({ error: `Expected 474 original pairs; found ${items.length}.` }, 400);
    }

    if (action === "classify") {
      const start = Number.isInteger(body.start_index) && body.start_index >= 0
        ? body.start_index : 0;
      const limit = Number.isInteger(body.limit)
        ? Math.min(Math.max(body.limit, 1), 5) : 5;

      if (start >= items.length) {
        return json({ success: true, complete: true, next_start_index: start });
      }

      const slice = items.slice(start, start + limit);
      const questions = slice.map((x: any) => clean(x.question_text)).filter(Boolean);

      const { data: existing, error: existingError } = await admin
        .from("islamic_book_classification")
        .select("source_question, mcq_score, true_false_score")
        .eq("batch_id", batchId)
        .in("source_question", questions);

      if (existingError) throw existingError;

      const done = new Set((existing || [])
        .filter((x: any) => x.mcq_score !== null && x.true_false_score !== null)
        .map((x: any) => clean(x.source_question)));

      const { data: drafts, error: draftsError } = await admin
        .from("question_import_drafts")
        .select("source_question, question_type, question_text, options, correct_answer")
        .eq("batch_id", batchId)
        .in("source_question", questions);

      if (draftsError) throw draftsError;

      let newlyClassified = 0;
      let skipped = 0;

      for (const source of slice) {
        const question = clean(source.question_text);
        const answer = clean(source.answer_text);

        if (!question || !answer || done.has(question)) {
          skipped++;
          continue;
        }

        const pair = (drafts || []).filter(
          (d: any) => clean(d.source_question) === question
        );

        const mcq = pair.find((d: any) => d.question_type === "mcq");
        const tf = pair.find((d: any) => d.question_type === "true_false");

        if (!mcq || !tf) {
          throw new Error(`MCQ or True/False draft missing for: ${question}`);
        }

        await sleep(4500);
        const result = await assess(geminiKey, source, mcq, tf);

        const { error: saveError } = await admin
          .from("islamic_book_classification")
          .upsert({
            batch_id: batchId,
            source_question: question,
            topic: clean(source.topic) || "Islamic Studies",
            difficulty_score: Math.round((result.mcqScore + result.tfScore) / 2),
            mcq_score: result.mcqScore,
            true_false_score: result.tfScore,
            classification_reason: result.reason,
            suggested_level: null,
            mcq_level: null,
            true_false_level: null,
            mcq_selected: false,
            true_false_selected: false,
          }, { onConflict: "batch_id,source_question" });

        if (saveError) throw saveError;
        newlyClassified++;
      }

      const { count, error: countError } = await admin
        .from("islamic_book_classification")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batchId)
        .not("mcq_score", "is", null)
        .not("true_false_score", "is", null);

      if (countError) throw countError;

      const next = start + slice.length;

      return json({
        success: true,
        action: "classify",
        newly_classified: newlyClassified,
        skipped,
        classified_total: count || 0,
        total_source_pairs: items.length,
        next_start_index: next,
        complete: next >= items.length,
      });
    }

    const { data: rows, error: rowsError } = await admin
      .from("islamic_book_classification")
      .select("id, source_question, mcq_score, true_false_score")
      .eq("batch_id", batchId);

    if (rowsError) throw rowsError;

    const completeRows = (rows || []).filter(
      (r: any) => r.mcq_score !== null && r.true_false_score !== null
    );

    if (completeRows.length !== 474) {
      return json({
        success: false,
        error: "Classification incomplete. Finish all 474 pairs first.",
        classified: completeRows.length,
        required: 474,
      }, 409);
    }

    const mcqSorted = [...completeRows].sort((a: any, b: any) =>
      Number(a.mcq_score) - Number(b.mcq_score) ||
      clean(a.source_question).localeCompare(clean(b.source_question))
    );

    const tfSorted = [...completeRows].sort((a: any, b: any) =>
      Number(a.true_false_score) - Number(b.true_false_score) ||
      clean(a.source_question).localeCompare(clean(b.source_question))
    );

    const { error: resetError } = await admin
      .from("islamic_book_classification")
      .update({
        mcq_level: null,
        true_false_level: null,
        mcq_selected: false,
        true_false_selected: false,
        suggested_level: null,
      })
      .eq("batch_id", batchId);

    if (resetError) throw resetError;

    const summary: Record<string, any> = {};

    for (let i = 0; i < LEVELS.length; i++) {
      const level = LEVELS[i];
      const mcqGroup = mcqSorted.slice(i * 79, (i + 1) * 79);
      const tfGroup = tfSorted.slice(i * 79, (i + 1) * 79);

      const { error: a } = await admin
        .from("islamic_book_classification")
        .update({ mcq_level: level })
        .eq("batch_id", batchId)
        .in("id", mcqGroup.map((x: any) => x.id));
      if (a) throw a;

      const { error: b } = await admin
        .from("islamic_book_classification")
        .update({ true_false_level: level })
        .eq("batch_id", batchId)
        .in("id", tfGroup.map((x: any) => x.id));
      if (b) throw b;

      const { error: c } = await admin
        .from("islamic_book_classification")
        .update({ mcq_selected: true })
        .eq("batch_id", batchId)
        .in("id", mcqGroup.slice(0, 49).map((x: any) => x.id));
      if (c) throw c;

      const { error: d } = await admin
        .from("islamic_book_classification")
        .update({ true_false_selected: true })
        .eq("batch_id", batchId)
        .in("id", tfGroup.slice(0, 29).map((x: any) => x.id));
      if (d) throw d;

      summary[level] = { mcq: 49, true_false: 29 };
    }

    return json({
      success: true,
      action: "finalize",
      total_classified: 474,
      selected_mcq: 294,
      selected_true_false: 174,
      extra_mcq: 180,
      extra_true_false: 300,
      levels: summary,
      message: "Selection saved in classification table. Existing drafts remain unchanged.",
    });
  } catch (error) {
    console.error("reclassify-islamic-book-drafts:", error);
    return json({
      error: error instanceof Error ? error.message : "Classification failed.",
    }, 500);
  }
});
