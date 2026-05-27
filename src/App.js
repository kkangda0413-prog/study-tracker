import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, provider } from "./firebase-config";
import StudyTracker from "./StudyTracker";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"}}>로딩 중...</div>;

  if (!user) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f0f2ff"}}>
      <div style={{background:"#fff",borderRadius:24,padding:"48px 40px",textAlign:"center",boxShadow:"0 8px 40px rgba(107,124,255,0.12)"}}>
        <div style={{fontSize:56,marginBottom:16}}>📚</div>
        <h1 style={{fontSize:28,fontWeight:700,marginBottom:12}}>학습 트래커</h1>
        <p style={{color:"#666",marginBottom:32}}>구글 계정으로 로그인하세요</p>
        <button onClick={() => signInWithPopup(auth, provider)}
          style={{padding:"14px 32px",background:"#6B7CFF",color:"white",border:"none",borderRadius:12,fontSize:16,cursor:"pointer",fontWeight:600}}>
          Google로 로그인
        </button>
      </div>
    </div>
  );

  return <StudyTracker user={user} onLogout={() => signOut(auth)} />;
}