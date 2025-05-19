// Test file: test/server.test.js

// --- Function to be tested (copied from server.js) ---
// (Normally, you'd import this if your module system allowed,
// or refactor server.js to export it for testing)
function updateSquareControlAfterMove(game) {
  // Initialize Influence Map (not strictly needed for steam test if squareControl is preset)
  const influenceMap = Array(8).fill(null).map(() => 
    Array(8).fill(null).map(() => ({ white: 0, black: 0 }))
  );

  // Iterate Through Pieces for Direct Control and Influence (not strictly needed for steam test if squareControl is preset)
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = game.board ? game.board[row][col] : null; // Ensure game.board exists
      if (piece) {
        game.squareControl[row][col] = piece.player;
        const player = piece.player;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const adjRow = row + dr;
            const adjCol = col + dc;
            if (adjRow >= 0 && adjRow < 8 && adjCol >= 0 && adjCol < 8) {
              if (player === 'white') {
                influenceMap[adjRow][adjCol].white++;
              } else if (player === 'black') {
                influenceMap[adjRow][adjCol].black++;
              }
            }
          }
        }
      }
    }
  }

  // Update game.squareControl Based on Influence (not strictly needed for steam test if squareControl is preset)
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (game.board && game.board[r][c] === null) { // Ensure game.board exists
        const whiteInfluence = influenceMap[r][c].white;
        const blackInfluence = influenceMap[r][c].black;
        if (whiteInfluence > blackInfluence) {
          game.squareControl[r][c] = 'white';
        } else if (blackInfluence > whiteInfluence) {
          game.squareControl[r][c] = 'black';
        }
      }
    }
  }

  // --- Steam Generation Logic (this is what we're primarily testing) ---
  const currentPlayer = game.turn;
  let steamGained = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (game.squareControl[r][c] === currentPlayer) {
        steamGained++;
      }
    }
  }

  if (currentPlayer === 'white') {
    game.whiteSteam += steamGained;
  } else if (currentPlayer === 'black') {
    game.blackSteam += steamGained;
  }
}

// --- Test Helper Functions ---
function createMockGame(turn, whiteSteam, blackSteam, squareControlConfig) {
  const game = {
    turn: turn,
    whiteSteam: whiteSteam,
    blackSteam: blackSteam,
    // Initialize board to nulls for simplicity in these tests, as squareControl is manually set.
    // The parts of updateSquareControlAfterMove that use game.board are not the focus here.
    board: Array(8).fill(null).map(() => Array(8).fill(null)), 
    squareControl: Array(8).fill(null).map(() => Array(8).fill(null)),
    // players object might be needed if other parts of game logic were involved
    players: { white: {id: 'p1'}, black: {id: 'p2'}} 
  };

  // Apply squareControlConfig
  // Example: { 'white': [[0,0], [0,1]], 'black': [[7,7]] }
  if (squareControlConfig) {
    for (const player in squareControlConfig) {
      squareControlConfig[player].forEach(pos => {
        game.squareControl[pos[0]][pos[1]] = player;
      });
    }
  }
  return game;
}

function runTest(testName, testFunction) {
  try {
    testFunction();
    console.log(`PASS: ${testName}`);
  } catch (e) {
    console.error(`FAIL: ${testName}`);
    console.error(e);
  }
}

// --- Test Cases ---

runTest("White player gains steam based on controlled squares", () => {
  const controlledByWhite = [[0,0], [0,1], [1,0], [1,1], [2,2]]; // 5 squares
  const game = createMockGame('white', 10, 5, { 'white': controlledByWhite });
  
  // Simulate square control update (which also does steam generation)
  updateSquareControlAfterMove(game);

  if (game.whiteSteam !== 10 + controlledByWhite.length) {
    throw new Error(`White steam incorrect: expected ${10 + controlledByWhite.length}, got ${game.whiteSteam}`);
  }
  if (game.blackSteam !== 5) {
    throw new Error(`Black steam should not change: expected 5, got ${game.blackSteam}`);
  }
});

runTest("Black player gains steam based on controlled squares", () => {
  const controlledByBlack = [[7,7], [7,6], [6,7]]; // 3 squares
  const game = createMockGame('black', 10, 5, { 'black': controlledByBlack });

  updateSquareControlAfterMove(game);

  if (game.blackSteam !== 5 + controlledByBlack.length) {
    throw new Error(`Black steam incorrect: expected ${5 + controlledByBlack.length}, got ${game.blackSteam}`);
  }
  if (game.whiteSteam !== 10) {
    throw new Error(`White steam should not change: expected 10, got ${game.whiteSteam}`);
  }
});

runTest("No steam change if player controls no squares", () => {
  const game = createMockGame('white', 10, 5, {}); // White controls 0 squares

  updateSquareControlAfterMove(game);

  if (game.whiteSteam !== 10) {
    throw new Error(`White steam should not change: expected 10, got ${game.whiteSteam}`);
  }
  if (game.blackSteam !== 5) {
    throw new Error(`Black steam should not change: expected 5, got ${game.blackSteam}`);
  }
});

runTest("Steam generation correctly attributes to current player only (White's turn, Black has squares)", () => {
  const controlledByBlack = [[7,7], [7,6]]; // 2 squares for black
  const game = createMockGame('white', 10, 5, { 'black': controlledByBlack }); // White's turn

  updateSquareControlAfterMove(game);
  
  // White controls 0 squares explicitly in this config, so gains 0.
  if (game.whiteSteam !== 10) { 
    throw new Error(`White steam incorrect: expected 10, got ${game.whiteSteam}`);
  }
  if (game.blackSteam !== 5) { // Black steam should not change as it's not black's turn
    throw new Error(`Black steam should not change: expected 5, got ${game.blackSteam}`);
  }
});

runTest("Steam generation correctly attributes to current player only (Black's turn, White has squares)", () => {
  const controlledByWhite = [[0,0], [0,1]]; // 2 squares for white
  const game = createMockGame('black', 10, 5, { 'white': controlledByWhite }); // Black's turn

  updateSquareControlAfterMove(game);

  // Black controls 0 squares explicitly in this config, so gains 0.
  if (game.blackSteam !== 5) {
    throw new Error(`Black steam incorrect: expected 5, got ${game.blackSteam}`);
  }
  if (game.whiteSteam !== 10) { // White steam should not change as it's not white's turn
    throw new Error(`White steam should not change: expected 10, got ${game.whiteSteam}`);
  }
});

runTest("Steam generation with mixed control squares", () => {
  const controlledByWhite = [[0,0], [0,1], [0,2]]; // 3 squares
  const controlledByBlack = [[7,7], [7,6]];    // 2 squares
  const game = createMockGame('white', 20, 30, { 
    'white': controlledByWhite, 
    'black': controlledByBlack 
  });

  updateSquareControlAfterMove(game);

  if (game.whiteSteam !== 20 + controlledByWhite.length) {
    throw new Error(`White steam incorrect: expected ${20 + controlledByWhite.length}, got ${game.whiteSteam}`);
  }
  if (game.blackSteam !== 30) { // Black steam should not change as it's white's turn
    throw new Error(`Black steam should not change: expected 30, got ${game.blackSteam}`);
  }
});

console.log("\n--- Steam Generation Tests Complete ---");
// To run these tests: node test/server.test.js
// Ensure server.js is not running if it also prints to console, to avoid confusion.
// The updateSquareControlAfterMove function is self-contained for steam calculation
// once game.squareControl and game.turn are set.
// The parts of it that calculate squareControl itself are not the primary focus of these *steam* tests.
// If piecesData were required for the steam calculation part, it would need to be mocked or provided.
// For these tests, game.board is minimally mocked as it's used by the full updateSquareControlAfterMove.
// If testing only the steam *segment*, that segment could be extracted into its own function.
