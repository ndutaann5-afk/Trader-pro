let derivSocket;

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

function analyzeTrade() {
  document.getElementById("bias").textContent =
    "WAIT";

  document.getElementById("confidence").textContent =
    "—";

  document.getElementById("orderblock").textContent =
    "Score: — / 5";

  document.getElementById("fvg").textContent =
    "Not detected";

  document.getElementById("liquidity").textContent =
    "Waiting for analysis";

  document.getElementById("signal").textContent =
    "WAIT";
}

connectDeriv();
