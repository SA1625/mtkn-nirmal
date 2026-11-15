import React, { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { RefreshCw, Layers, FileText, AlertCircle } from "lucide-react";

const LEVELS = [
  "Foundation",
  "Beginner",
  "Intermediate",
  "Moderate",
  "Advanced",
  "Expert",
];

export default function SixLevelPaperGenerator({ onGenerated }) {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [shortages, setShortages] = useState(null);

  const loadBatches = async () => {
    setFetching(true);
    setError("");

    try {
      const { data, error: batchError } = await supabase
        .from("question_import_batches")
        .select("id, file_name, status, created_at")
        .in("status", ["needs_review", "approved"])
        .order("created_at", { ascending: false });

      if (batchError) throw batchError;

      setBatches(data || []);
      setSelectedBatch((current) => {
        if (current && (data || []).some((item) => item.id === current)) {
          return current;
        }
        return data?.[0]?.id || "";
      });
    } catch (err) {
      setError(err.message || "Unable to load imported PDFs.");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const generatePapers = async () => {
    if (!selectedBatch) {
      setError("Please select an imported PDF.");
      return;
    }

    const selected = batches.find((item) => item.id === selectedBatch);

    if (
      !window.confirm(
        `Generate six examination papers from "${selected?.file_name || "selected PDF"}"?`
      )
    ) {
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");
    setShortages(null);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "generate_six_level_papers",
        { p_batch_id: selectedBatch }
      );

      if (rpcError) throw rpcError;

      if (data?.success === false || data?.shortages) {
        setShortages(data.shortages || data);
        setError(
          data.message ||
            "There are not enough approved questions for all six levels."
        );
        return;
      }

      setMessage(
        data?.message ||
          "Six level examination papers have been generated successfully."
      );

      await loadBatches();

      if (onGenerated) {
        await onGenerated();
      }
    } catch (err) {
      setError(err.message || "Unable to generate six-level papers.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="exam-form-card">
      <div className="exam-form-title">
        <div>
          <h2>
            <Layers size={20} /> SIX-LEVEL PAPER GENERATOR
          </h2>
          <p>
            Generate Foundation, Beginner, Intermediate, Moderate, Advanced
            and Expert papers from an imported question bank.
          </p>
        </div>

        <button
          type="button"
          onClick={loadBatches}
          disabled={fetching || loading}
          title="Refresh imported PDFs"
        >
          <RefreshCw size={17} />
        </button>
      </div>

      {error && (
        <div className="exam-alert">
          <AlertCircle size={17} /> {error}
        </div>
      )}

      {message && <p className="exam-message">{message}</p>}

      <label htmlFor="six-level-batch">Select imported PDF</label>

      {fetching ? (
        <p>Loading imported PDFs...</p>
      ) : batches.length === 0 ? (
        <p>No imported PDF is available for paper generation.</p>
      ) : (
        <>
          <select
            id="six-level-batch"
            value={selectedBatch}
            onChange={(event) => setSelectedBatch(event.target.value)}
          >
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.file_name} — {batch.status}
              </option>
            ))}
          </select>

          <div className="exam-pattern">
            <strong>GENERATED EXAMINATION STRUCTURE</strong>
            {LEVELS.map((level, index) => (
              <p key={level}>
                {index + 1}. {level} — 40 True/False + 60 MCQ
              </p>
            ))}
            <p>Each paper: 100 questions · 100 marks</p>
          </div>

          <p className="exam-info">
            Only approved questions from the selected PDF are used. If a level
            does not have enough eligible questions, the system reports the
            shortage instead of creating an incomplete paper.
          </p>

          <button
            type="button"
            className="exam-save"
            onClick={generatePapers}
            disabled={loading || !selectedBatch}
          >
            <Layers size={17} />
            {loading ? "Generating six papers..." : "Generate Six-Level Papers"}
          </button>
        </>
      )}

      {shortages && (
        <div className="exam-pattern">
          <strong>QUESTION SHORTAGE DETAILS</strong>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {JSON.stringify(shortages, null, 2)}
          </pre>
        </div>
      )}

      <div className="exam-info">
        <FileText size={16} /> Generated papers are saved as drafts. Review
        them before publishing.
      </div>
    </section>
  );
}