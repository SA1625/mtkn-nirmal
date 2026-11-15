
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import {
  Search, Download, RefreshCw, FileText,
  Users, Award, CheckCircle, AlertTriangle
} from "lucide-react";

const BRAND = "MAJLISE TAHAFFUZE KHATME NUBUWWAT TRUST";

function downloadCSV(rows, filename) {
  if (!rows.length) {
    alert("No records available to export.");
    return;
  }

  const headers = [
    "Candidate Name",
    "Email",
    "Mobile",
    "Exam",
    "Level",
    "Marks",
    "Correct",
    "Wrong",
    "Attempted",
    "Status",
    "Published Date"
  ];

  const escape = (value) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const csv = [
    headers.map(escape).join(","),
    ...rows.map((row) => [
      row.candidate?.full_name,
      row.candidate?.email,
      row.candidate?.mobile_number,
      row.exam?.exam_name,
      row.exam?.level_name,
      row.marks_obtained,
      row.correct_answers,
      row.wrong_answers,
      row.attempted_questions,
      row.result_status || "Submitted",
      row.published_at
        ? new Date(row.published_at).toLocaleString("en-IN")
        : ""
    ].map(escape).join(","))
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminResults() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [examFilter, setExamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adminName, setAdminName] = useState("");

  const loadResults = async () => {
    setLoading(true);
    setError("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      const user = authData?.user;
      if (!user) throw new Error("Please log in.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      if (!["admin", "super_admin"].includes(profile.role)) {
        throw new Error("You are not authorized to view examination results.");
      }

      setAdminName(profile.full_name || "Administrator");

      const { data: resultRows, error: resultError } = await supabase
        .from("exam_results")
        .select(`
          id,
          attempt_id,
          exam_id,
          candidate_id,
          total_questions,
          attempted_questions,
          correct_answers,
          wrong_answers,
          marks_obtained,
          result_status,
          published_at
        `)
        .order("published_at", { ascending: false });

      if (resultError) throw resultError;

      const candidateIds = [
        ...new Set((resultRows || []).map((row) => row.candidate_id))
      ];

      const examIds = [
        ...new Set((resultRows || []).map((row) => row.exam_id))
      ];

      let candidateMap = {};
      let examMap = {};

      if (candidateIds.length) {
        const { data, error: candidatesError } = await supabase
          .from("profiles")
          .select("id, full_name, email, mobile_number")
          .in("id", candidateIds);

        if (candidatesError) throw candidatesError;

        candidateMap = Object.fromEntries(
          (data || []).map((item) => [item.id, item])
        );
      }

      if (examIds.length) {
        const { data, error: examsError } = await supabase
          .from("exams")
          .select("id, exam_name, level_name, level_order")
          .in("id", examIds);

        if (examsError) throw examsError;

        examMap = Object.fromEntries(
          (data || []).map((item) => [item.id, item])
        );
      }

      const combined = (resultRows || []).map((row) => ({
        ...row,
        candidate: candidateMap[row.candidate_id] || {},
        exam: examMap[row.exam_id] || {}
      }));

      setResults(combined);
    } catch (err) {
      setError(err.message || "Unable to load examination results.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, []);

  const examOptions = useMemo(() => {
    const map = new Map();

    results.forEach((row) => {
      if (row.exam?.id) {
        map.set(row.exam.id, row.exam.exam_name || row.exam.level_name);
      }
    });

    return [...map.entries()];
  }, [results]);

  const filteredResults = useMemo(() => {
    return results.filter((row) => {
      const candidateName = row.candidate?.full_name || "";
      const email = row.candidate?.email || "";
      const mobile = row.candidate?.mobile_number || "";
      const examName = row.exam?.exam_name || "";
      const levelName = row.exam?.level_name || "";

      const searchMatch = [
        candidateName, email, mobile, examName, levelName
      ].some((value) =>
        value.toLowerCase().includes(search.toLowerCase())
      );

      const examMatch =
        examFilter === "all" || row.exam_id === examFilter;

      const status = String(row.result_status || "submitted").toLowerCase();

      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "completed" &&
          ["submitted", "completed", "published"].includes(status)) ||
        (statusFilter === "other" &&
          !["submitted", "completed", "published"].includes(status));

      return searchMatch && examMatch && statusMatch;
    });
  }, [results, search, examFilter, statusFilter]);

  const totalMarks = filteredResults.reduce(
    (sum, row) => sum + Number(row.marks_obtained || 0),
    0
  );

  const average = filteredResults.length
    ? totalMarks / filteredResults.length
    : 0;

  const uniqueCandidates = new Set(
    filteredResults.map((row) => row.candidate_id)
  ).size;

  const styles = {
    page: {
      padding: "24px",
      maxWidth: 1400,
      margin: "0 auto",
      color: "#173b30"
    },
    heading: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 15,
      marginBottom: 22
    },
    brand: {
      color: "#08734e",
      fontWeight: 800,
      fontSize: 19
    },
    muted: { color: "#718078", fontSize: 13 },
    button: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 14px",
      border: "none",
      borderRadius: 9,
      background: "#08734e",
      color: "white",
      cursor: "pointer",
      fontWeight: 600
    },
    cardGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
      gap: 14,
      marginBottom: 22
    },
    card: {
      background: "white",
      border: "1px solid #e1eae4",
      borderRadius: 12,
      padding: 18
    },
    filters: {
      display: "flex",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 18
    },
    input: {
      padding: "11px 13px",
      border: "1px solid #d5e0d9",
      borderRadius: 9,
      background: "white",
      minWidth: 180,
      flex: 1
    },
    tableWrap: {
      overflowX: "auto",
      background: "white",
      border: "1px solid #e1eae4",
      borderRadius: 12
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      minWidth: 950
    },
    th: {
      padding: 13,
      background: "#edf5ef",
      textAlign: "left",
      fontSize: 12,
      whiteSpace: "nowrap"
    },
    td: {
      padding: 13,
      borderTop: "1px solid #edf0ed",
      fontSize: 13
    },
    badge: {
      display: "inline-block",
      background: "#e4f4eb",
      color: "#08734e",
      padding: "5px 9px",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 700
    }
  };

  return (
    <main style={styles.page}>
      <div style={styles.heading}>
        <div>
          <div style={styles.brand}>{BRAND}</div>
          <div style={styles.muted}>ADMINISTRATION · EXAMINATION REPORTS</div>
          <h1 style={{ marginBottom: 4 }}>Candidate Results</h1>
          <div style={styles.muted}>
            Welcome, {adminName}
          </div>
        </div>

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <button style={styles.button} onClick={loadResults}>
            <RefreshCw size={16} /> Refresh
          </button>

          <button
            style={styles.button}
            onClick={() => downloadCSV(filteredResults, "Islamic-Quiz-Results.csv")}
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: 14,
          background: "#fff0ee",
          color: "#a52d24",
          borderRadius: 9,
          marginBottom: 18
        }}>
          <AlertTriangle size={17} /> {error}
        </div>
      )}

      <section style={styles.cardGrid}>
        <div style={styles.card}>
          <Users color="#08734e" />
          <h2>{uniqueCandidates}</h2>
          <div style={styles.muted}>Candidates in results</div>
        </div>

        <div style={styles.card}>
          <FileText color="#08734e" />
          <h2>{filteredResults.length}</h2>
          <div style={styles.muted}>Examination results</div>
        </div>

        <div style={styles.card}>
          <Award color="#08734e" />
          <h2>{average.toFixed(2)}</h2>
          <div style={styles.muted}>Average marks per exam</div>
        </div>

        <div style={styles.card}>
          <CheckCircle color="#08734e" />
          <h2>{filteredResults.filter((row) =>
            Number(row.marks_obtained) >= 0
          ).length}</h2>
          <div style={styles.muted}>Published result records</div>
        </div>
      </section>

      <section style={styles.filters}>
        <div style={{
          ...styles.input,
          display: "flex",
          alignItems: "center",
          gap: 8
        }}>
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidate, email, mobile or exam..."
            style={{ border: 0, outline: 0, width: "100%" }}
          />
        </div>

        <select
          style={styles.input}
          value={examFilter}
          onChange={(e) => setExamFilter(e.target.value)}
        >
          <option value="all">All examinations</option>
          {examOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>

        <select
          style={styles.input}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="other">Other statuses</option>
        </select>
      </section>

      <section style={styles.tableWrap}>
        {loading ? (
          <p style={{ padding: 25 }}>Loading candidate results...</p>
        ) : filteredResults.length === 0 ? (
          <p style={{ padding: 25 }}>No examination results found.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {[
                  "Candidate",
                  "Contact",
                  "Examination",
                  "Level",
                  "Marks",
                  "Correct",
                  "Wrong",
                  "Attempted",
                  "Status",
                  "Date"
                ].map((heading) => (
                  <th style={styles.th} key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredResults.map((row) => (
                <tr key={row.id}>
                  <td style={styles.td}>
                    <strong>{row.candidate?.full_name || "Unknown"}</strong>
                    <div style={styles.muted}>
                      {row.candidate?.email || ""}
                    </div>
                  </td>

                  <td style={styles.td}>
                    {row.candidate?.mobile_number || "—"}
                  </td>

                  <td style={styles.td}>
                    {row.exam?.exam_name || "Examination"}
                  </td>

                  <td style={styles.td}>
                    {row.exam?.level_name || "—"}
                  </td>

                  <td style={styles.td}>
                    <strong>{row.marks_obtained ?? 0}/100</strong>
                  </td>

                  <td style={styles.td}>{row.correct_answers ?? 0}</td>
                  <td style={styles.td}>{row.wrong_answers ?? 0}</td>
                  <td style={styles.td}>{row.attempted_questions ?? 0}</td>

                  <td style={styles.td}>
                    <span style={styles.badge}>
                      {row.result_status || "Submitted"}
                    </span>
                  </td>

                  <td style={styles.td}>
                    {row.published_at
                      ? new Date(row.published_at).toLocaleDateString("en-IN")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p style={{ ...styles.muted, marginTop: 14 }}>
        Showing {filteredResults.length} result record(s). Reports are visible
        only to authorized administrators.
      </p>
    </main>
  );
}
