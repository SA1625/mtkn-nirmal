
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Search, RefreshCw, Trash2, Pencil,
  BookOpen, X, Save, FileUp
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

function QuestionBank() {
  const navigate = useNavigate();

  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
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

    const questionText = (form.question_text || "").trim();
    const topic = (form.topic || "").trim();
    const explanation = (form.explanation || "").trim();

    if (!questionText || !topic) {
      setMessage("Please enter the question and topic.");
      return;
    }

    if (form.question_type === "mcq") {
      const options = (form.options || []).map((option) =>
        (option || "").trim()
      );

      if (options.some((option) => !option)) {
        setMessage("Please enter all four options.");
        return;
      }

      if (!form.correct_answer || !options.includes(form.correct_answer)) {
        setMessage("Please select the correct answer.");
        return;
      }

      if (new Set(options).size !== 4) {
        setMessage("All four options must be different.");
        return;
      }
    }

    if (
      form.question_type === "true_false" &&
      !["True", "False"].includes(form.correct_answer)
    ) {
      setMessage("Please select True or False.");
      return;
    }

    const payload = {
      section: form.question_type === "true_false" ? "A" : "B",
      question_type: form.question_type,
      question_text: questionText,
      options:
        form.question_type === "mcq"
          ? form.options.map((option) => option.trim())
          : null,
      correct_answer: form.correct_answer,
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
          .insert(payload)
          .select("id")
          .single();
      }

      if (result.error) {
        throw result.error;
      }

      if (!result.data?.id) {
        throw new Error(
          "No question was updated. Please check your admin permissions and database policies."
        );
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

      await loadQuestions();
    } catch (err) {
      setError(err.message || "Unable to delete question.");
    }
  };

  const filteredQuestions = questions.filter((question) => {
    const term = search.toLowerCase();

    return (
      (question.question_text || "").toLowerCase().includes(term) ||
      (question.topic || "").toLowerCase().includes(term)
    );
  });

  return (
    <main className="qb-page">
      <div className="qb-container">

        <button
          className="qb-back"
          onClick={() => navigate("/admin")}
        >
          <ArrowLeft size={18} />
          Back to Admin Dashboard
        </button>

        <header className="qb-heading">
          <div>
            <span>ADMINISTRATION</span>
            <h1>QUESTION BANK</h1>
            <p>Manage Islamic Quiz questions.</p>
          </div>

          <div className="qb-head-actions">
            <button
              className="qb-import"
              onClick={() => navigate("/admin/questions/import")}
            >
              <FileUp size={18} />
              Import PDF
            </button>

            <button className="qb-add" onClick={openNewForm}>
              <Plus size={18} />
              Add Question
            </button>
          </div>
        </header>

        <div className="qb-stats">
          <BookOpen size={28} />
          <div>
            <p>TOTAL QUESTIONS</p>
            <h2>{questions.length}</h2>
          </div>
        </div>

        {showForm && (
          <section className="qb-form-card">

            <div className="qb-form-heading">
              <h2>{editingId ? "EDIT QUESTION" : "ADD NEW QUESTION"}</h2>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setMessage("");
                }}
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
                <option value="true_false">
                  True / False — Section A
                </option>
                <option value="mcq">
                  Multiple Choice — Section B
                </option>
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
                      onChange={(e) =>
                        updateOption(index, e.target.value)
                      }
                      placeholder={`Option ${index + 1}`}
                      required
                    />
                  ))}

                  <label>Correct Option</label>
                  <select
                    value={form.correct_answer}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        correct_answer: e.target.value,
                      })
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
                      setForm({
                        ...form,
                        correct_answer: e.target.value,
                      })
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
                {[
                  "Foundation",
                  "Beginner",
                  "Intermediate",
                  "Moderate",
                  "Advanced",
                  "Expert",
                ].map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
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

              {message && (
                <p className="qb-message" role="alert">
                  {message}
                </p>
              )}

              <button
                className="qb-save"
                type="submit"
                disabled={saving}
              >
                <Save size={17} />
                {saving ? "Saving..." : "Save Question"}
              </button>

            </form>
          </section>
        )}

        <div className="qb-search">
          <Search size={19} />

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions or topics..."
          />

          <button onClick={loadQuestions} disabled={loading}>
            <RefreshCw size={17} />
          </button>
        </div>

        {error && <p className="qb-error">{error}</p>}

        {loading ? (
          <p className="qb-empty">Loading questions...</p>
        ) : filteredQuestions.length === 0 ? (
          <p className="qb-empty">
            No questions found. Add your first question.
          </p>
        ) : (
          <section className="qb-list">
            {filteredQuestions.map((question, index) => (
              <article className="qb-question-card" key={question.id}>

                <div className="qb-question-top">
                  <span>QUESTION {index + 1}</span>
                  <span>
                    {question.question_type === "mcq"
                      ? "MCQ"
                      : "TRUE / FALSE"}
                  </span>
                </div>

                <h3>{question.question_text}</h3>

                <p>
                  Topic: {question.topic} · {question.difficulty}
                </p>

                {question.question_type === "mcq" && (
                  <ol className="qb-options">
                    {(question.options || []).map((option, i) => (
                      <li key={i}>{option}</li>
                    ))}
                  </ol>
                )}

                <p className="qb-answer">
                  Correct Answer: {question.correct_answer}
                </p>

                <div className="qb-actions">
                  <button onClick={() => openEditForm(question)}>
                    <Pencil size={16} />
                    Edit
                  </button>

                  <button onClick={() => deleteQuestion(question.id)}>
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>

              </article>
            ))}
          </section>
        )}

      </div>
    </main>
  );
}

export default QuestionBank;
