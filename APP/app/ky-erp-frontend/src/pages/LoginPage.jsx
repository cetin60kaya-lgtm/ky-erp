import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./LoginPage.css";

function normalizeCredential(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event?.preventDefault();
    const cleanUsername = normalizeCredential(username);
    const cleanPassword = normalizeCredential(password);

    if (!cleanUsername || !cleanPassword) {
      setError("Kullanıcı adı ve şifre zorunludur.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      await login(cleanUsername, cleanPassword);
    } catch (requestError) {
      setError(requestError?.message || "Giriş yapılamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">KY ERP</div>
        <h1>Kurumsal Giriş</h1>
        <p>Devam etmek için kullanıcı bilgilerinizle oturum açın.</p>
        <form onSubmit={handleSubmit}>
          <label>
            Kullanıcı Adı
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event?.target.value)}
              placeholder="admin"
            />
          </label>
          <label>
            Şifre
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event?.target.value)}
              placeholder="********"
            />
          </label>
          {error ? <div className="login-error">{error}</div> : null}
          <button type="submit" disabled={loading}>
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
      </div>
    </div>
  );
}
