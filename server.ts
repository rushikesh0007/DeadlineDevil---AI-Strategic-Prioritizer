import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // Initialize Gemini AI
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY environment variable is not set!");
  }
  const ai = new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Helper function to call generateContent with automatic retry and model fallback
  async function generateContentWithFallback(aiInstance: GoogleGenAI, params: {
    contents: any;
    config?: any;
  }) {
    const primaryModel = "gemini-3.5-flash";
    const fallbackModel = "gemini-3.1-flash-lite";
    const maxRetries = 2;
    let currentDelay = 400;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Gemini] Model ${primaryModel}: Attempt ${attempt + 1}/${maxRetries + 1}...`);
        const res = await aiInstance.models.generateContent({
          ...params,
          model: primaryModel,
        });
        if (res && res.text) {
          return res;
        }
        throw new Error("Empty text returned from primary Gemini model.");
      } catch (err: any) {
        const errString = typeof err === "object" ? JSON.stringify(err) : String(err);
        const isQuota = errString.includes("RESOURCE_EXHAUSTED") || 
                        errString.includes("429") || 
                        errString.includes("quota") || 
                        errString.includes("Quota") || 
                        errString.includes("limit");
        
        console.error(`[Gemini] Attempt ${attempt + 1} with ${primaryModel} failed. Details:`, err.message || err);
        
        let waitMs = 0;
        if (isQuota) {
          const retryMatch = errString.match(/retry in ([\d\.]+)s/i);
          if (retryMatch) {
            waitMs = Math.ceil(parseFloat(retryMatch[1]) * 1000);
          } else {
            const jsonRetryMatch = errString.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
            if (jsonRetryMatch) {
              waitMs = parseInt(jsonRetryMatch[1], 10) * 1000;
            } else {
              const jsonRetryNum = errString.match(/"retryDelay"\s*:\s*(\d+)/i);
              if (jsonRetryNum) {
                waitMs = parseInt(jsonRetryNum[1], 10) * 1000;
              }
            }
          }
        }

        if (waitMs > 0 && waitMs <= 10000) {
          console.log(`[Gemini] Quota/Rate limit encountered (retry in ${waitMs}ms requested). Waiting dynamically...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs + 200)); // add 200ms padding
        } else if (attempt < maxRetries) {
          console.log(`[Gemini] Retrying primary model in ${currentDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, currentDelay));
          currentDelay *= 2;
        } else {
          console.warn(`[Gemini] Primary model ${primaryModel} exhausted after ${maxRetries + 1} attempts. Falling back immediately to ${fallbackModel}...`);
          try {
            const fallbackRes = await aiInstance.models.generateContent({
              ...params,
              model: fallbackModel,
            });
            if (fallbackRes && fallbackRes.text) {
              console.log(`[Gemini] Successfully generated content using fallback model ${fallbackModel}`);
              return fallbackRes;
            }
            throw new Error("Empty text returned from fallback Gemini model.");
          } catch (fallbackErr: any) {
            const fallbackErrString = typeof fallbackErr === "object" ? JSON.stringify(fallbackErr) : String(fallbackErr);
            const isFallbackQuota = fallbackErrString.includes("RESOURCE_EXHAUSTED") || 
                                    fallbackErrString.includes("429") || 
                                    fallbackErrString.includes("quota") || 
                                    fallbackErrString.includes("Quota") ||
                                    fallbackErrString.includes("limit");
            console.error(`[Gemini] Fallback model ${fallbackModel} also failed:`, fallbackErr.message || fallbackErr);
            if (isFallbackQuota) {
              throw new Error("Gemini API Quota Exceeded (429): The system's free-tier daily limit has been reached. Please try again in a few minutes, or configure a paid model / custom API key via the Settings panel inside Google AI Studio if you have one.");
            }
            throw fallbackErr;
          }
        }
      }
    }
    throw new Error("Generative models failed to produce response.");
  }

  // Parse Tasks Route
  app.post("/api/parse-tasks", async (req, res) => {
    try {
      const { paragraph } = req.body;
      if (!paragraph || typeof paragraph !== "string") {
         return res.status(400).json({ error: "Paragraph text is required." });
      }

      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key is not configured on the server." });
      }

      const response = await generateContentWithFallback(ai, {
        contents: `Translate the following chaotic input into a structured schedule: "${paragraph}"`,
        config: {
          systemInstruction: "You are 'DeadlineDevil', a highly structured, supportive, and polite scheduling companion. Your duty is to help users break down and organize chaotic notifications, text messages, tasks, and deadlines into a prioritized, actionable day plan. Do not use negative, mean, threatening, or aggressive words. Instead, keep your tone kind, professional, polished, encouraging, and organized. Prioritize more urgent items as HIGH, medium items as MEDIUM, and less urgent as LOW. Put each task into a logical, clear time slot for today. CRITICAL Requirement: For every single extracted task, its 'steps' and 'tips' MUST be generated specifically relevant to that exact task topic/domain and name context (e.g., if a task is 'Data Structures assignment', steps should be 'Review arrays and linked lists', 'Practice sorting algorithms', 'Solve sample problems', etc.; if 'Bill Payment', steps should be 'Log into pay portal', 'Confirm secure connection', 'Register receipt confirmation ID'; if 'Job Interview', steps should be 'Review company background', 'Practice STAR format responses', 'Run mock prep session'). You are strictly forbidden from returning random generic steps like 'Set up working desk' or 'Eliminate distraction' for all tasks; everything must be customized to the specific domain of the task name.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tasks: {
                type: Type.ARRAY,
                description: "The list of extracted and scheduled tasks prioritized by urgency.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Name of the task, clear and concise." },
                    deadline: { type: Type.STRING, description: "Extracted deadline, e.g. 'Due tonight 11:00 PM', 'Tomorrow 9:00 AM'" },
                    priority: { type: Type.STRING, description: "Priority level: HIGH, MEDIUM, or LOW" },
                    timeSlot: { type: Type.STRING, description: "Chronological time slot assigned for today, e.g. '10:00 AM - 11:00 AM', '3:00 PM - 4:00 PM'" },
                    steps: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "3 to 5 highly domain-specific subtask checklist items tailored uniquely to this exact task topic and name."
                    },
                    tips: { type: Type.STRING, description: "A highly specific, domain-aware piece of advice and tips specialized to this exact task context." }
                  },
                  required: ["name", "deadline", "priority", "timeSlot", "steps", "tips"]
                }
              },
              devilNudge: {
                type: Type.STRING,
                description: "A highly personalized, encouraging, and supportive greeting/message from DeadlineDevil."
              }
            },
            required: ["tasks", "devilNudge"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("No text response from Gemini.");
      }
      const data = JSON.parse(text);
      res.json(data);
    } catch (error: any) {
      console.error("Error in /api/parse-tasks:", error);
      res.status(500).json({ error: error.message || "Failed to process task." });
    }
  });

  // Reschedule Tasks Route
  app.post("/api/reschedule-tasks", async (req, res) => {
    try {
      const { remainingTasks, currentTimeString } = req.body;
      if (!remainingTasks || !Array.isArray(remainingTasks)) {
        return res.status(400).json({ error: "remainingTasks array is required." });
      }

      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key is not configured on the server." });
      }

      const response = await generateContentWithFallback(ai, {
        contents: `The user did not complete a task. Please reschedule these remaining uncompleted tasks: ${JSON.stringify(remainingTasks)}. The current time is ${currentTimeString || "now"}.`,
        config: {
          systemInstruction: "You are DeadlineDevil, the polite scheduling companion. The user did not manage to finish their last task. Do NOT be mean or disappointed. Instead, be extremely supportive and reassuring. Rearrange their remaining schedule starting from the current time. Ensure that for each task, its updated checklist 'steps' and 'tips' are extremely domain-specific, actionable, and uniquely relevant to the exact topic and name of that task. No generic steps like 'Set up desk' or 'Focus'. Ensure the steps are highly descriptive of the task's domain (e.g. C coding, circuits calculations, paying bills, etc.).",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Name of the task." },
                    deadline: { type: Type.STRING, description: "The deadline for the task." },
                    priority: { type: Type.STRING, description: "Priority level: HIGH, MEDIUM, or LOW" },
                    timeSlot: { type: Type.STRING, description: "Updated adjusted time slot starting at/after the current time, e.g. 5:15 PM - 6:15 PM" },
                    steps: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 to 5 highly domain-specific checklist subtasks tailored to this exact task topic." },
                    tips: { type: Type.STRING, description: "A highly specific, domain-aware piece of advice and tips specialized to this exact task." }
                  },
                  required: ["name", "deadline", "priority", "timeSlot", "steps", "tips"]
                }
              },
              devilNudge: {
                type: Type.STRING,
                description: "An encouraging, reassuring nudge explaining the new adjusted timeline and motivating them to take the next small step."
              }
            },
            required: ["tasks", "devilNudge"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("No text response from Gemini.");
      }
      const data = JSON.parse(text);
      res.json(data);
    } catch (error: any) {
      console.error("Error in /api/reschedule-tasks:", error);
      res.status(500).json({ error: error.message || "Failed to process reschedule." });
    }
  });

  // Generate Specific Subtasks Route
  app.post("/api/generate-subtasks", async (req, res) => {
    try {
      const { taskName } = req.body;
      if (!taskName || typeof taskName !== "string") {
        return res.status(400).json({ error: "taskName is required." });
      }

      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key is not configured on the server." });
      }

      const response = await generateContentWithFallback(ai, {
        contents: `Task Name: "${taskName}".
Please generate 3-5 subtasks (Actionable Checklist Plan) and AI Advice & Tips that are specifically relevant to that exact task name topic.
For example:
- If the task is 'Data Structures assignment', you must return steps like 'Review arrays and linked lists', 'Practice sorting algorithms', 'Solve sample problems', with specific advice about Data Structures concepts.
- If the task is 'Job Interview', steps must be interview preparation steps, with specific advice for job interviews.
- If the task is 'Bill Payment', steps must be payment steps, with specific advice on paying bills securely and on time.
The subtasks and advice MUST be generated based on the exact task name context and must be highly domain-specific, informative, and relevant instead of being random generic steps (like 'prepare desk' or 'focus').`,
        config: {
          systemInstruction: "You are 'DeadlineDevil', a polite and highly structured scheduling companion. Your goal is to break down the provided task name into exactly 3-5 highly specific, sequential, concrete, and deeply domain-relevant subtasks (actionable checklist) and 1 highly supporting tip. Do NOT return generic steps like 'Eliminate phone alerts', 'Clean your desk', or 'Prepare workspace'. Match the checklist steps and advice details directly and uniquely to the domain of the task name (e.g. programming topics should refer to debugging, algorithm complexity, code structures; billing topics should refer to logging into the secure portal, validating transaction amounts, checking account balances, securing transaction confirmation IDs; interview topics should refer to practicing STAR answers, company background check, mock sessions).",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              steps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Exactly 3 to 5 sequential, domain-specific checklist subtasks directly relevant to this exact task name."
              },
              tips: {
                type: Type.STRING,
                description: "A highly specific, domain-aware supportive advice tip directly relevant to this exact task name topic."
              }
            },
            required: ["steps", "tips"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("No response from Gemini.");
      }
      const data = JSON.parse(text);
      res.json(data);
    } catch (error: any) {
      console.error("Error in /api/generate-subtasks:", error);
      res.status(500).json({ error: error.message || "Failed to generate subtasks." });
    }
  });

  // Negotiate Delay Route
  app.post("/api/negotiate-delay", async (req, res) => {
    try {
      const { task, currentTimeString, allRemainingTasks, chatHistory, userInput, timeRemainingLabel } = req.body;
      if (!task) {
        return res.status(400).json({ error: "task is required." });
      }

      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key is not configured on the server." });
      }

      // Format conversation history for Gemini
      const formattedHistory = chatHistory && Array.isArray(chatHistory)
        ? chatHistory.map((m: any) => `${m.sender === 'user' ? 'User' : 'DeadlineDevil'}: ${m.text}`).join("\n")
        : "";

      const prompt = `The user is locked under the 'Locked Focus Shield' and is trying to request a delay/extension for the task: "${task.name}".
The original deadline for this task is: ${task.deadline} (${task.timeSlot || "Not specified"}).
The exact time remaining before the deadline is currently: ${timeRemainingLabel || "less than 30 minutes"}.
The current clock time is ${currentTimeString || "now"}.
Other remaining uncompleted tasks on their agenda: ${JSON.stringify(allRemainingTasks)}.

Task context:
- Name: "${task.name}"
- Checklist Steps: ${JSON.stringify(task.steps || [])}
- Task Current Progress: ${task.progress || 0}%
- Task Priority: ${task.priority || "NORMAL"}

Previous Negotiation Conversation History:
${formattedHistory}

Latest User Message/Reason/Response: "${userInput}"

Please respond as DeadlineDevil, analyzing the user's specific reason and their task context (especially the remaining checklist steps). Propose a highly tailored, non-generic offer or counter-offer. Ensure your response is customized to their specific reason (e.g. if they say they have a problem, ask what specific problem it is; if they say they are tired or stuck, directly address that situation).`;

      const response = await generateContentWithFallback(ai, {
        contents: prompt,
        config: {
          systemInstruction: `You are 'DeadlineDevil', the user's strict but caring scheduling companion. The user has a critical task deadline approaching, and is locked under the 'Locked Focus Shield'. They are trying to negotiate an extension or break. Your tone must be firm, mentoring, and deeply supportive—not rude, but strict enough to break procrastination loops.

You MUST analyze the specific context provided to you:
- Task Name: Reference the actual task name they are working on.
- Exact Time Remaining: Mention how much time they have left before the catastrophe.
- User's Reason: Directly address their reason. For example, if they say 'having a problem', ask them what specific problem they are facing right now (is it a technical block, lack of motivation, fatigue?) before proposing a deal. If they say 'too tired' or 'stuck', address that situation and offer a helpful tip.
- Task Checklist Steps: Look at their list of steps and pick a realistic, immediate 5-minute step (e.g. the first uncompleted step) and include it in your counter-offer.

Your goal is to guide them to complete at least ONE small action.
When proposing a deal, set 'dealProposed' to true, specify 'proposedExtensionMinutes' (an integer like 10, 15, 20, or 30), and specify 'requiredImmediateStep' (must be a specific step from their task checklist or a tiny immediate action tailored to their task).
The 'reply' field should be a supportive, specific mentoring response, ending with a clear proposal: 'I can offer you an extension of +X minutes, but only if you complete this step right now: [immediate step]. Deal or no deal?'

If the user says 'Deal', 'I accept', 'ok', or indicates agreement, set 'negotiationStatus' to 'DEAL_ACCEPTED'. Otherwise, if they continue to negotiate, keep 'negotiationStatus' as 'NEGOTIATING'. If they are being completely uncooperative or refusing to work, you can set 'negotiationStatus' to 'NO_EXTENSION'.

Your output MUST be valid JSON conforming to the schema.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING, description: "Your mentoring, firm but kind conversational response. If proposing a deal, end it with a clear 'Deal or no deal?' and outline the terms." },
              dealProposed: { type: Type.BOOLEAN, description: "True if you are proposing a specific deal with an extension and a required immediate step." },
              proposedExtensionMinutes: { type: Type.INTEGER, description: "The length of the break / extension in minutes, if a deal is proposed (e.g., 15, 20, 30)." },
              requiredImmediateStep: { type: Type.STRING, description: "The specific actionable 5-minute task step they must complete right now to get this extension." },
              negotiationStatus: { type: Type.STRING, description: "The current state of negotiation: 'NEGOTIATING', 'DEAL_ACCEPTED', 'DEAL_REJECTED', or 'NO_EXTENSION'." }
            },
            required: ["reply", "dealProposed", "negotiationStatus"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("No response from Gemini.");
      }
      const data = JSON.parse(text);
      res.json(data);
    } catch (error: any) {
      console.error("Error in /api/negotiate-delay:", error);
      res.status(500).json({ error: error.message || "Failed to negotiate delay." });
    }
  });

  // Diagnose Inactivity Route
  app.post("/api/diagnose-inactivity", async (req, res) => {
    try {
      const { task, chatHistory, userInput } = req.body;
      if (!task) {
        return res.status(400).json({ error: "task is required." });
      }

      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key is not configured." });
      }

      const formattedHistory = chatHistory && Array.isArray(chatHistory)
        ? chatHistory.map((m: any) => `${m.sender === 'user' ? 'User' : 'DeadlineDevil'}: ${m.text}`).join("\n")
        : "";

      const prompt = `The user started a focus session for task "${task.name}" 20 minutes ago but hasn't completed any checklist subtask yet.
Active Task Checklist: ${JSON.stringify(task.steps || [])}
Current Task progress: ${task.progress || 0}%

Previous Chat Logs:
${formattedHistory}

Latest User explanation of what is blocking them: "${userInput}"

Please respond as DeadlineDevil, a strict but deeply caring mentor. Empathize with their specific block (e.g., fatigue, lack of clarity, technical issue, or simple inertia). Offer a very concrete, easy-to-do suggestion or helpful tip specifically tailored to their task domain and their blocker to help them get started. Keep it concise, motivational, and warm.`;

      const response = await generateContentWithFallback(ai, {
        contents: prompt,
        config: {
          systemInstruction: "You are 'DeadlineDevil', a strict but deeply caring scheduling mentor. When a user has been inactive for 20 minutes during their focus session, you intervene to figure out what is blocking them. You do not scold them. Instead, you offer tailored, domain-specific actionable support (e.g. suggesting they write just one line, or break the task down, or do a tiny step) based on what is blocking them. Keep your tone encouraging, mentoring, and firm.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: "A highly personalized, caring, and supportive response analyzing their block and giving a concrete tip."
              }
            },
            required: ["reply"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("No response from Gemini.");
      }
      const data = JSON.parse(text);
      res.json(data);
    } catch (error: any) {
      console.error("Error in /api/diagnose-inactivity:", error);
      res.status(500).json({ error: error.message || "Failed to process inactivity block." });
    }
  });

  // ==========================================
  // GOOGLE OAUTH & GOOGLE CALENDAR PROXY ROUTES
  // ==========================================

  // Check if Google OAuth Client credentials are set on server
  app.get("/api/auth/google/config", (req, res) => {
    res.json({
      isConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      clientId: process.env.GOOGLE_CLIENT_ID || ""
    });
  });

  // Google OAuth redirect callback page
  app.get(["/auth/callback", "/auth/callback/"], (req, res) => {
    const { code } = req.query;
    res.send(`
      <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body {
              background-color: #1C2333;
              color: #F1F5F9;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              background-color: #242D3D;
              border: 1px solid #2E3A4E;
              padding: 2rem;
              border-radius: 1rem;
              text-align: center;
              box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
              max-width: 400px;
            }
            h1 { color: #10B981; margin-top: 0; font-size: 1.5rem; }
            p { color: #94A3B8; font-size: 0.9rem; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Authentication Successful!</h1>
            <p>Your calendar auth credentials have been secured by the DeadlineDevil daemon. This popup will self-destruct shortly.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', code: '${code || ""}' }, '*');
                setTimeout(() => {
                  window.close();
                }, 1000);
              } else {
                window.location.href = '/';
              }
            </script>
          </div>
        </body>
      </html>
    `);
  });

  // Swap OAuth auth code for an access token and profile info
  app.post("/api/auth/google/token", async (req, res) => {
    try {
      const { code, redirect_uri, clientId: bodyClientId, clientSecret: bodyClientSecret } = req.body;
      if (!code) {
        return res.status(400).json({ error: "Authorization code is required." });
      }

      const clientId = bodyClientId || process.env.GOOGLE_CLIENT_ID;
      const clientSecret = bodyClientSecret || process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).json({
          error: "Google OAuth credentials are not configured on the server. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET using the UI form or secrets panel."
        });
      }

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirect_uri,
          grant_type: "authorization_code"
        })
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Google token exchange failed: ${errText}`);
      }

      const tokens = await tokenRes.json();

      // Fetch user profile info using the access token
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });

      let profile = {};
      if (profileRes.ok) {
        profile = await profileRes.json();
      }

      res.json({
        tokens,
        profile
      });
    } catch (err: any) {
      console.error("Error in /api/auth/google/token:", err);
      res.status(500).json({ error: err.message || "Failed to exchange authorization code." });
    }
  });

  const handleGoogleApiError = async (res: any, calendarRes: any) => {
    const errText = await calendarRes.text();
    let errorMsg = errText;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error && parsed.error.message) {
        errorMsg = parsed.error.message;
      }
    } catch (e) {
      // Fallback to text
    }
    return res.status(calendarRes.status).json({ error: `Google API Error (${calendarRes.status}): ${errorMsg}` });
  };

  // Google Calendar API Events Proxy
  app.get("/api/calendar/events", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization token" });
      }

      const { timeMin, timeMax } = req.query;
      const urlParams = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime"
      });
      if (timeMin) urlParams.append("timeMin", timeMin as string);
      if (timeMax) urlParams.append("timeMax", timeMax as string);

      const calendarRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${urlParams.toString()}`, {
        headers: { Authorization: authHeader }
      });

      if (!calendarRes.ok) {
        return await handleGoogleApiError(res, calendarRes);
      }

      const data = await calendarRes.json();
      res.json(data);
    } catch (err: any) {
      console.error("Error in GET /api/calendar/events:", err);
      res.status(500).json({ error: err.message || "Failed to fetch calendar events." });
    }
  });

  // Google Calendar API Create Event Proxy
  app.post("/api/calendar/events", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization token" });
      }

      const { summary, description, start, end } = req.body;
      if (!summary || !start || !end) {
        return res.status(400).json({ error: "summary, start, and end are required." });
      }

      const calendarRes = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          summary,
          description: description || "Scheduled via DeadlineDevil",
          start: { dateTime: start, timeZone: "UTC" },
          end: { dateTime: end, timeZone: "UTC" }
        })
      });

      if (!calendarRes.ok) {
        return await handleGoogleApiError(res, calendarRes);
      }

      const data = await calendarRes.json();
      res.json(data);
    } catch (err: any) {
      console.error("Error in POST /api/calendar/events:", err);
      res.status(500).json({ error: err.message || "Failed to create calendar event." });
    }
  });

  // Google Calendar API Delete Event Proxy
  app.delete("/api/calendar/events/:eventId", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization token" });
      }

      const { eventId } = req.params;
      const calendarRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: "DELETE",
        headers: { Authorization: authHeader }
      });

      if (!calendarRes.ok) {
        return await handleGoogleApiError(res, calendarRes);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Error in DELETE /api/calendar/events:", err);
      res.status(500).json({ error: err.message || "Failed to delete calendar event." });
    }
  });

  // Google Calendar API Update Event Proxy
  app.patch("/api/calendar/events/:eventId", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization token" });
      }

      const { eventId } = req.params;
      const { summary, description, start, end } = req.body;

      const patchBody: any = {};
      if (summary) patchBody.summary = summary;
      if (description) patchBody.description = description;
      if (start) patchBody.start = { dateTime: start, timeZone: "UTC" };
      if (end) patchBody.end = { dateTime: end, timeZone: "UTC" };

      const calendarRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: "PATCH",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(patchBody)
      });

      if (!calendarRes.ok) {
        return await handleGoogleApiError(res, calendarRes);
      }

      const data = await calendarRes.json();
      res.json(data);
    } catch (err: any) {
      console.error("Error in PATCH /api/calendar/events:", err);
      res.status(500).json({ error: err.message || "Failed to update calendar event." });
    }
  });

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
