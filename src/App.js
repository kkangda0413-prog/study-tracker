import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, provider } from "./firebase-config";
import StudyTracker from "./StudyTracker";
import SimpleTracker from "./SimpleTracker";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [appVersion, setAppVersion] = useState(
    () => localStorage.getItem("studyTrackerVersion") || "full"
  );

  function handleSwitchVersion() {
    const next = appVersion === "full" ? "simple" : "full";
    setAppVersion(next);
    localStorage.setItem("studyTrackerVersion", next);
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function handleLogin() {
    setSigningIn(true);
    setError("");
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError("로그인 중 오류가 발생했습니다. 팝업이 차단되지 않았는지 확인해주세요.");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleLogout() {
    await signOut(auth);
  }

  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} />
        <p style={{ color: "#888", marginTop: 16, fontFamily: "'Noto Sans KR', sans-serif" }}>
          로딩 중...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.loginBg}>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <div style={styles.loginCard}>
          <div style={styles.loginIcon}>📚</div>
          <h1 style={styles.loginTitle}>학습 트래커</h1>
          <p style={styles.loginSub}>
            공부 시간을 기록하고, 목표를 달성하세요.
            <br />
            어느 기기에서든 내 기록을 확인할 수 있습니다.
          </p>
          {error && <p style={styles.errorMsg}>{error}</p>}
          <button
            style={{ ...styles.googleBtn, opacity: signingIn ? 0.7 : 1 }}
            onClick={handleLogin}
            disabled={signingIn}
          >
            <svg width="20" height="20" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {signingIn ? "로그인 중..." : "Google 계정으로 로그인"}
          </button>
          <p style={styles.loginFooter}>
            로그인하면 학습 기록이 클라우드에 안전하게 저장됩니다.
          </p>
        </div>
      </div>
    );
  }

  if (appVersion === "simple") {
    return <SimpleTracker user={user} onLogout={handleLogout} onSwitchVersion={handleSwitchVersion} />;
  }
  return <StudyTracker user={user} onLogout={handleLogout} onSwitchVersion={handleSwitchVersion} />;
}

const styles = {
  center: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", minHeight: "100vh",
    background: "#f5f6fa",
  },
  spinner: {
    width: 40, height: 40, borderRadius: "50%",
    border: "3px solid #e0e0e0", borderTop: "3px solid #6B7CFF",
    animation: "spin 0.8s linear infinite",
  },
  loginBg: {
    minHeight: "100vh", background: "linear-gradient(135deg, #f0f2ff 0%, #e8f5e9 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Noto Sans KR', sans-serif", padding: "20px",
  },
  loginCard: {
    background: "#fff", borderRadius: 24, padding: "48px 40px",
    maxWidth: 420, width: "100%", textAlign: "center",
    boxShadow: "0 8px 40px rgba(107,124,255,0.12)",
  },
  loginIcon: { fontSize: 56, marginBottom: 16 },
  loginTitle: {
    fontSize: 28, fontWeight: 700, color: "#1a1a2e", marginBottom: 12, letterSpacing: "-0.5px",
  },
  loginSub: {
    fontSize: 14, color: "#666", lineHeight: 1.7, marginBottom: 32,
  },
  googleBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
    width: "100%", padding: "14px 20px", background: "#fff",
    border: "1.5px solid #e0e0e0", borderRadius: 12, cursor: "pointer",
    fontSize: 15, fontWeight: 500, fontFamily: "'Noto Sans KR', sans-serif",
    color: "#333", transition: "all 0.15s",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  errorMsg: {
    background: "#fff0f0", color: "#e74c3c", borderRadius: 8,
    padding: "10px 14px", fontSize: 13, marginBottom: 16,
  },
  loginFooter: { fontSize: 12, color: "#aaa", marginTop: 20 },
};
