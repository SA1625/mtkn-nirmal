
import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const GROQ_MODEL = "openai/gpt-oss-20b";
const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const LEVELS = [
  "Foundation",
  "Beginner",
  "Intermediate",
  "Moderate",
  "Advanced",
  "Expert",
];

const BATCH_ID =
  "c6b6585b-3590-4f06-bcf2-2eb57f029a48";

const PAIRS_PER_REQUEST = 10;

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

const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

function parseJSON(raw: string): any {
  const value = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(
        value.slice(start, end + 1),
      );
    }

    throw new Error("AI returned invalid JSON.");
  }
}

// --------------------------------------------------
// BUILD CLASSIFICATION PROMPT
// --------------------------------------------------

function buildPrompt(tasks: any[]) {
  const input = tasks.map((task, index) => ({
    index,

    original_question: clean(
      task.source.question_text,
    ),

    original_answer: clean(
      task.source.answer_text,
    ),

    topic: clean(task.source.topic),

    mcq: {
      question: clean(task.mcq.question_text),
      options: task.mcq.options || [],
      correct_answer: clean(
        task.mcq.correct_answer,
      ),
    },

    true_false: {
      question: clean(task.tf.question_text),
      correct_answer: clean(
        task.tf.correct_answer,
      ),
    },
  }));

  return `
You are an expert educational assessment classifier
for an Islamic Studies quiz.

Assess every MCQ and True/False question independently.

STRICT RULES:

1. Use ONLY the supplied original question and answer.
2. Never change any original question.
3. Never change any option.
4. Never change any correct answer.
5. Do not introduce external religious claims.
6. Score each MCQ from 1 to 100.
7. Score each True/False question from 1 to 100.
8. Score according to actual cognitive difficulty.
9. Basic recall should receive a low score.
10. Complex understanding should receive a high score.
11. Preserve every input index.
12. Return exactly one result for every input item.
13. Never omit an item.
14. Do not repeat an index.
15. Keep each reason to 6 words maximum.

RETURN VALID JSON ONLY:

{
  "items": [
    {
      "index": 0,
      "mcq_score": 25,
      "mcq_reason": "Basic factual recall",
      "true_false_score": 30,
      "true_false_reason": "Simple factual understanding"
    }
  ]
}

INPUT:
${JSON.stringify(input)}
`;
}

// --------------------------------------------------
// VALIDATE AI RESPONSE
// --------------------------------------------------

function validateResults(
  raw: string,
  tasks: any[],
  provider: string,
) {
  const parsed = parseJSON(raw);

  if (!Array.isArray(parsed.items)) {
    throw new Error(
      `${provider}: Missing items array.`,
    );
  }

  const results = new Map<number, any>();

  for (const item of parsed.items) {
    const index = Number(item.index);
    const mcqScore = Number(item.mcq_score);
    const tfScore = Number(item.true_false_score);

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= tasks.length
    ) {
      throw new Error(
        `${provider}: Invalid question index.`,
      );
    }

    if (
      !Number.isInteger(mcqScore) ||
      mcqScore < 1 ||
      mcqScore > 100
    ) {
      throw new Error(
        `${provider}: Invalid MCQ score at ${index}.`,
      );
    }

    if (
      !Number.isInteger(tfScore) ||
      tfScore < 1 ||
      tfScore > 100
    ) {
      throw new Error(
        `${provider}: Invalid True/False score at ${index}.`,
      );
    }

    if (results.has(index)) {
      throw new Error(
        `${provider}: Duplicate result index ${index}.`,
      );
    }

    results.set(index, {
      mcqScore,
      tfScore,

      reason:
        `MCQ: ${clean(item.mcq_reason)} | ` +
        `TF: ${clean(item.true_false_reason)}`,
    });
  }

  if (results.size !== tasks.length) {
    throw new Error(
      `${provider}: Returned ${results.size} of ${tasks.length} results.`,
    );
  }

  return results;
}

// --------------------------------------------------
// PRIMARY AI: GEMINI
// --------------------------------------------------

async function assessWithGemini(
  apiKey: string,
  prompt: string,
  tasks: any[],
) {
  const response = await fetch(
    `${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

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
          maxOutputTokens: 1200,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Gemini HTTP ${response.status}: ${errorText.slice(0, 600)}`,
    );
  }

  const payload = await response.json();

  const raw = (
    payload.candidates?.[0]?.content?.parts || []
  )
    .map((part: any) => part.text || "")
    .join("\n");

  if (!raw.trim()) {
    throw new Error(
      "Gemini returned an empty response.",
    );
  }

  return validateResults(
    raw,
    tasks,
    "Gemini",
  );
}

// --------------------------------------------------
// BACKUP AI: GROQ
// --------------------------------------------------

async function assessWithGroq(
  apiKey: string,
  prompt: string,
  tasks: any[],
) {
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
          content:
            "You are a strict educational difficulty classifier. Return valid JSON only. Follow every instruction and preserve all question indexes.",
        },

        {
          role: "user",
          content: prompt,
        },
      ],

      response_format: {
        type: "json_object",
      },

      temperature: 0.1,

      max_completion_tokens: 1200,

      reasoning_effort: "low",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Groq HTTP ${response.status}: ${errorText.slice(0, 600)}`,
    );
  }

  const payload = await response.json();

  const raw =
    payload.choices?.[0]?.message?.content || "";

  if (!raw.trim()) {
    throw new Error(
      "Groq returned an empty response.",
    );
  }

  return validateResults(
    raw,
    tasks,
    "Groq",
  );
}

// --------------------------------------------------
// AUTOMATIC AI FALLBACK
// GEMINI -> GROQ KEY 1 -> GROQ KEY 2
// --------------------------------------------------

async function assessBatch(
  geminiKey: string | undefined,
  groqKeys: { label: string; key: string }[],
  tasks: any[],
) {
  const prompt = buildPrompt(tasks);

  let geminiError = "";

  // PRIMARY: GEMINI

  if (geminiKey) {
    try {
      const results = await assessWithGemini(
        geminiKey,
        prompt,
        tasks,
      );

      return {
        results,
        provider: "Gemini",
      };
    } catch (error) {
      geminiError =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        "Gemini failed. Switching to Groq:",
        geminiError,
      );
    }
  } else {
    geminiError = "GEMINI_API_KEY is not configured.";
  }

  // BACKUP: TRY BOTH GROQ KEYS IN ORDER.

  if (groqKeys.length > 0) {
    const groqErrors: string[] = [];

    for (const groqEntry of groqKeys) {
      try {
        const results = await assessWithGroq(
          groqEntry.key,
          prompt,
          tasks,
        );

        console.log(
          `${groqEntry.label} successfully processed batch.`,
        );

        return {
          results,
          provider: groqEntry.label,
        };
      } catch (error) {
        const detail =
          error instanceof Error
            ? error.message
            : String(error);

        groqErrors.push(
          `${groqEntry.label}: ${detail}`,
        );

        console.error(
          `${groqEntry.label} failed:`,
          detail,
        );
      }
    }

    throw new Error(
      `All AI providers failed. Gemini: ${geminiError}. ${groqErrors.join(" | ")}`,
    );
  }

  throw new Error(
    `Gemini failed: ${geminiError}. Both Groq API keys are missing.`,
  );
}

// --------------------------------------------------
// MAIN EDGE FUNCTION
// --------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      { error: "Method not allowed." },
      405,
    );
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");

    const anon = Deno.env.get(
      "SUPABASE_ANON_KEY",
    );

    const service = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    const geminiKey = Deno.env.get(
      "GEMINI_API_KEY",
    );

    // TWO GROQ SECRETS

    const configuredGroqKeys = [
      {
        label: "Groq Key 1",
        key: Deno.env.get("GROQ_API_KEY"),
      },
      {
        label: "Groq Key 2",
        key: Deno.env.get("GROQ_API_KEY_1"),
      },
    ].filter(
      (entry): entry is {
        label: string;
        key: string;
      } =>
        typeof entry.key === "string" &&
        entry.key.trim().length > 0,
    ).map((entry) => ({
      label: entry.label,
      key: entry.key.trim(),
    }));

    // Avoid duplicate keys.

    const seenGroqKeys = new Set<string>();

    const uniqueGroqKeys =
      configuredGroqKeys.filter((entry) => {
        if (seenGroqKeys.has(entry.key)) {
          return false;
        }

        seenGroqKeys.add(entry.key);

        return true;
      });

    if (!url || !anon || !service) {
      throw new Error(
        "Required Supabase secrets are missing.",
      );
    }

    if (
      !geminiKey &&
      uniqueGroqKeys.length === 0
    ) {
      throw new Error(
        "Gemini and both Groq API keys are missing.",
      );
    }

    // AUTHENTICATION

    const authorization =
      req.headers.get("Authorization");

    if (!authorization) {
      return json(
        { error: "Login required." },
        401,
      );
    }

    const userClient = createClient(
      url,
      anon,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json(
        { error: "Invalid login session." },
        401,
      );
    }

    const admin = createClient(
      url,
      service,
    );

    // ADMIN CHECK

    const {
      data: profile,
      error: profileError,
    } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !["admin", "super_admin"].includes(
        profile?.role,
      )
    ) {
      return json(
        { error: "Admin access required." },
        403,
      );
    }

    const body = await req.json();

    const action = clean(body.action);

    const batchId =
      clean(body.batch_id) || BATCH_ID;

    if (
      !["classify", "finalize"].includes(action)
    ) {
      return json(
        { error: "Invalid action." },
        400,
      );
    }

    // LOAD SOURCE BATCH

    const {
      data: batch,
      error: batchError,
    } = await admin
      .from("question_import_batches")
      .select(
        "id, notes, extracted_questions",
      )
      .eq("id", batchId)
      .single();

    if (batchError || !batch) {
      return json(
        { error: "Batch not found." },
        404,
      );
    }

    if (
      !clean(batch.notes)
        .toUpperCase()
        .includes("IMPORT_TYPE=ISLAMIC_BOOK_QA")
    ) {
      return json(
        {
          error:
            "This is not an Islamic Book Q&A batch.",
        },
        400,
      );
    }

    const extracted =
      batch.extracted_questions;

    const items = Array.isArray(extracted)
      ? extracted
      : extracted?.items || [];

    if (items.length !== 474) {
      return json(
        {
          error:
            `Expected 474 original pairs; found ${items.length}.`,
        },
        400,
      );
    }

    // ==========================================
    // CLASSIFICATION
    // ==========================================

    if (action === "classify") {
      // LOAD SAVED CHECKPOINTS.

      const {
        data: checkpointRows,
        error: checkpointError,
      } = await admin
        .from("islamic_book_classification")
        .select("source_question")
        .eq("batch_id", batchId)
        .not("mcq_score", "is", null)
        .not("true_false_score", "is", null);

      if (checkpointError) {
        throw checkpointError;
      }

      const completedQuestions = new Set(
        (checkpointRows || []).map(
          (row: any) =>
            clean(row.source_question),
        ),
      );

      // FIND FIRST UNFINISHED QUESTION.

      const start = items.findIndex(
        (item: any) =>
          clean(item.question_text) &&
          !completedQuestions.has(
            clean(item.question_text),
          ),
      );

      if (start === -1) {
        const {
          count: completedCount,
          error: countError,
        } = await admin
          .from("islamic_book_classification")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("batch_id", batchId)
          .not("mcq_score", "is", null)
          .not("true_false_score", "is", null);

        if (countError) {
          throw countError;
        }

        return json({
          success: true,
          action: "classify",

          newly_classified: 0,

          classified_total:
            completedCount || 0,

          total_source_pairs: items.length,

          next_start_index: items.length,

          complete: true,

          message:
            "All original source pairs are classified.",
        });
      }

      // PROCESS ONLY 10 PAIRS PER REQUEST.

      const slice = items.slice(
        start,
        start + PAIRS_PER_REQUEST,
      );

      const questions = slice
        .map((item: any) =>
          clean(item.question_text),
        )
        .filter(Boolean);

      // CHECK EXISTING CLASSIFICATIONS.

      const {
        data: existing,
        error: existingError,
      } = await admin
        .from("islamic_book_classification")
        .select(
          "source_question, mcq_score, true_false_score",
        )
        .eq("batch_id", batchId)
        .in("source_question", questions);

      if (existingError) {
        throw existingError;
      }

      const done = new Set(
        (existing || [])
          .filter(
            (row: any) =>
              row.mcq_score !== null &&
              row.true_false_score !== null,
          )
          .map((row: any) =>
            clean(row.source_question),
          ),
      );

      // LOAD ORIGINAL DRAFTS.

      const {
        data: drafts,
        error: draftsError,
      } = await admin
        .from("question_import_drafts")
        .select(
          "source_question, question_type, question_text, options, correct_answer",
        )
        .eq("batch_id", batchId)
        .in("source_question", questions);

      if (draftsError) {
        throw draftsError;
      }

      const tasks: any[] = [];

      let skipped = 0;

      for (const source of slice) {
        const question = clean(
          source.question_text,
        );

        const answer = clean(
          source.answer_text,
        );

        if (
          !question ||
          !answer ||
          done.has(question)
        ) {
          skipped++;
          continue;
        }

        const pair = (drafts || []).filter(
          (draft: any) =>
            clean(draft.source_question) ===
            question,
        );

        const mcq = pair.find(
          (draft: any) =>
            draft.question_type === "mcq",
        );

        const tf = pair.find(
          (draft: any) =>
            draft.question_type === "true_false",
        );

        if (!mcq || !tf) {
          throw new Error(
            `MCQ or True/False draft missing: ${question}`,
          );
        }

        tasks.push({
          source,
          mcq,
          tf,
        });
      }

      let newlyClassified = 0;
      let provider = "None";

      if (tasks.length > 0) {
        const assessment = await assessBatch(
          geminiKey,
          uniqueGroqKeys,
          tasks,
        );

        provider = assessment.provider;

        const records = tasks.map(
          (task, index) => {
            const result =
              assessment.results.get(index);

            return {
              batch_id: batchId,

              source_question: clean(
                task.source.question_text,
              ),

              topic:
                clean(task.source.topic) ||
                "Islamic Studies",

              difficulty_score: Math.round(
                (
                  result.mcqScore +
                  result.tfScore
                ) / 2,
              ),

              mcq_score: result.mcqScore,

              true_false_score: result.tfScore,

              classification_reason:
                result.reason,

              suggested_level: null,

              mcq_level: null,

              true_false_level: null,

              mcq_selected: false,

              true_false_selected: false,
            };
          },
        );

        // SAVE ONLY AFTER COMPLETE VALIDATION.

        const {
          error: saveError,
        } = await admin
          .from("islamic_book_classification")
          .upsert(records, {
            onConflict:
              "batch_id,source_question",
          });

        if (saveError) {
          throw saveError;
        }

        newlyClassified = records.length;
      }

      // RECOUNT SAVED CLASSIFICATIONS.

      const {
        count,
        error: countError,
      } = await admin
        .from("islamic_book_classification")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("batch_id", batchId)
        .not("mcq_score", "is", null)
        .not("true_false_score", "is", null);

      if (countError) {
        throw countError;
      }

      const isComplete =
        (count || 0) >= items.length;

      // SPACE SUCCESSFUL GROQ REQUESTS 30 SECONDS APART.

      if (
        !isComplete &&
        newlyClassified > 0 &&
        provider.startsWith("Groq")
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, 30_000),
        );
      }

      return json({
        success: true,

        action: "classify",

        provider_used: provider,

        newly_classified: newlyClassified,

        skipped,

        classified_total: count || 0,

        total_source_pairs: items.length,

        next_start_index:
          start + slice.length,

        complete: isComplete,

        pairs_per_request:
          PAIRS_PER_REQUEST,

        next_batch_delay_seconds:
          isComplete || !provider.startsWith("Groq")
            ? 0
            : 30,

        message:
          `${newlyClassified} pairs classified using ${provider}.`,
      });
    }

    // ==========================================
    // FINALIZE SIX-LEVEL SELECTION
    // ==========================================

    const {
      data: rows,
      error: rowsError,
    } = await admin
      .from("islamic_book_classification")
      .select(
        "id, source_question, mcq_score, true_false_score",
      )
      .eq("batch_id", batchId);

    if (rowsError) {
      throw rowsError;
    }

    const completeRows = (rows || []).filter(
      (row: any) =>
        row.mcq_score !== null &&
        row.true_false_score !== null,
    );

    if (completeRows.length !== 474) {
      return json(
        {
          success: false,

          error:
            "Classification incomplete. Finish all 474 pairs first.",

          classified: completeRows.length,

          required: 474,
        },
        409,
      );
    }

    const mcqSorted = [...completeRows].sort(
      (a: any, b: any) =>
        Number(a.mcq_score) -
          Number(b.mcq_score) ||
        clean(a.source_question).localeCompare(
          clean(b.source_question),
        ),
    );

    const tfSorted = [...completeRows].sort(
      (a: any, b: any) =>
        Number(a.true_false_score) -
          Number(b.true_false_score) ||
        clean(a.source_question).localeCompare(
          clean(b.source_question),
        ),
    );

    // RESET SELECTION FLAGS ONLY.

    const {
      error: resetError,
    } = await admin
      .from("islamic_book_classification")
      .update({
        mcq_level: null,
        true_false_level: null,
        mcq_selected: false,
        true_false_selected: false,
        suggested_level: null,
      })
      .eq("batch_id", batchId);

    if (resetError) {
      throw resetError;
    }

    const summary: Record<string, any> = {};

    for (
      let i = 0;
      i < LEVELS.length;
      i++
    ) {
      const level = LEVELS[i];

      const mcqGroup = mcqSorted.slice(
        i * 79,
        (i + 1) * 79,
      );

      const tfGroup = tfSorted.slice(
        i * 79,
        (i + 1) * 79,
      );

      // ASSIGN MCQ LEVEL.

      const { error: a } = await admin
        .from("islamic_book_classification")
        .update({
          mcq_level: level,
        })
        .eq("batch_id", batchId)
        .in(
          "id",
          mcqGroup.map(
            (row: any) => row.id,
          ),
        );

      if (a) throw a;

      // ASSIGN TRUE/FALSE LEVEL.

      const { error: b } = await admin
        .from("islamic_book_classification")
        .update({
          true_false_level: level,
        })
        .eq("batch_id", batchId)
        .in(
          "id",
          tfGroup.map(
            (row: any) => row.id,
          ),
        );

      if (b) throw b;

      // SELECT 49 MCQs.

      const { error: c } = await admin
        .from("islamic_book_classification")
        .update({
          mcq_selected: true,
        })
        .eq("batch_id", batchId)
        .in(
          "id",
          mcqGroup
            .slice(0, 49)
            .map((row: any) => row.id),
        );

      if (c) throw c;

      // SELECT 29 TRUE/FALSE.

      const { error: d } = await admin
        .from("islamic_book_classification")
        .update({
          true_false_selected: true,
        })
        .eq("batch_id", batchId)
        .in(
          "id",
          tfGroup
            .slice(0, 29)
            .map((row: any) => row.id),
        );

      if (d) throw d;

      summary[level] = {
        mcq: 49,
        true_false: 29,
      };
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

      message:
        "Six-level selection saved. Existing question drafts remain unchanged.",
    });
  } catch (error) {
    console.error(
      "Islamic Book Classification Error:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Classification failed.";

    return json(
      {
        success: false,

        error: message,

        safe_to_resume: true,

        rate_limited:
          /429|quota|RESOURCE_EXHAUSTED|rate.?limit/i.test(
            message,
          ),
      },
      500,
    );
  }
});
