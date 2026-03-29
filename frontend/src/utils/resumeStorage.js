import { safeGetItem, safeRandomUUID, safeSetItem } from "./browser";

const STORAGE_KEY = "mantis-resumes";

const defaultResumeData = () => ({
  summary: "",
  experience: [],
  projects: [],
  skills: [],
});

function stamp(resume) {
  return {
    ...resume,
    last_updated: new Date().toISOString(),
  };
}

export function getResumes() {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveResumes(resumes) {
  safeSetItem(STORAGE_KEY, JSON.stringify(resumes));
}

export function createResume(overrides = {}) {
  const resumes = getResumes();
  const resume = stamp({
    id: safeRandomUUID(),
    title: "My Resume",
    template: "classic",
    ats_score: 0,
    data: defaultResumeData(),
    ...overrides,
    data: {
      ...defaultResumeData(),
      ...(overrides.data || {}),
    },
  });

  const nextResumes = [resume, ...resumes];
  saveResumes(nextResumes);
  return resume;
}

export function updateResume(id, updates) {
  const resumes = getResumes();
  const nextResumes = resumes.map((resume) => {
    if (resume.id !== id) {
      return resume;
    }

    return stamp({
      ...resume,
      ...updates,
      data: {
        ...resume.data,
        ...(updates.data || {}),
      },
    });
  });

  saveResumes(nextResumes);
  return nextResumes.find((resume) => resume.id === id) || null;
}

export function deleteResumes(ids) {
  const idSet = new Set(ids);
  const nextResumes = getResumes().filter((resume) => !idSet.has(resume.id));
  saveResumes(nextResumes);
  return nextResumes;
}

export function seedResumesIfEmpty() {
  if (getResumes().length > 0) {
    return;
  }

  const samples = [
    {
      title: "Software Engineer Resume",
      template: "classic",
      ats_score: 87,
      data: {
        summary:
          "Full-stack engineer with 5+ years building scalable web applications and AI-powered products.",
        experience: [
          {
            role: "Senior Software Engineer",
            company: "Acme Corp",
            points: [
              "Led development of AI-powered code review tooling, reducing review time by 40% across 200+ engineers.",
              "Architected microservices migration from monolith, improving deployment frequency from weekly to daily.",
              "Mentored 4 junior developers, establishing team code review standards and documentation practices.",
            ],
          },
          {
            role: "Software Engineer",
            company: "StartupXYZ",
            points: [
              "Built real-time collaboration features using WebSocket, serving 10K+ concurrent users.",
              "Implemented CI/CD pipeline reducing build times by 60% and eliminating manual deployment steps.",
            ],
          },
        ],
        projects: [
          {
            name: "ResumeAI",
            points: [
              "Open-source resume optimization tool with 2K+ GitHub stars.",
            ],
          },
        ],
        skills: ["React", "Node.js", "Python", "FastAPI", "TypeScript"],
      },
    },
    {
      title: "Product Manager Resume",
      template: "modern",
      ats_score: 72,
      data: {
        summary: "Product leader focused on roadmap clarity, experimentation, and shipping with engineering.",
        experience: [
          {
            role: "Senior Product Manager",
            company: "Northstar",
            points: ["Owned growth roadmap, improving activation by 18% through onboarding experiments."],
          },
        ],
        projects: [],
        skills: ["Strategy", "Roadmapping", "SQL"],
      },
    },
    {
      title: "Frontend Developer Resume",
      template: "classic",
      ats_score: 91,
      data: {
        summary: "Frontend engineer building performant interfaces with strong design implementation instincts.",
        experience: [
          {
            role: "Frontend Engineer",
            company: "Pixel",
            points: ["Built reusable design system primitives used across 14 production surfaces."],
          },
        ],
        projects: [],
        skills: ["React", "Animation", "Accessibility"],
      },
    },
    {
      title: "Data Scientist Resume",
      template: "modern",
      ats_score: 55,
      data: {
        summary: "Data scientist focused on experimentation, model quality, and product analytics.",
        experience: [
          {
            role: "Data Scientist",
            company: "Insight Labs",
            points: ["Improved churn prediction precision by 12% using feature engineering and evaluation redesign."],
          },
        ],
        projects: [],
        skills: ["Python", "Pandas", "Scikit-learn"],
      },
    },
    {
      title: "UX Designer Resume",
      template: "classic",
      ats_score: 68,
      data: {
        summary: "Product designer focused on systems thinking, clear interaction design, and user research.",
        experience: [
          {
            role: "Product Designer",
            company: "Studio Grid",
            points: ["Redesigned checkout flow, increasing completion rate by 9% and reducing support tickets."],
          },
        ],
        projects: [],
        skills: ["Figma", "Prototyping", "Research"],
      },
    },
  ];

  const seededResumes = samples.map((sample) =>
    stamp({
      id: safeRandomUUID(),
      title: sample.title,
      template: sample.template,
      ats_score: sample.ats_score,
      data: {
        ...defaultResumeData(),
        ...sample.data,
      },
    }),
  );

  saveResumes(seededResumes);
}
