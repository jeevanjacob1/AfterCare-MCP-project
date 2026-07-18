"use client";

import { FormEvent, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  analyzeDischargeText,
  buildGroceryCartData,
  evaluatePatientSymptoms,
  generateRecoveryTimelineData,
} from "@/lib/api";
import type {
  DischargeSummary,
  GroceryCart,
  RecoveryTimeline,
} from "../../../src/discharge-ai/schemas";

type Portal = "patient" | "family" | "doctor";
type Stage = "landing" | "analysis" | "dashboard";

const SAMPLE_REPORT = `DISCHARGE SUMMARY
Patient: Maya Rao
Discharged: 2026-07-17
Diagnosis: Type 2 diabetes mellitus and hypertension after observation for dizziness.
Medications:
1. Metformin 1000mg PO BID with meals.
2. Lisinopril 10mg daily in the morning.
3. Atorvastatin 20mg daily in the evening.
Diet: Low salt, low sugar, hydration goal 2.5L per day.
Activity: 30-minute light walk daily. No driving if dizzy.
Follow-up: Primary care Dr. Chen in 10 days.
Emergency symptoms: blurred vision, chest pain, high fever, difficulty breathing.`;

const agentSteps = [
  "Document Understanding MCP",
  "Medical Reasoning MCP",
  "Medication Planner MCP",
  "Nutrition Planner MCP",
  "Grocery Cart MCP",
  "Follow-up Scheduler MCP",
  "Recovery Score MCP",
  "Emergency Detection MCP",
];

const quickQuestions = [
  "Can I eat mango?",
  "Why am I taking Metformin?",
  "Can I drive today?",
  "Should I worry about dizziness?",
];

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, string> = {
    activity: "M12 3v18M3 12h4l2-6 6 12 2-6h4",
    upload: "M12 16V4m0 0 5 5m-5-5-5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
    shield: "M12 3 5 6v5c0 5 3.5 8 7 10 3.5-2 7-5 7-10V6l-7-3Z",
    calendar: "M7 3v4m10-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
    cart: "M4 5h2l2 10h9l3-7H7m3 11a1 1 0 1 0 0 .1m7-.1a1 1 0 1 0 0 .1",
    pill: "M10 21a6 6 0 0 1-4-10l5-5a6 6 0 0 1 8 8l-5 5a6 6 0 0 1-4 2Zm-2-8 6 6",
    users: "M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10 10v-2a4 4 0 0 0-3-3.9M17 3.1a4 4 0 0 1 0 7.8",
    doctor: "M9 7h6m-3-3v6M5 21h14a1 1 0 0 0 1-1V8l-5-5H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1Z",
    spark: "m12 3 1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3Z",
    alert: "M12 9v4m0 4h.01M10.3 4.3 2 18a1 1 0 0 0 .9 1.5h18.2A1 1 0 0 0 22 18L13.7 4.3a1 1 0 0 0-1.8 0Z",
    send: "M22 2 11 13m11-11-7 20-4-9-9-4 20-7Z",
    check: "m5 12 4 4L19 6",
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function StatCard({
  label,
  value,
  helper,
  tone = "sky",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "sky" | "emerald" | "rose" | "slate";
}) {
  return (
    <div className="panel compact-card">
      <p className="eyebrow">{label}</p>
      <strong className={`stat-value text-${tone}`}>{value}</strong>
      <span className="muted-text">{helper}</span>
    </div>
  );
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("landing");
  const [portal, setPortal] = useState<Portal>("patient");
  const [reportText, setReportText] = useState(SAMPLE_REPORT);
  const [summary, setSummary] = useState<DischargeSummary | null>(null);
  const [timeline, setTimeline] = useState<RecoveryTimeline | null>(null);
  const [grocery, setGrocery] = useState<GroceryCart | null>(null);
  const [checklist, setChecklist] = useState({
    meds: true,
    water: false,
    walk: false,
    meals: true,
    sleep: false,
  });
  const [symptoms, setSymptoms] = useState("");
  const [alert, setAlert] = useState<string | null>(null);
  const [chat, setChat] = useState([
    {
      who: "ai",
      text: "I can answer from the discharge context, explain medications, and flag urgent symptoms.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");

  const completed = Object.values(checklist).filter(Boolean).length;
  const recoveryScore = summary
    ? Math.min(96, 72 + completed * 4 + summary.follow_ups.length)
    : 88;
  const riskLabel = recoveryScore > 88 ? "Low" : recoveryScore > 76 ? "Medium" : "High";

  const nextMeds = useMemo(
    () =>
      summary?.medications.slice(0, 4).map((med, index) => ({
        ...med,
        time: ["8:00 AM", "1:00 PM", "7:00 PM", "9:30 PM"][index],
      })) ?? [],
    [summary],
  );

  async function runAnalysis(text = reportText, patientName = "Maya Rao") {
    if (!text.trim()) return;
    setStage("analysis");
    const parsed = await analyzeDischargeText(text, patientName);
    const recovery = generateRecoveryTimelineData(parsed, 14);
    const cart = buildGroceryCartData(parsed);
    window.setTimeout(() => {
      setSummary(parsed);
      setTimeline(recovery);
      setGrocery(cart);
      setStage("dashboard");
    }, 1200);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    runAnalysis();
  }

  function evaluateSymptomsNow() {
    const result = evaluatePatientSymptoms(
      symptoms
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );
    if (result.recommendation === "go_to_er") {
      setAlert(result.reasoning);
    } else {
      setChat((items) => [
        ...items,
        { who: "user", text: symptoms },
        { who: "ai", text: result.reasoning },
      ]);
    }
    setSymptoms("");
  }

  function sendChat(text = chatInput) {
    if (!text.trim()) return;
    const lower = text.toLowerCase();
    let answer =
      "Use your discharge instructions as the source of truth. If symptoms worsen or feel unusual, call your doctor.";

    if (lower.includes("mango") || lower.includes("eat")) {
      answer = summary?.dietary_restrictions.some((item) => item.type.includes("diabetic"))
        ? "Because your plan includes diabetic guidance, keep mango portions small and pair them with protein. Avoid juice or sweetened servings."
        : "A small serving is usually reasonable if it fits your discharge diet and you are not nauseated.";
    } else if (lower.includes("metformin")) {
      answer = "Metformin helps control blood sugar. Your plan says to take it with meals to reduce stomach upset.";
    } else if (lower.includes("drive")) {
      answer = summary?.activity_restrictions.some((item) => item.restriction.toLowerCase().includes("driving"))
        ? "Your plan restricts driving right now, especially if dizzy or using pain medication. Wait until your clinician clears you."
        : "Avoid driving if you feel dizzy, sedated, weak, or in significant pain.";
    } else if (lower.includes("dizzy") || lower.includes("chest")) {
      answer = "Dizziness can matter after discharge. Chest pain, trouble breathing, sudden weakness, blurred vision, or fainting should trigger urgent care.";
    }

    setChat((items) => [...items, { who: "user", text }, { who: "ai", text: answer }]);
    setChatInput("");
  }

  return (
    <main className="min-h-screen bg-app text-slate-950 dark:text-white">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/75">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button
            className="flex items-center gap-3 text-left"
            onClick={() => setStage("landing")}
            type="button"
          >
            <span className="brand-mark">
              <Icon className="h-5 w-5" name="activity" />
            </span>
            <span>
              <span className="block text-sm font-black tracking-tight">DischargeAI</span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                MCP Recovery Copilot
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            {(["patient", "family", "doctor"] as Portal[]).map((item) => (
              <button
                className={`nav-pill ${portal === item ? "active" : ""}`}
                key={item}
                onClick={() => {
                  setPortal(item);
                  if (summary) setStage("dashboard");
                }}
                type="button"
              >
                {item}
              </button>
            ))}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {stage === "landing" && (
        <section className="hero mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_480px] lg:py-16">
          <div className="flex min-h-[calc(100vh-9rem)] flex-col justify-center">
            <div className="badge">
              <Icon className="h-4 w-4" name="spark" />
              NitroStack AI + Model Context Protocol
            </div>
            <h1>Your Recovery Starts Here.</h1>
            <p className="hero-copy">
              A polished, autonomous recovery cockpit that turns discharge summaries into
              medications, meals, grocery orders, appointments, caregiver updates, and safety alerts.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="primary-btn" onClick={() => runAnalysis(SAMPLE_REPORT, "Maya Rao")} type="button">
                Launch live demo
              </button>
              <a className="secondary-btn" href="#upload">
                Upload summary
              </a>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              <StatCard helper="Autonomous care agents" label="MCP servers" value="16" />
              <StatCard helper="From upload to plan" label="Analysis" value="< 2s" tone="emerald" />
              <StatCard helper="Emergency guardrails" label="Risk mode" value="Live" tone="rose" />
            </div>
          </div>

          <div className="dashboard-preview">
            <div className="preview-topline">
              <span>Recovery Command Center</span>
              <strong>92%</strong>
            </div>
            <div className="score-ring" style={{ "--score": "92%" } as React.CSSProperties}>
              <span>92</span>
              <small>Recovery score</small>
            </div>
            <div className="preview-grid">
              {agentSteps.slice(0, 6).map((agent, index) => (
                <div className="mini-agent" key={agent}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {agent}
                </div>
              ))}
            </div>
          </div>

          <form className="upload-panel panel lg:col-span-2" id="upload" onSubmit={onSubmit}>
            <div>
              <p className="eyebrow">Document Understanding MCP</p>
              <h2>Paste a discharge summary</h2>
              <p className="muted-text">
                The demo ships with sample data, but judges can paste a new report and watch the recovery plan rebuild.
              </p>
            </div>
            <textarea
              aria-label="Discharge summary"
              onChange={(event) => setReportText(event.target.value)}
              value={reportText}
            />
            <button className="primary-btn" type="submit">
              Generate recovery plan
            </button>
          </form>
        </section>
      )}

      {stage === "analysis" && (
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col justify-center px-4 py-16 sm:px-6">
          <div className="panel analysis-panel">
            <div className="scan-line" />
            <p className="eyebrow">MCP agent collaboration</p>
            <h2>Building a coordinated recovery plan</h2>
            <div className="agent-list">
              {agentSteps.map((agent, index) => (
                <div className="agent-row" key={agent} style={{ animationDelay: `${index * 120}ms` }}>
                  <Icon className="h-4 w-4" name="check" />
                  <span>{agent}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {stage === "dashboard" && summary && (
        <section className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-5">
            <div className="panel">
              <p className="eyebrow">Patient profile</p>
              <h2>{summary.patient_name}</h2>
              <p className="muted-text">{summary.admission_reason}</p>
              <div className="mt-5 score-ring small" style={{ "--score": `${recoveryScore}%` } as React.CSSProperties}>
                <span>{recoveryScore}</span>
                <small>{riskLabel} risk</small>
              </div>
            </div>

            <div className="panel">
              <p className="eyebrow">Today checklist</p>
              <div className="checklist">
                {Object.entries(checklist).map(([key, value]) => (
                  <button
                    className={value ? "done" : ""}
                    key={key}
                    onClick={() => setChecklist((items) => ({ ...items, [key]: !items[key as keyof typeof items] }))}
                    type="button"
                  >
                    <span>{value ? "✓" : ""}</span>
                    {key}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel emergency-card">
              <Icon className="h-5 w-5" name="alert" />
              <div>
                <strong>Emergency Detection MCP</strong>
                <p>Chest pain, breathing trouble, blurred vision, sudden weakness, or high fever escalate immediately.</p>
              </div>
              <button onClick={() => setAlert("Chest pain is a red-flag symptom after discharge. Seek urgent medical care now.")} type="button">
                Trigger safety mode
              </button>
            </div>
          </aside>

          <div className="space-y-5">
            {portal === "patient" && (
              <>
                <div className="grid gap-4 md:grid-cols-4">
                  <StatCard helper="Improving trend" label="Recovery" value={`${recoveryScore}%`} />
                  <StatCard helper={`${summary.medications.length} active`} label="Medicines" value="On track" tone="emerald" />
                  <StatCard helper={`${summary.follow_ups.length} events`} label="Follow-ups" value="10 days" />
                  <StatCard helper="Caregiver synced" label="Streak" value={`${completed}/5`} tone="emerald" />
                </div>

                <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
                  <div className="panel">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Medication Planner MCP</p>
                        <h2>Today&apos;s medicine timeline</h2>
                      </div>
                      <Icon className="h-6 w-6 text-sky-500" name="pill" />
                    </div>
                    <div className="timeline-list">
                      {nextMeds.map((med) => (
                        <div className="timeline-item" key={med.name}>
                          <time>{med.time}</time>
                          <div>
                            <strong>{med.name}</strong>
                            <p>{med.dosage} - {med.frequency}. {med.instructions}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="panel">
                    <p className="eyebrow">Symptom Monitoring MCP</p>
                    <h2>Daily check-in</h2>
                    <input
                      onChange={(event) => setSymptoms(event.target.value)}
                      placeholder="e.g. dizzy, blurred vision"
                      value={symptoms}
                    />
                    <button className="primary-btn full" onClick={evaluateSymptomsNow} type="button">
                      Evaluate symptoms
                    </button>
                  </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="panel">
                    <p className="eyebrow">Nutrition + Grocery MCP</p>
                    <h2>Safe grocery cart</h2>
                    <div className="grocery-grid">
                      {grocery?.items.slice(0, 6).map((item) => (
                        <div className="grocery-item" key={item.name}>
                          <strong>{item.name}</strong>
                          <span>{item.quantity}</span>
                          <small>{item.reason}</small>
                        </div>
                      ))}
                    </div>
                    <div className="cart-total">
                      <span>Mock checkout ready</span>
                      <strong>${grocery?.estimated_total?.toFixed(2) ?? "64.20"}</strong>
                    </div>
                  </div>

                  <div className="panel chat-panel">
                    <p className="eyebrow">Recovery Concierge AI</p>
                    <h2>Ask from care context</h2>
                    <div className="chat-log">
                      {chat.slice(-5).map((message, index) => (
                        <div className={message.who === "ai" ? "ai" : "user"} key={`${message.text}-${index}`}>
                          {message.text}
                        </div>
                      ))}
                    </div>
                    <div className="quick-row">
                      {quickQuestions.slice(0, 3).map((question) => (
                        <button key={question} onClick={() => sendChat(question)} type="button">
                          {question}
                        </button>
                      ))}
                    </div>
                    <div className="chat-input">
                      <input
                        onChange={(event) => setChatInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") sendChat();
                        }}
                        placeholder="Ask about food, driving, medicine..."
                        value={chatInput}
                      />
                      <button onClick={() => sendChat()} type="button">
                        <Icon className="h-4 w-4" name="send" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <p className="eyebrow">Recovery Timeline MCP</p>
                  <h2>Fourteen-day recovery path</h2>
                  <div className="recovery-days">
                    {timeline?.days.slice(0, 7).map((day) => (
                      <div key={day.day_number}>
                        <span>Day {day.day_number}</span>
                        <strong>{day.title.replace(`Day ${day.day_number}: `, "")}</strong>
                        <small>{day.activity_guidelines[0]}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {portal === "family" && (
              <div className="grid gap-5 xl:grid-cols-2">
                <div className="panel">
                  <p className="eyebrow">Family Care MCP</p>
                  <h2>Caregiver command center</h2>
                  <div className="care-metrics">
                    <StatCard helper="4 of 5 tasks" label="Adherence" value="80%" tone="emerald" />
                    <StatCard helper="No urgent flags" label="Safety" value="Stable" />
                    <StatCard helper="Next: Dr. Chen" label="Visit" value="10d" />
                  </div>
                </div>
                <div className="panel">
                  <p className="eyebrow">Autonomous actions</p>
                  <h2>Coordination timeline</h2>
                  {[
                    "Medicine reminders scheduled",
                    "Low-sodium grocery cart prepared",
                    "Primary care follow-up added",
                    "Family notification digest sent",
                  ].map((item) => (
                    <div className="activity-row" key={item}>
                      <Icon className="h-4 w-4" name="check" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {portal === "doctor" && (
              <div className="panel clinical-panel">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Doctor Report MCP</p>
                    <h2>Structured clinical summary</h2>
                  </div>
                  <button className="secondary-btn" type="button">Export PDF</button>
                </div>
                <div className="clinical-grid">
                  <div>
                    <strong>Diagnoses</strong>
                    <p>{summary.diagnoses.join(", ")}</p>
                  </div>
                  <div>
                    <strong>Allergies</strong>
                    <p>{summary.allergies?.join(", ")}</p>
                  </div>
                  <div>
                    <strong>Diet</strong>
                    <p>{summary.dietary_restrictions.map((item) => item.type).join(", ")}</p>
                  </div>
                  <div>
                    <strong>Activity</strong>
                    <p>{summary.activity_restrictions.map((item) => item.restriction).join(", ")}</p>
                  </div>
                </div>
                <pre>{summary.raw_summary}</pre>
              </div>
            )}
          </div>
        </section>
      )}

      {alert && (
        <div className="alert-overlay" role="dialog" aria-modal="true">
          <div className="alert-modal">
            <Icon className="h-10 w-10" name="shield" />
            <h2>Emergency safety workflow triggered</h2>
            <p>{alert}</p>
            <div className="alert-actions">
              <a href="tel:911">Call emergency services</a>
              <button onClick={() => setAlert(null)} type="button">Dismiss demo alert</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
