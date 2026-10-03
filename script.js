"use strict";

const DERIV_WS =
  "wss://ws.binaryws.com/websockets/v3";

const SYMBOL =
  "1HZ100V";

let socket = null;
let reconnectTimer = null;
let running = false;
let reconnectAttempts = 0;

let ticks = [];
let digitCounts = Array(10).fill(0);

const MAX_TICKS = 200;
const RECENT_TICKS = 30;


/* =========================
   ELEMENTS
========================= */

const status =
  document.getElementById(
    "connectionStatus"
  );

const market =
  document.getElementById(
    "marketStatus"
  );

const prediction =
  document.getElementById(
    "prediction"
  );

const digits =
  document.getElementById(
    "digitAnalysis"
  );

const history =
  document.getElementById(
    "tickHistory"
  );

const startButton =
  document.getElementById(
    "startAnalysis"
  );

const stopButton =
  document.getElementById(
    "stopAnalysis"
  );


/* =========================
   STATUS
========================= */

function setStatus(message) {

  if (status) {
    status.textContent =
      message;
  }

  console.log(
    "[Trader Pro]",
    message
  );
}


/* =========================
   CONNECT
========================= */

function connect() {

  clearTimeout(
    reconnectTimer
  );

  setStatus(
    "Connecting to live Deriv data..."
  );

  try {

    socket =
      new WebSocket(
        DERIV_WS
      );

  } catch (error) {

    console.error(error);

    setStatus(
      "WebSocket creation failed"
    );

    reconnect();

    return;
  }


  socket.onopen =
    function () {

      reconnectAttempts = 0;

      setStatus(
        "🟢 Connected — requesting live market data..."
      );

      requestTicks();

    };


  socket.onmessage =
    function (event) {

      receive(event.data);

    };


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


  socket.onclose =
    function (event) {

      console.log(
        "Closed:",
        event.code,
        event.reason
      );

      setStatus(
        "🔴 Disconnected — code " +
        event.code
      );

      if (running) {
        reconnect();
      }

    };

}


/* =========================
   RECONNECT
========================= */

function reconnect() {

  if (!running) {
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
      connect,
      delay
    );

}


/* =========================
   REQUEST TICKS
========================= */

function requestTicks() {

  if (
    !socket ||
    socket.readyState !==
      WebSocket.OPEN
  ) {

    return;
  }

  const request = {

    ticks:
      SYMBOL,

    subscribe:
      1,

    req_id:
      1001

  };

  socket.send(
    JSON.stringify(
      request
    )
  );

  market.textContent =
    "Market: " +
    SYMBOL;

}


/* =========================
   RECEIVE DATA
========================= */

function receive(raw) {

  let data;

  try {

    data =
      JSON.parse(
        raw
      );

  } catch (error) {

    console.error(
      "Invalid response:",
      raw
    );

    return;
  }


  console.log(
    "Deriv response:",
    data
  );


  if (data.error) {

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


  if (
    data.msg_type ===
    "tick" &&
    data.tick
  ) {

    processTick(
      data.tick
    );

  }

}


/* =========================
   PROCESS TICK
========================= */

function processTick(tick) {

  const price =
    Number(
      tick.quote
    );

  if (
    !Number.isFinite(
      price
    )
  ) {

    return;
  }


  const formatted =
    String(
      tick.quote
    );


  let decimal =
    formatted.split(".")[1];


  if (!decimal) {

    decimal = "";

  }


  let digit;


  if (decimal.length > 0) {

    digit =
      Number(
        decimal[
          decimal.length - 1
        ]
      );

  } else {

    const digitsOnly =
      formatted.replace(
        /[^0-9]/g,
        ""
      );

    digit =
      Number(
        digitsOnly[
          digitsOnly.length - 1
        ]
      );

  }


  if (
    !Number.isInteger(
      digit
    ) ||
    digit < 0 ||
    digit > 9
  ) {

    return;
  }


  ticks.push({

    price:
      price,

    digit:
      digit,

    epoch:
      tick.epoch ||
      Math.floor(
        Date.now() / 1000
      )

  });


  if (
    ticks.length >
    MAX_TICKS
  ) {

    ticks.shift();

  }


  digitCounts[digit]++;

  update();


  setStatus(
    "🟢 LIVE — receiving Deriv ticks"
  );

}


/* =========================
   ANALYSIS
========================= */

function update() {

  const total =
    digitCounts.reduce(
      (a, b) => a + b,
      0
    );


  if (!total) {
    return;
  }


  let dominant =
    0;


  for (
    let i = 1;
    i < 10;
    i++
  ) {

    if (
      digitCounts[i] >
      digitCounts[dominant]
    ) {

      dominant = i;

    }

  }


  const dominantPercent =
    (
      digitCounts[dominant] /
      total
    ) * 100;


  const recent =
    ticks.slice(
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
    let i = 1;
    i < 10;
    i++
  ) {

    if (
      recentCounts[i] >
      recentCounts[
        recentDominant
      ]
    ) {

      recentDominant = i;

    }

  }


  const recentPercent =
    recent.length
      ? (
          recentCounts[
            recentDominant
          ] /
          recent.length
        ) * 100
      : 0;


  let confidence =
    50;


  if (
    dominant ===
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
    total >= 100
  ) {

    confidence +=
      5;

  }


  confidence =
    Math.min(
      confidence,
      90
    );


  const latest =
    ticks[
      ticks.length - 1
    ];


  prediction.innerHTML =

    "Latest price: <strong>" +
    latest.price +
    "</strong><br><br>" +

    "Last digit: <strong>" +
    latest.digit +
    "</strong><br><br>" +

    "Dominant digit: <strong>" +
    dominant +
    "</strong><br>" +

    "Dominant frequency: <strong>" +
    dominantPercent.toFixed(1) +
    "%</strong><br><br>" +

    "Recent dominant: <strong>" +
    recentDominant +
    "</strong><br>" +

    "Recent frequency: <strong>" +
    recentPercent.toFixed(1) +
    "%</strong><br><br>" +

    "Matches: <strong>" +
    dominantPercent.toFixed(1) +
    "%</strong><br>" +

    "Differs: <strong>" +
    (
      100 -
      dominantPercent
    ).toFixed(1) +
    "%</strong><br><br>" +

    "Model confidence: <strong>" +
    confidence +
    "%</strong>";


  digits.innerHTML =
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
      .join(
        " | "
      );


  history.innerHTML =

    "<strong>Live ticks:</strong> " +
    total +

    "<br>" +

    "<strong>Recent sample:</strong> " +
    recent.length;

}


/* =========================
   START
========================= */

function start() {

  if (running) {
    return;
  }

  running = true;

  reconnectAttempts = 0;

  ticks = [];

  digitCounts =
    Array(10).fill(0);

  prediction.textContent =
    "Connecting...";

  digits.textContent =
    "Waiting for data...";

  history.textContent =
    "Waiting for ticks...";

  connect();

}


/* =========================
   STOP
========================= */

function stop() {

  running = false;

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


/* =========================
   BUTTONS
========================= */

startButton.addEventListener(
  "click",
  start
);

stopButton.addEventListener(
  "click",
  stop
);


/* =========================
   INITIAL
========================= */

setStatus(
  "Ready — press Start Analysis"
);

market.textContent =
  "Market: " +
  SYMBOL;

console.log(
  "Trader Pro loaded successfully."
);
