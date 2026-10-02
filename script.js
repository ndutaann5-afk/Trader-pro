// ==========================================
// TRADER PRO
// Step 2 - Live Deriv Market Data
// ==========================================

const DERIV_WS = "wss://ws.binaryws.com/websockets/v3";

const TARGET_NAME = "Volatility 100 (1s) Index";
const TARGET_SYMBOL = "1HZ100V";

let socket = null;
let reconnectTimer = null;
let analysisRunning = false;

let activeSymbol = null;
let pipSize = null;

let digits = [];
let maxHistory = 100;

let requestId = 1;


// ==========================================
// ELEMENTS
// ==========================================

const el = {
  market: document.getElementById("market"),
  connection: document.getElementById("connection"),
  analysisButton: document.getElementById("analysisButton"),

  trend: document.getElementById("trend"),
  signalStrength: document.getElementById("signalStrength"),
  pattern: document.getElementById("pattern"),

  targetDigit: document.getElementById("targetDigit"),

  matchesChance: document.getElementById("matchesChance"),
  differsChance: document.getElementById("differsChance"),

  confidence: document.getElementById("confidence"),
  validity: document.getElementById("validity"),

  signal: document.getElementById("signal"),
  message: document.getElementById("message"),

  sampleSize: document.getElementById("sampleSize"),
  hotDigit: document.getElementById("hotDigit"),
  coldDigit: document.getElementById("coldDigit"),
  streak: document.getElementById("streak"),

  digitDistribution: document.getElementById("digitDistribution"),
  digitHistory: document.getElementById("digitHistory")
};


// ==========================================
// CONNECTION
// ==========================================

function connectDeriv() {

  clearTimeout(reconnectTimer);

  setConnection("Connecting to live data...", false);

  try {
    socket = new WebSocket(DERIV_WS);
  } catch (error) {

    showError(
      "Could not create WebSocket connection."
    );

    scheduleReconnect();

    return;
  }


  socket.onopen = function () {

    setConnection(
      "Connected — finding market...",
      true
    );

    requestActiveSymbols();
  };


  socket.onmessage = function (event) {

    try {

      const data = JSON.parse(event.data);

      handleMessage(data);

    } catch (error) {

      console.error(
        "Invalid Deriv message:",
        error
      );

      showError(
        "Received an invalid market-data message."
      );
    }
  };


  socket.onerror = function (error) {

    console.error(
      "Deriv WebSocket error:",
      error
    );

    setConnection(
      "Connection error",
      false
    );
  };


  socket.onclose = function () {

    setConnection(
      "Disconnected — reconnecting...",
      false
    );

    scheduleReconnect();
  };
}


// ==========================================
// REQUEST ACTIVE SYMBOLS
// ==========================================

function requestActiveSymbols() {

  sendRequest({
    active_symbols: "brief",
    req_id: requestId++
  });
}


// ==========================================
// HANDLE MESSAGES
// ==========================================

function handleMessage(data) {

  console.log("Deriv:", data);


  // ------------------------------
  // ERROR
  // ------------------------------

  if (data.error) {

    console.error(
      "Deriv API error:",
      data.error
    );

    showError(
      data.error.message ||
      data.error.code ||
      "Unknown Deriv error"
    );

    return;
  }


  // ------------------------------
  // ACTIVE SYMBOLS
  // ------------------------------

  if (data.msg_type === "active_symbols") {

    handleActiveSymbols(
      data.active_symbols || []
    );

    return;
  }


  // ------------------------------
  // HISTORY
  // ------------------------------

  if (data.msg_type === "history") {

    handleHistory(data);

    return;
  }


  // ------------------------------
  // LIVE TICK
  // ------------------------------

  if (data.msg_type === "tick") {

    handleTick(data.tick);

    return;
  }
}


// ==========================================
// ACTIVE SYMBOLS
// ==========================================

function handleActiveSymbols(symbols) {

  console.log(
    "Active symbols received:",
    symbols.length
  );


  let found = null;


  for (const item of symbols) {

    const symbol =
      item.symbol ||
      item.underlying_symbol;

    const name =
      item.display_name ||
      item.underlying_symbol_name ||
      "";


    if (symbol === TARGET_SYMBOL) {

      found = item;

      break;
    }


    if (
      name.toLowerCase().includes(
        "volatility 100"
      )
      &&
      name.includes("(1s)")
    ) {

      found = item;

      break;
    }
  }


  if (!found) {

    showError(
      "Volatility 100 (1s) Index is not currently available."
    );

    el.market.textContent =
      "Market unavailable";

    return;
  }


  activeSymbol =
    found.symbol ||
    found.underlying_symbol ||
    TARGET_SYMBOL;


  pipSize =
    found.pip ||
    found.pip_size ||
    null;


  console.log(
    "Selected symbol:",
    activeSymbol
  );


  el.market.textContent =
    "Waiting for price...";


  setConnection(
    "Market found — loading tick history...",
    true
  );


  requestHistory();
}


// ==========================================
// HISTORY
// ==========================================

function requestHistory() {

  if (!activeSymbol) {

    showError(
      "No active market symbol."
    );

    return;
  }


  sendRequest({

    ticks_history: activeSymbol,

    count: maxHistory,

    end: "latest",

    style: "ticks",

    req_id: requestId++

  });
}


// ==========================================
// HANDLE HISTORY
// ==========================================

function handleHistory(data) {

  const history = data.history;


  if (!history) {

    showError(
      "Deriv returned no tick history."
    );

    subscribeTicks();

    return;
  }


  const prices =
    history.prices || [];


  digits = [];


  for (const price of prices) {

    const digit =
      getLastDigit(
        price,
        pipSize
      );

    if (digit !== null) {

      digits.push(digit);
    }
  }


  if (digits.length > maxHistory) {

    digits =
      digits.slice(-maxHistory);
  }


  updateDataDisplay();


  setConnection(
    "Live data connected",
    true
  );


  el.message.textContent =
    "Receiving live market ticks.";


  subscribeTicks();
}


// ==========================================
// LIVE TICKS
// ==========================================

function subscribeTicks() {

  if (!activeSymbol) {

    showError(
      "Cannot subscribe: market symbol missing."
    );

    return;
  }


  sendRequest({

    ticks: activeSymbol,

    subscribe: 1,

    req_id: requestId++

  });
}


// ==========================================
// HANDLE TICK
// ==========================================

function handleTick(t
