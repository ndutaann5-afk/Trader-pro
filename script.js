/* =========================================================
   TRADER PRO — DERIV LIVE DIGIT ANALYZER
   ========================================================= */

"use strict";

/* -----------------------------
   CONFIG
----------------------------- */

const DERIV_WS = "wss://ws.binaryws.com/websockets/v3";

let socket = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let analysisRunning = false;
let currentSymbol = null;
let tickHistory = [];
let digitCounts = Array(10).fill(0);
let markets = [];

/* -----------------------------
   FIND / CREATE UI
----------------------------- */

function findButtonByText(text) {
  const buttons = Array.from(document.querySelectorAll("button"));
  return buttons.find(
    b => b.textContent.trim().toLowerCase() === text.toLowerCase()
  );
}

let startButton =
  document.getElementById("startAnalysis") ||
  document.getElementById("start") ||
  findButtonByText("Start Analysis");

let stopButton =
  document.getElementById("stopAnalysis") ||
  document.getElementById("stop") ||
  findButtonByText("Stop Analysis");

function createElementIfMissing(id, tag = "div") {
  let el = document.getElementById(id);

  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    document.body.appendChild(el);
  }

  return el;
}

const statusBox = createElementIfMissing("connectionStatus");
const marketBox = createElementIfMissing("marketStatus");
const digitBox = createElementIfMissing("digitAnalysis");
const predictionBox = createElementIfMissing("prediction");
const historyBox = createElementIfMissing("tickHistory");

statusBox.style.marginTop = "12px";
marketBox.style.marginTop = "8px";
digitBox.style.marginTop = "8px";
predictionBox.style.marginTop = "8px";
historyBox.style.marginTop = "8px";

function setConnection(message, connected = false) {
  statusBox.textContent = message;
  statusBox.dataset.connected = connected ? "true" : "false";
}

function showError(message) {
  setConnection("❌ " + message, false);
  console.error("Trader Pro:", message);
}

/* -----------------------------
   CONNECT TO DERIV
----------------------------- */

function connectDeriv() {
  clearTimeout(reconnectTimer);

  if (socket) {
    try {
      socket.close();
    } catch (e) {}
  }

  setConnection("Connecting to Deriv...", false);

  try {
    socket = new WebSocket(DERIV_WS);
  } catch (error) {
    showError("Could not create WebSocket.");
    scheduleReconnect();
    return;
  }

  socket.onopen = function () {
    reconnectAttempts = 0;

    setConnection(
      "🟢 Connected to Deriv — loading markets...",
      true
    );

    requestMarkets();
  };

  socket.onmessage = function (event) {
    handleMessage(event.data);
  };

  socket.onerror = function (error) {
    console.error("Deriv WebSocket error:", error);
    setConnection("⚠️ Deriv WebSocket error", false);
  };

  socket.onclose = function () {
    setConnection("🔴 Disconnected from Deriv", false);

    if (analysisRunning) {
      scheduleReconnect();
    }
  };
}

/* -----------------------------
   RECONNECT
----------------------------- */

function scheduleReconnect() {
  if (!analysisRunning) return;

  clearTimeout(reconnectTimer);

  reconnectAttempts++;

  const delay = Math.min(
    1000 * Math.pow(2, reconnectAttempts),
    10000
  );

  setConnection(
    "Reconnecting to Deriv in " +
      Math.round(delay / 1000) +
      "s..."
  );

  reconnectTimer = setTimeout(() => {
    connectDeriv();
  }, delay);
}

/* -----------------------------
   SEND REQUEST
----------------------------- */

function sendRequest(request) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showError("Deriv is not connected.");
    return false;
  }

  socket.send(JSON.stringify(request));
  return true;
}

/* -----------------------------
   GET MARKETS
----------------------------- */

function requestMarkets() {
  sendRequest({
    active_symbols: "brief",
    product_type: "basic",
    req_id: 1
  });
}

/* -----------------------------
   MESSAGE HANDLER
----------------------------- */

function handleMessage(raw) {
  let data;

  try {
    data = JSON.parse(raw);
  } catch (error) {
    console.error("Invalid Deriv message:", raw);
    return;
  }

  console.log("Deriv:", data);

  if (data.error) {
    showError(
      "Deriv: " +
        (data.error.message || "Unknown API error")
    );
    return;
  }

  /* Markets received */
  if (data.msg_type === "active_symbols") {
    handleMarkets(data.active_symbols || []);
    return;
  }

  /* Live tick received */
  if (data.msg_type === "tick") {
    handleTick(data.tick);
    return;
  }
}

/* -----------------------------
   SELECT MARKET
----------------------------- */

function handleMarkets(symbols) {
  markets = symbols.filter(symbol => {
    const code = symbol.symbol || "";

    return (
      code.startsWith("R_") ||
      code.startsWith("1HZ") ||
      code.startsWith("BOOM") ||
      code.startsWith("CRASH")
    );
  });

  if (markets.length === 0) {
    markets = symbols;
  }

  if (markets.length === 0) {
    showError("No Deriv markets were returned.");
    return;
  }

  /* Prefer Volatility 100 / 1HZ100 */
  let preferred =
    markets.find(m =>
      String(m.symbol).includes("1HZ100")
    ) ||
    markets.find(m =>
      String(m.symbol).includes("R_100")
    ) ||
    markets[0];

  currentSymbol = preferred.symbol;

  marketBox.textContent =
    "Market: " +
    (preferred.display_name || currentSymbol);

  subscribeToTicks(currentSymbol);
}

/* -----------------------------
   SUBSCRIBE TO TICKS
----------------------------- */

function subscribeToTicks(symbol) {
  currentSymbol = symbol;

  tickHistory = [];
  digitCounts = Array(10).fill(0);

  marketBox.textContent =
    "📊 Market: " +
    (symbol || "Unknown");

  sendRequest({
    ticks: symbol,
    subscribe: 1,
    req_id: 2
  });

  digitBox.textContent =
    "Waiting for live ticks...";
}

/* -----------------------------
   HANDLE TICK
----------------------------- */

function handleTick(tick) {
  if (!tick || tick.quote === undefined) {
    return;
  }

  const quote = Number(tick.quote);

  if (!Number.isFinite(quote)) {
    return;
  }

  /*
    Deriv supplies pip_size in many tick responses.
    We use it when available to preserve the displayed
    last decimal digit.
  */

  const pipSize =
    Number.isInteger(tick.pip_size)
      ? tick.pip_size
      : 2;

  const formatted = quote.toFixed(pipSize);

  const lastCharacter =
    formatted.charAt(formatted.length - 1);

  const digit = Number(lastCharacter);

  if (!Number.isInteger(digit)) {
    return;
  }

  tickHistory.push({
    quote,
    digit,
    epoch: tick.epoch
  });

  if (tickHistory.length > 100) {
    tickHistory.shift();
  }

  digitCounts[digit]++;

  updateAnalysis(quote, digit);
}

/* -----------------------------
   ANALYSIS
----------------------------- */

function updateAnalysis(quote, lastDigit) {
  const total = digitCounts.reduce(
    (sum, value) => sum + value,
    0
  );

  if (total === 0) return;

  let highestDigit = 0;
  let highestCount = digitCounts[0];

  for (let i = 1; i < 10; i++) {
    if (digitCounts[i] > highestCount) {
      highestDigit = i;
      highestCount = digitCounts[i];
    }
  }

  const probability =
    (highestCount / total) * 100;

  const recent = tickHistory.slice(-20);

  const recentCounts = Array(10).fill(0);

  recent.forEach(item => {
    recentCounts[item.digit]++;
  });

  let recentHighest = 0;

  for (let i = 1; i < 10; i++) {
    if (
      recentCounts[i] >
      recentCounts[recentHighest]
    ) {
      recentHighest = i;
    }
  }

  const recentProbability =
    recent.length > 0
      ? (recentCounts[recentHighest] / recent.length) * 100
      : 0;

  /*
    Simple consistency measure:
    compare long-run and recent dominant digits.
  */

  let confidence = 50;

  if (highestDigit === recentHighest) {
    confidence += 15;
  }

  if (probability >= 15) {
    confidence += 10;
  }

  if (recentProbability >= 20) {
    confidence += 10;
  }

  if (recent.length >= 20) {
    confidence += 5;
  }

  confidence = Math.min(confidence, 90);

  predictionBox.innerHTML =
    "Last digit: <strong>" +
    lastDigit +
    "</strong><br>" +
    "Most frequent digit: <strong>" +
    highestDigit +
    "</strong><br>" +
    "Observed frequency: <strong>" +
    probability.toFixed(1) +
    "%</strong><br>" +
    "Recent dominant digit: <strong>" +
    recentHighest +
    "</strong><br>" +
    "Analysis confidence: <strong>" +
    confidence +
    "%</strong>";

  digitBox.innerHTML =
    "<strong>Digit distribution</strong><br>" +
    digitCounts
      .map((count, digit) => {
        const pct =
          total > 0
            ? ((count / total) * 100).toFixed(1)
            : "0.0";

        return (
          digit +
          ": " +
          count +
          " (" +
          pct +
          "%)"
        );
      })
      .join(" | ");

  historyBox.innerHTML =
    "<strong>Latest price:</strong> " +
    quote +
    "<br><strong>Ticks analysed:</strong> " +
    total;
}

/* -----------------------------
   START ANALYSIS
----------------------------- */

function startAnalysis() {
  if (analysisRunning) return;

  analysisRunning = true;

  setConnection(
    "Starting Trader Pro..."
  );

  tickHistory = [];
  digitCounts = Array(10).fill(0);

  connectDeriv();
}

/* -----------------------------
   STOP ANALYSIS
----------------------------- */

function stopAnalysis() {
  analysisRunning = false;

  clearTimeout(reconnectTimer);

  if (socket) {
    try {
      socket.close();
    } catch (e) {}
  }

  socket = null;

  setConnection(
    "⏹ Analysis stopped",
    false
  );
}

/* -----------------------------
   BUTTONS
----------------------------- */

if (startButton) {
  startButton.addEventListener(
    "click",
    startAnalysis
  );
}

if (stopButton) {
  stopButton.addEventListener(
    "click",
    stopAnalysis
  );
}

/* -----------------------------
   INITIAL STATUS
----------------------------- */

setConnection(
  "Ready — press Start Analysis"
);

console.log(
  "Trader Pro loaded successfully."
); 
