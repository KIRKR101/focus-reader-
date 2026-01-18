const textInput = document.getElementById("textInput");
const docTitle = document.getElementById("docTitle");
const wordCountEl = document.getElementById("wordCount");
const progressEl = document.getElementById("progress");
const wordDisplay = document.getElementById("wordDisplay");
const leftSpan = wordDisplay.querySelector(".word-left");
const focusSpan = wordDisplay.querySelector(".word-focus");
const rightSpan = wordDisplay.querySelector(".word-right");
const speedRange = document.getElementById("speedRange");
const wpmValue = document.getElementById("wpmValue");
const sliderTrack = document.querySelector(".slider-track");
const readerPanel = document.getElementById("readerPanel");
const readerControls = document.getElementById("readerControls");
const toggleControlsBtn = document.getElementById("toggleControlsBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const customizeBtn = document.getElementById("customizeBtn");
const customizePanel = document.getElementById("customizePanel");
const readerDoc = document.getElementById("readerDoc");
const actionButtons = document.querySelectorAll("[data-action]");
const pauseButtons = document.querySelectorAll('[data-action="pause"]');
const pdfInput = document.getElementById("pdfInput");
const pdfStatus = document.getElementById("pdfStatus");
const epubInput = document.getElementById("epubInput");
const epubStatus = document.getElementById("epubStatus");
const ocrToggle = document.getElementById("ocrToggle");
const libraryList = document.getElementById("libraryList");
const libraryEmpty = document.getElementById("libraryEmpty");
const clearLibraryBtn = document.getElementById("clearLibraryBtn");
const addEntryBtn = document.getElementById("addEntryBtn");
const inputSection = document.querySelector(".input-section");
const uploadSection = document.querySelector(".upload-section");
const historyLastRead = document.getElementById("historyLastRead");
const historySessions = document.getElementById("historySessions");
const historyTime = document.getElementById("historyTime");
const dropOverlay = document.getElementById("dropOverlay");
const inputPanel = document.querySelector(".input-panel");
const librarySearch = document.getElementById("librarySearch");
const pdfjsLib = window.pdfjsLib;
const epubjsLib = window.ePub;
const focusHighlightToggle = document.getElementById("focusHighlightToggle");
const focusColorPicker = document.getElementById("focusColorPicker");
const focusColorButtons = document.querySelectorAll("[data-focus-color]");
const autoPaceToggle = document.getElementById("autoPaceToggle");
const autoPaceSettings = document.getElementById("autoPaceSettings");
const autoPace = document.getElementById("autoPace");
const autoPaceLabel = document.getElementById("autoPaceLabel");
const closePaceSettings = document.getElementById("closePaceSettings");
const startPaceInput = document.getElementById("startPace");
const maxPaceInput = document.getElementById("maxPace");
const liveWpmEl = document.getElementById("liveWpm");
const contextToggle = document.getElementById("contextToggle");
const reader = document.querySelector(".reader");

// Modal Elements
const contextModal = document.getElementById("contextModal");
const modalContextBody = document.getElementById("modalContextBody");
const closeContextModal = document.getElementById("closeContextModal");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const modalPrevParagraph = document.getElementById("modalPrevParagraph");
const modalNextParagraph = document.getElementById("modalNextParagraph");

let words = [];
let currentIndex = 0;
let timerId = null;
let isPlaying = false;
let wpm = Number(speedRange.value);
let isPseudoFullscreen = false;
let hasStarted = false;
let isPdfLoading = false;
let isEpubLoading = false;
let activeDoc = null;
let isSettingText = false;
let isOcrEnabled = false;
let saveTimer = null;
let libraryRefreshTimer = null;
let ocrWorker = null;
let ocrLoadingPromise = null;
let isAutoPaceEnabled = false;
let autoPaceStartWpm = 150;
let autoPaceMaxWpm = 400;
let autoPaceSessionStartIndex = 0;
const AUTO_PACE_WORDS_PER_STEP = 25;
let sessionStartAt = null;
let focusHighlightEnabled = true;
let focusColor = "#ff3b30";
let isContextViewActive = false;
let originalText = "";
let contextParagraphs = [];
let currentParagraphIndex = 0;

const PDF_WORKER_SRC =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
const TESSERACT_SRC =
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const DB_NAME = "focus-reader";
const DB_VERSION = 1;
const STORE_NAME = "documents";
const PREFS_KEY = "focusReaderPrefs";

if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
}

function openDb() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("DB open failed"));
  });
}

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDb().catch((error) => {
      console.warn(error);
      return null;
    });
  }
  return dbPromise;
}

async function dbPut(doc) {
  const db = await getDb();
  if (!db) {
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).put(doc);
  });
}

async function dbGet(id) {
  const db = await getDb();
  if (!db) {
    return null;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function dbGetAll() {
  const db = await getDb();
  if (!db) {
    return [];
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function dbDelete(id) {
  const db = await getDb();
  if (!db) {
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).delete(id);
  });
}

async function dbClear() {
  const db = await getDb();
  if (!db) {
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).clear();
  });
}

function hashText(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(16);
}

function deriveTitle(text) {
  const titleWords = text.trim().split(/\s+/).slice(0, 6);
  return titleWords.length ? titleWords.join(" ") : "Untitled";
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "new";
  }
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseHtmlToText(html) {
  if (!html) {
    return "";
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    return doc.body ? doc.body.textContent || "" : "";
  } catch (_) {
    return "";
  }
}

function formatDuration(ms) {
  if (!ms || ms <= 0) {
    return "0m";
  }
  const totalSeconds = Math.round(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function loadPrefs() {
  if (!("localStorage" in window)) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn(error);
    return {};
  }
}

function savePrefs() {
  if (!("localStorage" in window)) {
    return;
  }
  const payload = {
    focusHighlightEnabled,
    focusColor,
  };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn(error);
  }
}

function applyFocusColor() {
  const root = document.documentElement;
  const computed = window.getComputedStyle(root);
  const textColor = computed.getPropertyValue("--text").trim() || "#ffffff";
  const applied = focusHighlightEnabled ? focusColor : textColor;
  root.style.setProperty("--focus", applied);
  if (focusColorPicker) {
    focusColorPicker.disabled = !focusHighlightEnabled;
  }
}

function applyPrefs(prefs = {}) {
  if (typeof prefs.focusHighlightEnabled === "boolean") {
    focusHighlightEnabled = prefs.focusHighlightEnabled;
  }
  if (prefs.focusColor) {
    focusColor = prefs.focusColor;
  }
  applyFocusColor();
  if (focusHighlightToggle) {
    focusHighlightToggle.checked = focusHighlightEnabled;
  }
  if (focusColorPicker) {
    focusColorPicker.value = focusColor;
  }
  renderWordAtIndex(currentIndex);
}

function setFocusHighlightEnabled(enabled) {
  focusHighlightEnabled = Boolean(enabled);
  applyFocusColor();
  savePrefs();
}

function setFocusColor(nextColor) {
  focusColor = nextColor;
  applyFocusColor();
  savePrefs();
}

function tokenize(text) {
  return text.trim().match(/\S+/g) ?? [];
}

function updateReaderDocLabel() {
  if (!readerDoc) {
    return;
  }
  if (activeDoc && activeDoc.title) {
    readerDoc.textContent = activeDoc.title;
    return;
  }
  if (textInput.value.trim()) {
    readerDoc.textContent = "Unsaved text";
    return;
  }
  readerDoc.textContent = "No document loaded";
}

function updateHistoryPanel() {
  if (!historyLastRead || !historySessions || !historyTime) {
    return;
  }
  if (!activeDoc) {
    historyLastRead.textContent = "—";
    historySessions.textContent = "0";
    historyTime.textContent = "0m";
    return;
  }
  historyLastRead.textContent = formatTimestamp(activeDoc.lastReadAt);
  historySessions.textContent = `${activeDoc.sessions || 0}`;
  historyTime.textContent = formatDuration(activeDoc.totalReadMs || 0);
}

function getProgressPercent(index, total) {
  if (!total) {
    return 0;
  }
  return Math.min(100, Math.round((index / total) * 100));
}

function createDocumentFromText(text, options = {}) {
  const now = Date.now();
  const docTitleValue = (options.title || "").trim();
  const derivedTitle = docTitleValue || deriveTitle(text);
  const docWords = tokenize(text);
  return {
    id: hashText(text),
    title: derivedTitle || "Untitled",
    text,
    source: options.source || "paste",
    wordCount: docWords.length,
    lastIndex: 0,
    createdAt: now,
    updatedAt: now,
    lastReadAt: null,
    wpm,
    sessions: 0,
    totalReadMs: 0,
    meta: options.meta || {},
  };
}

function applyDocumentState(doc, options = {}) {
  if (activeDoc && sessionStartAt && (!doc || activeDoc.id !== doc.id)) {
    endSession();
  }
  
  const isSameDoc = activeDoc && doc && activeDoc.id === doc.id;
  const textTitleChanged = doc && (doc.title !== (docTitle ? docTitle.value : ""));
  const textContentChanged = doc && (doc.text !== originalText);

  activeDoc = doc;
  sessionStartAt = null;
  
  if (activeDoc) {
    activeDoc.sessions = activeDoc.sessions || 0;
    activeDoc.totalReadMs = activeDoc.totalReadMs || 0;
    
    // Show controls section when a document is loaded
    const controlsSection = document.querySelector('.controls-section');
    if (controlsSection) {
      controlsSection.classList.remove('hidden');
    }
  } else {
    // Hide controls section when no document is loaded
    const controlsSection = document.querySelector('.controls-section');
    if (controlsSection) {
      controlsSection.classList.add('hidden');
    }
  }

  if (docTitle && doc && (textTitleChanged || !isSameDoc)) {
    docTitle.value = doc.title || "";
  }

  if (options.setText !== false && doc && typeof doc.text === "string" && (textContentChanged || !isSameDoc)) {
    isSettingText = true;
    textInput.value = doc.text;
    isSettingText = false;
  }

  if (textContentChanged || !isSameDoc) {
    originalText = doc ? (doc.text || "") : "";
    words = doc ? tokenize(doc.text || "") : [];
  }

  currentIndex = doc ? Math.min(doc.lastIndex || 0, words.length) : 0;
  updateStats();

  if (words.length) {
    renderWordAtIndex(currentIndex);
  } else {
    renderWord("");
  }

  if (doc && typeof doc.wpm === "number") {
    wpm = doc.wpm;
    speedRange.value = wpm.toString();
    updateDial();
  }

  updateReaderDocLabel();
  updateHistoryPanel();
  updatePlayStateUI();
  scheduleLibraryRefresh();
}

function scheduleLibraryRefresh() {
  if (libraryRefreshTimer) {
    return;
  }
  libraryRefreshTimer = window.setTimeout(() => {
    libraryRefreshTimer = null;
    refreshLibrary();
  }, 100);
}

async function refreshLibrary() {
  if (!libraryList || !libraryEmpty) {
    return;
  }
  let docs = [];
  try {
    docs = await dbGetAll();
  } catch (error) {
    console.warn(error);
  }
  docs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  libraryList.innerHTML = "";
  const query = librarySearch ? librarySearch.value.toLowerCase().trim() : "";
  const filteredDocs = docs.filter(doc => 
    (doc.title || "Untitled").toLowerCase().includes(query) || 
    (doc.text || "").toLowerCase().includes(query)
  );

  if (!filteredDocs.length) {
    if (query) {
      libraryEmpty.textContent = `No results found for "${query}"`;
      libraryEmpty.style.display = "block";
    } else {
      libraryEmpty.textContent = "No saved documents yet.";
      libraryEmpty.style.display = "block";
    }
    return;
  }
  libraryEmpty.style.display = "none";

  filteredDocs.forEach((doc) => {
    const item = document.createElement("li");
    item.className = "library-item";
    if (activeDoc && doc.id === activeDoc.id) {
      item.classList.add("active");
    }

    const progress = getProgressPercent(doc.lastIndex || 0, doc.wordCount || 0);
    const sessions = doc.sessions || 0;
    const timeSpent = formatDuration(doc.totalReadMs || 0);

    // Create item content with the new structure
    item.innerHTML = `
      <div class="library-item-main">
        <div class="library-info">
          <p class="library-name">${doc.title || "Untitled"}</p>
          <div class="library-meta">
            <span>${progress}%</span>
            <span>${doc.wordCount || 0} words</span>
            <span>${formatTimestamp(doc.lastReadAt)}</span>
          </div>
          <div class="library-progress-container">
            <div class="library-progress-bar" style="width: ${progress}%"></div>
          </div>
        </div>
      </div>
      <div class="library-actions">
        <button data-doc-action="resume" data-doc-id="${doc.id}" class="${activeDoc && doc.id === activeDoc.id ? 'primary' : ''}">
          <i data-lucide="${activeDoc && doc.id === activeDoc.id ? 'play-circle' : 'play'}" class="icon"></i>
          <span>${activeDoc && doc.id === activeDoc.id ? 'Reading' : 'Resume'}</span>
        </button>
        <button data-doc-action="restart" data-doc-id="${doc.id}">
          <i data-lucide="rotate-ccw" class="icon"></i>
          <span>Restart</span>
        </button>
        <button data-doc-action="delete" data-doc-id="${doc.id}">
          <i data-lucide="trash-2" class="icon"></i>
        </button>
      </div>
    `;

    libraryList.appendChild(item);
  });

  // Re-render Lucide icons after adding library items
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// Add event listener for search
if (librarySearch) {
  librarySearch.addEventListener("input", () => {
    refreshLibrary();
  });
}

async function loadDocumentById(id, options = {}) {
  if (!id) {
    return;
  }
  
  // If we are already loading this document, don't restart process unless requested
  if (activeDoc && activeDoc.id === id && !options.restart) {
    // If it's already active, just ensure UI is updated
    updatePlayStateUI();
    return;
  }

  const doc = await dbGet(id);
  if (!doc) {
    return;
  }
  if (options.restart) {
    doc.lastIndex = 0;
    doc.updatedAt = Date.now();
    doc.lastReadAt = Date.now();
  }
  applyDocumentState(doc);
  if (options.restart) {
    await dbPut(doc);
  }
}

function scheduleSaveProgress(force = false) {
  if (!activeDoc) {
    return;
  }
  if (saveTimer && !force) {
    return;
  }
  if (saveTimer) {
    window.clearTimeout(saveTimer);
  }
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    saveActiveDocumentProgress().catch((error) => console.warn(error));
  }, force ? 0 : 600);
}

async function saveActiveDocumentProgress() {
  if (!activeDoc) {
    return;
  }
  activeDoc.lastIndex = currentIndex;
  activeDoc.wordCount = words.length;
  activeDoc.updatedAt = Date.now();
  activeDoc.lastReadAt = Date.now();
  activeDoc.wpm = wpm;
  activeDoc.sessions = activeDoc.sessions || 0;
  activeDoc.totalReadMs = activeDoc.totalReadMs || 0;
  if (!activeDoc.title || !activeDoc.title.trim()) {
    activeDoc.title = deriveTitle(activeDoc.text || "") || "Untitled";
  }
  await dbPut(activeDoc);
  updateHistoryPanel();
  scheduleLibraryRefresh();
}

async function ensureActiveDocumentFromText() {
  const rawText = textInput.value.trim();
  if (!rawText) {
    return null;
  }
  const id = hashText(rawText);
  let doc = null;
  try {
    doc = await dbGet(id);
  } catch (error) {
    console.warn(error);
  }
  if (!doc) {
    doc = createDocumentFromText(rawText, {
      title: docTitle ? docTitle.value : "",
      source: "paste",
    });
  } else {
    doc.text = rawText;
    doc.wordCount = words.length;
    if (docTitle && docTitle.value.trim()) {
      doc.title = docTitle.value.trim();
    }
    doc.sessions = doc.sessions || 0;
    doc.totalReadMs = doc.totalReadMs || 0;
  }
  applyDocumentState(doc, { setText: false });
  await dbPut(doc);
  return doc;
}

function updateStats() {
  wordCountEl.textContent = words.length.toString();
  const progress = getProgressPercent(currentIndex, words.length);
  progressEl.textContent = `${progress}%`;
}

function updateDial() {
  wpmValue.textContent = wpm.toString();
  speedRange.value = wpm.toString();
}

function updateLiveWpm() {
  if (!liveWpmEl) return;
  if (isPlaying) {
    liveWpmEl.textContent = `${wpm} WPM`;
    liveWpmEl.classList.add("visible");
  } else {
    liveWpmEl.classList.remove("visible");
  }
}

function jumpWords(amount) {
  if (!words.length) return;
  const wasPlaying = isPlaying;
  if (wasPlaying) {
    pauseReading();
  }
  const nextIndex = Math.min(
    words.length - 1,
    Math.max(0, currentIndex + amount),
  );
  currentIndex = nextIndex;
  renderWordAtIndex(currentIndex);
  updateStats();
  scheduleSaveProgress();
}

function rewindSeconds(seconds) {
  if (!words.length) return;
  const wordsBack = Math.max(1, Math.round((wpm / 60) * seconds));
  jumpWords(-wordsBack);
}

function stepWord(direction) {
  if (!words.length) return;

  const wasPlaying = isPlaying;
  if (wasPlaying) {
    pauseReading();
  }

  if (direction === "back" && currentIndex > 0) {
    currentIndex -= 1;
  } else if (direction === "forward" && currentIndex < words.length - 1) {
    currentIndex += 1;
  }

  renderWordAtIndex(currentIndex);
  updateStats();
  scheduleSaveProgress();
}

function calculateAutoPaceWpm() {
  if (!isAutoPaceEnabled || !words.length) {
    return wpm;
  }
  
  // Calculate progress based on words read in current session
  // This ensures books and long articles ramp up at a natural speed.
  const wordsRead = Math.max(0, currentIndex - autoPaceSessionStartIndex);
  
  // Ramp window: reach max speed after 1000 words (~3-5 mins of reading)
  // or by the end of the text if it's shorter than 1000 words.
  const rampWindow = Math.min(words.length, 1000);
  const progress = rampWindow > 0 ? Math.min(1, wordsRead / rampWindow) : 1;
  
  const wpmRange = autoPaceMaxWpm - autoPaceStartWpm;
  const newWpm = Math.round(autoPaceStartWpm + (wpmRange * progress));
  return Math.min(newWpm, autoPaceMaxWpm);
}

function updateAutoPace() {
  if (!isAutoPaceEnabled) {
    return;
  }
  const newWpm = calculateAutoPaceWpm();
  if (newWpm !== wpm) {
    wpm = newWpm;
    updateDial();
  }
}

function updatePlayStateUI() {
  let label = "Pause";
  let iconName = "pause";
  if (!isPlaying) {
    label = hasStarted ? "Resume" : "Start";
    iconName = "play";
  }

  let needsIconRefresh = false;

  pauseButtons.forEach((button) => {
    // Update button text and icon
    const span = button.querySelector("span");
    const icon = button.querySelector("[data-lucide]");
    if (span) {
      span.textContent = label;
    } else {
      button.textContent = label;
    }
    if (icon) {
      // Only update icon if it's different
      if (icon.getAttribute("data-lucide") !== iconName) {
        icon.setAttribute("data-lucide", iconName);
        needsIconRefresh = true;
      }
    }
  });

  if (needsIconRefresh && typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}

function setPlayingState(nextState) {
  isPlaying = nextState;
  updatePlayStateUI();
  updateLiveWpm();
}

function beginSession() {
  if (!activeDoc || sessionStartAt) {
    return;
  }
  sessionStartAt = Date.now();
  activeDoc.sessions = (activeDoc.sessions || 0) + 1;
  activeDoc.lastReadAt = Date.now();
  updateHistoryPanel();
  scheduleSaveProgress(true);
}

function endSession() {
  if (!activeDoc || !sessionStartAt) {
    return;
  }
  const duration = Date.now() - sessionStartAt;
  sessionStartAt = null;
  activeDoc.totalReadMs = (activeDoc.totalReadMs || 0) + duration;
  activeDoc.updatedAt = Date.now();
  activeDoc.lastReadAt = Date.now();
  dbPut(activeDoc).catch((error) => console.warn(error));
  updateHistoryPanel();
  scheduleLibraryRefresh();
}

function setPdfStatus(message, isError = false) {
  if (!pdfStatus) {
    return;
  }
  pdfStatus.textContent = message;
  pdfStatus.classList.toggle("error", isError);
}

function setEpubStatus(message, isError = false) {
  if (!epubStatus) {
    return;
  }
  epubStatus.textContent = message;
  epubStatus.classList.toggle("error", isError);
}

function loadOcrScript() {
  if (window.Tesseract) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load OCR"));
    document.head.appendChild(script);
  });
}

async function getOcrWorker() {
  if (ocrWorker) {
    return ocrWorker;
  }
  if (ocrLoadingPromise) {
    return ocrLoadingPromise;
  }
  ocrLoadingPromise = (async () => {
    await loadOcrScript();
    const worker = await window.Tesseract.createWorker("eng", 1, {
      logger: (message) => {
        if (message && message.status) {
          setPdfStatus(`OCR ${message.status} ${Math.round((message.progress || 0) * 100)}%`);
        }
      },
    });
    ocrWorker = worker;
    return worker;
  })();
  return ocrLoadingPromise;
}

async function runOcrOnPage(page, pageNumber, totalPages) {
  const worker = await getOcrWorker();
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  await page.render({ canvasContext: context, viewport }).promise;
  setPdfStatus(`OCR page ${pageNumber} of ${totalPages}`);
  const result = await worker.recognize(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return result.data && result.data.text ? result.data.text : "";
}

function extractSectionText(contents) {
  if (!contents) {
    return "";
  }
  if (typeof contents === "string") {
    return parseHtmlToText(contents);
  }
  // epub.js returns a Document - check body first
  if (contents.body && contents.body.textContent) {
    return contents.body.textContent || "";
  }
  if (contents.documentElement && contents.documentElement.textContent) {
    return contents.documentElement.textContent || "";
  }
  if (contents.textContent) {
    return contents.textContent || "";
  }
  if (contents.ownerDocument && contents.ownerDocument.body) {
    return contents.ownerDocument.body.textContent || "";
  }
  return "";
}

function getFocusIndex(word) {
  const letterIndexes = [];
  for (let i = 0; i < word.length; i += 1) {
    if (/\p{L}/u.test(word[i])) {
      letterIndexes.push(i);
    }
  }
  if (!letterIndexes.length) {
    return -1;
  }
  const center = Math.floor((letterIndexes.length - 1) / 2);
  return letterIndexes[center];
}

function renderWord(word) {
  if (!word) {
    leftSpan.textContent = "";
    focusSpan.textContent = "";
    rightSpan.textContent = "";
    return;
  }
  const focusIndex = getFocusIndex(word);
  if (focusIndex === -1) {
    leftSpan.textContent = word;
    focusSpan.textContent = "";
    rightSpan.textContent = "";
    return;
  }
  leftSpan.textContent = word.slice(0, focusIndex);
  focusSpan.textContent = word[focusIndex];
  rightSpan.textContent = word.slice(focusIndex + 1);
}

function renderWordAtIndex(index) {
  if (!words.length || index < 0 || index >= words.length) {
    renderWord("");
    return;
  }
  const word = words[index];
  if (!word) {
    renderWord("");
    return;
  }
  renderWord(word);
}

function buildParagraphsData() {
  if (!originalText) {
    contextParagraphs = [];
    return;
  }

  // Normalize text: convert single newlines to spaces, keep double newlines as paragraph breaks
  // This handles PDFs where every line ends with \n but they're part of the same paragraph
  const normalized = originalText
    .replace(/\r\n/g, '\n')           // Normalize Windows line endings
    .replace(/\n{3,}/g, '\n\n')       // Collapse multiple newlines to double
    .replace(/([^\n])\n([^\n])/g, '$1 $2');  // Single newlines become spaces

  // Split into paragraphs by double newline
  const rawParagraphs = normalized.split(/\n\n+/).filter(p => p.trim());

  // Build paragraph data with word offsets
  // We need to map back to the original word indices from tokenize(originalText)
  const allWords = words; // Use the global words array that was tokenized from originalText
  let wordOffset = 0;

  contextParagraphs = rawParagraphs.map((text, index) => {
    const paraWords = tokenize(text);
    const startIndex = wordOffset;
    wordOffset += paraWords.length;
    return {
      text,
      words: paraWords,
      startIndex,
      endIndex: wordOffset - 1,
      index
    };
  });

  // If word counts don't match, fall back to treating entire text as one paragraph
  if (wordOffset !== allWords.length) {
    contextParagraphs = [{
      text: originalText,
      words: allWords,
      startIndex: 0,
      endIndex: allWords.length - 1,
      index: 0
    }];
  }
}

function findParagraphIndexForWord(wordIndex) {
  for (let i = 0; i < contextParagraphs.length; i++) {
    const para = contextParagraphs[i];
    if (wordIndex >= para.startIndex && wordIndex <= para.endIndex) {
      return i;
    }
  }
  return 0;
}

function renderContextView(highlightWordIndex) {
  if (!modalContextBody || !contextParagraphs.length) {
    if (modalContextBody) {
      modalContextBody.innerHTML = "<p><em>No context available</em></p>";
    }
    return;
  }

  const para = contextParagraphs[currentParagraphIndex];
  if (!para) {
    modalContextBody.innerHTML = "<p><em>No context available</em></p>";
    return;
  }

  // Determine which word to highlight within this paragraph
  let localHighlight = -1;
  if (highlightWordIndex >= para.startIndex && highlightWordIndex <= para.endIndex) {
    localHighlight = highlightWordIndex - para.startIndex;
  }

  // Build HTML with highlighted word
  const parts = [];
  for (let i = 0; i < para.words.length; i++) {
    if (i === localHighlight) {
      parts.push(`<span class="highlight">${para.words[i]}</span>`);
    } else {
      parts.push(para.words[i]);
    }
  }
  modalContextBody.innerHTML = `<p>${parts.join(" ")}</p>`;

  // Update nav button states
  updateContextNavButtons();
}

function updateContextNavButtons() {
  if (!modalPrevParagraph || !modalNextParagraph) return;
  modalPrevParagraph.disabled = currentParagraphIndex <= 0;
  modalNextParagraph.disabled = currentParagraphIndex >= contextParagraphs.length - 1;
}

function goToPrevParagraph() {
  if (currentParagraphIndex > 0) {
    currentParagraphIndex -= 1;
    const para = contextParagraphs[currentParagraphIndex];
    // Update currentIndex to first word of this paragraph
    currentIndex = para.startIndex + 1;
    renderContextView(para.startIndex);
    updateStats();
  }
}

function goToNextParagraph() {
  if (currentParagraphIndex < contextParagraphs.length - 1) {
    currentParagraphIndex += 1;
    const para = contextParagraphs[currentParagraphIndex];
    // Update currentIndex to first word of this paragraph
    currentIndex = para.startIndex + 1;
    renderContextView(para.startIndex);
    updateStats();
  }
}

function showContextView() {
  buildParagraphsData();
  
  const displayedIndex = hasStarted ? Math.max(0, currentIndex - 1) : currentIndex;
  currentParagraphIndex = findParagraphIndexForWord(displayedIndex);

  isContextViewActive = true;
  renderContextView(displayedIndex);
  
  if (contextModal) {
    contextModal.classList.remove("hidden");
    document.body.style.overflow = "hidden"; // Prevent bg scroll
    
    // Ensure Lucide icons are rendered in the modal
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  }
}

function hideContextView() {
  if (!contextModal) return;
  isContextViewActive = false;
  contextModal.classList.add("hidden");
  document.body.style.overflow = ""; // Restore bg scroll
  
  // Update the word display to show current position
  renderWordAtIndex(Math.max(0, currentIndex - 1));
}

function toggleContextView() {
  if (isContextViewActive) {
    hideContextView();
  } else {
    showContextView();
  }
}

function updateContextToggleVisibility() {
  if (!contextToggle) return;
  // Show button when paused and we have words
  if (!isPlaying && words.length > 0 && hasStarted) {
    contextToggle.classList.remove("hidden");
  } else {
    contextToggle.classList.add("hidden");
    if (isContextViewActive) {
      hideContextView();
    }
  }
}

function getDelay(word) {
  const baseDelay = 60000 / wpm;
  if (/[.!?]$/.test(word)) {
    return baseDelay * 1.5;
  }
  if (/[,:;]$/.test(word)) {
    return baseDelay * 1.2;
  }
  return baseDelay;
}

function scheduleNext() {
  if (!isPlaying) {
    return;
  }
  if (currentIndex >= words.length) {
    currentIndex = words.length;
    updateStats();
    scheduleSaveProgress(true);
    stopReading();
    renderWord("Done");
    return;
  }
  updateAutoPace();
  updateLiveWpm();
  const word = words[currentIndex];
  renderWordAtIndex(currentIndex);
  currentIndex += 1;
  updateStats();
  scheduleSaveProgress();
  timerId = window.setTimeout(scheduleNext, getDelay(word));
}

async function startReading() {
  if (isPdfLoading || isEpubLoading) {
    renderWord("Loading file...");
    return;
  }
  if (!words.length) {
    originalText = textInput.value;
    words = tokenize(textInput.value);
    currentIndex = 0;
    updateStats();
  }
  if (!words.length) {
    renderWord("Paste text or upload a PDF");
    return;
  }
  if (isAutoPaceEnabled && !hasStarted) {
    wpm = autoPaceStartWpm;
    autoPaceSessionStartIndex = currentIndex;
    updateDial();
  }
  const rawText = textInput.value.trim();
  if (!activeDoc || (activeDoc.text || "").trim() !== rawText) {
    try {
      await ensureActiveDocumentFromText();
    } catch (error) {
      console.warn(error);
    }
  }
  if (isPlaying) {
    return;
  }
  hasStarted = true;
  setPlayingState(true);
  updateContextToggleVisibility();
  beginSession();
  scheduleNext();
}

function pauseReading() {
  setPlayingState(false);
  if (timerId) {
    window.clearTimeout(timerId);
    timerId = null;
  }
  endSession();
  scheduleSaveProgress(true);
  updateContextToggleVisibility();
}

function stopReading() {
  pauseReading();
}

function resetReading() {
  hasStarted = false;
  pauseReading();
  currentIndex = 0;
  updateStats();
  renderWord("");
  if (activeDoc) {
    activeDoc.lastIndex = 0;
    activeDoc.updatedAt = Date.now();
    dbPut(activeDoc).catch((error) => console.warn(error));
    scheduleLibraryRefresh();
  }
}

function setControlsOpen(open) {
  readerControls.classList.toggle("closed", !open);
  const span = toggleControlsBtn.querySelector("span");
  const icon = toggleControlsBtn.querySelector("[data-lucide]");
  if (span) {
    span.textContent = open ? "Hide Controls" : "Show Controls";
  } else {
    toggleControlsBtn.textContent = open ? "Hide Controls" : "Show Controls";
  }
  if (icon) {
    icon.setAttribute("data-lucide", open ? "x" : "sliders");
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  }
}

function setCustomizeOpen(open) {
  if (!customizePanel || !customizeBtn) {
    return;
  }
  customizePanel.classList.toggle("closed", !open);
  const span = customizeBtn.querySelector("span");
  const icon = customizeBtn.querySelector("[data-lucide]");
  if (span) {
    span.textContent = open ? "Close" : "Customize";
  } else {
    customizeBtn.textContent = open ? "Close" : "Customize";
  }
  if (icon) {
    icon.setAttribute("data-lucide", open ? "x" : "settings");
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  }
}

function getFullscreenElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
}

function setFullscreenState(active) {
  readerPanel.classList.toggle("fullscreen", active);
  const span = fullscreenBtn.querySelector("span");
  const icon = fullscreenBtn.querySelector("i");
  if (span) {
    span.textContent = active ? "Exit Fullscreen" : "Fullscreen";
  } else {
    fullscreenBtn.textContent = active ? "Exit Fullscreen" : "Fullscreen";
  }
  if (icon) {
    icon.setAttribute("data-lucide", active ? "minimize" : "maximize");
    // Re-render the icon
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
  document.body.style.overflow = active ? "hidden" : "";
}

function enterFullscreen() {
  isPseudoFullscreen = true;
  setFullscreenState(true);
  const request =
    readerPanel.requestFullscreen ||
    readerPanel.webkitRequestFullscreen ||
    readerPanel.msRequestFullscreen;
  if (request) {
    try {
      const result = request.call(readerPanel);
      if (result && typeof result.catch === "function") {
        result.catch((err) => console.debug("Fullscreen request failed:", err));
      }
    } catch (err) {
      console.debug("Fullscreen not supported:", err);
    }
  }
}

function exitFullscreen() {
  isPseudoFullscreen = false;
  setFullscreenState(false);
  const exit =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.msExitFullscreen;
  if (exit) {
    try {
      const result = exit.call(document);
      if (result && typeof result.catch === "function") {
        result.catch((err) => console.debug("Exit fullscreen failed:", err));
      }
    } catch (err) {
      console.debug("Exit fullscreen not supported:", err);
    }
  }
}

function syncFullscreen() {
  const active = Boolean(getFullscreenElement());
  if (active) {
    isPseudoFullscreen = false;
    setFullscreenState(true);
    return;
  }
  if (!isPseudoFullscreen) {
    setFullscreenState(false);
  }
}

async function loadPdfFile(file) {
  if (!file) {
    setPdfStatus("No PDF loaded");
    return;
  }
  if (!pdfjsLib || typeof pdfjsLib.getDocument !== "function") {
    setPdfStatus("PDF reader unavailable. Reload the page.", true);
    return;
  }
  if (file.type && file.type !== "application/pdf") {
    setPdfStatus("Please select a PDF file.", true);
    return;
  }
  isPdfLoading = true;
  isOcrEnabled = Boolean(ocrToggle && ocrToggle.checked);
  if (pdfInput) {
    pdfInput.disabled = true;
  }
  pauseReading();
  hasStarted = false;
  renderWord("Loading PDF...");
  setPdfStatus(`Loading ${file.name}...`);

  try {
    const data = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const pageTexts = [];
    let usedOcr = false;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      setPdfStatus(`Reading ${file.name} — page ${pageNumber} of ${pdf.numPages}`);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const strings = content.items
        .map((item) => item.str)
        .filter((value) => value && value.trim());
      let pageText = strings.join(" ");
      if (!pageText.trim() && isOcrEnabled) {
        try {
          const ocrText = await runOcrOnPage(page, pageNumber, pdf.numPages);
          if (ocrText.trim()) {
            usedOcr = true;
          }
          pageText = ocrText;
        } catch (error) {
          console.warn(error);
          setPdfStatus(`OCR failed on page ${pageNumber}`, true);
        }
      }
      pageTexts.push(pageText);
    }

    const text = pageTexts.join("\n");
    if (!text.trim()) {
      if (isOcrEnabled) {
        setPdfStatus(`${file.name} loaded, but OCR found no text.`, true);
        renderWord("No text found");
      } else {
        setPdfStatus(
          `${file.name} loaded, but no selectable text found. Enable OCR to scan.`,
          true,
        );
        renderWord("No selectable text");
      }
      return;
    }
    const cleanedText = text.trim();
    const baseTitle = file.name.replace(/\.pdf$/i, "");
    const docId = hashText(cleanedText);
    let doc = await dbGet(docId);
    if (!doc) {
      doc = createDocumentFromText(cleanedText, {
        title: baseTitle,
        source: usedOcr ? "pdf-ocr" : "pdf",
        meta: { fileName: file.name },
      });
    } else {
      doc.text = cleanedText;
      doc.wordCount = tokenize(cleanedText).length;
      doc.updatedAt = Date.now();
      doc.title = doc.title || baseTitle;
      doc.source = usedOcr ? "pdf-ocr" : doc.source || "pdf";
      doc.meta = { ...(doc.meta || {}), fileName: file.name };
      doc.sessions = doc.sessions || 0;
      doc.totalReadMs = doc.totalReadMs || 0;
    }
    applyDocumentState(doc);
    await dbPut(doc);
    setPdfStatus(`${file.name} loaded (${pdf.numPages} pages)`);
  } catch (error) {
    console.error(error);
    if (error && error.name === "PasswordException") {
      setPdfStatus("That PDF is password protected.", true);
      renderWord("PDF locked");
    } else {
      setPdfStatus("Could not read that PDF. Try another file.", true);
      renderWord("PDF load failed");
    }
  } finally {
    isPdfLoading = false;
    if (pdfInput) {
      pdfInput.disabled = false;
      pdfInput.value = "";
    }
  }
}

async function loadEpubFile(file) {
  if (!file) {
    setEpubStatus("No EPUB loaded");
    return;
  }
  if (!epubjsLib || typeof epubjsLib !== "function") {
    setEpubStatus("EPUB reader unavailable. Reload the page.", true);
    return;
  }
  const isValidEpub = file.type === "application/epub+zip" ||
    file.name.toLowerCase().endsWith(".epub");
  if (!isValidEpub) {
    setEpubStatus("Please select an EPUB file.", true);
    return;
  }
  isEpubLoading = true;
  if (epubInput) {
    epubInput.disabled = true;
  }
  if (pdfInput) {
    pdfInput.disabled = true;
  }
  pauseReading();
  hasStarted = false;
  renderWord("Loading EPUB...");
  setEpubStatus(`Loading ${file.name}...`);

  try {
    const data = await file.arrayBuffer();
    const book = epubjsLib(data);

    // Wait for full book initialization - opened is required in epub.js 0.3.x
    await book.opened;

    const spine = book.spine;
    const spineLength = spine.length || (spine.spineItems ? spine.spineItems.length : 0);
    const sectionTexts = [];

    for (let i = 0; i < spineLength; i += 1) {
      const section = spine.get(i);
      if (!section) {
        continue;
      }
      if (section.linear === false) {
        continue;
      }
      setEpubStatus(`Reading ${file.name} — section ${i + 1} of ${spineLength}`);
      try {
        const contents = await section.load(book.load.bind(book));
        const sectionText = extractSectionText(contents);
        if (sectionText && sectionText.trim()) {
          sectionTexts.push(sectionText.trim());
        }
        section.unload();
      } catch (sectionError) {
        console.warn(`Failed to load section ${i}:`, sectionError);
      }
    }

    const text = sectionTexts.join("\n");
    if (!text.trim()) {
      setEpubStatus(`${file.name} loaded, but no readable text found.`, true);
      renderWord("No text found");
      return;
    }

    const cleanedText = text.trim();
    const baseTitle = file.name.replace(/\.epub$/i, "");
    const docId = hashText(cleanedText);
    let doc = await dbGet(docId);
    if (!doc) {
      doc = createDocumentFromText(cleanedText, {
        title: baseTitle,
        source: "epub",
        meta: { fileName: file.name },
      });
    } else {
      doc.text = cleanedText;
      doc.wordCount = tokenize(cleanedText).length;
      doc.updatedAt = Date.now();
      doc.title = doc.title || baseTitle;
      doc.source = doc.source || "epub";
      doc.meta = { ...(doc.meta || {}), fileName: file.name };
      doc.sessions = doc.sessions || 0;
      doc.totalReadMs = doc.totalReadMs || 0;
    }
    applyDocumentState(doc);
    await dbPut(doc);
    setEpubStatus(`${file.name} loaded (${spineLength} sections)`);
    if (book.destroy) {
      book.destroy();
    }
  } catch (error) {
    console.error(error);
    setEpubStatus("Could not read that EPUB. Try another file.", true);
    renderWord("EPUB load failed");
  } finally {
    isEpubLoading = false;
    if (epubInput) {
      epubInput.disabled = false;
      epubInput.value = "";
    }
    if (pdfInput) {
      pdfInput.disabled = false;
    }
  }
}

textInput.addEventListener("input", () => {
  if (isSettingText) {
    return;
  }
  originalText = textInput.value;
  words = tokenize(textInput.value);
  currentIndex = 0;
  hasStarted = false;
  updateStats();
  if (words.length) {
    currentIndex = 0;
    renderWordAtIndex(0);
  } else {
    renderWord("Paste text or upload a PDF");
  }
  updatePlayStateUI();
  if (activeDoc) {
    activeDoc = null;
  }
  updateReaderDocLabel();
  updateHistoryPanel();
});

if (docTitle) {
  docTitle.addEventListener("input", () => {
    if (activeDoc) {
      activeDoc.title = docTitle.value.trim() || activeDoc.title;
      scheduleSaveProgress(true);
      updateReaderDocLabel();
    } else {
      updateReaderDocLabel();
    }
  });
}

if (pdfInput) {
  pdfInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      setPdfStatus("No PDF loaded");
      return;
    }
    loadPdfFile(file);
  });
}

if (epubInput) {
  epubInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      setEpubStatus("No EPUB loaded");
      return;
    }
    loadEpubFile(file);
  });
}

if (ocrToggle) {
  ocrToggle.addEventListener("change", () => {
    isOcrEnabled = Boolean(ocrToggle.checked);
    if (isOcrEnabled) {
      setPdfStatus("OCR enabled for scanned PDFs");
    } else {
      setPdfStatus("OCR disabled");
    }
  });
}

if (focusHighlightToggle) {
  focusHighlightToggle.addEventListener("change", () => {
    setFocusHighlightEnabled(focusHighlightToggle.checked);
  });
}

if (focusColorPicker) {
  focusColorPicker.addEventListener("input", () => {
    setFocusColor(focusColorPicker.value);
  });
}

if (focusColorButtons && focusColorButtons.length) {
  focusColorButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const color = button.dataset.focusColor;
      if (color) {
        if (focusColorPicker) {
          focusColorPicker.value = color;
        }
        setFocusColor(color);
      }
    });
  });
}

if (libraryList) {
  libraryList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    
    // Use .closest to handle clicks on icons or spans within buttons
    const button = target.closest("[data-doc-action]");
    if (!button) {
      return;
    }
    
    const action = button.dataset.docAction;
    const id = button.dataset.docId;
    if (!action || !id) {
      return;
    }
    if (action === "resume") {
      loadDocumentById(id, { restart: false }).catch((error) => console.warn(error));
    }
    if (action === "restart") {
      loadDocumentById(id, { restart: true }).catch((error) => console.warn(error));
    }
    if (action === "delete") {
      dbDelete(id)
        .then(() => {
          if (activeDoc && activeDoc.id === id) {
            activeDoc = null;
            updateReaderDocLabel();
            updateHistoryPanel();
          }
          refreshLibrary();
        })
        .catch((error) => console.warn(error));
    }
  });
}

if (addEntryBtn) {
  addEntryBtn.addEventListener("click", () => {
    const isHidden = inputSection.classList.contains("hidden");
    const icon = addEntryBtn.querySelector("[data-lucide]");
    if (isHidden) {
      // Deactivate current book when adding new entry
      activeDoc = null;
      words = [];
      currentIndex = 0;
      hasStarted = false;
      isPlaying = false;
      renderWord("Paste text or upload a PDF");
      updateStats();
      updatePlayStateUI();
      updateReaderDocLabel();
      updateHistoryPanel();
      
      // Hide controls section
      const controlsSection = document.querySelector('.controls-section');
      if (controlsSection) {
        controlsSection.classList.add('hidden');
      }
      
      // Clear text input and title
      textInput.value = "";
      docTitle.value = "";
      
      // Show input sections with animation
      inputSection.classList.remove("hidden");
      uploadSection.classList.remove("hidden");
      const span = addEntryBtn.querySelector("span");
      if (span) {
        span.textContent = "Hide Input";
      } else {
        addEntryBtn.textContent = "Hide Input";
      }
      
      if (icon) {
        icon.setAttribute("data-lucide", "x");
      }
      
      // Add visual feedback
      addEntryBtn.classList.add("active");
      setTimeout(() => {
        addEntryBtn.classList.remove("active");
      }, 300);
    } else {
      // Hide input sections with animation
      inputSection.classList.add("hidden");
      uploadSection.classList.add("hidden");
      const span = addEntryBtn.querySelector("span");
      if (span) {
        span.textContent = "Add Entry";
      } else {
        addEntryBtn.textContent = "Add Entry";
      }
      
      if (icon) {
        icon.setAttribute("data-lucide", "plus");
      }
    }
    
    if (icon && typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  });
}

// Add save button functionality
function createSaveButton() {
  const saveBtn = document.createElement("button");
  saveBtn.id = "saveEntryBtn";
  saveBtn.innerHTML = `<i data-lucide="save" class="icon"></i><span>Save Entry</span>`;
  saveBtn.className = "primary";
  saveBtn.style.marginTop = "12px";
  saveBtn.addEventListener("click", async () => {
    const rawText = textInput.value.trim();
    if (!rawText) {
      showNotification("Please enter some text to save", "error");
      return;
    }
    
    try {
      saveBtn.disabled = true;
      const span = saveBtn.querySelector("span");
      if (span) {
        span.textContent = "Saving...";
      } else {
        saveBtn.textContent = "Saving...";
      }
      
      const doc = await ensureActiveDocumentFromText();
      if (doc) {
        showNotification("Entry saved successfully!", "success");
        
        // Hide input sections after saving
        inputSection.classList.add("hidden");
        uploadSection.classList.add("hidden");
        if (addEntryBtn) {
          const addSpan = addEntryBtn.querySelector("span");
          const addIcon = addEntryBtn.querySelector("[data-lucide]");
          if (addSpan) {
            addSpan.textContent = "Add Entry";
          } else {
            addEntryBtn.textContent = "Add Entry";
          }
          if (addIcon) {
            addIcon.setAttribute("data-lucide", "plus");
            if (typeof lucide !== "undefined") lucide.createIcons();
          }
        }
      }
    } catch (error) {
      console.warn(error);
      showNotification("Failed to save entry. Please try again.", "error");
    } finally {
      saveBtn.disabled = false;
      const span = saveBtn.querySelector("span");
      if (span) {
        span.textContent = "Save Entry";
      } else {
        saveBtn.textContent = "Save Entry";
      }
    }
  });
  
  return saveBtn;
}

// Create notification system
function showNotification(message, type = "info") {
  // Remove existing notifications
  const existingNotification = document.querySelector(".notification");
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  // Style notification
  Object.assign(notification.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    padding: "12px 20px",
    borderRadius: "8px",
    color: "#ffffff",
    fontWeight: "600",
    zIndex: "3000",
    transform: "translateX(100%)",
    transition: "transform 0.3s ease",
    backgroundColor: type === "success" ? "#32d74b" : type === "error" ? "#ff3b30" : "#36a3ff"
  });
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.style.transform = "translateX(0)";
  }, 100);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.transform = "translateX(100%)";
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  }, 3000);
}

// Add save button to input section
document.addEventListener("DOMContentLoaded", () => {
  const inputSection = document.querySelector(".input-section");
  if (inputSection) {
    const saveBtn = createSaveButton();
    inputSection.appendChild(saveBtn);
  }
});

// Add paste shortcut for faster text input
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey) {
    // Ctrl/Cmd + N: New entry
    if (event.key === "n" || event.key === "N") {
      event.preventDefault();
      if (addEntryBtn) {
        const isHidden = inputSection.classList.contains("hidden");
        if (isHidden) {
          addEntryBtn.click();
        }
      }
    }
    // Ctrl/Cmd + S: Save entry (when input section is visible)
    if (event.key === "s" || event.key === "S") {
      const inputSection = document.querySelector(".input-section");
      const saveBtn = document.getElementById("saveEntryBtn");
      if (inputSection && !inputSection.classList.contains("hidden") && saveBtn) {
        event.preventDefault();
        saveBtn.click();
      }
    }
  }
});

if (clearLibraryBtn) {
  clearLibraryBtn.addEventListener("click", () => {
    if (!window.confirm("Clear all saved documents?")) {
      return;
    }
    dbClear()
      .then(() => {
        if (activeDoc) {
          activeDoc = null;
          updateReaderDocLabel();
          updateHistoryPanel();
        }
        refreshLibrary();
      })
      .catch((error) => console.warn(error));
  });
}

if (inputPanel) {
  const stopDefaults = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  ["dragenter", "dragover"].forEach((eventName) => {
    inputPanel.addEventListener(eventName, (event) => {
      stopDefaults(event);
      inputPanel.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    inputPanel.addEventListener(eventName, (event) => {
      stopDefaults(event);
      inputPanel.classList.remove("drag-over");
    });
  });
  inputPanel.addEventListener("drop", (event) => {
    const files = event.dataTransfer ? Array.from(event.dataTransfer.files || []) : [];
    const epubFile = files.find((item) => item.type === "application/epub+zip" || /\.epub$/i.test(item.name));
    const pdfFile = files.find((item) => item.type === "application/pdf" || /\.pdf$/i.test(item.name));
    if (epubFile) {
      loadEpubFile(epubFile);
      return;
    }
    if (pdfFile) {
      loadPdfFile(pdfFile);
      return;
    }
    setPdfStatus("Drop a PDF or EPUB file to load.", true);
    setEpubStatus("Drop a PDF or EPUB file to load.", true);
  });
}

actionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "start") {
      void startReading();
      return;
    }
    if (action === "pause") {
      if (isPlaying) {
        pauseReading();
      } else {
        void startReading();
      }
      return;
    }
    if (action === "reset") {
      resetReading();
    }
    if (action === "back10") {
      jumpWords(-10);
    }
    if (action === "forward10") {
      jumpWords(10);
    }
    if (action === "rewind3") {
      rewindSeconds(3);
    }
  });
});

toggleControlsBtn.addEventListener("click", () => {
  const isClosed = readerControls.classList.contains("closed");
  setControlsOpen(isClosed);
});

if (customizeBtn) {
  customizeBtn.addEventListener("click", () => {
    const isClosed = customizePanel ? customizePanel.classList.contains("closed") : true;
    setCustomizeOpen(isClosed);
  });
}

fullscreenBtn.addEventListener("click", () => {
  const isActive =
    Boolean(getFullscreenElement()) ||
    readerPanel.classList.contains("fullscreen");
  if (isActive) {
    exitFullscreen();
  } else {
    enterFullscreen();
  }
});

if (contextToggle) {
  contextToggle.addEventListener("click", toggleContextView);
}

// Modal Event Listeners
if (closeContextModal) {
  closeContextModal.addEventListener("click", hideContextView);
}

if (modalCloseBtn) {
  modalCloseBtn.addEventListener("click", hideContextView);
}

if (modalPrevParagraph) {
  modalPrevParagraph.addEventListener("click", goToPrevParagraph);
}

if (modalNextParagraph) {
  modalNextParagraph.addEventListener("click", goToNextParagraph);
}

// Close modal on background click
if (contextModal) {
  contextModal.addEventListener("click", (event) => {
    if (event.target === contextModal) {
      hideContextView();
    }
  });
}

speedRange.addEventListener("input", (event) => {
  wpm = Number(event.target.value);
  updateDial();
  if (activeDoc) {
    scheduleSaveProgress(true);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.target === textInput || event.target.tagName === "INPUT") {
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    if (isPlaying) {
      pauseReading();
    } else {
      void startReading();
    }
  }
  if (event.key.toLowerCase() === "r") {
    resetReading();
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    if (isContextViewActive) {
      goToPrevParagraph();
    } else if (event.shiftKey) {
      jumpWords(-10);
    } else {
      stepWord("back");
    }
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    if (isContextViewActive) {
      goToNextParagraph();
    } else if (event.shiftKey) {
      jumpWords(10);
    } else {
      stepWord("forward");
    }
  }
  if (event.key.toLowerCase() === "c" && !isPlaying && hasStarted) {
    toggleContextView();
  }
  if (event.key === "Escape" && isContextViewActive) {
    hideContextView();
  }
});

document.addEventListener("fullscreenchange", syncFullscreen);
document.addEventListener("webkitfullscreenchange", syncFullscreen);
document.addEventListener("msfullscreenchange", syncFullscreen);

if (autoPaceToggle) {
  autoPaceToggle.addEventListener("change", () => {
    isAutoPaceEnabled = autoPaceToggle.checked;
    
    // Show settings when first enabled
    if (isAutoPaceEnabled) {
      autoPaceSettings.classList.add("visible");
      autoPaceStartWpm = Number(startPaceInput.value) || 150;
      autoPaceMaxWpm = Number(maxPaceInput.value) || 400;
      if (!isPlaying && !hasStarted) {
        wpm = autoPaceStartWpm;
        updateDial();
      }
    } else {
      autoPaceSettings.classList.remove("visible");
    }
  });
}

// Toggle settings when clicking the label area (if already enabled)
if (autoPaceLabel) {
  autoPaceLabel.addEventListener("click", (e) => {
    // If clicking on the checkbox itself, let the 'change' event handle it
    if (e.target === autoPaceToggle) return;
    
    // If enabled, toggle visibility on text click without disabling
    if (autoPaceToggle.checked) {
      e.preventDefault(); // Prevent checkbox from toggling
      autoPaceSettings.classList.toggle("visible");
    }
  });
}

if (closePaceSettings) {
  closePaceSettings.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    autoPaceSettings.classList.remove("visible");
  });
}

if (startPaceInput) {
  startPaceInput.addEventListener("change", () => {
    autoPaceStartWpm = Number(startPaceInput.value) || 150;
    if (isAutoPaceEnabled && !hasStarted) {
      wpm = autoPaceStartWpm;
      updateDial();
    }
  });
}

if (maxPaceInput) {
  maxPaceInput.addEventListener("change", () => {
    autoPaceMaxWpm = Number(maxPaceInput.value) || 400;
  });
}

// Close auto-pace settings on outside click
document.addEventListener("click", (event) => {
  if (autoPaceSettings && autoPaceSettings.classList.contains("visible") && !autoPace.contains(event.target)) {
    autoPaceSettings.classList.remove("visible");
  }
});

updateStats();
updateDial();
applyPrefs(loadPrefs());
renderWord("Paste text or upload a PDF");
updatePlayStateUI();
setControlsOpen(false);
setCustomizeOpen(false);
updateReaderDocLabel();
updateHistoryPanel();
refreshLibrary();

window.addEventListener("beforeunload", () => {
  if (ocrWorker) {
    ocrWorker.terminate().catch(() => {});
    ocrWorker = null;
  }
});

// Initialize Lucide icons
if (typeof lucide !== 'undefined') {
  lucide.createIcons();
} else {
  // Load Lucide dynamically if not available
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/lucide@latest/dist/umd/lucide.js';
  script.onload = () => {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  };
  document.head.appendChild(script);
}
