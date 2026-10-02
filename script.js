let derivSocket;
let lastDigits = [];
let currentTarget = null;

const MAX_TICKS = 100;

function connectDeriv() {

  derivSocket = new WebSocket(
    "wss://ws.binaryws.com/websockets/v3"
  );

  derivSocket.onopen = function () {

    document.getElementById("connection").textContent =
      "● LIVE";

    derivSocket.send(JSON.stringify({
      ticks: "1HZ100V",
      subscribe: 1
    }));
  };

  derivSocket.onmessage = function(event) {

    const data = JSON.parse(event.data);

    if (data.msg_type === "tick" && data.tick) {

      const price = data.tick.quote;

      document.getElementById("market").textContent =
        "1HZ100V: " + price;

      const priceText = String(price);

      const digit = Number(
        priceText.slice(-1)
      );

      if (!Number.isNaN(digit)) {

        lastDigits.push(digit);

        if (lastDigits.length > MAX_TICKS) {
          lastDigits.shift();
        }

        updateDigitAnalysis();
      }
    }
  };

  derivSocket.onerror = function() {

    document.getElementById("connection").textContent =
      "Connection error";
  };

  derivSocket.onclose = function() {

    document.getElementById("connection").textContent =
      "Disconnected";

    setTimeout(connectDeriv, 3000);
  };
}


function updateDigitAnalysis() {

  if (lastDigits.length === 0) {
    return;
  }

  const counts = Array(10).fill(0);

  lastDigits.forEach(function(digit) {
    counts[digit]++;
  });


  /*
     Find the most frequently appearing digit.
  */

  let targetDigit = 0;

  for (let i = 1; i < 10; i++) {

    if (counts[i] > counts[targetDigit]) {
      targetDigit = i;
    }
  }

  currentTarget = targetDigit;


  /*
     Statistical frequency.
  */

  const matches =
    (counts[targetDigit] / lastDigits.length) * 100;

  const differs =
    100 - matches;


  document.getElementById("targetDigit").textContent =
    targetDigit;

  document.getElementById("matchesChance").textContent =
    matches.toFixed(1) + "%";

  document.getElementById("differsChance").textContent =
    differs.toFixed(1) + "%";

  document.getElementById("sampleSize").textContent =
    lastDigits.length;


  /*
     Display recent digits.
  */

  document.getElementById("digitHistory").textContent =
    lastDigits.slice(-30).join(" ");


  /*
     Confidence is based on sample size and
     deviation from the 50/50 baseline.
  */

  let confidence = 50;

  if (lastDigits.length >= 20) {

    const deviation =
      Math.abs(matches - 10);

    confidence =
      Math.min(95, 50 + deviation * 2);
  }

  document.getElementById("confidence").textContent =
    confidence.toFixed(1) + "%";


  document.getElementById("orderblock").textContent =
    "Digit concentration: " +
    matches.toFixed(1) + "%";


  document.getElementById("fvg").textContent =
    "Digit samples: " +
    lastDigits.length;


  document.getElementById("liquidity").textContent =
    "Digit " +
    targetDigit +
    ": " +
    counts[targetDigit] +
    " hits";


  document.getElementById("bias").textContent =
    "DIGIT ANALYSIS";


  if (lastDigits.length < 20) {

    document.getElementById("digitMessage").textContent =
      "Collecting more data before analysis.";

  } else {

    document.getElementById("digitMessage").textContent =
      "Statistical frequency only — not a guaranteed next-tick prediction.";
  }
}


function analyzeTrade() {

  if (lastDigits.length < 20) {

    document.getElementById("signal").textContent =
      "COLLECTING DATA";

    return;
  }

  const matches =
    Number(
      document.getElementById("matchesChance")
        .textContent
        .replace("%", "")
    );

  const differs = 100 - matches;


  /*
     Conservative signal:
     only display a statistical preference when
     the observed frequency is sufficiently different.
  */

  if (differs > matches) {

    document.getElementById("signal").textContent =
      "DIFFERS";

  } else {

    document.getElementById("signal").textContent =
      "MATCHES";
  }
}


connectDeriv();
