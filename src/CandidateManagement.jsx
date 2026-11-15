
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, RefreshCw, Download } from "lucide-react";
import { supabase } from "./supabase";

function CandidateManagement() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCandidates = async () => {
    setLoading(true);
    setError("");

    try {
      const { data: { user }, error: authError } =
        await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        navigate("/admin-login");
        return;
      }

      const { data: current, error: currentError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (currentError) throw currentError;
      if (!["admin", "super_admin"].includes(current.role)) {
        navigate("/admin-login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, mobile_number, address, pin_code, role, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCandidates((data || []).filter(item => item.role === "candidate"));
    } catch (err) {
      setError(err.message || "Unable to load candidates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
  }, []);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return candidates.filter(candidate =>
      [
        candidate.full_name,
        candidate.email,
        candidate.mobile_number,
        candidate.pin_code
      ].some(value => String(value || "").toLowerCase().includes(term))
    );
  }, [candidates, search]);

  const exportCSV = () => {
    const rows = [
      ["Name", "Email", "Mobile", "Address", "PIN Code", "Registration Date"],
      ...filtered.map(item => [
        item.full_name, item.email, item.mobile_number,
        item.address, item.pin_code, item.created_at
      ])
    ];

    const csv = rows.map(row =>
      row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "islamic-quiz-candidates.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main style={s.page}>
      <div style={s.container}>
        <button style={s.back} onClick={() => navigate("/admin")}>
          <ArrowLeft size={18} /> Admin Dashboard
        </button>

        <h1>CANDIDATE MANAGEMENT</h1>
        <p style={s.muted}>Registered candidate records.</p>

        <div style={s.toolbar}>
          <input
            style={s.input}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, mobile or PIN..."
          />
          <button style={s.button} onClick={loadCandidates}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button style={s.button} onClick={exportCSV}>
            <Download size={16} /> Export CSV
          </button>
        </div>

        <section style={s.stats}>
          <span>Total Registered Candidates</span>
          <strong>{candidates.length}</strong>
        </section>

        {error && <p style={s.error}>{error}</p>}

        {loading ? <p>Loading candidates...</p> : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Contact</th>
                  <th>Address</th>
                  <th>PIN Code</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(candidate => (
                  <tr key={candidate.id}>
                    <td>
                      <strong>{candidate.full_name || "—"}</strong>
                      <small style={s.small}>{candidate.id}</small>
                    </td>
                    <td>
                      {candidate.email || "—"}
                      <small style={s.small}>{candidate.mobile_number || "—"}</small>
                    </td>
                    <td>{candidate.address || "—"}</td>
                    <td>{candidate.pin_code || "—"}</td>
                    <td>{candidate.created_at ? new Date(candidate.created_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan="5">No candidates found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

const s = {
  page: { minHeight: "75vh", padding: "30px 16px", background: "#f5f7f4", color: "#173d32" },
  container: { maxWidth: 1150, margin: "auto" },
  back: { display: "flex", gap: 8, alignItems: "center", border: 0, background: "transparent", color: "#176b50", cursor: "pointer", marginBottom: 22 },
  muted: { color: "#718078" },
  toolbar: { display: "flex", flexWrap: "wrap", gap: 10, margin: "22px 0" },
  input: { flex: 1, minWidth: 240, padding: 11, border: "1px solid #d5e2da", borderRadius: 7 },
  button: { display: "flex", gap: 7, alignItems: "center", padding: "10px 14px", border: "1px solid #176b50", color: "#176b50", background: "white", borderRadius: 7, cursor: "pointer" },
  stats: { background: "white", padding: 20, borderRadius: 12, display: "flex", justifyContent: "space-between", marginBottom: 18, border: "1px solid #e5ebe6" },
  tableWrap: { overflowX: "auto", background: "white", borderRadius: 12, border: "1px solid #e5ebe6" },
  table: { width: "100%", minWidth: 850, borderCollapse: "collapse", textAlign: "left" },
  small: { display: "block", color: "#718078", fontSize: 11, marginTop: 4, maxWidth: 230, overflowWrap: "anywhere" },
  error: { color: "#b42318" }
};

export default CandidateManagement;
