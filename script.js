// ==========================================
// TRADER PRO
// LIVE DERIV MARKET DATA
// ==========================================

const DERIV_WS =
  "wss://ws.binaryws.com/websockets/v3";

let socket = null;
let reconnectTimer = null;

let analysisRunning = false;
let reconnecting = false;

let selectedSymbol = null;
let selectedPipSize = null;

let markets = [];
let digits = [];

const MAX_HISTORY = 100;

let requestId = 1;


// ==========================================
// ELEMENTS
// ==========================================

const marketSelect =
  document.getElementById("marketSelect");

const contractSelect =
  document.getElementById("contractSelect");

const marketDisplay =
  document.getElementById("market");

const connection =
  document.getElementById("connection");

const analysisButton =
  document.getElementById("analysisButton");

const trend =
  document.getElementById("trend");

const signalStrength =
  document.getElementById("signalStrength");

const pattern =
  document.getElementById("pattern");

const targetDigit =
  document.getElementById("targetDigit");

const matchesChance =
  document.getElementById("matchesChance");

const differsChance =
  document.getElementById("differsChance");

const confidence =
  document.getElementById("confidence");

const validity =
  document.getElementById("validity");

const signal =
  document.getElementById("signal");

const message =
  document.getElementById("message");

const sampleSize =
  document.getElementById("sampleSize");

const hotDigit =
  document.getElementById("hotDigit");

const coldDigit =
  document.getElementById("coldDigit");

const streak =
  document.getElementById("streak");

const digitDistribution =
  document.getElementById(
    "digitDistribution"
  );

const digitHistory =
  document.getElementById(
    "digitHistory"
  );


// ==========================================
// CONNECT
// ==========================================

function connect() {

  clearTimeout(reconnectTimer);

  reconnecting = false;

  setConnection(
    "Connecting to Deriv...",
    false
  );


  try {

    socket =
      new WebSocket(DERIV_WS);

  } catch (error) {

    showError(
      "Could not create WebSocket."
    );

    scheduleReconnect();

    return;
  }


  socket.onopen = function () {

    setConnection(
      "Connected — loading markets...",
      true
    );

    requestMarkets();
  };


  socket.onmessage =
    function(event) {

      try {

        const data =
          JSON.parse(
            event.data
          );

        handleMessage(data);

      } catch (error) {

        console.error(
          error
        );

        showError(
          "Invalid response from Deriv."
        );
      }
    };


  socket.onerror =
    function() {

      setConnection(
        "Deriv connection error",
        false
      );
    };


  socket.onclose =
    function() {

      setConnection(
        "Disconnected — reconnecting...",
        false
      );

      scheduleReconnect();
    };
}


// ==========================================
// REQUEST MARKETS
// ==========================================

function requestMarkets() {

  send({

    active_symbols:
      "brief",

    product_type:
      "basic",

    req_id:
      requestId++

  });
}


// ==========================================
// MESSAGE HANDLER
// ==========================================

function handleMessage(data) {

  console.log(
    "Deriv:",
    data
  );


  if (data.error) {

    showError(
      data.error.message ||
      data.error.code ||
      "Unknown Deriv error"
    );

    return;
  }


  if (
    data.msg_type ===
    "active_symbols"
  ) {

    handleMarkets(
      data.active_symbols || []
    );

    return;
  }


  if (
    data.msg_type ===
    "history"
  ) {

    handleHistory(data);

    return;
  }


  if (
    data.msg_type ===
    "tick"
  ) {

    handleTick(data.tick);

    return;
  }
}


// ==========================================
// MARKET LIST
// ==========================================

function handleMarkets(list) {

  markets = list
    .map(item => {

      const symbol =
        item.symbol ||
        item.underlying_symbol;

      const name =
        item.display_name ||
        item.underlying_symbol_name ||
        symbol;

      const pip =
        item.pip ||
        item.pip_size ||
        null;

      return {
        symbol,
        name,
        pip
      };

    })
    .filter(item =>
      item.symbol &&
      item.name
    );


  console.log(
    "Markets available:",
    markets.length
  );


  if (
    markets.length === 0
  ) {

    showError(
      "Deriv returned no available markets."
    );

    return;
  }


  populateMarketSelector();


  let preferred =
    markets.find(
      item =>
        item.symbol ===
        "1HZ100V"
    );


  if (!preferred) {

    preferred =
      markets.find(
        item =>
          item.name
            .toLowerCase()
            .includes(
              "volatility"
            )
      );
  }


  if (!preferred) {

    preferred =
      markets[0];
  }


  marketSelect.value =
    preferred.symbol;


  selectMarket(
    preferred.symbol
  );
}


// ==========================================
// POPULATE DROPDOWN
// ==========================================

function populateMarketSelector() {

  marketSelect.innerHTML =
    "";


  const volatility =
    markets
      .filter(item =>
        item.name
          .toLowerCase()
          .includes(
            "volatility"
          )
      )
      .sort(
        (a, b) =>
          a.name.localeCompare(
            b.name
          )
      );


  const other =
    markets
      .filter(item =>
        !item.name
          .toLowerCase()
          .includes(
            "volatility"
          )
      )
      .sort(
        (a, b) =>
          a.name.localeCompare(
            b.name
          )
      );


  addGroup(
    "Volatility Indices",
    volatility
  );


  addGroup(
    "Other Markets",
    other
  );
}


// ==========================================
// ADD SELECT GROUP
// ==========================================

function addGroup(
  label,
  list
) {

  if (list.length === 0) {
    return;
  }


  const group =
    document.createElement(
      "optgroup"
    );

  group.label =
    label;


  list.forEach(item => {

    const option =
      document.createElement(
        "option"
      );

    option.value =
      item.symbol;

    option.textContent =
      item.name;


    group.appendChild(
      option
    );

  });


  marketSelect.appendChild(
    group
  );
}


// ==========================================
// MARKET CHANGE
// ==========================================

marketSelect.addEventListener(
  "change",
  function() {

    const symbol =
      marketSelect.value;

    selectMarket(symbol);

  }
);


// ==========================================
// SELECT MARKET
// ==========================================

function selectMarket(
  symbol
) {

  const market =
    markets.find(
      item =>
        item.symbol === symbol
    );


  if (!market) {

    return;
  }


  selectedSymbol =
    market.symbol;

  selectedPipSize =
    market.pip;


  digits = [];


  marketDisplay.textContent =
    "Loading...";


  setConnection(
    "Switching market...",
    true
  );


  updateDataDisplay();


  if (
    socket &&
    socket.readyState ===
      WebSocket.OPEN
  ) {

    requestHistory();

  } else {

    setConnection(
      "Waiting for connection...",
      false
    );
  }
}


// ==========================================
// HISTORY
// ==========================================

function requestHistory() {

  if (!selectedSymbol) {
    return;
  }


  send({

    ticks_history:
      selectedSymbol,

    count:
      MAX_HISTORY,

    end:
      "latest",

    style:
      "ticks",

    req_id:
      requestId++

  });
}


// ==========================================
// HISTORY RESPONSE
// ==========================================

function handleHistory(data) {

  if (!data.history) {

    showError(
      "No tick history received."
    );

    subscribeTicks();

    return;
  }


  const prices =
    data.history.prices ||
    [];


  digits = [];


  prices.forEach(
    price => {

      const digit =
        getLastDigit(
          price
        );

      if (
        digit !== null
      ) {

        digits.push(
          digit
        );
      }

    }
  );


  digits =
    digits.slice(
      -MAX_HISTORY
    );


  updateDataDisplay();


  subscribeTicks();


  setConnection(
    "Live data connected",
    true
  );


  message.textContent =
    "Receiving live ticks from " +
    getSelectedMarketName() +
    ".";


  if (analysisRunning) {

    updateAnalysis();
  }
}


// ==========================================
// LIVE TICKS
// ==========================================

function subscribeTicks() {

  if (!selectedSymbol) {
    return;
  }


  send({

    ticks:
      selectedSymbol,

    subscribe:
      1,

    req_id:
      requestId++

  });
}


// ==========================================
// TICK RESPONSE
// ==========================================

function handleTick(tick) {

  if (!tick) {
    return;
  }


  const quote =
    tick.quote;


  if (
    quote === undefined ||
    quote === null
  ) {

    return;
  }


  if (
    tick.pip_size !==
      undefined
  ) {

    selectedPipSize =
      tick.pip_size;
  }


  marketDisplay.textContent =
    formatPrice(quote);


  const digit =
    getLastDigit(
      quote
    );


  if (digit === null) {
    return;
  }


  digits.push(digit);


  if (
    digits.length >
    MAX_HISTORY
  ) {

    digits =
      digits.slice(
        -MAX_HISTORY
      );
  }


  updateDataDisplay();


  setConnection(
    "Live data connected",
    true
  );


  if (analysisRunning) {

    updateAnalysis();
  }
}


// ==========================================
// LAST DIGIT
// ==========================================

function getLastDigit(
  price
) {

  let text =
    String(price);


  if (
    selectedPipSize &&
    Number(selectedPipSize) > 0
  ) {

    const pipText =
      String(
        selectedPipSize
      );


    if (
      pipText.includes(".")
    ) {

      const decimals =
        pipText
          .split(".")[1]
          .replace(
            /0+$/,
            ""
          )
          .length;


      if (decimals > 0) {

        text =
          Number(price)
            .toFixed(decimals);
      }
    }
  }


  const digitsOnly =
    text.replace(
      /[^0-9]/g,
      ""
    );


  if (!digitsOnly) {
    return null;
  }


  return Number(
    digitsOnly.charAt(
      digitsOnly.length - 1
    )
  );
}


// ==========================================
// PRICE FORMAT
// ==========================================

function formatPrice(price) {

  if (
    price === undefined ||
    price === null
  ) {

    return "—";
  }


  if (
    selectedPipSize &&
    Number(selectedPipSize) > 0
  ) {

    const pipText =
      String(
        selectedPipSize
      );


    if (
      pipText.includes(".")
    ) {

      const decimals =
        pipText
          .split(".")[1]
          .replace(
            /0+$/,
            ""
          )
          .length;


      if (decimals > 0) {

        return Number(price)
          .toFixed(decimals);
      }
    }
  }


  return String(price);
}


// ==========================================
// DATA DISPLAY
// ==========================================

function updateDataDisplay() {

  sampleSize.textContent =
    digits.length;


  if (
    digits.length === 0
  ) {

    hotDigit.textContent =
      "—";

    coldDigit.textContent =
      "—";

    streak.textContent =
      "—";

    digitDistribution.textContent =
      "Waiting for data...";

    digitHistory.textContent =
      "—";

    return;
  }


  const counts =
    Array(10).fill(0);


  digits.forEach(
    digit =>
      counts[digit]++
  );


  let hot =
    0;

  let cold =
    0;


  for (
    let i = 1;
    i < 10;
    i++
  ) {

    if (
      counts[i] >
      counts[hot]
    ) {

      hot = i;
    }


    if (
      counts[i] <
      counts[cold]
    ) {

      cold = i;
    }
  }


  hotDigit.textContent =
    hot;

  coldDigit.textContent =
    cold;

  streak.textContent =
    calculateStreak();


  renderDistribution(
    counts
  );


  digitHistory.textContent =
    digits
      .slice(-30)
      .join(" ");
}


// ==========================================
// DISTRIBUTION
// ==========================================

function renderDistribution(
  counts
) {

  const total =
    digits.length;


  digitDistribution.innerHTML =
    "";


  for (
    let i = 0;
    i <= 9;
    i++
  ) {

    const box =
      document.createElement(
        "div"
      );

    box.className =
      "digit-box";


    const label =
      document.createElement(
        "span"
      );

    label.textContent =
      i;


    const value =
      document.createElement(
        "strong"
      );


    const percent =
      total > 0
        ? (
            counts[i] /
            total *
            100
          )
        : 0;


    value.textContent =
      percent.toFixed(1) +
      "%";


    box.appendChild(
      label
    );

    box.appendChild(
      value
    );


    digitDistribution.appendChild(
      box
    );
  }
}


// ==========================================
// STREAK
// ==========================================

function calculateStreak() {

  if (
    digits.length === 0
  ) {

    return "—";
  }


  const last =
    digits[
      digits.length - 1
    ];


  let count =
    0;


  for (
    let i =
      digits.length - 1;
    i >= 0;
    i--
  ) {

    if (
      digits[i] === last
    ) {

      count++;

    } else {

      break;
    }
  }


  return (
    last +
    " × " +
    count
  );
}


// ==========================================
// ANALYSIS
// ==========================================

function toggleAnalysis() {

  if (
    analysisRunning
  ) {

    stopAnalysis();

  } else {

    startAnalysis();
  }
}


function startAnalysis() {

  analysisRunning =
    true;


  analysisButton.textContent =
    "STOP ANALYSIS";


  trend.textContent =
    "Monitoring";

  signalStrength.textContent =
    "Collecting";

  pattern.textContent =
    "Monitoring live digit behavior.";

  signal.textContent =
    "SCANNING";

  message.textContent =
    "Analyzer is monitoring " +
    getSelectedMarketName() +
    ".";


  updateAnalysis();
}


function stopAnalysis() {

  analysisRunning =
    false;


  analysisButton.textContent =
    "START ANALYSIS";


  trend.textContent =
    "Waiting";

  signalStrength.textContent =
    "Waiting";

  pattern.textContent =
    "Analysis stopped. Live data remains connected.";

  targetDigit.textContent =
    "—";

  matchesChance.textContent =
    "—";

  differsChance.textContent =
    "—";

  confidence.textContent =
    "—";

  validity.textContent =
    "—";

  signal.textContent =
    "WAIT";

  message.textContent =
    "Tap START ANALYSIS to resume.";
}


// ==========================================
// TEMPORARY ANALYSIS STATUS
// ==========================================

function updateAnalysis() {

  if (!analysisRunning) {
    return;
  }


  if (
    digits.length < 20
  ) {

    trend.textContent =
      "Collecting";

    signalStrength.textContent =
      "Low";

    pattern.textContent =
      "Waiting for more live ticks.";

    signal.textContent =
      "SCANNING";

    return;
  }


  trend.textContent =
    "Digit Flow";

  signalStrength.textContent =
    "Monitoring";

  pattern.textContent =
    "Live distribution detected. Prediction engine comes next.";

  signal.textContent =
    "SCANNING";
}


// ==========================================
// SELECTED MARKET NAME
// ==========================================

function getSelectedMarketName() {

  const market =
    markets.find(
      item =>
        item.symbol ===
        selectedSymbol
    );


  return market
    ? market.name
    : "selected market";
}


// ==========================================
// SEND
// ==========================================

function send(request) {

  if (
    !socket ||
    socket.readyState !==
      WebSocket.OPEN
  ) {

    showError(
      "WebSocket is not connected."
    );

    return false;
  }


  try {

    socket.send(
      JSON.stringify(
        request
      )
    );

    return true;

  } catch (error) {

    console.error(
      error
    );

    showError(
      "Failed to send request to Deriv."
    );

    return false;
  }
}


// ==========================================
// CONNECTION STATUS
// ==========================================

function setConnection(
  text,
  connected
) {

  connection.textContent =
    text;


  connection.style.color =
    connected
      ? "#079b76"
      : "#e45773";
}


// ==========================================
// ERROR
// ==========================================

function showError(
  text
) {

  console.error(
    "Trader Pro:",
    text
  );


  setConnection(
    "Deriv error: " +
    text,
    false
  );


  message.textContent =
    text;


  signal.textContent =
    "WAIT";
}


// ==========================================
// RECONNECT
// ==========================================

function scheduleReconnect() {

  if (reconnecting) {
    return;
  }


  reconnecting =
    true;


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


// ==========================================
// INITIALIZE
// ==========================================

connect();
