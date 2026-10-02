let derivSocket;

const SYMBOL = "1HZ100V";
const MAX_TICKS = 1000;

let ticks = [];
let currentSignal = null;
let scanTimer = null;
let countdownTimer = null;
let waiting = false;

const MAX_VALIDITY = 40;
const MIN_VALIDITY = 12;
const WAIT_TIME = 20;


/* =========================
   STATUS
========================= */

function setStatus(text) {
  const el = document.getElementById("connection");
  if (el) el.textContent = text;
}


/* =========================
   DIGIT EXTRACTION
========================= */

function getLastDigit(quote, pipSize = null) {

  if (quote === null || quote === undefined) {
    return null;
  }

  const number = Number(quote);

  if (!Number.isFinite(number)) {
    return null;
  }

  /*
    Prefer Deriv's pip_size when available.
    This avoids relying on JavaScript's raw
    number representation.
  */

  if (
    Number.isInteger(pipSize) &&
    pipSize >= 0 &&
    pipSize <= 10
  ) {

    const factor = Math.pow(10, pipSize);

    const fixed = Math.round(
      number * factor
    );

    return Math.abs(fixed) % 10;
  }

  /*
    Fallback:
    determine the visible decimal precision.
  */

  let text = String(number);

  if (text.includes("e")) {
    text = number.toFixed(10);
  }

  const decimalIndex = text.indexOf(".");

  if (decimalIndex >= 0) {

    const decimals =
      text.substring(decimalIndex + 1);

    if (decimals.length > 0) {
      return Number(
        decimals.charAt(
          decimals.length - 1
        )
      );
    }
  }

  return Number(
    text.slice(-1)
  );
}


/* =========================
   CONNECT
========================= */

function connectDeriv() {

  setStatus("Connecting...");

  derivSocket = new WebSocket(
    "wss://api.derivws.com/trading/v1/options/ws/public"
  );


  derivSocket.onopen = function () {

    setStatus("● LIVE");

    /*
      Historical data first.
    */

    derivSocket.send(
      JSON.stringify({
        ticks_history: SYMBOL,
        count: 1000,
        end: "latest",
        style: "ticks",
        subscribe: 0,
        req_id: 1
      })
    );


    /*
      Live stream.
    */

    derivSocket.send(
      JSON.stringify({
        ticks: SYMBOL,
        subscribe: 1,
        req_id: 2
      })
    );

  };


  derivSocket.onmessage = function(event) {

    let data;

    try {
      data = JSON.parse(event.data);
    } catch (error) {
      return;
    }


    if (data.error) {

      console.error(
        "Deriv error:",
        data.error
      );

      setStatus(
        "Deriv error — reconnecting..."
      );

      return;
    }


    /* =====================
       HISTORY
    ===================== */

    if (
      data.msg_type === "history" &&
      data.history &&
      Array.isArray(data.history.prices)
    ) {

      ticks = [];

      const prices =
        data.history.prices;

      prices.forEach(function(price) {

        const digit =
          getLastDigit(
            price,
            data.pip_size
          );

        if (digit !== null) {
          ticks.push({
            digit: digit,
            price: price
          });
        }

      });


      if (ticks.length > MAX_TICKS) {
        ticks =
          ticks.slice(-MAX_TICKS);
      }


      updateDisplay();

      startFreshScan();

      return;
    }


    /* =====================
       LIVE TICK
    ===================== */

    if (
      data.msg_type === "tick" &&
      data.tick
    ) {

      const quote =
        data.tick.quote;

      const digit =
        getLastDigit(
          quote,
          data.tick.pip_size
        );


      if (digit === null) {
        return;
      }


      ticks.push({
        digit: digit,
        price: quote,
        epoch: data.tick.epoch
      });


      if (ticks.length > MAX_TICKS) {
        ticks.shift();
      }


      document.getElementById(
        "market"
      ).textContent =
        SYMBOL + ": " + quote;


      updateDisplay();


      /*
        Only scan continuously when
        we are not inside a valid signal.
      */

      if (
        !currentSignal &&
        !waiting &&
        ticks.length >= 100
      ) {

        startFreshScan();

      }

    }

  };


  derivSocket.onerror = function(error) {

    console.error(error);

    setStatus("Connection error");

  };


  derivSocket.onclose = function() {

    setStatus(
      "Disconnected — reconnecting..."
    );


    setTimeout(
      connectDeriv,
      3000
    );

  };

}


/* =========================
   WINDOWS
========================= */

function getDigits(size) {

  return ticks
    .slice(
      Math.max(
        0,
        ticks.length - size
      )
    )
    .map(
      item => item.digit
    );

}


/* =========================
   FREQUENCY
========================= */

function frequency(data, digit) {

  if (!data.length) {
    return 0;
  }


  let count = 0;


  data.forEach(function(value) {

    if (value === digit) {
      count++;
    }

  });


  return (
    count / data.length
  ) * 100;

}


/* =========================
   CONSISTENCY
========================= */

function consistency(digit) {

  const windows = [
    25,
    50,
    100,
    250,
    500
  ];


  const values = [];


  windows.forEach(function(size) {

    if (ticks.length >= size) {

      values.push(
        frequency(
          getDigits(size),
          digit
        )
      );

    }

  });


  if (values.length < 3) {
    return 0;
  }


  /*
    How close are the windows
    to each other?
  */

  const average =
    values.reduce(
      (a, b) => a + b,
      0
    ) / values.length;


  const variance =
    values.reduce(
      (sum, value) =>
        sum +
        Math.pow(
          value - average,
          2
        ),
      0
    ) / values.length;


  const deviation =
    Math.sqrt(variance);


  return Math.max(
    0,
    100 - deviation * 8
  );

}


/* =========================
   SCORE ALL DIGITS
========================= */

function analyzeDigits() {

  const results = [];


  for (
    let digit = 0;
    digit <= 9;
    digit++
  ) {

    const f25 =
      frequency(
        getDigits(25),
        digit
      );


    const f50 =
      frequency(
        getDigits(50),
        digit
      );


    const f100 =
      frequency(
        getDigits(100),
        digit
      );


    const f500 =
      frequency(
        getDigits(500),
        digit
      );


    /*
      10% is the neutral
      random-digit baseline.
    */

    const edge25 =
      f25 - 10;

    const edge50 =
      f50 - 10;

    const edge100 =
      f100 - 10;

    const edge500 =
      f500 - 10;


    const score =
      edge25 * 0.30 +
      edge50 * 0.25 +
      edge100 * 0.25 +
      edge500 * 0.20;


    const stable =
      consistency(digit);


    results.push({

      digit,

      f25,
      f50,
      f100,
      f500,

      score,

      stable

    });

  }


  results.sort(
    (a, b) =>
      b.score - a.score
  );


  return results;

}


/* =========================
   CREATE SIGNAL
========================= */

function findSignal() {

  if (ticks.length < 100) {
    return null;
  }


  const ranked =
    analyzeDigits();


  const best =
    ranked[0];


  const second =
    ranked[1];


  const separation =
    best.score -
    second.score;


  /*
    Strong MATCH candidate.
  */

  if (
    best.f100 >= 13 &&
    best.f500 >= 11 &&
    best.stable >= 70 &&
    separation >= 0.75
  ) {

    return {

      type: "MATCHES",

      digit: best.digit,

      confidence:
        calculateConfidence(
          best,
          separation
        ),

      validity:
        calculateValidity(
          best,
          separation
        )

    };

  }


  /*
    Strong DIFFER candidate.

    Here the target digit is
    consistently below baseline.
  */

  const cold =
    ranked
      .slice()
      .sort(
        (a, b) =>
          a.f100 - b.f100
      )[0];


  if (
    cold.f100 <= 8.5 &&
    cold.f500 <= 9.5 &&
    cold.stable >= 70
  ) {

    return {

      type: "DIFFERS",

      digit: cold.digit,

      confidence:
        calculateConfidence(
          cold,
          separation
        ),

      validity:
        calculateValidity(
          cold,
          separation
        )

    };

  }


  return null;

}


/* =========================
   CONFIDENCE
========================= */

function calculateConfidence(
  result,
  separation
) {

  let value = 50;


  value +=
    Math.abs(
      result.f100 - 10
    ) * 3;


  value +=
    Math.abs(
      result.f500 - 10
    ) * 2;


  value +=
    result.stable * 0.10;


  value +=
    separation * 2;


  return Math.min(
    89,
    Math.max(
      50,
      value
    )
  );

}


/* =========================
   VALIDITY
========================= */

function calculateValidity(
  result,
  separation
) {

  let seconds =
    MIN_VALIDITY;


  /*
    Stronger statistical edge
    gets more time.

    Maximum = 40 seconds.
  */

  const edge =
    Math.abs(
      result.f100 - 10
    );


  seconds +=
    edge * 3;


  seconds +=
    result.stable * 0.10;


  seconds +=
    separation * 2;


  seconds =
    Math.round(seconds);


  return Math.min(
    MAX_VALIDITY,
    Math.max(
      MIN_VALIDITY,
      seconds
    )
  );

}


/* =========================
   START SCAN
========================= */

function startFreshScan() {

  if (
    currentSignal ||
    waiting ||
    ticks.length < 100
  ) {
    return;
  }


  const signal =
    findSignal();


  if (!signal) {

    showWaiting(
      "SCANNING — NO VALID SETUP"
    );


    /*
      Re-check after a short period.
    */

    setTimeout(
      startFreshScan,
      3000
    );

    return;
  }


  activateSignal(signal);

}


/* =========================
   ACTIVATE SIGNAL
========================= */

function activateSignal(signal) {

  currentSignal =
    signal;


  let remaining =
    signal.validity;


  document.getElementById(
    "targetDigit"
  ).textContent =
    signal.digit;


  document.getElementById(
    "signal"
  ).textContent =
    signal.type;


  document.getElementById(
    "confidence"
  ).textContent =
    signal.confidence.toFixed(1) +
    "%";


  document.getElementById(
    "message"
  ).textContent =
    "VALID SIGNAL — monitor until expiry";


  clearInterval(
    countdownTimer
  );


  countdownTimer =
    setInterval(
      function() {

        remaining--;


        document.getElementById(
          "message"
        ).textContent =
          "VALID FOR " +
          remaining +
          "s";


        if (remaining <= 0) {

          clearInterval(
            countdownTimer
          );


          expireSignal();

        }

      },
      1000
    );

}


/* =========================
   EXPIRE
========================= */

function expireSignal() {

  currentSignal =
    null;


  document.getElementById(
    "signal"
  ).textContent =
    "EXPIRED";


  document.getElementById(
    "message"
  ).textContent =
    "Waiting " +
    WAIT_TIME +
    "s before next scan";


  waiting = true;


  clearTimeout(
    scanTimer
  );


  scanTimer =
    setTimeout(
      function() {

        waiting = false;

        showWaiting(
          "SCANNING FOR NEW SETUP..."
        );


        startFreshScan();

      },
      WAIT_TIME * 1000
    );

}


/* =========================
   WAIT DISPLAY
========================= */

function showWaiting(text) {

  document.getElementById(
    "signal"
  ).textContent =
    "WAIT";


  document.getElementById(
    "message"
  ).textContent =
    text;

}


/* =========================
   DISPLAY
========================= */

function updateDisplay() {

  if (!ticks.length) {
    return;
  }


  const digits =
    ticks.map(
      item => item.digit
    );


  const counts =
    Array(10).fill(0);


  digits.forEach(function(digit) {

    counts[digit]++;

  });


  const total =
    digits.length;


  document.getElementById(
    "sampleSize"
  ).textContent =
    total;


  let hot = 0;
  let cold = 0;


  for (
    let i = 1;
    i <= 9;
    i++
  ) {

    if (
      counts[i] >
      counts[hot]
    ) {
      hot = i;
    }


    if (
      counts[i] <
      counts[cold]
    ) {
      cold = i;
    }

  }


  document.getElementById(
    "hotDigit"
  ).textContent =
    hot;


  document.getElementById(
    "coldDigit"
  ).textContent =
    cold;


  const recent =
    digits.slice(-40);


  document.getElementById(
    "digitHistory"
  ).textContent =
    recent.join(" ");


  renderDistribution(
    counts,
    total
  );

}


/* =========================
   DISTRIBUTION
========================= */

function renderDistribution(
  counts,
  total
) {

  const container =
    document.getElementById(
      "digitDistribution"
    );


  container.innerHTML = "";


  for (
    let digit = 0;
    digit <= 9;
    digit++
  ) {

    const percentage =
      total
        ? (
            counts[digit] /
            total
          ) * 100
        : 0;


    const box =
      document.createElement(
        "div"
      );


    box.className =
      "digit-box";


    box.innerHTML =
      "<span>" +
      digit +
      "</span>" +

      "<strong>" +
      percentage.toFixed(1) +
      "%</strong>";


    container.appendChild(
      box
    );

  }

}


/* =========================
   BUTTON
========================= */

function analyzeTrade() {

  if (
    !currentSignal &&
    !waiting
  ) {

    startFreshScan();

  }

}


/* =========================
   START
========================= */

connectDeriv();
