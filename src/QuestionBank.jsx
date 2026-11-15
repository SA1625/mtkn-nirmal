
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Search, RefreshCw, Trash2, Pencil,
  BookOpen, X, Save, FileUp, Sparkles, Filter, Eye
} from "lucide-react";
import { supabase } from "./supabase";
import "./QuestionBank.css";

const emptyForm = {
  section: "A",
  question_type: "true_false",
  question_text: "",
  options: ["", "", "", ""],
  correct_answer: "True",
  topic: "",
  difficulty: "Foundation",
  explanation: "",
};

const difficulties = [
  "Foundation", "Beginner", "Intermediate",
  "Moderate", "Advanced", "Expert"
];

function QuestionBank() {
  const navigate = useNavigate();

  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadQuestions = async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("review_status", "approved")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setQuestions(data || []);
    } catch (err) {
      setError(err.message || "Unable to load questions.");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  const topics = useMemo(
    () => [...new Set(questions.map((q) => q.topic).filter(Boolean))].sort(),
    [questions]
  );

  const stats = useMemo(() => ({
    total: questions.length,
    trueFalse: questions.filter((q) => q.question_type === "true_false").length,
    mcq: questions.filter((q) => q.question_type === "mcq").length,
    ai: questions.filter((q) => q.ai_generated).length,
    manual: questions.filter((q) => !q.ai_generated).length,
  }), [questions]);

  const changeType = (type) => {
    setForm((prev) => ({
      ...prev,
      section: type === "true_false" ? "A" : "B",
      question_type: type,
      options: ["", "", "", ""],
      correct_answer: type === "true_false" ? "True" : "",
    }));
  };

  const updateOption = (index, value) => {
    setForm((prev) => {
      const options = [...prev.options];
      options[index] = value;
      return { ...prev, options };
    });
  };

  const openNewForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm, options: [...emptyForm.options] });
    setMessage("");
    setError("");
    setShowForm(true);
  };

  const openEditForm = (question) => {
    setEditingId(question.id);

    setForm({
      section: question.section || "A",
      question_type: question.question_type || "true_false",
      question_text: question.question_text || "",
      options: Array.isArray(question.options)
        ? [...question.options, "", "", "", ""].slice(0, 4)
        : ["", "", "", ""],
      correct_answer: question.correct_answer || "True",
      topic: question.topic || "",
      difficulty: question.difficulty || "Foundation",
      explanation: question.explanation || "",
    });

    setMessage("");
    setError("");
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    const questionText = form.question_text.trim();
    const topic = form.topic.trim();
    const explanation = (form.explanation || "").trim();

    if (!questionText || !topic) {
      setMessage("Please enter the question and topic.");
      return;
    }

    const duplicate = questions.find(
      (q) =>
        q.id !== editingId &&
        q.question_text.trim().toLowerCase() === questionText.toLowerCase()
    );

    if (duplicate) {
      setMessage(
        `Duplicate question found. Existing question ID: ${duplicate.id}`
      );
      return;
    }

    let options = null;
    let correctAnswer = form.correct_answer.trim();

    if (form.question_type === "mcq") {
      options = form.options.map((option) => option.trim());

      if (options.some((option) => !option)) {
        setMessage("Please enter all four options.");
        return;
      }

      if (new Set(options.map((o) => o.toLowerCase())).size !== 4) {
        setMessage("All four options must be different.");
        return;
      }

      if (!options.includes(correctAnswer)) {
        setMessage("Please select the correct answer.");
        return;
      }
    }

    if (
      form.question_type === "true_false" &&
      !["True", "False"].includes(correctAnswer)
    ) {
      setMessage("Please select True or False.");
      return;
    }

    const payload = {
      section: form.question_type === "true_false" ? "A" : "B",
      question_type: form.question_type,
      question_text: questionText,
      options,
      correct_answer: correctAnswer,
      topic,
      difficulty: form.difficulty,
      explanation: explanation || null,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);

    try {
      let result;

      if (editingId) {
        result = await supabase
          .from("quiz_questions")
          .update(payload)
          .eq("id", editingId)
          .select("id")
          .maybeSingle();
      } else {
        result = await supabase
          .from("quiz_questions")
          .insert({
            ...payload,
            review_status: "approved",
            ai_generated: false,
          })
          .select("id")
          .single();
      }

      if (result.error) throw result.error;

      if (!result.data?.id) {
        throw new Error("No question was saved. Check admin permissions.");
      }

      setMessage(
        editingId
          ? "Question updated successfully!"
          : "Question added successfully!"
      );

      setShowForm(false);
      setForm({ ...emptyForm, options: [...emptyForm.options] });
      setEditingId(null);

      await loadQuestions();
    } catch (err) {
      setMessage(err.message || "Unable to save question.");
    } finally {
      setSaving(false);
    }
  };

  const deleteQuestion = async (id) => {
    if (!window.confirm("Are you sure you want to delete this question?")) {
      return;
    }

    setError("");

    try {
      const { error } = await supabase
        .from("quiz_questions")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setSelectedQuestion(null);
      await loadQuestions();
    } catch (err) {
      setError(err.message || "Unable to delete question.");
    }
  };

  const filteredQuestions = questions.filter((question) => {
    const term = search.toLowerCase();

    const matchesSearch =
      (question.question_text || "").toLowerCase().includes(term) ||
      (question.topic || "").toLowerCase().includes(term) ||
      (question.source_question || "").toLowerCase().includes(term);

    const matchesType =
      typeFilter === "all" || question.question_type === typeFilter;

    const matchesDifficulty =
      difficultyFilter === "all" ||
      question.difficulty === difficultyFilter;

    const matchesTopic =
      topicFilter === "all" || question.topic === topicFilter;

    const matchesSource =
      sourceFilter === "all" ||
      (sourceFilter === "ai" && question.ai_generated) ||
      (sourceFilter === "manual" && !question.ai_generated);

    return (
      matchesSearch &&
      matchesType &&
      matchesDifficulty &&
      matchesTopic &&
      matchesSource
    );
  });

  return (
    <main className="qb-page">
      <div className="qb-container">

        <button className="qb-back" onClick={() => navigate("/admin")}>
          <ArrowLeft size={18} />
          Back to Admin Dashboard
        </button>

        <header className="qb-heading">
          <div>
            <span>ADMINISTRATION</span>
            <h1>QUESTION BANK</h1>
            <p>Manage approved Islamic Quiz questions.</p>
          </div>

          <div className="qb-head-actions">
            <button
              className="qb-import"
              onClick={() => navigate("/admin/questions/import")}
            >
              <FileUp size={18} />
              Import PDF
            </button>

            <button
              className="qb-review-link"
              onClick={() => navigate("/admin/question-review")}
            >
              <Sparkles size={18} />
              AI Review
            </button>

            <button className="qb-add" onClick={openNewForm}>
              <Plus size={18} />
              Add Question
            </button>
          </div>
        </header>

        <section className="qb-stats-grid">
          <div className="qb-stats">
            <BookOpen size={27} />
            <div><p>TOTAL APPROVED</p><h2>{stats.total}</h2></div>
          </div>
          <div className="qb-stats">
            <BookOpen size={27} />
            <div><p>TRUE / FALSE</p><h2>{stats.trueFalse}</h2></div>
          </div>
          <div className="qb-stats">
            <BookOpen size={27} />
            <div><p>MCQ QUESTIONS</p><h2>{stats.mcq}</h2></div>
          </div>
          <div className="qb-stats">
            <Sparkles size={27} />
            <div><p>AI GENERATED</p><h2>{stats.ai}</h2></div>
          </div>
        </section>

        {showForm && (
          <section className="qb-form-card">
            <div className="qb-form-heading">
              <h2>{editingId ? "EDIT QUESTION" : "ADD NEW QUESTION"}</h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Close form"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <label>Question Type</label>
              <select
                value={form.question_type}
                onChange={(e) => changeType(e.target.value)}
              >
                <option value="true_false">True / False — Section A</option>
                <option value="mcq">Multiple Choice — Section B</option>
              </select>

              <label>Question</label>
              <textarea
                rows="3"
                value={form.question_text}
                onChange={(e) =>
                  setForm({ ...form, question_text: e.target.value })
                }
                placeholder="Enter your question..."
                required
              />

              {form.question_type === "mcq" && (
                <>
                  <label>Four Options</label>
                  {form.options.map((option, index) => (
                    <input
                      key={index}
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      required
                    />
                  ))}

                  <label>Correct Option</label>
                  <select
                    value={form.correct_answer}
                    onChange={(e) =>
                      setForm({ ...form, correct_answer: e.target.value })
                    }
                    required
                  >
                    <option value="">Select correct option</option>
                    {form.options.map((option, index) => (
                      <option
                        key={index}
                        value={option}
                        disabled={!option.trim()}
                      >
                        {option.trim() || `Option ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {form.question_type === "true_false" && (
                <>
                  <label>Correct Answer</label>
                  <select
                    value={form.correct_answer}
                    onChange={(e) =>
                      setForm({ ...form, correct_answer: e.target.value })
                    }
                  >
                    <option value="True">True</option>
                    <option value="False">False</option>
                  </select>
                </>
              )}

              <label>Topic</label>
              <input
                value={form.topic}
                onChange={(e) =>
                  setForm({ ...form, topic: e.target.value })
                }
                placeholder="Enter topic"
                required
              />

              <label>Difficulty</label>
              <select
                value={form.difficulty}
                onChange={(e) =>
                  setForm({ ...form, difficulty: e.target.value })
                }
              >
                {difficulties.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>

              <label>Explanation (Optional)</label>
              <textarea
                rows="2"
                value={form.explanation}
                onChange={(e) =>
                  setForm({ ...form, explanation: e.target.value })
                }
                placeholder="Enter explanation..."
              />

              {message && <p className="qb-message">{message}</p>}

              <button className="qb-save" type="submit" disabled={saving}>
                <Save size={17} />
                {saving ? "Saving..." : "Save Question"}
              </button>
            </form>
          </section>
        )}

        <section className="qb-filter-panel">
          <div className="qb-search">
            <Search size={19} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions, topics or source..."
            />
            <button onClick={loadQuestions} disabled={loading}>
              <RefreshCw size={17} />
            </button>
          </div>

          <div className="qb-filters">
            <label><Filter size={15} /> Filters</label>

            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              <option value="true_false">True / False</option>
              <option value="mcq">MCQ</option>
            </select>

            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
            >
              <option value="all">All Difficulties</option>
              {difficulties.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>

            <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
              <option value="all">All Topics</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>{topic}</option>
              ))}
            </select>

            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="all">All Sources</option>
              <option value="ai">AI Generated</option>
              <option value="manual">Manual Entry</option>
            </select>
          </div>
        </section>

        {error && <p className="qb-error">{error}</p>}

        <p className="qb-result-count">
          Showing {filteredQuestions.length} of {questions.length} approved questions
        </p>

        {loading ? (
          <p className="qb-empty">Loading questions...</p>
        ) : filteredQuestions.length === 0 ? (
          <p className="qb-empty">No approved questions found.</p>
        ) : (
          <section className="qb-list">
            {filteredQuestions.map((question, index) => (
              <article className="qb-question-card" key={question.id}>
                <div className="qb-question-top">
                  <span>QUESTION {index + 1}</span>
                  <span>{question.question_type === "mcq" ? "MCQ" : "TRUE / FALSE"}</span>
                  <span>{question.difficulty}</span>
                  <span>{question.ai_generated ? "AI GENERATED" : "MANUAL"}</span>
                </div>

                <h3>{question.question_text}</h3>

                <p className="qb-meta">
                  Topic: {question.topic} · Section {question.section}
                </p>

                {question.question_type === "mcq" && (
                  <ol className="qb-options" type="A">
                    {(question.options || []).map((option, i) => (
                      <li
                        key={i}
                        className={option === question.correct_answer ? "qb-correct-option" : ""}
                      >
                        {option}
                        {option === question.correct_answer && " ✓"}
                      </li>
                    ))}
                  </ol>
                )}

                <p className="qb-answer">
                  Correct Answer: {question.correct_answer}
                </p>

                {question.source_batch_id && (
                  <div className="qb-source-info">
                    <strong>PDF IMPORTED QUESTION</strong>
                    <p>Source page: {question.source_page || "Not identified"}</p>
                    {question.source_question && (
                      <details>
                        <summary>View original source Q&A</summary>
                        <p>{question.source_question}</p>
                      </details>
                    )}
                  </div>
                )}

                {question.explanation && (
                  <p className="qb-explanation">
                    <strong>Explanation:</strong> {question.explanation}
                  </p>
                )}

                <div className="qb-actions">
                  <button onClick={() => setSelectedQuestion(question)}>
                    <Eye size={16} /> Preview
                  </button>
                  <button onClick={() => openEditForm(question)}>
                    <Pencil size={16} /> Edit
                  </button>
                  <button onClick={() => deleteQuestion(question.id)}>
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        {selectedQuestion && (
          <div className="qb-modal-backdrop" onClick={() => setSelectedQuestion(null)}>
            <div className="qb-preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="qb-form-heading">
                <h2>QUESTION PREVIEW</h2>
                <button onClick={() => setSelectedQuestion(null)}>
                  <X size={20} />
                </button>
              </div>
              <h3>{selectedQuestion.question_text}</h3>
              <p>Topic: {selectedQuestion.topic}</p>
              <p>Difficulty: {selectedQuestion.difficulty}</p>
              <p>Correct Answer: <strong>{selectedQuestion.correct_answer}</strong></p>
              {selectedQuestion.explanation && <p>{selectedQuestion.explanation}</p>}
              {selectedQuestion.source_question && (
                <div className="qb-source-info">
                  <strong>Original source Q&A</strong>
                  <p>{selectedQuestion.source_question}</p>
                </div>
              )}
              <button className="qb-save" onClick={() => setSelectedQuestion(null)}>
                Close Preview
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}

export default QuestionBank;
