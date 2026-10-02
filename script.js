let derivSocket;
let lastDigits = [];

function connectDeriv() {
  derivSocket = new WebSocket(
    "wss://ws.binaryws.com/websockets/v3"
  );

  derivSocket.onopen = function () {
    document.getElementById("market").textContent =
      "Connected to Deriv";

    derivSocket.send(JSON.stringify({
      ticks: "1HZ100V",
      subscribe: 1
    }));
  };

  derivSocket.onmessage = function (event) {
    const data = JSON.parse(event.data);

    if (data.msg_type === "tick" && data.tick) {
      const price = data.tick.quote;

      document.getElementById("market").textContent =
        "Deriv 1HZ100V: " + price;

      // Get the final digit of the price
      const priceText = String(price);
      const digit = Number(priceText.slice(-1));

      lastDigits.push(digit);

      // Keep the latest 100 ticks
      if (lastDigits.length > 100) {
        lastDigits.shift();
      }

      updateDigitAnalysis();
    }
  };

  derivSocket.onerror = function () {
    document.getElementById("market").textContent =
      "Deriv connection error";
  };

  derivSocket.onclose = function () {
    document.getElementById("market").textContent =
      "Deriv disconnected";
  };
}

function updateDigitAnalysis() {
  if (lastDigits.length === 0) return;

  const counts = Array(10).fill(0);

  lastDigits.forEach(function (digit) {
    counts[digit]++;
  });

  let mostCommonDigit = 0;

  for (let i = 1; i < 10; i++) {
    if (counts[i] > counts[mostCommonDigit]) {
      mostCommonDigit = i;
    }
  }

  const frequency =
    (counts[mostCommonDigit] / lastDigits.length) * 100;

  document.getElementById("confidence").textContent =
    frequency.toFixed(1) + "%";

  document.getElementById("orderblock").textContent =
    "Most common digit: " + mostCommonDigit;

  document.getElementById("fvg").textContent =
    "Samples: " + lastDigits.length;

  document.getElementById("liquidity").textContent =
    "Digit " + mostCommonDigit +
    ": " + counts[mostCommonDigit] +
    " / " + lastDigits.length;

  document.getElementById("bias").textContent =
    "Digit analysis active";
}

function analyzeTrade() {
  updateDigitAnalysis();

  document.getElementById("signal").textContent =
    "ANALYZING";
}

connectDeriv();
