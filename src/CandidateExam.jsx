import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Flag,
  CheckCircle,
  AlertTriangle,
  ShieldCheck,
  Send,
  LogOut,
  Download,
  Eye,
  ArrowRight,
  Loader,
  X
} from "lucide-react";
import { supabase } from "./supabase";
import "./CandidateExam.css";

const escapeHTML = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

const formatOptions = (options) => {
  if (!options) return [];

  if (Array.isArray(options)) {
    return options.map(String);
  }

  if (typeof options === "object") {
    return Object.entries(options).map(
      ([key, value]) => `${key}. ${value}`
    );
  }

  return [];
};

// Display translated labels while always saving the original English answer key.
const getOptionEntries = (question, language, isTrueFalse = false) => {
  if (isTrueFalse) {
    return language === "ur"
      ? [
          { label: "درست", answer: "true" },
          { label: "غلط", answer: "false" }
        ]
      : [
          { label: "True", answer: "true" },
          { label: "False", answer: "false" }
        ];
  }

  const translated = question?.options || [];
  const original = question?.options_original ?? question?.options ?? [];

  if (Array.isArray(translated)) {
    return translated.map((label, index) => ({
      label: String(label),
      answer: Array.isArray(original)
        ? String(original[index] ?? "")
        : String(original?.[index] ?? "")
    }));
  }

  if (translated && typeof translated === "object") {
    return Object.entries(translated).map(([key, label]) => ({
      label: `${key}. ${label}`,
      answer: key
    }));
  }

  return [];
};

const displayReviewAnswer = (question, answer, language) => {
  if (answer == null || answer === "") {
    return language === "ur" ? "جواب نہیں دیا گیا" : "Not answered";
  }

  if (language !== "ur") return String(answer);

  if (question?.question_type === "true_false") {
    const normalized = String(answer).trim().toLowerCase();
    if (normalized === "true") return "درست";
    if (normalized === "false") return "غلط";
  }

  const original = question?.options_original;
  const translated = question?.options;

  if (Array.isArray(original) && Array.isArray(translated)) {
    const normalizedAnswer = String(answer).trim().toLowerCase();
    const letterMatch = normalizedAnswer.match(/^([a-d])(?:\\.|$)/);
    const index = letterMatch
      ? letterMatch[1].charCodeAt(0) - 97
      : original.findIndex(
          (item) => String(item).trim().toLowerCase() === normalizedAnswer
        );
    if (index >= 0 && index < translated.length) {
      return `${String.fromCharCode(65 + index)}. ${String(translated[index] ?? answer)}`;
    }
  }

  if (
    original && typeof original === "object" && !Array.isArray(original) &&
    translated && typeof translated === "object" && !Array.isArray(translated)
  ) {
    for (const [key, value] of Object.entries(original)) {
      const normalizedAnswer = String(answer).trim().toLowerCase();
      if (
        normalizedAnswer === String(key).trim().toLowerCase() ||
        normalizedAnswer === String(value).trim().toLowerCase() ||
        normalizedAnswer === `${key}. ${value}`.trim().toLowerCase()
      ) {
        return `${key}. ${translated[key] ?? value}`;
      }
    }
  }

  return String(answer);
};

function printHTML(title, body) {
  const documentHTML = `
    <!doctype html>
    <html>
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>${escapeHTML(title)}</title>
      <style>
        *{box-sizing:border-box}
        @page{size:A4;margin:14mm}
        body{font-family:Arial,sans-serif;color:#173d32;margin:0;padding:25px}
        .sheet{max-width:850px;margin:auto;border:2px solid #176b50;padding:28px}
        header{text-align:center;border-bottom:2px solid #176b50;padding-bottom:16px}
        header h1{font-size:21px;margin:0 0 7px}
        header p{margin:4px;font-size:13px}
        h2{text-align:center;margin:25px 0 18px}
        .score{text-align:center;background:#edf7f0;border:1px solid #b9d9c5;padding:22px;margin:20px 0}
        .score strong{display:block;font-size:38px;color:#176b50}
        table{width:100%;border-collapse:collapse;margin:16px 0}
        th,td{border:1px solid #d5e2da;padding:9px;text-align:left;font-size:13px}
        th{background:#edf5ef}
        .question{border:1px solid #dce7df;padding:13px;margin:12px 0;break-inside:avoid}
        .correct{color:#08734e;font-weight:bold}
        .wrong{color:#b42318;font-weight:bold}
        .muted{color:#687970}
        .actions{text-align:center;margin:22px}
        button{background:#176b50;color:white;border:0;padding:12px 24px;border-radius:6px;font-size:15px}
        @media print{body{padding:0}.actions{display:none}.sheet{border:0;max-width:none;padding:0}}
      </style>
    </head>
    <body>
      <div class="sheet">
        <header>
          <h1>MAJLISE TAHAFFUZE KHATME NUBUWWAT TRUST</h1>
          <p>NIRMAL DIST, TG</p>
          <p>ISLAMIC QUIZ 2026</p>
        </header>
        ${body}
      </div>
      <div class="actions">
        <button onclick="window.print()">Print / Save as PDF</button>
      </div>
      <script>
        window.addEventListener("load", function () {
          setTimeout(function () {
            window.focus();
            try { window.print(); } catch (e) {}
          }, 500);
        });
      </script>
    </body>
    </html>
  `;

  // Open the printable report directly from the button click.
  // This works with the Android browser's "Save as PDF" print destination.
  let popup = null;

  try {
    popup = window.open("", "_blank");
  } catch (error) {
    popup = null;
  }

  if (popup) {
    popup.document.open();
    popup.document.write(documentHTML);
    popup.document.close();
    return;
  }

  // Popup-blocked fallback: print the report from a temporary iframe.
  // The iframe is removed after printing or when the page is closed.
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Result PDF");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument;

  if (!frameWindow || !frameDocument) {
    frame.remove();
    alert("Unable to open the PDF print window. Please allow pop-ups and try again.");
    return;
  }

  frameDocument.open();
  frameDocument.write(documentHTML);
  frameDocument.close();

  const cleanup = () => {
    window.setTimeout(() => frame.remove(), 1000);
  };

  frameWindow.onafterprint = cleanup;
  window.setTimeout(() => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } catch (error) {
      cleanup();
      alert("Your browser blocked PDF printing. Open this page in Chrome and allow pop-ups to save the PDF.");
    }
  }, 700);
}

const isCorrectAnswer = (question, selectedAnswer) => {
  if (!selectedAnswer) return false;

  const selected = String(selectedAnswer).trim().toLowerCase();
  const correct = String(question.correct_answer ?? "").trim().toLowerCase();

  if (selected === correct) return true;

  const options = question.options;

  if (Array.isArray(options)) {
    const correctIndex = options.findIndex(
      (option) => String(option).trim().toLowerCase() === correct
    );

    if (correctIndex >= 0) {
      const letter = String.fromCharCode(65 + correctIndex).toLowerCase();

      return (
        selected === letter ||
        selected === `${letter}. ${String(options[correctIndex]).trim().toLowerCase()}` ||
        selected === String(options[correctIndex]).trim().toLowerCase()
      );
    }

    const letterIndex = correct.match(/^[a-d]$/)?.[0];
    if (letterIndex) {
      const index = letterIndex.charCodeAt(0) - 97;
      return selected === String(options[index] ?? "").trim().toLowerCase();
    }
  }

  if (options && typeof options === "object" && !Array.isArray(options)) {
    for (const [key, value] of Object.entries(options)) {
      const k = key.trim().toLowerCase();
      const v = String(value).trim().toLowerCase();

      if (
        correct === k ||
        correct === v ||
        correct === `${k}. ${v}`
      ) {
        return (
          selected === k ||
          selected === v ||
          selected === `${k}. ${v}`
        );
      }
    }
  }

  return false;
};

function CandidateExam() {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [stage, setStage] = useState("instructions");
  const [agreed, setAgreed] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [attemptLanguage, setAttemptLanguage] = useState("en");
  const [questions, setQuestions] = useState([]);
  const [exam, setExam] = useState(null);
  const [examName, setExamName] = useState("ISLAMIC QUIZ 2026");
  const [attemptId, setAttemptId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [visited, setVisited] = useState([0]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [review, setReview] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [nextExam, setNextExam] = useState(null);
  const [error, setError] = useState("");

  const [violationCount, setViolationCount] = useState(0);
  const [warningSeconds, setWarningSeconds] = useState(0);
  const [showViolationWarning, setShowViolationWarning] = useState(false);

  const terminating = useRef(false);
  const submitting = useRef(false);
  const pendingSaves = useRef([]);

  const violationCountRef = useRef(0);
  const warningDeadlineRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const warningIntervalRef = useRef(null);
  const warningDismissRef = useRef(null);

  const isSixLevelIslamicQuiz = Boolean(
    exam &&
    [
      "Foundation",
      "Beginner",
      "Intermediate",
      "Moderate",
      "Advanced",
      "Expert"
    ].includes(exam.level_name) &&
    exam.exam_name === `Islamic Quiz 2026 - ${exam.level_name}`
  );

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  const clearViolationTimers = () => {
    if (warningTimeoutRef.current) {
      window.clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }

    if (warningIntervalRef.current) {
      window.clearInterval(warningIntervalRef.current);
      warningIntervalRef.current = null;
    }

    if (warningDismissRef.current) {
      window.clearTimeout(warningDismissRef.current);
      warningDismissRef.current = null;
    }

    warningDeadlineRef.current = null;
  };

  useEffect(() => {
    let active = true;

    const loadExam = async () => {
      const { data, error: examError } = await supabase
        .from("exams")
        .select(
          "id, exam_name, series_id, level_order, level_name, duration_minutes"
        )
        .eq("id", examId)
        .single();

      if (!active) return;

      if (examError) {
        setError(examError.message);
        return;
      }

      setExam(data);
      setExamName(data.exam_name || "ISLAMIC QUIZ 2026");
    };

    loadExam();

    return () => {
      active = false;
    };
  }, [examId]);

  const formatTime = (seconds) => {
    const safeSeconds = Math.max(0, seconds);
    const h = Math.floor(safeSeconds / 3600);
    const m = Math.floor((safeSeconds % 3600) / 60);
    const s = safeSeconds % 60;

    return [h, m, s]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
  };

  const saveAnswer = async (questionId, answer) => {
    if (!attemptId) {
      throw new Error("Exam attempt not found.");
    }

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
      pendingSaves.current =
        pendingSaves.current.filter((item) => item !== request);
    }
  };

  const chooseAnswer = async (answer) => {
    if (!currentQuestion || saving || submitting.current) return;

    const questionId = currentQuestion.question_id;
    const previous = answers[questionId];

    setAnswers((old) => ({
      ...old,
      [questionId]: answer
    }));

    setSaving(true);
    setError("");

    try {
      await saveAnswer(questionId, answer);
    } catch (err) {
      setAnswers((old) => {
        const copy = { ...old };

        if (previous === undefined) {
          delete copy[questionId];
        } else {
          copy[questionId] = previous;
        }

        return copy;
      });

      setError(err.message || "Answer could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const goToQuestion = (index) => {
    if (index < 0 || index >= questions.length) return;

    setCurrentIndex(index);

    setVisited((old) =>
      old.includes(index) ? old : [...old, index]
    );
  };

  const terminateExam = async (reason) => {
    if (!attemptId || terminating.current || submitting.current) return;

    terminating.current = true;
    clearViolationTimers();

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
      setError(err.message || "Could not record termination.");
      terminating.current = false;
    }
  };

  const finishExam = async (automatic = false) => {
    if (!attemptId || submitting.current || terminating.current) return;

    submitting.current = true;
    clearViolationTimers();
    setLoading(true);
    setError("");

    try {
      await Promise.all([...pendingSaves.current]);

      const { data, error: submitError } = await supabase.rpc(
        "submit_quiz_exam",
        {
          p_attempt_id: attemptId
        }
      );

      if (submitError) throw submitError;

      setResult({
        ...(data || {}),
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

  const startExam = async () => {
    if (!agreed || loading) return;

    setLoading(true);
    setError("");

    try {
      const { data, error: startError } = await supabase.rpc(
        "start_quiz_exam",
        {
          p_exam_id: examId,
          p_language: selectedLanguage
        }
      );

      if (startError) throw startError;

      if (
        !data?.attempt_id ||
        !Array.isArray(data.questions) ||
        data.questions.length !== 100
      ) {
        throw new Error(
          "The examination paper is incomplete or invalid."
        );
      }

      setAttemptId(data.attempt_id);
      setAttemptLanguage(data.language || selectedLanguage);
      setExamName(
        data.exam_name || exam?.exam_name || "ISLAMIC QUIZ 2026"
      );
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
      setResult(null);
      setReview(null);
      setNextExam(null);

      violationCountRef.current = 0;
      setViolationCount(0);
      setWarningSeconds(0);
      setShowViolationWarning(false);
      clearViolationTimers();

      setStage("exam");
    } catch (err) {
      setError(err.message || "Unable to start examination.");
    } finally {
      setLoading(false);
    }
  };

  // Server-controlled time countdown
  useEffect(() => {
    if (stage !== "exam") return;

    if (secondsLeft <= 0) {
      finishExam(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setSecondsLeft((old) => Math.max(0, old - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [stage, secondsLeft]);

  // Tab-switching and exam-window discipline
  useEffect(() => {
    if (stage !== "exam" || !attemptId || isSixLevelIslamicQuiz) return;

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (warningDeadlineRef.current) return;

        violationCountRef.current += 1;

        const count = violationCountRef.current;
        setViolationCount(count);

        // Third switch: immediate termination
        if (count >= 3) {
          terminateExam(
            "Third examination window violation. Attempt terminated automatically."
          );
          return;
        }

        // First switch: 30 seconds
        // Second switch: 10 seconds
        const duration = count === 1 ? 30 : 10;
        const deadline = Date.now() + duration * 1000;

        warningDeadlineRef.current = deadline;
        setWarningSeconds(duration);
        setShowViolationWarning(true);

        const updateCountdown = () => {
          const remaining = Math.max(
            0,
            Math.ceil((deadline - Date.now()) / 1000)
          );

          setWarningSeconds(remaining);

          if (remaining <= 0) {
            clearViolationTimers();

            terminateExam(
              count === 1
                ? "First tab switch: candidate did not return within 30 seconds."
                : "Second tab switch: candidate did not return within 10 seconds."
            );
          }
        };

        warningIntervalRef.current =
          window.setInterval(updateCountdown, 250);

        warningTimeoutRef.current = window.setTimeout(
          updateCountdown,
          duration * 1000
        );
      } else {
        // Candidate returned to the examination window
        if (!warningDeadlineRef.current) return;

        const remaining = Math.ceil(
          (warningDeadlineRef.current - Date.now()) / 1000
        );

        if (remaining <= 0) {
          clearViolationTimers();

          terminateExam(
            "Candidate returned after the examination window warning period expired."
          );
          return;
        }

        // Return before timeout cancels the termination timer
        clearViolationTimers();

        setWarningSeconds(0);
        setShowViolationWarning(true);

        if (warningDismissRef.current) {
          window.clearTimeout(warningDismissRef.current);
        }

        warningDismissRef.current = window.setTimeout(() => {
          setShowViolationWarning(false);
          setWarningSeconds(0);
        }, 3500);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearViolationTimers();
    };
  }, [stage, attemptId, isSixLevelIslamicQuiz]);

  const confirmSubmit = async () => {
    if (answeredCount !== 100) {
      setError(
        `You still have ${unansweredCount} unanswered questions.`
      );
      return;
    }

    if (
      window.confirm(
        "Submit your examination? You cannot change answers afterwards."
      )
    ) {
      await finishExam(false);
    }
  };

  // Load candidate's own response review and result
  const loadReview = async () => {
    if (!attemptId) return;

    setReviewLoading(true);
    setError("");

    try {
      const { data, error: reviewError } = await supabase.rpc(
        "get_my_exam_review",
        {
          p_attempt_id: attemptId
        }
      );

      if (reviewError) throw reviewError;

      const {
        data: resultData,
        error: resultError
      } = await supabase
        .from("exam_results")
        .select("*")
        .eq("attempt_id", attemptId)
        .maybeSingle();

      if (resultError) throw resultError;

      setReview({
        ...(data || {}),
        result: resultData || result || {},
      });

      setStage("review");
    } catch (err) {
      setError(
        err.message || "Unable to load your response review."
      );
    } finally {
      setReviewLoading(false);
    }
  };

  const getReviewQuestions = () =>
    Array.isArray(review?.questions) ? review.questions : [];

  const downloadResultPDF = () => {
    const marks = Number(result?.marks_obtained ?? result?.marks ?? 0);
    const correct = Number(result?.correct_answers ?? result?.correct ?? 0);
    const wrong = Number(result?.wrong_answers ?? result?.wrong ?? 0);
    const attempted = Number(
      result?.attempted_questions ?? result?.attempted ?? correct + wrong
    );
    const total = Number(result?.total_questions ?? result?.total ?? 100);

    const body = `
      <h2>EXAMINATION RESULT</h2>
      <div class="score">
        <strong>${marks}/100</strong>
        <span>TOTAL MARKS OBTAINED</span>
      </div>
      <table>
        <tr><th>Candidate</th><td>My Result</td></tr>
        <tr><th>Examination</th><td>${escapeHTML(examName)}</td></tr>
        <tr><th>Total Questions</th><td>${total}</td></tr>
        <tr><th>Attempted</th><td>${attempted}</td></tr>
        <tr><th>Correct Answers</th><td>${correct}</td></tr>
        <tr><th>Wrong Answers</th><td>${wrong}</td></tr>
        <tr><th>Unanswered</th><td>${Math.max(0, total - attempted)}</td></tr>
        <tr><th>Percentage</th><td>${marks}%</td></tr>
        <tr><th>Result Status</th><td>SUBMITTED</td></tr>
      </table>
      <p class="muted">
        This report is generated electronically by the Islamic Quiz 2026 Portal.
      </p>
    `;

    printHTML(`${examName} Result`, body);
  };

  const findNextLevel = async () => {
    if (
      !exam?.series_id ||
      !exam?.level_order ||
      exam.level_order >= 6
    ) {
      return;
    }

    const { data, error: nextError } = await supabase
      .from("exams")
      .select(
        "id, exam_name, level_name, level_order, exam_date, availability_end, status"
      )
      .eq("series_id", exam.series_id)
      .eq("level_order", exam.level_order + 1)
      .eq("status", "published")
      .maybeSingle();

    if (nextError) {
      setError(nextError.message);
      return;
    }

    if (data) {
      setNextExam(data);
    } else {
      setError("The next level has not been published yet.");
    }
  };

  // Download results for all six completed levels
  const downloadAllLevelsPDF = async () => {
    if (!exam?.series_id || exam.level_order !== 6) return;

    setLoading(true);
    setError("");

    try {
      const {
        data: userData,
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !userData?.user) {
        throw new Error("Please login again.");
      }

      const userId = userData.user.id;

      const {
        data: seriesExams,
        error: examsError
      } = await supabase
        .from("exams")
        .select("id, exam_name, level_name, level_order")
        .eq("series_id", exam.series_id)
        .order("level_order");

      if (examsError) throw examsError;

      const examIds = (seriesExams || []).map((item) => item.id);

      if (examIds.length !== 6) {
        throw new Error(
          "The six-level examination series is incomplete."
        );
      }

      const {
        data: ownAttempts,
        error: attemptsError
      } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, status")
        .eq("candidate_id", userId)
        .eq("status", "submitted")
        .in("exam_id", examIds);

      if (attemptsError) throw attemptsError;

      const attemptByExam = new Map(
        (ownAttempts || []).map((item) => [item.exam_id, item])
      );

      const levelRows = [];

      for (const level of seriesExams || []) {
        const ownAttempt = attemptByExam.get(level.id);

        if (!ownAttempt) continue;

        const {
          data: resultData,
          error: resultError
        } = await supabase
          .from("exam_results")
          .select(
            "total_questions, attempted_questions, correct_answers, wrong_answers, marks_obtained, result_status, published_at"
          )
          .eq("attempt_id", ownAttempt.id)
          .eq("candidate_id", userId)
          .maybeSingle();

        if (resultError) throw resultError;

        if (resultData) {
          levelRows.push({
            level,
            result: resultData,
          });
        }
      }

      if (levelRows.length !== 6) {
        throw new Error(
          "All six level results must be available before downloading the combined report."
        );
      }

      const totalMarks = levelRows.reduce(
        (sum, row) =>
          sum + Number(row.result.marks_obtained || 0),
        0
      );

      const percentage = Math.round(
        (totalMarks / 600) * 10000
      ) / 100;

      const body = `
        <h2>OVERALL ACADEMIC RESULT</h2>

        <div class="score">
          <strong>${totalMarks}/600</strong>
          <span>OVERALL SCORE · ${percentage}%</span>
        </div>

        <table>
          <tr>
            <th>Level</th>
            <th>Marks</th>
            <th>Percentage</th>
            <th>Status</th>
          </tr>

          ${levelRows.map((row) => {
            const r = row.result;
            const mark = Number(r.marks_obtained || 0);

            return `
              <tr>
                <td>${escapeHTML(
                  row.level.level_name || row.level.exam_name
                )}</td>
                <td>${mark}/100</td>
                <td>${mark}%</td>
                <td>Completed</td>
              </tr>
            `;
          }).join("")}
        </table>

        ${levelRows.map((row) => {
          const r = row.result;

          return `
            <h2>
              ${escapeHTML(
                row.level.level_name || row.level.exam_name
              )} — RESULT
            </h2>

            <div class="score">
              <strong>${Number(r.marks_obtained || 0)}/100</strong>
            </div>

            <table>
              <tr>
                <th>Total Questions</th>
                <td>${Number(r.total_questions || 100)}</td>
              </tr>
              <tr>
                <th>Attempted</th>
                <td>${Number(r.attempted_questions || 0)}</td>
              </tr>
              <tr>
                <th>Correct</th>
                <td>${Number(r.correct_answers || 0)}</td>
              </tr>
              <tr>
                <th>Wrong</th>
                <td>${Number(r.wrong_answers || 0)}</td>
              </tr>
            </table>
          `;
        }).join("")}
      `;

      printHTML(
        "Islamic Quiz 2026 — All Level Result",
        body
      );

    } catch (err) {
      setError(
        err.message || "Unable to create combined result."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadNextAndRender = async () => {
    await findNextLevel();
  };

  if (stage === "instructions") {
    return (
      <main className="candidate-exam-page">
        <section className="candidate-instruction-card">
          <div className="candidate-exam-brand">
            <ShieldCheck size={35} />
            <span>
              MAJLISE TAHAFFUZE KHATME NUBUWWAT TRUST
            </span>
            <small>NIRMAL DIST, TG</small>
          </div>

          <h1>EXAMINATION INSTRUCTIONS</h1>
          <p className="candidate-exam-subtitle">{examName}</p>

          <section
            aria-label="Choose examination language"
            style={{
              margin: "18px 0",
              padding: 16,
              border: "1px solid #dce7df",
              borderRadius: 12,
              background: "#ffffff"
            }}
          >
            <h3 style={{ margin: "0 0 12px", textAlign: "center" }}>
              Choose Paper Language / زبان منتخب کریں
            </h3>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setSelectedLanguage("en")}
                aria-pressed={selectedLanguage === "en"}
                style={{
                  minWidth: 130,
                  padding: "12px 20px",
                  borderRadius: 9,
                  border: selectedLanguage === "en" ? "2px solid #08734e" : "1px solid #cbd5d0",
                  background: selectedLanguage === "en" ? "#eaf5ef" : "#fff",
                  color: "#173d32",
                  fontWeight: 700
                }}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setSelectedLanguage("ur")}
                aria-pressed={selectedLanguage === "ur"}
                style={{
                  minWidth: 130,
                  padding: "12px 20px",
                  borderRadius: 9,
                  border: selectedLanguage === "ur" ? "2px solid #08734e" : "1px solid #cbd5d0",
                  background: selectedLanguage === "ur" ? "#eaf5ef" : "#fff",
                  color: "#173d32",
                  fontWeight: 700,
                  direction: "rtl",
                  fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif"
                }}
              >
                اردو
              </button>
            </div>
            <p style={{ margin: "10px 0 0", textAlign: "center", color: "#687970", fontSize: 13 }}>
              Language cannot be changed after the examination starts.
            </p>
          </section>

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

            {!isSixLevelIslamicQuiz && (
              <article className="instruction-red">
                <strong>EXAMINATION DISCIPLINE</strong>
                <p>First tab switch: 30-second warning.</p>
                <p>Second tab switch: 10-second warning.</p>
                <p>Third tab switch: immediate termination.</p>
              </article>
            )}

            {isSixLevelIslamicQuiz && (
              <article className="instruction-teal">
                <strong>TAB SWITCHING</strong>
                <p>Tab switching will not terminate this Islamic Quiz examination.</p>
                <p>Your answers continue to be saved securely.</p>
              </article>
            )}

            <article className="instruction-teal">
              <strong>FINAL SUBMISSION</strong>
              <p>Submit after answering all questions.</p>
              <p>When time expires, saved answers are submitted automatically.</p>
            </article>
          </div>

          <label className="candidate-agreement">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />

            <span>
              I have read and understood all instructions.
              I agree to follow the examination rules.
              {isSixLevelIslamicQuiz
                ? " Tab switching will not terminate this examination."
                : " I understand the tab-switching discipline."}
            </span>
          </label>

          {error && (
            <p className="candidate-exam-error">{error}</p>
          )}

          <button
            className="candidate-start-button"
            disabled={!agreed || loading || !exam}
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
            Your examination was terminated because the
            examination window discipline rules were violated.
          </p>

          <p>
            Your attempt has been recorded. You cannot restart this exam.
          </p>

          <button onClick={() => navigate("/dashboard")}>
            Return to Dashboard
          </button>
        </section>
      </main>
    );
  }

  if (stage === "result") {
    const marks = Number(
      result?.marks_obtained ?? result?.marks ?? 0
    );

    const correct = Number(
      result?.correct_answers ?? result?.correct ?? 0
    );

    const wrong = Number(
      result?.wrong_answers ?? result?.wrong ?? 0
    );

    const attempted = Number(
      result?.attempted_questions ??
      result?.attempted ??
      correct + wrong
    );

    const total = Number(
      result?.total_questions ?? result?.total ?? 100
    );

    const unanswered = total - attempted;

    return (
      <main className="candidate-exam-page">
        <section
          className="candidate-end-card"
          style={{ maxWidth: 760 }}
        >
          <CheckCircle size={55} color="#08734e" />

          <h1>EXAMINATION SUBMITTED</h1>
          <p>{examName}</p>

          <div className="candidate-result-score">
            <strong>{marks}/100</strong>
            <span>YOUR SCORE</span>
          </div>

          <div className="candidate-result-grid">
            <div>
              <strong>{correct}</strong>
              <span>Correct</span>
            </div>

            <div>
              <strong>{wrong}</strong>
              <span>Wrong</span>
            </div>

            <div>
              <strong>{Math.max(0, unanswered)}</strong>
              <span>Unanswered</span>
            </div>
          </div>

          {result?.automatic && (
            <p>
              Time expired. Your saved answers were submitted automatically.
            </p>
          )}

          {error && (
            <p className="candidate-exam-error">{error}</p>
          )}

          <div
            style={{
              display: "grid",
              gap: 10,
              marginTop: 22
            }}
          >
            <button onClick={downloadResultPDF}>
              <Download size={17} /> Save Result PDF
            </button>

            <button
              onClick={loadReview}
              disabled={reviewLoading}
            >
              {reviewLoading ? (
                <Loader size={17} />
              ) : (
                <Eye size={17} />
              )}
              View My Response
            </button>

            {exam?.series_id && exam.level_order < 6 && (
              <button onClick={loadNextAndRender}>
                <ArrowRight size={17} /> Find Next Level
              </button>
            )}

            {exam?.series_id && exam.level_order === 6 && (
              <button
                onClick={downloadAllLevelsPDF}
                disabled={loading}
              >
                <Download size={17} />
                Download My All-Level Result
              </button>
            )}

            {nextExam && (
              <button
                onClick={() => navigate(`/exam/${nextExam.id}`)}
              >
                Start {nextExam.level_name || nextExam.exam_name}
              </button>
            )}

            <button onClick={() => navigate("/dashboard")}>
              Back to Dashboard
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (stage === "review") {
    const reviewResult = review?.result || {};
    const reviewQuestions = getReviewQuestions();

    return (
      <main className="candidate-exam-page">
        <section
          className="candidate-end-card"
          style={{
            maxWidth: 950,
            textAlign: "left"
          }}
        >
          <h1>MY RESPONSE — {examName}</h1>

          <div className="candidate-result-score">
            <strong>
              {Number(
                reviewResult.marks_obtained ??
                reviewResult.marks ??
                0
              )}/100
            </strong>
            <span>FINAL SCORE</span>
          </div>

          {reviewQuestions.map((q, index) => {
            const reviewLanguage = review?.language || attemptLanguage;
            const originalQuestion = {
              ...q,
              options: q.options_original ?? q.options
            };
            const correctAnswer = q.is_correct ?? isCorrectAnswer(
              originalQuestion,
              q.selected_answer
            );
            const questionStyle = reviewLanguage === "ur"
              ? {
                  direction: "rtl",
                  textAlign: "right",
                  fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif",
                  lineHeight: 2
                }
              : {};

            return (
              <article
                key={q.question_id}
                style={{
                  border: "1px solid #dce7df",
                  borderRadius: 10,
                  padding: 16,
                  margin: "14px 0",
                  textAlign: "left"
                }}
              >
                <strong style={questionStyle}>
                  Q{index + 1}. {q.question_text}
                </strong>

                <p style={questionStyle}>
                  {reviewLanguage === "ur" ? "آپ کا جواب:" : "Your answer:"}{" "}
                  <b>{displayReviewAnswer(q, q.selected_answer, reviewLanguage)}</b>
                </p>

                <p style={questionStyle}>
                  {reviewLanguage === "ur" ? "درست جواب:" : "Correct answer:"}{" "}
                  <b>{displayReviewAnswer(q, q.correct_answer, reviewLanguage)}</b>
                </p>

                <p className={correctAnswer ? "correct" : "wrong"} style={questionStyle}>
                  {reviewLanguage === "ur"
                    ? (correctAnswer ? "درست · +1 نمبر" : "غلط / جواب نہیں دیا · 0 نمبر")
                    : (correctAnswer ? "Correct · +1 mark" : "Incorrect / Unanswered · 0 marks")}
                </p>

                {q.explanation && (
                  <p className="muted" style={questionStyle}>
                    {reviewLanguage === "ur" ? "وضاحت:" : "Explanation:"} {q.explanation}
                  </p>
                )}
              </article>
            );
          })}

          <button onClick={() => setStage("result")}>
            Back to Result
          </button>

          <button onClick={() => navigate("/dashboard")}>
            Back to Dashboard
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

  const isTrueFalse =
    currentQuestion.question_type === "true_false";

  const options = getOptionEntries(
    currentQuestion,
    attemptLanguage,
    isTrueFalse
  );
  const questionTextStyle = attemptLanguage === "ur"
    ? {
        direction: "rtl",
        textAlign: "right",
        fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif",
        lineHeight: 2
      }
    : {};

  return (
    <main className="candidate-exam-page candidate-live-exam">
      <header className="candidate-live-header">
        <div>
          <span>
            MAJLISE TAHAFFUZE KHATME NUBUWWAT TRUST
          </span>
          <h1>{examName}</h1>
        </div>

        <div
          className={`candidate-timer ${
            secondsLeft < 300 ? "timer-warning" : ""
          }`}
        >
          <Clock size={20} />
          <strong>{formatTime(secondsLeft)}</strong>
        </div>
      </header>

      <div className="candidate-live-layout">
        <section className="candidate-question-panel">
          <div className="candidate-question-top">
            <span>
              QUESTION {currentIndex + 1} OF {questions.length}
            </span>

            <span>
              {currentQuestion.section === "A"
                ? "SECTION A · TRUE/FALSE"
                : "SECTION B · MCQ"}
            </span>
          </div>

          <div className="candidate-question-progress">
            <div
              style={{
                width: `${
                  ((currentIndex + 1) / questions.length) * 100
                }%`
              }}
            />
          </div>

          <div className="candidate-question-content">
            <h2 style={questionTextStyle}>{currentQuestion.question_text}</h2>

            <div className="candidate-options">
              {options.map((option, index) => (
                <button
                  key={`${index}-${option.answer}`}
                  className={`candidate-option ${
                    currentAnswer === option.answer ? "chosen" : ""
                  }`}
                  onClick={() => chooseAnswer(option.answer)}
                  disabled={saving || submitting.current}
                  style={attemptLanguage === "ur" ? { direction: "rtl", textAlign: "right" } : {}}
                >
                  <span>
                    {isTrueFalse
                      ? index === 0 ? "T" : "F"
                      : String.fromCharCode(65 + index)}
                  </span>

                  {option.label}
                </button>
              ))}
            </div>

            {saving && (
              <p className="candidate-saving">
                Saving your answer...
              </p>
            )}
          </div>

          {error && (
            <p className="candidate-exam-error">{error}</p>
          )}

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
            <span>
              <i className="palette-green" /> Answered
            </span>

            <span>
              <i className="palette-red" /> Visited / Unanswered
            </span>

            <span>
              <i className="palette-grey" /> Not Visited
            </span>

            <span>
              <i className="palette-orange" /> Current
            </span>
          </div>

          <div className="candidate-question-grid">
            {questions.map((question, index) => {
              const answered = Boolean(
                answers[question.question_id]
              );

              const wasVisited = visited.includes(index);

              let status = "palette-grey";

              if (answered) {
                status = "palette-green";
              } else if (wasVisited) {
                status = "palette-red";
              }

              if (index === currentIndex) {
                status = "palette-orange";
              }

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
            <p>
              Answered: <strong>{answeredCount}</strong>
            </p>
            <p>
              Remaining: <strong>{unansweredCount}</strong>
            </p>
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
        <span>
          <ShieldCheck size={16} />
          Your answers are saved securely.
        </span>

        <span>
          <LogOut size={16} />
          {isSixLevelIslamicQuiz
            ? "You may switch tabs; this exam will not terminate for tab switching."
            : "Do not leave this examination window."}
        </span>
      </div>

      {!isSixLevelIslamicQuiz && showViolationWarning && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(12, 28, 22, 0.72)",
            display: "grid",
            placeItems: "center",
            padding: 20
          }}
        >
          <section
            style={{
              maxWidth: 460,
              width: "100%",
              background: "#fff",
              color: "#173d32",
              borderRadius: 16,
              padding: 26,
              textAlign: "center",
              boxShadow: "0 18px 55px rgba(0,0,0,.25)"
            }}
          >
            <AlertTriangle
              size={42}
              color="#bd3c32"
            />

            <h2>EXAMINATION WARNING</h2>

            <p>
              You switched away from the examination window.
              This violation has been recorded.
            </p>

            <p>
              Violation: <strong>{violationCount} of 3</strong>
            </p>

            {warningSeconds > 0 ? (
              <>
                <strong
                  style={{
                    display: "block",
                    fontSize: 38,
                    color: "#bd3c32",
                    margin: "12px 0"
                  }}
                >
                  {formatTime(warningSeconds)}
                </strong>

                <p>
                  Return to the exam before the countdown ends.
                  Otherwise, your attempt will be terminated.
                </p>
              </>
            ) : (
              <p>
                Warning recorded. Please do not switch tabs again.
              </p>
            )}

            <button
              onClick={() => setShowViolationWarning(false)}
              style={{
                marginTop: 12,
                border: 0,
                background: "#176b50",
                color: "#fff",
                padding: "12px 22px",
                borderRadius: 8,
                cursor: "pointer"
              }}
            >
              <X size={16} /> Continue Examination
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

export default CandidateExam;