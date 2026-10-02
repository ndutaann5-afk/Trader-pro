let derivSocket;

let lastDigits = [];

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
        price;


      const priceText = String(price);


      const digit =
        Number(priceText.slice(-1));


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

    document.getElementById("connection").textContent =
      "Connection error";

  };


  derivSocket.onclose = function() {

    document.getElementById("connection").textContent =
      "Disconnected";


    setTimeout(connectDeriv, 3000);

  };

}


function updateAnalysis() {

  if (lastDigits.length === 0) {
    return;
  }


  const counts =
    Array(10).fill(0);


  lastDigits.forEach(function(digit) {

    counts[digit]++;

  });


  /*
    Find the most frequent digit.
  */

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


  /*
    Display a conservative statistical confidence.
  */

  let confidence = 0;


  if (lastDigits.length >= 20) {

    confidence =
      Math.min(
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
      "Statistical analysis — not a guaranteed prediction.";

  }

}


function analyzeTrade() {

  if (lastDigits.length < 20) {

    document.getElementById("signal").textContent =
      "WAIT";

    return;

  }


  const matches =
    Number(
      document
        .getElementById("matchesChance")
        .textContent
        .replace("%", "")
    );


  const differs =
    100 - matches;


  if (differs > matches) {

    document.getElementById("signal").textContent =
      "DIFFERS";

  } else {

    document.getElementById("signal").textContent =
      "MATCHES";

  }

}


connectDeriv();
