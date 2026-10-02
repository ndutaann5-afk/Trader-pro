let derivSocket;
let lastDigits = [];

const MAX_TICKS = 100;
const SYMBOL = "1HZ100V";

function setStatus(message) {
  document.getElementById("connection").textContent = message;
}

function connectDeriv() {

  setStatus("Connecting...");

  try {

    derivSocket = new WebSocket(
      "wss://ws.binaryws.com/websockets/v3"
    );

  } catch (error) {

    setStatus("Connection failed");
    return;

  }


  derivSocket.onopen = function() {

    setStatus("● LIVE");

    derivSocket.send(JSON.stringify({
      ticks: SYMBOL,
      subscribe: 1,
      req_id: 1
    }));

  };


  derivSocket.onmessage = function(event) {

    const data = JSON.parse(event.data);


    if (data.error) {

      console.error("Deriv error:", data.error);

      setStatus(
        "Deriv error: " + data.error.message
      );

      return;
    }


    if (data.msg_type === "tick" && data.tick) {

      const price = data.tick.quote;

      document.getElementById("market").textContent =
        SYMBOL + ": " + price;


      /*
        Use Deriv's quote as a string so
        we preserve the final displayed digit.
      */

      const priceText = String(price);

      const digit = Number(
        priceText.slice(-1)
      );


      if (!Number.isNaN(digit)) {

        lastDigits.push(digit);


        if (lastDigits.length > MAX_TICKS) {
          lastDigits.shift();
        }


        updateAnalysis();

      }

    }

  };


  derivSocket.onerror = function() {

    console.error("WebSocket error");

    setStatus("Connection error");

  };


  derivSocket.onclose = function() {

    setStatus("Disconnected — reconnecting...");

    setTimeout(function() {

      connectDeriv();

    }, 3000);

  };

}


function updateAnalysis() {

  if (lastDigits.length === 0) {
    return;
  }


  const counts = Array(10).fill(0);


  lastDigits.forEach(function(digit) {

    counts[digit]++;

  });


  let targetDigit = 0;


  for (let i = 1; i < 10; i++) {

    if (counts[i] > counts[targetDigit]) {

      targetDigit = i;

    }

  }


  const matches =
    (counts[targetDigit] /
    lastDigits.length) * 100;


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


  document.getElementById("digitHistory").textContent =
    lastDigits.slice(-30).join(" ");


  let confidence = 0;


  if (lastDigits.length >= 20) {

    confidence = Math.min(
      95,
      50 + Math.abs(matches - 10) * 2
    );

  }


  document.getElementById("confidence").textContent =
    confidence.toFixed(1) + "%";


  if (lastDigits.length < 20) {

    document.getElementById("message").textContent =
      "Collecting more ticks...";

    document.getElementById("signal").textContent =
      "WAIT";

  } else {

    document.getElementById("message").textContent =
      "Statistical analysis only.";

  }

}


function analyzeTrade() {

  if (lastDigits.length < 20) {

    document.getElementById("signal").textContent =
      "WAIT";

    return;

  }


  const matches = Number(
    document
      .getElementById("matchesChance")
      .textContent
      .replace("%", "")
  );


  const differs = 100 - matches;


  if (differs > matches) {

    document.getElementById("signal").textContent =
      "DIFFERS";

  } else {

    document.getElementById("signal").textContent =
      "MATCHES";

  }

}


connectDeriv();
