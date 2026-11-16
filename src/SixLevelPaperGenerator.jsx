
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import {
  RefreshCw,
  Layers,
  FileText,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

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

  // -------------------------------------------------------
  // LOAD ISLAMIC BOOK IMPORT BATCHES ONLY
  // -------------------------------------------------------

  const loadBatches = async () => {
    setFetching(true);
    setError("");

    try {
      const { data, error: batchError } = await supabase
        .from("question_import_batches")
        .select("id, file_name, status, created_at, notes")
        .ilike(
          "notes",
          "%IMPORT_TYPE=ISLAMIC_BOOK_QA%"
        )
        .in("status", ["needs_review", "approved"])
        .order("created_at", { ascending: false });

      if (batchError) throw batchError;

      setBatches(data || []);

      setSelectedBatch((current) => {
        if (
          current &&
          (data || []).some(
            (item) => item.id === current
          )
        ) {
          return current;
        }

        return data?.[0]?.id || "";
      });

    } catch (err) {
      setError(
        err.message || "Unable to load Islamic book imports."
      );
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    // Load the external Supabase batch list on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBatches();
  }, []);

  // -------------------------------------------------------
  // GENERATE SIX PAPERS
  // -------------------------------------------------------

  const generatePapers = async () => {

    if (!selectedBatch) {
      setError(
        "Please select an Islamic book import batch."
      );
      return;
    }

    const selected = batches.find(
      (item) => item.id === selectedBatch
    );

    const confirmed = window.confirm(

      `Generate six draft papers from "${
        selected?.file_name || "selected Islamic book"
      }"?

Each paper will contain:

78 original questions from its own level.
22 questions borrowed from the next level.

Expert will borrow from Foundation.`

    );

    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    setError("");
    setShortages(null);

    try {

      const { data, error: rpcError } =
        await supabase.rpc(
          "generate_six_level_papers",
          {
            p_batch_id: selectedBatch,
          }
        );

      if (rpcError) throw rpcError;


      if (
        data?.success === false ||
        data?.shortages
      ) {

        setShortages(
          data.shortages || data
        );

        setError(
          data.message ||
          "Source-level question counts do not match the required distribution."
        );

        return;
      }


      setMessage(
        data?.message ||
        "Six-level draft papers generated successfully."
      );

      await loadBatches();

      if (onGenerated) {
        await onGenerated();
      }

    } catch (err) {

      setError(
        err.message || "Unable to generate six-level papers."
      );

    } finally {

      setLoading(false);

    }
  };

  // -------------------------------------------------------
  // UI
  // -------------------------------------------------------

  return (

    <section className="exam-form-card">

      <div className="exam-form-title">

        <div>

          <h2>
            <Layers size={20} />
            SIX-LEVEL PAPER GENERATOR
          </h2>

          <p>
            Generate the six papers from the original Islamic book question bank.
          </p>

        </div>

        <button
          type="button"
          onClick={loadBatches}
          disabled={fetching || loading}
          title="Refresh Islamic book imports"
        >
          <RefreshCw size={17} />
        </button>

      </div>


      {error && (

        <div className="exam-alert">
          <AlertCircle size={17} />
          {error}
        </div>

      )}


      {message && (

        <p className="exam-message">
          <CheckCircle size={17} />
          {message}
        </p>

      )}


      <label htmlFor="six-level-batch">
        Select Islamic book import
      </label>


      {fetching ? (

        <p>Loading Islamic book imports...</p>

      ) : batches.length === 0 ? (

        <p>
          No Islamic book import batch is available.
          Import the book first.
        </p>

      ) : (

        <>

          <select
            id="six-level-batch"
            value={selectedBatch}
            onChange={(event) =>
              setSelectedBatch(event.target.value)
            }
            disabled={loading}
          >

            {batches.map((batch) => (

              <option
                key={batch.id}
                value={batch.id}
              >
                {batch.file_name} — {batch.status}
              </option>

            ))}

          </select>


          <div className="exam-pattern">

            <strong>
              EXACT QUESTION DISTRIBUTION
            </strong>


            {LEVELS.map((level, index) => {

              const nextLevel =
                LEVELS[(index + 1) % LEVELS.length];

              return (

                <div
                  key={level}
                  style={{
                    margin: "12px 0",
                    lineHeight: 1.6,
                  }}
                >

                  <strong>
                    {index + 1}. {level}
                  </strong>

                  <p style={{ margin: "3px 0" }}>
                    Own level: 29 TF + 49 MCQ = 78
                  </p>

                  <p style={{ margin: "3px 0" }}>
                    From {nextLevel}: 11 TF + 11 MCQ = 22
                  </p>

                  <p
                    style={{
                      margin: "3px 0",
                      fontWeight: 700,
                    }}
                  >
                    Total: 40 TF + 60 MCQ = 100
                  </p>

                </div>

              );

            })}


            <p>
              <strong>Six papers:</strong>{" "}
              468 unique source questions ·
              600 total paper appearances.
            </p>

          </div>


          <p className="exam-info">

            Before generation, every source level must have
            exactly 29 approved True/False and 49 approved MCQ
            questions assigned to it.

            Borrowing between different papers is intentional;
            duplicates within one paper are prevented.

          </p>


          <button
            type="button"
            className="exam-save"
            onClick={generatePapers}
            disabled={loading || !selectedBatch}
          >

            <Layers size={17} />

            {loading
              ? "Generating six papers..."
              : "Generate Six-Level Papers"}

          </button>

        </>

      )}


      {shortages && (

        <div className="exam-pattern">

          <strong>
            SOURCE LEVEL COUNT DETAILS
          </strong>

          <pre
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {JSON.stringify(shortages, null, 2)}
          </pre>

        </div>

      )}


      <div className="exam-info">

        <FileText size={16} />

        Generated papers are saved as drafts.
        Review all six before publishing.

      </div>

    </section>

  );
}
