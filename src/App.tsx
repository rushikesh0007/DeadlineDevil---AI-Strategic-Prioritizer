import React, { useState, useEffect, useRef } from "react";
import {
  Calendar,
  Clock,
  CircleCheck,
  TriangleAlert,
  Play,
  Square,
  Sparkles,
  CirclePlus,
  RefreshCw,
  Award,
  ChevronDown,
  ChevronUp,
  Zap,
  Flame,
  Check,
  X,
  Trash2,
  Search,
  Eye,
  Activity,
  Shield,
  ShieldAlert,
  Send,
  ArrowLeft,
  ExternalLink,
  LogOut,
  CalendarDays,
  Mic
} from "lucide-react";
import { Task } from "./types";

const safeParseJson = async (response: Response): Promise<any> => {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    if (text.trim().startsWith("<")) {
      const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "";
      const bodyMatch = text.match(/<h1>([\s\S]*?)<\/h1>/i) || text.match(/<p>([\s\S]*?)<\/p>/i);
      const detail = bodyMatch ? bodyMatch[1].trim().replace(/<[^>]+>/g, "") : "";
      const explanation = [title, detail].filter(Boolean).join(": ");
      throw new Error(explanation || `Server error (returned HTML ${response.status}: ${response.statusText})`);
    }
    throw new Error(`Invalid response format from server: ${text.substring(0, 100)}...`);
  }
};

const renderErrorWithLinks = (errorText: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = errorText.split(urlRegex);
  return (
    <>
      {parts.map((part, index) => {
        if (part.match(urlRegex)) {
          // Clean up any trailing punctuation from URL capture
          let url = part;
          let trailing = "";
          if (/[.,;:)]$/.test(url)) {
            trailing = url.slice(-1);
            url = url.slice(0, -1);
          }
          return (
            <React.Fragment key={index}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline font-bold break-all inline-flex items-center space-x-0.5"
              >
                <span>{url}</span>
                <ExternalLink className="w-3 h-3 inline ml-0.5" />
              </a>
              {trailing}
            </React.Fragment>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
};

const INITIAL_NUDGES = [
  "Welcome back! I have polished and adjusted my schedule parameters to secure your success today.",
  "Remember: procrastination is merely a puzzle we have yet to solve. Let's handle your commitments together!",
  "A structured day is a quiet mind. Feel free to type in all your chaotic thoughts or plans below, and let me arrange them safely.",
  "No matter how heavy the load looks, taking the very first tiny step renders it lighter. I'm here for you!"
];

const parseDeadlineToTimestamp = (deadlineStr: string): number => {
  const now = new Date();
  const lower = deadlineStr.toLowerCase().trim();
  
  // Initialize targetDate to now, with seconds/milliseconds reset
  const targetDate = new Date(now);
  targetDate.setSeconds(0, 0);

  // 1. Extract and remove time from the parsing string to avoid collision with date numbers
  let targetHour = 17; // Default to 5 PM
  let targetMin = 0;
  let timeMatched = false;

  // regex to match standard times: e.g. 11:00 pm, 11pm, 9am, 9:30 AM, etc.
  const ampmRegex = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
  const militaryRegex = /\b(\d{1,2}):(\d{2})\b/;

  const ampmMatch = deadlineStr.match(ampmRegex);
  const militaryMatch = deadlineStr.match(militaryRegex);

  let stringWithoutTime = lower;

  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const min = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const ampm = ampmMatch[3].toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    targetHour = hour;
    targetMin = min;
    timeMatched = true;
    stringWithoutTime = lower.replace(ampmRegex, "");
  } else if (militaryMatch) {
    targetHour = parseInt(militaryMatch[1], 10);
    targetMin = parseInt(militaryMatch[2], 10);
    timeMatched = true;
    stringWithoutTime = lower.replace(militaryRegex, "");
  } else if (lower.includes("tonight")) {
    targetHour = 23; // default to 11 PM for tonight
    targetMin = 0;
  } else if (lower.includes("morning")) {
    targetHour = 9;  // default to 9 AM for morning
    targetMin = 0;
  } else if (lower.includes("afternoon")) {
    targetHour = 14; // default to 2 PM
    targetMin = 0;
  } else if (lower.includes("evening")) {
    targetHour = 18; // default to 6 PM
    targetMin = 0;
  }

  // Set initial target time
  targetDate.setHours(targetHour, targetMin, 0, 0);

  // 2. Parse relative date terms
  let dayAdjusted = false;

  if (stringWithoutTime.includes("next week")) {
    targetDate.setDate(now.getDate() + 7);
    dayAdjusted = true;
  } else if (stringWithoutTime.includes("tomorrow")) {
    targetDate.setDate(now.getDate() + 1);
    dayAdjusted = true;
  } else if (stringWithoutTime.includes("tonight") || stringWithoutTime.includes("today")) {
    targetDate.setDate(now.getDate());
    dayAdjusted = true;
  } else {
    // Check for days of week (monday, tuesday, etc.)
    const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    let weekdayIndex = -1;
    for (let i = 0; i < daysOfWeek.length; i++) {
      if (stringWithoutTime.includes(daysOfWeek[i])) {
        weekdayIndex = i;
        break;
      }
    }
    if (weekdayIndex !== -1) {
      const currentDay = now.getDay();
      let diff = weekdayIndex - currentDay;
      if (diff <= 0) diff += 7; // Force next week's occurrence
      targetDate.setDate(now.getDate() + diff);
      dayAdjusted = true;
    }
  }

  // 3. Parse specific absolute dates (e.g. "June 30" or "06/30")
  if (!dayAdjusted) {
    // Check month names
    const months = [
      ["january", "jan"],
      ["february", "feb"],
      ["march", "mar"],
      ["april", "apr"],
      ["may", "may"],
      ["june", "jun"],
      ["july", "jul"],
      ["august", "aug"],
      ["september", "sep"],
      ["october", "oct"],
      ["november", "nov"],
      ["december", "dec"]
    ];

    let foundMonthIndex = -1;
    for (let m = 0; m < months.length; m++) {
      if (stringWithoutTime.includes(months[m][0]) || stringWithoutTime.includes(months[m][1])) {
        foundMonthIndex = m;
        break;
      }
    }

    if (foundMonthIndex !== -1) {
      // Find any 1 or 2 digit number for the day
      const dayMatch = stringWithoutTime.match(/\b(\d{1,2})\b/);
      if (dayMatch) {
        const dayVal = parseInt(dayMatch[1], 10);
        targetDate.setMonth(foundMonthIndex);
        targetDate.setDate(dayVal);
        dayAdjusted = true;
        
        // If parsed date is in the past for this year, shift to next year
        if (targetDate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
          targetDate.setFullYear(now.getFullYear() + 1);
        }
      }
    } else {
      // Check numeric dates (e.g. 06/30, 30-06, etc.)
      const numericDateRegex = /\b(\d{1,2})[-/\.](\d{1,2})(?:[-/\.](\d{2,4}))?\b/;
      const numMatch = stringWithoutTime.match(numericDateRegex);
      if (numMatch) {
        let p1 = parseInt(numMatch[1], 10);
        let p2 = parseInt(numMatch[2], 10);
        let year = numMatch[3] ? parseInt(numMatch[3], 10) : now.getFullYear();
        if (year < 100) year += 2000; // handle 2 digit year

        let month = p1 - 1; // standard MM/DD
        let day = p2;

        // If month is invalid (> 11) or day > 31, swap them to support DD/MM
        if (p1 > 12) {
          month = p2 - 1;
          day = p1;
        }

        if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
          targetDate.setFullYear(year);
          targetDate.setMonth(month);
          targetDate.setDate(day);
          dayAdjusted = true;
          
          if (targetDate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
            targetDate.setFullYear(now.getFullYear() + 1);
          }
        }
      }
    }
  }

  // 4. Default fallback: if it's already past the target hour today, and we didn't specify relative offset/absolute date, default to tomorrow
  if (!dayAdjusted && targetDate.getTime() < now.getTime()) {
    targetDate.setDate(now.getDate() + 1);
  }

  return targetDate.getTime();
};

const getUrgencyState = (task: Task, currentTime?: Date) => {
  if (!task.deadlineTimestamp) {
    return { mode: 'NORMAL' as const, minutesRemaining: 240, label: "3+ hours left", color: "text-[#10B981] font-semibold" };
  }
  
  // Real current device time is ALWAYS read via currentTime state or new Date() to be absolutely correct
  const baseTime = currentTime || new Date();
  const diffMs = task.deadlineTimestamp - baseTime.getTime();
  const minutesRemaining = Math.max(0, diffMs / (60 * 1000));
  
  if (minutesRemaining < 10) {
    const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return {
      mode: 'EMERGENCY' as const,
      minutesRemaining,
      label: `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} left!`,
      color: "text-rose-500 font-bold animate-pulse"
    };
  } else if (minutesRemaining < 30) {
    return {
      mode: 'CRITICAL' as const,
      minutesRemaining,
      label: `${Math.floor(minutesRemaining)} mins left!`,
      color: "text-red-500 font-bold"
    };
  } else if (minutesRemaining < 180) { // < 3 hours is Alert mode
    const hours = Math.floor(minutesRemaining / 60);
    const mins = Math.floor(minutesRemaining % 60);
    return {
      mode: 'ALERT' as const,
      minutesRemaining,
      label: hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`,
      color: "text-[#F97316] font-semibold"
    };
  } else {
    const hours = Math.floor(minutesRemaining / 60);
    const mins = Math.floor(minutesRemaining % 60);
    return {
      mode: 'NORMAL' as const,
      minutesRemaining,
      label: hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`,
      color: "text-emerald-500 font-medium"
    };
  }
};

const CyberShieldBackground = () => {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0">
      <svg className="w-[700px] h-[700px] text-[#38BDF8]/8 animate-pulse duration-[8000ms]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.4">
        {/* Giant outer shield */}
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeWidth="0.3" />
        {/* Inner parallel shield line */}
        <path d="M12 20.3s6.8-3.4 6.8-8.5V6.1L12 3.6 5.2 6.1v5.7c0 5.1 6.8 8.5 6.8 8.5z" strokeWidth="0.2" />
        {/* Cyber grid inside the shield */}
        <path d="M12 2v20" strokeWidth="0.1" strokeDasharray="1,1" />
        <path d="M4 11h16" strokeWidth="0.1" strokeDasharray="1,1" />
        <circle cx="12" cy="11" r="5" strokeWidth="0.2" strokeDasharray="2,2" />
        <circle cx="12" cy="11" r="8" strokeWidth="0.15" strokeDasharray="3,3" />
        {/* Futuristic geometric lines */}
        <path d="M6 5l12 12" strokeWidth="0.1" />
        <path d="M18 5L6 12" strokeWidth="0.1" />
        <polygon points="12,5.5 16.5,11 12,16.5 7.5,11" strokeWidth="0.2" />
      </svg>
    </div>
  );
};

const GhostedCodeMargins = () => {
  return (
    <>
      {/* Left Margin Ghosted Code */}
      <div className="absolute top-24 left-4 w-60 font-mono text-[10px] text-purple-400/5 select-none pointer-events-none leading-relaxed hidden xl:block text-left z-0">
        <p>{`import { useState, useEffect } from 'react';`}</p>
        <p className="pl-2">{`const useDaemon = (taskId) => {`}</p>
        <p className="pl-4">{`const [urgency, setUrgency] = useState(0);`}</p>
        <p className="pl-4">{`useEffect(() => {`}</p>
        <p className="pl-6">{`const timer = setInterval(() => {`}</p>
        <p className="pl-8">{`const remaining = calculateRemaining(taskId);`}</p>
        <p className="pl-8">{`setUrgency(remaining < 30 ? 'CRITICAL' : 'OK');`}</p>
        <p className="pl-6">{`}, 60000);`}</p>
        <p className="pl-6">{`return () => clearInterval(timer);`}</p>
        <p className="pl-4">{`}, [taskId]);`}</p>
        <p className="pl-4">{`return { urgency };`}</p>
        <p className="pl-2">{`};`}</p>
        <p className="pt-4">{`const executeSelfDestruct = async (token) => {`}</p>
        <p className="pl-2">{`const response = await fetch('/api/panic', {`}</p>
        <p className="pl-4">{`method: 'POST',`}</p>
        <p className="pl-4">{`headers: { 'Authorization': token }`}</p>
        <p className="pl-2">{`});`}</p>
        <p className="pl-2">{`return response.json();`}</p>
        <p>{`};`}</p>
      </div>

      {/* Right Margin Ghosted Code */}
      <div className="absolute top-48 right-4 w-64 font-mono text-[10px] text-emerald-400/5 select-none pointer-events-none leading-relaxed hidden xl:block text-left z-0">
        <p>{`// DeadlineDevil Portal Connection`}</p>
        <p>{`export async function syncTaskToGoogleCalendar(task) {`}</p>
        <p className="pl-2">{`const endpoint = '/api/calendar/events';`}</p>
        <p className="pl-2">{`const body = JSON.stringify({`}</p>
        <p className="pl-4">{`summary: \`😈 \${task.name}\`,`}</p>
        <p className="pl-4">{`start: task.timeSlot.start,`}</p>
        <p className="pl-4">{`end: task.timeSlot.end`}</p>
        <p className="pl-2">{`});`}</p>
        <p className="pl-2">{`return await fetch(endpoint, {`}</p>
        <p className="pl-4">{`method: 'POST',`}</p>
        <p className="pl-4">{`headers: { 'Content-Type': 'application/json' },`}</p>
        <p className="pl-4">{`body`}</p>
        <p className="pl-2">{`});`}</p>
        <p>{`}`}</p>
        <p className="pt-4">{`const calculatePanicLevel = (tasks) => {`}</p>
        <p className="pl-2">{`const modes = tasks.map(t => t.urgency.mode);`}</p>
        <p className="pl-2">{`if (modes.includes('EMERGENCY')) return 95;`}</p>
        <p className="pl-2">{`if (modes.includes('CRITICAL')) return 75;`}</p>
        <p className="pl-2">{`return 15;`}</p>
        <p>{`};`}</p>
      </div>
    </>
  );
};

export default function App() {
  // Core state loaded from LocalStorage if exists
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem("deadline_devil_tasks");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((t: any) => {
          if (!t.deadlineTimestamp) {
            // Upgrade legacy tasks with a sensible default deadline (e.g. 3.5 hours from now)
            return {
              ...t,
              deadlineTimestamp: Date.now() + 3.5 * 60 * 60 * 1000
            };
          }
          return t;
        });
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  // User input states
  const [messyInput, setMessyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [panicStatus, setPanicStatus] = useState<"idle" | "recording" | "processing">("idle");
  const recognitionRef = useRef<any>(null);
  const recordingTimeoutRef = useRef<any>(null);
  const latestTranscriptRef = useRef("");

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "calendar" | "focus-stats">("dashboard");
  
  // AI assistant states
  const [devilNudge, setDevilNudge] = useState<string>(() => {
    return localStorage.getItem("deadline_devil_nudge") || "Greetings! I am DeadlineDevil, your polite planning companion. Provide your chaotic list of deadlines in the box below, and watch me carve out an organized, polished timeline for your day.";
  });

  // Accordion details tracking
  const [expandedTips, setExpandedTips] = useState<Record<string, boolean>>({
    "task-1": true
  });

  // Active work Session Timer state
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Real current device clock
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

  // Focus Streak State
  const [focusStreak, setFocusStreak] = useState<number>(() => {
    const saved = localStorage.getItem("deadline_devil_focus_streak");
    return saved ? parseInt(saved, 10) : 0;
  });
  
  // To simulate automatic scheduled check-in trigger
  const [checkInTask, setCheckInTask] = useState<Task | null>(null);
  const [ignoredCheckIns, setIgnoredCheckIns] = useState<Set<string>>(new Set());

  // Negotiation with DeadlineDevil AI States
  const [negotiatingTaskId, setNegotiatingTaskId] = useState<string | null>(null);
  const [negotiationChat, setNegotiationChat] = useState<{ sender: "user" | "devil"; text: string }[]>([]);
  const [negotiationInput, setNegotiationInput] = useState("");
  const [isSendingNegotiation, setIsSendingNegotiation] = useState(false);
  const [currentProposedDeal, setCurrentProposedDeal] = useState<{ extensionMinutes: number; requiredImmediateStep: string } | null>(null);
  const [negotiationStatus, setNegotiationStatus] = useState<"NEGOTIATING" | "DEAL_ACCEPTED" | "DEAL_REJECTED" | "NO_EXTENSION">("NEGOTIATING");

  // Quick inputs to test the app with single clicks
  const presets = [
    {
      label: "Default Student Rush",
      text: "I have C programming exam tomorrow at 9am, Electronic circuits assignment due tonight 11pm, student meeting at 4pm today"
    },
    {
      label: "Busy Professional Day",
      text: "Client project review deck due at 3pm, write API documentation tonight by 9pm, quick health check-up appointment at 11am"
    },
    {
      label: "Weekend Chores & Goals",
      text: "Need to clean my workspace room early around 9:30am, buy milk before supermarkets close at 6pm, study design patterns assignment due monday midnight"
    }
  ];

  // Manual single task creation state
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDeadline, setManualDeadline] = useState("");
  const [manualPriority, setManualPriority] = useState<"HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [manualTimeSlot, setManualTimeSlot] = useState("");
  const [manualTips, setManualTips] = useState("");

  // Anti-Cheat System States:
  // 1. Delete Protection
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<'POPUP' | 'CONFIRM_CONSEQUENCES' | null>(null);

  // 2. Suspicious Completion Detection
  const [suspiciousCompletingTaskId, setSuspiciousCompletingTaskId] = useState<string | null>(null);
  const [suspiciousCompletionReason, setSuspiciousCompletionReason] = useState("");

  // 3. Excessive Extension Detection
  const [excessiveExtensionTaskId, setExcessiveExtensionTaskId] = useState<string | null>(null);
  const [excessiveNudgeText, setExcessiveNudgeText] = useState("");
  const [excessivePanicActive, setExcessivePanicActive] = useState(false);

  // 4. Inactivity Detection
  const [inactivitySeconds, setInactivitySeconds] = useState(0);
  const [inactivityTriggered, setInactivityTriggered] = useState(false);
  const [inactivityChat, setInactivityChat] = useState<{ sender: "user" | "devil"; text: string }[]>([]);
  const [inactivityInput, setInactivityInput] = useState("");
  const [isSendingInactivityChat, setIsSendingInactivityChat] = useState(false);

  // Google Calendar Integration States
  const [googleToken, setGoogleToken] = useState<{ accessToken: string; expiry: number } | null>(() => {
    try {
      const saved = sessionStorage.getItem("deadline_devil_google_token");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.expiry > Date.now()) {
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  });
  const [googleUser, setGoogleUser] = useState<{ name: string; email: string; picture: string } | null>(() => {
    try {
      const saved = sessionStorage.getItem("deadline_devil_google_user");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
  });
  // Custom Google credentials overrides to avoid server process env cache issues
  const [customClientId, setCustomClientId] = useState(() => localStorage.getItem("deadline_devil_custom_client_id") || "");
  const [customClientSecret, setCustomClientSecret] = useState(() => localStorage.getItem("deadline_devil_custom_client_secret") || "");
  const [customRedirectUri, setCustomRedirectUri] = useState(() => localStorage.getItem("deadline_devil_custom_redirect_uri") || "");

  const [isGoogleConfigured, setIsGoogleConfigured] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [importedCalendarEvents, setImportedCalendarEvents] = useState<any[]>([]);
  const [calendarSyncError, setCalendarSyncError] = useState<string | null>(null);
  const [showCalendarSyncModal, setShowCalendarSyncModal] = useState(false);

  const pendingBulkImportRef = useRef(false);

  // Clear custom credentials and active session
  const handleClearCustomCredentials = () => {
    setCustomClientId("");
    setCustomClientSecret("");
    setCustomRedirectUri("");
    localStorage.removeItem("deadline_devil_custom_client_id");
    localStorage.removeItem("deadline_devil_custom_client_secret");
    localStorage.removeItem("deadline_devil_custom_redirect_uri");
    setGoogleToken(null);
    setGoogleUser(null);
    setImportedCalendarEvents([]);
    sessionStorage.removeItem("deadline_devil_google_token");
    sessionStorage.removeItem("deadline_devil_google_user");
    setCalendarSyncError(null);
    setDevilNudge("Polite notice: Custom Google Calendar credentials and token sessions have been purged from your local workspace storage.");
  };

  // Check Google OAuth config from server on mount
  useEffect(() => {
    const fetchGoogleConfig = async () => {
      try {
        const res = await fetch("/api/auth/google/config");
        if (res.ok) {
          const data = await res.json();
          setIsGoogleConfigured(data.isConfigured);
          setGoogleClientId(data.clientId);
        }
      } catch (err) {
        console.error("Failed to fetch Google OAuth config:", err);
      }
    };
    fetchGoogleConfig();
  }, []);

  const activeGoogleClientId = customClientId.trim() || googleClientId;
  const activeRedirectUri = customRedirectUri.trim() || `${window.location.origin}/auth/callback`;
  const isGoogleOAuthReady = isGoogleConfigured || (customClientId.trim() !== "" && customClientSecret.trim() !== "");

  // Listen for login popup postMessage events
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }

      if (event.data?.type === "OAUTH_AUTH_SUCCESS" && event.data?.code) {
        setIsSyncingCalendar(true);
        setCalendarSyncError(null);
        try {
          const res = await fetch("/api/auth/google/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: event.data.code,
              redirect_uri: activeRedirectUri,
              clientId: customClientId.trim() || undefined,
              clientSecret: customClientSecret.trim() || undefined
            })
          });

          const data = await safeParseJson(res);
          if (res.ok) {
            const tokenData = {
              accessToken: data.tokens.access_token,
              expiry: Date.now() + (data.tokens.expires_in || 3600) * 1000
            };
            setGoogleToken(tokenData);
            setGoogleUser(data.profile);
            sessionStorage.setItem("deadline_devil_google_token", JSON.stringify(tokenData));
            sessionStorage.setItem("deadline_devil_google_user", JSON.stringify(data.profile));
            setDevilNudge("Polite notice: Your Google Calendar has been securely linked! I can now sync your tasks and schedule them around your meetings.");
            
            if (pendingBulkImportRef.current) {
              handleBulkImportTasksToCalendar(data.tokens.access_token);
            }
          } else {
            throw new Error(data.error || "Failed to exchange token.");
          }
        } catch (err: any) {
          console.error("Token exchange failed:", err);
          setCalendarSyncError(err.message || "Failed to authorize Google account.");
        } finally {
          setIsSyncingCalendar(false);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [activeGoogleClientId, customClientId, customClientSecret, activeRedirectUri]);

  // Connect Google Calendar
  const handleConnectGoogle = () => {
    const clientIdToUse = customClientId.trim() || googleClientId;
    if (!clientIdToUse) {
      setCalendarSyncError("Google OAuth credentials are not configured yet. Please enter your Client ID and Client Secret in the Dynamic Credentials Override panel below or configure them on the server.");
      setShowCalendarSyncModal(true);
      return;
    }

    const scopes = [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email"
    ].join(" ");

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
      client_id: clientIdToUse,
      redirect_uri: activeRedirectUri,
      response_type: "code",
      scope: scopes,
      access_type: "offline",
      prompt: "consent"
    }).toString();

    const popup = window.open(authUrl, "google_oauth_popup", "width=600,height=700");
    if (!popup) {
      alert("Please allow popups to connect your Google Calendar!");
    }
  };

  // Google Sign out
  const handleGoogleLogout = () => {
    setGoogleToken(null);
    setGoogleUser(null);
    setImportedCalendarEvents([]);
    sessionStorage.removeItem("deadline_devil_google_token");
    sessionStorage.removeItem("deadline_devil_google_user");
    setDevilNudge("Your Google Calendar connection has been severed. I will return to tracking your timeline purely on my internal storage.");
  };

  // Import Today's Calendar Events
  const handleImportCalendarEvents = async () => {
    if (!googleToken) return;
    setIsSyncingCalendar(true);
    setCalendarSyncError(null);

    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      const res = await fetch(`/api/calendar/events?timeMin=${startOfToday.toISOString()}&timeMax=${endOfToday.toISOString()}`, {
        headers: {
          Authorization: `Bearer ${googleToken.accessToken}`
        }
      });

      const data = await safeParseJson(res);
      if (res.ok) {
        const events = data.items || [];
        setImportedCalendarEvents(events);
        setDevilNudge(`I have retrieved ${events.length} calendar event(s) for today. I will hold you accountable to schedule around these times!`);
      } else {
        throw new Error(data.error || "Failed to import events.");
      }
    } catch (err: any) {
      console.error("Calendar import failed:", err);
      setCalendarSyncError(err.message || "Could not retrieve calendar events.");
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  // Helper to parse slot to ISO string times
  const parseTimeSlotToDateTime = (timeSlotStr: string): { start: string; end: string } => {
    const today = new Date();
    const formatTime = (timeStr: string) => {
      const cleaned = timeStr.trim().toLowerCase();
      const match = cleaned.match(/(\d+)(?::(\d+))?\s*(am|pm)?/);
      let hours = 12;
      let minutes = 0;
      if (match) {
        hours = parseInt(match[1], 10);
        if (match[2]) minutes = parseInt(match[2], 10);
        const modifier = match[3];
        if (modifier === "pm" && hours < 12) hours += 12;
        if (modifier === "am" && hours === 12) hours = 0;
      }

      const date = new Date(today);
      date.setHours(hours, minutes, 0, 0);
      return date.toISOString();
    };

    const parts = timeSlotStr.split("-");
    if (parts.length === 2) {
      return {
        start: formatTime(parts[0]),
        end: formatTime(parts[1])
      };
    }

    const startMs = Date.now();
    return {
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + 60 * 60 * 1000).toISOString()
    };
  };

  // Sync Task to Calendar
  const handleSyncTaskToCalendar = async (taskId: string) => {
    if (!googleToken) {
      handleConnectGoogle();
      return;
    }

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setIsSyncingCalendar(true);
    setCalendarSyncError(null);

    try {
      const times = parseTimeSlotToDateTime(task.timeSlot);
      const checklistStr = task.steps.map((s, idx) => `[ ] ${s}`).join("\n");
      const bodyDescription = `${task.tips}\n\nChecklist:\n${checklistStr}\n\nSync'd with DeadlineDevil.`;

      const response = await fetch("/api/calendar/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleToken.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          summary: `😈 [DeadlineDevil] ${task.name}`,
          description: bodyDescription,
          start: times.start,
          end: times.end
        })
      });

      const eventData = await safeParseJson(response);
      if (response.ok) {
        setTasks(prev => prev.map(t => {
          if (t.id === taskId) {
            return {
              ...t,
              googleEventId: eventData.id,
              googleEventLink: eventData.htmlLink
            };
          }
          return t;
        }));
        setDevilNudge(`Polite sync sealed! "${task.name}" has been mapped directly to your Google Calendar.`);
      } else {
        throw new Error(eventData.error || "Failed to create event.");
      }
    } catch (err: any) {
      console.error("Export to calendar failed:", err);
      setCalendarSyncError(err.message || "Failed to sync task to calendar.");
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  // Bulk Import Tasks to Calendar
  const handleBulkImportTasksToCalendar = async (customToken?: string) => {
    const token = customToken || googleToken?.accessToken;
    if (!token) {
      pendingBulkImportRef.current = true;
      handleConnectGoogle();
      return;
    }

    pendingBulkImportRef.current = false;
    setIsSyncingCalendar(true);
    setCalendarSyncError(null);

    const tasksToImport = tasks.filter(t => !t.googleEventId);
    if (tasksToImport.length === 0) {
      setDevilNudge("Polite notice: All your current tasks are already synced to your Google Calendar!");
      setIsSyncingCalendar(false);
      return;
    }

    let successCount = 0;
    let currentTasks = [...tasks];

    try {
      for (const task of tasksToImport) {
        const times = parseTimeSlotToDateTime(task.timeSlot);
        const checklistStr = task.steps && task.steps.length > 0
          ? task.steps.map((s, idx) => `[ ] ${s}`).join("\n")
          : "";
        const bodyDescription = `Deadline: ${task.deadline}\nPriority: ${task.priority}\n\n${task.tips || ""}\n\nChecklist:\n${checklistStr}\n\nSync'd with DeadlineDevil.`;

        const response = await fetch("/api/calendar/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            summary: `😈 [DeadlineDevil] ${task.name}`,
            description: bodyDescription,
            start: times.start,
            end: times.end
          })
        });

        if (response.ok) {
          const eventData = await response.json();
          currentTasks = currentTasks.map(t => {
            if (t.id === task.id) {
              return {
                ...t,
                googleEventId: eventData.id,
                googleEventLink: eventData.htmlLink
              };
            }
            return t;
          });
          successCount++;
        } else {
          const errData = await safeParseJson(response);
          console.error("Failed to sync individual task:", task.name, errData);
        }
      }

      setTasks(currentTasks);
      setDevilNudge(`Polite success! ${successCount} task(s) successfully imported into your Google Calendar.`);
      alert(`Successfully imported ${successCount} event(s) to your Google Calendar!`);
    } catch (err: any) {
      console.error("Bulk export to calendar failed:", err);
      setCalendarSyncError(err.message || "Failed to sync tasks to your Google Calendar.");
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  // Unsync Task from Calendar
  const handleUnsyncTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.googleEventId) return;

    const confirmed = window.confirm(`Remove this task from your Google Calendar? This will delete the matching event: "${task.name}".`);
    if (!confirmed) return;

    setIsSyncingCalendar(true);
    setCalendarSyncError(null);

    try {
      const response = await fetch(`/api/calendar/events/${task.googleEventId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${googleToken?.accessToken}`
        }
      });

      const errData = await safeParseJson(response);
      if (response.ok) {
        setTasks(prev => prev.map(t => {
          if (t.id === taskId) {
            return {
              ...t,
              googleEventId: undefined,
              googleEventLink: undefined
            };
          }
          return t;
        }));
        setDevilNudge(`Successfully removed "${task.name}" from Google Calendar.`);
      } else {
        throw new Error(errData.error || "Failed to delete calendar event.");
      }
    } catch (err: any) {
      console.error("Calendar delete failed:", err);
      setCalendarSyncError(err.message || "Failed to unsync calendar event.");
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  // Sync state to LocalStorage
  useEffect(() => {
    localStorage.setItem("deadline_devil_tasks", JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem("deadline_devil_nudge", devilNudge);
  }, [devilNudge]);

  useEffect(() => {
    localStorage.setItem("deadline_devil_sim_time", currentTime.toISOString());
  }, [currentTime]);

  // Real-time ticking device clock 
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  // Monitor simulated time to trigger check-in popup
  useEffect(() => {
    // Look for currently active, uncompleted tasks whose timeSlot end or check-in boundaries was crossed
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
  }, [currentTime, tasks, ignoredCheckIns]);

  // Active Session Timer Tracker
  useEffect(() => {
    if (activeTaskId) {
      timerRef.current = setInterval(() => {
        setSessionSeconds(prev => prev + 1);
        setInactivitySeconds(prev => {
          const nextVal = prev + 1;
          if (nextVal >= 1200 && !inactivityTriggered) {
            setInactivityTriggered(true);
            const activeTask = tasks.find(t => t.id === activeTaskId);
            setInactivityChat([
              { sender: "devil", text: `Your session started 20 minutes ago but no progress detected on "${activeTask?.name || 'your task'}". What is blocking you right now?` }
            ]);
          }
          return nextVal;
        });
        // Feed progress dynamically during active work sessions
        setTasks(prevTasks =>
          prevTasks.map(t => {
            if (t.id === activeTaskId) {
              const nextTimeSpent = t.actualTimeSpent + 1;
              // Smooth step progress over the estimated session
              const addedProgress = Math.min(Math.floor((nextTimeSpent / 3600) * 100), 95);
              return {
                ...t,
                actualTimeSpent: nextTimeSpent,
                progress: Math.max(t.progress, addedProgress)
              };
            }
            return t;
          })
        );
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeTaskId, inactivityTriggered, tasks]);

  // Request parsing chaotic paragraph via Server Gemini AI Proxy
  const handleParseMessyParagraph = async (textToParse: string, isFromPanicMic = false) => {
    if (!textToParse.trim()) return;
    setLoading(true);
    if (isFromPanicMic) {
      setPanicStatus("processing");
    }
    try {
      const response = await fetch("/api/parse-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paragraph: textToParse })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to parse tasks via server backend proxy.");
      }

      const result = await response.json();
      
      if (result.tasks && Array.isArray(result.tasks)) {
        const newTasks: Task[] = result.tasks.map((t: any, index: number) => ({
          id: `task-${Date.now()}-${index}`,
          name: t.name || "Untitled Action Item",
          deadline: t.deadline || "Today",
          priority: (t.priority || "MEDIUM").toUpperCase() as "HIGH" | "MEDIUM" | "LOW",
          timeSlot: t.timeSlot || "Flexible Time",
          steps: Array.isArray(t.steps) ? t.steps : ["Outline goals", "Execute study flow", "Verify steps"],
          tips: t.tips || "Stay fully focused and take brief resting blocks.",
          completed: false,
          progress: 0,
          actualTimeSpent: 0,
          stepsGenerated: true,
          isGeneratingSteps: false,
          deadlineTimestamp: parseDeadlineToTimestamp(t.deadline || "Today")
        }));

        setTasks(prev => [...newTasks, ...prev]);
        setDevilNudge(result.devilNudge || "I have analyzed your chaotic thoughts and forged a dynamic day-plan. Your high-priority goals are clearly highlighted.");
        
        // Auto-expand the newly generated tips
        const indexMap: Record<string, boolean> = {};
        newTasks.forEach(nt => {
          indexMap[nt.id] = true;
        });
        setExpandedTips(prev => ({ ...prev, ...indexMap }));
        setMessyInput("");
      } else {
        throw new Error("Invalid format returned by the AI planner.");
      }
    } catch (err: any) {
      console.error(err);
      setDevilNudge(`My core connection is running slightly slow, but do not panic! I have safely logged a manual workspace entry. Error details: ${err.message || 'Unknown network error'}`);
      const fallbackTask: Task = {
        id: `task-fallback-${Date.now()}`,
        name: textToParse,
        deadline: "Tonight",
        priority: "HIGH",
        timeSlot: "Today 6:00 PM - 7:30 PM",
        steps: [
          "Break parsed content into smaller segments",
          "Conduct high energy flow for 45 minutes",
          "Record key outputs and results"
        ],
        tips: "Keep your workspace clean and tidy! Let's conquer this today step-by-step.",
        completed: false,
        progress: 10,
        actualTimeSpent: 0,
        deadlineTimestamp: Date.now() + 4 * 60 * 60 * 1000 // 4 hours from now
      };
      setTasks(prev => [fallbackTask, ...prev]);
    } finally {
      setLoading(false);
      setPanicStatus("idle");
    }
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setDevilNudge("Browser speech recognition is not supported in this environment. Please try Chrome, Edge or Safari.");
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      let finalTranscript = "";
      latestTranscriptRef.current = "";

      recognition.onstart = () => {
        setIsRecording(true);
        setPanicStatus("recording");
        if (recordingTimeoutRef.current) {
          clearTimeout(recordingTimeoutRef.current);
        }
        // Auto stop after 60 seconds (requirement 3)
        recordingTimeoutRef.current = setTimeout(() => {
          stopRecording();
        }, 60000);
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + " ";
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        const fullText = (finalTranscript + interimTranscript).trim();
        setMessyInput(fullText);
        latestTranscriptRef.current = fullText;
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          setDevilNudge("Microphone access denied. Please allow microphone permissions in your browser settings.");
        } else if (event.error === "no-speech") {
          console.log("No speech detected.");
        } else {
          setDevilNudge(`Speech recognition issue: ${event.error}. Please try again.`);
        }
        setIsRecording(false);
        setPanicStatus("idle");
        if (recordingTimeoutRef.current) {
          clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = null;
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
        if (recordingTimeoutRef.current) {
          clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = null;
        }

        const finalRecordedText = latestTranscriptRef.current.trim();
        if (finalRecordedText) {
          setPanicStatus("processing");
          handleParseMessyParagraph(finalRecordedText, true);
        } else {
          setPanicStatus("idle");
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      console.error(e);
      setDevilNudge("Failed to initialize browser speech recognition engine.");
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  // Triggering the reschedule callback
  const handleRescheduleRemaining = async () => {
    setLoading(true);
    setCheckInTask(null);
    const uncompleted = tasks.filter(t => !t.completed);
    
    if (uncompleted.length === 0) {
      setDevilNudge("Marvelous effort! There are no pending tasks left on your agenda to reschedule. You are fully master of your time today!");
      setLoading(false);
      return;
    }

    try {
      const timeStr = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const response = await fetch("/api/reschedule-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remainingTasks: uncompleted,
          currentTimeString: timeStr
        })
      });

      if (!response.ok) {
        throw new Error("Server reschedule endpoint returned an error status.");
      }

      const result = await response.json();
      if (result.tasks && Array.isArray(result.tasks)) {
        const updatedTasks = tasks.map(t => {
          if (t.completed) return t;
          const matchingAIResched = result.tasks.find((aiT: any) => 
            aiT.name.toLowerCase().includes(t.name.toLowerCase()) || 
            t.name.toLowerCase().includes(aiT.name.toLowerCase())
          ) || result.tasks[0];

          if (matchingAIResched) {
            return {
              ...t,
              timeSlot: matchingAIResched.timeSlot || t.timeSlot,
              deadline: matchingAIResched.deadline || t.deadline,
              priority: (matchingAIResched.priority || t.priority).toUpperCase() as "HIGH" | "MEDIUM" | "LOW",
              tips: matchingAIResched.tips || t.tips,
              steps: matchingAIResched.steps || t.steps,
              stepsGenerated: true,
              isGeneratingSteps: false
            };
          }
          return t;
        });

        setTasks(updatedTasks);
        setDevilNudge(result.devilNudge || "No worries at all! I have instantly reconstructed your workspace map starting from our present moment. Let us start afresh with clean energy.");
      }
    } catch (e: any) {
      console.error(e);
      setDevilNudge("I encountered a hiccup while communicating with my AI core. Rest assured, I have pushed our pending tasks further down the afternoon slot for your comfort.");
      setTasks(prev => prev.map(t => {
        if (!t.completed) {
          return {
            ...t,
            timeSlot: `Adjusted Later Today (${currentTime.getHours() + 1}:00 onwards)`
          };
        }
        return t;
      }));
    } finally {
      setLoading(false);
    }
  };

  // Helper toggle completion
  const toggleTaskCompleted = (id: string, explanation?: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Going from incomplete to complete
    if (!task.completed && !explanation) {
      if (task.actualTimeSpent < 300) {
        setSuspiciousCompletingTaskId(id);
        setSuspiciousCompletionReason("");
        return;
      }
    }

    const targetState = !task.completed;

    // Synchronize completion status with Google Calendar if event exists
    if (task.googleEventId && googleToken) {
      const nextSummary = targetState ? `✅ [DONE] ${task.name}` : `😈 [DeadlineDevil] ${task.name}`;
      fetch(`/api/calendar/events/${task.googleEventId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${googleToken.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          summary: nextSummary,
          description: targetState
            ? `${task.tips}\n\nCompleted successfully!\n${explanation ? `Verification: "${explanation}"\n` : ""}\nManaged via DeadlineDevil.`
            : `${task.tips}\n\nScheduled via DeadlineDevil.`
        })
      }).catch(err => console.error("Failed to update completed status on Google Calendar:", err));
    }

    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        if (targetState && activeTaskId === id) {
          setActiveTaskId(null);
        }
        return {
          ...t,
          completed: targetState,
          progress: targetState ? 100 : Math.min(t.progress, 90)
        };
      }
      return t;
    }));

    if (targetState) {
      setFocusStreak(prev => {
        const next = prev + 1;
        localStorage.setItem("deadline_devil_focus_streak", next.toString());
        return next;
      });
    } else {
      setFocusStreak(prev => {
        const next = Math.max(0, prev - 1);
        localStorage.setItem("deadline_devil_focus_streak", next.toString());
        return next;
      });
    }

    if (explanation) {
      setDevilNudge(`Excellent accountability! You verified "${task.name}" completion: "${explanation}". Fantastic work!`);
    }

    setSuspiciousCompletingTaskId(null);
    setSuspiciousCompletionReason("");
  };

  // Modify task checklist step progress percentage
  const handleCheckStepItem = (taskId: string, stepIndex: number, currentLen: number) => {
    setInactivitySeconds(0);
    setInactivityTriggered(false);
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const nextProgress = Math.min(Math.floor(((stepIndex + 1) / currentLen) * 100), 100);
        return {
          ...t,
          progress: Math.max(t.progress, nextProgress)
        };
      }
      return t;
    }));
  };

  // Core Extension Manager with Anti-Cheat Detection
  const handleExtendTask = async (taskId: string, minutes: number) => {
    let triggeredExcessive = false;
    let finalExtCount = 1;
    let targetTaskName = "your task";

    const taskObj = tasks.find(t => t.id === taskId);
    if (taskObj && taskObj.googleEventId && googleToken) {
      const times = parseTimeSlotToDateTime(taskObj.timeSlot);
      const updatedEnd = new Date(new Date(times.end).getTime() + minutes * 60 * 1000).toISOString();
      const updatedCount = (taskObj.extensionCount || 0) + 1;
      fetch(`/api/calendar/events/${taskObj.googleEventId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${googleToken.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          end: updatedEnd,
          description: `${taskObj.tips}\n\nExtended ${updatedCount} times.\nScheduled via DeadlineDevil.`
        })
      }).catch(e => console.error("Failed to update Google Calendar event end time:", e));
    }

    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const nextExtCount = (t.extensionCount || 0) + 1;
        finalExtCount = nextExtCount;
        targetTaskName = t.name;
        if (nextExtCount > 2) {
          triggeredExcessive = true;
        }
        return {
          ...t,
          extensionCount: nextExtCount,
          timeSlot: t.timeSlot.includes("Extended")
            ? t.timeSlot.replace(/Extended \+(\d+)m/, (_, m) => `Extended +${parseInt(m) + minutes}m`)
            : `${t.timeSlot} (Extended +${minutes}m)`,
          deadlineTimestamp: (t.deadlineTimestamp || Date.now()) + minutes * 60 * 1000
        };
      }
      return t;
    }));

    if (triggeredExcessive) {
      setExcessivePanicActive(true);
      setExcessiveExtensionTaskId(taskId);
      setExcessiveNudgeText(`You have extended "${targetTaskName}" ${finalExtCount} times. This pattern suggests you need help breaking this into smaller steps. Let me restructure this for you.`);
      setDevilNudge(`⚠️ Panic Meter Spike! Excessive extensions detected for "${targetTaskName}". Automatically restructuring subtasks...`);
      
      // Call subtask regeneration automatically
      try {
        await fetchSubtasksForTask(taskId, targetTaskName);
      } catch (err) {
        console.error("Auto restructure subtasks failed:", err);
      }
    } else {
      setDevilNudge(`I have expanded your timeline boundaries by +${minutes} minutes for "${targetTaskName}". Go at your own pace!`);
    }
  };

  // Apply agreed-upon deal to task deadline
  const handleApplyDeal = (minutes: number) => {
    const currentNegotiatingId = negotiatingTaskId;
    if (!currentNegotiatingId) return;
    
    handleExtendTask(currentNegotiatingId, minutes);
    
    // Clear negotiation states
    setNegotiatingTaskId(null);
    setNegotiationChat([]);
    setCurrentProposedDeal(null);
    setNegotiationStatus("NEGOTIATING");
  };

  // Send message to negotiation chat
  const handleSendNegotiationMessage = async (text?: string) => {
    const input = text !== undefined ? text : negotiationInput;
    if (!input.trim() || !negotiatingTaskId) return;

    const criticalTask = tasks.find(t => t.id === negotiatingTaskId);
    if (!criticalTask) return;

    // Add user message to chat history
    const newUserMsg = { sender: "user" as const, text: input };
    const updatedChat = [...negotiationChat, newUserMsg];
    setNegotiationChat(updatedChat);
    setNegotiationInput("");
    setIsSendingNegotiation(true);

    try {
      const response = await fetch("/api/negotiate-delay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: criticalTask,
          currentTimeString: currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          allRemainingTasks: tasks.filter(t => !t.completed && t.id !== criticalTask.id),
          chatHistory: updatedChat,
          userInput: input,
          timeRemainingLabel: getUrgencyState(criticalTask, currentTime).label
        })
      });

      if (!response.ok) {
        throw new Error("Failed to contact negotiation server");
      }

      const data = await response.json();
      
      const devilMsg = { sender: "devil" as const, text: data.reply };
      setNegotiationChat(prev => [...prev, devilMsg]);
      setNegotiationStatus(data.negotiationStatus);

      if (data.dealProposed && data.proposedExtensionMinutes && data.requiredImmediateStep) {
        setCurrentProposedDeal({
          extensionMinutes: data.proposedExtensionMinutes,
          requiredImmediateStep: data.requiredImmediateStep
        });
      } else {
        setCurrentProposedDeal(null);
      }

      if (data.negotiationStatus === "DEAL_ACCEPTED" && data.proposedExtensionMinutes) {
        // Apply deal using current negotiating ID
        const targetMinutes = data.proposedExtensionMinutes;
        handleExtendTask(negotiatingTaskId, targetMinutes);
        
        // Clear negotiation states
        setNegotiatingTaskId(null);
        setNegotiationChat([]);
        setCurrentProposedDeal(null);
        setNegotiationStatus("NEGOTIATING");
      }
    } catch (err) {
      console.error(err);
      setNegotiationChat(prev => [...prev, { sender: "devil", text: "My internal circuits are slightly chaotic. Let's focus on the schedules, or repeat that cleanly for me." }]);
    } finally {
      setIsSendingNegotiation(false);
    }
  };

  const handleRejectDeal = () => {
    setCurrentProposedDeal(null);
    setNegotiationStatus("DEAL_REJECTED");
    handleSendNegotiationMessage("I reject this deal. What else can you offer?");
  };

  // Start or Stop focused work session
  const toggleSession = (taskId: string) => {
    if (activeTaskId === taskId) {
      setActiveTaskId(null);
    } else {
      setActiveTaskId(taskId);
      setSessionSeconds(0);
      setDevilNudge(`Excellent! You are now fully focused on "${tasks.find(t => t.id === taskId)?.name}". Deep breath—turn on do-not-disturb, and let's craft excellence.`);
    }
  };

  // Delete task safely with Delete Protection
  const deleteTask = (id: string, forceAbandon: boolean = false) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (!forceAbandon) {
      const diffMs = (task.deadlineTimestamp || 0) - currentTime.getTime();
      const hoursRemaining = diffMs / (60 * 60 * 1000);

      // If less than 3 hours remaining and not completed
      if (!task.completed && hoursRemaining < 3 && hoursRemaining > -24) {
        setDeletingTaskId(id);
        setDeleteConfirmStep('POPUP');
        return;
      }
    }

    if (task.googleEventId && googleToken) {
      fetch(`/api/calendar/events/${task.googleEventId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${googleToken.accessToken}`
        }
      }).catch(err => console.error("Failed to delete matching Google Calendar event on task deletion:", err));
    }

    if (activeTaskId === id) {
      setActiveTaskId(null);
    }
    setTasks(prev => prev.filter(t => t.id !== id));
    setDeletingTaskId(null);
    setDeleteConfirmStep(null);
  };

  // Generate dynamic, context-aware subtasks via server proxy
  const fetchSubtasksForTask = async (taskId: string, taskName: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return { ...t, isGeneratingSteps: true };
      }
      return t;
    }));

    try {
      const response = await fetch("/api/generate-subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskName })
      });

      if (!response.ok) {
        throw new Error("Failed to generate subtasks");
      }

      const data = await response.json();
      
      // Synchronize restructured subtasks checklist with Google Calendar
      const taskObj = tasks.find(t => t.id === taskId);
      if (taskObj && taskObj.googleEventId && googleToken && data.steps && Array.isArray(data.steps)) {
        const checklistStr = data.steps.map((s: string, idx: number) => `[ ] ${s}`).join("\n");
        const updatedDescription = `${data.tips || taskObj.tips}\n\nRestructured Checklist:\n${checklistStr}\n\nSynced with DeadlineDevil.`;
        fetch(`/api/calendar/events/${taskObj.googleEventId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${googleToken.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            description: updatedDescription
          })
        }).catch(err => console.error("Failed to patch Google Calendar with restructured subtasks:", err));
      }

      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return {
            ...t,
            steps: Array.isArray(data.steps) ? data.steps : t.steps,
            tips: data.tips || t.tips,
            stepsGenerated: true,
            isGeneratingSteps: false,
          };
        }
        return t;
      }));
    } catch (err) {
      console.error("Error generating subtasks:", err);
      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return { ...t, isGeneratingSteps: false, stepsGenerated: true };
        }
        return t;
      }));
    }
  };

  // Add standard manual task directly
  const handleAddManualTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;

    const newTask: Task = {
      id: `task-manual-${Date.now()}`,
      name: manualTitle,
      deadline: manualDeadline || "Tonight",
      priority: manualPriority,
      timeSlot: manualTimeSlot || "10:00 AM - 11:30 AM",
      steps: ["Preparing target approach...", "Breaking down objectives...", "Executing checklist..."],
      tips: manualTips || "Formulating expert focal advices...",
      completed: false,
      progress: 0,
      actualTimeSpent: 0,
      stepsGenerated: false,
      deadlineTimestamp: parseDeadlineToTimestamp(manualDeadline || "Tonight")
    };

    setTasks(prev => [newTask, ...prev]);
    setExpandedTips(prev => ({ ...prev, [newTask.id]: true }));
    
    // Reset manual form
    setManualTitle("");
    setManualDeadline("");
    setManualTimeSlot("");
    setManualTips("");
    setIsAddingManual(false);
    
    setDevilNudge(`Splendid! I have manually registered "${newTask.name}" and aligned it with priority: ${newTask.priority}. Designing specific workflows via Gemini AI now...`);

    // Fetch the customized steps immediately
    fetchSubtasksForTask(newTask.id, newTask.name);
  };

  // Quick Action: Reset list to default presets
  const handleResetToPresets = () => {
    const now = Date.now();
    setTasks([
      {
        id: "preset-1",
        name: "C programming practice questions revision",
        deadline: "Tomorrow 9:00 AM",
        priority: "HIGH",
        timeSlot: "11:00 AM - 1:00 PM",
        steps: [
          "Revisit logic structures and memory layouts",
          "Implement custom double-linked pointers logic"
        ],
        tips: "Draw pointer diagrams on scrap paper before typing lines of code.",
        completed: false,
        progress: 10,
        actualTimeSpent: 300,
        stepsGenerated: true,
        deadlineTimestamp: now + 18 * 60 * 60 * 1000
      },
      {
        id: "preset-2",
        name: "Electronic circuits assignment submission",
        deadline: "Today 11:00 PM",
        priority: "HIGH",
        timeSlot: "6:00 PM - 8:00 PM",
        steps: [
          "Double check high-pass filter calculations and capacitor formulas",
          "Convert design project diagrams into a tidy report document"
        ],
        tips: "Review previous teacher comments to confirm you did not omit minor parameters.",
        completed: false,
        progress: 0,
        actualTimeSpent: 0,
        stepsGenerated: true,
        deadlineTimestamp: now + 4.5 * 60 * 60 * 1000
      }
    ]);
    setDevilNudge("Resetting workspace matrix. Initialized structured blueprints with high efficiency parameters! Click any task card to start a focused stopwatch.");
  };

  const handleClearCompletedTasks = () => {
    setTasks(prev => prev.filter(t => !t.completed));
    setDevilNudge("Polite notice: All completed tasks have been removed from your workspace list.");
  };

  const formattedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Filters tasks based on query
  const filteredTasks = tasks.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.deadline.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.priority.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeAndPendingTasks = filteredTasks.filter(t => !t.completed);
  const completedTasks = filteredTasks.filter(t => t.completed);

  // Split active/pending tasks into Future and Overdue tasks
  const overdueTasks = activeAndPendingTasks.filter(t => t.deadlineTimestamp && t.deadlineTimestamp < currentTime.getTime());
  const futureActiveTasks = activeAndPendingTasks.filter(t => !t.deadlineTimestamp || t.deadlineTimestamp >= currentTime.getTime())
    .sort((a, b) => {
      const aTime = a.deadlineTimestamp || Infinity;
      const bTime = b.deadlineTimestamp || Infinity;
      return aTime - bTime;
    });

  // Compute real-time urgency metrics for pending tasks
  const pendingTasksWithUrgency = tasks
    .filter(t => !t.completed)
    .map(t => {
      const urgency = getUrgencyState(t, currentTime);
      return { ...t, urgency };
    });

  const sortedUrgentTasks = [...pendingTasksWithUrgency].sort(
    (a, b) => a.urgency.minutesRemaining - b.urgency.minutesRemaining
  );

  const emergencyTask = sortedUrgentTasks.find(t => t.urgency.mode === 'EMERGENCY');
  const criticalTask = !emergencyTask ? sortedUrgentTasks.find(t => t.urgency.mode === 'CRITICAL') : null;

  // Calculate dynamic Panic Meter value (0 - 100) based on task priorities and real-time urgency/deadlines
  const calculatePanicLevel = () => {
    const pendingTasks = tasks.filter(t => !t.completed);
    if (pendingTasks.length === 0) return 0;

    const urgencies = pendingTasks.map(t => getUrgencyState(t, new Date()));
    const modes = urgencies.map(u => u.mode);

    let basePanic = 15;
    if (modes.includes("EMERGENCY")) {
      const emergencyCount = urgencies.filter(u => u.mode === "EMERGENCY").length;
      basePanic = 85 + Math.min(15, emergencyCount * 3);
    } else if (modes.includes("CRITICAL")) {
      const criticalCount = urgencies.filter(u => u.mode === "CRITICAL").length;
      basePanic = 65 + Math.min(20, criticalCount * 4);
    } else if (modes.includes("ALERT")) {
      const alertCount = urgencies.filter(u => u.mode === "ALERT").length;
      basePanic = 35 + Math.min(30, alertCount * 5);
    } else {
      const normalCount = urgencies.filter(u => u.mode === "NORMAL").length;
      basePanic = 15 + Math.min(20, normalCount * 2);
    }

    return Math.min(100, Math.max(10, basePanic));
  };

  const panicLevel = calculatePanicLevel();

  const renderTaskCard = (task: Task) => {
    const isHigh = task.priority === "HIGH";
    const isMed = task.priority === "MEDIUM";
    const isExpanded = !!expandedTips[task.id];
    const urgency = getUrgencyState(task, currentTime);

    // Priority & Urgency card styling
    let priorityCardStyle = "border-[#1E293B]/50 bg-[#111A2E]/40 backdrop-blur-sm hover:border-[#7C3AED]/40 shadow-sm";
    let badgeStyle = "border-[#1E293B]/50 text-[#71767B] bg-[#0A0F1A]/80";
    
    if (urgency.mode === "EMERGENCY") {
      priorityCardStyle = "border-rose-500 bg-rose-950/20 shadow-[0_0_15px_rgba(244,63,94,0.4)]";
      badgeStyle = "border-rose-500/50 text-rose-400 bg-rose-500/10";
    } else if (urgency.mode === "CRITICAL") {
      priorityCardStyle = "border-red-500 bg-red-950/10 shadow-[0_0_12px_rgba(239,68,68,0.3)]";
      badgeStyle = "border-red-500/50 text-red-400 bg-red-500/10";
    } else if (urgency.mode === "ALERT") {
      priorityCardStyle = "border-[#F97316] bg-[#221B18] shadow-[0_0_15px_rgba(249,115,22,0.4)] animate-pulse";
      badgeStyle = "border-[#F97316]/50 text-[#F97316] bg-[#F97316]/20";
    } else {
      if (isHigh) {
        priorityCardStyle = "border-[#F97316]/30 bg-[#221B18] hover:border-[#F97316]/60";
        badgeStyle = "border-[#F97316]/30 text-[#F97316] bg-[#F97316]/20";
      } else if (isMed) {
        priorityCardStyle = "border-[#7C3AED]/30 bg-[#1B1825] hover:border-[#7C3AED]/60";
        badgeStyle = "border-[#7C3AED]/30 text-[#7C3AED] bg-[#7C3AED]/20";
      }
    }

    return (
      <div 
        key={task.id} 
        className={`${priorityCardStyle} border rounded-xl p-4 transition-all duration-200`}
      >
        {/* Top Row: Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {/* Time block */}
          <span className="text-[11px] font-mono text-[#A78BFA] bg-[#1E1B29] border border-[#7C3AED]/30 rounded-md px-2 py-0.5">
            ⏰ {task.timeSlot}
          </span>

          {/* Urgency Badge */}
          <span className={`text-[11px] font-mono rounded-md px-2 py-0.5 bg-[#111A2E]/50 border border-[#1E293B]/50 ${urgency.color}`}>
            ⏳ {urgency.label}
          </span>

          {/* Inline Priority Tag */}
          <span className={`text-[10px] tracking-wider font-mono font-bold px-2 py-0.5 rounded-full border uppercase ${badgeStyle}`}>
            {task.priority}
          </span>
        </div>

        {/* Middle Row: Title (Clickable) */}
        <div 
          onClick={() => {
            const nextState = !expandedTips[task.id];
            setExpandedTips(prev => ({ ...prev, [task.id]: nextState }));
            if (nextState && !task.stepsGenerated && !task.isGeneratingSteps) {
              fetchSubtasksForTask(task.id, task.name);
            }
          }}
          className="flex items-center justify-between cursor-pointer group/title hover:bg-[#1E2024]/40 p-2 rounded-lg -ml-2 transition-all mb-3"
        >
          <span className="text-xs font-semibold text-[#E7E9EA] group-hover/title:text-white transition-all break-words pr-2">
            {task.name}
          </span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[#71767B] shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-[#71767B] shrink-0" />}
        </div>

        {/* Progress Tracker */}
        <div className="mb-4">
          <div className="flex justify-between items-center text-[9px] text-[#71767B] font-mono mb-1">
            <span>SUBTASKS RESOLVED: {task.progress}%</span>
            <span>DEADLINE: {task.deadline}</span>
          </div>
          <div className="w-full bg-[#1E2024] border border-[#2F3336] rounded-full h-1.5 overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${
                isHigh 
                  ? "bg-[#F97316]" 
                  : isMed 
                  ? "bg-[#7C3AED]" 
                  : "bg-slate-600"
              }`}
              style={{ width: `${task.progress}%` }}
            ></div>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center justify-end space-x-2 border-t border-[#2F3336]/30 pt-3 relative z-10">
          {task.googleEventId ? (
            <div className="flex items-center space-x-1 bg-[#1C2333]/50 border border-emerald-500/20 rounded-lg px-2 py-0.5" title="Google Calendar Synced">
              <a 
                href={task.googleEventLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center space-x-1"
              >
                <span>Synced ↗</span>
              </a>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnsyncTask(task.id);
                }}
                className="text-[#71767B] hover:text-red-400 p-0.5 ml-1 transition-colors cursor-pointer"
                title="Unsync and Delete Calendar Event"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSyncTaskToCalendar(task.id);
              }}
              className="px-2 py-1 text-[10px] text-[#A78BFA] hover:text-[#C4B5FD] bg-[#1E1B29] border border-[#7C3AED]/30 hover:border-[#7C3AED]/60 rounded-lg transition-colors flex items-center space-x-1 outline-none cursor-pointer font-mono"
              title="Sync to Google Calendar"
            >
              <Calendar className="w-2.5 h-2.5 text-[#A78BFA]" />
              <span>Sync</span>
            </button>
          )}

          <button
            onClick={(e) => {
                e.stopPropagation();
                handleExtendTask(task.id, 30);
            }}
            className="px-2.5 py-1 text-[10px] text-[#E7E9EA] hover:text-white bg-[#1E2024] border border-[#2F3336] rounded-lg transition-colors flex items-center space-x-1 outline-none hover:border-slate-500 cursor-pointer font-mono"
            title="Add +30m to task block and push deadline"
          >
            <span>Extend</span>
          </button>

          <button
            onClick={(e) => {
                e.stopPropagation();
                toggleTaskCompleted(task.id);
                setDevilNudge(`Outstanding! Marked "${task.name}" as fully completed.`);
            }}
            className="px-2.5 py-1 text-[10px] text-[#A78BFA] hover:bg-[#7C3AED] hover:text-white bg-[#1E1B29] border border-[#7C3AED]/30 hover:border-[#7C3AED]/60 rounded-lg transition-colors font-semibold flex items-center space-x-1 outline-none cursor-pointer font-mono relative z-20"
          >
            <span>Mark Done</span>
          </button>
        </div>

        {/* Collapsible Subtasks Section */}
        {isExpanded && (
          <div className="mt-3 bg-[#16181C] border border-[#2F3336] rounded-xl p-3.5 text-xs space-y-3">
            {task.isGeneratingSteps ? (
              <div className="py-5 flex flex-col items-center justify-center space-y-2">
                <RefreshCw className="w-5 h-5 text-[#A78BFA] animate-spin" />
                <div className="text-center font-mono">
                  <p className="text-[11px] font-semibold text-[#E7E9EA]">Consulting AI prioritizer...</p>
                  <p className="text-[9px] text-[#71767B]">Generating customized domain-specific roadmap</p>
                </div>
              </div>
            ) : (
              <>
                {/* Actionable Checklist Plan (Specific Subtasks) */}
                {task.steps && task.steps.length > 0 && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] text-[#71767B] uppercase tracking-widest font-bold font-mono">
                        Actionable Checklist Plan:
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          fetchSubtasksForTask(task.id, task.name);
                        }}
                        className="text-[9px] text-[#A78BFA] hover:text-[#C4B5FD] flex items-center space-x-1 font-mono transition-colors border-none bg-transparent cursor-pointer"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>Regenerate</span>
                      </button>
                    </div>
                    <div className="space-y-2 pl-1">
                      {task.steps.map((st, sidx) => (
                        <label
                          key={sidx}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCheckStepItem(task.id, sidx, task.steps.length);
                          }}
                          className="flex items-start space-x-2 text-[11px] text-[#E7E9EA] cursor-pointer hover:text-white transition-colors"
                        >
                          <span className="mt-0.5 text-[#F97316] font-bold font-mono text-[10px]">
                            [{sidx + 1}]
                          </span>
                          <span className="leading-relaxed">{st}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Advice and Tips (Specific Advice) */}
                <div className="pt-2.5 border-t border-[#2F3336]">
                  <span className="text-[10px] text-[#A78BFA] uppercase tracking-widest font-bold font-mono block mb-1">
                    AI Advice & Tips:
                  </span>
                  <p className="text-[#71767B] italic font-sans leading-relaxed text-[11px]">
                    "{task.tips}"
                  </p>
                </div>

                {/* Bottom Stopwatch/Timer Logging */}
                <div className="pt-2 border-t border-[#2F3336] flex items-center justify-between text-[11px] font-mono text-[#71767B]">
                  <div className="flex items-center space-x-2">
                    {task.actualTimeSpent > 0 ? (
                      <span className="text-[#A78BFA] font-semibold">Spent: {formattedTime(task.actualTimeSpent)}</span>
                    ) : (
                      <span>No duration logged</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSession(task.id);
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] transition-all flex items-center space-x-1 ${
                        activeTaskId === task.id
                          ? "bg-[#2A2315] text-amber-500 border border-amber-500/40 animate-pulse font-semibold"
                          : "bg-[#1E1B29] text-[#A78BFA] border border-[#7C3AED]/30"
                      }`}
                    >
                      {activeTaskId === task.id ? (
                        <>
                          <Square className="w-2.5 h-2.5 fill-amber-400" />
                          <span>Stop ({formattedTime(sessionSeconds)})</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-2.5 h-2.5 fill-[#A78BFA] text-[#A78BFA]" />
                          <span>Focus Timer</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTask(task.id);
                      }}
                      className="p-1 hover:bg-rose-950/20 rounded text-[#71767B] hover:text-rose-500 transition-colors animate-none cursor-pointer"
                      title="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Urgency Control Bar */}
        <div className="mt-3.5 pt-3 border-t border-[#1E293B]/50 flex items-center justify-between gap-2 text-[10px] font-mono text-[#71767B]">
          <span className="flex items-center space-x-1.5">
            <Activity className={`w-3.5 h-3.5 ${urgency.mode === 'EMERGENCY' ? 'text-rose-500 animate-pulse' : urgency.mode === 'CRITICAL' ? 'text-red-500 animate-pulse' : urgency.mode === 'ALERT' ? 'text-[#F97316]' : 'text-[#71767B]'}`} />
            <span className="text-[#71767B]">Time remaining: <strong className={urgency.color}>{urgency.label}</strong></span>
          </span>
        </div>

      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0A0F1A] text-[#FFFFFF] font-sans flex flex-col selection:bg-[#7C3AED] selection:text-white relative overflow-hidden" id="deadline-devil-app">
      {/* Cyber-Shield Decorative Background */}
      <CyberShieldBackground />
      {/* Ghosted Code Margin Decorative Backgrounds */}
      <GhostedCodeMargins />
      
      {/* Top Header Bar with Navigation Tabs */}
      <header className="border-b border-[#1E293B] bg-[#0A0F1A]/85 backdrop-blur-md px-4 py-3 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-3 shadow-lg sticky top-0 z-50 transition-all duration-300">
        
        {/* Brand Logo & Tagline */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 bg-gradient-to-tr from-[#7C3AED] to-[#F97316] rounded-lg flex items-center justify-center shadow-lg shadow-purple-900/30">
            <Flame className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold tracking-tight text-white font-display" id="brand-title">
                DeadlineDevil
              </span>
              <span className="text-slate-500 font-mono text-[10px]">|</span>
              <span className="text-xs text-purple-400 font-semibold font-mono">AI Strategic Prioritizer</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs at the Top */}
        <div className="flex items-center space-x-1 bg-[#0A0F1A]/90 p-1 rounded-xl border border-[#1E293B]">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center space-x-1.5 ${
              activeTab === "dashboard"
                ? "bg-[#7C3AED] text-white shadow-md"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#1E293B]"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>
          
          <button
            onClick={() => setActiveTab("calendar")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center space-x-1.5 ${
              activeTab === "calendar"
                ? "bg-[#7C3AED] text-white shadow-md"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#1E293B]"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Calendar</span>
          </button>
 
          <button
            onClick={() => setActiveTab("focus-stats")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center space-x-1.5 ${
              activeTab === "focus-stats"
                ? "bg-[#7C3AED] text-white shadow-md"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#1E293B]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Focus Stats</span>
          </button>
        </div>

        {/* Global Clock widget */}
        <div className="flex items-center space-x-3">
          <div className="bg-[#0A0F1A]/90 border border-[#1E293B] rounded-xl px-3 py-1.5 flex items-center space-x-2 text-xs font-mono text-slate-300">
            <span className="text-slate-500 font-bold text-[10px]">CURRENT TIME</span>
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-purple-300 font-bold">
              {currentTime.toLocaleDateString("en-US", { month: "short", day: "numeric" })} @ {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

      </header>

      {/* Main Container Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 bg-transparent z-10 relative">
        
        {/* VIEW 1: DASHBOARD TAB */}
        {activeTab === "dashboard" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* LEFT PANEL: AI Companion + Messy Goal Processor */}
            <aside className="lg:col-span-5 flex flex-col space-y-6">
              
              {/* AI Companion Card */}
              <div className="bg-[#0F172A]/40 backdrop-blur-md border border-[#1E293B]/70 rounded-2xl p-5 shadow-xl relative overflow-hidden transition-all duration-300 hover:border-purple-500/40">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 rounded-full blur-3xl pointer-events-none"></div>
                
                <div className="flex items-center space-x-4">
                  {/* Minimal Geometric Mascot Logo */}
                  <div className="w-14 h-14 bg-[#111A2E]/50 rounded-xl flex items-center justify-center border border-[#1E293B]/50 overflow-hidden shadow-inner relative">
                    <svg viewBox="0 0 100 100" className="w-12 h-12">
                      <polygon points="50,15 35,35 65,35" fill="#7C3AED" opacity="0.85" />
                      <polygon points="35,35 20,20 25,45" fill="#8B5CF6" />
                      <polygon points="65,35 80,20 75,45" fill="#8B5CF6" />
                      <polygon points="35,35 25,45 50,55" fill="#A78BFA" />
                      <polygon points="65,35 75,45 50,55" fill="#A78BFA" />
                      <polygon points="25,45 15,65 50,75" fill="#4C1D95" />
                      <polygon points="75,45 85,65 50,75" fill="#4C1D95" />
                      {/* Glowing eyes */}
                      <circle cx="40" cy="45" r="3" fill="#FFFFFF" />
                      <circle cx="60" cy="45" r="3" fill="#FFFFFF" />
                    </svg>
                    <div className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full"></div>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-bold text-sm text-[#E7E9EA]">AI Companion</h3>
                      <span className="text-[10px] bg-purple-500/10 text-[#A78BFA] px-2 py-0.5 rounded-full border border-[#7C3AED]/20 font-mono font-medium">
                        Active Buddy
                      </span>
                    </div>
                    <p className="text-xs text-[#71767B] mt-0.5 font-mono">
                      Continuous real-time optimization active.
                    </p>
                    <p className="text-[11px] text-orange-400 font-semibold mt-1 flex items-center space-x-1 font-mono">
                      <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                      <span>(Streak: {focusStreak} {focusStreak === 1 ? 'Day' : 'Days'} Active)</span>
                    </p>
                  </div>
                </div>

                {/* Speech Bubble Speach Advice */}
                <div className="mt-4 bg-[#111A2E]/50 border border-[#1E293B]/50 rounded-xl p-3.5 text-xs text-[#E7E9EA] font-mono leading-relaxed relative">
                  <div className="absolute -top-1.5 left-8 w-3 h-3 bg-[#111A2E] border-t border-l border-[#1E293B]/50 transform rotate-45"></div>
                  <span className="text-[#A78BFA] block font-bold mb-1">💬 DeadlineDevil says:</span>
                  <p className="italic text-[#E7E9EA]">"{devilNudge}"</p>
                </div>

                <div className="mt-4 flex items-center justify-between text-[11px] font-mono border-t border-[#1E293B]/50 pt-3">
                  <button 
                    onClick={() => {
                      const randomMsg = INITIAL_NUDGES[Math.floor(Math.random() * INITIAL_NUDGES.length)];
                      setDevilNudge(randomMsg);
                    }}
                    className="text-[#A78BFA] hover:text-[#C4B5FD] flex items-center space-x-1 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Request Tip</span>
                  </button>
                  <button 
                    onClick={handleResetToPresets}
                    className="text-orange-400 hover:text-orange-300 flex items-center space-x-1 transition-colors"
                  >
                    <Award className="w-3 h-3" />
                    <span>Load Examples</span>
                  </button>
                </div>
              </div>

              {/* Messy Goal Processor Card */}
              <div className="bg-[#0F172A]/40 backdrop-blur-md border border-[#1E293B]/70 rounded-2xl p-5 shadow-xl flex flex-col space-y-4">
                <div>
                  <h3 className="font-bold text-[#E7E9EA] font-display flex items-center space-x-2 text-sm">
                    <Zap className="w-4 h-4 text-orange-400" />
                    <span>Messy Goal Processor</span>
                  </h3>
                  <p className="text-[11px] text-[#71767B] mt-2 font-sans leading-relaxed">
                    Pour out all your sudden commitments and deadlines in a single, unstructured paragraph. Our AI Companion parses and highlights high priorities instantly.
                  </p>
                </div>

                {/* Pulse recording notification */}
                {isRecording && (
                  <div className="flex items-center space-x-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3 animate-pulse">
                    <div className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </div>
                    <span className="text-xs font-semibold font-mono text-red-400">
                      Listening to your panic...
                    </span>
                  </div>
                )}

                {/* Processing notice */}
                {panicStatus === "processing" && (
                  <div className="flex items-center space-x-3 bg-[#7C3AED]/10 border border-[#7C3AED]/30 rounded-xl p-3 animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#A78BFA]" />
                    <span className="text-xs font-semibold font-mono text-[#A78BFA]">
                      Panic received! Building your rescue plan...
                    </span>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                    <div className="relative flex-1">
                      <textarea
                        value={messyInput}
                        onChange={(e) => setMessyInput(e.target.value)}
                        placeholder="e.g. 'I have a complex circuit analysis submission next Tuesday, but a C lab exam this Thursday I need to study for and I haven't started.'"
                        className="w-full h-28 bg-[#111A2E]/50 border border-[#1E293B]/50 focus:border-[#7C3AED] rounded-xl p-3 text-xs text-[#E7E9EA] placeholder-[#71767B] outline-none resize-none transition-all duration-200 font-mono leading-relaxed"
                      ></textarea>
                      <div className="absolute right-2.5 bottom-2.5 text-[9px] text-[#71767B] font-mono bg-[#111A2E]/50 border border-[#1E293B]/50 px-2 py-0.5 rounded-full">
                        {messyInput.length} chars
                      </div>
                    </div>

                    {/* Panic Mic Button */}
                    <button
                      type="button"
                      onClick={handleToggleRecording}
                      disabled={loading || panicStatus === "processing"}
                      className={`sm:w-32 flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        isRecording
                          ? "bg-[#1E1B29] border-[#F97316] text-[#F97316] shadow-[0_0_15px_rgba(249,115,22,0.2)]"
                          : "bg-[#111A2E]/50 border-[#1E293B]/50 hover:border-[#F97316]/40 text-[#71767B] hover:text-[#F97316]"
                      }`}
                    >
                      <div className="relative">
                        <Mic className={`w-6 h-6 mb-1 transition-transform group-hover:scale-110 ${isRecording ? "text-[#F97316] animate-pulse" : "text-[#71767B] group-hover:text-[#F97316]"}`} />
                        {isRecording && (
                          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                          </span>
                        )}
                      </div>
                      <span className={`text-[11px] font-bold uppercase tracking-wider font-mono text-center ${isRecording ? "text-[#F97316]" : "text-[#E7E9EA]"}`}>
                        {isRecording ? "Stop" : "Panic Mic"}
                      </span>
                      <span className="text-[9px] text-[#71767B] text-center mt-1 font-mono leading-tight">
                        {isRecording ? "Listening" : "Click & Speak"}
                      </span>
                    </button>
                  </div>

                  {/* Test Scenario chips */}
                  <div>
                    <span className="text-[10px] text-[#71767B] uppercase tracking-widest font-bold font-mono block mb-2">
                      Quick Start Examples
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMessyInput("I have a complex circuit analysis submission next Tuesday, but a C lab exam this Thursday I need to study for and I haven't started.")}
                        className="text-[10px] bg-[#111A2E]/50 hover:bg-[#1E293B]/50 border border-[#1E293B]/50 text-[#71767B] rounded-lg px-2 py-1 transition-colors font-mono hover:text-[#E7E9EA]"
                      >
                        Student Academic Rush
                      </button>
                      <button
                        type="button"
                        onClick={() => setMessyInput("Client project review deck due at 3pm, write API documentation tonight by 9pm, quick health check-up appointment at 11am")}
                        className="text-[10px] bg-[#111A2E]/50 hover:bg-[#1E293B]/50 border border-[#1E293B]/50 text-[#71767B] rounded-lg px-2 py-1 transition-colors font-mono hover:text-[#E7E9EA]"
                      >
                        Busy Professional Day
                      </button>
                    </div>
                  </div>

                  {/* Structure button */}
                  <button
                    type="button"
                    disabled={loading || !messyInput.trim()}
                    onClick={() => handleParseMessyParagraph(messyInput, panicStatus === "processing")}
                    className={`w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                      loading
                        ? "bg-[#7C3AED]/50 text-slate-300 cursor-not-allowed"
                        : !messyInput.trim()
                        ? "bg-[#111A2E]/50 text-[#71767B] border border-[#1E293B]/50 cursor-not-allowed"
                        : "bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-md shadow-purple-950/40"
                    }`}
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-purple-200" />
                        <span>
                          {panicStatus === "processing" 
                            ? "Panic received! Building your rescue plan..." 
                            : "Structuring schedule with AI..."}
                        </span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-[#F97316]" />
                        <span>Generate My Action Plan ⚡</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Add Task Manually Form Card */}
              <div className="bg-[#16181C] border border-[#2F3336] rounded-2xl p-4 shadow-sm">
                <button
                  onClick={() => setIsAddingManual(!isAddingManual)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-[#71767B] hover:text-[#E7E9EA] transition-colors font-mono"
                >
                  <div className="flex items-center space-x-2">
                    <CirclePlus className="w-4 h-4 text-[#A78BFA]" />
                    <span>Add Task Manually</span>
                  </div>
                  {isAddingManual ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {isAddingManual && (
                  <form onSubmit={handleAddManualTask} className="mt-3 space-y-3 pt-3 border-t border-[#2F3336]">
                    <div>
                      <label className="text-[9px] text-[#71767B] uppercase tracking-widest block mb-1 font-mono">Task Name *</label>
                      <input
                        type="text"
                        required
                        value={manualTitle}
                        onChange={(e) => setManualTitle(e.target.value)}
                        placeholder="e.g. Data Structure assignment, Job Interview, Bill Payment"
                        className="w-full text-xs bg-[#1E2024] border border-[#2F3336] p-2 rounded-lg text-[#E7E9EA] placeholder-[#71767B] focus:border-[#7C3AED] outline-none font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-[#71767B] uppercase tracking-widest block mb-1 font-mono">Deadline</label>
                        <input
                          type="text"
                          value={manualDeadline}
                          onChange={(e) => setManualDeadline(e.target.value)}
                          placeholder="e.g. Tonight 11pm"
                          className="w-full text-xs bg-[#1E2024] border border-[#2F3336] p-2 rounded-lg text-[#E7E9EA] placeholder-[#71767B] focus:border-[#7C3AED] outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-[#71767B] uppercase tracking-widest block mb-1 font-mono">Time Slot</label>
                        <input
                          type="text"
                          value={manualTimeSlot}
                          onChange={(e) => setManualTimeSlot(e.target.value)}
                          placeholder="e.g. 10:00 - 11:30 AM"
                          className="w-full text-xs bg-[#1E2024] border border-[#2F3336] p-2 rounded-lg text-[#E7E9EA] placeholder-[#71767B] focus:border-[#7C3AED] outline-none font-mono"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-[#71767B] uppercase tracking-widest block mb-1 font-mono">Priority</label>
                        <select
                          value={manualPriority}
                          onChange={(e) => setManualPriority(e.target.value as any)}
                          className="w-full text-xs bg-[#1E2024] border border-[#2F3336] p-2 rounded-lg text-[#E7E9EA] focus:ring-purple-500 outline-none font-mono"
                        >
                          <option value="HIGH" className="bg-[#16181C]">HIGH (Orange)</option>
                          <option value="MEDIUM" className="bg-[#16181C]">MEDIUM (Purple)</option>
                          <option value="LOW" className="bg-[#16181C]">LOW (Grey)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] text-[#71767B] uppercase tracking-widest block mb-1 font-mono">Helper Tips</label>
                        <input
                          type="text"
                          value={manualTips}
                          onChange={(e) => setManualTips(e.target.value)}
                          placeholder="Custom advice notes..."
                          className="w-full text-xs bg-[#1E2024] border border-[#2F3336] p-2 rounded-lg text-[#E7E9EA] placeholder-[#71767B] focus:border-[#7C3AED] outline-none font-mono"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold rounded-lg shadow-sm transition-all font-mono cursor-pointer"
                    >
                      Confirm Entry
                    </button>
                  </form>
                )}
              </div>

            </aside>

            {/* RIGHT PANEL: Today's Focus task list */}
            <main className="lg:col-span-6 flex flex-col space-y-6">
              
              {/* Quick Filter and Search input bar */}
              <div className="relative">
                <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-[#71767B]" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search plan: e.g. 'HIGH', 'Circuits', 'exam'"
                  className="w-full bg-[#0F172A]/40 backdrop-blur-md border border-[#1E293B]/70 focus:border-[#7C3AED] text-xs rounded-xl py-3 pl-10 pr-4 outline-none text-[#E7E9EA] placeholder-[#71767B] font-mono shadow-md"
                />
                {searchQuery.trim() !== "" && (
                  <div className="absolute right-3.5 top-2.5 bg-[#111A2E]/50 border border-[#1E293B]/50 px-2 py-0.5 rounded text-[9px] text-[#71767B] font-mono hidden md:block">
                    {filteredTasks.length} matched
                  </div>
                )}
              </div>

              {/* Today's Focus Task Container */}
              <div className="bg-[#0F172A]/40 backdrop-blur-md border border-[#1E293B]/70 rounded-2xl p-5 shadow-xl flex flex-col space-y-5">
                
                <div className="flex items-center justify-between border-b border-[#1E293B]/50 pb-3">
                  <div className="flex items-center space-x-2">
                    <Eye className="w-4 h-4 text-[#A78BFA]" />
                    <h3 className="text-sm font-bold tracking-tight text-[#E7E9EA] font-display uppercase">
                      Today's Focus
                    </h3>
                    <span className="text-xs bg-[#111A2E]/50 text-[#71767B] border border-[#1E293B]/50 font-mono px-2 py-0.5 rounded-md">
                      {activeAndPendingTasks.length} active
                    </span>
                  </div>

                  <button 
                    onClick={handleRescheduleRemaining}
                    className="text-[10px] text-[#A78BFA] hover:text-[#C4B5FD] font-mono font-bold flex items-center space-x-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3 animate-spin-slow" />
                    <span>Reschedule AI</span>
                  </button>
                </div>

                {/* Task List container */}
                {activeAndPendingTasks.length === 0 ? (
                  tasks.length === 0 ? (
                    <div className="text-center py-12 flex flex-col items-center justify-center space-y-3">
                      <Sparkles className="w-10 h-10 text-purple-400 animate-pulse" />
                      <div>
                        <p className="text-sm font-bold text-[#E7E9EA]">Welcome to DeadlineDevil!</p>
                        <p className="text-xs text-[#71767B] font-mono mt-2 max-w-xs mx-auto leading-relaxed">
                          Your active session is clean and clear. Pour out your commitments in the <strong className="text-purple-400 font-bold">Messy Goal Processor</strong> or load some examples using the <strong className="text-orange-400 font-bold">Load Examples</strong> button to get started!
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 flex flex-col items-center justify-center space-y-3">
                      <CircleCheck className="w-10 h-10 text-emerald-500 animate-bounce" />
                      <div>
                        <p className="text-sm font-bold text-[#E7E9EA]">No outstanding tasks left.</p>
                        <p className="text-xs text-[#71767B] font-mono mt-1">
                          Use the Messy Goal Processor or Add Task Manually to begin!
                        </p>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-6">
                    {/* Active/Future Tasks (Sorted by Urgency) */}
                    {futureActiveTasks.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-[#A78BFA] uppercase tracking-widest font-bold font-mono">
                            Scheduled Plans & Future Tasks
                          </span>
                        </div>
                        <div className="space-y-4">
                          {futureActiveTasks.map((task) => renderTaskCard(task))}
                        </div>
                      </div>
                    )}

                    {/* Overdue Tasks Section (Separated) */}
                    {overdueTasks.length > 0 && (
                      <div className="space-y-4 border-t border-rose-500/20 pt-4 mt-4">
                        <div className="flex items-center space-x-2 text-rose-400 font-mono text-xs font-bold uppercase tracking-wider">
                          <span className="animate-pulse">⚠️ OVERDUE TASKS (PASSED DEADLINE)</span>
                          <span className="text-[10px] bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded text-rose-400">
                            {overdueTasks.length}
                          </span>
                        </div>
                        <div className="space-y-4">
                          {overdueTasks.map((task) => renderTaskCard(task))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Completed Tasks section */}
              {completedTasks.length > 0 && (
                <div className="bg-[#16181C] border border-[#2F3336] rounded-2xl p-5 shadow-md">
                  <div className="flex items-center justify-between mb-3 border-b border-[#2F3336]/30 pb-2">
                    <h3 className="text-xs font-bold tracking-wider uppercase font-display text-[#71767B] flex items-center space-x-1.5">
                      <CircleCheck className="w-4 h-4 text-emerald-500" />
                      <span>Completed Tasks ({completedTasks.length})</span>
                    </h3>
                    <button
                      onClick={handleClearCompletedTasks}
                      className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors flex items-center space-x-1 font-mono font-bold cursor-pointer"
                      title="Clear completed tasks list"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear All</span>
                    </button>
                  </div>
                  <div className="space-y-2">
                    {completedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex justify-between items-center p-3 bg-[#111A2E]/50 rounded-xl border border-[#1E293B]/50 hover:bg-[#1E293B]/50 transition-all font-mono text-xs"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="text-emerald-500 bg-emerald-500/10 p-1.5 rounded-full border border-emerald-500/20">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <p className="font-semibold text-[#71767B] line-through break-words whitespace-normal max-w-xs md:max-w-md">
                              {task.name}
                            </p>
                            <span className="text-[10px] text-[#71767B] italic block">
                              Time: {task.timeSlot} | Logged: {formattedTime(task.actualTimeSpent)}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleTaskCompleted(task.id)}
                          className="text-[10px] text-[#71767B] hover:text-[#A78BFA] transition-colors cursor-pointer"
                        >
                          Undo complete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </main>

            {/* FAR RIGHT COLUMN: Glowing Panic Meter Vertical Thermometer Bar */}
            <aside className="lg:col-span-1 flex flex-col items-center justify-start h-full pt-4 min-h-[400px]">
              <div className="flex flex-col items-center justify-between h-full py-5 bg-[#16181C] border border-[#2F3336] rounded-2xl w-16 shadow-xl relative overflow-hidden group">
                
                {/* Fire pulse on top */}
                <div className="z-10 bg-[#1E2024] p-2 rounded-full border border-[#2F3336] cursor-pointer" title="Panic level severity sensor">
                  <Flame className={`w-5 h-5 text-orange-400 ${panicLevel > 50 ? 'animate-bounce text-rose-500' : 'animate-pulse'}`} />
                </div>

                {/* Thermometer scale column */}
                <div className="relative w-4 h-64 bg-[#1E2024] rounded-full overflow-hidden border border-[#2F3336] my-4 shadow-inner">
                  
                  {/* Glowing neon thermal mercury gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500"></div>
                  
                  {/* Sliding cover cover/fill track representing dynamic level */}
                  <div 
                    className="absolute top-0 left-0 right-0 bg-[#1E2024] transition-all duration-500 border-b-2 border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                    style={{ height: `${100 - panicLevel}%` }}
                  ></div>
                  
                  {/* Thermal target pointer cursor slider line */}
                  <div 
                    className="absolute left-0 right-0 h-1 bg-cyan-400 shadow-[0_0_10px_#22d3ee] transition-all duration-500"
                    style={{ bottom: `${panicLevel}%` }}
                  ></div>
                </div>

                {/* Proper integrated Stress Level Label */}
                <div className="flex flex-col items-center text-center mt-1 z-10">
                  <span className="text-[8px] text-[#71767B] font-mono tracking-widest uppercase">STRESS</span>
                  <span className={`text-[10px] font-bold font-mono tracking-wider ${
                    panicLevel >= 75 ? 'text-rose-500 animate-pulse' : panicLevel >= 35 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {panicLevel >= 75 ? 'CRITICAL' : panicLevel >= 35 ? 'ALERT' : 'CALM'}
                  </span>
                </div>

              </div>
            </aside>

          </div>
        )}

        {/* VIEW 2: CALENDAR SCHEDULER VIEW */}
        {activeTab === "calendar" && (
          <div className="bg-[#0F172A]/40 backdrop-blur-md border border-[#1E293B]/70 rounded-2xl p-6 shadow-xl space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-[#1E293B]/50 pb-4">
              <div>
                <h3 className="text-lg font-bold font-display text-[#E7E9EA] flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-[#A78BFA]" />
                  <span>Agenda Calendar View</span>
                </h3>
                <p className="text-xs text-[#71767B] mt-1">
                  Chronological schedule blocks based on active priority and task deadlines.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleBulkImportTasksToCalendar()}
                  disabled={isSyncingCalendar}
                  className="px-3 py-1.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white border border-[#7C3AED]/30 hover:border-[#7C3AED]/60 text-xs font-semibold font-mono transition-colors flex items-center space-x-1 shadow cursor-pointer disabled:opacity-50"
                  title="Import all tasks as events to your Google Calendar"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Import to Calendar</span>
                </button>
                <button
                  onClick={handleRescheduleRemaining}
                  className="px-3 py-1.5 rounded-lg bg-[#1E1B29] text-[#A78BFA] border border-[#7C3AED]/30 hover:border-[#7C3AED]/60 text-xs font-semibold font-mono transition-colors flex items-center space-x-1 shadow cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Optimize Hours</span>
                </button>
              </div>
            </div>

            {/* GOOGLE CALENDAR DEAMON PORTAL */}
            <div className="bg-[#111A2E]/50 border border-[#1E293B]/50 rounded-xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-[#1E1B29] rounded-lg border border-[#7C3AED]/30">
                    <CalendarDays className="w-5 h-5 text-[#A78BFA]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-[#E7E9EA]">Google Calendar daemon</h4>
                    {googleUser ? (
                      <div className="flex items-center space-x-1.5 mt-1">
                        {googleUser.picture && (
                          <img src={googleUser.picture} alt="Profile" className="w-4 h-4 rounded-full border border-[#7C3AED]/30" referrerPolicy="no-referrer" />
                        )}
                        <p className="text-xs text-[#A78BFA] font-mono">
                          Linked to {googleUser.name} <span className="text-[10px] text-[#71767B]">({googleUser.email})</span>
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[#71767B] font-mono mt-0.5">Connect your Google Calendar to sync tasks</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {googleToken ? (
                    <>
                      <button
                        onClick={() => handleBulkImportTasksToCalendar()}
                        disabled={isSyncingCalendar}
                        className="px-3 py-1.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] border border-[#7C3AED]/30 text-[11px] font-bold font-mono text-white transition-colors flex items-center space-x-1 cursor-pointer disabled:opacity-50 shadow-md"
                      >
                        <Calendar className="w-3 h-3 text-white" />
                        <span>Import to Calendar</span>
                      </button>
                      <button
                        onClick={handleImportCalendarEvents}
                        disabled={isSyncingCalendar}
                        className="px-3 py-1.5 rounded-lg bg-[#16181C] hover:bg-[#202227] border border-[#2F3336] text-[11px] font-bold font-mono text-slate-200 hover:text-white transition-colors flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncingCalendar ? 'animate-spin' : ''}`} />
                        <span>Import Today's Meetings</span>
                      </button>
                      <button
                        onClick={handleGoogleLogout}
                        className="p-1.5 rounded-lg bg-red-950/20 border border-red-500/20 hover:border-red-500/40 text-red-400 transition-colors cursor-pointer"
                        title="Disconnect Account"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleBulkImportTasksToCalendar()}
                        disabled={isSyncingCalendar}
                        className="px-3 py-1.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] border border-[#7C3AED]/30 text-white text-[11px] font-bold font-mono transition-colors flex items-center space-x-1.5 shadow cursor-pointer disabled:opacity-50"
                      >
                        <Calendar className="w-3.5 h-3.5 text-white" />
                        <span>Import to Calendar</span>
                      </button>
                      <button
                        onClick={handleConnectGoogle}
                        disabled={isSyncingCalendar}
                        className="px-3 py-1.5 rounded-lg bg-[#1E1B29] hover:bg-[#252033] border border-[#7C3AED]/30 text-[#A78BFA] text-[11px] font-bold font-mono transition-colors flex items-center space-x-1.5 shadow cursor-pointer disabled:opacity-50"
                      >
                        <span>Connect Calendar</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {calendarSyncError && (
                <div className="text-[11px] text-red-400 font-mono bg-red-950/20 border border-red-500/20 rounded-lg p-2.5 leading-relaxed break-words">
                  ⚠️ {renderErrorWithLinks(calendarSyncError)}
                </div>
              )}

              {/* LIST OF TODAY'S MEETINGS IMPORTED FROM GOOGLE CALENDAR */}
              {googleToken && importedCalendarEvents.length > 0 && (
                <div className="bg-[#16181C] border border-[#2F3336] rounded-lg p-3 space-y-2">
                  <h5 className="text-[10px] text-[#71767B] font-bold uppercase tracking-wider font-mono">Today's Imported Google Calendar Events:</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {importedCalendarEvents.map((event, idx) => {
                      const startTime = event.start?.dateTime ? new Date(event.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All Day';
                      const endTime = event.end?.dateTime ? new Date(event.end.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                      return (
                        <div key={idx} className="bg-[#1E2024] border border-[#2F3336] rounded-lg p-2 flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#E7E9EA] truncate">{event.summary || '(No Title)'}</p>
                            <p className="text-[10px] text-[#71767B] font-mono mt-0.5">
                              🕒 {startTime} {endTime ? `- ${endTime}` : ''}
                            </p>
                          </div>
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded px-1.5 py-0.5 font-mono">
                            Meeting
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-[#A78BFA] font-mono">
                    💡 <em>DeadlineDevil is fully aware of these times. Use the dashboard to allocate your tasks responsibly!</em>
                  </p>
                </div>
              )}
            </div>

            {/* Hourly schedule rows */}
            <div className="space-y-4">
              {tasks.filter(t => !t.completed).length === 0 ? (
                <div className="text-center py-16 flex flex-col items-center justify-center space-y-4 bg-[#111A2E]/30 border border-[#1E293B]/50 rounded-2xl p-8">
                  <Calendar className="w-12 h-12 text-[#A78BFA] opacity-60 animate-pulse" />
                  <div>
                    <p className="text-sm font-bold text-[#E7E9EA] max-w-md mx-auto leading-relaxed">
                      No tasks scheduled yet. Add tasks from your Dashboard to see your personalized schedule here 📅
                    </p>
                  </div>
                </div>
              ) : (
                [
                  { hour: "08:00 AM - 10:00 AM", title: "Morning Review Blocks" },
                  { hour: "10:00 AM - 12:00 PM", title: "Prime Core Focus Block" },
                  { hour: "12:00 PM - 02:00 PM", title: "Midday Break & Syncs" },
                  { hour: "02:00 PM - 04:00 PM", title: "Afternoon Deep Session" },
                  { hour: "04:00 PM - 06:00 PM", title: "Review & Adjustments" },
                  { hour: "06:00 PM - 08:00 PM", title: "Evening Wrap Blocks" },
                  { hour: "08:00 PM - 11:00 PM", title: "Late Night Guardrail Slot" }
                ].map((slot, sidx) => {
                  const matchedTasks = tasks.filter(t => !t.completed && (
                    sidx === 1 && t.priority === "HIGH" ||
                    sidx === 3 && t.priority === "MEDIUM" ||
                    sidx === 6 && t.priority === "LOW" ||
                    t.timeSlot.toLowerCase().includes(slot.hour.substring(0, 5).toLowerCase())
                  ));

                  if (matchedTasks.length === 0) return null;

                  return (
                    <div key={sidx} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start border-l-2 border-[#7C3AED]/40 pl-4 py-1.5 hover:border-[#7C3AED] transition-colors animate-fadeIn">
                      <div className="md:col-span-3 font-mono">
                        <span className="text-xs font-bold text-[#E7E9EA] block">{slot.hour}</span>
                        <span className="text-[10px] text-[#71767B] uppercase tracking-wider">{slot.title}</span>
                      </div>

                      <div className="md:col-span-9 space-y-2">
                        {matchedTasks.map(t => (
                          <div 
                            key={t.id}
                            className={`p-3 rounded-xl border bg-[#1E2024] flex justify-between items-center ${
                              t.priority === 'HIGH' ? 'border-[#F97316]/30 bg-[#221B18]' : t.priority === 'MEDIUM' ? 'border-[#7C3AED]/30 bg-[#1B1825]' : 'border-[#2F3336]'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <span className={`w-2 h-2 rounded-full ${
                                t.priority === 'HIGH' ? 'bg-[#F97316]' : t.priority === 'MEDIUM' ? 'bg-[#7C3AED]' : 'bg-slate-400'
                              }`}></span>
                              <span className="text-xs font-bold text-[#E7E9EA]">{t.name}</span>
                              <span className="text-[9px] text-[#71767B] font-mono px-1.5 py-0.5 bg-[#16181C] border border-[#2F3336] rounded">
                                {t.priority}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#71767B] font-mono">
                              Deadline: {t.deadline}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* VIEW 3: FOCUS STATS ANALYTICS VIEW */}
        {activeTab === "focus-stats" && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Top Cards row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#0F172A]/40 backdrop-blur-md border border-[#1E293B]/70 rounded-2xl p-5 flex items-center justify-between shadow-sm">
                <div>
                  <span className="text-[10px] text-[#71767B] uppercase tracking-widest font-mono">Current Focus Streak</span>
                  <p className="text-2xl font-bold font-display text-[#F97316] mt-1">{focusStreak} {focusStreak === 1 ? 'Day' : 'Days'} Running</p>
                </div>
                <Flame className="w-10 h-10 text-[#F97316] fill-[#F97316]" />
              </div>

              <div className="bg-[#0F172A]/40 backdrop-blur-md border border-[#1E293B]/70 rounded-2xl p-5 flex items-center justify-between shadow-sm">
                <div>
                  <span className="text-[10px] text-[#71767B] uppercase tracking-widest font-mono">Task Completion Rate</span>
                  <p className="text-2xl font-bold font-display text-emerald-600 mt-1">
                    {tasks.length > 0 ? `${Math.round((completedTasks.length / tasks.length) * 100)}%` : "0%"}
                  </p>
                </div>
                <CircleCheck className="w-10 h-10 text-emerald-500 fill-emerald-500/10" />
              </div>

              <div className="bg-[#0F172A]/40 backdrop-blur-md border border-[#1E293B]/70 rounded-2xl p-5 flex items-center justify-between shadow-sm">
                <div>
                  <span className="text-[10px] text-[#71767B] uppercase tracking-widest font-mono">Active Work Sessions</span>
                  <p className="text-2xl font-bold font-display text-[#A78BFA] mt-1">
                    {tasks.filter(t => t.actualTimeSpent > 0).length} tasks started
                  </p>
                </div>
                <Sparkles className="w-10 h-10 text-[#A78BFA]" />
              </div>
            </div>

            {/* Metrics distribution charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-[#0F172A]/40 backdrop-blur-md border border-[#1E293B]/70 rounded-2xl p-5 shadow-sm space-y-4">
                <h4 className="font-bold text-xs text-[#E7E9EA] uppercase tracking-wider font-mono">
                  Priority Distribution Metrics
                </h4>

                <div className="space-y-3">
                  {[
                    { label: "High Priority (Orange)", count: tasks.filter(t => t.priority === "HIGH").length, total: tasks.length, color: "bg-[#F97316]" },
                    { label: "Medium Priority (Purple)", count: tasks.filter(t => t.priority === "MEDIUM").length, total: tasks.length, color: "bg-[#7C3AED]" },
                    { label: "Low Priority (Slate)", count: tasks.filter(t => t.priority === "LOW").length, total: tasks.length, color: "bg-slate-500" }
                  ].map((stat, idx) => {
                    const ratio = stat.total > 0 ? (stat.count / stat.total) * 100 : 0;
                    return (
                      <div key={idx} className="space-y-1 font-mono text-xs">
                        <div className="flex justify-between text-[11px] text-[#71767B]">
                          <span>{stat.label}</span>
                          <span className="font-bold">{stat.count} items ({Math.round(ratio)}%)</span>
                        </div>
                        <div className="w-full bg-[#111A2E]/50 h-2 rounded-full overflow-hidden border border-[#1E293B]/50">
                          <div className={`h-full ${stat.color}`} style={{ width: `${ratio}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[#0F172A]/40 backdrop-blur-md border border-[#1E293B]/70 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-xs text-[#E7E9EA] uppercase tracking-wider font-mono mb-2">
                    Active Session Time Accumulator
                  </h4>
                  <p className="text-[#71767B] text-xs font-sans leading-relaxed">
                    Time elapsed is automatically saved to LocalStorage after every Pomodoro and active focus stopwatch run.
                  </p>
                </div>

                <div className="bg-[#1E2024] rounded-xl p-4 border border-[#2F3336] text-center font-mono my-4">
                  <span className="text-[10px] text-[#71767B] uppercase tracking-wider block">Total Logged Focus Time</span>
                  <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#F97316] to-[#7C3AED]">
                    {formattedTime(tasks.reduce((acc, t) => acc + t.actualTimeSpent, 0))}
                  </span>
                  <span className="text-[10px] text-[#71767B] block mt-1">minutes : seconds</span>
                </div>

                <span className="text-[10px] text-[#71767B] font-mono text-center block italic">
                  *Accumulator updates live during active stopwatch countdowns.
                </span>
              </div>

            </div>

            {/* Cyber Shield Status / Motivation Section */}
            <div className="bg-[#0F172A]/40 backdrop-blur-md border border-[#1E293B]/70 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative flex items-center justify-center">
                {/* Glowing cyber aura */}
                <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full w-20 h-20 animate-pulse"></div>
                <Shield className="w-16 h-16 text-[#A78BFA] relative z-10 filter drop-shadow-[0_0_15px_rgba(167,139,250,0.4)]" />
              </div>
              <div className="max-w-md">
                <h4 className="font-bold text-xs text-[#E7E9EA] uppercase tracking-wider font-mono">
                  Active Focus Shield Protection
                </h4>
                <p className="text-[#71767B] text-[11px] font-mono mt-1 leading-relaxed">
                  Your workstation is currently shielded from distraction cues. Continuous high-focus metrics are secure.
                </p>
                <div className="border-t border-[#1E293B]/40 mt-4 pt-3">
                  <p className="text-[11px] italic text-[#71767B] font-serif max-w-sm mx-auto leading-relaxed">
                    "Every expert was once a beginner. Every pro was once an amateur. Start now."
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* FOOTER */}
      <footer className="border-t border-[#1E293B]/50 bg-[#0A0F1A]/80 py-8 px-4 text-center text-[#71767B] text-xs">
        <p className="font-mono mb-2">Designed dynamically by DeadlineDevil companion. No negative parameters, only supportive blueprints.</p>
        <p>© 2026 DeadlineDevil Workspace • Continuous high-focus companion.</p>
      </footer>

      {/* Check-In Simulated Popup modal */}
      {checkInTask && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn" id="check-in-modal">
          <div className="bg-[#16181C] border border-[#2F3336] rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setIgnoredCheckIns(prev => new Set([...prev, checkInTask.id]));
                setCheckInTask(null);
              }}
              className="absolute top-4 right-4 text-[#71767B] hover:text-white font-mono cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-[#7C3AED]/10 text-[#A78BFA] rounded-full flex items-center justify-center text-2xl border border-[#7C3AED]/20">
                ⏳
              </div>
              <div>
                <span className="text-[10px] text-[#F97316] uppercase tracking-widest font-bold block font-mono">Scheduled Time Check-In</span>
                <span className="text-xs font-bold text-[#71767B] font-mono">Time crossed: {checkInTask.timeSlot}</span>
              </div>
            </div>

            <p className="text-[#E7E9EA] font-semibold text-base mb-3 leading-snug">
              "Did you complete this commitment?"
            </p>
            
            {/* Target task details */}
            <div className="bg-[#1E2024] p-3 rounded-xl border border-[#2F3336] text-xs text-[#71767B] mb-6 font-mono">
              <p className="font-bold text-[#E7E9EA]">{checkInTask.name}</p>
              <p className="text-[#71767B] mt-1">Deadline: {checkInTask.deadline}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Option A: Yes */}
              <button
                onClick={() => {
                  toggleTaskCompleted(checkInTask.id);
                  setIgnoredCheckIns(prev => new Set([...prev, checkInTask.id]));
                  setCheckInTask(null);
                  setDevilNudge("Grand effort! Responding yes keeps our workflow clean and boosts productivity levels.");
                }}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center space-x-2 transition-all active:scale-95 shadow-md font-mono cursor-pointer"
              >
                <Check className="w-4 h-4 text-white" />
                <span>Yes, finished!</span>
              </button>

              {/* Option B: No */}
              <button
                onClick={() => {
                  setIgnoredCheckIns(prev => new Set([...prev, checkInTask.id]));
                  handleRescheduleRemaining();
                }}
                className="py-3 px-4 bg-[#1E1B29] hover:bg-[#252033] text-[#A78BFA] border border-[#7C3AED]/30 hover:border-[#7C3AED]/60 font-semibold text-xs rounded-xl flex items-center justify-center space-x-2 transition-all active:scale-95 shadow-md font-mono cursor-pointer"
              >
                <X className="w-4 h-4 text-white" />
                <span>No, reschedule AI</span>
              </button>
            </div>

            <p className="text-[10px] text-[#71767B] mt-4 text-center font-sans">
              *Choosing No prompts Gemini AI to automatically reschedule uncompleted workspace items around your present hour.
            </p>
          </div>
        </div>
      )}

      {/* 1. EMERGENCY MODE FULL SCREEN TAKEOVER */}
      {emergencyTask && (
        <div className="fixed inset-0 bg-[#242526] z-50 flex flex-col justify-center items-center p-6 overflow-y-auto">
          <div className="max-w-2xl w-full bg-[#2B2D31] border-2 border-red-500 rounded-3xl p-8 shadow-[0_0_50px_rgba(239,68,68,0.4)] text-center space-y-6 relative overflow-hidden">
            {/* Ambient Red Alert Light */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-rose-600 animate-pulse"></div>
            
            <div className="space-y-2">
              <span className="px-3 py-1 bg-red-500/10 border border-red-500/30 text-rose-400 text-xs font-mono font-bold uppercase rounded-full animate-pulse inline-block">
                🚨 EMERGENCY LOCKDOWN ACTIVE
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white font-display tracking-tight uppercase leading-tight">
                FOCUS SEGMENT OVERRIDE
              </h2>
              <p className="text-slate-400 text-xs font-mono max-w-md mx-auto">
                No distractions, no secondary views. Complete your target milestones immediately.
              </p>
            </div>

            {/* Massive Digital Countdown Timer */}
            <div className="bg-[#242526] border border-red-500/30 rounded-2xl py-6 px-8 max-w-sm mx-auto shadow-inner text-center">
              <span className="text-[10px] text-rose-400 font-mono uppercase tracking-widest block mb-1">Time Remaining Before Catastrophe</span>
              <span className="text-4xl md:text-5xl font-mono font-extrabold text-rose-500 tracking-wider animate-pulse block">
                {getUrgencyState(emergencyTask, currentTime).label.replace(" left!", "")}
              </span>
            </div>

            {/* Target Task Name */}
            <div className="bg-[#242526] rounded-2xl p-4 border border-slate-700/40 text-left max-w-lg mx-auto">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[9px] text-[#F97316] font-mono uppercase font-semibold">Active Objective:</span>
                <span className="text-[9px] text-slate-500 font-mono uppercase">Priority: {emergencyTask.priority}</span>
              </div>
              <h3 className="text-slate-100 font-bold text-sm md:text-base leading-snug">
                {emergencyTask.name}
              </h3>
            </div>

            {/* Next Steps Checklist */}
            <div className="max-w-lg mx-auto text-left space-y-3">
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block font-bold">
                Checklist Roadmap (Click to resolve):
              </span>
              <div className="bg-[#242526] border border-slate-700/40 rounded-xl p-4 space-y-2.5 max-h-48 overflow-y-auto">
                {emergencyTask.steps && emergencyTask.steps.length > 0 ? (
                  emergencyTask.steps.map((st, sidx) => {
                    const stepProgressPercent = Math.min(Math.floor(((sidx + 1) / emergencyTask.steps.length) * 100), 100);
                    const isChecked = emergencyTask.progress >= stepProgressPercent;
                    return (
                      <label
                        key={sidx}
                        onClick={() => {
                          handleCheckStepItem(emergencyTask.id, sidx, emergencyTask.steps.length);
                        }}
                        className={`flex items-start space-x-2.5 text-xs cursor-pointer p-1.5 rounded-md hover:bg-[#2B2D31] transition-colors ${isChecked ? 'text-slate-500 line-through' : 'text-slate-200'}`}
                      >
                        <span className={`mt-0.5 font-bold font-mono text-[10px] ${isChecked ? 'text-emerald-500' : 'text-rose-400'}`}>
                          [{sidx + 1}]
                        </span>
                        <span className="leading-relaxed">{st}</span>
                      </label>
                    );
                  })
                ) : (
                  <p className="text-slate-500 text-xs font-mono">No steps outlined. Focus on finalizing the submission.</p>
                )}
              </div>
            </div>

            {/* Actions Panel */}
            <div className="max-w-md mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => {
                  handleExtendTask(emergencyTask.id, 30);
                }}
                className="py-3 px-4 bg-[#242526] border border-slate-700/40 hover:border-slate-400 text-slate-300 font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition-all active:scale-95 shadow-md font-mono hover:bg-[#2B2D31] cursor-pointer"
              >
                <span>Extend Deadline (+30m)</span>
              </button>

              <button
                onClick={() => {
                  toggleTaskCompleted(emergencyTask.id);
                  setDevilNudge(`Outstanding crisis management! Marked "${emergencyTask.name}" as completed.`);
                }}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition-all active:scale-95 shadow-md font-mono cursor-pointer"
              >
                <Check className="w-4 h-4 text-white" />
                <span>Mark Task Done</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. CRITICAL MODE: LOCKED FOCUS SHIELD */}
      {criticalTask && activeTaskId !== criticalTask.id && (() => {
        const nextStepIndex = criticalTask.steps
          ? criticalTask.steps.findIndex((st, sidx) => {
              const stepProgressPercent = Math.min(Math.floor(((sidx + 1) / criticalTask.steps.length) * 100), 100);
              return criticalTask.progress < stepProgressPercent;
            })
          : -1;
        const nextStepText = nextStepIndex !== -1 && criticalTask.steps ? criticalTask.steps[nextStepIndex] : "Finalize remaining requirements and submit!";

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-45 animate-fadeIn">
            <div className="bg-[#FFFFFF] border-2 border-amber-500 rounded-2xl max-w-lg w-full p-6 shadow-[0_0_35px_rgba(245,158,11,0.3)] relative overflow-hidden space-y-4">
              
              {/* Header */}
              <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
                <div className="w-10 h-10 bg-amber-50 text-amber-600 border border-amber-200 rounded-full flex items-center justify-center text-xl animate-pulse">
                  🛡️
                </div>
                <div>
                  <span className="text-[10px] text-amber-500 uppercase tracking-widest font-extrabold block font-mono">
                    Locked Focus Shield Active
                  </span>
                  <span className="text-xs font-bold text-slate-500 font-mono">
                    Due in {getUrgencyState(criticalTask, currentTime).label}
                  </span>
                </div>
              </div>

              {negotiatingTaskId === criticalTask.id ? (
                /* Negotiation View */
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <button
                      onClick={() => {
                        setNegotiatingTaskId(null);
                        setNegotiationChat([]);
                        setCurrentProposedDeal(null);
                        setNegotiationStatus("NEGOTIATING");
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1 transition-colors font-mono cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Shield</span>
                    </button>
                    <span className="text-[10px] text-purple-600 font-mono font-bold uppercase">
                      Daemon Delay Negotiator
                    </span>
                  </div>

                  {/* Conversation Area */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 h-60 overflow-y-auto space-y-3 flex flex-col">
                    {negotiationChat.map((msg, idx) => {
                      const isDevil = msg.sender === "devil";
                      return (
                        <div
                          key={idx}
                          className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                            isDevil
                              ? "bg-white border border-slate-200 text-slate-800 self-start shadow-sm"
                              : "bg-purple-50 border border-purple-200 text-purple-800 self-end text-right"
                          }`}
                        >
                          <span className={`text-[9px] font-mono font-bold block mb-1 uppercase ${isDevil ? "text-amber-600" : "text-purple-600"}`}>
                            {isDevil ? "😈 DeadlineDevil" : "👤 You"}
                          </span>
                          <span className="whitespace-pre-wrap">{msg.text}</span>
                        </div>
                      );
                    })}
                    {isSendingNegotiation && (
                      <div className="text-xs font-mono text-slate-500 animate-pulse self-start italic p-2 bg-slate-100 rounded-xl border border-slate-200/60">
                        😈 analyzing schedule parameters...
                      </div>
                    )}
                  </div>

                  {/* Deal Box */}
                  {currentProposedDeal && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-left space-y-2 animate-fadeIn">
                      <span className="text-[9px] uppercase font-mono text-amber-600 font-bold block">Companion Proposes:</span>
                      <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                        I will extend your deadline by <strong className="text-amber-600">+{currentProposedDeal.extensionMinutes} minutes</strong> if you promise to complete the immediate step: <strong className="text-emerald-600">"{currentProposedDeal.requiredImmediateStep}"</strong> right now. Deal?
                      </p>
                      <div className="flex space-x-2 pt-1">
                        <button
                          onClick={() => handleApplyDeal(currentProposedDeal.extensionMinutes)}
                          className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                        >
                          Deal (Accept Offer)
                        </button>
                        <button
                          onClick={handleRejectDeal}
                          className="py-1.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-xs rounded-lg transition-all cursor-pointer"
                        >
                          No Deal (Reject)
                        </button>
                      </div>
                    </div>
                  )}

                   {/* Input Box */}
                   {negotiationStatus !== "DEAL_ACCEPTED" && negotiationStatus !== "NO_EXTENSION" && (
                     <div className="flex items-center space-x-2">
                       <input
                         type="text"
                         value={negotiationInput}
                         onChange={(e) => setNegotiationInput(e.target.value)}
                         onKeyDown={(e) => {
                           if (e.key === "Enter") handleSendNegotiationMessage();
                         }}
                         disabled={isSendingNegotiation}
                         placeholder="Explain why you need a delay..."
                         className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 transition-colors"
                       />
                       <button
                         onClick={() => handleSendNegotiationMessage()}
                         disabled={isSendingNegotiation}
                         className="p-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center cursor-pointer"
                       >
                         <Send className="w-4 h-4" />
                       </button>
                     </div>
                   )}

                  {negotiationStatus === "NO_EXTENSION" && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center text-xs text-red-600 font-mono font-bold uppercase animate-pulse">
                      ⛔ No further delays possible. Back to work!
                    </div>
                  )}
                </div>
              ) : (
                /* Primary Locked Shield View */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-slate-800 font-bold text-base leading-tight">
                      {criticalTask.name}
                    </h3>
                    <p className="text-slate-600 text-xs">
                      Deadline is approaching rapidly. Procrastination parameters have been blocked to secure your workspace. Focus is mandatory.
                    </p>
                  </div>

                  {/* Highlight Next Immediate Step */}
                  <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-4 space-y-2 text-left shadow-inner">
                    <span className="text-[10px] uppercase font-mono text-amber-600 font-bold block">Next Immediate Step:</span>
                    <div className="flex items-start space-x-2">
                      <span className="text-amber-500 font-extrabold font-mono text-sm">[{nextStepIndex !== -1 ? nextStepIndex + 1 : "★"}]</span>
                      <p className="text-sm font-semibold text-slate-800 leading-relaxed">{nextStepText}</p>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Complete this single step to secure your timeline. Watch the focus timer build progress.
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => {
                        setActiveTaskId(criticalTask.id);
                        setSessionSeconds(0);
                        setDevilNudge(`Outstanding resolve! Focused session started for "${criticalTask.name}". Secure that next milestone.`);
                      }}
                      className="py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition-all active:scale-95 shadow-md font-mono cursor-pointer"
                    >
                      <Check className="w-4 h-4 animate-pulse" />
                      <span>I Am Working On It</span>
                    </button>

                    <button
                      onClick={() => {
                        setNegotiatingTaskId(criticalTask.id);
                        setNegotiationChat([
                          {
                            sender: "devil",
                            text: `So, you want a delay for "${criticalTask.name}"? Tell me exactly why you cannot complete it in the next 30 minutes, and we shall negotiate. Be honest.`
                          }
                        ]);
                        setCurrentProposedDeal(null);
                        setNegotiationStatus("NEGOTIATING");
                      }}
                      className="py-3 px-4 bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition-all active:scale-95 shadow-md font-mono hover:bg-slate-100 cursor-pointer"
                    >
                      <span>Request Delay</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Minimized Focus Shield Widget */}
      {criticalTask && activeTaskId === criticalTask.id && (
        <div className="fixed bottom-6 right-6 z-40 bg-[#FFFFFF] border-2 border-amber-500 rounded-2xl p-4 shadow-[0_0_20px_rgba(245,158,11,0.3)] max-w-xs animate-fadeIn">
          <div className="flex items-center justify-between space-x-3 mb-2 pb-2 border-b border-slate-100">
            <span className="flex items-center space-x-1.5 text-xs text-amber-600 font-bold font-mono">
              <Shield className="w-4 h-4 text-amber-500 animate-pulse" />
              <span>Shield Active</span>
            </span>
            <button
              onClick={() => setActiveTaskId(null)}
              className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title="Maximize Focus Shield"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] font-semibold text-slate-800 truncate">{criticalTask.name}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500">Time left: <strong className="text-red-600">{getUrgencyState(criticalTask, currentTime).label}</strong></span>
            <span className="text-[10px] font-mono text-slate-500">Focused: <strong className="text-amber-600">{formattedTime(sessionSeconds)}</strong></span>
          </div>
        </div>
      )}

      {/* ANTI-CHEAT SYSTEM MODALS */}
      {/* 1. Delete Protection */}
      {deletingTaskId && deleteConfirmStep && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#FFFFFF] border-2 border-red-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-red-50 rounded-full border border-red-200">
                <ShieldAlert className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-display font-bold text-slate-800">Delete Protection Intercepted</h3>
                <p className="text-slate-400 text-xs font-mono">Secured accountability daemon</p>
              </div>
            </div>
            
            {deleteConfirmStep === 'POPUP' ? (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-slate-700 leading-relaxed">
                  Deleting this won't make the deadline disappear. This is due in{" "}
                  <strong className="text-red-600">
                    {(() => {
                      const t = tasks.find(x => x.id === deletingTaskId);
                      if (!t) return "N/A";
                      const diffMs = (t.deadlineTimestamp || 0) - currentTime.getTime();
                      return Math.max(0, diffMs / (60 * 60 * 1000)).toFixed(1);
                    })()}
                  </strong>{" "}
                  hours. Are you sure you want to give up?
                </p>
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setDeletingTaskId(null);
                      setDeleteConfirmStep(null);
                      setDevilNudge("Keep fighting! I am behind you 100%!");
                    }}
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer font-mono"
                  >
                    Keep Fighting
                  </button>
                  <button
                    onClick={() => setDeleteConfirmStep('CONFIRM_CONSEQUENCES')}
                    className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition-all cursor-pointer font-mono"
                  >
                    I Give Up
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-red-600 font-semibold leading-relaxed">
                  ⚠️ Your progress will be lost and this task will be marked as abandoned. Are you absolutely sure?
                </p>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setDeleteConfirmStep('POPUP')}
                    className="flex-1 py-2.5 px-4 bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 text-xs font-semibold rounded-xl transition-all cursor-pointer font-mono"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={() => {
                      if (deletingTaskId) {
                        deleteTask(deletingTaskId, true);
                      }
                    }}
                    className="py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer font-mono"
                  >
                    Yes, Abandon Task
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Suspicious Completion Detection */}
      {suspiciousCompletingTaskId && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#FFFFFF] border-2 border-amber-500 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-amber-50 rounded-full border border-amber-200">
                <TriangleAlert className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h3 className="text-lg font-display font-bold text-slate-800">Suspicious Completion Intercepted</h3>
                <p className="text-slate-400 text-xs font-mono">Speed safety daemon active</p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                That was fast! Did you actually finish? Describe what you completed in one line before marking this complete.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (suspiciousCompletionReason.trim()) {
                    toggleTaskCompleted(suspiciousCompletingTaskId, suspiciousCompletionReason.trim());
                  }
                }}
                className="space-y-3"
              >
                <input
                  type="text"
                  required
                  placeholder="e.g. Completed section 1 of the report and drafted the abstract"
                  value={suspiciousCompletionReason}
                  onChange={(e) => setSuspiciousCompletionReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-[#7C3AED] rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none transition-colors"
                />
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSuspiciousCompletingTaskId(null);
                      setSuspiciousCompletionReason("");
                    }}
                    className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold border border-slate-200 rounded-xl transition-all cursor-pointer font-mono"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!suspiciousCompletionReason.trim()}
                    className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-all cursor-pointer font-mono"
                  >
                    Submit Verification
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 3. Excessive Extension Detection */}
      {excessiveExtensionTaskId && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#FFFFFF] border-2 border-red-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-red-50 rounded-full border border-red-200">
                <Flame className="w-6 h-6 text-red-500 animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-display font-bold text-slate-800">Panic Meter Spiked!</h3>
                <p className="text-red-600 text-xs font-mono font-bold uppercase tracking-wider">Excessive delay thresholds breached</p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                {excessiveNudgeText}
              </p>
              <div className="bg-red-50 p-3 rounded-xl border border-red-200 text-xs text-red-800 italic font-mono">
                "Our priorities should shape our time, not our procrastination. I've broken this task down into brand new, extremely targeted checklist subtasks. Let's tackle them!"
              </div>
              <button
                onClick={() => {
                  setExcessiveExtensionTaskId(null);
                  setExcessivePanicActive(false);
                }}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all shadow-md cursor-pointer uppercase font-mono tracking-wider"
              >
                Acknowledge & Restructure
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Inactivity Detection */}
      {inactivityTriggered && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#FFFFFF] border-2 border-[#7C3AED]/50 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-[#7C3AED]/10 rounded-full border border-[#7C3AED]/20">
                <Clock className="w-6 h-6 text-[#7C3AED] animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-display font-bold text-slate-800">Inactivity Intercepted</h3>
                <p className="text-slate-400 text-xs font-mono">Focus assist loop active</p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-48 overflow-y-auto space-y-3">
                {inactivityChat.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                    <span className="text-[10px] font-mono text-slate-500 uppercase mb-0.5">
                      {msg.sender === "user" ? "You" : "DeadlineDevil"}
                    </span>
                    <div className={`p-2.5 rounded-xl text-xs max-w-[85%] leading-relaxed ${
                      msg.sender === "user" ? "bg-[#7C3AED] text-white" : "bg-white border border-slate-200 text-slate-800 shadow-sm"
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!inactivityInput.trim() || isSendingInactivityChat) return;

                  const userMsgText = inactivityInput.trim();
                  const updatedChat = [...inactivityChat, { sender: "user" as const, text: userMsgText }];
                  setInactivityChat(updatedChat);
                  setInactivityInput("");
                  setIsSendingInactivityChat(true);

                  try {
                    const activeTask = tasks.find(t => t.id === activeTaskId);
                    const response = await fetch("/api/diagnose-inactivity", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        task: activeTask,
                        chatHistory: updatedChat,
                        userInput: userMsgText
                      })
                    });

                    if (response.ok) {
                      const data = await response.json();
                      setInactivityChat(prev => [...prev, { sender: "devil", text: data.reply }]);
                    } else {
                      throw new Error();
                    }
                  } catch {
                    setInactivityChat(prev => [...prev, { sender: "devil", text: "I understand you might be struggling. Take a deep breath, and let's try just writing down your first obstacle." }]);
                  } finally {
                    setIsSendingInactivityChat(false);
                  }
                }}
                className="flex items-center space-x-2"
              >
                <input
                  type="text"
                  placeholder="Explain what is blocking you right now..."
                  value={inactivityInput}
                  onChange={(e) => setInactivityInput(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-[#7C3AED] rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={!inactivityInput.trim() || isSendingInactivityChat}
                  className="p-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 text-white rounded-xl transition-colors cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              <div className="flex space-x-2 pt-1 border-t border-slate-100">
                <button
                  onClick={() => {
                    setInactivityTriggered(false);
                    setInactivitySeconds(0);
                    setInactivityChat([]);
                  }}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer uppercase font-mono tracking-wider"
                >
                  I'm ready to fight!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GOOGLE CALENDAR SETUP MODAL */}
      {showCalendarSyncModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-[#FFFFFF] border border-slate-200 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-50 rounded-lg border border-purple-100">
                  <Calendar className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 font-display">Google Calendar Credentials</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">DeadlineDevil Portal System</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowCalendarSyncModal(false);
                  setCalendarSyncError(null);
                }} 
                className="text-slate-500 hover:text-slate-300 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* DYNAMIC CREDENTIALS MANAGER FORM */}
            <div className="bg-purple-50/40 border border-purple-100 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-700 font-mono">Dynamic Credentials Override</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Provide your Client ID, Client Secret, and Redirect URI below. They will override any old cached environment variables.
              </p>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-mono mb-1">Google Client ID:</label>
                  <input
                    type="text"
                    value={customClientId}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      setCustomClientId(val);
                      localStorage.setItem("deadline_devil_custom_client_id", val);
                    }}
                    placeholder="121190826146-t4se5f65s4nnmq4sgr...apps.googleusercontent.com"
                    className="w-full bg-white border border-slate-200 hover:border-purple-500/50 focus:border-purple-500 rounded-lg px-3 py-2 text-slate-800 font-mono text-[11px] outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-mono mb-1">Google Client Secret:</label>
                  <input
                    type="password"
                    value={customClientSecret}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      setCustomClientSecret(val);
                      localStorage.setItem("deadline_devil_custom_client_secret", val);
                    }}
                    placeholder="GOCSPX-..."
                    className="w-full bg-white border border-slate-200 hover:border-purple-500/50 focus:border-purple-500 rounded-lg px-3 py-2 text-slate-800 font-mono text-[11px] outline-none transition-colors"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-slate-600 font-mono">Google Redirect URI Override:</label>
                    <span className="text-[9px] text-purple-600 font-mono">Defaults to current page origin</span>
                  </div>
                  <input
                    type="text"
                    value={customRedirectUri}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      setCustomRedirectUri(val);
                      localStorage.setItem("deadline_devil_custom_redirect_uri", val);
                    }}
                    placeholder={`${window.location.origin}/auth/callback`}
                    className="w-full bg-white border border-slate-200 hover:border-purple-500/50 focus:border-purple-500 rounded-lg px-3 py-2 text-slate-800 font-mono text-[11px] outline-none transition-colors"
                  />
                </div>
                {(customClientId || customClientSecret || customRedirectUri) && (
                  <div className="flex justify-between items-center pt-1 border-t border-slate-100 mt-2">
                    <span className="text-[10px] text-emerald-600 font-mono">✓ Saved locally & overriding server!</span>
                    <button
                      onClick={handleClearCustomCredentials}
                      className="px-2 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-mono text-[9px] rounded transition-colors cursor-pointer"
                    >
                      Clear & Reset Session
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-3 leading-relaxed font-sans bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="font-semibold text-slate-800">How to Fix redirect_uri_mismatch Error:</p>
              
              <ol className="list-decimal list-inside space-y-2 text-slate-500 text-[11px]">
                <li>
                  Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline inline-flex items-center space-x-0.5">
                    <span>Google Cloud Console Credentials</span><ExternalLink className="w-3 h-3 inline ml-0.5" />
                  </a> and click your OAuth Client ID name to edit it.
                </li>
                <li>
                  Under <strong className="text-slate-700">Authorized redirect URIs</strong>, you MUST register the EXACT URL being requested by the app.
                </li>
                <li>
                  Copy the current URL shown below and paste it as a new Authorized Redirect URI:
                  <div className="mt-1 bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[10.5px] text-purple-700 select-all cursor-pointer hover:bg-slate-50 transition-colors break-all flex justify-between items-center"
                       onClick={() => {
                         navigator.clipboard.writeText(activeRedirectUri);
                         setDevilNudge("Successfully copied redirect URI to clipboard!");
                       }}>
                    <span>{activeRedirectUri}</span>
                    <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded ml-2 flex-shrink-0">Copy</span>
                  </div>
                </li>
                <li className="text-[10px] text-amber-600 leading-tight font-mono">
                  ⚠️ Note: If you have already registered a specific Redirect URI in Google Console (e.g., a custom domain or different environment), you can paste it into the "Google Redirect URI Override" field above to force the app to match your Console settings exactly!
                </li>
              </ol>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => {
                  setShowCalendarSyncModal(false);
                  setCalendarSyncError(null);
                }}
                className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer font-mono text-center shadow"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
