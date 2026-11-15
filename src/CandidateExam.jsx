
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Clock, ChevronLeft, ChevronRight, Flag,
  CheckCircle, AlertTriangle, ShieldCheck,
  Send, LogOut
} from "lucide-react";
import { supabase } from "./supabase";
import "./CandidateExam.css";

function CandidateExam() {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [stage, setStage] = useState("instructions");
  const [agreed, setAgreed] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [examName, setExamName] = useState("ISLAMIC QUIZ 2026");
  const [attemptId, setAttemptId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [visited, setVisited] = useState([0]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const terminating = useRef(false);
  const submitting = useRef(false);
  const pendingSaves = useRef([]);

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  };

  const normalizeOptions = (options) => {
    if (!options) return [];
    if (Array.isArray(options)) return options.map(String);

    if (typeof options === "object") {
      return Object.entries(options).map(
        ([key, value]) => `${key}. ${value}`
      );
    }

    return [];
  };

  const saveAnswer = async (questionId, answer) => {
    if (!attemptId) throw new Error("Exam attempt not found.");

    const request = supabase.rpc("save_quiz_answer", {
      p_attempt_id: attemptId,
      p_question_id: questionId,
      p_answer_text: answer
    });

    pendingSaves.current.push(request);

    try {
      const { error: saveError } = await request;
      if (saveError) throw saveError;
    } finally {
      pendingSaves.current = pendingSaves.current.filter(
        (item) => item !== request
      );
    }
  };

  const chooseAnswer = async (answer) => {
    if (!currentQuestion || saving || submitting.current) return;

    const questionId = currentQuestion.question_id;
    const previousAnswer = answers[questionId];

    setAnswers((prev) => ({
      ...prev,
      [questionId]: answer
    }));

    setSaving(true);
    setError("");

    try {
      await saveAnswer(questionId, answer);
    } catch (err) {
      setAnswers((prev) => {
        const updated = { ...prev };

        if (previousAnswer === undefined) {
          delete updated[questionId];
        } else {
          updated[questionId] = previousAnswer;
        }

        return updated;
      });

      setError(err.message || "Answer could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const goToQuestion = (index) => {
    if (index < 0 || index >= questions.length) return;

    setCurrentIndex(index);
    setVisited((prev) =>
      prev.includes(index) ? prev : [...prev, index]
    );
  };

  const finishExam = async (automatic = false) => {
    if (!attemptId || submitting.current || terminating.current) return;

    submitting.current = true;
    setLoading(true);
    setError("");

    try {
      await Promise.all([...pendingSaves.current]);

      const { data, error: submitError } = await supabase.rpc(
        "submit_quiz_exam",
        { p_attempt_id: attemptId }
      );

      if (submitError) throw submitError;

      setResult({
        ...data,
        automatic
      });

      setStage("result");
    } catch (err) {
      submitting.current = false;
      setError(err.message || "Unable to submit examination.");
    } finally {
      setLoading(false);
    }
  };

  const terminateExam = async (reason) => {
    if (!attemptId || terminating.current || submitting.current) return;

    terminating.current = true;
    setError("");

    try {
      const { error: terminateError } = await supabase.rpc(
        "terminate_quiz_exam",
        {
          p_attempt_id: attemptId,
          p_reason: reason
        }
      );

      if (terminateError) throw terminateError;

      setStage("terminated");
    } catch (err) {
      terminating.current = false;
      setError(
        err.message || "Termination could not be recorded. Contact the organizer."
      );
    }
  };

  const startExam = async () => {
    if (!agreed || loading) return;

    setLoading(true);
    setError("");

    try {
      const { data, error: startError } = await supabase.rpc(
        "start_quiz_exam",
        { p_exam_id: examId }
      );

      if (startError) throw startError;

      if (
        !data?.attempt_id ||
        !Array.isArray(data.questions) ||
        data.questions.length !== 100
      ) {
        throw new Error("The examination paper is incomplete or invalid.");
      }

      setAttemptId(data.attempt_id);
      setExamName(data.exam_name || "ISLAMIC QUIZ 2026");
      setQuestions(data.questions);
      setAnswers({});
      setSecondsLeft(
        Math.max(
          0,
          Math.floor(
            (new Date(data.expires_at).getTime() - Date.now()) / 1000
          )
        )
      );

      setVisited([0]);
      setCurrentIndex(0);
      setStage("exam");
    } catch (err) {
      setError(err.message || "Unable to start examination.");
    } finally {
      setLoading(false);
    }
  };

  // Countdown
  useEffect(() => {
    if (stage !== "exam") return;

    if (secondsLeft <= 0) {
      finishExam(true);
      return;
    }

    const timer = setTimeout(() => {
      setSecondsLeft((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [stage, secondsLeft]);

  // Tab switching / hidden exam window termination
  useEffect(() => {
    if (stage !== "exam") return;

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        terminateExam(
          "Candidate switched tab, minimized or left the exam window."
        );
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [stage, attemptId]);

  const confirmSubmit = async () => {
    if (answeredCount !== questions.length) {
      setError(
        `You still have ${unansweredCount} unanswered questions.`
      );
      return;
    }

    if (
      window.confirm(
        "Are you sure you want to submit your examination? You cannot change answers after submission."
      )
    ) {
      await finishExam(false);
    }
  };

  if (stage === "instructions") {
    return (
      <main className="candidate-exam-page">
        <section className="candidate-instruction-card">
          <div className="candidate-exam-brand">
            <ShieldCheck size={35} />
            <span>MAJLISE TAHAFFUZE KHATME NUBUWWAT TRUST</span>
            <small>NIRMAL DIST, TG</small>
          </div>

          <h1>EXAMINATION INSTRUCTIONS</h1>
          <p className="candidate-exam-subtitle">{examName}</p>

          <div className="candidate-instruction-grid">
            <article className="instruction-blue">
              <strong>EXAMINATION PATTERN</strong>
              <p>100 compulsory questions</p>
              <p>Section A: 40 True / False</p>
              <p>Section B: 60 MCQs</p>
            </article>

            <article className="instruction-purple">
              <strong>TIME LIMIT</strong>
              <p>Maximum 3 hours</p>
              <p>Server-controlled countdown</p>
            </article>

            <article className="instruction-green">
              <strong>MARKING SCHEME</strong>
              <p>Correct answer: +1 mark</p>
              <p>Wrong answer: 0 marks</p>
              <p>No negative marking</p>
            </article>

            <article className="instruction-amber">
              <strong>IMPORTANT RULES</strong>
              <p>All 100 questions are compulsory.</p>
              <p>You may revisit and change answers.</p>
            </article>

            <article className="instruction-red">
              <strong>EXAMINATION DISCIPLINE</strong>
              <p>Do not switch tabs or minimize the exam.</p>
              <p>Leaving the exam window terminates your attempt.</p>
              <p>Terminated attempts cannot be restarted.</p>
            </article>

            <article className="instruction-teal">
              <strong>FINAL SUBMISSION</strong>
              <p>Submit after answering all questions.</p>
              <p>Saved answers are submitted when time expires.</p>
            </article>
          </div>

          <label className="candidate-agreement">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I have read and understood all instructions. I agree to follow
              the examination rules and understand that switching tabs or
              leaving the exam window will terminate my attempt.
            </span>
          </label>

          {error && <p className="candidate-exam-error">{error}</p>}

          <button
            className="candidate-start-button"
            disabled={!agreed || loading}
            onClick={startExam}
          >
            {loading ? "PREPARING EXAM..." : "AGREE & START EXAM"}
          </button>
        </section>
      </main>
    );
  }

  if (stage === "terminated") {
    return (
      <main className="candidate-exam-page">
        <section className="candidate-end-card">
          <AlertTriangle size={55} color="#bd3c32" />
          <h1>EXAMINATION TERMINATED</h1>
          <p>
            Your examination was terminated because the exam window was
            switched, hidden or left.
          </p>
          <p>Your attempt has been recorded. You cannot restart this exam.</p>
          <button onClick={() => navigate("/dashboard")}>
            Return to Dashboard
          </button>
        </section>
      </main>
    );
  }

  if (stage === "result") {
    return (
      <main className="candidate-exam-page">
        <section className="candidate-end-card">
          <CheckCircle size={55} color="#08734e" />
          <h1>EXAMINATION SUBMITTED</h1>
          <p>{examName}</p>

          <div className="candidate-result-score">
            <strong>{result?.marks ?? 0}/100</strong>
            <span>YOUR SCORE</span>
          </div>

          <div className="candidate-result-grid">
            <div>
              <strong>{result?.correct ?? 0}</strong>
              <span>Correct</span>
            </div>
            <div>
              <strong>{result?.wrong ?? 0}</strong>
              <span>Wrong</span>
            </div>
            <div>
              <strong>{result?.unanswered ?? 0}</strong>
              <span>Unanswered</span>
            </div>
          </div>

          {result?.automatic && (
            <p>Time expired. Your saved answers were submitted automatically.</p>
          )}

          <button onClick={() => navigate("/dashboard")}>
            Return to Dashboard
          </button>
        </section>
      </main>
    );
  }

  if (stage !== "exam" || !currentQuestion) {
    return (
      <main className="candidate-exam-page">
        <p>Preparing your examination...</p>
      </main>
    );
  }

  const currentAnswer = answers[currentQuestion.question_id];
  const isTrueFalse = currentQuestion.question_type === "true_false";
  const options = isTrueFalse
    ? ["True", "False"]
    : normalizeOptions(currentQuestion.options);

  return (
    <main className="candidate-exam-page candidate-live-exam">
      <header className="candidate-live-header">
        <div>
          <span>MAJLISE TAHAFFUZE KHATME NUBUWWAT TRUST</span>
          <h1>{examName}</h1>
        </div>

        <div className={`candidate-timer ${secondsLeft < 300 ? "timer-warning" : ""}`}>
          <Clock size={20} />
          <strong>{formatTime(secondsLeft)}</strong>
        </div>
      </header>

      <div className="candidate-live-layout">
        <section className="candidate-question-panel">
          <div className="candidate-question-top">
            <span>QUESTION {currentIndex + 1} OF {questions.length}</span>
            <span>
              {currentQuestion.section === "A"
                ? "SECTION A · TRUE/FALSE"
                : "SECTION B · MCQ"}
            </span>
          </div>

          <div className="candidate-question-progress">
            <div
              style={{
                width: `${((currentIndex + 1) / questions.length) * 100}%`
              }}
            />
          </div>

          <div className="candidate-question-content">
            <h2>{currentQuestion.question_text}</h2>

            <div className="candidate-options">
              {options.map((option, index) => (
                <button
                  key={`${index}-${option}`}
                  className={`candidate-option ${
                    currentAnswer === option ? "chosen" : ""
                  }`}
                  onClick={() => chooseAnswer(option)}
                  disabled={saving || submitting.current}
                >
                  <span>
                    {isTrueFalse
                      ? option === "True" ? "T" : "F"
                      : String.fromCharCode(65 + index)}
                  </span>
                  {option}
                </button>
              ))}
            </div>

            {saving && <p className="candidate-saving">Saving your answer...</p>}
          </div>

          {error && <p className="candidate-exam-error">{error}</p>}

          <div className="candidate-question-actions">
            <button
              onClick={() => goToQuestion(currentIndex - 1)}
              disabled={currentIndex === 0}
            >
              <ChevronLeft size={18} /> Previous
            </button>

            {currentIndex < questions.length - 1 ? (
              <button
                className="candidate-next-button"
                onClick={() => goToQuestion(currentIndex + 1)}
              >
                Next <ChevronRight size={18} />
              </button>
            ) : (
              <button
                className="candidate-submit-button"
                onClick={confirmSubmit}
                disabled={loading || saving}
              >
                <Send size={17} /> Submit Exam
              </button>
            )}
          </div>
        </section>

        <aside className="candidate-question-sidebar">
          <h3>QUESTION PALETTE</h3>

          <div className="candidate-palette-legend">
            <span><i className="palette-green" /> Answered</span>
            <span><i className="palette-red" /> Visited / Unanswered</span>
            <span><i className="palette-grey" /> Not Visited</span>
            <span><i className="palette-orange" /> Current</span>
          </div>

          <div className="candidate-question-grid">
            {questions.map((question, index) => {
              const answered = Boolean(answers[question.question_id]);
              const wasVisited = visited.includes(index);

              let status = "palette-grey";

              if (answered) status = "palette-green";
              else if (wasVisited) status = "palette-red";

              if (index === currentIndex) status = "palette-orange";

              return (
                <button
                  key={question.question_id}
                  className={status}
                  onClick={() => goToQuestion(index)}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          <div className="candidate-sidebar-summary">
            <p>Answered: <strong>{answeredCount}</strong></p>
            <p>Remaining: <strong>{unansweredCount}</strong></p>
          </div>

          <button
            className="candidate-submit-button candidate-sidebar-submit"
            onClick={confirmSubmit}
            disabled={loading || saving}
          >
            <Flag size={17} /> Finish & Submit
          </button>
        </aside>
      </div>

      <div className="candidate-exam-footer">
        <span><ShieldCheck size={16} /> Your answers are saved securely.</span>
        <span><LogOut size={16} /> Do not leave this examination window.</span>
      </div>
    </main>
  );
}

export default CandidateExam;
