import React, { useState, useEffect } from "react";
import { Route, Routes, useNavigate, useLocation } from "react-router-dom";

import Sidebar from "./components/Sidebar/Sidebar";
import Dashboard from "./pages/Dashboard";
import Info from "./pages/Info";
import Playground from "./pages/Playground";
import Settings from "./pages/Settings";
import { createResume, getResumes } from "./utils/resumeStorage";

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => location.pathname.startsWith('/playground/'));

  useEffect(() => {
    setIsSidebarCollapsed(location.pathname.startsWith('/playground/'));
  }, [location.pathname]);

  const handleCreateResume = () => {
    const resumes = getResumes();
    const nextIndex = resumes.length + 1;
    const resume = createResume({
      title: `My Resume ${nextIndex}`,
      template: "classic",
    });
    navigate(`/playground/${resume.id}`);
  };

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "app-shell--collapsed" : ""}`}>
      <Sidebar 
        onCreateResume={handleCreateResume} 
        isCollapsed={isSidebarCollapsed} 
        onToggle={() => setIsSidebarCollapsed(v => !v)} 
      />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Dashboard onCreateResume={handleCreateResume} />} />
          <Route path="/info" element={<Info />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/playground/:id" element={<Playground />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return <AppShell />;
}
