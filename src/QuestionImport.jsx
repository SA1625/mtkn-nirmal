import { useState } from "react";
import { supabase } from "./supabase";
import { createWorker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./QuestionImport.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const MAX_PDF_SIZE = 25 * 1024 * 1024;
const MAX_GK_OCR_LENGTH = 120000;
const MAX_BOOK_OCR_LENGTH = 600000;

function getSafeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Restore natural reading order for the two book pages
// printed side-by-side in one PDF page.
function getSideText(items, side, pageWidth) {
  const middle = pageWidth / 2;

  const selected = items
    .filter((item) => typeof item.str === "string" && item.str.trim())
    .map((item) => ({
      text: item.str.trim(),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
    }))
    .filter((item) =>
      side === "left" ? item.x < middle : item.x >= middle
    )
    .sort((a, b) => {
      if (Math.abs(b.y - a.y) > 3) return b.y - a.y;
      return a.x - b.x;
    });

  const lines = [];

  for (const item of selected) {
    let line = lines.find(
      (entry) => Math.abs(entry.y - item.y) <= 3
    );

    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }

    line.items.push(item);
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" ")
    )
    .join("\n")
    .trim();
}

async function recognizeHalf(worker, sourceCanvas, side) {
  const halfWidth = Math.floor(sourceCanvas.width / 2);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create OCR canvas.");
  }

  canvas.width = side === "left"
    ? halfWidth
    : sourceCanvas.width - halfWidth;

  canvas.height = sourceCanvas.height;

  context.drawImage(
    sourceCanvas,
    side === "left" ? 0 : halfWidth,
    0,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const result = await worker.recognize(canvas);
  const text = result.data.text || "";

  canvas.width = 0;
  canvas.height = 0;

  return text;
}

async function getAIErrorMessage(error) {
  try {
    if (error?.context && typeof error.context.json === "function") {
      const responseData = await error.context.json();

      if (responseData?.error) return responseData.error;
    }
  } catch {
    // Use normal error message.
  }

  return error?.message || "AI generation request failed.";
}

export default function QuestionImport() {
  const [file, setFile] = useState(null);

  const [importType, setImportType] = useState("gk");

  const [language, setLanguage] = useState("eng+urd");

  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState("");
  const [pageInfo, setPageInfo] = useState("");
  const [stage, setStage] = useState("");

  const isBookMode = importType === "islamic_book";

  const startImport = async () => {
    if (!file) {
      setMessage("Please select a PDF file first.");
      return;
    }

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setMessage("Only PDF files are allowed.");
      return;
    }

    if (file.size > MAX_PDF_SIZE) {
      setMessage("PDF is too large. Maximum allowed size is 25 MB.");
      return;
    }

    setProcessing(true);
    setProgress(0);
    setPreview("");
    setMessage("");
    setPageInfo("");
    setStage("Preparing PDF");

    let worker = null;
    let batchId = null;
    let ocrCompleted = false;

    try {
      // 1. Verify administrator
      const {
        data: userData,
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !userData?.user) {
        throw new Error("Please login again.");
      }

      const user = userData.user;

      // 2. Upload original PDF
      setStage("Uploading original PDF");

      const filePath =
        `${user.id}/${Date.now()}-${getSafeFileName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("question-bank-pdfs")
        .upload(filePath, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 3. Create import batch
      setStage("Creating import batch");

      const notes = isBookMode
        ? "IMPORT_TYPE=ISLAMIC_BOOK_QA; Original Q&A extraction pending."
        : "IMPORT_TYPE=GENERAL_KNOWLEDGE; AI draft generation.";

      const {
        data: batch,
        error: batchError,
      } = await supabase
        .from("question_import_batches")
        .insert({
          file_name: file.name,
          file_path: filePath,
          uploaded_by: user.id,
          status: "processing",
          ocr_language: language,
          notes,
        })
        .select("id")
        .single();

      if (batchError) throw batchError;

      batchId = batch.id;

      // 4. Read PDF
      setStage("Reading PDF");

      const pdfData = new Uint8Array(await file.arrayBuffer());

      const pdf = await pdfjsLib.getDocument({
        data: pdfData,
      }).promise;

      setPageInfo(`Total PDF pages: ${pdf.numPages}`);

      const { error: pageCountError } = await supabase
        .from("question_import_batches")
        .update({ total_pages: pdf.numPages })
        .eq("id", batchId);

      if (pageCountError) throw pageCountError;

      let completeText = "";

      // 5. Extract each spread as separate left/right book pages.
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);

        setMessage(
          `Extracting PDF page ${pageNumber} of ${pdf.numPages}`
        );

        // Text-item coordinates are in PDF page units. Use scale 1 for the
        // text split and scale 2 only for the rendered OCR canvas.
        const textViewport = page.getViewport({ scale: 1 });
        const renderViewport = page.getViewport({ scale: 2 });

        const textContent = await page.getTextContent();

        const leftDigital = getSideText(
          textContent.items,
          "left",
          textViewport.width
        );

        const rightDigital = getSideText(
          textContent.items,
          "right",
          textViewport.width
        );

        let leftText = leftDigital;
        let rightText = rightDigital;

        // Run OCR if a side has insufficient selectable text.
        const needsOCR =
          leftText.length < 40 || rightText.length < 40;

        if (needsOCR) {
          setStage("Running OCR on book pages");

          if (!worker) {
            setMessage("Loading OCR language data...");
            worker = await createWorker(language);
          }

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            throw new Error("Unable to create PDF rendering canvas.");
          }

          canvas.width = Math.ceil(renderViewport.width);
          canvas.height = Math.ceil(renderViewport.height);

          await page.render({
            canvasContext: context,
            viewport: renderViewport,
          }).promise;

          if (leftText.length < 40) {
            leftText = await recognizeHalf(worker, canvas, "left");
          }

          if (rightText.length < 40) {
            rightText = await recognizeHalf(worker, canvas, "right");
          }

          canvas.width = 0;
          canvas.height = 0;
        }

        const pageText =
          `\n\n--- PDF PAGE ${pageNumber} LEFT BOOK PAGE ---\n` +
          `${leftText}\n` +
          `\n--- PDF PAGE ${pageNumber} RIGHT BOOK PAGE ---\n` +
          `${rightText}`;

        completeText += pageText;

        const maximum = isBookMode
          ? MAX_BOOK_OCR_LENGTH
          : MAX_GK_OCR_LENGTH;

        if (completeText.length > maximum) {
          throw new Error(
            isBookMode
              ? "Book text exceeds 600,000 characters. The PDF must be processed in smaller page ranges."
              : "Extracted text exceeds 120,000 characters. Please split the PDF."
          );
        }

        setPreview(completeText);

        setProgress(
          Math.round((pageNumber / pdf.numPages) * 100)
        );

        // Save progress after every PDF page.
        const { error: saveError } = await supabase
          .from("question_import_batches")
          .update({
            processed_pages: pageNumber,
            ocr_text: completeText,
          })
          .eq("id", batchId);

        if (saveError) throw saveError;

        page.cleanup();
      }

      // 6. Stop OCR worker
      if (worker) {
        await worker.terminate();
        worker = null;
      }

      if (completeText.trim().length < 100) {
        throw new Error("Very little text was extracted from the PDF.");
      }

      // 7. Save completed source text
      setStage("Saving extracted source");

      const finalNotes = isBookMode
        ? "IMPORT_TYPE=ISLAMIC_BOOK_QA; OCR completed. Ready for original topic-wise Sawal/Jawab extraction. General AI generation skipped."
        : "IMPORT_TYPE=GENERAL_KNOWLEDGE; OCR completed. Ready for AI question generation.";

      const { error: finishError } = await supabase
        .from("question_import_batches")
        .update({
          status: "needs_review",
          ocr_text: completeText,
          processed_pages: pdf.numPages,
          notes: finalNotes,
        })
        .eq("id", batchId);

      if (finishError) throw finishError;

      ocrCompleted = true;

      // 8. Islamic book mode: NEVER call the GK generator.
      if (isBookMode) {
        setProgress(100);
        setStage("Book source saved");

        setMessage(
          `Original book saved successfully. ${pdf.numPages} PDF pages extracted into the import batch. General Knowledge AI generation was skipped. Next step: topic-wise original Sawal/Jawab extraction. Batch ID: ${batchId}`
        );

        return;
      }

      // 9. Existing GK mode
      setStage("Generating GK question drafts");

      setMessage(
        "OCR completed. Gemini is preparing General Knowledge drafts."
      );

      const {
        data: aiData,
        error: aiError,
      } = await supabase.functions.invoke(
        "generate-quiz-drafts",
        {
          body: { batch_id: batchId },
        }
      );

      if (aiError) {
        throw new Error(await getAIErrorMessage(aiError));
      }

      if (!aiData || aiData.error || aiData.success === false) {
        throw new Error(
          aiData?.error ||
          aiData?.message ||
          "AI question generation was unsuccessful."
        );
      }

      setProgress(100);
      setStage("Completed");

      setMessage(
        `AI generation completed successfully! ${aiData.total} drafts prepared: ${aiData.true_false_count} True/False and ${aiData.mcq_count} MCQs. All drafts are pending Admin review.`
      );

    } catch (error) {
      console.error("PDF import error:", error);

      if (worker) {
        try {
          await worker.terminate();
        } catch (workerError) {
          console.error("OCR worker cleanup error:", workerError);
        }
      }

      if (batchId) {
        const batchStatus = ocrCompleted
          ? "needs_review"
          : "failed";

        const errorMessage =
          error?.message || "Unknown import error.";

        await supabase
          .from("question_import_batches")
          .update({
            status: batchStatus,
            notes: `Import error: ${errorMessage.slice(0, 450)}`,
          })
          .eq("id", batchId);
      }

      setStage("Needs attention");

      setMessage(
        `Import error: ${error?.message || "Something went wrong."}`
      );

    } finally {
      setProcessing(false);
    }
  };

  return (
    <main className="import-page">
      <header className="import-heading">
        <h1>QUESTION BANK IMPORT</h1>
        <p>
          Import General Knowledge papers or original Islamic book questions.
        </p>
      </header>

      <section className="import-card">
        <label className="import-label">
          SELECT IMPORT TYPE
        </label>

        <select
          value={importType}
          onChange={(e) => {
            setImportType(e.target.value);
            setMessage("");
            setPreview("");
            setProgress(0);
            setStage("");
          }}
          disabled={processing}
        >
          <option value="gk">
            General Knowledge — AI Draft Generation
          </option>

          <option value="islamic_book">
            Islamic Book — Original Sawal & Jawab
          </option>
        </select>

        <label className="import-label">
          OCR LANGUAGE
        </label>

        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={processing}
        >
          <option value="eng">English</option>
          <option value="urd">Urdu</option>
          <option value="eng+urd">English + Urdu</option>
        </select>

        <label className="import-label">
          SELECT SOURCE PDF
        </label>

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

        {isBookMode && (
          <p className="ocr-message">
            Islamic Book mode preserves original Sawal, Jawab and topics.
            It will NOT run the General Knowledge Gemini generator.
          </p>
        )}

        <button
          type="button"
          className="ocr-button"
          onClick={startImport}
          disabled={processing || !file}
        >
          {processing
            ? "PROCESSING..."
            : isBookMode
              ? "UPLOAD ISLAMIC BOOK & EXTRACT SOURCE"
              : "UPLOAD PDF & GENERATE GK DRAFTS"}
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