
import { useState } from "react";
import { supabase } from "./supabase";
import { createWorker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./QuestionImport.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default function QuestionImport() {
  const [file, setFile] = useState(null);
  const [language, setLanguage] = useState("eng+urd");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState("");
  const [pageInfo, setPageInfo] = useState("");
  const [stage, setStage] = useState("");

  const startImport = async () => {
    if (!file) {
      setMessage("Please select a PDF file first.");
      return;
    }

    setProcessing(true);
    setProgress(0);
    setPreview("");
    setMessage("");
    setStage("Preparing PDF");

    let worker = null;
    let batchId = null;

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        throw new Error("Please login again.");
      }

      const filePath =
        `${userData.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      const { error: uploadError } = await supabase.storage
        .from("question-bank-pdfs")
        .upload(filePath, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: batch, error: batchError } = await supabase
        .from("question_import_batches")
        .insert({
          file_name: file.name,
          file_path: filePath,
          uploaded_by: userData.user.id,
          status: "processing",
          ocr_language: language,
        })
        .select("id")
        .single();

      if (batchError) throw batchError;

      batchId = batch.id;

      setStage("Reading PDF");
      const pdfData = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

      setPageInfo(`Total pages: ${pdf.numPages}`);

      let completeText = "";

      await supabase
        .from("question_import_batches")
        .update({ total_pages: pdf.numPages })
        .eq("id", batch.id);

      setStage("Loading OCR language");
      worker = await createWorker(language);

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        setMessage(`Reading page ${pageNumber} of ${pdf.numPages}`);

        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        const result = await worker.recognize(canvas);

        completeText +=
          `\n\n--- PAGE ${pageNumber} ---\n\n${result.data.text || ""}`;

        setPreview(completeText);
        setProgress(Math.round((pageNumber / pdf.numPages) * 100));

        const { error: saveError } = await supabase
          .from("question_import_batches")
          .update({
            processed_pages: pageNumber,
            ocr_text: completeText,
          })
          .eq("id", batch.id);

        if (saveError) throw saveError;

        canvas.width = 0;
        canvas.height = 0;
      }

      await worker.terminate();
      worker = null;

      if (completeText.trim().length < 100) {
        throw new Error(
          "Very little text was detected. The scan may need better quality."
        );
      }

      const { error: finishError } = await supabase
        .from("question_import_batches")
        .update({
          status: "needs_review",
          ocr_text: completeText,
          processed_pages: pdf.numPages,
        })
        .eq("id", batch.id);

      if (finishError) throw finishError;

      setStage("Generating AI questions");
      setMessage("OCR completed. AI is preparing question drafts...");

      const { data: aiData, error: aiError } =
        await supabase.functions.invoke("generate-quiz-drafts", {
          body: { batch_id: batch.id },
        });

      if (aiError) {
        throw new Error(
          aiError.message || "AI generation request failed."
        );
      }

      if (aiData?.error) {
        throw new Error(aiData.error);
      }

      setProgress(100);
      setStage("Completed");
      setMessage(
        `AI generation completed. ${aiData.total} drafts prepared: ${aiData.true_false_count} True/False and ${aiData.mcq_count} MCQs. All drafts are pending Admin review.`
      );
    } catch (error) {
      if (worker) {
        await worker.terminate();
      }

      if (batchId) {
        await supabase
          .from("question_import_batches")
          .update({
            status: "failed",
            notes: error.message,
          })
          .eq("id", batchId);
      }

      setStage("Needs attention");
      setMessage(`Import error: ${error.message}`);
      console.error("PDF import error:", error);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <main className="import-page">
      <header className="import-heading">
        <h1>PDF QUESTION IMPORT</h1>
        <p>
          Upload your source PDF, extract text and prepare AI question drafts.
        </p>
      </header>

      <section className="import-card">
        <label className="import-label">OCR LANGUAGE</label>

        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={processing}
        >
          <option value="eng">Roman English</option>
          <option value="urd">Urdu</option>
          <option value="eng+urd">Roman English + Urdu</option>
        </select>

        <label className="import-label">SELECT SOURCE PDF</label>

        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setMessage("");
            setPreview("");
            setProgress(0);
            setPageInfo("");
            setStage("");
          }}
          disabled={processing}
        />

        {file && (
          <p className="selected-file">
            Selected file: {file.name}
          </p>
        )}

        <button
          className="ocr-button"
          onClick={startImport}
          disabled={processing || !file}
        >
          {processing ? "PROCESSING..." : "UPLOAD PDF & GENERATE DRAFTS"}
        </button>

        {stage && (
          <p className="ocr-stage">
            Current stage: <strong>{stage}</strong>
          </p>
        )}

        {pageInfo && <p>{pageInfo}</p>}

        {(processing || progress > 0) && (
          <div className="ocr-progress">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <strong>{progress}%</strong>
          </div>
        )}

        {message && (
          <p className="ocr-message">{message}</p>
        )}
      </section>

      {preview && (
        <section className="ocr-preview">
          <h2>EXTRACTED SOURCE TEXT</h2>
          <textarea
            value={preview}
            readOnly
            rows={18}
          />
        </section>
      )}
    </main>
  );
}
