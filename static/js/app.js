/**
 * app.js - Police Complaint Documentation System
 * Client-Side Controller for Interactive 3-Column Police Station Writer Workspace
 * 
 * Features:
 *  1. Center Section 3-Part Vertical Architecture:
 *     - Part 1: Station Writer Credentials, Officer Digital Signature Pad & Visual Station Seal.
 *     - Part 2: Complainant Information Form with Aadhaar Privacy Masking.
 *     - Part 3: Conversational AI Agent & Voice Intake (Tamil ta-IN & English speech recognition,
 *       MediaRecorder continuous local audio storage, Case Type Identification, and Smart Writer Guidance).
 *  2. Conditional Display Logic for Right Section:
 *     - Right Section (Live Extraction, Crime Matrix, Editable Draft, PDF Export) is hidden by default.
 *     - Unhidden and smoothly revealed when 'FIND' or 'Send & Merge' is clicked.
 *  3. Dual HTML5 Canvas Digital Signature Pads (Writer Attestation & Complainant Verification).
 *  4. SQLite Persistent Storage & ReportLab PDF Export with Authenticated Audio Evidence.
 */

// Session Transcript Accumulation Buffer & Merged Complaint State
let accumulatedTranscript = "";
let currentComplaintData = null;
window.currentComplaintData = null;
let currentRecommendedSections = [];
window.currentRecommendedSections = currentRecommendedSections;

// Application State
const state = {
  currentRefId: null,
  accumulatedTranscript: "",
  currentComplaintData: null,
  extractedEntities: {},
  signatureBase64: "",        // Complainant Signature (PNG Base64)
  writerSignatureBase64: "",  // Writer/Officer Signature (PNG Base64)
  stationSealBase64: "",      // Station Seal Graphic / Custom Stamp
  isListening: false,
  speechRecognition: null,
  activeAiProvider: "Police Rule & Regex Engine",
  audioFiles: [],
  singleAudio: null,          // Single Continuous Audio Archive Metadata
  conversationHistory: [],
  rightSectionVisible: false,
  currentPhase: "A"           // Workflow phase: "A", "B", "C", "D"
};

// Continuous Audio Recording State
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let isIntakeSessionActive = false;
let sessionStartTime = null;
let sessionTimerInterval = null;
let currentSpeechTranscript = "";

// Canvas Signature Pad Instances
let writerCanvas, writerCtx, isWriterDrawing = false, writerHistory = [];
let complainantCanvas, complainantCtx, isComplainantDrawing = false, complainantHistory = [];


// ==========================================================================
// 1. INITIALIZATION & SETUP
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  initSystemClock();
  initStationWriterCredentials();
  initDualSignaturePads();
  initSpeechRecognition();
  initSystemStatus();
  initChatAgentWelcome();
  initIntakeSessionRef();
  bindUiEventListeners();

  // Check if URL has a record ID to load
  const urlParams = new URLSearchParams(window.location.search);
  const loadRef = urlParams.get("ref");
  if (loadRef) {
    loadComplaintIntoWorkspace(loadRef);
  }
});

function initSystemClock() {
  const clockEl = document.getElementById("systemClock");
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
    const timeStr = now.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
    clockEl.textContent = `📅 ${dateStr} • ⏰ ${timeStr}`;
  };
  update();
  setInterval(update, 1000);
}

async function initIntakeSessionRef() {
  if (state.currentRefId) return;
  try {
    const res = await fetch("/api/init-session");
    const json = await res.json();
    if (json.success && json.reference_id) {
      state.currentRefId = json.reference_id;
      const refBadge = document.getElementById("activeRefIdBadge");
      if (refBadge) refBadge.textContent = json.reference_id;
      const audioTarget = document.getElementById("singleAudioTargetBadge");
      if (audioTarget) audioTarget.textContent = `static/uploads/audio/${json.reference_id}.webm`;
    }
  } catch (err) {
    console.warn("Could not pre-fetch session reference ID:", err);
  }
}

function initStationWriterCredentials() {
  const savedWriterName = localStorage.getItem("police_writer_name") || "HC R. Balaji";
  const savedWriterId = localStorage.getItem("police_writer_id") || "HC-4029";

  const writerNameInput = document.getElementById("writerName");
  const writerIdInput = document.getElementById("writerId");

  if (writerNameInput && !writerNameInput.value) writerNameInput.value = savedWriterName;
  if (writerIdInput && !writerIdInput.value) writerIdInput.value = savedWriterId;

  if (writerNameInput) {
    writerNameInput.addEventListener("change", (e) => {
      localStorage.setItem("police_writer_name", e.target.value.trim());
      updateWriterBadge();
    });
  }
  if (writerIdInput) {
    writerIdInput.addEventListener("change", (e) => {
      localStorage.setItem("police_writer_id", e.target.value.trim());
      updateWriterBadge();
    });
  }
  updateWriterBadge();
}

function updateWriterBadge() {
  const writerBadgeEl = document.getElementById("activeWriterBadge");
  const writerName = document.getElementById("writerName")?.value || "Duty Officer";
  const writerId = document.getElementById("writerId")?.value || "STN-01";
  if (writerBadgeEl) {
    writerBadgeEl.textContent = `${writerName} (${writerId})`;
  }
}

async function initSystemStatus() {
  try {
    const res = await fetch("/api/system-status");
    const json = await res.json();
    if (json.success) {
      state.activeAiProvider = json.active_ai_engine;
      const aiBadge = document.getElementById("activeAiEngineBadge");
      if (aiBadge) aiBadge.textContent = json.active_ai_engine;
    }
  } catch (err) {
    console.warn("Could not query system status:", err);
  }
}

function initChatAgentWelcome() {
  const initTime = document.getElementById("agentInitTime");
  if (initTime) {
    const now = new Date();
    initTime.textContent = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
}


// ==========================================================================
// 2. PART 1: DUAL SIGNATURE PADS & STATION SEAL CONTROLS
// ==========================================================================

function initDualSignaturePads() {
  // 1. Writer Signature Pad
  writerCanvas = document.getElementById("writerSignatureCanvas");
  if (writerCanvas) {
    writerCtx = writerCanvas.getContext("2d");
    setupCanvasEvents(
      writerCanvas,
      writerCtx,
      () => isWriterDrawing,
      (val) => { isWriterDrawing = val; },
      writerHistory,
      syncWriterSignatureData
    );
    resizeCanvasElement(writerCanvas, writerCtx);
  }

  // 2. Complainant Signature Pad
  complainantCanvas = document.getElementById("complainantSignatureCanvas");
  if (complainantCanvas) {
    complainantCtx = complainantCanvas.getContext("2d");
    setupCanvasEvents(
      complainantCanvas,
      complainantCtx,
      () => isComplainantDrawing,
      (val) => { isComplainantDrawing = val; },
      complainantHistory,
      syncComplainantSignatureData
    );
    resizeCanvasElement(complainantCanvas, complainantCtx);
  }

  window.addEventListener("resize", () => {
    if (writerCanvas && writerCtx) resizeCanvasElement(writerCanvas, writerCtx);
    if (complainantCanvas && complainantCtx) resizeCanvasElement(complainantCanvas, complainantCtx);
  });
}

function setupCanvasEvents(cv, context, getDrawing, setDrawing, historyArr, syncCallback) {
  cv.style.touchAction = "none";
  context.strokeStyle = "#0f172a";
  context.lineWidth = 2.5;
  context.lineCap = "round";
  context.lineJoin = "round";

  const getPos = (e) => {
    const rect = cv.getBoundingClientRect();
    const scaleX = rect.width > 0 ? cv.width / rect.width : 1;
    const scaleY = rect.height > 0 ? cv.height / rect.height : 1;
    let clientX = 0, clientY = 0;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDraw = (e) => {
    if (e.type.startsWith("touch")) e.preventDefault();
    if (cv.width === 0 || cv.height === 0) {
      resizeCanvasElement(cv, context);
    }
    setDrawing(true);
    if (cv.width > 0 && cv.height > 0) {
      try {
        historyArr.push(context.getImageData(0, 0, cv.width, cv.height));
        if (historyArr.length > 25) historyArr.shift();
      } catch (err) {}
    }
    const pos = getPos(e);
    context.beginPath();
    context.moveTo(pos.x, pos.y);
  };

  const drawMove = (e) => {
    if (!getDrawing()) return;
    if (e.type.startsWith("touch")) e.preventDefault();
    const pos = getPos(e);
    context.lineTo(pos.x, pos.y);
    context.stroke();
  };

  const stopDraw = (e) => {
    if (getDrawing()) {
      if (e && e.type.startsWith("touch")) e.preventDefault();
      setDrawing(false);
      context.closePath();
      syncCallback();
    }
  };

  // Mouse Events
  cv.addEventListener("mousedown", startDraw);
  cv.addEventListener("mousemove", drawMove);
  cv.addEventListener("mouseup", stopDraw);
  cv.addEventListener("mouseleave", stopDraw);
  cv.addEventListener("mouseout", stopDraw);

  // Touch Events (passive: false is essential for preventDefault)
  cv.addEventListener("touchstart", startDraw, { passive: false });
  cv.addEventListener("touchmove", drawMove, { passive: false });
  cv.addEventListener("touchend", stopDraw, { passive: false });
  cv.addEventListener("touchcancel", stopDraw, { passive: false });
}

function resizeCanvasElement(cv, context) {
  if (!cv || !context) return;
  const rect = cv.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  // Preserve existing drawing if canvas already has content
  let tempCanvas = null;
  if (cv.width > 0 && cv.height > 0 && !isCanvasBlank(cv)) {
    tempCanvas = document.createElement("canvas");
    tempCanvas.width = cv.width;
    tempCanvas.height = cv.height;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(cv, 0, 0);
  }

  cv.width = Math.round(rect.width);
  cv.height = Math.round(rect.height);

  context.strokeStyle = "#0f172a";
  context.lineWidth = 2.5;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (tempCanvas) {
    context.drawImage(tempCanvas, 0, 0, cv.width, cv.height);
  }
}

function isCanvasBlank(cv) {
  if (!cv || cv.width === 0 || cv.height === 0) return true;
  const ctx = cv.getContext("2d");
  const pixelBuffer = new Uint32Array(
    ctx.getImageData(0, 0, cv.width, cv.height).data.buffer
  );
  return !pixelBuffer.some((color) => color !== 0);
}

function clearWriterSignature() {
  if (!writerCanvas || !writerCtx) return;
  writerCtx.clearRect(0, 0, writerCanvas.width, writerCanvas.height);
  writerHistory = [];
  state.writerSignatureBase64 = "";
  const status = document.getElementById("writerCanvasStatus");
  if (status) status.textContent = "Writer signature cleared";
}

function undoWriterSignature() {
  if (!writerCanvas || !writerCtx || writerHistory.length === 0) return;
  const prevState = writerHistory.pop();
  writerCtx.putImageData(prevState, 0, 0);
  syncWriterSignatureData();
  const status = document.getElementById("writerCanvasStatus");
  if (status) status.textContent = "Last stroke undone";
}

function syncWriterSignatureData() {
  if (!writerCanvas) return;
  if (isCanvasBlank(writerCanvas)) {
    state.writerSignatureBase64 = "";
    return;
  }
  state.writerSignatureBase64 = writerCanvas.toDataURL("image/png");
  const status = document.getElementById("writerCanvasStatus");
  if (status) status.textContent = "✓ Writer Digital Signature Recorded";
}

function clearComplainantSignature() {
  if (!complainantCanvas || !complainantCtx) return;
  complainantCtx.clearRect(0, 0, complainantCanvas.width, complainantCanvas.height);
  complainantHistory = [];
  state.signatureBase64 = "";

  const thumb = document.getElementById("sigPreviewThumb");
  if (thumb) {
    thumb.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='90' height='40'><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='10'>No Signature</text></svg>";
  }
  const status = document.getElementById("complainantCanvasStatus");
  if (status) status.textContent = "Complainant signature cleared";
}

function undoComplainantSignature() {
  if (!complainantCanvas || !complainantCtx || complainantHistory.length === 0) return;
  const prevState = complainantHistory.pop();
  complainantCtx.putImageData(prevState, 0, 0);
  syncComplainantSignatureData();
  const status = document.getElementById("complainantCanvasStatus");
  if (status) status.textContent = "Last stroke undone";
}

function syncComplainantSignatureData() {
  if (!complainantCanvas) return;
  if (isCanvasBlank(complainantCanvas)) {
    state.signatureBase64 = "";
    const thumb = document.getElementById("sigPreviewThumb");
    if (thumb) {
      thumb.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='90' height='40'><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='10'>No Signature</text></svg>";
    }
    return;
  }
  state.signatureBase64 = complainantCanvas.toDataURL("image/png");

  const thumb = document.getElementById("sigPreviewThumb");
  if (thumb) thumb.src = state.signatureBase64;

  const status = document.getElementById("complainantCanvasStatus");
  if (status) status.textContent = "✓ Complainant Digital Signature Recorded";
}

function handleSealUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    state.stationSealBase64 = e.target.result;
    const previewBox = document.getElementById("sealEmblemPreview");
    if (previewBox) {
      previewBox.innerHTML = `
        <img src="${e.target.result}" style="max-height: 60px; max-width: 90px; border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.2);" />
        <div class="seal-title-text" style="margin-top: 3px;">CUSTOM SEAL STAMP</div>
      `;
    }
    const badge = document.getElementById("sealBadgeStatus");
    if (badge) badge.textContent = "✓ Custom Station Seal Verified";
    showToast("Custom police station seal uploaded and verified.", "success");
  };
  reader.readAsDataURL(file);
}


// ==========================================================================
// 3. PART 2: COMPLAINANT FORM & AADHAAR PRIVACY MASKING
// ==========================================================================

function formatAadhaarInput(input) {
  if (!input) return;
  let digits = input.value.replace(/\D/g, "");
  if (digits.length > 12) digits = digits.substring(0, 12);

  let formatted = "";
  if (digits.length <= 4) {
    formatted = digits;
  } else if (digits.length <= 8) {
    formatted = "XXXX-" + digits.substring(4);
  } else {
    formatted = "XXXX-XXXX-" + digits.substring(8);
  }

  input.value = formatted;

  const maskTag = document.getElementById("aadhaarMaskTag");
  if (maskTag) {
    if (digits.length === 12) {
      maskTag.textContent = "✓ Masked (Aadhaar Act 2016)";
      maskTag.style.color = "#16a34a";
    } else {
      maskTag.textContent = "Aadhaar Redacted";
      maskTag.style.color = "#475569";
    }
  }
}


// ==========================================================================
// 4. PART 3: CONTINUOUS START-TO-STOP AUDIO RECORDING & LIVE STREAM
// ==========================================================================

function initSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceStatus = document.getElementById("voiceStatus");

  if (!SpeechRec) {
    if (voiceStatus) {
      voiceStatus.innerHTML = "<font color='#dc2626'>⚠ Speech Recognition not supported in this browser. Media recording will still capture the audio archive.</font>";
    }
    return;
  }

  state.speechRecognition = new SpeechRec();
  state.speechRecognition.continuous = true;
  state.speechRecognition.interimResults = true;

  const langSelect = document.getElementById("voiceLanguage");
  state.speechRecognition.lang = langSelect ? langSelect.value : "ta-IN";

  if (langSelect) {
    langSelect.addEventListener("change", (e) => {
      if (state.speechRecognition) {
        state.speechRecognition.lang = e.target.value;
      }
    });
  }

  state.speechRecognition.onresult = (event) => {
    let interimTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        const finalChunk = event.results[i][0].transcript.trim();
        if (finalChunk) {
          if (accumulatedTranscript) {
            if (!accumulatedTranscript.endsWith(finalChunk)) {
              accumulatedTranscript += " " + finalChunk;
            }
          } else {
            accumulatedTranscript = finalChunk;
          }
          state.accumulatedTranscript = accumulatedTranscript;
        }
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    const liveText = (accumulatedTranscript + (interimTranscript ? (" " + interimTranscript) : "")).trim();
    const chatInput = document.getElementById("chatStatementInput");
    if (chatInput && liveText) {
      chatInput.value = liveText;
      chatInput.scrollTop = chatInput.scrollHeight;
    }

    if (voiceStatus && liveText) {
      voiceStatus.innerHTML = `<i>🔴 Transcribing live: "${escapeHtml(liveText.slice(-80))}"</i>`;
    }
  };

  state.speechRecognition.onend = () => {
    if (isIntakeSessionActive) {
      try {
        state.speechRecognition.start();
      } catch (err) {
        setTimeout(() => {
          if (isIntakeSessionActive && state.speechRecognition) {
            try {
              state.speechRecognition.start();
            } catch (e) {}
          }
        }, 300);
      }
    }
  };

  state.speechRecognition.onerror = (event) => {
    console.warn("Speech recognition notice:", event.error);
    if (voiceStatus && event.error !== "no-speech") {
      voiceStatus.innerHTML = `Voice status: ${escapeHtml(event.error)}. Audio recording remains active.`;
    }
    if (isIntakeSessionActive && (event.error === "aborted" || event.error === "network")) {
      setTimeout(() => {
        if (isIntakeSessionActive && state.speechRecognition) {
          try {
            state.speechRecognition.start();
          } catch (e) {}
        }
      }, 500);
    }
  };
}

async function startContinuousRecording() {
  const voiceStatus = document.getElementById("voiceStatus");
  const btnStart = document.getElementById("btnStartRecord");
  const btnStop = document.getElementById("btnStopRecord");
  const recIndicator = document.getElementById("recPulseIndicator");
  const recStatusText = document.getElementById("recStatusText");
  const timerDisplay = document.getElementById("recTimerDisplay");

  try {
    if (!state.currentRefId) {
      await initIntakeSessionRef();
    }
    const refId = state.currentRefId || "POL-DRAFT";
    const audioTargetBadge = document.getElementById("singleAudioTargetBadge");
    if (audioTargetBadge) {
      audioTargetBadge.textContent = `static/uploads/audio/${refId}.webm`;
    }

    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioChunks = [];
    currentSpeechTranscript = "";

    const chatInput = document.getElementById("chatStatementInput");
    if (chatInput && chatInput.value.trim() && !accumulatedTranscript) {
      accumulatedTranscript = chatInput.value.trim();
    }
    state.accumulatedTranscript = accumulatedTranscript;

    let mimeType = "audio/webm;codecs=opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
    }

    mediaRecorder = new MediaRecorder(audioStream, { mimeType });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.start(250);
    isIntakeSessionActive = true;

    if (state.speechRecognition) {
      try {
        const langSelect = document.getElementById("voiceLanguage");
        if (langSelect) state.speechRecognition.lang = langSelect.value;
        state.speechRecognition.start();
      } catch (e) {}
    }

    sessionStartTime = Date.now();
    if (timerDisplay) timerDisplay.textContent = "00:00";
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - sessionStartTime) / 1000);
      const m = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
      const s = String(elapsedSec % 60).padStart(2, "0");
      if (timerDisplay) timerDisplay.textContent = `${m}:${s}`;
    }, 1000);

    if (btnStart) btnStart.disabled = true;
    if (btnStop) {
      btnStop.disabled = false;
      btnStop.classList.add("recording-active");
    }

    if (recIndicator) {
      recIndicator.classList.remove("idle");
      recIndicator.classList.add("recording");
    }
    if (recStatusText) recStatusText.textContent = "Recording Active (Continuous)";

    const langName = document.getElementById("voiceLanguage")?.value.startsWith("ta") ? "Tamil (தமிழ்)" : "English";
    if (voiceStatus) {
      voiceStatus.innerHTML = `<b>🔴 Continuous audio recording in progress in ${langName}.</b> Archiving to <code>${refId}.webm</code>. Click <strong>'FIND'</strong> at any moment!`;
    }

    showToast("Continuous audio recording started. No automated pauses.", "info");

  } catch (err) {
    console.error("Continuous Recording Error:", err);
    showToast(`Microphone Error: ${err.message}`, "error");
    if (voiceStatus) {
      voiceStatus.innerHTML = `<font color='#dc2626'>❌ Microphone Error: ${escapeHtml(err.message)}. Please permit microphone access.</font>`;
    }
  }
}

async function stopContinuousRecording() {
  if (!isIntakeSessionActive) return;

  const voiceStatus = document.getElementById("voiceStatus");
  const btnStart = document.getElementById("btnStartRecord");
  const btnStop = document.getElementById("btnStopRecord");
  const recIndicator = document.getElementById("recPulseIndicator");
  const recStatusText = document.getElementById("recStatusText");

  const elapsedSec = Math.max(1, Math.floor((Date.now() - sessionStartTime) / 1000));
  const m = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const s = String(elapsedSec % 60).padStart(2, "0");
  const durationStr = `${m}:${s}`;

  clearInterval(sessionTimerInterval);
  isIntakeSessionActive = false;

  if (btnStart) btnStart.disabled = false;
  if (btnStop) {
    btnStop.disabled = true;
    btnStop.classList.remove("recording-active");
  }

  if (recIndicator) {
    recIndicator.classList.remove("recording");
    recIndicator.classList.add("idle");
  }
  if (recStatusText) recStatusText.textContent = "Finalized";

  if (voiceStatus) {
    voiceStatus.innerHTML = "⏹ Finalizing single continuous audio file and saving to server...";
  }

  if (state.speechRecognition) {
    try {
      state.speechRecognition.stop();
    } catch (e) {}
  }

  return new Promise((resolve) => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.onstop = async () => {
        if (audioStream) {
          audioStream.getTracks().forEach((track) => track.stop());
          audioStream = null;
        }

        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        await uploadSingleContinuousAudio(audioBlob, durationStr);
        resolve();
      };
      mediaRecorder.stop();
    } else {
      resolve();
    }
  });
}

async function uploadSingleContinuousAudio(audioBlob, durationStr) {
  const voiceStatus = document.getElementById("voiceStatus");
  const refId = state.currentRefId || "POL-DRAFT";

  try {
    showToast(`Archiving master audio to static/uploads/audio/${refId}.webm...`, "info");

    const formData = new FormData();
    formData.append("audio", audioBlob, `${refId}.webm`);
    formData.append("reference_id", refId);
    formData.append("duration", durationStr);
    formData.append("vad_stats", "Continuous Start-to-Stop Audio Archiving");

    const uploadRes = await fetch("/api/upload-audio", {
      method: "POST",
      body: formData
    });

    const uploadJson = await uploadRes.json();
    if (!uploadJson.success) {
      throw new Error(uploadJson.error || "Failed to upload continuous audio session");
    }

    const audioMeta = {
      filename: uploadJson.filename,
      audio_url: uploadJson.audio_url,
      timestamp: uploadJson.timestamp,
      duration: durationStr,
      vad_stats: uploadJson.vad_stats
    };

    state.singleAudio = audioMeta;
    state.audioFiles = [audioMeta];

    if (voiceStatus) {
      voiceStatus.innerHTML = `✓ Master Continuous Audio Archived: <code>${audioMeta.filename}</code> (${durationStr}).`;
    }

    const audioTargetBadge = document.getElementById("singleAudioTargetBadge");
    if (audioTargetBadge) {
      audioTargetBadge.textContent = audioMeta.audio_url;
    }

  } catch (err) {
    console.error("Audio Upload Error:", err);
    showToast(`Audio Archive Error: ${err.message}`, "error");
    if (voiceStatus) {
      voiceStatus.innerHTML = `<font color='#dc2626'>⚠ Audio Upload Notice: ${escapeHtml(err.message)}. Text transcript is preserved.</font>`;
    }
  }
}

function clearTranscriptStream() {
  const chatInput = document.getElementById("chatStatementInput");
  if (chatInput) chatInput.value = "";
  accumulatedTranscript = "";
  state.accumulatedTranscript = "";
  currentSpeechTranscript = "";
  showToast("Live transcription text cleared.", "info");
}

function applyWriterIntroFormula() {
  const writerName = document.getElementById("writerName")?.value.trim() || "Duty Officer";
  const writerId = document.getElementById("writerId")?.value.trim() || "STN-01";
  const complainantName = document.getElementById("complainantName")?.value.trim() || "Citizen";
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const introText = `[Officer Oral Registration]: I am Officer ${writerName}, Station Duty Writer Badge ID ${writerId}. Recording Community Service Register (CSR) complaint for complainant ${complainantName} on ${dateStr} at ${timeStr}. Narrative: `;

  const chatInput = document.getElementById("chatStatementInput");
  if (chatInput) {
    if (accumulatedTranscript) {
      accumulatedTranscript = introText + "\n" + accumulatedTranscript;
    } else {
      accumulatedTranscript = introText;
    }
    state.accumulatedTranscript = accumulatedTranscript;
    chatInput.value = accumulatedTranscript;
    chatInput.focus();
    chatInput.scrollTop = chatInput.scrollHeight;
  }

  showToast("Station Writer Oral Registration intro loaded.", "info");
}


// ==========================================================================
// 5. THE INTERACTIVE 'FIND' BUTTON MECHANISM & REVIEWS
// ==========================================================================

async function triggerFindAnalysis() {
  const btnFind = document.getElementById("btnFind");
  const chatInput = document.getElementById("chatStatementInput");
  const currentInputValue = chatInput ? chatInput.value.trim() : "";

  // Synchronize manual text edits or typed additions into accumulatedTranscript
  if (currentInputValue) {
    if (!accumulatedTranscript) {
      accumulatedTranscript = currentInputValue;
    } else if (!accumulatedTranscript.includes(currentInputValue)) {
      if (currentInputValue.includes(accumulatedTranscript)) {
        accumulatedTranscript = currentInputValue;
      } else {
        accumulatedTranscript = `${accumulatedTranscript}\n${currentInputValue}`.trim();
      }
    }
  }
  state.accumulatedTranscript = accumulatedTranscript;

  let textToAnalyze = accumulatedTranscript;
  if (!textToAnalyze && state.audioFiles && state.audioFiles.length > 0) {
    textToAnalyze = "Citizen statement recorded via microphone.";
  }

  if (!textToAnalyze) {
    showToast("Please speak or type statement details first before clicking FIND.", "error");
    if (chatInput) chatInput.focus();
    return;
  }

  if (btnFind && btnFind.disabled) return;
  const originalBtnHtml = btnFind ? btnFind.innerHTML : "";
  if (btnFind) {
    btnFind.disabled = true;
    btnFind.innerHTML = `
      <span class="find-icon">⏳</span>
      <div class="find-text-group">
        <span class="find-main-label">ANALYZING SPEECH...</span>
        <span class="find-sub-label">Extracting entities &amp; generating follow-up questions</span>
      </div>
      <span class="find-badge">Processing</span>
    `;
  }

  const writerName = document.getElementById("writerName")?.value.trim() || "Duty Officer";
  const writerId = document.getElementById("writerId")?.value.trim() || "STN-01";
  const complainantName = document.getElementById("complainantName")?.value.trim() || "Citizen";
  const fatherName = document.getElementById("fatherName")?.value.trim() || "";
  const contactNumber = document.getElementById("contactNumber")?.value.trim() || "";
  const residentialAddress = document.getElementById("residentialAddress")?.value.trim() || "";
  const aadhaarNumber = document.getElementById("aadhaarNumber")?.value.trim() || "";

  // Immediately UNHIDE Right Section on click!
  unhideRightSection();

  const draftArea = document.getElementById("complaintDraft");
  if (draftArea && (!draftArea.value || draftArea.value.trim() === "")) {
    draftArea.value = "🔍 FINDING FACTS with 0% Hallucination Dual-LLM...\nExtracting incident parameters & formulating legal complaint draft...\nPlease wait a moment...";
  }

  showTypingIndicator(true);

  try {
    showToast("🔍 FIND active: Extracting facts & formulating follow-up questions...", "info");

    const response = await fetch("/api/process-statement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accumulated_transcript: accumulatedTranscript,
        raw_transcript: accumulatedTranscript,
        statement: accumulatedTranscript,
        writer_name: writerName,
        writer_id: writerId,
        complainant_name: complainantName,
        father_name: fatherName,
        contact_number: contactNumber,
        residential_address: residentialAddress,
        govt_id_masked: aadhaarNumber
      })
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error || "Extraction failed");

    const data = result.data;
    if (data.raw_transcript && data.raw_transcript.length >= accumulatedTranscript.length) {
      accumulatedTranscript = data.raw_transcript;
    }
    state.accumulatedTranscript = accumulatedTranscript;

    // Merge State
    if (!currentComplaintData) {
      currentComplaintData = {
        ...data,
        recommended_sections: data.recommended_sections || []
      };
    } else {
      currentComplaintData = {
        ...currentComplaintData,
        case_type: (data.case_type && data.case_type !== "Not mentioned") ? data.case_type : currentComplaintData.case_type,
        incident_type: (data.incident_type && data.incident_type !== "Not mentioned") ? data.incident_type : currentComplaintData.incident_type,
        date: (data.date && data.date !== "Not mentioned") ? data.date : currentComplaintData.date,
        time: (data.time && data.time !== "Not mentioned") ? data.time : currentComplaintData.time,
        location: (data.location && data.location !== "Not mentioned") ? data.location : currentComplaintData.location,
        object_property: (data.object_property && data.object_property !== "Not mentioned") 
          ? (currentComplaintData.object_property && currentComplaintData.object_property !== "Not mentioned" && !currentComplaintData.object_property.includes(data.object_property)
              ? `${currentComplaintData.object_property}, ${data.object_property}` 
              : data.object_property)
          : currentComplaintData.object_property,
        suspect_person: (data.suspect_person && data.suspect_person !== "Not mentioned") ? data.suspect_person : currentComplaintData.suspect_person,
        person_description: (data.person_description && data.person_description !== "Not mentioned") ? data.person_description : currentComplaintData.person_description,
        synopsis: data.synopsis || currentComplaintData.synopsis,
        agent_guidance: data.agent_guidance || currentComplaintData.agent_guidance,
        recommended_sections: (data.recommended_sections && data.recommended_sections.length > 0)
          ? data.recommended_sections
          : (currentComplaintData.recommended_sections || []),
        missing_critical_info: data.missing_critical_info || [],
        formal_complaint_draft: data.formal_complaint_draft || currentComplaintData.formal_complaint_draft,
        ai_provider: data.ai_provider || currentComplaintData.ai_provider,
        raw_transcript: accumulatedTranscript
      };
    }

    state.extractedEntities = currentComplaintData;
    state.currentComplaintData = currentComplaintData;
    window.currentComplaintData = currentComplaintData;

    // Refresh complainant profile in Part 2 if returned from backend
    if (data.complainant_name && data.complainant_name !== "Citizen") {
      const cNameInput = document.getElementById("complainantName");
      if (cNameInput && (!cNameInput.value || cNameInput.value === "Citizen")) cNameInput.value = data.complainant_name;
    }
    if (data.father_name) {
      const fNameInput = document.getElementById("fatherName");
      if (fNameInput && !fNameInput.value) fNameInput.value = data.father_name;
    }
    if (data.contact_number) {
      const cNumInput = document.getElementById("contactNumber");
      if (cNumInput && !cNumInput.value) cNumInput.value = data.contact_number;
    }
    if (data.residential_address) {
      const addrInput = document.getElementById("residentialAddress");
      if (addrInput && !addrInput.value) addrInput.value = data.residential_address;
    }
    if (data.govt_id_masked) {
      const aadhaarInput = document.getElementById("aadhaarNumber");
      if (aadhaarInput && !aadhaarInput.value) aadhaarInput.value = data.govt_id_masked;
    }

    unhideRightSection();
    renderExtractedEntities(currentComplaintData);
    updateCaseTypeHeader(currentComplaintData.case_type || currentComplaintData.incident_type);
    appendChatAgentTurn(currentComplaintData);
    renderMissingQuestions(currentComplaintData.missing_critical_info || []);
    renderDynamicRecommendedSections(currentComplaintData.recommended_sections || []);

    if (draftArea && currentComplaintData.formal_complaint_draft) {
      draftArea.value = currentComplaintData.formal_complaint_draft;
      draftArea.scrollTop = 0;
    }

    if (currentComplaintData.ai_provider) {
      const aiBadge = document.getElementById("activeAiEngineBadge");
      if (aiBadge) aiBadge.textContent = currentComplaintData.ai_provider;
    }

    showToast("✓ FIND complete! Entities merged & updated questions ready.", "success");

  } catch (err) {
    console.error("FIND Error:", err);
    showToast(`FIND Error: ${err.message}`, "error");
    if (draftArea && draftArea.value.includes("FINDING FACTS")) {
      draftArea.value = `[Notice: Extraction encountered an issue: ${escapeHtml(err.message)}. You may type the draft directly here.]`;
    }
  } finally {
    showTypingIndicator(false);
    if (btnFind) {
      btnFind.disabled = false;
      btnFind.innerHTML = originalBtnHtml || `
        <span class="find-icon">🔍</span>
        <div class="find-text-group">
          <span class="find-main-label">FIND</span>
          <span class="find-sub-label">Extract Entities &amp; Missing Questions (0% Hallucination)</span>
        </div>
        <span class="find-badge">Instant AI Parse</span>
      `;
    }
  }
}

function handleChatInputKeyDown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    triggerFindAnalysis();
  }
}

function clearChatInput() {
  const chatInput = document.getElementById("chatStatementInput");
  if (chatInput) chatInput.value = "";
  accumulatedTranscript = "";
  state.accumulatedTranscript = "";
  currentSpeechTranscript = "";
  showToast("Live transcription buffer cleared.", "info");
}

async function triggerSendAndMerge() {
  const btnSend = document.getElementById("btnSendMerge");
  const chatInput = document.getElementById("chatStatementInput");
  let currentInputValue = chatInput ? chatInput.value.trim() : "";

  if (isIntakeSessionActive) {
    showToast("Finalizing continuous recording session audio...", "info");
    await stopContinuousRecording();
  }

  if (currentInputValue) {
    if (!accumulatedTranscript) {
      accumulatedTranscript = currentInputValue;
    } else if (!accumulatedTranscript.includes(currentInputValue)) {
      accumulatedTranscript = `${accumulatedTranscript}\n${currentInputValue}`.trim();
    }
  }
  state.accumulatedTranscript = accumulatedTranscript;

  let textToAnalyze = accumulatedTranscript;
  if (!textToAnalyze && state.audioFiles && state.audioFiles.length > 0) {
    textToAnalyze = "Citizen statement recorded via continuous audio session.";
  }

  if (!textToAnalyze) {
    showToast("Please enter or record citizen statement before finalizing.", "error");
    if (chatInput) chatInput.focus();
    return;
  }

  if (btnSend && btnSend.disabled) return;
  const originalBtnHtml = btnSend ? btnSend.innerHTML : "";
  if (btnSend) {
    btnSend.disabled = true;
    btnSend.innerHTML = `<span>⏳</span> <strong>Finalizing Draft...</strong>`;
  }

  const writerName = document.getElementById("writerName")?.value.trim() || "Duty Officer";
  const writerId = document.getElementById("writerId")?.value.trim() || "STN-01";
  const complainantName = document.getElementById("complainantName")?.value.trim() || "Citizen";
  const fatherName = document.getElementById("fatherName")?.value.trim() || "";
  const contactNumber = document.getElementById("contactNumber")?.value.trim() || "";
  const residentialAddress = document.getElementById("residentialAddress")?.value.trim() || "";
  const aadhaarNumber = document.getElementById("aadhaarNumber")?.value.trim() || "";

  unhideRightSection();

  const draftArea = document.getElementById("complaintDraft");
  if (draftArea && (!draftArea.value || draftArea.value.trim() === "")) {
    draftArea.value = "⚡ Finalizing statement with 0% Hallucination Dual-LLM...\nFormulating structured Indian Police CSR complaint draft...\nPlease wait a moment...";
  }

  showTypingIndicator(true);

  try {
    showToast("Finalizing statement with 0% Hallucination Dual-LLM...", "info");

    const response = await fetch("/api/process-statement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accumulated_transcript: accumulatedTranscript,
        raw_transcript: accumulatedTranscript,
        statement: accumulatedTranscript,
        writer_name: writerName,
        writer_id: writerId,
        complainant_name: complainantName,
        father_name: fatherName,
        contact_number: contactNumber,
        residential_address: residentialAddress,
        govt_id_masked: aadhaarNumber
      })
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error || "Analysis failed");

    const data = result.data;
    if (data.raw_transcript && data.raw_transcript.length >= accumulatedTranscript.length) {
      accumulatedTranscript = data.raw_transcript;
    }
    state.accumulatedTranscript = accumulatedTranscript;

    if (!currentComplaintData) {
      currentComplaintData = {
        ...data,
        recommended_sections: data.recommended_sections || []
      };
    } else {
      currentComplaintData = {
        ...currentComplaintData,
        case_type: (data.case_type && data.case_type !== "Not mentioned") ? data.case_type : currentComplaintData.case_type,
        incident_type: (data.incident_type && data.incident_type !== "Not mentioned") ? data.incident_type : currentComplaintData.incident_type,
        date: (data.date && data.date !== "Not mentioned") ? data.date : currentComplaintData.date,
        time: (data.time && data.time !== "Not mentioned") ? data.time : currentComplaintData.time,
        location: (data.location && data.location !== "Not mentioned") ? data.location : currentComplaintData.location,
        object_property: (data.object_property && data.object_property !== "Not mentioned") ? data.object_property : currentComplaintData.object_property,
        suspect_person: (data.suspect_person && data.suspect_person !== "Not mentioned") ? data.suspect_person : currentComplaintData.suspect_person,
        person_description: (data.person_description && data.person_description !== "Not mentioned") ? data.person_description : currentComplaintData.person_description,
        synopsis: data.synopsis || currentComplaintData.synopsis,
        agent_guidance: data.agent_guidance || currentComplaintData.agent_guidance,
        recommended_sections: (data.recommended_sections && data.recommended_sections.length > 0)
          ? data.recommended_sections
          : (currentComplaintData.recommended_sections || []),
        missing_critical_info: data.missing_critical_info || [],
        formal_complaint_draft: data.formal_complaint_draft || currentComplaintData.formal_complaint_draft,
        ai_provider: data.ai_provider || currentComplaintData.ai_provider,
        raw_transcript: accumulatedTranscript
      };
    }

    state.extractedEntities = currentComplaintData;
    state.currentComplaintData = currentComplaintData;
    window.currentComplaintData = currentComplaintData;

    unhideRightSection();
    updateCaseTypeHeader(currentComplaintData.case_type || currentComplaintData.incident_type);
    appendChatAgentTurn(currentComplaintData);
    renderExtractedEntities(currentComplaintData);
    renderMissingQuestions(currentComplaintData.missing_critical_info || []);
    renderDynamicRecommendedSections(currentComplaintData.recommended_sections || []);

    if (draftArea && currentComplaintData.formal_complaint_draft) {
      draftArea.value = currentComplaintData.formal_complaint_draft;
      draftArea.scrollTop = 0;
    }

    if (currentComplaintData.ai_provider) {
      const aiBadge = document.getElementById("activeAiEngineBadge");
      if (aiBadge) aiBadge.textContent = currentComplaintData.ai_provider;
    }

    showToast("✓ Legal Complaint Draft generated! Ready for signing & saving.", "success");

  } catch (err) {
    console.error("Finalize Error:", err);
    showToast(`Finalize Error: ${err.message}`, "error");
    if (draftArea && draftArea.value.includes("Finalizing statement")) {
      draftArea.value = `[Notice: Extraction encountered an issue: ${escapeHtml(err.message)}. You may type the draft directly here.]`;
    }
  } finally {
    showTypingIndicator(false);
    if (btnSend) {
      btnSend.disabled = false;
      btnSend.innerHTML = originalBtnHtml || `
        <span class="btn-icon">⚡</span>
        <strong>Send & Merge / Finalize Draft</strong>
      `;
    }
  }
}

function unhideRightSection() {
  const rightSec = document.getElementById("rightReviewSection");
  const mainGrid = document.getElementById("mainGridContainer");

  if (rightSec) {
    rightSec.style.display = "block";
    rightSec.classList.remove("hidden");
  }

  if (mainGrid) {
    mainGrid.classList.remove("right-hidden");
    mainGrid.classList.add("right-active");
  }

  state.rightSectionVisible = true;

  // Re-calculate complainant signature canvas width once visible
  setTimeout(() => {
    if (complainantCanvas && complainantCtx) {
      resizeCanvasElement(complainantCanvas, complainantCtx);
    }
  }, 100);
}

function hideRightSection() {
  const rightSec = document.getElementById("rightReviewSection");
  const mainGrid = document.getElementById("mainGridContainer");

  if (rightSec) {
    rightSec.style.display = "none";
    rightSec.classList.add("hidden");
  }

  if (mainGrid) {
    mainGrid.classList.add("right-hidden");
    mainGrid.classList.remove("right-active");
  }

  state.rightSectionVisible = false;
}

function updateCaseTypeHeader(caseType) {
  const badge = document.getElementById("caseTypeHeaderBadge");
  const label = document.getElementById("caseTypeHeaderLabel");
  if (!badge || !label) return;

  if (!caseType || caseType === "Not mentioned") {
    badge.style.display = "none";
    return;
  }

  badge.style.display = "inline-flex";
  label.textContent = caseType.toUpperCase();
}

function showTypingIndicator(show) {
  const indicator = document.getElementById("agentTypingIndicator");
  const chatThread = document.getElementById("agentChatThread");
  if (indicator) {
    indicator.style.display = show ? "flex" : "none";
    if (show && chatThread) {
      chatThread.scrollTop = chatThread.scrollHeight;
    }
  }
}

function appendChatComplainantTurn(text, audioUrl = null) {
  const chatThread = document.getElementById("agentChatThread");
  if (!chatThread) return;

  const row = document.createElement("div");
  row.className = "chat-bubble-row citizen-row";

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  let audioHtml = "";
  if (audioUrl) {
    audioHtml = `
      <div class="chat-audio-player">
        <audio controls src="${audioUrl}"></audio>
      </div>
    `;
  }

  row.innerHTML = `
    <div class="chat-avatar citizen-avatar">Citizen</div>
    <div class="chat-bubble citizen-bubble">
      <div class="bubble-header">
        <strong>Complainant Oral Statement</strong>
        <span class="bubble-time">${timeStr}</span>
      </div>
      <div class="bubble-content">
        ${escapeHtml(text)}
        ${audioHtml}
      </div>
    </div>
  `;

  chatThread.appendChild(row);
  chatThread.scrollTop = chatThread.scrollHeight;

  state.conversationHistory.push({
    role: "complainant",
    text: text,
    audio: audioUrl,
    timestamp: timeStr
  });
}

function appendChatAgentTurn(data) {
  const chatThread = document.getElementById("agentChatThread");
  if (!chatThread) return;

  const row = document.createElement("div");
  row.className = "chat-bubble-row agent-row";

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const guidance = data.agent_guidance || "Statement analyzed with zero assumptions.";
  const missing = data.missing_critical_info || [];

  let chipsHtml = "";
  if (missing.length > 0) {
    let chipButtons = "";
    missing.forEach((q) => {
      const fieldName = (typeof q === "object" && q.field) ? q.field : "Critical Detail";
      const questionText = (typeof q === "object" && q.question) ? q.question : (typeof q === "string" ? q : "");
      chipButtons += `
        <button type="button" class="prompt-chip-btn" data-prompt="${escapeHtml(questionText)}" onclick="applyPromptChip(this.getAttribute('data-prompt'))">
          <span>❓ <strong>${escapeHtml(fieldName)}:</strong> "${escapeHtml(questionText)}"</span>
          <span class="chip-action">+ Ask Citizen</span>
        </button>
      `;
    });

    chipsHtml = `
      <div class="prompt-chips-wrapper">
        <span class="chips-title">⚠️ Missing Critical Info - Click to Prompt Citizen:</span>
        <div class="chips-list">
          ${chipButtons}
        </div>
      </div>
    `;
  } else {
    chipsHtml = `
      <div class="prompt-chips-wrapper">
        <span class="chips-title" style="color: #16a34a;">✓ Complete Information: All standard CSR legal parameters established.</span>
      </div>
    `;
  }

  row.innerHTML = `
    <div class="chat-avatar agent-avatar">AI</div>
    <div class="chat-bubble agent-bubble">
      <div class="bubble-header">
        <strong>Station AI Co-Pilot</strong>
        <span class="bubble-time">${timeStr}</span>
      </div>
      <div class="bubble-content">
        ${formatMarkdown(guidance)}
        ${chipsHtml}
      </div>
    </div>
  `;

  chatThread.appendChild(row);
  chatThread.scrollTop = chatThread.scrollHeight;

  state.conversationHistory.push({
    role: "agent",
    guidance: guidance,
    missing: missing,
    timestamp: timeStr
  });
}

function applyPromptChip(questionText) {
  const chatInput = document.getElementById("chatStatementInput");
  if (!chatInput) return;

  const promptBlock = `\n[Duty Officer Asked: "${questionText}"]\nCitizen Answer: `;
  if (accumulatedTranscript) {
    if (!accumulatedTranscript.includes(questionText)) {
      accumulatedTranscript = `${accumulatedTranscript.trim()}\n${promptBlock}`.trim();
    }
  } else {
    accumulatedTranscript = promptBlock.trim();
  }
  state.accumulatedTranscript = accumulatedTranscript;

  chatInput.value = accumulatedTranscript;
  chatInput.focus();
  chatInput.scrollTop = chatInput.scrollHeight;

  showToast(`Question prompted: "${questionText}". Citizen may speak or answer now.`, "info");
}


// ==========================================================================
// 6. LEFT COLUMN: DYNAMIC AI RECOMMENDED LEGAL & PROCEDURAL SECTIONS
// ==========================================================================

function getDraftTextarea() {
  return document.getElementById("complaintDraft") ||
         document.getElementById("reviewedDraftArea") ||
         document.querySelector("textarea[name='reviewedDraftArea']");
}

function initDraftAreaDropTarget() {
  const draftArea = getDraftTextarea();
  if (!draftArea) return;

  draftArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    draftArea.classList.add("draft-drag-hover");
  });

  draftArea.addEventListener("dragenter", (e) => {
    e.preventDefault();
    draftArea.classList.add("draft-drag-hover");
  });

  draftArea.addEventListener("dragleave", (e) => {
    draftArea.classList.remove("draft-drag-hover");
  });

  draftArea.addEventListener("drop", (e) => {
    e.preventDefault();
    draftArea.classList.remove("draft-drag-hover");
    const textData = e.dataTransfer.getData("text/plain");
    if (textData) {
      insertSectionIntoDraft(textData, "Dropped Legal Clause");
    }
  });
}

function insertSectionIntoDraft(templateText, title = "") {
  unhideRightSection();
  const draftArea = getDraftTextarea();
  if (!draftArea) return;

  if (!templateText) return;

  const currentVal = draftArea.value || "";
  let insertion = templateText.trim();

  // If text already exists, append cleanly with clear section line-breaks
  if (currentVal.trim().length > 0) {
    if (!currentVal.endsWith("\n\n")) {
      if (currentVal.endsWith("\n")) {
        draftArea.value = currentVal + "\n" + insertion + "\n\n";
      } else {
        draftArea.value = currentVal + "\n\n" + insertion + "\n\n";
      }
    } else {
      draftArea.value = currentVal + insertion + "\n\n";
    }
  } else {
    draftArea.value = insertion + "\n\n";
  }

  // Scroll to bottom and focus
  draftArea.scrollTop = draftArea.scrollHeight;
  draftArea.focus();

  // Highlight flash
  draftArea.classList.add("draft-drag-hover");
  setTimeout(() => {
    draftArea.classList.remove("draft-drag-hover");
  }, 400);

  showToast(`✓ Inserted into draft: ${title || "Legal Clause"}`, "success");
}

function insertSectionByIndex(idx) {
  if (!currentRecommendedSections || !currentRecommendedSections[idx]) {
    showToast("Selected section not found.", "error");
    return;
  }
  const sec = currentRecommendedSections[idx];
  insertSectionIntoDraft(sec.template_text, sec.section_code || sec.title);
}

function renderDynamicRecommendedSections(sections) {
  const container = document.getElementById("dynamicSectionsContainer");
  const countBadge = document.getElementById("dynamicSectionCountBadge");
  if (!container) return;

  currentRecommendedSections = Array.isArray(sections) ? sections : [];

  if (countBadge) {
    countBadge.textContent = currentRecommendedSections.length > 0
      ? `${currentRecommendedSections.length} Recommended`
      : "0 Active";
  }

  if (currentRecommendedSections.length === 0) {
    container.innerHTML = `
      <div id="emptySectionsPlaceholder" class="empty-sections-placeholder">
        <div class="empty-icon">⚖️</div>
        <div class="empty-title">No Case Analyzed Yet</div>
        <div class="empty-desc">
          Start an audio intake session or record a statement and click <strong>FIND</strong>. The AI will dynamically analyze the offence and recommend applicable BNS 2023, BNSS, and IT Act sections here.
        </div>
      </div>
    `;
    return;
  }

  let html = "";
  currentRecommendedSections.forEach((sec, idx) => {
    const code = escapeHtml(sec.section_code || "Section");
    const category = escapeHtml(sec.category || "Statutory Law");
    const title = escapeHtml(sec.title || sec.section_code || "Clause");
    const desc = escapeHtml(sec.description || "");

    html += `
      <div class="dynamic-section-card" draggable="true" data-index="${idx}" id="sectionCard_${idx}">
        <div class="section-card-top">
          <span class="section-code-badge">${code}</span>
          <span class="section-category-tag">${category}</span>
        </div>
        <div class="section-card-title">${title}</div>
        ${desc ? `<div class="section-card-desc">${desc}</div>` : ""}
        <div class="section-card-actions">
          <button type="button" class="btn-insert-section" onclick="insertSectionByIndex(${idx})" title="Append this clause into the complaint draft">
            ➕ Insert into Draft
          </button>
          <span class="drag-hint" title="Drag this card directly into the complaint draft box">⤹ Drag into Draft</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Attach HTML5 Drag-and-Drop event listeners to each generated card
  const cards = container.querySelectorAll(".dynamic-section-card");
  cards.forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      const idx = parseInt(card.getAttribute("data-index"), 10);
      const sec = currentRecommendedSections[idx];
      if (sec) {
        e.dataTransfer.setData("text/plain", sec.template_text || `\n\n[${sec.section_code}]\n${sec.description}`);
        e.dataTransfer.setData("application/json", JSON.stringify(sec));
        e.dataTransfer.effectAllowed = "copy";
        card.classList.add("is-dragging");
      }
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
    });
  });
}

// Backward-compatibility wrapper for legacy template calls
function insertTemplate(sectionKey) {
  const templates = {
    bio: "\n\n[1. COMPLAINANT BIO & IDENTIFICATION]\n• Full Name: \n• Father/Spouse Name: \n• Residential Address: \n• Contact Number: \n• Government ID (Aadhaar / Voter ID): ",
    timing: "\n\n[2. INCIDENT OCCURRENCE & TIMING]\n• Date of Occurrence: \n• Approximate Time: \n• Prior Delay Reason (if reported late): ",
    narrative: "\n\n[3. SCENE OF OCCURRENCE & SEQUENCE OF EVENTS]\n• Exact Location / Landmark: \n• Chronological Sequence of Occurrence: \n• Acts of the Accused / Perpetrator: ",
    property: "\n\n[4. STOLEN / INVOLVED PROPERTY DETAILS]\n• Item Description: \n• Make / Model / Color: \n• IMEI / Chassis / Serial No: \n• Estimated Market Value (Rs.): \n• Purchase Bill / Invoice Available: ",
    persons: "\n\n[5. SUSPECTS / PERSONS INVOLVED]\n• Known or Unknown: \n• Physical Description (Height, Complexion, Attire): \n• Vehicle Used (Make, Color, Reg No): \n• Direction in which accused fled: ",
    action: "\n\n[6. REQUESTED POLICE ACTION & PRAYER]\n• Action Requested: Registration on Community Service Register (CSR) / FIR, tracing of missing property, recovery, and lawful investigation."
  };
  const snippet = templates[sectionKey] || "";
  insertSectionIntoDraft(snippet, sectionKey.toUpperCase());
}


// ==========================================================================
// 7. RIGHT COLUMN: CRIME MATRIX & QUESTION RENDERING
// ==========================================================================

function renderExtractedEntities(data) {
  const setEntity = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!val || val === "Not mentioned") {
      el.textContent = "Not mentioned";
      el.classList.add("not-mentioned");
    } else {
      el.textContent = val;
      el.classList.remove("not-mentioned");
    }
  };

  setEntity("entIncidentType", data.incident_type);
  setEntity("entDate", data.date);
  setEntity("entTime", data.time);
  setEntity("entLocation", data.location);
  setEntity("entObject", data.object_property);
  setEntity("entSuspect", data.suspect_person);
  setEntity("entDescription", data.person_description);
  setEntity("entSynopsis", data.synopsis);
}

function renderMissingQuestions(questions) {
  const container = document.getElementById("missingQuestionsContainer");
  const missingBox = document.getElementById("missingInfoBox");
  if (!container || !missingBox) return;

  if (!questions || questions.length === 0) {
    missingBox.style.display = "none";
    container.innerHTML = "";
    return;
  }

  missingBox.style.display = "block";
  let html = "";

  questions.forEach((q) => {
    const fieldName = (typeof q === "object" && q.field) ? q.field : "Critical Detail";
    const questionText = (typeof q === "object" && q.question) ? q.question : (typeof q === "string" ? q : "");
    html += `
      <div class="question-item">
        <div>
          <strong>Missing: ${escapeHtml(fieldName)}</strong><br/>
          <span>${escapeHtml(questionText)}</span>
        </div>
        <button type="button" class="btn-ask-quick" data-prompt="${escapeHtml(questionText)}" onclick="applyPromptChip(this.getAttribute('data-prompt'))">
          + Ask Citizen
        </button>
      </div>
    `;
  });

  container.innerHTML = html;
}


// ==========================================================================
// 8. SQLITE RECORD PERSISTENCE & CRUD
// ==========================================================================

async function saveComplaintRecord(newStatus = "Saved") {
  const writerName = document.getElementById("writerName")?.value.trim() || "Duty Officer";
  const writerId = document.getElementById("writerId")?.value.trim() || "STN-01";
  let complainantName = document.getElementById("complainantName")?.value.trim() || "";
  const fatherName = document.getElementById("fatherName")?.value.trim() || "";
  const contactNumber = document.getElementById("contactNumber")?.value.trim() || "";
  const residentialAddress = document.getElementById("residentialAddress")?.value.trim() || "";
  const aadhaarNumber = document.getElementById("aadhaarNumber")?.value.trim() || "";
  const draftComplaint = document.getElementById("complaintDraft")?.value.trim() || "";

  if (!complainantName) {
    if (newStatus === "Draft") {
      complainantName = "Draft Complainant";
    } else {
      showToast("Please enter the Complainant Full Name in Part 2.", "error");
      document.getElementById("complainantName")?.focus();
      return;
    }
  }

  if (!draftComplaint && !state.accumulatedTranscript) {
    showToast("Cannot save empty complaint. Please enter details or record citizen intake first.", "error");
    return;
  }

  syncWriterSignatureData();
  syncComplainantSignatureData();

  const categoryName = state.extractedEntities.incident_type || "General";

  const payload = {
    reference_id: state.currentRefId,
    writer_name: writerName,
    writer_id: writerId,
    writer_signature: state.writerSignatureBase64,
    station_seal: state.stationSealBase64,
    complainant_name: complainantName,
    father_name: fatherName,
    contact_number: contactNumber,
    residential_address: residentialAddress,
    govt_id_masked: aadhaarNumber,
    complainant_signature: state.signatureBase64,
    incident_type: categoryName,
    incident_category: categoryName,
    incident_date: state.extractedEntities.date || "Not mentioned",
    incident_time: state.extractedEntities.time || "Not mentioned",
    incident_location: state.extractedEntities.location || "Not mentioned",
    object_property: state.extractedEntities.object_property || "Not mentioned",
    suspect_person: state.extractedEntities.suspect_person || "Not mentioned",
    person_description: state.extractedEntities.person_description || "Not mentioned",
    raw_transcript: state.accumulatedTranscript || draftComplaint,
    extracted_entities_json: state.extractedEntities,
    draft_complaint: draftComplaint,
    reviewed_draft: draftComplaint,
    status: newStatus,
    ai_provider_used: state.activeAiProvider,
    audio_files_json: state.audioFiles,
    conversation_history_json: state.conversationHistory,
    audio_path: state.singleAudio ? state.singleAudio.audio_url : (state.audioFiles[0]?.audio_url || ""),
    audio_filename: state.singleAudio ? state.singleAudio.filename : (state.audioFiles[0]?.filename || ""),
    audio_duration: state.singleAudio ? state.singleAudio.duration : (state.audioFiles[0]?.duration || ""),
    vad_stats: state.singleAudio ? state.singleAudio.vad_stats : "Continuous Single-Audio Capture Active"
  };

  try {
    showToast(`Saving complaint as ${newStatus} in Police Database...`, "info");
    const res = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to save record");

    const saved = json.data;
    state.currentRefId = saved.reference_id;

    const refBadge = document.getElementById("activeRefIdBadge");
    if (refBadge) refBadge.textContent = saved.reference_id;

    const successMsg = newStatus === "Draft"
      ? `✓ Draft Saved Successfully! Ref: ${saved.reference_id}`
      : `✓ Complaint Registered in Database! Ref: ${saved.reference_id}`;
    showToast(successMsg, "success");
    return saved;

  } catch (err) {
    console.error("Save Error:", err);
    showToast(`Save Error: ${err.message}`, "error");
  }
}


// ==========================================================================
// 9. PDF EXPORT & DIRECT PRINTING
// ==========================================================================

async function exportPDF() {
  if (!state.currentRefId) {
    const confirmation = confirm("This complaint has not been saved yet. Save now to compile official PDF?");
    if (confirmation) {
      const saved = await saveComplaintRecord("Saved");
      if (!saved) return;
    } else {
      return;
    }
  }

  window.open(`/api/export-pdf/${state.currentRefId}`, "_blank");
}

function printComplaint() {
  window.print();
}


// ==========================================================================
// 10. AI CO-PILOT PROCEDURAL ADVISOR MODAL
// ==========================================================================

function openCopilotModal() {
  const modal = document.getElementById("copilotModal");
  if (modal) modal.classList.add("active");
}

function closeCopilotModal() {
  const modal = document.getElementById("copilotModal");
  if (modal) modal.classList.remove("active");
}

async function sendCopilotMessage() {
  const input = document.getElementById("copilotChatInput");
  const msg = input ? input.value.trim() : "";
  if (!msg) return;

  const chatContainer = document.getElementById("copilotChatMessages");
  if (!chatContainer) return;

  const officerBubble = document.createElement("div");
  officerBubble.className = "chat-bubble officer";
  officerBubble.textContent = msg;
  chatContainer.appendChild(officerBubble);
  input.value = "";
  chatContainer.scrollTop = chatContainer.scrollHeight;

  const aiBubble = document.createElement("div");
  aiBubble.className = "chat-bubble copilot";
  aiBubble.innerHTML = "<i>Consulting Indian Police Law & Order Knowledge Base...</i>";
  chatContainer.appendChild(aiBubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg,
        context: {
          incident_type: state.extractedEntities.incident_type,
          location: state.extractedEntities.location,
          object: state.extractedEntities.object_property,
          complainant: document.getElementById("complainantName")?.value || ""
        }
      })
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Co-Pilot failed to respond");

    aiBubble.innerHTML = formatMarkdown(json.data.reply);
    chatContainer.scrollTop = chatContainer.scrollHeight;

  } catch (err) {
    aiBubble.innerHTML = `<font color='#dc2626'>Error: ${escapeHtml(err.message)}</font>`;
  }
}


// ==========================================================================
// 11. LOAD SAVED RECORD INTO WORKSPACE
// ==========================================================================

async function loadComplaintIntoWorkspace(refOrId) {
  try {
    showToast(`Loading complaint record ${refOrId}...`, "info");
    const res = await fetch(`/api/complaints/${refOrId}`);
    const json = await res.json();

    if (!json.success) throw new Error(json.error || "Record not found");

    const c = json.data;
    state.currentRefId = c.reference_id;
    accumulatedTranscript = c.raw_transcript || "";
    state.accumulatedTranscript = accumulatedTranscript;
    currentComplaintData = c.extracted_entities || {};
    state.extractedEntities = currentComplaintData;
    state.currentComplaintData = currentComplaintData;
    window.currentComplaintData = currentComplaintData;
    state.audioFiles = c.audio_files || [];
    state.conversationHistory = c.conversation_history || [];

    if (document.getElementById("chatStatementInput")) {
      document.getElementById("chatStatementInput").value = accumulatedTranscript;
    }

    // Part 1
    if (document.getElementById("writerName")) document.getElementById("writerName").value = c.writer_name || "";
    if (document.getElementById("writerId")) document.getElementById("writerId").value = c.writer_id || "";

    // Part 2
    if (document.getElementById("complainantName")) document.getElementById("complainantName").value = c.complainant_name || "";
    if (document.getElementById("fatherName")) document.getElementById("fatherName").value = c.father_name || "";
    if (document.getElementById("contactNumber")) document.getElementById("contactNumber").value = c.contact_number || "";
    if (document.getElementById("residentialAddress")) document.getElementById("residentialAddress").value = c.residential_address || "";
    if (document.getElementById("aadhaarNumber")) {
      document.getElementById("aadhaarNumber").value = c.govt_id_masked || "";
      formatAadhaarInput(document.getElementById("aadhaarNumber"));
    }

    // Part 3 Draft
    if (document.getElementById("complaintDraft")) document.getElementById("complaintDraft").value = c.draft_complaint || "";

    // Badges
    const refBadge = document.getElementById("activeRefIdBadge");
    if (refBadge) refBadge.textContent = c.reference_id;

    updateCaseTypeHeader(c.incident_type);
    unhideRightSection();
    renderExtractedEntities(state.extractedEntities);
    renderDynamicRecommendedSections(currentComplaintData.recommended_sections || []);

    // Restore Chat Thread
    const chatThread = document.getElementById("agentChatThread");
    if (chatThread && state.conversationHistory.length > 0) {
      chatThread.innerHTML = "";
      state.conversationHistory.forEach((turn) => {
        if (turn.role === "complainant") {
          appendChatComplainantTurn(turn.text, turn.audio);
        } else if (turn.role === "agent") {
          appendChatAgentTurn(turn);
        }
      });
    }

    // Restore Writer Signature
    if (c.writer_signature && writerCanvas && writerCtx) {
      state.writerSignatureBase64 = c.writer_signature;
      const imgW = new Image();
      imgW.onload = () => {
        clearWriterSignature();
        writerCtx.drawImage(imgW, 0, 0, writerCanvas.width, writerCanvas.height);
        state.writerSignatureBase64 = c.writer_signature;
        const status = document.getElementById("writerCanvasStatus");
        if (status) status.textContent = "✓ Digital Signature Restored";
      };
      imgW.src = c.writer_signature;
    }

    // Restore Complainant Signature
    if (c.complainant_signature && complainantCanvas && complainantCtx) {
      state.signatureBase64 = c.complainant_signature;
      const thumb = document.getElementById("sigPreviewThumb");
      if (thumb) thumb.src = c.complainant_signature;

      const imgC = new Image();
      imgC.onload = () => {
        clearComplainantSignature();
        complainantCtx.drawImage(imgC, 0, 0, complainantCanvas.width, complainantCanvas.height);
        state.signatureBase64 = c.complainant_signature;
        const status = document.getElementById("complainantCanvasStatus");
        if (status) status.textContent = "✓ Digital Signature Restored";
      };
      imgC.src = c.complainant_signature;
    }

    // Target Audio Badge
    const targetAudioEl = document.getElementById("singleAudioTargetBadge");
    if (c.audio_filename && targetAudioEl) {
      targetAudioEl.textContent = `static/uploads/audio/${c.audio_filename}`;
      state.singleAudio = {
        filename: c.audio_filename,
        audio_url: c.audio_path || `/static/uploads/audio/${c.audio_filename}`,
        duration: c.audio_duration || "N/A",
        vad_stats: c.vad_stats || "Continuous Single Audio Recording"
      };
    }

    showToast(`Loaded ${c.reference_id} successfully.`, "success");

  } catch (err) {
    console.error("Load Error:", err);
    showToast(`Could not load record: ${err.message}`, "error");
  }
}


// ==========================================================================
// 12. RESET WORKSPACE & UTILITIES
// ==========================================================================

function resetWorkspace() {
  if (confirm("Start a fresh complaint registration? Any unsaved edits will be cleared.")) {
    state.currentRefId = null;
    accumulatedTranscript = "";
    currentComplaintData = null;
    state.accumulatedTranscript = "";
    state.currentComplaintData = null;
    window.currentComplaintData = null;
    state.extractedEntities = {};
    state.signatureBase64 = "";
    state.writerSignatureBase64 = "";
    state.audioFiles = [];
    state.singleAudio = null;
    state.conversationHistory = [];

    // Part 2 Inputs
    const cName = document.getElementById("complainantName");
    const fName = document.getElementById("fatherName");
    const cPhone = document.getElementById("contactNumber");
    const cAddr = document.getElementById("residentialAddress");
    const cAadhaar = document.getElementById("aadhaarNumber");

    if (cName) cName.value = "";
    if (fName) fName.value = "";
    if (cPhone) cPhone.value = "";
    if (cAddr) cAddr.value = "";
    if (cAadhaar) cAadhaar.value = "";

    const maskTag = document.getElementById("aadhaarMaskTag");
    if (maskTag) {
      maskTag.textContent = "Aadhaar Redacted";
      maskTag.style.color = "#475569";
    }

    // Part 3 Inputs
    const chatInput = document.getElementById("chatStatementInput");
    const draftArea = document.getElementById("complaintDraft");
    if (chatInput) chatInput.value = "";
    if (draftArea) draftArea.value = "";

    // Clear Signature Pads
    clearWriterSignature();
    clearComplainantSignature();

    renderExtractedEntities({});
    renderMissingQuestions([]);
    currentRecommendedSections = [];
    renderDynamicRecommendedSections([]);
    updateCaseTypeHeader("Not mentioned");

    const refBadge = document.getElementById("activeRefIdBadge");
    if (refBadge) refBadge.textContent = "POL-NEW-DRAFT";

    // Request new session reference ID
    initIntakeSessionRef();

    // Re-hide Right Section
    hideRightSection();

    // Reset Chat Welcome
    const chatThread = document.getElementById("agentChatThread");
    if (chatThread) {
      chatThread.innerHTML = `
        <div class="chat-bubble-row agent-row">
          <div class="chat-avatar agent-avatar">AI</div>
          <div class="chat-bubble agent-bubble">
            <div class="bubble-header">
              <strong>Police AI Intake Agent</strong>
              <span class="bubble-time">Ready</span>
            </div>
            <div class="bubble-content">
              Vanakkam / Greetings Officer! Interactive Continuous Intake is ready.
              <ul>
                <li>Click <strong>"Start Recording"</strong> to begin continuous audio intake.</li>
                <li>Speech in Tamil, Tanglish, or English will stream live into the transcription box above.</li>
                <li>Click the prominent <strong>"🔍 FIND"</strong> button at any moment to extract entities and reveal follow-up questions!</li>
              </ul>
            </div>
          </div>
        </div>
      `;
    }

    showToast("Workspace refreshed. Right panel hidden for fresh intake.", "info");
  }
}

function showToast(message, type = "info") {
  const toast = document.getElementById("toastNotification");
  if (!toast) return;

  toast.textContent = message;
  toast.className = `show ${type}`;

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.className = "";
  }, 3500);
}

function formatMarkdown(text) {
  if (!text) return "";
  let clean = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  clean = clean.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  clean = clean.replace(/^[•\*]\s+(.*)$/gm, "<li>$1</li>");
  clean = clean.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");
  clean = clean.replace(/\n/g, "<br/>");
  return clean;
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ==========================================================================
// 13. EXPLICIT DOM EVENT LISTENER BINDINGS
// ==========================================================================

function bindUiEventListeners() {
  const bindClick = (id, handler) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", handler);
    }
  };

  bindClick("btnStartRecord", startContinuousRecording);
  bindClick("btnStopRecord", stopContinuousRecording);
  bindClick("btnFind", triggerFindAnalysis);
  bindClick("btnSendMerge", triggerSendAndMerge);
  bindClick("btnClearTranscript", clearTranscriptStream);
  bindClick("btnClearChatInput", clearChatInput);
  bindClick("btnReciteIntro", applyWriterIntroFormula);
  bindClick("btnClearWriterSig", clearWriterSignature);
  bindClick("btnUndoWriterSig", undoWriterSignature);
  bindClick("btnClearComplainantSig", clearComplainantSignature);
  bindClick("btnUndoComplainantSig", undoComplainantSignature);
  bindClick("btnSaveDraft", () => saveComplaintRecord("Draft"));
  bindClick("btnSaveRecord", () => saveComplaintRecord("Saved"));
  bindClick("btnExportPdf", exportPDF);
  bindClick("btnPrintComplaint", printComplaint);
  bindClick("btnOpenCopilot", openCopilotModal);
  bindClick("btnCloseCopilotModal", closeCopilotModal);
  bindClick("btnSendCopilotMsg", sendCopilotMessage);
  bindClick("btnResetWorkspace", resetWorkspace);

  // Initialize Drop Target on Draft Textarea
  initDraftAreaDropTarget();

  // Template items
  const templateItems = document.querySelectorAll(".template-item");
  templateItems.forEach((item) => {
    item.addEventListener("click", () => {
      const templateKey = item.getAttribute("data-template");
      if (templateKey) {
        insertTemplate(templateKey);
      }
    });
  });

  // Seal upload
  const sealInput = document.getElementById("sealFileInput");
  if (sealInput) {
    sealInput.addEventListener("change", handleSealUpload);
  }

  // Aadhaar input
  const aadhaarInput = document.getElementById("aadhaarNumber");
  if (aadhaarInput) {
    aadhaarInput.addEventListener("input", (e) => formatAadhaarInput(e.target));
  }

  // Chat statement input keydown
  const chatInput = document.getElementById("chatStatementInput");
  if (chatInput) {
    chatInput.addEventListener("keydown", handleChatInputKeyDown);
  }

  // Copilot input keydown
  const copilotInput = document.getElementById("copilotChatInput");
  if (copilotInput) {
    copilotInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendCopilotMessage();
    });
  }
}


// ==========================================================================
// 14. GLOBAL WINDOW EXPOSURES FOR INLINE EVENT HANDLERS
// ==========================================================================

window.startContinuousRecording = startContinuousRecording;
window.stopContinuousRecording = stopContinuousRecording;
window.triggerFindAnalysis = triggerFindAnalysis;
window.triggerSendAndMerge = triggerSendAndMerge;
window.clearTranscriptStream = clearTranscriptStream;
window.clearChatInput = clearChatInput;
window.applyWriterIntroFormula = applyWriterIntroFormula;
window.clearWriterSignature = clearWriterSignature;
window.undoWriterSignature = undoWriterSignature;
window.clearComplainantSignature = clearComplainantSignature;
window.undoComplainantSignature = undoComplainantSignature;
window.saveComplaintRecord = saveComplaintRecord;
window.exportPDF = exportPDF;
window.printComplaint = printComplaint;
window.openCopilotModal = openCopilotModal;
window.closeCopilotModal = closeCopilotModal;
window.sendCopilotMessage = sendCopilotMessage;
window.resetWorkspace = resetWorkspace;
window.insertTemplate = insertTemplate;
window.renderDynamicRecommendedSections = renderDynamicRecommendedSections;
window.insertSectionIntoDraft = insertSectionIntoDraft;
window.insertSectionByIndex = insertSectionByIndex;
window.handleSealUpload = handleSealUpload;
window.formatAadhaarInput = formatAadhaarInput;
window.applyPromptChip = applyPromptChip;
