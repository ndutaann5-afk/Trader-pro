let derivSocket;

let lastDigits = [];

const MAX_TICKS = 100;
const SYMBOL = "1HZ100V";


function setStatus(text) {
  document.getElementById("connection").textContent = text;
}


function connectDeriv() {

  setStatus("Connecting...");

  derivSocket = new WebSocket(
    "wss://api.derivws.com/trading/v1/options/ws/public"
  );


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

      setStatus("Deriv error");

      console.error(data.error);

      return;
    }


    if (data.msg_type === "tick" && data.tick) {

      const price = data.tick.quote;

      document.getElementById("market").textContent =
        SYMBOL + ": " + price;


      const digit =
        Number(String(price).slice(-1));


      if (!Number.isNaN(digit)) {

        lastDigits.push(digit);


        if (lastDigits.length > MAX_TICKS) {
          lastDigits.shift();
        }


        updateEngine();

      }

    }

  };


  derivSocket.onerror = function() {

    setStatus("Connection error");

  };


  derivSocket.onclose = function() {

    setStatus("Disconnected — reconnecting...");

    setTimeout(connectDeriv, 3000);

  };

}


function getCounts(data) {

  const counts = Array(10).fill(0);

  data.forEach(function(digit) {
    counts[digit]++;
  });

  return counts;
}


function getHotDigit(counts) {

  let hot = 0;

  for (let i = 1; i < 10; i++) {

    if (counts[i] > counts[hot]) {
      hot = i;
    }

  }

  return hot;
}


function getColdDigit(counts) {

  let cold = 0;

  for (let i = 1; i < 10; i++) {

    if (counts[i] < counts[cold]) {
      cold = i;
    }

  }

  return cold;
}


function getStreak(data) {

  if (data.length === 0) {
    return {
      digit: null,
      count: 0
    };
  }


  const latest =
    data[data.length - 1];

  let count = 1;


  for (let i = data.length - 2; i >= 0; i--) {

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


function renderDistribution(counts, total) {

  const container =
    document.getElementById("digitDistribution");

  container.innerHTML = "";


  for (let digit = 0; digit <= 9; digit++) {

    const percentage =
      total > 0
        ? (counts[digit] / total) * 100
        : 0;


    const box =
      document.createElement("div");

    box.className = "digit-box";


    box.innerHTML =
      "<span>" + digit + "</span>" +
      "<strong>" +
      percentage.toFixed(1) +
      "%</strong>";


    container.appendChild(box);

  }

}


function updateEngine() {

  if (lastDigits.length === 0) {
    return;
  }


  const counts =
    getCounts(lastDigits);


  const total =
    lastDigits.length;


  const hot =
    getHotDigit(counts);


  const cold =
    getColdDigit(counts);


  const streak =
    getStreak(lastDigits);


  /*
    The target is currently the statistically
    most frequent digit in the selected sample.
  */

  const matches =
    (counts[hot] / total) * 100;


  const differs =
    100 - matches;


  /*
    Baseline for a random digit is 10%.
    We measure how far the observed frequency
    is from that baseline.
  */

  const deviation =
    Math.abs(matches - 10);


  /*
    Confidence also depends on sample size.
    This prevents tiny samples from producing
    an artificially strong result.
  */

  const sampleFactor =
    Math.min(total / 100, 1);


  let confidence =
    50 + (deviation * 3 * sampleFactor);


  confidence =
    Math.min(95, confidence);


  document.getElementById("targetDigit").textContent =
    hot;


  document.getElementById("matchesChance").textContent =
    matches.toFixed(1) + "%";


  document.getElementById("differsChance").textContent =
    differs.toFixed(1) + "%";


  document.getElementById("confidence").textContent =
    confidence.toFixed(1) + "%";


  document.getElementById("sampleSize").textContent =
    total;


  document.getElementById("hotDigit").textContent =
    hot;


  document.getElementById("coldDigit").textContent =
    cold;


  document.getElementById("streak").textContent =
    streak.digit === null
      ? "—"
      : streak.digit + " × " + streak.count;


  document.getElementById("digitHistory").textContent =
    lastDigits.slice(-30).join(" ");


  renderDistribution(
    counts,
    total
  );


  if (total < 25) {

    document.getElementById("signal").textContent =
      "WAIT";


    document.getElementById("message").textContent =
      "Collecting at least 25 ticks...";


    return;
  }


  /*
    Do not issue a signal simply because
    one digit is slightly more frequent.
  */

  if (confidence < 65) {

    document.getElementById("signal").textContent =
      "WAIT";


    document.getElementById("message").textContent =
      "No strong statistical separation.";

    return;
  }


  if (differs > matches) {

    document.getElementById("signal").textContent =
      "DIFFERS";

  } else {

    document.getElementById("signal").textContent =
      "MATCHES";

  }


  document.getElementById("message").textContent =
    "Statistical signal — not a guaranteed outcome.";

}


function analyzeTrade() {

  updateEngine();

}


connectDeriv();
