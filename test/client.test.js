// Test file: test/client.test.js

// --- Mocking DOM and global variables ---
let mockSteamDisplayElement = { textContent: '' };
let mockCanvasElement = {
  getContext: () => ({
    clearRect: () => {},
    fillRect: () => {},
    drawImage: () => {},
    fillText: () => {},
    // Mock other canvas context methods if client.js's renderBoard uses them
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    arc: () => {},
    fill: () => {},
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
  }),
  // Mock canvas properties if needed
  width: 0,
  height: 0,
};

global.document = {
  getElementById: function(id) {
    if (id === 'steamDisplay') {
      return mockSteamDisplayElement;
    }
    if (id === 'gameCanvas') {
      return mockCanvasElement;
    }
    return null;
  }
};

// --- Global state variables for tests (simulating client.js) ---
let gameState = null;
let playerColor = null;
let piecesData = {}; // Mocked, as renderBoard might expect it

// This is the element client.js would use, now pointing to our mock
const steamDisplayElement = global.document.getElementById('steamDisplay');

// --- Simplified/Relevant client.js logic for testing ---

// renderBoard is simplified as steam display is no longer its direct responsibility
// but it might be called by the gameState handler.
function renderBoard() {
  if (!gameState || !piecesData) {
    // console.log("MockRenderBoard: gameState or piecesData not ready.");
    return;
  }
  // Simulate some canvas operations if they were crucial before steam display update
  // For now, this is a no-op for steam testing.
}

// This function simulates the part of socket.onmessage that handles 'gameState'
// and updates the steam display. This is what we'll primarily test.
function handleGameStateMessage(newGameState, newPlayerColor) {
  gameState = newGameState; // gameState from the message
  // In the actual client.js, playerColor is also updated from the message's data.gameState.playerColor
  // For testing, we pass it explicitly to simulate this.
  playerColor = newPlayerColor; 


  // --- This is the core logic from client.js for updating the HTML steam display ---
  // Based on the actual client.js:
  // const steamDisplayElement = document.getElementById('steamDisplay'); // This is global in client.js
  // playerColor is a global in client.js, updated from message.data.playerColor
  // gameState is a global in client.js, updated from message.data
  
  if (steamDisplayElement && playerColor && gameState) {
    let currentSteam = 0;
    if (playerColor === 'white' && gameState.whiteSteam !== undefined && gameState.whiteSteam !== null) {
      currentSteam = gameState.whiteSteam;
    } else if (playerColor === 'black' && gameState.blackSteam !== undefined && gameState.blackSteam !== null) {
      currentSteam = gameState.blackSteam;
    }
    steamDisplayElement.textContent = `Steam: ${currentSteam}`;
  } else if (steamDisplayElement) { 
    // This else-if branch from client.js handles cases where playerColor might not be set,
    // or gameState might be missing some details, defaulting the display.
    steamDisplayElement.textContent = "Steam: -";
  }
  // --- End of core logic ---
}


// --- Test Helper Functions ---
function setupTest(initialGameState, initialPlayerColor) {
  // Reset mock element's textContent before each test
  mockSteamDisplayElement.textContent = ''; 
  
  // Set initial state for gameState and playerColor for the test functions
  // This simulates how client.js would have these variables set at the time of a message.
  gameState = initialGameState; 
  playerColor = initialPlayerColor;

  // Call the handler to set the initial display based on these states.
  // This simulates receiving an initial gameState message.
  handleGameStateMessage(initialGameState, initialPlayerColor);
}

function runTest(testName, testFunction) {
  try {
    testFunction();
    console.log(`PASS: ${testName}`);
  } catch (e) {
    console.error(`FAIL: ${testName} :: ${e.message}`);
    // console.error(e.stack || e); // Optional: full stack
  }
}

// --- Test Cases ---

runTest("Steam display shows white player's steam correctly", () => {
  const gs = { turn: 'white', whiteSteam: 123, blackSteam: 50 };
  setupTest(gs, 'white');
  if (mockSteamDisplayElement.textContent !== "Steam: 123") {
    throw new Error(`Expected "Steam: 123", got "${mockSteamDisplayElement.textContent}"`);
  }
});

runTest("Steam display shows black player's steam correctly", () => {
  const gs = { turn: 'black', whiteSteam: 50, blackSteam: 789 };
  setupTest(gs, 'black');
  if (mockSteamDisplayElement.textContent !== "Steam: 789") {
    throw new Error(`Expected "Steam: 789", got "${mockSteamDisplayElement.textContent}"`);
  }
});

runTest("Steam display shows local player's steam (White) even if not their turn", () => {
  const gs = { turn: 'black', whiteSteam: 101, blackSteam: 200 }; // White player, Black's turn
  setupTest(gs, 'white');
  if (mockSteamDisplayElement.textContent !== "Steam: 101") {
    throw new Error(`Expected "Steam: 101" for white player, got "${mockSteamDisplayElement.textContent}"`);
  }
});

runTest("Steam display shows local player's steam (Black) even if not their turn", () => {
  const gs = { turn: 'white', whiteSteam: 100, blackSteam: 202 }; // Black player, White's turn
  setupTest(gs, 'black');
  if (mockSteamDisplayElement.textContent !== "Steam: 202") {
    throw new Error(`Expected "Steam: 202" for black player, got "${mockSteamDisplayElement.textContent}"`);
  }
});

runTest("Steam display shows 'Steam: 0' if whiteSteam is undefined", () => {
  const gs = { turn: 'white', blackSteam: 50 }; // whiteSteam is undefined
  setupTest(gs, 'white');
  if (mockSteamDisplayElement.textContent !== "Steam: 0") {
    throw new Error(`Expected "Steam: 0" for undefined whiteSteam, got "${mockSteamDisplayElement.textContent}"`);
  }
});

runTest("Steam display shows 'Steam: 0' if blackSteam is undefined", () => {
  const gs = { turn: 'black', whiteSteam: 50 }; // blackSteam is undefined
  setupTest(gs, 'black');
  if (mockSteamDisplayElement.textContent !== "Steam: 0") {
    throw new Error(`Expected "Steam: 0" for undefined blackSteam, got "${mockSteamDisplayElement.textContent}"`);
  }
});

runTest("Steam display shows 'Steam: 0' if whiteSteam is null", () => {
  const gs = { turn: 'white', whiteSteam: null, blackSteam: 50 };
  setupTest(gs, 'white');
  if (mockSteamDisplayElement.textContent !== "Steam: 0") {
    throw new Error(`Expected "Steam: 0" for null whiteSteam, got "${mockSteamDisplayElement.textContent}"`);
  }
});

runTest("Steam display shows 'Steam: 0' if blackSteam is null", () => {
  const gs = { turn: 'black', whiteSteam: 50, blackSteam: null };
  setupTest(gs, 'black');
  if (mockSteamDisplayElement.textContent !== "Steam: 0") {
    throw new Error(`Expected "Steam: 0" for null blackSteam, got "${mockSteamDisplayElement.textContent}"`);
  }
});

runTest("Steam display shows 'Steam: -' if gameState is initially null", () => {
  setupTest(null, 'white'); // gameState is null
  if (mockSteamDisplayElement.textContent !== "Steam: -") {
    throw new Error(`Expected "Steam: -" for null gameState, got "${mockSteamDisplayElement.textContent}"`);
  }
});

runTest("Steam display shows 'Steam: -' if playerColor is null, even with valid gameState", () => {
  const gs = { turn: 'white', whiteSteam: 100, blackSteam: 200 };
  setupTest(gs, null); // playerColor is null
  if (mockSteamDisplayElement.textContent !== "Steam: -") {
    throw new Error(`Expected "Steam: -" for null playerColor, got "${mockSteamDisplayElement.textContent}"`);
  }
});

runTest("Steam display updates correctly on multiple gameState messages", () => {
  // Initial state: White player, 10 steam
  const gs1 = { turn: 'white', whiteSteam: 10, blackSteam: 5 };
  setupTest(gs1, 'white'); // This already calls handleGameStateMessage with gs1
  if (mockSteamDisplayElement.textContent !== "Steam: 10") {
    throw new Error(`Initial: Expected "Steam: 10", got "${mockSteamDisplayElement.textContent}"`);
  }

  // Second message: White player, steam increases to 15
  // Note: playerColor ('white') is maintained as it's the local player's color.
  // gameState.turn might change, but playerColor for the client instance does not.
  const gs2 = { turn: 'black', whiteSteam: 15, blackSteam: 5 }; 
  handleGameStateMessage(gs2, 'white'); // Simulate receiving a new game state
  if (mockSteamDisplayElement.textContent !== "Steam: 15") {
    throw new Error(`Update 1: Expected "Steam: 15", got "${mockSteamDisplayElement.textContent}"`);
  }

  // Third message: White player, steam decreases to 12
  const gs3 = { turn: 'white', whiteSteam: 12, blackSteam: 8 };
  handleGameStateMessage(gs3, 'white'); // Simulate another new game state
  if (mockSteamDisplayElement.textContent !== "Steam: 12") {
    throw new Error(`Update 2: Expected "Steam: 12", got "${mockSteamDisplayElement.textContent}"`);
  }
});

runTest("Steam display shows 'Steam: 0' for white player when whiteSteam is 0", () => {
  const gs = { turn: 'white', whiteSteam: 0, blackSteam: 50 };
  setupTest(gs, 'white');
  if (mockSteamDisplayElement.textContent !== "Steam: 0") {
    throw new Error(`Expected "Steam: 0", got "${mockSteamDisplayElement.textContent}"`);
  }
});

runTest("Steam display shows 'Steam: 0' for black player when blackSteam is 0", () => {
  const gs = { turn: 'black', whiteSteam: 50, blackSteam: 0 };
  setupTest(gs, 'black');
  if (mockSteamDisplayElement.textContent !== "Steam: 0") {
    throw new Error(`Expected "Steam: 0", got "${mockSteamDisplayElement.textContent}"`);
  }
});


console.log("\n--- Client Steam Display (HTML Element) Logic Tests Complete ---");
// To run these tests: node test/client.test.js
// These tests verify the logic that updates the #steamDisplay HTML element's textContent.
// They mock document.getElementById and the element itself.
// The core tested logic is encapsulated in the handleGameStateMessage function for clarity.
// renderBoard is now mostly a no-op in the test context for steam display.
// piecesData is minimally mocked as the original client.js renderBoard checks for it.
// The global steamDisplayElement variable in this test file is correctly assigned the mock.
// The `setupTest` helper initializes the state for each test by calling handleGameStateMessage.
// Subsequent state changes in a single test are done by directly calling handleGameStateMessage.
// Typo `mockSteamDisplayMement` was corrected to `mockSteamDisplayElement`.
