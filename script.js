"use strict";

/*
  TRADER PRO
  Current Deriv Public WebSocket
  Public market data only — no token required.
*/

const DERIV_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";

let socket = null;
let reconnectTimer = null;
let analysisRunning = false;
let reconnectAttempts = 0;

let tickHistory = [];
let digitCounts = Array(10).fill(0);

const MAX_TICKS = 100;

/* -----------------------------
   UI HELPERS
----------------------------- */

function findButton(text) {
  return [...document.querySelectorAll("button")]
    .find(button =>
      button.textContent.trim().toLowerCase() ===
      text.toLowerCase()
    );
}

function getOrCreate(id) {
  let element = document.getElementById(id);

  if (!element) {
    element = document.createElement("div");
    element.id = id;
    document.body.appendChild(element);
  }

  return element;
}

const statusBox = getOrCreate("connectionStatus");
const marketBox = getOrCreate("marketStatus");
const digitBox = getOrCreate("digitAnalysis");
const predictionBox = getOrCreate("prediction");
const historyBox = getOrCreate("tickHistory");

const startButton =
  document.getElementById("startAnalysis") ||
  document.getElementById("start") ||
  findButton("Start Analysis");

const stopButton =
  document.getElementById("stopAnalysis") ||
  document.getElementById("stop") ||
  findButton("Stop Analysis");

function setStatus(message) {
  statusBox.textContent = message;
  console.log(message);
}

/* -----------------------------
   CONNECT
----------------------------- */

function connectDeriv() {

  clearTimeout(reconnectTimer);

  if (socket) {
    try {
      socket.close();
    } catch (error) {}
  }

  setStatus("Connecting to live Deriv data...");

  try {

    socket = new WebSocket(DERIV_WS);

  } catch (error) {

    console.error(
      "WebSocket creation error:",
      error
    );

    setStatus(
      "Could not create WebSocket."
    );

    scheduleReconnect();

    return;
  }

  socket.onopen = function () {

    reconnectAttempts = 0;

    setStatus(
      "🟢 Connected to live Deriv data"
    );

    subscribeToTicks();

  };

  socket.onmessage = function (event) {

    handleMessage(event.data);

  };

  socket.onerror = function (event) {

    console.error(
      "Deriv WebSocket error:",
      event
    );

    setStatus(
      "⚠️ Deriv WebSocket error"
    );

  };

  socket.onclose = function (event) {

    console.log(
      "WebSocket closed:",
      event.code,
      event.reason
    );

    setStatus(
      "🔴 Disconnected — code " +
      event.code
    );

    if (analysisRunning) {
      scheduleReconnect();
    }

  };
}

/* -----------------------------
   RECONNECT
----------------------------- */

function scheduleReconnect() {

  if (!analysisRunning) {
    return;
  }

  clearTimeout(reconnectTimer);

  reconnectAttempts++;

  const delay =
    Math.min(
      1000 *
      Math.pow(2, reconnectAttempts - 1),
      15000
    );

  setStatus(
    "Reconnecting in " +
    Math.ceil(delay / 1000) +
    " seconds..."
  );

  reconnectTimer = setTimeout(
    connectDeriv,
    delay
  );
}

/* -----------------------------
   SEND
----------------------------- */

function send(data) {

  if (
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {

    console.warn(
      "Socket is not open."
    );

    return false;
  }

  try {

    socket.send(
      JSON.stringify(data)
    );

    return true;

  } catch (error) {

    console.error(
      "Send error:",
      error
    );

    return false;
  }
}

/* -----------------------------
   LIVE TICKS
----------------------------- */

/*
  Current Deriv public market-data
  endpoint.

  We request the 1HZ100V stream.
*/

function subscribeToTicks() {

  const request = {
    ticks: "1HZ100V",
    subscribe: true
  };

  marketBox.textContent =
    "Market: 1HZ100V";

  tickHistory = [];
  digitCounts = Array(10).fill(0);

  send(request);

}

/* -----------------------------
   MESSAGE HANDLER
----------------------------- */

function handleMessage(raw) {

  let data;

  try {

    data = JSON.parse(raw);

  } catch (error) {

    console.error(
      "Invalid WebSocket message:",
      raw
    );

    return;
  }

  console.log(
    "Deriv message:",
    data
  );

  if (data.error) {

    console.error(
      "Deriv API error:",
      data.error
    );

    setStatus(
      "Deriv error: " +
      (
        data.error.message ||
        "Unknown error"
      )
    );

    return;
  }

  /*
    Support the common tick response
    structures so the analyzer can
    process incoming price data.
  */

  if (data.tick) {

    processTick(data.tick);
    return;

  }

  if (data.msg_type === "tick") {

    processTick(data.tick);
    return;

  }

}

/* -----------------------------
   PROCESS TICK
----------------------------- */

function processTick(tick) {

  if (!tick) {
    return;
  }

  const quote =
    Number(
      tick.quote ??
      tick.price ??
      tick.last
    );

  if (!Number.isFinite(quote)) {
    return;
  }

  /*
    Convert the displayed quote
    into a last digit.

    We preserve enough decimal
    precision for synthetic indices.
  */

  const quoteString =
    String(quote);

  const clean =
    quoteString.replace(
      /[^0-9]/g,
      ""
    );

  if (!clean.length) {
    return;
  }

  const digit =
    Number(
      clean.charAt(
        clean.length - 1
      )
    );

  if (
    !Number.isInteger(digit) ||
    digit < 0 ||
    digit > 9
  ) {
    return;
  }

  tickHistory.push({
    price: quote,
    digit: digit,
    time: Date.now()
  });

  if (
    tickHistory.length >
    MAX_TICKS
  ) {

    tickHistory.shift();

  }

  digitCounts[digit]++;

  updateAnalysis(
    quote,
    digit
  );
}

/* -----------------------------
   ANALYSIS
----------------------------- */

function updateAnalysis(
  price,
  lastDigit
) {

  const total =
    digitCounts.reduce(
      (a, b) => a + b,
      0
    );

  if (!total) {
    return;
  }

  let mostFrequentDigit = 0;

  for (
    let i = 1;
    i < 10;
    i++
  ) {

    if (
      digitCounts[i] >
      digitCounts[
        mostFrequentDigit
      ]
    ) {

      mostFrequentDigit = i;

    }
  }

  const frequency =
    (
      digitCounts[
        mostFrequentDigit
      ] /
      total
    ) * 100;

  /*
    Recent sample
  */

  const recent =
    tickHistory.slice(-20);

  const recentCounts =
    Array(10).fill(0);

  recent.forEach(
    tick => {

      recentCounts[
        tick.digit
      ]++;

    }
  );

  let recentDigit = 0;

  for (
    let i = 1;
    i < 10;
    i++
  ) {

    if (
      recentCounts[i] >
      recentCounts[
        recentDigit
      ]
    ) {

      recentDigit = i;

    }
  }

  const recentFrequency =
    recent.length
      ? (
          recentCounts[
            recentDigit
          ] /
          recent.length
        ) * 100
      : 0;

  /*
    Simple statistical confidence.

    This is NOT a guaranteed prediction.
  */

  let confidence = 50;

  if (
    mostFrequentDigit ===
    recentDigit
  ) {

    confidence += 15;

  }

  if (frequency >= 15) {

    confidence += 10;

  }

  if (
    recentFrequency >= 20
  ) {

    confidence += 10;

  }

  confidence =
    Math.min(
      confidence,
      90
    );

  predictionBox.innerHTML =
    "Latest price: <strong>" +
    price +
    "</strong><br>" +

    "Last digit: <strong>" +
    lastDigit +
    "</strong><br>" +

    "Most frequent digit: <strong>" +
    mostFrequentDigit +
    "</strong><br>" +

    "Frequency: <strong>" +
    frequency.toFixed(1) +
    "%</strong><br>" +

    "Recent dominant digit: <strong>" +
    recentDigit +
    "</strong><br>" +

    "Analysis confidence: <strong>" +
    confidence +
    "%</strong>";

  digitBox.innerHTML =
    "<strong>Digit distribution</strong><br>" +

    digitCounts
      .map(
        (count, digit) => {

          const percent =
            (
              count /
              total
            ) * 100;

          return (
            digit +
            ": " +
            count +
            " (" +
            percent.toFixed(1) +
            "%)"
          );

        }
      )
      .join(" | ");

  historyBox.innerHTML =
    "<strong>Ticks analysed:</strong> " +
    total;
}

/* -----------------------------
   START
----------------------------- */

function startAnalysis() {

  if (analysisRunning) {
    return;
  }

  analysisRunning = true;

  tickHistory = [];
  digitCounts =
    Array(10).fill(0);

  connectDeriv();
}

/* -----------------------------
   STOP
----------------------------- */

function stopAnalysis() {

  analysisRunning = false;

  clearTimeout(
    reconnectTimer
  );

  if (socket) {

    try {
      socket.close();
    } catch (error) {}

  }

  socket = null;

  setStatus(
    "⏹ Analysis stopped"
  );
}

/* -----------------------------
   BUTTON EVENTS
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

setStatus(
  "Ready — press Start Analysis"
);

console.log(
  "Trader Pro loaded."
);
