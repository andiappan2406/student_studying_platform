// System prompts matching the React app
const TUTOR_SYSTEM_PROMPT = `You are a friendly, encouraging Subject Tutor designed to help students learn any topic. Keep your answers reasonably concise but educational. Ask questions occasionally to test their understanding.`;

const MENTOR_SYSTEM_PROMPT_TEMPLATE = (tutorTranscript) => `You are an expert Study Mentor helping a student prepare for an exam. 
Below is the Transcript of their ongoing study session with the Subject Tutor:

--- STUDY TRANSCRIPT LOG ---
${tutorTranscript || "(No conversation yet)"}
----------------------------

Use this transcript as context. Track their progress, identify gaps in their knowledge, and provide encouragement.
If the user asks to summarize, finish, or specifically requests memory keywords/recall, you MUST format your reply cleanly and boldly using markdown, focusing on:
1. A concise summary of the key concepts discussed in the Study Transcript.
2. A bulleted list of isolated **KEYWORDS** (like "Chromatid", "Centromere"). Present them strongly.
3. Explicitly tell the student to "CLOSE YOUR EYES NOW" in a big header (e.g. # 👁️ CLOSE YOUR EYES NOW). Then list 2-3 specific challenge questions they should mentally answer to solidify their learning.`;

// Application State
let tutorMessages = [];
let mentorMessages = [
  {
    id: 'welcome',
    role: 'model',
    content: "Greetings. I am your Cognitive Prep mentor. Begin interacting with the Tutor on the right. When you are ready for a systematic synthesis, select **Generate Recall Mastery**.",
    timestamp: Date.now()
  }
];

let isTutorTyping = false;
let isMentorTyping = false;

// Speech Recognition setups
let recognitionTutor = null;
let recognitionMentor = null;
let isListeningTutor = false;
let isListeningMentor = false;

// Pomodoro State
const POMODORO_DURATIONS = {
  'WORK': 25 * 60,
  'BREAK': 5 * 60,
  'LONG_BREAK': 15 * 60
};
let pomodoroMode = 'WORK';
let pomodoroTimeLeft = POMODORO_DURATIONS['WORK'];
let pomodoroIsRunning = false;
let pomodoroCycles = 0;
let pomodoroInterval = null;

// DOM Elements
const tutorMessagesDiv = document.getElementById("tutor-messages");
const mentorMessagesDiv = document.getElementById("mentor-messages");

const tutorInput = document.getElementById("tutor-input");
const mentorInput = document.getElementById("mentor-input");

const tutorSendBtn = document.getElementById("tutor-send");
const mentorSendBtn = document.getElementById("mentor-send");

const tutorMicBtn = document.getElementById("tutor-mic");
const mentorMicBtn = document.getElementById("mentor-mic");

const clearTutorBtn = document.getElementById("clear-tutor");
const clearMentorBtn = document.getElementById("clear-mentor");

const generateMasteryBtn = document.getElementById("btn-generate-mastery");
const focusModeBtn = document.getElementById("focus-mode-btn");

// Init application
document.addEventListener("DOMContentLoaded", () => {
  initSpeechRecognition();
  initPomodoro();
  initEventListeners();
  renderMessages();
  updateChart();
});

// Helper for generating IDs
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// Event Listeners
function initEventListeners() {

  // Tutor Input Submission
  tutorInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      sendTutorMessage();
    }
  });
  tutorSendBtn.addEventListener("click", sendTutorMessage);

  // Mentor Input Submission
  mentorInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      sendMentorMessage();
    }
  });
  mentorSendBtn.addEventListener("click", sendMentorMessage);

  // Clearing Conversations
  clearTutorBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear the tutor conversation? This cannot be undone.")) {
      tutorMessages = [];
      renderMessages();
      updateChart();
    }
  });

  clearMentorBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear the mentor conversation? This cannot be undone.")) {
      mentorMessages = [
        {
          id: 'welcome',
          role: 'model',
          content: "Greetings. I am your Cognitive Prep mentor. Begin interacting with the Tutor on the right. When you are ready for a systematic synthesis, select **Generate Recall Mastery**.",
          timestamp: Date.now()
        }
      ];
      renderMessages();
      updateChart();
    }
  });

  // Action Button
  generateMasteryBtn.addEventListener("click", () => {
    if (isMentorTyping) return;
    mentorInput.value = "I'm ready to review. Please analyze my current study session, summarize the topics, provide memory improving keywords, and give me the closed-eyes recall exercise.";
    sendMentorMessage();
  });

  // Fullscreen / Focus Mode
  focusModeBtn.addEventListener("click", toggleFocusMode);
}

// Fullscreen logic
async function toggleFocusMode() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      if ("Notification" in window && Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    }
  } catch (err) {
    console.error("Error attempting to toggle fullscreen:", err);
  }
}

// Markdown rendering helper
function renderMarkdown(content) {
  if (window.marked && typeof window.marked.parse === 'function') {
    return window.marked.parse(content);
  }
  // Fallback simple replacement if marked is somehow blocked
  return content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

// Render Messages UI
function renderMessages() {
  // Render Tutor Messages
  tutorMessagesDiv.innerHTML = "";
  if (tutorMessages.length === 0) {
    tutorMessagesDiv.innerHTML = '<div class="empty-state">Waiting to begin...</div>';
  } else {
    tutorMessages.forEach(msg => {
      const isUser = msg.role === 'user';
      const wrapper = document.createElement("div");
      wrapper.className = `message-wrapper ${isUser ? 'user' : 'model'}`;
      
      const bubble = document.createElement("div");
      bubble.className = "message-bubble prose";
      bubble.innerHTML = renderMarkdown(msg.content);
      
      wrapper.appendChild(bubble);
      tutorMessagesDiv.appendChild(wrapper);
    });
  }

  if (isTutorTyping) {
    const indicator = document.createElement("div");
    indicator.className = "typing-indicator";
    indicator.textContent = "Synthesizing...";
    tutorMessagesDiv.appendChild(indicator);
  }
  tutorMessagesDiv.scrollTop = tutorMessagesDiv.scrollHeight;

  // Render Mentor Messages
  mentorMessagesDiv.innerHTML = "";
  mentorMessages.forEach(msg => {
    const isUser = msg.role === 'user';
    const wrapper = document.createElement("div");
    wrapper.className = `message-wrapper ${isUser ? 'user' : 'model'}`;
    
    const bubble = document.createElement("div");
    bubble.className = "message-bubble prose";
    bubble.innerHTML = renderMarkdown(msg.content);
    
    wrapper.appendChild(bubble);
    mentorMessagesDiv.appendChild(wrapper);
  });

  if (isMentorTyping) {
    const indicator = document.createElement("div");
    indicator.className = "typing-indicator";
    indicator.textContent = "Synthesizing...";
    mentorMessagesDiv.appendChild(indicator);
  }
  mentorMessagesDiv.scrollTop = mentorMessagesDiv.scrollHeight;
}

// Send Tutor Message & Call API
async function sendTutorMessage() {
  if (isTutorTyping) return;
  const text = tutorInput.value.trim();
  if (!text) return;

  tutorInput.value = "";
  const userMsg = { id: generateId(), role: 'user', content: text, timestamp: Date.now() };
  tutorMessages.push(userMsg);
  renderMessages();
  updateChart();

  isTutorTyping = true;
  const modelMsgId = generateId();
  tutorMessages.push({ id: modelMsgId, role: 'model', content: '', timestamp: Date.now() });
  renderMessages();

  try {
    await callFreeAIStream(tutorMessages, TUTOR_SYSTEM_PROMPT, (chunkText) => {
      const idx = tutorMessages.findIndex(m => m.id === modelMsgId);
      if (idx !== -1) {
        tutorMessages[idx].content = chunkText;
        tutorMessages[idx].timestamp = Date.now();
        renderMessages();
      }
    });
  } catch (e) {
    console.error(e);
    const idx = tutorMessages.findIndex(m => m.id === modelMsgId);
    if (idx !== -1) {
      tutorMessages[idx].content = "Sorry, I ran into an error connecting to the AI engine. Please check your network connection.";
      renderMessages();
    }
  } finally {
    isTutorTyping = false;
    renderMessages();
    updateChart();
  }
}

// Send Mentor Message & Call API
async function sendMentorMessage() {
  if (isMentorTyping) return;
  const text = mentorInput.value.trim();
  if (!text) return;

  mentorInput.value = "";
  const userMsg = { id: generateId(), role: 'user', content: text, timestamp: Date.now() };
  mentorMessages.push(userMsg);
  renderMessages();
  updateChart();

  isMentorTyping = true;
  const modelMsgId = generateId();
  mentorMessages.push({ id: modelMsgId, role: 'model', content: '', timestamp: Date.now() });
  renderMessages();

  const tutorTranscript = tutorMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
  const mentorPrompt = MENTOR_SYSTEM_PROMPT_TEMPLATE(tutorTranscript);

  try {
    await callFreeAIStream(mentorMessages, mentorPrompt, (chunkText) => {
      const idx = mentorMessages.findIndex(m => m.id === modelMsgId);
      if (idx !== -1) {
        mentorMessages[idx].content = chunkText;
        mentorMessages[idx].timestamp = Date.now();
        renderMessages();
      }
    });
  } catch (e) {
    console.error(e);
    const idx = mentorMessages.findIndex(m => m.id === modelMsgId);
    if (idx !== -1) {
      mentorMessages[idx].content = "Sorry, I ran into an error connecting to the AI engine. Please check your network connection.";
      renderMessages();
    }
  } finally {
    isMentorTyping = false;
    renderMessages();
    updateChart();
  }
}

// Keyless Free AI Streaming Client (Pollinations AI)
async function callFreeAIStream(history, systemInstruction, onChunk) {
  const contents = history.map(msg => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    content: msg.content
  }));

  // Clean the messages to avoid sending empty contents
  const cleanedContents = contents.filter(c => c.content.trim() !== "");

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push(...cleanedContents);

  const response = await fetch('https://text.pollinations.ai/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: messages,
      stream: true,
      model: 'openai'
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error: ${response.status} - ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      if (trimmedLine.startsWith("data: ")) {
        const dataStr = trimmedLine.slice(6).trim();
        if (dataStr === "[DONE]") {
          continue;
        }
        try {
          const data = JSON.parse(dataStr);
          const text = data.choices?.[0]?.delta?.content || "";
          if (text) {
            fullText += text;
            onChunk(fullText);
          }
        } catch (e) {
          console.error("SSE parse error", e, dataStr);
        }
      }
    }
  }
}

// Speech Recognition Initialization
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("Speech Recognition not supported in this browser.");
    tutorMicBtn.style.display = "none";
    mentorMicBtn.style.display = "none";
    return;
  }

  recognitionTutor = new SpeechRecognition();
  recognitionTutor.continuous = false;
  recognitionTutor.interimResults = false;

  recognitionTutor.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    tutorInput.value = tutorInput.value ? tutorInput.value + ' ' + transcript : transcript;
  };
  recognitionTutor.onerror = () => { isListeningTutor = false; tutorMicBtn.classList.remove("recording"); };
  recognitionTutor.onend = () => { isListeningTutor = false; tutorMicBtn.classList.remove("recording"); };

  tutorMicBtn.addEventListener("click", () => {
    if (isListeningTutor) {
      recognitionTutor.stop();
    } else {
      recognitionTutor.start();
      isListeningTutor = true;
      tutorMicBtn.classList.add("recording");
    }
  });

  recognitionMentor = new SpeechRecognition();
  recognitionMentor.continuous = false;
  recognitionMentor.interimResults = false;

  recognitionMentor.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    mentorInput.value = mentorInput.value ? mentorInput.value + ' ' + transcript : transcript;
  };
  recognitionMentor.onerror = () => { isListeningMentor = false; mentorMicBtn.classList.remove("recording"); };
  recognitionMentor.onend = () => { isListeningMentor = false; mentorMicBtn.classList.remove("recording"); };

  mentorMicBtn.addEventListener("click", () => {
    if (isListeningMentor) {
      recognitionMentor.stop();
    } else {
      recognitionMentor.start();
      isListeningMentor = true;
      mentorMicBtn.classList.add("recording");
    }
  });
}

// Pomodoro Timer Logic
function initPomodoro() {
  const timerDisplay = document.getElementById("timer-display");
  const toggleBtn = document.getElementById("timer-toggle-btn");
  const resetBtn = document.getElementById("timer-reset-btn");
  const workModeBtn = document.getElementById("mode-work");
  const breakModeBtn = document.getElementById("mode-break");
  const progressLine = document.getElementById("pomodoro-progress");

  function playBeep() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
      console.error('Audio play failed', e);
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function updateTimerUI() {
    timerDisplay.textContent = formatTime(pomodoroTimeLeft);
    const maxDur = POMODORO_DURATIONS[pomodoroMode];
    const progress = 100 - (pomodoroTimeLeft / maxDur) * 100;
    progressLine.style.width = `${progress}%`;
    document.title = `${formatTime(pomodoroTimeLeft)} - ${pomodoroMode} | Cognitive Prep`;
  }

  function setMode(mode) {
    pomodoroMode = mode;
    pomodoroTimeLeft = POMODORO_DURATIONS[mode];
    pomodoroIsRunning = false;
    clearInterval(pomodoroInterval);
    toggleBtn.innerHTML = `<span class="icon">▶</span> PLAY`;

    workModeBtn.classList.toggle("active", mode === 'WORK');
    breakModeBtn.classList.toggle("active", mode === 'BREAK' || mode === 'LONG_BREAK');

    updateTimerUI();
  }

  function handleNext() {
    playBeep();
    if (pomodoroMode === 'WORK') {
      pomodoroCycles += 1;
      const nextMode = (pomodoroCycles % 4 === 0) ? 'LONG_BREAK' : 'BREAK';
      setMode(nextMode);
    } else {
      setMode('WORK');
    }
  }

  toggleBtn.addEventListener("click", () => {
    if (pomodoroIsRunning) {
      clearInterval(pomodoroInterval);
      pomodoroIsRunning = false;
      toggleBtn.innerHTML = `<span class="icon">▶</span> PLAY`;
    } else {
      pomodoroIsRunning = true;
      toggleBtn.innerHTML = `<span class="icon">■</span> PAUSE`;
      pomodoroInterval = setInterval(() => {
        if (pomodoroTimeLeft > 0) {
          pomodoroTimeLeft -= 1;
          updateTimerUI();
        } else {
          clearInterval(pomodoroInterval);
          handleNext();
        }
      }, 1000);
    }
  });

  resetBtn.addEventListener("click", () => {
    setMode(pomodoroMode);
  });

  workModeBtn.addEventListener("click", () => setMode('WORK'));
  breakModeBtn.addEventListener("click", () => setMode('BREAK'));

  updateTimerUI();
}

// Activity Chart Logic (Custom Responsive SVG)
function updateChart() {
  const chartContainer = document.getElementById("activity-chart");
  
  // Combine and sort messages
  const allMessages = [...tutorMessages, ...mentorMessages].filter(m => m.timestamp);
  allMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  if (allMessages.length === 0) {
    chartContainer.innerHTML = '<div class="chart-empty">Insufficient Data for Chart</div>';
    return;
  }

  // Create chart dataset
  let currentTutorCount = 0;
  let currentMentorCount = 0;
  
  const chartData = allMessages.map((msg, index) => {
    const isTutor = tutorMessages.some(t => t.id === msg.id);
    if (isTutor) currentTutorCount++;
    else currentMentorCount++;
    return {
      step: index + 1,
      total: currentTutorCount + currentMentorCount
    };
  });

  const dataset = [{ step: 0, total: 0 }, ...chartData];

  // Draw SVG
  const width = chartContainer.clientWidth || 300;
  const height = 80; // height of chart-container inside padding

  const maxVal = dataset[dataset.length - 1].total || 1;
  const maxStep = dataset.length - 1;

  // Generate path points
  let points = "";
  dataset.forEach((d, i) => {
    const x = (i / maxStep) * width;
    const y = height - (d.total / maxVal) * (height - 10) - 5; // 5px padding top/bottom
    points += `${x},${y} `;
  });

  // Area closing path
  const areaPoints = `${points} ${width},${height} 0,${height}`;

  chartContainer.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <!-- Fill Area -->
      <polygon points="${areaPoints}" fill="var(--color-accent)" opacity="0.15" />
      <!-- Line -->
      <polyline points="${points}" fill="none" stroke="var(--color-accent)" stroke-width="2" />
    </svg>
  `;
}

// Make sure the chart updates on resize
window.addEventListener("resize", updateChart);
