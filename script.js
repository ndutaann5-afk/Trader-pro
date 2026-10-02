let derivSocket;

const SYMBOL = "1HZ100V";

const MAX_TICKS = 1000;

let lastDigits = [];
let predictions = [];

let engineReady = false;


/* =========================
   CONNECTION
========================= */

function setStatus(text) {
  document.getElementById("connection").textContent = text;
}


function connectDeriv() {

  setStatus("Connecting...");

  derivSocket = new WebSocket(
    "wss://api.derivws.com/trading/v1/options/ws/public"
  );


  derivSocket.onopen = function () {

    setStatus("● LIVE");

    /*
      First load historical ticks.
      This gives the engine data immediately
      instead of waiting for hundreds of new ticks.
    */

    derivSocket.send(JSON.stringify({
      ticks_history: SYMBOL,
      count: 1000,
      end: "latest",
      style: "ticks",
      subscribe: 0,
      req_id: 100
    }));


    /*
      Then start the live stream.
    */

    derivSocket.send(JSON.stringify({
      ticks: SYMBOL,
      subscribe: 1,
      req_id: 101
    }));

  };


  derivSocket.onmessage = function (event) {

    const data = JSON.parse(event.data);


    if (data.error) {

      console.error(data.error);

      setStatus("Deriv error");

      return;
    }


    /* =========================
       HISTORICAL DATA
    ========================= */

    if (
      data.msg_type === "history" &&
      data.history &&
      Array.isArray(data.history.prices)
    ) {

      lastDigits = data.history.prices
        .map(getLastDigit)
        .filter(digit => digit !== null)
        .slice(-MAX_TICKS);


      engineReady = true;

      updateEngine();

      return;
    }


    /* =========================
       LIVE TICK
    ========================= */

    if (
      data.msg_type === "tick" &&
      data.tick
    ) {

      const price = data.tick.quote;

      document.getElementById("market").textContent =
        SYMBOL + ": " + price;


      const digit = getLastDigit(price);


      if (digit !== null) {

        lastDigits.push(digit);


        if (lastDigits.length > MAX_TICKS) {
          lastDigits.shift();
        }


        engineReady = true;

        updateEngine();

      }

    }

  };


  derivSocket.onerror = function () {

    setStatus("Connection error");

  };


  derivSocket.onclose = function () {

    setStatus("Disconnected — reconnecting...");

    setTimeout(connectDeriv, 3000);

  };

}


/* =========================
   DIGIT EXTRACTION
========================= */

function getLastDigit(price) {

  if (price === null || price === undefined) {
    return null;
  }


  /*
    Convert the quote into normal decimal text.

    This avoids problems caused by scientific notation.
  */

  const number = Number(price);


  if (!Number.isFinite(number)) {
    return null;
  }


  let text = String(number);


  /*
    Handle scientific notation.
  */

  if (text.includes("e")) {

    text = number.toFixed(10);

  }


  const digitsOnly =
    text.replace(/\D/g, "");


  if (!digitsOnly.length) {
    return null;
  }


  return Number(
    digitsOnly.slice(-1)
  );

}


/* =========================
   COUNTS
========================= */

function getCounts(data) {

  const counts =
    Array(10).fill(0);


  data.forEach(function (digit) {

    if (
      Number.isInteger(digit) &&
      digit >= 0 &&
      digit <= 9
    ) {

      counts[digit]++;

    }

  });


  return counts;

}


/* =========================
   WINDOW
========================= */

function getWindow(size) {

  return lastDigits.slice(
    Math.max(
      0,
      lastDigits.length - size
    )
  );

}


/* =========================
   DIGIT FREQUENCY
========================= */

function getFrequency(data, digit) {

  if (!data.length) {
    return 0;
  }


  let count = 0;


  data.forEach(function (value) {

    if (value === digit) {
      count++;
    }

  });


  return (
    count / data.length
  ) * 100;

}


/* =========================
   STREAK
========================= */

function getStreak(data) {

  if (!data.length) {

    return {
      digit: null,
      count: 0
    };

  }


  const latest =
    data[data.length - 1];


  let count = 1;


  for (
    let i = data.length - 2;
    i >= 0;
    i--
  ) {

    if (data[i] === latest) {

      count++;

    } else {

      break;

    }

  }


  return {
    digit: latest,
    count: count
  };

}


/* =========================
   TRANSITIONS
========================= */

function getTransitionScore(
  data,
  target
) {

  if (data.length < 2) {
    return 50;
  }


  let afterOther = 0;
  let targetAfterOther = 0;


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (data[i - 1] !== target) {

      afterOther++;

      if (data[i] === target) {
        targetAfterOther++;
      }

    }

  }


  if (!afterOther) {
    return 50;
  }


  const rate =
    (targetAfterOther / afterOther) * 100;


  /*
    Convert the rate into a relative score.

    10% = neutral baseline.
  */

  return rate;

}


/* =========================
   DIGIT SCORING
========================= */

function scoreDigit(digit) {

  const w25 = getWindow(25);
  const w50 = getWindow(50);
  const w100 = getWindow(100);
  const w500 = getWindow(500);


  const f25 =
    getFrequency(w25, digit);


  const f50 =
    getFrequency(w50, digit);


  const f100 =
    getFrequency(w100, digit);


  const f500 =
    getFrequency(w500, digit);


  /*
    Baseline for a random digit = 10%.
  */

  const edge25 =
    f25 - 10;


  const edge50 =
    f50 - 10;


  const edge100 =
    f100 - 10;


  const edge500 =
    f500 - 10;


  /*
    Weight recent data more heavily,
    while still requiring longer-window
    agreement.
  */

  const frequencyScore =
    (
      edge25 * 0.35 +
      edge50 * 0.30 +
      edge100 * 0.20 +
      edge500 * 0.15
    );


  const transition =
    getTransitionScore(
      w500,
      digit
    );


  const transitionEdge =
    transition - 10;


  /*
    Final statistical score.

    Positive = digit is appearing
    more frequently than baseline.

    Negative = digit is below baseline.
  */

  const score =
    frequencyScore +
    transitionEdge * 0.20;


  return {

    digit,

    f25,
    f50,
    f100,
    f500,

    transition,

    score

  };

}


/* =========================
   RANK DIGITS
========================= */

function rankDigits() {

  const results = [];


  for (
    let digit = 0;
    digit <= 9;
    digit++
  ) {

    results.push(
      scoreDigit(digit)
    );

  }


  results.sort(
    function (a, b) {
      return b.score - a.score;
    }
  );


  return results;

}


/* =========================
   TARGET SELECTION
========================= */

function selectTarget(ranked) {

  if (!ranked.length) {
    return null;
  }


  const top =
    ranked[0];


  const second =
    ranked[1];


  /*
    Require the top digit to have
    meaningful separation.

    Otherwise there is no clear target.
  */

  const separation =
    top.score - second.score;


  if (separation < 0.75) {

    return {
      target: top,
      strong: false,
      separation
    };

  }


  return {
    target: top,
    strong: true,
    separation
  };

}


/* =========================
   SIGNAL ENGINE
========================= */

function generateSignal(selection) {

  if (!selection) {

    return {
      signal: "WAIT",
      confidence: 0,
      reason: "Insufficient data."
    };

  }


  const target =
    selection.target;


  /*
    Minimum data requirement.
  */

  if (lastDigits.length < 100) {

    return {

      signal: "WAIT",

      confidence: 0,

      reason:
        "Collecting at least 100 ticks."

    };

  }


  /*
    Calculate how strongly the target
    differs from the 10% baseline.
  */

  const edge =
    target.f100 - 10;


  const longEdge =
    target.f500 - 10;


  const transitionEdge =
    target.transition - 10;


  /*
    Agreement score.

    We don't want one short burst
    to produce a signal.
  */

  let agreement = 0;


  if (edge > 1) {
    agreement++;
  }


  if (longEdge > 0) {
    agreement++;
  }


  if (transitionEdge > 0) {
    agreement++;
  }


  if (selection.strong) {
    agreement++;
  }


  /*
    MATCHES requires positive evidence.

    Otherwise DIFFERS is the statistical
    baseline, but we still require enough
    evidence before displaying it as a signal.
  */

  if (
    target.f100 >= 13 &&
    target.f500 >= 11 &&
    agreement >= 3
  ) {

    const confidence =
      calculateConfidence(
        target,
        "MATCHES",
        agreement
      );


    return {

      signal: "MATCHES",

      confidence,

      reason:
        "Target digit is consistently above the 10% baseline."

    };

  }


  /*
    Strong below-baseline target:
    this supports DIFFERS for that target.
  */

  if (
    target.f100 <= 8.5 &&
    target.f500 <= 9.5 &&
    agreement >= 2
  ) {

    const confidence =
      calculateConfidence(
        target,
        "DIFFERS",
        agreement
      );


    return {

      signal: "DIFFERS",

      confidence,

      reason:
        "Target digit is consistently below the 10% baseline."

    };

  }


  return {

    signal: "WAIT",

    confidence:
      calculateConfidence(
        target,
        "WAIT",
        agreement
      ),

    reason:
      "Evidence is not strong or consistent enough."

  };

}


/* =========================
   CONFIDENCE
========================= */

function calculateConfidence(
  target,
  signal,
  agreement
) {

  if (signal === "WAIT") {

    return Math.min(
      64,
      45 + agreement * 4
    );

  }


  let confidence = 50;


  const edge100 =
    Math.abs(
      target.f100 - 10
    );


  const edge500 =
    Math.abs(
      target.f500 - 10
    );


  confidence +=
    edge100 * 3;


  confidence +=
    edge500 * 2;


  confidence +=
    agreement * 3;


  /*
    Never present the number as
    mathematical certainty.
  */

  return Math.min(
    89,
    Math.max(
      50,
      confidence
    )
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
        ? (counts[digit] / total) * 100
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


    container.appendChild(box);

  }

}


/* =========================
   MAIN ENGINE
========================= */

function updateEngine() {

  if (!engineReady) {
    return;
  }


  if (!lastDigits.length) {
    return;
  }


  const counts =
    getCounts(lastDigits);


  const total =
    lastDigits.length;


  const ranked =
    rankDigits();


  const selection =
    selectTarget(ranked);


  const result =
    generateSignal(selection);


  const target =
    selection
      ? selection.target
      : null;


  /*
    Distribution
  */

  renderDistribution(
    counts,
    total
  );


  /*
    Basic statistics
  */

  document.getElementById(
    "sampleSize"
  ).textContent = total;


  /*
    Hot / cold digit
  */

  let hotDigit = 0;
  let coldDigit = 0;


  for (
    let i = 1;
    i <= 9;
    i++
  ) {

    if (
      counts[i] >
      counts[hotDigit]
    ) {

      hotDigit = i;

    }


    if (
      counts[i] <
      counts[coldDigit]
    ) {

      coldDigit = i;

    }

  }


  document.getElementById(
    "hotDigit"
  ).textContent = hotDigit;


  document.getElementById(
    "coldDigit"
  ).textContent = coldDigit;


  /*
    Streak
  */

  const streak =
    getStreak(lastDigits);


  document.getElementById(
    "streak"
  ).textContent =
    streak.digit === null
      ? "—"
      : streak.digit +
        " × " +
        streak.count;


  /*
    Recent digits
  */

  document.getElementById(
    "digitHistory"
  ).textContent =
    lastDigits
      .slice(-40)
      .join(" ");


  /*
    Target
  */

  if (target) {

    document.getElementById(
      "targetDigit"
    ).textContent =
      target.digit;


    /*
      Display MATCH probability
      based on observed frequency.
    */

    document.getElementById(
      "matchesChance"
    ).textContent =
      target.f100.toFixed(1) +
      "%";


    /*
      DIFFERS probability is
      the complement for that target.
    */

    document.getElementById(
      "differsChance"
    ).textContent =
      (
        100 -
        target.f100
      ).toFixed(1) +
      "%";


  } else {

    document.getElementById(
      "targetDigit"
    ).textContent = "—";


    document.getElementById(
      "matchesChance"
    ).textContent = "—";


    document.getElementById(
      "differsChance"
    ).textContent = "—";

  }


  /*
    Signal
  */

  document.getElementById(
    "signal"
  ).textContent =
    result.signal;


  /*
    Confidence
  */

  document.getElementById(
    "confidence"
  ).textContent =
    result.confidence.toFixed(1) +
    "%";


  /*
    Explanation
  */

  document.getElementById(
    "message"
  ).textContent =
    result.reason;


  /*
    Store current analysis
    for future backtesting.
  */

  predictions.push({

    target:
      target
        ? target.digit
        : null,

    signal:
      result.signal,

    confidence:
      result.confidence,

    tickCount:
      lastDigits.length,

    timestamp:
      Date.now()

  });


  /*
    Keep memory controlled.
  */

  if (
    predictions.length > 500
  ) {

    predictions.shift();

  }

}


/* =========================
   MANUAL ANALYZE BUTTON
========================= */

function analyzeTrade() {

  updateEngine();

}


/* =========================
   START
========================= */

connectDeriv();
