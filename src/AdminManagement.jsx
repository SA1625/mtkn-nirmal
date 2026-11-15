
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, RefreshCw, UserCog } from "lucide-react";
import { supabase } from "./supabase";

function AdminManagement() {
  const navigate = useNavigate();

  const [admins, setAdmins] = useState([]);
  const [myRole, setMyRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadAdmins = async () => {
    setLoading(true);
    setError("");
    setMessage("");

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

      setMyRole(current.role);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, mobile_number, role, created_at")
        .in("role", ["admin", "super_admin"])
        .order("created_at", { ascending: true });

      if (error) throw error;
      setAdmins(data || []);
    } catch (err) {
      setError(err.message || "Unable to load administrators.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const changeRole = async (admin, newRole) => {
    if (myRole !== "super_admin") {
      setError("Only the Super Admin can change administrator roles.");
      return;
    }

    if (admin.role === "super_admin") {
      setError("Super Admin role cannot be changed from this screen.");
      return;
    }

    if (!window.confirm(`Change ${admin.full_name}'s role to ${newRole}?`)) {
      return;
    }

    setSavingId(admin.id);
    setError("");
    setMessage("");

    try {
      const { error } = await supabase.rpc("change_user_role", {
        p_user_id: admin.id,
        p_new_role: newRole
      });

      if (error) throw error;

      setMessage("Administrator role updated successfully.");
      await loadAdmins();
    } catch (err) {
      setError(err.message || "Unable to change administrator role.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main style={s.page}>
      <div style={s.container}>
        <button style={s.back} onClick={() => navigate("/admin")}>
          <ArrowLeft size={18} /> Admin Dashboard
        </button>

        <header style={s.header}>
          <ShieldCheck size={36} color="#176b50" />
          <div>
            <h1>ADMIN MANAGEMENT</h1>
            <p style={s.muted}>Manage administrator accounts and access roles.</p>
          </div>
        </header>

        <section style={s.notice}>
          <strong>Your role: {myRole || "Checking..."}</strong>
          <p>
            Super Admin has authority to manage administrator roles.
            Regular Admin accounts cannot promote or demote other administrators.
          </p>
        </section>

        {error && <p style={s.error}>{error}</p>}
        {message && <p style={s.success}>{message}</p>}

        <button style={s.refresh} onClick={loadAdmins}>
          <RefreshCw size={16} /> Refresh Administrators
        </button>

        {loading ? <p>Loading administrators...</p> : (
          <div style={s.list}>
            {admins.map(admin => (
              <article key={admin.id} style={s.card}>
                <div style={s.avatar}><UserCog size={22} /></div>

                <div style={{ flex: 1 }}>
                  <strong>{admin.full_name || "Administrator"}</strong>
                  <p style={s.muted}>{admin.email}</p>
                  <small style={s.muted}>{admin.mobile_number || ""}</small>
                  <div style={s.role}>{admin.role.replace("_", " ").toUpperCase()}</div>
                </div>

                {myRole === "super_admin" && admin.role !== "super_admin" && (
                  <select
                    style={s.select}
                    value={admin.role}
                    disabled={savingId === admin.id}
                    onChange={e => changeRole(admin, e.target.value)}
                  >
                    <option value="admin">Admin</option>
                    <option value="candidate">Candidate</option>
                  </select>
                )}
              </article>
            ))}
            {!admins.length && <p>No administrator accounts found.</p>}
          </div>
        )}
      </div>
    </main>
  );
}

const s = {
  page: { minHeight: "75vh", padding: "30px 16px", background: "#f5f7f4", color: "#173d32" },
  container: { maxWidth: 900, margin: "auto" },
  back: { display: "flex", gap: 8, alignItems: "center", border: 0, background: "transparent", color: "#176b50", cursor: "pointer", marginBottom: 22 },
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 22 },
  muted: { color: "#718078", margin: "5px 0" },
  notice: { padding: 18, background: "#edf5ef", borderRadius: 10, marginBottom: 20 },
  list: { display: "grid", gap: 12, marginTop: 18 },
  card: { display: "flex", alignItems: "center", gap: 15, background: "white", padding: 18, borderRadius: 12, border: "1px solid #e5ebe6" },
  avatar: { width: 44, height: 44, display: "grid", placeItems: "center", background: "#edf5ef", borderRadius: 10 },
  role: { display: "inline-block", marginTop: 8, background: "#edf5ef", padding: "5px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700 },
  select: { padding: 9, border: "1px solid #d5e2da", borderRadius: 7 },
  refresh: { display: "flex", gap: 8, alignItems: "center", padding: "10px 14px", border: "1px solid #176b50", color: "#176b50", background: "white", borderRadius: 7, cursor: "pointer" },
  error: { color: "#b42318" },
  success: { color: "#08734e" }
};

export default AdminManagement;
