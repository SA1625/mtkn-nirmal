import { useState } from "react";
import { supabase } from "./supabase";
import { createWorker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./QuestionImport.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const MAX_PDF_SIZE = 25 * 1024 * 1024;
const MAX_OCR_LENGTH = 120000;

function getSafeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function getAIErrorMessage(error) {
  try {
    if (error?.context && typeof error.context.json === "function") {
      const responseData = await error.context.json();

      if (responseData?.error) {
        return responseData.error;
      }
    }
  } catch {
    // Use the normal error message if the response cannot be read.
  }

  return error?.message || "AI generation request failed.";
}

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
      // 1. Verify logged-in administrator
      const {
        data: userData,
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !userData?.user) {
        throw new Error("Please login again.");
      }

      const user = userData.user;

      // 2. Upload original PDF
      setStage("Uploading source PDF");

      const filePath =
        `${user.id}/${Date.now()}-${getSafeFileName(file.name)}`;

      const {
        error: uploadError,
      } = await supabase.storage
        .from("question-bank-pdfs")
        .upload(filePath, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 3. Create import batch
      setStage("Creating import batch");

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
        })
        .select("id")
        .single();

      if (batchError) throw batchError;

      batchId = batch.id;

      // 4. Read PDF
      setStage("Reading PDF");

      const pdfData = new Uint8Array(
        await file.arrayBuffer()
      );

      const pdf = await pdfjsLib
        .getDocument({ data: pdfData })
        .promise;

      setPageInfo(`Total pages: ${pdf.numPages}`);

      const {
        error: pageCountError,
      } = await supabase
        .from("question_import_batches")
        .update({
          total_pages: pdf.numPages,
        })
        .eq("id", batchId);

      if (pageCountError) throw pageCountError;

      let completeText = "";

      // 5. Extract text page by page.
      // Digital PDFs use their existing text layer.
      // Scanned PDFs use Tesseract OCR.
      for (
        let pageNumber = 1;
        pageNumber <= pdf.numPages;
        pageNumber++
      ) {
        const page = await pdf.getPage(pageNumber);

        setMessage(
          `Processing page ${pageNumber} of ${pdf.numPages}`
        );

        const textContent = await page.getTextContent();

        const digitalText = textContent.items
          .filter((item) => typeof item.str === "string")
          .map((item) => item.str)
          .join(" ")
          .trim();

        let pageText = "";

        if (digitalText.length >= 40) {
          pageText = digitalText;
          setStage("Extracting digital PDF text");
        } else {
          setStage("Running OCR on scanned page");

          if (!worker) {
            setMessage("Loading OCR language data...");
            worker = await createWorker(language);
          }

          const viewport = page.getViewport({ scale: 2 });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            throw new Error(
              "Unable to create PDF rendering canvas."
            );
          }

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          await page.render({
            canvasContext: context,
            viewport,
          }).promise;

          const result = await worker.recognize(canvas);

          pageText = result.data.text || "";

          canvas.width = 0;
          canvas.height = 0;
        }

        completeText +=
          `\n\n--- PAGE ${pageNumber} ---\n\n${pageText}`;

        if (completeText.length > MAX_OCR_LENGTH) {
          throw new Error(
            "Extracted text exceeds the AI processing limit of 120,000 characters. Please split the PDF into smaller files."
          );
        }

        setPreview(completeText);
        setProgress(
          Math.round((pageNumber / pdf.numPages) * 100)
        );

        const {
          error: saveError,
        } = await supabase
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
        throw new Error(
          "Very little text was detected. Please use a clearer or better-quality PDF."
        );
      }

      // 7. Save completed OCR
      setStage("Saving extracted text");

      const {
        error: finishError,
      } = await supabase
        .from("question_import_batches")
        .update({
          status: "needs_review",
          ocr_text: completeText,
          processed_pages: pdf.numPages,
        })
        .eq("id", batchId);

      if (finishError) throw finishError;

      ocrCompleted = true;

      // 8. Generate AI question drafts
      setStage("Generating AI questions");
      setMessage(
        "OCR completed. AI is preparing question drafts. Please do not close this page."
      );

      const {
        data: aiData,
        error: aiError,
      } = await supabase.functions.invoke(
        "generate-quiz-drafts",
        {
          body: {
            batch_id: batchId,
          },
        }
      );

      if (aiError) {
        throw new Error(
          await getAIErrorMessage(aiError)
        );
      }

      if (!aiData || aiData.error || aiData.success === false) {
        throw new Error(
          aiData?.error ||
          aiData?.message ||
          "AI question generation was unsuccessful."
        );
      }

      // 9. Completed
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
          console.error(
            "OCR worker cleanup error:",
            workerError
          );
        }
      }

      if (batchId) {
        const batchStatus = ocrCompleted
          ? "needs_review"
          : "failed";

        const errorMessage =
          error?.message || "Unknown import error.";

        const { error: updateError } = await supabase
          .from("question_import_batches")
          .update({
            status: batchStatus,
            notes: `Import error: ${errorMessage.slice(0, 450)}`,
          })
          .eq("id", batchId);

        if (updateError) {
          console.error(
            "Unable to update import batch status:",
            updateError
          );
        }
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
        <h1>PDF QUESTION IMPORT</h1>
        <p>
          Upload your source PDF, extract text and prepare AI question drafts.
        </p>
      </header>

      <section className="import-card">
        <label className="import-label">
          OCR LANGUAGE
        </label>

        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={processing}
        >
          <option value="eng">
            English
          </option>

          <option value="urd">
            Urdu
          </option>

          <option value="eng+urd">
            English + Urdu
          </option>
        </select>

        <label className="import-label">
          SELECT SOURCE PDF
        </label>

        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(e) => {
            const selectedFile =
              e.target.files?.[0] || null;

            setFile(selectedFile);
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
          type="button"
          className="ocr-button"
          onClick={startImport}
          disabled={processing || !file}
        >
          {processing
            ? "PROCESSING..."
            : "UPLOAD PDF & GENERATE DRAFTS"}
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
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>

            <strong>{progress}%</strong>
          </div>
        )}

        {message && (
          <p className="ocr-message">
            {message}
          </p>
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