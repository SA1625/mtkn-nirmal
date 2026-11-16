import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ShieldCheck,
  RefreshCw,
  UserCog,
  Users,
  Search,
  UserPlus,
  UserMinus,
  Crown,
} from "lucide-react";
import { supabase } from "./supabase";
import "./AdminManagement.css";

export default function AdminManagement() {
  const navigate = useNavigate();
  const [myRole, setMyRole] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [activeTab, setActiveTab] = useState("candidates");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadProfiles = async () => {
    setLoading(true);
    setError("");

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        navigate("/admin-login", { replace: true });
        return;
      }

      const { data: current, error: currentError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (currentError) throw currentError;
      if (current?.role !== "super_admin") {
        setMyRole(current?.role || "");
        setError("Only the Super Admin can access Admin Management.");
        return;
      }

      setMyRole(current.role);

      // These profile fields are already used by Candidate Management.
      const { data, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email, mobile_number, role, created_at")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;
      setProfiles(data || []);
    } catch (err) {
      setError(err.message || "Unable to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // The loader performs async Supabase work and sets loading/data state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const candidates = useMemo(
    () => profiles.filter((item) => item.role === "candidate"),
    [profiles]
  );

  const admins = useMemo(
    () => profiles.filter((item) => ["admin", "super_admin"].includes(item.role)),
    [profiles]
  );

  const currentRows = activeTab === "candidates" ? candidates : admins;
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return currentRows;
    return currentRows.filter((item) =>
      [item.full_name, item.email, item.mobile_number, item.id]
        .some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [currentRows, search]);

  const updateRole = async (person, nextRole) => {
    if (myRole !== "super_admin") {
      setError("Only the Super Admin can change roles.");
      return;
    }
    if (person.role === "super_admin") {
      setError("The Super Admin account is protected.");
      return;
    }
    if (!["admin", "candidate"].includes(nextRole)) {
      setError("Invalid role selected.");
      return;
    }

    const action = nextRole === "admin" ? "promote to Admin" : "demote to Candidate";
    if (!window.confirm(`Are you sure you want to ${action}: ${person.full_name || person.email || person.id}?`)) {
      return;
    }

    setSavingId(person.id);
    setError("");
    setMessage("");

    try {
      const { error: rpcError } = await supabase.rpc("change_user_role", {
        p_user_id: person.id,
        p_new_role: nextRole,
      });
      if (rpcError) throw rpcError;

      setMessage(`${person.full_name || "User"} is now ${nextRole === "admin" ? "an Admin" : "a Candidate"}.`);
      await loadProfiles();
      setActiveTab(nextRole === "admin" ? "admins" : "candidates");
    } catch (err) {
      setError(err.message || "Unable to update user role.");
    } finally {
      setSavingId("");
    }
  };

  if (myRole && myRole !== "super_admin") {
    return (
      <main className="am-page">
        <div className="am-container">
          <button className="am-back" onClick={() => navigate("/admin")}>
            <ArrowLeft size={18} /> Admin Dashboard
          </button>
          <section className="am-notice am-error">
            <ShieldCheck size={24} /> Only the Super Admin can manage administrator accounts.
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="am-page">
      <div className="am-container">
        <button className="am-back" onClick={() => navigate("/admin")}>
          <ArrowLeft size={18} /> Admin Dashboard
        </button>

        <header className="am-header">
          <div className="am-heading-icon"><ShieldCheck size={30} /></div>
          <div>
            <h1>ADMIN MANAGEMENT</h1>
            <p>Promote registered candidates to Admin and manage existing administrator access.</p>
          </div>
        </header>

        <section className="am-stats">
          <div><Users size={20} /><span>Registered Candidates</span><strong>{candidates.length}</strong></div>
          <div><UserCog size={20} /><span>Administrators</span><strong>{admins.filter((x) => x.role === "admin").length}</strong></div>
          <div><Crown size={20} /><span>Super Admin</span><strong>{admins.filter((x) => x.role === "super_admin").length}</strong></div>
        </section>

        <section className="am-notice">
          <strong>Your role: SUPER ADMIN</strong>
          <p>To add a new Admin, the person must first register through the normal Candidate Registration page. Their account will then appear in Registered Candidates below.</p>
        </section>

        {error && <div className="am-alert am-error">{error}</div>}
        {message && <div className="am-alert am-success">{message}</div>}

        <div className="am-toolbar">
          <div className="am-tabs">
            <button className={activeTab === "candidates" ? "active" : ""} onClick={() => { setActiveTab("candidates"); setSearch(""); }}>
              <Users size={16} /> Registered Candidates ({candidates.length})
            </button>
            <button className={activeTab === "admins" ? "active" : ""} onClick={() => { setActiveTab("admins"); setSearch(""); }}>
              <ShieldCheck size={16} /> Administrators ({admins.length})
            </button>
          </div>
          <button className="am-refresh" onClick={loadProfiles} disabled={loading || !!savingId}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        <label className="am-search">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, mobile or user ID..." />
        </label>

        {loading ? (
          <div className="am-empty">Loading user accounts...</div>
        ) : filteredRows.length === 0 ? (
          <div className="am-empty">{activeTab === "candidates" ? "No registered candidates found." : "No administrator accounts found."}</div>
        ) : (
          <div className="am-table-wrap">
            <table className="am-table">
              <thead>
                <tr><th>User</th><th>Contact</th><th>Role</th><th>Registered</th><th>Action</th></tr>
              </thead>
              <tbody>
                {filteredRows.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <strong>{person.full_name || "Unnamed user"}</strong>
                      <small className="am-user-id">{person.id}</small>
                    </td>
                    <td>{person.email || "—"}<small>{person.mobile_number || "—"}</small></td>
                    <td><span className={`am-role ${person.role}`}>{person.role.replace("_", " ").toUpperCase()}</span></td>
                    <td>{person.created_at ? new Date(person.created_at).toLocaleDateString() : "—"}</td>
                    <td>
                      {person.role === "super_admin" ? (
                        <span className="am-protected"><Crown size={14} /> Protected account</span>
                      ) : person.role === "candidate" ? (
                        <button className="am-promote" onClick={() => updateRole(person, "admin")} disabled={savingId === person.id}>
                          <UserPlus size={16} /> {savingId === person.id ? "Updating..." : "Make Admin"}
                        </button>
                      ) : (
                        <button className="am-demote" onClick={() => updateRole(person, "candidate")} disabled={savingId === person.id}>
                          <UserMinus size={16} /> {savingId === person.id ? "Updating..." : "Remove Admin"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="am-footer-note">Role changes take effect immediately. The Super Admin account cannot be changed from this screen.</p>
      </div>
    </main>
  );
}
