
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, FileUp, FileText, ShieldCheck,
  Search, CheckCircle, AlertCircle
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "./supabase";
import "./QuestionImport.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function parseQuestions(text) {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const blocks = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s*(.+)$/);

    if (match) {
      if (current) blocks.push(current);
      current = {
        number: Number(match[1]),
        question: match[2],
        answer: ""
      };
    } else if (current) {
      const answerMatch = line.match(/^Correct answer:\s*(.*)$/i);

      if (answerMatch) {
        current.answer = answerMatch[1].trim();
      } else {
        current.question += " " + line;
      }
    }
  }

  if (current) blocks.push(current);

  return blocks
    .filter(item => item.question && item.answer)
    .map((item, index) => {
      const answer = item.answer.trim();
      const isTrueFalse = /^(true|false)$/i.test(answer);

      return {
        number: item.number || index + 1,
        question_text: item.question.trim(),
        correct_answer: answer,
        question_type: isTrueFalse ? "true_false" : "mcq",
        section: isTrueFalse ? "A" : "B",
        options: null,
        topic: "General Knowledge",
        difficulty: "Foundation",
        explanation: null,
        review_status: "pending"
      };
    });
}

export default function QuestionImport() {
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [batchId, setBatchId] = useState(null);

  const extractPdf = async () => {
    if (!file) {
      setError("Please select a PDF file.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    setQuestions([]);
    setBatchId(null);

    try {
      if (file.type !== "application/pdf" &&
          !file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Only PDF files are accepted.");
      }

      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

      let fullText = "";

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();

        const pageText = content.items
          .map(item => item.str)
          .join("\n");

        fullText += "\n" + pageText;
      }

      const extracted = parseQuestions(fullText);

      if (!extracted.length) {
        throw new Error(
          "No question-and-answer pairs were detected. The PDF may be scanned or use a different layout."
        );
      }

      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) {
        throw new Error("Please login again as administrator.");
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath =
        `${userData.user.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("question-bank-pdfs")
        .upload(filePath, file, {
          contentType: "application/pdf",
          upsert: false
        });

      if (uploadError) throw uploadError;

      const tfCount = extracted.filter(
        q => q.question_type === "true_false"
      ).length;

      const mcqCount = extracted.length - tfCount;

      const { data: batch, error: batchError } = await supabase
        .from("question_import_batches")
        .insert({
          file_name: file.name,
          file_path: filePath,
          status: "needs_review",
          uploaded_by: userData.user.id,
          extracted_questions: extracted,
          total_questions: extracted.length,
          true_false_count: tfCount,
          mcq_count: mcqCount,
          notes: "Extracted from PDF. Awaiting review and MCQ option generation."
        })
        .select("id")
        .single();

      if (batchError) throw batchError;

      setQuestions(extracted);
      setBatchId(batch.id);
      setMessage(
        "PDF extracted successfully. Review the detected questions below."
      );
    } catch (err) {
      setError(err.message || "PDF extraction failed.");
    } finally {
      setBusy(false);
    }
  };

  const tfCount = questions.filter(
    q => q.question_type === "true_false"
  ).length;

  const mcqCount = questions.length - tfCount;

  return (
    <main className="qi-page">
      <div className="qi-wrap">

        <button
          className="qi-back"
          onClick={() => navigate("/admin/questions")}
        >
          <ArrowLeft size={18} />
          Back to Question Bank
        </button>

        <header className="qi-head">
          <span>ADMINISTRATION</span>
          <h1>PDF QUESTION IMPORT</h1>
          <p>Extract and review questions from a PDF question bank.</p>
        </header>

        <section className="qi-card">
          <div className="qi-icon">
            <FileText size={30} />
          </div>

          <h2>Upload Question Bank PDF</h2>

          <p>
            Select a PDF containing numbered questions and their correct answers.
          </p>

          <label className="qi-drop">
            <FileUp size={25} />
            <strong>{file ? file.name : "Choose PDF file"}</strong>
            <small>PDF format only</small>

            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={e => {
                setFile(e.target.files?.[0] || null);
                setQuestions([]);
                setMessage("");
                setError("");
                setBatchId(null);
              }}
            />
          </label>

          <button
            className="qi-upload"
            onClick={extractPdf}
            disabled={busy || !file}
          >
            {busy ? "Extracting Questions..." : "Upload & Extract Questions"}
          </button>

          {message && (
            <p className="qi-success">
              <CheckCircle size={17} /> {message}
            </p>
          )}

          {error && (
            <p className="qi-error">
              <AlertCircle size={17} /> {error}
            </p>
          )}
        </section>

        {questions.length > 0 && (
          <>
            <section className="qi-results">
              <h2>EXTRACTION SUMMARY</h2>

              <div className="qi-stats">
                <div>
                  <strong>{questions.length}</strong>
                  <span>Total detected</span>
                </div>

                <div>
                  <strong>{tfCount}</strong>
                  <span>Section A · True/False</span>
                </div>

                <div>
                  <strong>{mcqCount}</strong>
                  <span>Section B · MCQ drafts</span>
                </div>
              </div>

              <p className="qi-pending">
                Import Batch: {batchId}
              </p>

              <p className="qi-warning">
                These questions are saved for review only. They have NOT been
                added to the live Question Bank. MCQ options must be generated
                and checked before final approval.
              </p>
            </section>

            <section className="qi-preview">
              <h2>EXTRACTED QUESTION PREVIEW</h2>

              {questions.map((q, index) => (
                <article className="qi-question" key={index}>
                  <div className="qi-question-top">
                    <strong>QUESTION {q.number}</strong>
                    <span>
                      {q.question_type === "true_false"
                        ? "SECTION A · TRUE/FALSE"
                        : "SECTION B · MCQ DRAFT"}
                    </span>
                  </div>

                  <p>{q.question_text}</p>

                  <div className="qi-answer">
                    Correct Answer: <strong>{q.correct_answer}</strong>
                  </div>
                </article>
              ))}
            </section>
          </>
        )}

        <section className="qi-note">
          <ShieldCheck size={22} />
          <div>
            <strong>Admin approval required</strong>
            <p>
              Extraction is a first-pass text parser for selectable-text PDFs.
              Scanned PDFs require OCR. Factual questions are kept as MCQ
              drafts; this version does not invent wrong options or publish
              questions automatically.
            </p>
          </div>
        </section>

      </div>
    </main>
  );
}
