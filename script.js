"use strict";

/*
========================================
TRADER PRO — DERIV LIVE ANALYZER
========================================

• Live Deriv tick connection
• Automatic reconnect
• Live tick counter
• Last-digit extraction
• Digit distribution
• Recent digit analysis
• Matches / Differs information
• No Deriv trading token required
• Public market data only
========================================
*/


/* ======================================
   CONFIGURATION
====================================== */

const DERIV_WS =
  "wss://ws.binaryws.com/websockets/v3";

const SYMBOL =
  "1HZ100V";

const MAX_TICKS =
  200;

const RECENT_TICKS =
  30;


/* ======================================
   STATE
====================================== */

let socket = null;

let reconnectTimer = null;

let reconnectAttempts = 0;

let analysisRunning = false;

let tickHistory = [];

let digitCounts =
  Array(10).fill(0);

let totalTicks = 0;


/* ======================================
   UI
====================================== */

function getElement(id) {

  return document.getElementById(id);

}


function findButton(text) {

  const buttons =
    Array.from(
      document.querySelectorAll("button")
    );

  return buttons.find(
    button =>
      button.textContent
        .trim()
        .toLowerCase() ===
      text.toLowerCase()
  );

}


function getOrCreate(id) {

  let element =
    getElement(id);

  if (!element) {

    element =
      document.createElement("div");

    element.id = id;

    document.body.appendChild(
      element
    );

  }

  return element;

}


/* ======================================
   DISPLAY ELEMENTS
====================================== */

const connectionStatus =
  getOrCreate(
    "connectionStatus"
  );

const marketStatus =
  getOrCreate(
    "marketStatus"
  );

const prediction =
  getOrCreate(
    "prediction"
  );

const digitAnalysis =
  getOrCreate(
    "digitAnalysis"
  );

const tickHistoryDisplay =
  getOrCreate(
    "tickHistory"
  );


const startButton =
  getElement(
    "startAnalysis"
  ) ||
  getElement("start") ||
  findButton(
    "Start Analysis"
  );


const stopButton =
  getElement(
    "stopAnalysis"
  ) ||
  getElement("stop") ||
  findButton(
    "Stop Analysis"
  );


/* ======================================
   STATUS
====================================== */

function setStatus(message) {

  connectionStatus.textContent =
    message;

  console.log(
    "[TRADER PRO]",
    message
  );

}


/* ======================================
   CONNECT
====================================== */

function connectDeriv() {

  clearTimeout(
    reconnectTimer
  );

  /*
    Close previous socket
  */

  if (socket) {

    try {

      socket.close();

    } catch (error) {}

  }


  setStatus(
    "Connecting to live Deriv data..."
  );


  try {

    socket =
      new WebSocket(
        DERIV_WS
      );

  } catch (error) {

    console.error(
      "WebSocket creation failed:",
      error
    );

    setStatus(
      "WebSocket could not be created"
    );

    scheduleReconnect();

    return;

  }


  /* ====================================
     CONNECTION OPEN
  ==================================== */

  socket.onopen =
    function () {

      console.log(
        "WebSocket connected"
      );

      reconnectAttempts = 0;

      setStatus(
        "🟢 Connected — requesting live ticks..."
      );

      marketStatus.textContent =
        "Market: " +
        SYMBOL;

      requestTicks();

    };


  /* ====================================
     MESSAGE
  ==================================== */

  socket.onmessage =
    function (event) {

      handleMessage(
        event.data
      );

    };


  /* ====================================
     ERROR
  ==================================== */

  socket.onerror =
    function (event) {

      console.error(
        "WebSocket error:",
        event
      );

      setStatus(
        "⚠️ Deriv connection error"
      );

    };


  /* ====================================
     CLOSED
  ==================================== */

  socket.onclose =
    function (event) {

      console.warn(
        "WebSocket closed",
        event.code,
        event.reason
      );


      setStatus(
        "🔴 Disconnected — code " +
        event.code
      );


      if (
        analysisRunning
      ) {

        scheduleReconnect();

      }

    };

}


/* ======================================
   RECONNECT
====================================== */

function scheduleReconnect() {

  if (
    !analysisRunning
  ) {

    return;

  }


  clearTimeout(
    reconnectTimer
  );


  reconnectAttempts++;


  const delay =
    Math.min(
      1000 *
      Math.pow(
        2,
        reconnectAttempts - 1
      ),
      15000
    );


  setStatus(
    "Reconnecting in " +
    Math.ceil(
      delay / 1000
    ) +
    " seconds..."
  );


  reconnectTimer =
    setTimeout(
      connectDeriv,
      delay
    );

}


/* ======================================
   SEND REQUEST
====================================== */

function send(request) {

  if (
    !socket ||
    socket.readyState !==
      WebSocket.OPEN
  ) {

    console.warn(
      "Cannot send — socket not open"
    );

    return false;

  }


  try {

    socket.send(
      JSON.stringify(
        request
      )
    );

    console.log(
      "Sent:",
      request
    );

    return true;

  } catch (error) {

    console.error(
      "Send failed:",
      error
    );

    return false;

  }

}


/* ======================================
   REQUEST LIVE TICKS
====================================== */

function requestTicks() {

  const request = {

    ticks:
      SYMBOL,

    subscribe:
      1,

    req_id:
      1

  };


  send(
    request
  );

}


/* ======================================
   MESSAGE HANDLER
====================================== */

function handleMessage(raw) {

  let data;


  try {

    data =
      JSON.parse(
        raw
      );

  } catch (error) {

    console.error(
      "Invalid Deriv response:",
      raw
    );

    return;

  }


  console.log(
    "Deriv:",
    data
  );


  /* ====================================
     API ERROR
  ==================================== */

  if (
    data.error
  ) {

    console.error(
      "Deriv API error:",
      data.error
    );


    setStatus(
      "Deriv error: " +
      (
        data.error.message ||
        data.error.code ||
        "Unknown error"
      )
    );


    return;

  }


  /* ====================================
     TICK
  ==================================== */

  if (
    data.msg_type ===
    "tick" &&
    data.tick
  ) {

    processTick(
      data.tick
    );

    return;

  }


  /*
    Some responses may contain
    the tick object without relying
    on msg_type.
  */

  if (
    data.tick
  ) {

    processTick(
      data.tick
    );

  }

}


/* ======================================
   PROCESS TICK
====================================== */

function processTick(tick) {

  if (!tick) {

    return;

  }


  const quote =
    Number(
      tick.quote
    );


  if (
    !Number.isFinite(
      quote
    )
  ) {

    return;

  }


  /*
    Use the quote as a string.

    The final decimal digit is the
    digit used for Matches/Differs.
  */

  let quoteText =
    String(
      tick.quote
    );


  /*
    Handle scientific notation
    safely enough for display.
  */

  if (
    quoteText.includes("e")
  ) {

    quoteText =
      quote.toFixed(
        8
      );

  }


  const decimalPart =
    quoteText.split(".")[1];


  let lastDigit;


  if (
    decimalPart &&
    decimalPart.length
  ) {

    lastDigit =
      Number(
        decimalPart.charAt(
          decimalPart.length - 1
        )
      );

  } else {

    lastDigit =
      Number(
        quoteText.charAt(
          quoteText.length - 1
        )
      );

  }


  if (
    !Number.isInteger(
      lastDigit
    ) ||
    lastDigit < 0 ||
    lastDigit > 9
  ) {

    return;

  }


  /* ====================================
     STORE TICK
  ==================================== */

  const tickData = {

    price:
      quote,

    digit:
      lastDigit,

    epoch:
      tick.epoch ||
      Math.floor(
        Date.now() / 1000
      )

  };


  tickHistory.push(
    tickData
  );


  if (
    tickHistory.length >
    MAX_TICKS
  ) {

    tickHistory.shift();

  }


  /* ====================================
     DIGIT COUNT
  ==================================== */

  digitCounts[
    lastDigit
  ]++;


  totalTicks++;


  /* ====================================
     UPDATE UI
  ==================================== */

  updateAnalysis(
    tickData
  );

}


/* ======================================
   ANALYSIS
====================================== */

function updateAnalysis(
  latestTick
) {

  if (
    !totalTicks
  ) {

    return;

  }


  /* ====================================
     MOST FREQUENT DIGIT
  ==================================== */

  let dominantDigit =
    0;


  for (
    let digit = 1;
    digit <= 9;
    digit++
  ) {

    if (
      digitCounts[digit] >
      digitCounts[
        dominantDigit
      ]
    ) {

      dominantDigit =
        digit;

    }

  }


  const dominantCount =
    digitCounts[
      dominantDigit
    ];


  const dominantPercent =
    (
      dominantCount /
      totalTicks
    ) *
    100;


  /* ====================================
     RECENT SAMPLE
  ==================================== */

  const recent =
    tickHistory.slice(
      -RECENT_TICKS
    );


  const recentCounts =
    Array(10).fill(0);


  recent.forEach(
    item => {

      recentCounts[
        item.digit
      ]++;

    }
  );


  let recentDominant =
    0;


  for (
    let digit = 1;
    digit <= 9;
    digit++
  ) {

    if (
      recentCounts[digit] >
      recentCounts[
        recentDominant
      ]
    ) {

      recentDominant =
        digit;

    }

  }


  const recentCount =
    recentCounts[
      recentDominant
    ];


  const recentPercent =
    recent.length
      ? (
          recentCount /
          recent.length
        ) *
        100
      : 0;


  /* ====================================
     MATCHES / DIFFERS VIEW
  ==================================== */

  const latestDigit =
    latestTick.digit;


  const matchesPercent =
    dominantPercent;


  const differsPercent =
    100 -
    matchesPercent;


  /* ====================================
     MODEL CONFIDENCE
  ==================================== */

  let confidence =
    50;


  if (
    dominantDigit ===
    recentDominant
  ) {

    confidence +=
      15;

  }


  if (
    dominantPercent >=
    15
  ) {

    confidence +=
      10;

  }


  if (
    recentPercent >=
    20
  ) {

    confidence +=
      10;

  }


  if (
    totalTicks >=
    100
  ) {

    confidence +=
      5;

  }


  confidence =
    Math.min(
      confidence,
      90
    );


  /* ====================================
     CONNECTION STATUS
  ==================================== */

  setStatus(
    "🟢 LIVE — receiving Deriv ticks"
  );


  /* ====================================
     PREDICTION PANEL
  ==================================== */

  prediction.innerHTML =

    "<strong>LIVE ANALYSIS</strong><br><br>" +

    "Latest price: <strong>" +
    latestTick.price +
    "</strong><br>" +

    "Latest last digit: <strong>" +
    latestDigit +
    "</strong><br><br>" +

    "Dominant digit: <strong>" +
    dominantDigit +
    "</strong><br>" +

    "Dominant frequency: <strong>" +
    dominantPercent.toFixed(1) +
    "%</strong><br><br>" +

    "Recent dominant digit: <strong>" +
    recentDominant +
    "</strong><br>" +

    "Recent frequency: <strong>" +
    recentPercent.toFixed(1) +
    "%</strong><br><br>" +

    "Matches with digit " +
    dominantDigit +
    ": <strong>" +
    matchesPercent.toFixed(1) +
    "%</strong><br>" +

    "Differs from digit " +
    dominantDigit +
    ": <strong>" +
    differsPercent.toFixed(1) +
    "%</strong><br><br>" +

    "Model confidence: <strong>" +
    confidence +
    "%</strong>";


  /* ====================================
     DIGIT DISTRIBUTION
  ==================================== */

  digitAnalysis.innerHTML =

    "<strong>DIGIT DISTRIBUTION</strong><br><br>" +

    digitCounts
      .map(
        (count, digit) => {

          const percent =
            totalTicks
              ? (
                  count /
                  totalTicks
                ) *
                100
              : 0;


          return (
            "<span>" +
            digit +
            ": " +
            count +
            " (" +
            percent.toFixed(1) +
            "%)</span>"
          );

        }
      )
      .join(" &nbsp; | &nbsp; ");


  /* ====================================
     TICK COUNTER
  ==================================== */

  tickHistoryDisplay.innerHTML =

    "<strong>Live ticks analysed:</strong> " +
    totalTicks +

    "<br>" +

    "<strong>Recent sample:</strong> " +
    recent.length +

    "<br>" +

    "<strong>Symbol:</strong> " +
    SYMBOL;

}


/* ======================================
   START ANALYSIS
====================================== */

function startAnalysis() {

  if (
    analysisRunning
  ) {

    return;

  }


  analysisRunning =
    true;


  reconnectAttempts =
    0;


  tickHistory =
    [];


  digitCounts =
    Array(10).fill(0);


  totalTicks =
    0;


  prediction.innerHTML =
    "Waiting for live ticks...";


  digitAnalysis.innerHTML =
    "";


  tickHistoryDisplay.innerHTML =
    "";


  connectDeriv();

}


/* ======================================
   STOP ANALYSIS
====================================== */

function stopAnalysis() {

  analysisRunning =
    false;


  clearTimeout(
    reconnectTimer
  );


  if (socket) {

    try {

      socket.close();

    } catch (error) {}

  }


  socket =
    null;


  setStatus(
    "⏹ Analysis stopped"
  );

}


/* ======================================
   BUTTONS
====================================== */

if (
  startButton
) {

  startButton.addEventListener(
    "click",
    startAnalysis
  );

}


if (
  stopButton
) {

  stopButton.addEventListener(
    "click",
    stopAnalysis
  );

}


/* ======================================
   INITIAL STATE
====================================== */

setStatus(
  "Ready — press Start Analysis"
);


marketStatus.textContent =
  "Market: " +
  SYMBOL;


prediction.innerHTML =
  "Press Start Analysis to begin.";


console.log(
  "================================"
);

console.log(
  "TRADER PRO LOADED"
);

console.log(
  "Deriv WebSocket:",
  DERIV_WS
);

console.log(
  "Symbol:",
  SYMBOL
);

console.log(
  "================================"
);
