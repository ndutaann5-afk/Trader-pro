"use strict";

const WS_URL =
  "wss://ws.binaryws.com/websockets/v3";

let ws = null;

const status =
  document.getElementById("connectionStatus") ||
  document.body.appendChild(
    document.createElement("div")
  );

status.id = "connectionStatus";

function show(message) {
  status.textContent = message;
  console.log(message);
}

show("Testing Deriv connection...");

try {

  ws = new WebSocket(WS_URL);

  ws.onopen = function () {

    show("🟢 CONNECTED TO DERIV");

    console.log(
      "WebSocket opened successfully"
    );

    ws.send(
      JSON.stringify({
        active_symbols: "brief",
        product_type: "basic",
        req_id: 1
      })
    );

  };

  ws.onmessage = function (event) {

    console.log(
      "DERIV RESPONSE:",
      event.data
    );

    try {

      const data =
        JSON.parse(event.data);

      if (
        data.msg_type ===
        "active_symbols"
      ) {

        show(
          "🟢 CONNECTED — MARKETS RECEIVED: " +
          data.active_symbols.length
        );

      } else {

        show(
          "🟢 CONNECTED — RESPONSE RECEIVED"
        );

      }

    } catch (error) {

      show(
        "🟢 CONNECTED — DATA RECEIVED"
      );

    }

  };

  ws.onerror = function (error) {

    console.error(
      "DERIV WEBSOCKET ERROR:",
      error
    );

    show(
      "❌ WEBSOCKET ERROR"
    );

  };

  ws.onclose = function (event) {

    console.error(
      "DERIV CLOSED:",
      event.code,
      event.reason
    );

    show(
      "❌ DISCONNECTED — CODE " +
      event.code
    );

  };

} catch (error) {

  console.error(
    "CREATION ERROR:",
    error
  );

  show(
    "❌ COULD NOT CREATE WEBSOCKET"
  );

}
