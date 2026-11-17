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

const EXISTING_ISLAMIC_BATCH =
  "c6b6585b-3590-4f06-bcf2-2eb57f029a48";

function getSafeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

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

async function recognizeFullPage(worker, canvas) {
  const result = await worker.recognize(canvas);
  return result?.data?.text || "";
}

async function recognizeHalf(worker, sourceCanvas, side) {
  const halfWidth = Math.floor(sourceCanvas.width / 2);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Unable to create OCR canvas.");

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
      const data = await error.context.json();
      if (data?.error) return data.error;
      if (data?.message) return data.message;
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
  const [extracting, setExtracting] = useState(false);
  const [preview, setPreview] = useState("");
  const [pageInfo, setPageInfo] = useState("");
  const [stage, setStage] = useState("");
  const [savedBatchId, setSavedBatchId] = useState(
    EXISTING_ISLAMIC_BATCH
  );
  const [extractionProgress, setExtractionProgress] = useState("");
  const [generatingBookDrafts, setGeneratingBookDrafts] = useState(false);
  const [draftProgress, setDraftProgress] = useState("");

  const isBookMode = importType === "islamic_book";

  const resetOutput = () => {
    setMessage("");
    setPreview("");
    setProgress(0);
    setPageInfo("");
    setStage("");
    setExtractionProgress("");
    setDraftProgress("");
  };

  // -------------------------------------------------------
  // ORIGINAL ISLAMIC BOOK Q&A EXTRACTION
  // -------------------------------------------------------

  const extractOriginalQA = async () => {
    if (!savedBatchId.trim()) {
      setMessage("Please enter the Islamic book batch ID.");
      return;
    }

    if (!window.confirm(
      "Start or resume original Sawal/Jawab extraction from the saved Islamic book OCR?"
    )) {
      return;
    }

    setExtracting(true);
    setMessage("");
    setExtractionProgress("");
    setStage("Starting original book extraction");

    try {
      let chunkIndex = 0;
      let finished = false;
      let totalExtracted = 0;
      let totalChunks = 0;

      while (!finished) {
        setStage(`Extracting original book section ${chunkIndex + 1}`);

        const { data, error } = await supabase.functions.invoke(
          "extract-islamic-book-qa",
          {
            body: {
              batch_id: savedBatchId.trim(),
              chunk_index: chunkIndex,
            },
          }
        );

        if (error) {
          throw new Error(await getAIErrorMessage(error));
        }

        if (!data || data.success === false) {
          throw new Error(
            data?.error || "Original book extraction failed."
          );
        }

        totalChunks = data.total_chunks || totalChunks;
        totalExtracted = data.extracted_count ?? totalExtracted;
        finished = Boolean(data.complete);

        setExtractionProgress(
          `Completed ${data.completed_chunks ?? chunkIndex + 1} of ${totalChunks} sections · ${totalExtracted} original Q&A pairs saved`
        );

        setProgress(
          totalChunks
            ? Math.round(
                ((data.completed_chunks ?? chunkIndex + 1) /
                  totalChunks) * 100
              )
            : 0
        );

        if (!finished) {
          chunkIndex += 1;
        }
      }

      setStage("Original extraction completed");
      setMessage(
        `Success! ${totalExtracted} original Sawal/Jawab pairs have been saved for Admin review.`
      );
    } catch (error) {
      console.error("Original Q&A extraction error:", error);
      setStage("Extraction paused — safe to resume");
      setMessage(
        `Extraction paused: ${error?.message || "Unknown error"}. Press Resume Extraction to continue.`
      );
    } finally {
      setExtracting(false);
    }
  };

  // -------------------------------------------------------
  // CONVERT SAVED ORIGINAL BOOK Q&A INTO REVIEW DRAFTS
  // -------------------------------------------------------

  const generateBookDrafts = async () => {
    if (!savedBatchId.trim()) {
      setMessage("Islamic book batch ID is missing.");
      return;
    }

    if (!window.confirm(
      "Generate MCQ and True/False review drafts from the saved original 474 Q&A pairs? This will NOT publish questions to the quiz bank."
    )) {
      return;
    }

    setGeneratingBookDrafts(true);
    setMessage("");
    setDraftProgress("Preparing original book Q&A...");
    setStage("Generating review drafts");

    try {
      let startIndex = 0;
      let totalPairs = 0;
      let totalInserted = 0;
      let completed = false;

      while (!completed) {
        const { data, error } = await supabase.functions.invoke(
          "generate-islamic-book-drafts",
          {
            body: {
              batch_id: savedBatchId.trim(),
              start_index: startIndex,
              limit: 5,
            },
          }
        );

        if (error) {
          throw new Error(await getAIErrorMessage(error));
        }

        if (!data || data.success === false || data.error) {
          throw new Error(
            data?.error || "Islamic book draft generation failed."
          );
        }

        totalPairs = data.total_source_pairs ?? totalPairs;
        totalInserted += Number(data.drafts_inserted || 0);
        completed = Boolean(data.complete);

        const nextIndex = Number(data.next_start_index);

        if (
          !Number.isFinite(nextIndex) ||
          (nextIndex <= startIndex && !completed)
        ) {
          throw new Error(
            "The server did not return a valid next batch position."
          );
        }

        startIndex = nextIndex;

        const percent = totalPairs
          ? Math.min(100, Math.round((startIndex / totalPairs) * 100))
          : completed
            ? 100
            : 0;

        setProgress(percent);
        setDraftProgress(
          `${Math.min(startIndex, totalPairs)} of ${totalPairs} original Q&A pairs processed · ${totalInserted} new drafts saved`
        );
      }

      setProgress(100);
      setStage("Draft generation completed");
      setMessage(
        `Success! Original Q&A processing completed. ${totalInserted} new MCQ/True-False drafts were saved for Admin review. No questions were published to the quiz bank.`
      );
    } catch (error) {
      console.error("Islamic book draft generation error:", error);
      setStage("Draft generation paused — safe to resume");
      setMessage(
        `Draft generation paused: ${error?.message || "Unknown error"}. Press Generate Drafts again to resume; previously saved drafts will be skipped.`
      );
    } finally {
      setGeneratingBookDrafts(false);
    }
  };

  // -------------------------------------------------------
  // EXISTING PDF IMPORT WORKFLOW
  // -------------------------------------------------------

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
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;

      const user = userData?.user;
      if (!user) throw new Error("Please login again.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      if (!["admin", "super_admin"].includes(profile?.role)) {
        throw new Error("Only an Admin or Super Admin can import PDFs.");
      }

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

      setStage("Creating import batch");

      const initialNotes = isBookMode
        ? `${importTag}; Original Sawal/Jawab extraction pending.`
        : `${importTag}; General Knowledge AI draft generation.`;

      const { data: batch, error: batchError } = await supabase
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

      if (isBookMode) {
        setSavedBatchId(batch.id);
      }

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

              const viewport = page.getViewport({ scale: 2 });
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d");

              if (!context) {
                throw new Error("Unable to create PDF rendering canvas.");
              }

              canvas.width = Math.ceil(viewport.width);
              canvas.height = Math.ceil(viewport.height);

              try {
                await page.render({
                  canvasContext: context,
                  viewport,
                }).promise;

                if (needsLeftOCR) {
                  leftText = await recognizeHalf(worker, canvas, "left");
                }

                if (needsRightOCR) {
                  rightText = await recognizeHalf(worker, canvas, "right");
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
            let fullPageText = getFullPageText(items);

            if (fullPageText.length < 40) {
              setStage("Running OCR on full GK page");

              if (!worker) {
                setMessage("Loading OCR language data...");
                worker = await createWorker(language);
              }

              const viewport = page.getViewport({ scale: 2 });
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d");

              if (!context) {
                throw new Error("Unable to create PDF rendering canvas.");
              }

              canvas.width = Math.ceil(viewport.width);
              canvas.height = Math.ceil(viewport.height);

              try {
                await page.render({
                  canvasContext: context,
                  viewport,
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
                ? "Book text exceeds 600,000 characters."
                : "Extracted GK text exceeds 120,000 characters."
            );
          }

          setPreview(completeText);

          setProgress(
            Math.round((pageNumber / pdfDocument.numPages) * 100)
          );

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

      if (worker) {
        await worker.terminate();
        worker = null;
      }

      if (completeText.trim().length < 100) {
        throw new Error("Very little text was extracted from the PDF.");
      }

      setStage("Saving extracted source");

      const completedNotes = isBookMode
        ? `${importTag}; OCR completed. Original Sawal/Jawab extraction pending.`
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

      if (isBookMode) {
        setSavedBatchId(batchId);
        setProgress(100);
        setStage("Book source saved");
        setMessage(
          `Original book saved successfully. Batch ID: ${batchId}. Now use the Extract Original Sawal/Jawab button below.`
        );
        return;
      }

      // Existing General Knowledge generator remains unchanged.
      setStage("Generating GK question drafts");
      setMessage(
        "OCR completed. Gemini is preparing General Knowledge drafts."
      );

      const { data: aiData, error: aiError } =
        await supabase.functions.invoke("generate-quiz-drafts", {
          body: { batch_id: batchId },
        });

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
        `AI generation completed successfully! ${aiData.total} drafts prepared: ${aiData.true_false_count} True/False and ${aiData.mcq_count} MCQs.`
      );
    } catch (error) {
      console.error("PDF import error:", error);

      if (worker) {
        try {
          await worker.terminate();
        } catch (workerError) {
          console.error(workerError);
        }
      }

      if (batchId) {
        const batchStatus = ocrCompleted ? "needs_review" : "failed";
        const detail = (
          error?.message || "Unknown import error."
        ).slice(0, 350);

        await supabase
          .from("question_import_batches")
          .update({
            status: batchStatus,
            notes: `${importTag}; Import failed: ${detail}`,
          })
          .eq("id", batchId);
      } else if (uploadedFilePath) {
        await supabase.storage
          .from("question-bank-pdfs")
          .remove([uploadedFilePath]);
      }

      setStage("Needs attention");
      setMessage(
        `Import error: ${error?.message || "Something went wrong."}`
      );
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (error) {
          console.error(error);
        }
      }

      if (pdfDocument) {
        try {
          await pdfDocument.destroy();
        } catch (error) {
          console.error(error);
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
          disabled={processing || extracting || generatingBookDrafts}
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
          disabled={processing || extracting || generatingBookDrafts}
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
          disabled={processing || extracting || generatingBookDrafts}
        />

        {file && (
          <p className="selected-file">
            Selected file: {file.name}
          </p>
        )}

        {isBookMode && (
          <>
            <p className="ocr-message">
              Original book mode extracts the existing Sawal/Jawab.
              It does not create AI-written religious questions or MCQ options.
            </p>

            <label className="import-label" htmlFor="saved-batch-id">
              EXISTING ISLAMIC BOOK BATCH ID
            </label>

            <input
              id="saved-batch-id"
              type="text"
              value={savedBatchId}
              onChange={(event) => setSavedBatchId(event.target.value)}
              disabled={processing || extracting || generatingBookDrafts}
            />

            <button
              type="button"
              className="ocr-button"
              onClick={extractOriginalQA}
              disabled={
                processing ||
                extracting ||
                generatingBookDrafts ||
                !savedBatchId.trim()
              }
            >
              {extracting
                ? "EXTRACTING ORIGINAL SAWAL/JAWAB..."
                : "EXTRACT / RESUME ORIGINAL SAWAL-JAWAB"}
            </button>

            {extractionProgress && (
              <p className="ocr-stage">{extractionProgress}</p>
            )}

            <button
              type="button"
              className="ocr-button"
              onClick={generateBookDrafts}
              disabled={
                processing ||
                extracting ||
                generatingBookDrafts ||
                !savedBatchId.trim()
              }
            >
              {generatingBookDrafts
                ? "GENERATING REVIEW DRAFTS..."
                : "GENERATE MCQ + TRUE/FALSE REVIEW DRAFTS"}
            </button>

            {draftProgress && (
              <p className="ocr-stage" role="status">
                {draftProgress}
              </p>
            )}

            <p className="ocr-message">
              This step converts the saved original Q&A into pending review drafts.
              It does not approve or publish questions.
            </p>
          </>
        )}

        <button
          type="button"
          className="ocr-button"
          onClick={startImport}
          disabled={processing || extracting || generatingBookDrafts || !file}
        >
          {processing
            ? "PROCESSING..."
            : isBookMode
              ? "UPLOAD NEW ISLAMIC BOOK & SAVE SOURCE"
              : "UPLOAD PDF & GENERATE GK DRAFTS"}
        </button>

        {stage && (
          <p className="ocr-stage">
            Current stage: <strong>{stage}</strong>
          </p>
        )}

        {pageInfo && <p>{pageInfo}</p>}

        {(processing || extracting || generatingBookDrafts || progress > 0) && (
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
          <textarea value={preview} readOnly rows={18} />
        </section>
      )}
    </main>
  );
}