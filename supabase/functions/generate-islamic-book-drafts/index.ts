import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "gemini-3.1-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const LEVELS = ["Foundation", "Beginner", "Intermediate", "Moderate", "Advanced", "Expert"];
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function clean(v: unknown) { return typeof v === "string" ? v.trim() : ""; }
function parseJSON(raw: string): any {
  const s = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(s); } catch {
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error("Gemini returned invalid JSON.");
  }
}
function normalizeLevel(v: unknown) {
  return LEVELS.find(x => x.toLowerCase() === clean(v).toLowerCase()) || "Intermediate";
}


const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function generatePair(apiKey: string, source: any) {
  const prompt = `You convert ONE supplied original Islamic-book Sawal/Jawab pair into TWO quiz drafts. Use only the supplied answer as factual evidence; do not add external religious claims. Preserve the source language/script (Urdu stays Urdu, Roman Urdu stays Roman Urdu). Create one MCQ with exactly four distinct options and one unambiguous correct option, and one True/False statement with answer exactly True or False. Both must test the supplied answer. Do not make disputed theological assertions. Difficulty must be exactly one of ${LEVELS.join(", ")}. Use the same difficulty for both. Return JSON only: {"difficulty":"Foundation|Beginner|Intermediate|Moderate|Advanced|Expert","mcq":{"question_text":"...","options":["...","...","...","..."],"correct_answer":"one exact option","explanation":"..."},"true_false":{"question_text":"...","correct_answer":"True or False","explanation":"..."}}\nOriginal question: ${clean(source.question_text)}\nOriginal answer: ${clean(source.answer_text)}\nTopic: ${clean(source.topic) || "Islamic Studies"}`;
  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: prompt }] }, contents: [{ role: "user", parts: [{ text: "Generate the two drafts from the source pair above." }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.15, maxOutputTokens: 1800 } }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const payload = await res.json();
  const raw = (payload.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("\n");
  if (!raw.trim()) throw new Error("Gemini returned an empty response.");
  const parsed = parseJSON(raw), level = normalizeLevel(parsed.difficulty), mcq = parsed.mcq || {}, tf = parsed.true_false || {};
  const options = Array.isArray(mcq.options) ? mcq.options.map(clean) : [];
  if (!clean(mcq.question_text) || options.length !== 4 || options.some((x: string) => !x) || new Set(options.map((x: string) => x.toLowerCase())).size !== 4 || !options.includes(clean(mcq.correct_answer))) throw new Error("MCQ validation failed: four distinct options and an exact correct answer are required.");
  if (!clean(tf.question_text) || !["True", "False"].includes(clean(tf.correct_answer))) throw new Error("True/False validation failed.");
  return { level, mcq: { ...mcq, options }, tf };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!url || !anon || !service || !geminiKey) throw new Error("Required Supabase/Gemini secrets are missing.");
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Login required." }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Invalid login session." }, 401);
    const admin = createClient(url, service);
    const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (profileError || !["admin", "super_admin"].includes(profile?.role)) return json({ error: "Admin access required." }, 403);

    const body = await req.json(), batchId = clean(body.batch_id);
    const start = Number.isInteger(body.start_index) && body.start_index >= 0 ? body.start_index : 0;
    const limit = Number.isInteger(body.limit) ? Math.min(Math.max(body.limit, 1), 5) : 5;
    if (!batchId) return json({ error: "batch_id is required." }, 400);
    const { data: batch, error: batchError } = await admin.from("question_import_batches").select("id, notes, extracted_questions").eq("id", batchId).single();
    if (batchError || !batch) return json({ error: "Import batch not found." }, 404);
    if (!clean(batch.notes).toUpperCase().includes("IMPORT_TYPE=ISLAMIC_BOOK_QA")) return json({ error: "This function only accepts the Islamic Book Q&A batch." }, 400);
    const extracted = batch.extracted_questions;
    const items = Array.isArray(extracted) ? extracted : (Array.isArray(extracted?.items) ? extracted.items : []);
    if (!items.length) return json({ error: "No original Q&A pairs found in this batch." }, 400);
    if (start >= items.length) return json({ success: true, complete: true, processed: 0, total: items.length, next_start_index: start });
    const slice = items.slice(start, start + limit);
    const { data: existing, error: existingError } = await admin.from("question_import_drafts").select("source_question, question_type").eq("batch_id", batchId);
    if (existingError) throw existingError;
    const existingKeys = new Set((existing || []).map((x: any) => `${clean(x.source_question)}|||${clean(x.question_type)}`));
    const rows: any[] = [];
    let generated = 0, skipped = 0;
    for (const source of slice) {
      const originalQuestion = clean(source.question_text), originalAnswer = clean(source.answer_text);
      if (!originalQuestion || !originalAnswer) { skipped++; continue; }
      const keyMCQ = `${originalQuestion}|||mcq`, keyTF = `${originalQuestion}|||true_false`;
      if (existingKeys.has(keyMCQ) && existingKeys.has(keyTF)) { skipped++; continue; }
      await sleep(4500);
const result = await generatePair(geminiKey, source);
      const page = Number(source.source_page) > 0 ? Number(source.source_page) : null;
      const common = { batch_id: batchId, topic: clean(source.topic) || "Islamic Studies", difficulty: result.level, source_level: result.level, eligible_levels: [result.level], source_page: page, source_question: originalQuestion, review_status: "pending" };
      if (!existingKeys.has(keyMCQ)) rows.push({ ...common, question_type: "mcq", section: "B", question_text: clean(result.mcq.question_text), options: result.mcq.options, correct_answer: clean(result.mcq.correct_answer), explanation: clean(result.mcq.explanation) || `Based on original book answer: ${originalAnswer}` });
      if (!existingKeys.has(keyTF)) rows.push({ ...common, question_type: "true_false", section: "A", question_text: clean(result.tf.question_text), options: null, correct_answer: clean(result.tf.correct_answer), explanation: clean(result.tf.explanation) || `Based on original book answer: ${originalAnswer}` });
      existingKeys.add(keyMCQ); existingKeys.add(keyTF); generated++;
    }
    if (rows.length) {
      const { error: insertError } = await admin.from("question_import_drafts").insert(rows);
      if (insertError) throw insertError;
    }
    const next = start + slice.length;
    return json({ success: true, batch_id: batchId, source_pairs_in_this_chunk: slice.length, source_pairs_generated: generated, source_pairs_skipped: skipped, drafts_inserted: rows.length, total_source_pairs: items.length, next_start_index: next, complete: next >= items.length, message: "Drafts saved as pending. Nothing has been published to the quiz bank." });
  } catch (error) {
    console.error("generate-islamic-book-drafts:", error);
    return json({ error: error?.message || "Draft generation failed." }, 500);
  }
});
