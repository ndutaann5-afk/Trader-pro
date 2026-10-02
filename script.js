/* =========================================================
   TRADER PRO
   LIVE DERIV MARKET DATA TEST
   ---------------------------------------------------------
   This version ONLY:
   1. Connects to Deriv public WebSocket
   2. Discovers active symbols
   3. Finds 1HZ100V
   4. Loads recent tick history
   5. Subscribes to live ticks
   6. Displays real price + last digit
   ========================================================= */

const DERIV_URL =
  "wss://api.derivws.com/trading/v1/options/ws/public";

const PREFERRED_SYMBOL =
  "1HZ100V";

const MAX_HISTORY =
  1000;

let socket = null;

let selectedSymbol =
  null;

let tickHistory = [];

let reconnectTimer =
  null;


/* =========================================================
   UI HELPERS
   ========================================================= */

function setConnectionStatus(text) {

  const element =
    document.getElementById("connection");

  if (element) {
    element.textContent = text;
  }

}


function setMessage(text) {

  const element =
    document.getElementById("message");

  if (element) {
    element.textContent = text;
  }

}


function setMarket(text) {

  const element =
    document.getElementById("market");

  if (element) {
    element.textContent = text;
  }

}


/* =========================================================
   DISPLAY REAL LAST DIGIT
   ========================================================= */

function getLastDigit(quote) {

  if (
    quote === null ||
    quote === undefined
  ) {
    return null;
  }

  /*
    Deriv sends the quote as a number.
    Convert it to text while preserving
    the visible decimal representation.
  */

  let text =
    String(quote);


  /*
    Handle scientific notation just in case.
  */

  if (
    text.includes("e") ||
    text.includes("E")
  ) {

    text =
      Number(quote).toFixed(10);

  }


  const decimalPosition =
    text.indexOf(".");


  /*
    If there is a decimal part,
    the final decimal digit is the
    price's last digit.
  */

  if (
    decimalPosition !== -1
  ) {

    const decimals =
      text.substring(
        decimalPosition + 1
      );


    if (decimals.length > 0) {

      return Number(
        decimals.charAt(
          decimals.length - 1
        )
      );

    }

  }


  /*
    Fallback for integer quotes.
  */

  const digits =
    text.replace(
      /\D/g,
      ""
    );


  if (!digits.length) {
    return null;
  }


  return Number(
    digits.charAt(
      digits.length - 1
    )
  );

}


/* =========================================================
   DISPLAY CURRENT TICK
   ========================================================= */

function displayTick(
  quote,
  epoch
) {

  const digit =
    getLastDigit(quote);


  setMarket(
    selectedSymbol +
    "  |  " +
    quote
  );


  /*
    Target digit area is temporarily
    used to show the actual live digit.
  */

  const target =
    document.getElementById(
      "targetDigit"
    );

  if (target) {

    target.textContent =
      digit === null
        ? "—"
        : digit;

  }


  const message =
    document.getElementById(
      "message"
    );

  if (message) {

    const time =
      epoch
        ? new Date(
            epoch * 1000
          ).toLocaleTimeString()
        : new Date()
            .toLocaleTimeString();


    message.textContent =
      "LIVE TICK • " +
      time;

  }

}


/* =========================================================
   ADD TICK TO HISTORY
   ========================================================= */

function addTick(
  quote,
  epoch
) {

  const digit =
    getLastDigit(quote);


  if (digit === null) {
    return;
  }


  tickHistory.push({

    quote:
      quote,

    digit:
      digit,

    epoch:
      epoch || null

  });


  if (
    tickHistory.length >
    MAX_HISTORY
  ) {

    tickHistory =
      tickHistory.slice(
        -MAX_HISTORY
      );

  }


  updateStatistics();

}


/* =========================================================
   UPDATE BASIC STATISTICS
   ========================================================= */

function updateStatistics() {

  const total =
    tickHistory.length;


  const sample =
    document.getElementById(
      "sampleSize"
    );

  if (sample) {
    sample.textContent =
      total;
  }


  if (!total) {
    return;
  }


  const counts =
    Array(10).fill(0);


  tickHistory.forEach(
    function(item) {

      if (
        item.digit >= 0 &&
        item.digit <= 9
      ) {

        counts[
          item.digit
        ]++;

      }

    }
  );


  let hotDigit =
    0;

  let coldDigit =
    0;


  for (
    let i = 1;
    i <= 9;
    i++
  ) {

    if (
      counts[i] >
      counts[hotDigit]
    ) {

      hotDigit =
        i;

    }


    if (
      counts[i] <
      counts[coldDigit]
    ) {

      coldDigit =
        i;

    }

  }


  const hot =
    document.getElementById(
      "hotDigit"
    );

  if (hot) {
    hot.textContent =
      hotDigit;
  }


  const cold =
    document.getElementById(
      "coldDigit"
    );

  if (cold) {
    cold.textContent =
      coldDigit;
  }


  /*
    Recent digits
  */

  const history =
    document.getElementById(
      "digitHistory"
    );


  if (history) {

    history.textContent =
      tickHistory
        .slice(-40)
        .map(
          item =>
            item.digit
        )
        .join(" ");

  }


  /*
    Distribution
  */

  renderDistribution(
    counts,
    total
  );

}


/* =========================================================
   DIGIT DISTRIBUTION
   ========================================================= */

function renderDistribution(
  counts,
  total
) {

  const container =
    document.getElementById(
      "digitDistribution"
    );


  if (!container) {
    return;
  }


  container.innerHTML =
    "";


  for (
    let digit = 0;
    digit <= 9;
    digit++
  ) {

    const percentage =
      total > 0
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


/* =========================================================
   SEND REQUEST
   ========================================================= */

function sendRequest(
  request
) {

  if (
    !socket ||
    socket.readyState !==
      WebSocket.OPEN
  ) {

    console.error(
      "Socket is not open."
    );

    return false;

  }


  console.log(
    "DERIV REQUEST:",
    request
  );


  socket.send(
    JSON.stringify(request)
  );


  return true;

}


/* =========================================================
   DISCOVER SYMBOL
   ========================================================= */

function discoverSymbols() {

  setConnectionStatus(
    "● CONNECTED"
  );

  setMessage(
    "Discovering Deriv markets..."
  );


  sendRequest({

    active_symbols:
      "brief",

    req_id:
      100

  });

}


/* =========================================================
   PROCESS ACTIVE SYMBOLS
   ========================================================= */

function processActiveSymbols(
  data
) {

  if (
    !Array.isArray(
      data.active_symbols
    )
  ) {

    showApiError(
      "No active symbols returned."
    );

    return;

  }


  console.log(
    "ACTIVE SYMBOLS:",
    data.active_symbols
  );


  /*
    Look specifically for 1HZ100V.
  */

  const found =
    data.active_symbols.find(
      function(item) {

        return (
          item.symbol ===
          PREFERRED_SYMBOL
        );

      }
    );


  if (!found) {

    /*
      Show some available symbols
      so we know what Deriv returned.
    */

    const examples =
      data.active_symbols
        .slice(0, 10)
        .map(
          item =>
            item.symbol
        )
        .join(", ");


    showApiError(
      "1HZ100V not found. Available examples: " +
      examples
    );

    return;

  }


  selectedSymbol =
    found.symbol;


  setMessage(
    "Found " +
    selectedSymbol +
    " — loading tick history..."
  );


  /*
    Now request historical ticks.
  */

  sendRequest({

    ticks_history:
      selectedSymbol,

    count:
      MAX_HISTORY,

    end:
      "latest",

    style:
      "ticks",

    req_id:
      101

  });


  /*
    Subscribe to live ticks.
  */

  sendRequest({

    ticks:
      selectedSymbol,

    subscribe:
      1,

    req_id:
      102

  });

}


/* =========================================================
   PROCESS HISTORY
   ========================================================= */

function processHistory(
  data
) {

  if (
    !data.history ||
    !Array.isArray(
      data.history.prices
    )
  ) {

    showApiError(
      "Deriv returned no tick history."
    );

    return;

  }


  tickHistory =
    [];


  const prices =
    data.history.prices;


  const times =
    Array.isArray(
      data.history.times
    )
      ? data.history.times
      : [];


  prices.forEach(
    function(price, index) {

      addHistoricalTick(
        price,
        times[index]
      );

    }
  );


  setConnectionStatus(
    "● LIVE"
  );


  setMessage(
    "Receiving real-time ticks..."
  );


  updateStatistics();


  console.log(
    "HISTORICAL TICKS:",
    tickHistory.length
  );

}


/* =========================================================
   ADD HISTORICAL TICK
   ========================================================= */

function addHistoricalTick(
  quote,
  epoch
) {

  const digit =
    getLastDigit(quote);


  if (digit === null) {
    return;
  }


  tickHistory.push({

    quote:
      quote,

    digit:
      digit,

    epoch:
      epoch || null

  });

}


/* =========================================================
   PROCESS LIVE TICK
   ========================================================= */

function processLiveTick(
  data
) {

  if (
    !data.tick
  ) {
    return;
  }


  const quote =
    data.tick.quote;


  const epoch =
    data.tick.epoch;


  const digit =
    getLastDigit(
      quote
    );


  if (digit === null) {
    return;
  }


  addTick(
    quote,
    epoch
  );


  displayTick(
    quote,
    epoch
  );


  console.log(
    "LIVE TICK:",
    quote,
    "LAST DIGIT:",
    digit
  );

}


/* =========================================================
   API ERROR
   ========================================================= */

function showApiError(
  message
) {

  console.error(
    "DERIV API ERROR:",
    message
  );


  setConnectionStatus(
    "DERIV ERROR"
  );


  setMessage(
    message
  );

}


/* =========================================================
   OPEN CONNECTION
   ========================================================= */

function connect() {

  /*
    Prevent multiple sockets.
  */

  if (
    socket &&
    (
      socket.readyState ===
        WebSocket.OPEN ||

      socket.readyState ===
        WebSocket.CONNECTING
    )
  ) {

    return;

  }


  setConnectionStatus(
    "Connecting..."
  );


  setMessage(
    "Opening Deriv market connection..."
  );


  try {

    socket =
      new WebSocket(
        DERIV_URL
      );

  } catch (error) {

    showApiError(
      "Could not create WebSocket: " +
      error.message
    );

    scheduleReconnect();

    return;

  }


  /* =====================================================
     OPEN
     ===================================================== */

  socket.onopen =
    function() {

      console.log(
        "DERIV WEBSOCKET CONNECTED"
      );


      discoverSymbols();

    };


  /* =====================================================
     MESSAGE
     ===================================================== */

  socket.onmessage =
    function(event) {

      let data;


      try {

        data =
          JSON.parse(
            event.data
          );

      } catch (error) {

        console.error(
          "Invalid JSON from Deriv:",
          event.data
        );

        return;

      }


      console.log(
        "DERIV RESPONSE:",
        data
      );


      /*
        New API error format can contain
        an errors array.
      */

      if (
        Array.isArray(
          data.errors
        ) &&
        data.errors.length
      ) {

        const firstError =
          data.errors[0];


        showApiError(
          firstError.message ||
          firstError.code ||
          "Unknown API error"
        );


        return;

      }


      /*
        Older/alternate error shape.
      */

      if (data.error) {

        showApiError(
          data.error.message ||
          data.error.code ||
          "Unknown API error"
        );


        return;

      }


      /* ================================
         ACTIVE SYMBOLS
         ================================ */

      if (
        data.msg_type ===
        "active_symbols"
      ) {

        processActiveSymbols(
          data
        );

        return;

      }


      /* ================================
         HISTORY
         ================================ */

      if (
        data.msg_type ===
        "history"
      ) {

        processHistory(
          data
        );

        return;

      }


      /* ================================
         LIVE TICK
         ================================ */

      if (
        data.msg_type ===
        "tick"
      ) {

        processLiveTick(
          data
        );

        return;

      }

    };


  /* =====================================================
     SOCKET ERROR
     ===================================================== */

  socket.onerror =
    function(error) {

      console.error(
        "WEBSOCKET ERROR:",
        error
      );


      setConnectionStatus(
        "Connection error"
      );


      setMessage(
        "WebSocket connection error."
      );

    };


  /* =====================================================
     SOCKET CLOSED
     ===================================================== */

  socket.onclose =
    function(event) {

      console.warn(
        "WEBSOCKET CLOSED:",
        event.code,
        event.reason
      );


      setConnectionStatus(
        "Disconnected"
      );


      setMessage(
        "Connection closed — reconnecting..."
      );


      socket =
        null;


      scheduleReconnect();

    };

}


/* =========================================================
   RECONNECT
   ========================================================= */

function scheduleReconnect() {

  if (reconnectTimer) {
    return;
  }


  reconnectTimer =
    setTimeout(
      function() {

        reconnectTimer =
          null;


        connect();

      },
      5000
    );

}


/* =========================================================
   START
   ========================================================= */

connect();
