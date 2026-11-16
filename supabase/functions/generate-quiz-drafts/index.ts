

import { createClient } from "npm:@supabase/supabase-js@2";



const corsHeaders = {

  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":

    "authorization, x-client-info, apikey, content-type",

  "Access-Control-Allow-Methods": "POST, OPTIONS",

};



const MODEL = "gemini-3.1-flash-lite";

const GEMINI_URL =

  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;



const LEVELS = [

  "Foundation",

  "Beginner",

  "Intermediate",

  "Moderate",

  "Advanced",

  "Expert",

];



const jsonResponse = (data: unknown, status = 200) =>

  new Response(JSON.stringify(data), {

    status,

    headers: {

      ...corsHeaders,

      "Content-Type": "application/json",

    },

  });



function cleanText(value: unknown): string {

  return typeof value === "string" ? value.trim() : "";

}



function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Normalize question wording so punctuation/case differences do not hide duplicates.
function normalizeQuestionText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}



function parseJSON(text: string) {

  const cleaned = text

    .replace(/^```(?:json)?\s*/i, "")

    .replace(/\s*```$/i, "")

    .trim();



  try {

    return JSON.parse(cleaned);

  } catch {

    const start = cleaned.indexOf("{");

    const end = cleaned.lastIndexOf("}");



    if (start >= 0 && end > start) {

      return JSON.parse(cleaned.slice(start, end + 1));

    }



    throw new Error("Gemini returned invalid JSON.");

  }

}



function validateQuestion(q: any, index: number) {
  if (!q || typeof q !== "object" || Array.isArray(q)) {
    throw new Error(`Invalid question ${index + 1}.`);
  }

  const questionText = cleanText(q.question_text);
  let correctAnswer = cleanText(q.correct_answer);
  const topic = cleanText(q.topic);
  const rawDifficulty = cleanText(q.difficulty);
  const difficulty =
    LEVELS.find((level) => level.toLowerCase() === rawDifficulty.toLowerCase()) ||
    rawDifficulty;

  if (!questionText || !correctAnswer || !topic) {
    throw new Error(`Question ${index + 1} is incomplete.`);
  }

  if (!LEVELS.includes(difficulty)) {
    throw new Error(`Question ${index + 1} has invalid difficulty: ${difficulty || "missing"}.`);
  }

  // Gemini may return equivalent labels such as "True/False", "TF",
  // "Multiple Choice", or "MCQ". Normalize these to database values.
  const rawType = cleanText(q.question_type)
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const rawSection = cleanText(q.section)
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  let normalizedType: "true_false" | "mcq" | null = null;

  if (
    rawType === "tf" ||
    rawType === "boolean" ||
    rawType.includes("truefalse") ||
    rawType.includes("trueorfalse")
  ) {
    normalizedType = "true_false";
  } else if (
    rawType === "mcq" ||
    rawType.includes("multiplechoice") ||
    rawType.includes("singlechoice") ||
    rawType.includes("mcq")
  ) {
    normalizedType = "mcq";
  } else if (rawSection === "a" || rawSection.endsWith("sectiona")) {
    normalizedType = "true_false";
  } else if (rawSection === "b" || rawSection.endsWith("sectionb")) {
    normalizedType = "mcq";
  } else if (Array.isArray(q.options) && q.options.length === 4) {
    normalizedType = "mcq";
  }

  if (!normalizedType) {
    throw new Error(
      `Invalid question type in question ${index + 1} (section: ${cleanText(q.section) || "missing"}, type: ${cleanText(q.question_type) || "missing"}).`,
    );
  }

  const normalizedSection = normalizedType === "true_false" ? "A" : "B";
  let options: string[] | null = null;

  if (normalizedType === "true_false") {
    const answer = correctAnswer.toLowerCase().replace(/[.!?]+$/g, "").trim();

    if (["true", "t", "yes"].includes(answer)) {
      correctAnswer = "True";
    } else if (["false", "f", "no"].includes(answer)) {
      correctAnswer = "False";
    } else {
      throw new Error(`Invalid True/False answer in question ${index + 1}.`);
    }
  } else {
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      throw new Error(`Question ${index + 1} must have four options.`);
    }

    options = q.options.map((v: unknown) => cleanText(v));

    if (options.some((v) => !v)) {
      throw new Error(`Question ${index + 1} has an empty option.`);
    }

    if (new Set(options.map((v) => v.toLowerCase())).size !== 4) {
      throw new Error(`Question ${index + 1} has duplicate options.`);
    }

    const matching = options.find(
      (v) => v.toLowerCase() === correctAnswer.toLowerCase(),
    );

    if (matching) {
      correctAnswer = matching;
    } else {
      // Accept answers such as A, A., (A), A), or "Option A".
      const letter = correctAnswer.match(/^(?:option\s*)?\(?\s*([A-D])\s*\)?(?:[.)]|\s|$)/i);

      if (!letter) {
        throw new Error(`Invalid MCQ answer in question ${index + 1}.`);
      }

      correctAnswer = options[letter[1].toUpperCase().charCodeAt(0) - 65];
    }
  }

  const page = Number(q.source_page);

  return {
    section: normalizedSection,
    question_type: normalizedType,
    question_text: questionText,
    options,
    correct_answer: correctAnswer,
    topic,
    difficulty,
    explanation: cleanText(q.explanation) || null,
    source_page: Number.isInteger(page) && page > 0 ? page : null,
    source_question: cleanText(q.source_question) || null,
  };
}

async function generateBatch(
  apiKey: string,
  source: string,
  batchNumber: number,
  avoidQuestions: string[] = [],
) {
  const avoidList = avoidQuestions.length
    ? avoidQuestions.map((question, index) => `${index + 1}. ${question}`).join("\n")
    : "None.";

  const prompt = `

You are an educational question generator for Islamic Quiz 2026.



Use ONLY facts from the supplied source.

Never invent religious rulings, hadith, Quran quotations, names, dates or facts.

Preserve Urdu script and Roman English exactly as appropriate.

Keep the original meaning accurate.



Generate EXACTLY 10 questions, in this exact order:

- Questions 1–4: Section A, with section exactly "A" and question_type exactly "true_false".
- Questions 5–10: Section B, with section exactly "B" and question_type exactly "mcq".
- Each MCQ has exactly four distinct string options.
- MCQ correct_answer must match one option exactly; do not return only the option letter.
- True/False correct_answer must be exactly "True" or "False".
- Do not use alternative spellings for section or question_type.

- Every question needs a meaningful topic.

- Difficulty must be one of:

  Foundation, Beginner, Intermediate, Moderate, Advanced, Expert.

- Include source_page and source_question when identifiable.

- Explanations must be supported by the source.

- Do not repeat questions within this batch.
- Do NOT repeat or rephrase any question in the exclusion list below.
- Each question must test a different fact or concept where possible.

QUESTIONS ALREADY USED — DO NOT REPEAT THESE:
${avoidList}

Return JSON only in this structure:

{

  "questions": [

    {

      "section": "A",

      "question_type": "true_false",

      "question_text": "Example statement",

      "options": null,

      "correct_answer": "True",

      "topic": "Example topic",

      "difficulty": "Beginner",

      "explanation": "Source-supported explanation",

      "source_page": 1,

      "source_question": "Original source wording"

    }

  ]

}



This is batch ${batchNumber} of 10.

Generate exactly 10 questions from the source below.

`;



  const requestBody = {

    systemInstruction: {

      parts: [{ text: prompt }],

    },

    contents: [

      {

        role: "user",

        parts: [{ text: source }],

      },

    ],

    generationConfig: {

      responseMimeType: "application/json",

      maxOutputTokens: 4500,

    },

  };



  let lastError = "Unknown Gemini error.";



  for (let attempt = 0; attempt < 4; attempt++) {

    let response: Response;



    try {

      response = await fetch(

        `${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`,

        {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify(requestBody),

        },

      );

    } catch (err) {

      lastError =

        err instanceof Error ? err.message : "Network error.";



      if (attempt < 3) {

        await sleep([3000, 7000, 12000][attempt]);

        continue;

      }



      throw new Error(`Gemini batch ${batchNumber}: ${lastError}`);

    }



    if (!response.ok) {

      lastError = await response.text();



      if (

        [429, 500, 503].includes(response.status) &&

        attempt < 3

      ) {

        await sleep([5000, 10000, 20000][attempt]);

        continue;

      }



      throw new Error(

        `Gemini batch ${batchNumber} failed (HTTP ${response.status}): ${lastError}`,

      );

    }



    const result = await response.json();



    const content = (

      result.candidates?.[0]?.content?.parts || []

    )

      .map((part: any) => part.text || "")

      .join("\n")

      .trim();



    if (!content) {

      const reason =

        result.candidates?.[0]?.finishReason ||

        result.promptFeedback?.blockReason ||

        "Empty response";



      throw new Error(

        `Gemini batch ${batchNumber}: ${reason}`,

      );

    }



    const parsed = parseJSON(content);



    if (

      !Array.isArray(parsed.questions) ||

      parsed.questions.length !== 10

    ) {

      throw new Error(

        `Gemini batch ${batchNumber} did not return 10 questions.`,

      );

    }



    const questions = parsed.questions.map(

      (q: any, index: number) => validateQuestion(q, index),

    );



    const tf = questions.filter(

      (q: any) => q.section === "A" && q.question_type === "true_false",

    );



    const mcq = questions.filter(

      (q: any) => q.section === "B" && q.question_type === "mcq",

    );



    if (tf.length !== 4 || mcq.length !== 6) {

      throw new Error(

        `Batch ${batchNumber} must contain 4 True/False and 6 MCQ questions.`,

      );

    }



    return questions;

  }



  throw new Error(`Gemini batch ${batchNumber}: ${lastError}`);
}

// Regenerate a batch when Gemini repeats a question from an earlier batch
// or repeats one inside the same batch. This preserves the exact 100-question target.
async function generateUniqueBatch(
  apiKey: string,
  sourceChunk: string,
  fullSource: string,
  batchNumber: number,
  previousQuestions: string[],
) {
  // Keep every rejected candidate out of later attempts, not just the last attempt.
  const rejectedQuestions: string[] = [];
  const seenPrevious = new Set(previousQuestions.map(normalizeQuestionText));

  // First try the relevant source chunk. If that chunk does not contain enough
  // distinct facts, retry against the complete OCR source as a fallback.
  const attempts = [sourceChunk, sourceChunk, sourceChunk, fullSource, fullSource];

  for (let attempt = 0; attempt < attempts.length; attempt++) {
    const avoidQuestions = [...previousQuestions, ...rejectedQuestions];
    const questions = await generateBatch(
      apiKey,
      attempts[attempt],
      batchNumber,
      avoidQuestions,
    );

    const seen = new Set(seenPrevious);
    const duplicates: string[] = [];

    for (const question of questions) {
      const key = normalizeQuestionText(question.question_text);
      if (seen.has(key)) {
        duplicates.push(question.question_text);
      } else {
        seen.add(key);
      }
    }

    if (duplicates.length === 0) {
      return questions;
    }

    console.warn(
      `Gemini batch ${batchNumber} contained ${duplicates.length} duplicate question(s); attempt ${attempt + 1}/${attempts.length}.`,
    );

    rejectedQuestions.push(...questions.map((question: any) => question.question_text));

    if (attempt === 2) {
      console.warn(
        `Gemini batch ${batchNumber}: switching from the page chunk to the full OCR source to find more distinct facts.`,
      );
    }

    if (attempt < attempts.length - 1) await sleep(attempt < 2 ? 2000 : 3000);
  }

  throw new Error(
    `Gemini batch ${batchNumber} could not produce 10 unique questions after trying its source pages and the full PDF. No drafts were saved; do not re-upload yet.`,
  );
}

Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {

    return new Response("ok", { headers: corsHeaders });

  }



  if (req.method !== "POST") {

    return jsonResponse({ error: "Method not allowed." }, 405);

  }



  let adminClient: ReturnType<typeof createClient> | null = null;

  let batchId: string | null = null;

  let processingStarted = false;



  try {

    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const geminiKey = Deno.env.get("GEMINI_API_KEY");



    if (!supabaseUrl || !anonKey || !serviceKey) {

      throw new Error("Supabase environment secrets are missing.");

    }



    if (!geminiKey) {

      throw new Error("GEMINI_API_KEY is missing from Supabase secrets.");

    }



    const authHeader = req.headers.get("Authorization");



    if (!authHeader) {

      return jsonResponse({ error: "Login required." }, 401);

    }



    const userClient = createClient(supabaseUrl, anonKey, {

      global: {

        headers: { Authorization: authHeader },

      },

    });



    const {

      data: { user },

      error: authError,

    } = await userClient.auth.getUser();



    if (authError || !user) {

      return jsonResponse({ error: "Invalid login session." }, 401);

    }



    adminClient = createClient(supabaseUrl, serviceKey);



    const { data: profile, error: profileError } = await adminClient

      .from("profiles")

      .select("role")

      .eq("id", user.id)

      .single();



    if (profileError || !profile) {

      return jsonResponse({ error: "Unable to verify administrator." }, 403);

    }



    if (!["admin", "super_admin"].includes(profile.role)) {

      return jsonResponse({ error: "Admin access required." }, 403);

    }



    const body = await req.json();

    batchId = body.batch_id;



    if (!batchId || typeof batchId !== "string") {

      return jsonResponse({ error: "Valid batch_id required." }, 400);

    }



    const { data: batch, error: batchError } = await adminClient

      .from("question_import_batches")

      .select("id, ocr_text, status")

      .eq("id", batchId)

      .single();



    if (batchError || !batch) {

      return jsonResponse({ error: "Import batch not found." }, 404);

    }



    if (batch.status !== "needs_review") {

      return jsonResponse({

        error: `Batch status is ${batch.status}. OCR must be completed first.`,

      }, 400);

    }



    const ocr = cleanText(batch.ocr_text);



    if (ocr.length < 100) {

      return jsonResponse({ error: "OCR text is missing or too short." }, 400);

    }



    if (ocr.length > 120000) {

      return jsonResponse({

        error: "OCR text exceeds 120,000 characters. Split the PDF.",

      }, 413);

    }



    const { count, error: countError } = await adminClient

      .from("question_import_drafts")

      .select("id", { count: "exact", head: true })

      .eq("batch_id", batchId);



    if (countError) throw countError;



    if ((count || 0) > 0) {

      return jsonResponse({

        error: "Drafts already exist for this batch. Review them first.",

      }, 409);

    }



    const { error: processingError } = await adminClient

      .from("question_import_batches")

      .update({

        status: "processing",

        notes: "Generating questions using Gemini in 10 validated batches.",

      })

      .eq("id", batchId);



    if (processingError) throw processingError;



    processingStarted = true;



    const chunkSize = Math.ceil(ocr.length / 10);



    const chunks = Array.from({ length: 10 }, (_, i) => {

      const start = i * chunkSize;

      const end = Math.min(ocr.length, start + chunkSize);

      return ocr.slice(start, end);

    });



    const allQuestions: any[] = [];



    // Sequential requests to reduce free-tier quota errors.

    for (let i = 0; i < 10; i++) {

      console.log(`Gemini generation started: batch ${i + 1}/10`);



      const generated = await generateUniqueBatch(
        geminiKey,
        chunks[i],
        ocr,
        i + 1,
        allQuestions.map((question) => question.question_text),
      );



      allQuestions.push(...generated);



      console.log(`Gemini generation completed: batch ${i + 1}/10`);



      if (i < 9) await sleep(1500);

    }



    if (allQuestions.length !== 100) {

      throw new Error("Generation did not produce exactly 100 questions.");

    }



    const tf = allQuestions.filter(

      (q) => q.section === "A" && q.question_type === "true_false",

    );



    const mcq = allQuestions.filter(

      (q) => q.section === "B" && q.question_type === "mcq",

    );



    if (tf.length !== 40 || mcq.length !== 60) {

      throw new Error("Final distribution must be 40 True/False and 60 MCQ.");

    }



    const seen = new Set<string>();

    for (const question of allQuestions) {
      const key = normalizeQuestionText(question.question_text);
      if (seen.has(key)) {
        throw new Error(
          "Duplicate question remained after regeneration. No drafts were saved.",
        );
      }
      seen.add(key);
    }



    const rows = allQuestions.map((q) => ({

      batch_id: batchId,

      ...q,

      review_status: "pending",

    }));



    const { error: insertError } = await adminClient

      .from("question_import_drafts")

      .insert(rows);



    if (insertError) throw insertError;



    const { error: completedError } = await adminClient

      .from("question_import_batches")

      .update({

        status: "needs_review",

        notes:

          "Gemini generated 100 validated questions: 40 True/False and 60 MCQ. Admin approval required.",

      })

      .eq("id", batchId);



    if (completedError) throw completedError;



    return jsonResponse({

      success: true,

      model: MODEL,

      total: 100,

      true_false_count: 40,

      mcq_count: 60,

      batches_completed: 10,

      review_required: true,

      message: "100 Gemini draft questions saved for admin review.",

    });

  } catch (error) {

    console.error("Gemini question generation error:", error);



    const message =

      error instanceof Error ? error.message : "Question generation failed.";



    if (adminClient && batchId && processingStarted) {

      await adminClient

        .from("question_import_batches")

        .update({

          status: "needs_review",

          notes: `Gemini generation failed: ${message.slice(0, 500)}`,

        })

        .eq("id", batchId);

    }



    return jsonResponse({

      success: false,

      error: message,

    }, 500);

  }

});
