import React from "react";
import { Route, Routes, useNavigate } from "react-router-dom";

import Sidebar from "./components/Sidebar/Sidebar";
import Dashboard from "./pages/Dashboard";
import Info from "./pages/Info";
import Playground from "./pages/Playground";
import Settings from "./pages/Settings";
import { createResume, getResumes } from "./utils/resumeStorage";

function AppShell() {
  const navigate = useNavigate();

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
    <div className="app-shell">
      <Sidebar onCreateResume={handleCreateResume} />
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
