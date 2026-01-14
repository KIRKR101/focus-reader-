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
const readerDoc = document.getElementById("readerDoc");
const actionButtons = document.querySelectorAll("[data-action]");
const pauseButtons = document.querySelectorAll('[data-action="pause"]');
const pdfInput = document.getElementById("pdfInput");
const pdfStatus = document.getElementById("pdfStatus");
const ocrToggle = document.getElementById("ocrToggle");
const libraryList = document.getElementById("libraryList");
const libraryEmpty = document.getElementById("libraryEmpty");
const clearLibraryBtn = document.getElementById("clearLibraryBtn");
const dropOverlay = document.getElementById("dropOverlay");
const inputPanel = document.querySelector(".input-panel");
const pdfjsLib = window.pdfjsLib;
const autoPaceToggle = document.getElementById("autoPaceToggle");
const autoPaceSettings = document.getElementById("autoPaceSettings");
const startPaceInput = document.getElementById("startPace");
const maxPaceInput = document.getElementById("maxPace");
const liveWpmEl = document.getElementById("liveWpm");

let words = [];
let currentIndex = 0;
let timerId = null;
let isPlaying = false;
let wpm = Number(speedRange.value);
let isPseudoFullscreen = false;
let hasStarted = false;
let isPdfLoading = false;
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
const AUTO_PACE_WORDS_PER_STEP = 25;

const PDF_WORKER_SRC =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
const TESSERACT_SRC =
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const DB_NAME = "focus-reader";
const DB_VERSION = 1;
const STORE_NAME = "documents";

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
    meta: options.meta || {},
  };
}

function applyDocumentState(doc, options = {}) {
  activeDoc = doc;
  if (docTitle && doc) {
    docTitle.value = doc.title || "";
  }
  if (options.setText !== false && doc && typeof doc.text === "string") {
    isSettingText = true;
    textInput.value = doc.text;
    isSettingText = false;
  }
  words = doc ? tokenize(doc.text || "") : [];
  currentIndex = doc ? Math.min(doc.lastIndex || 0, words.length) : 0;
  updateStats();
  renderWord(words[currentIndex] || "");
  if (doc && typeof doc.wpm === "number") {
    wpm = doc.wpm;
    speedRange.value = wpm.toString();
    updateDial();
  }
  updateReaderDocLabel();
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
  }, 400);
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
  if (!docs.length) {
    libraryEmpty.style.display = "block";
    return;
  }
  libraryEmpty.style.display = "none";
  docs.forEach((doc) => {
    const item = document.createElement("li");
    item.className = "library-item";
    if (activeDoc && doc.id === activeDoc.id) {
      item.classList.add("active");
    }

    const info = document.createElement("div");
    const name = document.createElement("p");
    name.className = "library-name";
    name.textContent = doc.title || "Untitled";
    const meta = document.createElement("p");
    meta.className = "library-meta";
    const progress = getProgressPercent(doc.lastIndex || 0, doc.wordCount || 0);
    meta.textContent = `${progress}% | ${doc.wordCount || 0} words | ${formatTimestamp(doc.lastReadAt)}`;
    info.appendChild(name);
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "library-actions";

    const resumeButton = document.createElement("button");
    resumeButton.textContent = "Resume";
    resumeButton.dataset.docAction = "resume";
    resumeButton.dataset.docId = doc.id;

    const restartButton = document.createElement("button");
    restartButton.textContent = "Restart";
    restartButton.dataset.docAction = "restart";
    restartButton.dataset.docId = doc.id;

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.dataset.docAction = "delete";
    deleteButton.dataset.docId = doc.id;

    actions.appendChild(resumeButton);
    actions.appendChild(restartButton);
    actions.appendChild(deleteButton);

    item.appendChild(info);
    item.appendChild(actions);
    libraryList.appendChild(item);
  });
}

async function loadDocumentById(id, options = {}) {
  if (!id) {
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
  if (!activeDoc.title || !activeDoc.title.trim()) {
    activeDoc.title = deriveTitle(activeDoc.text || "") || "Untitled";
  }
  await dbPut(activeDoc);
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

  renderWord(words[currentIndex] || "");
  updateStats();
  scheduleSaveProgress();
}

function calculateAutoPaceWpm() {
  if (!isAutoPaceEnabled || !words.length) {
    return wpm;
  }
  const totalWords = words.length;
  const progress = currentIndex / totalWords;
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
  if (!isPlaying && hasStarted) {
    label = "Resume";
  }
  pauseButtons.forEach((button) => {
    button.textContent = label;
  });
}

function setPlayingState(nextState) {
  isPlaying = nextState;
  updatePlayStateUI();
  updateLiveWpm();
}

function setPdfStatus(message, isError = false) {
  if (!pdfStatus) {
    return;
  }
  pdfStatus.textContent = message;
  pdfStatus.classList.toggle("error", isError);
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
  renderWord(word);
  currentIndex += 1;
  updateStats();
  scheduleSaveProgress();
  timerId = window.setTimeout(scheduleNext, getDelay(word));
}

async function startReading() {
  if (isPdfLoading) {
    renderWord("Loading PDF...");
    return;
  }
  if (!words.length) {
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
  scheduleNext();
}

function pauseReading() {
  setPlayingState(false);
  if (timerId) {
    window.clearTimeout(timerId);
    timerId = null;
  }
  scheduleSaveProgress(true);
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
  toggleControlsBtn.textContent = open ? "Hide Controls" : "Show Controls";
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
  fullscreenBtn.textContent = active ? "Exit Fullscreen" : "Fullscreen";
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

textInput.addEventListener("input", () => {
  if (isSettingText) {
    return;
  }
  words = tokenize(textInput.value);
  currentIndex = 0;
  hasStarted = false;
  updateStats();
  if (words.length) {
    renderWord(words[0]);
  } else {
    renderWord("Paste text or upload a PDF");
  }
  updatePlayStateUI();
  if (activeDoc) {
    activeDoc = null;
  }
  updateReaderDocLabel();
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

if (libraryList) {
  libraryList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const action = target.dataset.docAction;
    const id = target.dataset.docId;
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
          }
          refreshLibrary();
        })
        .catch((error) => console.warn(error));
    }
  });
}

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
    const pdfFile = files.find((item) => item.type === "application/pdf" || /\.pdf$/i.test(item.name));
    if (!pdfFile) {
      setPdfStatus("Drop a PDF file to load.", true);
      return;
    }
    loadPdfFile(pdfFile);
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
  });
});

toggleControlsBtn.addEventListener("click", () => {
  const isClosed = readerControls.classList.contains("closed");
  setControlsOpen(isClosed);
});

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
    stepWord("back");
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    stepWord("forward");
  }
});

document.addEventListener("fullscreenchange", syncFullscreen);
document.addEventListener("webkitfullscreenchange", syncFullscreen);
document.addEventListener("msfullscreenchange", syncFullscreen);

if (autoPaceToggle) {
  autoPaceToggle.addEventListener("change", () => {
    isAutoPaceEnabled = autoPaceToggle.checked;
    autoPaceSettings.classList.toggle("visible", isAutoPaceEnabled);
    if (isAutoPaceEnabled) {
      autoPaceStartWpm = Number(startPaceInput.value) || 150;
      autoPaceMaxWpm = Number(maxPaceInput.value) || 400;
      if (!isPlaying && !hasStarted) {
        wpm = autoPaceStartWpm;
        updateDial();
      }
    }
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

updateStats();
updateDial();
renderWord("Paste text or upload a PDF");
updatePlayStateUI();
setControlsOpen(false);
updateReaderDocLabel();
refreshLibrary();

window.addEventListener("beforeunload", () => {
  if (ocrWorker) {
    ocrWorker.terminate().catch(() => {});
    ocrWorker = null;
  }
});
