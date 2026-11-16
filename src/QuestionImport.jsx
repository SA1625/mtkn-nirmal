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

/**
 * Extract one side of a two-page book spread.
 */
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
    let line = lines.find((entry) => Math.abs(entry.y - item.y) <= 3);

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

/**
 * General Knowledge PDFs are usually single-page layouts.
 * Preserve their original PDF.js reading order.
 */
function getFullPageText(items) {
  return (items || [])
    .map((item) => {
      const text = typeof item.str === "string" ? item.str : "";
      if (!text.trim()) return "";
      return `${text}${item.hasEOL ? "\n" : " "}`;
    })
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function recognizeFullPage(worker, sourceCanvas) {
  const result = await worker.recognize(sourceCanvas);
  return result?.data?.text || "";
}

async function recognizeHalf(worker, sourceCanvas, side) {
  const halfWidth = Math.floor(sourceCanvas.width / 2);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create OCR canvas.");
  }

  canvas.width =
    side === "left" ? halfWidth : sourceCanvas.width - halfWidth;
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

  try {
    const result = await worker.recognize(canvas);
    return result?.data?.text || "";
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function getAIErrorMessage(error) {
  try {
    if (error?.context && typeof error.context.json === "function") {
      const responseData = await error.context.json();
      if (responseData?.error) return responseData.error;
      if (responseData?.message) return responseData.message;
    }
  } catch {
    // Use the normal error message.
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

  const resetOutput = () => {
    setMessage("");
    setPreview("");
    setProgress(0);
    setPageInfo("");
    setStage("");
  };

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
    setStage("Checking administrator access");

    let worker = null;
    let pdfDocument = null;
    let batchId = null;
    let uploadedFilePath = null;
    let ocrCompleted = false;

    const importTag = isBookMode
      ? "IMPORT_TYPE=ISLAMIC_BOOK_QA"
      : "IMPORT_TYPE=GENERAL_KNOWLEDGE";

    try {
      // 1. Verify login and administrator role.
      const {
        data: userData,
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      const user = userData?.user;

      if (!user) {
        throw new Error("Please login again.");
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      if (!["admin", "super_admin"].includes(profile?.role)) {
        throw new Error("Only an Admin or Super Admin can import PDFs.");
      }

      // 2. Upload the original PDF.
      setStage("Uploading original PDF");

      uploadedFilePath =
        `${user.id}/${Date.now()}-${getSafeFileName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("question-bank-pdfs")
        .upload(uploadedFilePath, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 3. Create import batch.
      setStage("Creating import batch");

      const initialNotes = isBookMode
        ? `${importTag}; Original Sawal/Jawab extraction pending.`
        : `${importTag}; General Knowledge AI draft generation.`;

      const {
        data: batch,
        error: batchError,
      } = await supabase
        .from("question_import_batches")
        .insert({
          file_name: file.name,
          file_path: uploadedFilePath,
          uploaded_by: user.id,
          status: "processing",
          ocr_language: language,
          notes: initialNotes,
        })
        .select("id")
        .single();

      if (batchError) throw batchError;

      batchId = batch.id;

      // 4. Read PDF.
      setStage("Reading PDF");

      const pdfData = new Uint8Array(await file.arrayBuffer());

      pdfDocument = await pdfjsLib.getDocument({
        data: pdfData,
      }).promise;

      if (!pdfDocument.numPages) {
        throw new Error("The selected PDF does not contain any pages.");
      }

      setPageInfo(`Total PDF pages: ${pdfDocument.numPages}`);

      const { error: pageCountError } = await supabase
        .from("question_import_batches")
        .update({ total_pages: pdfDocument.numPages })
        .eq("id", batchId);

      if (pageCountError) throw pageCountError;

      let completeText = "";

      // 5. Extract each PDF page.
      for (
        let pageNumber = 1;
        pageNumber <= pdfDocument.numPages;
        pageNumber += 1
      ) {
        const page = await pdfDocument.getPage(pageNumber);

        try {
          setMessage(
            `Extracting PDF page ${pageNumber} of ${pdfDocument.numPages}`
          );

          const textContent = await page.getTextContent();
          const items = textContent.items || [];

          let pageText = "";

          if (isBookMode) {
            // Islamic book PDF: treat each PDF page as a two-page spread.
            const textViewport = page.getViewport({ scale: 1 });

            let leftText = getSideText(
              items,
              "left",
              textViewport.width
            );

            let rightText = getSideText(
              items,
              "right",
              textViewport.width
            );

            const needsLeftOCR = leftText.length < 40;
            const needsRightOCR = rightText.length < 40;

            if (needsLeftOCR || needsRightOCR) {
              setStage("Running OCR on book pages");

              if (!worker) {
                setMessage("Loading OCR language data...");
                worker = await createWorker(language);
              }

              const renderViewport = page.getViewport({ scale: 2 });
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d");

              if (!context) {
                throw new Error("Unable to create PDF rendering canvas.");
              }

              canvas.width = Math.ceil(renderViewport.width);
              canvas.height = Math.ceil(renderViewport.height);

              try {
                await page.render({
                  canvasContext: context,
                  viewport: renderViewport,
                }).promise;

                if (needsLeftOCR) {
                  leftText = await recognizeHalf(
                    worker,
                    canvas,
                    "left"
                  );
                }

                if (needsRightOCR) {
                  rightText = await recognizeHalf(
                    worker,
                    canvas,
                    "right"
                  );
                }
              } finally {
                canvas.width = 0;
                canvas.height = 0;
              }
            }

            pageText =
              `\n\n--- PDF PAGE ${pageNumber} LEFT BOOK PAGE ---\n` +
              `${leftText}\n` +
              `\n--- PDF PAGE ${pageNumber} RIGHT BOOK PAGE ---\n` +
              `${rightText}`;
          } else {
            // General Knowledge: extract the whole page, never split it.
            let fullPageText = getFullPageText(items);

            if (fullPageText.length < 40) {
              setStage("Running OCR on full GK page");

              if (!worker) {
                setMessage("Loading OCR language data...");
                worker = await createWorker(language);
              }

              const renderViewport = page.getViewport({ scale: 2 });
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d");

              if (!context) {
                throw new Error("Unable to create PDF rendering canvas.");
              }

              canvas.width = Math.ceil(renderViewport.width);
              canvas.height = Math.ceil(renderViewport.height);

              try {
                await page.render({
                  canvasContext: context,
                  viewport: renderViewport,
                }).promise;

                fullPageText = await recognizeFullPage(worker, canvas);
              } finally {
                canvas.width = 0;
                canvas.height = 0;
              }
            }

            pageText =
              `\n\n--- PDF PAGE ${pageNumber} ---\n${fullPageText}`;
          }

          completeText += pageText;

          const maximum = isBookMode
            ? MAX_BOOK_OCR_LENGTH
            : MAX_GK_OCR_LENGTH;

          if (completeText.length > maximum) {
            throw new Error(
              isBookMode
                ? "Book text exceeds 600,000 characters. Process the PDF in smaller page ranges."
                : "Extracted GK text exceeds 120,000 characters. Please split the PDF."
            );
          }

          setPreview(completeText);

          setProgress(
            Math.round((pageNumber / pdfDocument.numPages) * 100)
          );

          // Save progress after every page.
          const { error: saveError } = await supabase
            .from("question_import_batches")
            .update({
              processed_pages: pageNumber,
              ocr_text: completeText,
            })
            .eq("id", batchId);

          if (saveError) throw saveError;
        } finally {
          page.cleanup();
        }
      }

      // 6. Stop OCR worker.
      if (worker) {
        await worker.terminate();
        worker = null;
      }

      if (completeText.trim().length < 100) {
        throw new Error("Very little text was extracted from the PDF.");
      }

      // 7. Save completed source text.
      setStage("Saving extracted source");

      const completedNotes = isBookMode
        ? `${importTag}; OCR completed. Original topic-wise Sawal/Jawab extraction is the next step. General Knowledge AI generation skipped.`
        : `${importTag}; OCR completed. Ready for General Knowledge AI draft generation.`;

      const { error: finishError } = await supabase
        .from("question_import_batches")
        .update({
          status: "needs_review",
          ocr_text: completeText,
          processed_pages: pdfDocument.numPages,
          notes: completedNotes,
        })
        .eq("id", batchId);

      if (finishError) throw finishError;

      ocrCompleted = true;

      // 8. Islamic Book: save the source only.
      // No AI-generated religious questions or answers are created.
      if (isBookMode) {
        setProgress(100);
        setStage("Book source saved");

        setMessage(
          `Original book source saved successfully. ${pdfDocument.numPages} PDF pages were extracted. No AI-generated questions were created. The original Sawal/Jawab extraction step is still pending. Batch ID: ${batchId}`
        );

        return;
      }

      // 9. Existing General Knowledge Gemini generation.
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
        const batchStatus = ocrCompleted ? "needs_review" : "failed";
        const detail = (
          error?.message || "Unknown import error."
        ).slice(0, 350);

        const errorNotes = ocrCompleted
          ? `${importTag}; OCR completed, but the next processing step failed: ${detail}`
          : `${importTag}; Import failed: ${detail}`;

        const { error: updateError } = await supabase
          .from("question_import_batches")
          .update({
            status: batchStatus,
            notes: errorNotes,
          })
          .eq("id", batchId);

        if (updateError) {
          console.error("Unable to update failed import batch:", updateError);
        }
      } else if (uploadedFilePath) {
        // Remove an orphan PDF if batch creation itself failed.
        const { error: removeError } = await supabase.storage
          .from("question-bank-pdfs")
          .remove([uploadedFilePath]);

        if (removeError) {
          console.error("Unable to remove orphaned PDF:", removeError);
        }
      }

      setStage("Needs attention");

      setMessage(
        `Import error: ${error?.message || "Something went wrong."}`
      );
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (workerError) {
          console.error("OCR worker cleanup error:", workerError);
        }
      }

      if (pdfDocument) {
        try {
          await pdfDocument.destroy();
        } catch (pdfError) {
          console.error("PDF cleanup error:", pdfError);
        }
      }

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
        <label className="import-label" htmlFor="import-type">
          SELECT IMPORT TYPE
        </label>

        <select
          id="import-type"
          value={importType}
          onChange={(event) => {
            setImportType(event.target.value);
            resetOutput();
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

        <label className="import-label" htmlFor="ocr-language">
          OCR LANGUAGE
        </label>

        <select
          id="ocr-language"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          disabled={processing}
        >
          <option value="eng">English</option>
          <option value="urd">Urdu</option>
          <option value="eng+urd">English + Urdu</option>
        </select>

        <label className="import-label" htmlFor="source-pdf">
          SELECT SOURCE PDF
        </label>

        <input
          id="source-pdf"
          type="file"
          accept=".pdf,application/pdf"
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            resetOutput();
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
            Islamic Book mode saves the original source text and skips the
            General Knowledge Gemini generator. It does not yet convert the
            Sawal/Jawab into exam questions.
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
          <p className="ocr-message" role="status">
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