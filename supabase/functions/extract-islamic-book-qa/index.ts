
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

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseJSON(value: string): any {
  const text = value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }

    throw new Error("Gemini returned invalid JSON.");
  }
}

function getPageSections(ocr: string) {
  const regex =
    /--- PDF PAGE (\d+) (LEFT|RIGHT) BOOK PAGE ---([\s\S]*?)(?=\n--- PDF PAGE \d+ (?:LEFT|RIGHT) BOOK PAGE ---|$)/g;

  const sections: {
    page: number;
    side: string;
    text: string;
  }[] = [];

  let match;

  while ((match = regex.exec(ocr)) !== null) {
    const text = clean(match[3]);

    if (text) {
      sections.push({
        page: Number(match[1]),
        side: match[2],
        text,
      });
    }
  }

  return sections;
}

function makeChunks(sections: ReturnType<typeof getPageSections>) {
  const pageNumbers = [...new Set(sections.map((s) => s.page))].sort(
    (a, b) => a - b,
  );

  const chunks: {
    firstPage: number;
    lastPage: number;
    source: string;
  }[] = [];

  for (let i = 0; i < pageNumbers.length; i += 4) {
    const selectedPages = pageNumbers.slice(i, i + 4);
    const selected = sections.filter((s) =>
      selectedPages.includes(s.page)
    );

    chunks.push({
      firstPage: selectedPages[0],
      lastPage: selectedPages[selectedPages.length - 1],
      source: selected.map((s) =>
        `PDF PAGE ${s.page} - ${s.side} BOOK PAGE\n${s.text}`
      ).join("\n\n"),
    });
  }

  return chunks;
}

async function extractChunk(
  apiKey: string,
  source: string,
  firstPage: number,
  lastPage: number,
) {
  const prompt = `
You are extracting ORIGINAL question-and-answer pairs from a supplied Islamic book.

SOURCE RULES:
- Use ONLY the supplied source text.
- Extract existing Sawal/Jawab pairs; do not create new questions.
- Preserve the original wording and language as closely as possible.
- Preserve Urdu script as Urdu script.
- Preserve Roman Urdu as Roman Urdu.
- Do not translate, paraphrase, modernize, or correct the source.
- Do not invent missing answers or complete incomplete sentences.
- If a question or answer is unclear or incomplete, omit that pair.
- Do not convert questions into MCQs.
- Do not create options, explanations, or difficulty levels.
- Identify the topic from the source heading when possible.
- Use the PDF page number supplied with the source.
- Do not treat the book cover, publisher details, or ordinary paragraphs as questions.
- Do not mistake page numbers, headings, or examples for questions.

Extract only clearly supported question-and-answer pairs.

Return JSON only in this format:
{
  "items": [
    {
      "question_text": "Original question wording",
      "answer_text": "Original answer wording",
      "topic": "Topic heading from the book",
      "source_page": 1
    }
  ]
}

If no clear pair exists, return {"items": []}.

The source covers PDF pages ${firstPage} to ${lastPage}.
`;

  const result = await fetch(
    `${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: prompt }],
        },
        contents: [{
          role: "user",
          parts: [{ text: source }],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 8000,
          temperature: 0.1,
        },
      }),
    },
  );

  if (!result.ok) {
    const detail = await result.text();
    throw new Error(`Gemini HTTP ${result.status}: ${detail.slice(0, 700)}`);
  }

  const data = await result.json();
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((part: any) => part.text || "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty extraction response.");
  }

  const parsed = parseJSON(text);

  if (!Array.isArray(parsed.items)) {
    throw new Error("Gemini response does not contain an items array.");
  }

  return parsed.items
    .filter((item: any) =>
      clean(item.question_text) &&
      clean(item.answer_text) &&
      clean(item.topic)
    )
    .map((item: any) => ({
      question_text: clean(item.question_text),
      answer_text: clean(item.answer_text),
      topic: clean(item.topic),
      source_page:
        Number.isInteger(Number(item.source_page)) &&
        Number(item.source_page) > 0
          ? Number(item.source_page)
          : null,
    }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return response({ error: "Method not allowed." }, 405);
  }

  let adminClient: ReturnType<typeof createClient> | null = null;
  let batchId = "";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey || !geminiKey) {
      throw new Error("Required Supabase or Gemini secrets are missing.");
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return response({ error: "Login required." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return response({ error: "Invalid login session." }, 401);
    }

    adminClient = createClient(supabaseUrl, serviceKey);

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !["admin", "super_admin"].includes(profile?.role)) {
      return response({ error: "Admin access required." }, 403);
    }

    const body = await req.json();
    batchId = clean(body.batch_id);
    const chunkIndex = Number(body.chunk_index);

    if (!batchId || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return response({
        error: "A valid batch_id and zero-based chunk_index are required.",
      }, 400);
    }

    const { data: batch, error: batchError } = await adminClient
      .from("question_import_batches")
      .select("id, ocr_text, notes, status, extracted_questions")
      .eq("id", batchId)
      .single();

    if (batchError || !batch) {
      return response({ error: "Import batch not found." }, 404);
    }

    if (!clean(batch.notes).includes("IMPORT_TYPE=ISLAMIC_BOOK_QA")) {
      return response({ error: "This is not an Islamic book import batch." }, 400);
    }

    const ocr = clean(batch.ocr_text);

    if (ocr.length < 100) {
      return response({ error: "Saved OCR text is missing." }, 400);
    }

    const sections = getPageSections(ocr);

    if (!sections.length) {
      return response({
        error: "No LEFT/RIGHT book page markers found in saved OCR text.",
      }, 400);
    }

    const chunks = makeChunks(sections);

    if (chunkIndex >= chunks.length) {
      return response({ error: "Chunk index is outside the book range." }, 400);
    }

    const saved = batch.extracted_questions;

    const store = saved && !Array.isArray(saved) && typeof saved === "object"
      ? saved
      : {
          items: Array.isArray(saved) ? saved : [],
          completed_chunks: [],
        };

    const existingItems = Array.isArray(store.items) ? store.items : [];
    const completed = Array.isArray(store.completed_chunks)
      ? store.completed_chunks.map(Number)
      : [];

    if (completed.includes(chunkIndex)) {
      return response({
        success: true,
        already_completed: true,
        chunk_index: chunkIndex,
        total_chunks: chunks.length,
        extracted_count: existingItems.length,
        complete: completed.length >= chunks.length,
      });
    }

    const chunk = chunks[chunkIndex];

    const extracted = await extractChunk(
      geminiKey,
      chunk.source,
      chunk.firstPage,
      chunk.lastPage,
    );

    const tagged = extracted.map((item: any) => ({
      ...item,
      _chunk_index: chunkIndex,
      source_type: "original_book",
    }));

    const retained = existingItems.filter(
      (item: any) => Number(item?._chunk_index) !== chunkIndex,
    );

    const updatedItems = [...retained, ...tagged];
    const updatedCompleted = [...new Set([...completed, chunkIndex])].sort(
      (a, b) => a - b,
    );

    const isComplete = updatedCompleted.length >= chunks.length;

    const newStore = {
      items: updatedItems,
      completed_chunks: updatedCompleted,
      total_chunks: chunks.length,
      last_processed_chunk: chunkIndex,
    };

    const { error: saveError } = await adminClient
      .from("question_import_batches")
      .update({
        extracted_questions: newStore,
        status: isComplete ? "needs_review" : "processing",
        notes:
          `IMPORT_TYPE=ISLAMIC_BOOK_QA; Original Q&A extraction ` +
          `${updatedCompleted.length}/${chunks.length} chunks completed. ` +
          `${updatedItems.length} original Q&A pairs extracted. ` +
          (isComplete
            ? "Extraction complete. Admin review required."
            : "Extraction in progress."),
      })
      .eq("id", batchId);

    if (saveError) throw saveError;

    return response({
      success: true,
      chunk_index: chunkIndex,
      total_chunks: chunks.length,
      completed_chunks: updatedCompleted.length,
      extracted_this_chunk: tagged.length,
      extracted_count: updatedItems.length,
      complete: isComplete,
      message: isComplete
        ? "Original book Q&A extraction completed."
        : `Completed chunk ${chunkIndex + 1} of ${chunks.length}.`,
    });
  } catch (error) {
    console.error("Islamic book extraction error:", error);

    if (adminClient && batchId) {
      await adminClient
        .from("question_import_batches")
        .update({
          status: "needs_review",
          notes:
            `IMPORT_TYPE=ISLAMIC_BOOK_QA; Extraction paused: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
        })
        .eq("id", batchId);
    }

    return response({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Original Q&A extraction failed.",
    }, 500);
  }
});
