// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const bodyParser = require('body-parser');
const url = require('url'); // For parsing WebSocket URL query parameters

// Initialize Express app
const app = express();
app.use(bodyParser.json()); // For parsing JSON request bodies
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Google Auth Client Initialization
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'; // TODO: Use environment variable
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// In-memory store for authenticated users (replace with a database in production)
let authenticatedUsers = {};

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Game state and player tracking
let games = {};
let waitingPlayer = null;

// Load piece definitions from JSON
const piecesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'pieces.json'), 'utf8'));

// Game creation function
function createGame(player1, player2) {
  const gameId = Date.now().toString();
  
  // Initialize game state
  const game = {
    id: gameId,
    players: {
      white: {
        ws: player1, 
        userId: player1.userId, // Populated from WebSocket connection
        name: player1.userName // Populated from WebSocket connection
      },
      black: {
        ws: player2,
        userId: player2.userId,
        name: player2.userName
      }
    },
    turn: 'white',
    board: initializeBoard(),
    squareControl: Array(8).fill(null).map(() => Array(8).fill(null)),
    status: 'active',
    whiteSteam: 0,
    blackSteam: 0
  };
  
  // Assign game to players
  player1.gameId = gameId;
  player1.color = 'white';
  player2.gameId = gameId;
  player2.color = 'black';
  
  // Store game
  games[gameId] = game;

  console.log(`Game ${gameId} created between ${player1.userName || 'Player 1'} (White) and ${player2.userName || 'Player 2'} (Black)`);
  if (player1.userId) console.log(`Player 1 (White) Google ID: ${player1.userId}`);
  if (player2.userId) console.log(`Player 2 (Black) Google ID: ${player2.userId}`);
  
  // Send initial game state to both players
  sendGameState(game);
  
  return game;
}

// Initialize the board with pieces from JSON
function initializeBoard() {
  const board = Array(8).fill().map(() => Array(8).fill(null));
  
  // Set up pieces for both players
  Object.keys(piecesData).forEach(pieceType => {
    const piece = piecesData[pieceType];
    
    // Add white pieces
    piece.initialPositions.white.forEach(pos => {
      board[pos[0]][pos[1]] = {
        id: `w_${pieceType}_${pos[0]}_${pos[1]}`,
        type: pieceType,
        player: 'white',
        health: piece.health,
        attack: piece.attack,
        image: piece.image,
        position: [pos[0], pos[1]]
      };
    });
    
    // Add black pieces
    piece.initialPositions.black.forEach(pos => {
      board[pos[0]][pos[1]] = {
        id: `b_${pieceType}_${pos[0]}_${pos[1]}`,
        type: pieceType,
        player: 'black',
        health: piece.health,
        attack: piece.attack,
        image: piece.image,
        position: [pos[0], pos[1]]
      };
    });
  });
  
  return board;
}

// Calculate initial square control
function calculateInitialSquareControl(game) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (game.board[r][c] !== null) {
        game.squareControl[r][c] = game.board[r][c].player;
      }
    }
  }
}

// Update square control after a move
function updateSquareControlAfterMove(game) {
  // Initialize Influence Map
  const influenceMap = Array(8).fill(null).map(() => 
    Array(8).fill(null).map(() => ({ white: 0, black: 0 }))
  );

  // Iterate Through Pieces for Direct Control and Influence
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = game.board[row][col];
      if (piece) {
        // Direct Control: Piece's current square is controlled by its player
        game.squareControl[row][col] = piece.player;

        // Adjacent Influence
        const player = piece.player;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue; // Skip the piece's own square

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

  // Update game.squareControl Based on Influence
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      // Only update if not directly controlled by a piece after the move
      if (game.board[r][c] === null) { 
        const whiteInfluence = influenceMap[r][c].white;
        const blackInfluence = influenceMap[r][c].black;

        if (whiteInfluence > blackInfluence) {
          game.squareControl[r][c] = 'white';
        } else if (blackInfluence > whiteInfluence) {
          game.squareControl[r][c] = 'black';
        } else {
          // If influence is tied, or zero for both, and the square is empty,
          // it becomes neutral (null), unless it was already controlled.
          // The subtask description implies keeping currentController if tied.
          // However, for empty squares, if influence is tied (e.g. 0-0 or 1-1), 
          // it should be neutral (null), not necessarily the previous controller
          // If influence is tied (whiteInfluence === blackInfluence) for an EMPTY square,
          // game.squareControl[r][c] should remain currentController.
          // 'currentController' is its value after the direct control updates and before this influence check.
          // This means we do nothing in the 'else' case here, preserving its existing value.
        }
      }
      // If game.board[r][c] is NOT null (i.e., a piece is on it), 
      // its control was definitively set by the direct control logic earlier in this function,
      // and should not be overridden by influence calculations here.
    }
  }

  // Generate steam for the player whose turn it just was
  const currentPlayer = game.turn; // Player who just made the move
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

// Send game state to players
function sendGameState(game) {
  const whitePlayerWs = game.players.white.ws;
  const blackPlayerWs = game.players.black.ws;
  
  if (whitePlayerWs && whitePlayerWs.readyState === WebSocket.OPEN) {
    whitePlayerWs.send(JSON.stringify({
      type: 'gameState',
      data: {
        // Be careful not to send the 'ws' object itself
        id: game.id,
        playersInfo: { // Send non-sensitive player info
            white: { userId: game.players.white.userId, name: game.players.white.name },
            black: { userId: game.players.black.userId, name: game.players.black.name }
        },
        turn: game.turn,
        board: game.board,
        squareControl: game.squareControl,
        status: game.status,
        whiteSteam: game.whiteSteam,
        blackSteam: game.blackSteam,
        playerColor: 'white' // Specific to this player
      }
    }));
  }
  
  if (blackPlayerWs && blackPlayerWs.readyState === WebSocket.OPEN) {
    blackPlayerWs.send(JSON.stringify({
      type: 'gameState',
      data: {
        id: game.id,
        playersInfo: {
            white: { userId: game.players.white.userId, name: game.players.white.name },
            black: { userId: game.players.black.userId, name: game.players.black.name }
        },
        turn: game.turn,
        board: game.board,
        squareControl: game.squareControl,
        status: game.status,
        whiteSteam: game.whiteSteam,
        blackSteam: game.blackSteam,
        playerColor: 'black' // Specific to this player
      }
    }));
  }
}

// Check if move is valid based on piece movement rules
function isValidMove(game, fromPos, toPos, piece) {
  const [fromRow, fromCol] = fromPos;
  const [toRow, toCol] = toPos;
  
  // Get piece type info
  const pieceData = piecesData[piece.type];
  
  // Target square validation
  const targetSquare = game.board[toRow][toCol];
  const isTargetEmpty = targetSquare === null;
  const isTargetEnemy = targetSquare !== null && targetSquare.player !== piece.player;
  
  if (!isTargetEmpty && !isTargetEnemy) {
    return false;
  }
  
  // Check each movement rule
  for (const movement of pieceData.movement) {
    if (movement.type === 'straight') {
      if (movement.direction === 'horizontal' && fromRow === toRow) {
        const range = movement.range;
        const distance = Math.abs(toCol - fromCol);
        
        if (distance > 0 && distance <= range) {
          // Check path is clear (except destination)
          const start = Math.min(fromCol, toCol);
          const end = Math.max(fromCol, toCol);
          
          let pathClear = true;
          for (let col = start + 1; col < end; col++) {
            if (game.board[fromRow][col] !== null) {
              pathClear = false;
              break;
            }
          }
          
          if (pathClear) return true;
        }
      }
      else if (movement.direction === 'vertical' && fromCol === toCol) {
        const range = movement.range;
        const distance = Math.abs(toRow - fromRow);
        
        if (distance > 0 && distance <= range) {
          // Check path is clear (except destination)
          const start = Math.min(fromRow, toRow);
          const end = Math.max(fromRow, toRow);
          
          let pathClear = true;
          for (let row = start + 1; row < end; row++) {
            if (game.board[row][fromCol] !== null) {
              pathClear = false;
              break;
            }
          }
          
          if (pathClear) return true;
        }
      }
    }
    else if (movement.type === 'hop') {
      const horizontalDistance = Math.abs(toCol - fromCol);
      const verticalDistance = Math.abs(toRow - fromRow);
      
      if (horizontalDistance === movement.horizontal && 
          verticalDistance === movement.vertical) {
        return true;
      }
    }
  }
  
  return false;
}

// Process move
function processMove(game, fromPos, toPos) {
  const [fromRow, fromCol] = fromPos;
  const [toRow, toCol] = toPos;
  
  const piece = game.board[fromRow][fromCol];
  const target = game.board[toRow][toCol];
  
  // If target is enemy, process attack
  if (target && target.player !== piece.player) {
    // Reduce target health
    target.health -= piece.attack;
    
    // If target health <= 0, remove it
    if (target.health <= 0) {
      game.board[toRow][toCol] = piece;
      game.board[fromRow][fromCol] = null;
      piece.position = [toRow, toCol];
    }
    // Otherwise, piece stays in place
  }
  // If target square is empty, move piece
  else {
    game.board[toRow][toCol] = piece;
    game.board[fromRow][fromCol] = null;
    piece.position = [toRow, toCol];
  }
  
  // Check win condition
  checkWinCondition(game);
  
  // Update square control
  updateSquareControlAfterMove(game);
  
  // Switch turns
  game.turn = game.turn === 'white' ? 'black' : 'white';
  
  // Send updated game state
  sendGameState(game);
}

// Check win condition
function checkWinCondition(game) {
  let whitePiecesCount = 0;
  let blackPiecesCount = 0;
  
  // Count pieces for both players
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = game.board[row][col];
      if (piece) {
        if (piece.player === 'white') {
          whitePiecesCount++;
        } else {
          blackPiecesCount++;
        }
      }
    }
  }
  
  // Check win condition
  const whitePlayerName = game.players.white.name || 'White';
  const blackPlayerName = game.players.black.name || 'Black';

  if (whitePiecesCount === 0) {
    game.status = `${blackPlayerName}_wins`; // e.g., "PlayerX_wins"
  } else if (blackPiecesCount === 0) {
    game.status = `${whitePlayerName}_wins`; // e.g., "PlayerY_wins"
  }
}

// --- Google Token Verification Helper ---
async function verifyGoogleToken(token) {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });
    return ticket.getPayload(); // Contains user's Google ID (sub), email, name, etc.
  } catch (error) {
    console.error('Error verifying Google token:', error.message);
    return null;
  }
}

// --- HTTP Route for Token Verification ---
app.post('/auth/google/verify-token', async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) {
    return res.status(400).json({ success: false, message: 'ID token not provided.' });
  }

  const payload = await verifyGoogleToken(id_token);

  if (payload) {
    // Store user (or update if exists)
    authenticatedUsers[payload.sub] = {
      googleId: payload.sub,
      name: payload.name,
      email: payload.email,
      // lastVerified: Date.now() // Optional: for session management
    };
    console.log(`User ${payload.name} (${payload.sub}) authenticated via HTTP.`);
    res.json({ 
      success: true, 
      user: { googleId: payload.sub, name: payload.name, email: payload.email } 
    });
  } else {
    res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
});


// WebSocket connection handling
wss.on('connection', async (ws, req) => { // Added req to access upgradeReq
  console.log('Client attempting to connect via WebSocket...');

  const query = url.parse(req.url, true).query;
  const token = query.token;

  let userPayload = null;
  if (token) {
    userPayload = await verifyGoogleToken(token);
    if (userPayload) {
      ws.userId = userPayload.sub;
      ws.userName = userPayload.name;
      console.log(`Client connected with Google ID: ${ws.userId} (${ws.userName})`);
      
      // Add user to authenticatedUsers if not already (e.g., if they skipped HTTP verification somehow)
      if (!authenticatedUsers[ws.userId]) {
        authenticatedUsers[ws.userId] = {
          googleId: ws.userId,
          name: ws.userName,
          email: userPayload.email,
        };
      }
    } else {
      console.log('Client connected with invalid token.');
      // Optionally, close connection or mark as unauthenticated
      // For now, allow connection but ws.userId will be undefined.
      // ws.close(); return; // Example: strict enforcement
    }
  } else {
    console.log('Client connected without a token.');
    // Optionally, close connection or mark as unauthenticated
    // ws.close(); return; // Example: strict enforcement
  }

  // Send pieces data to client (regardless of auth for now, can be conditional)
  ws.send(JSON.stringify({
    type: 'piecesData',
    data: piecesData
  }));
  
  // Handle game matching
  // Only match authenticated players (or players with a userId, even if token was initially invalid but accepted)
  if (ws.userId) { // Check if user is considered authenticated (has a userId)
    if (!waitingPlayer) {
      waitingPlayer = ws;
      ws.send(JSON.stringify({
        type: 'waiting',
        message: 'Waiting for opponent...'
      }));
    } else {
      if (waitingPlayer.userId !== ws.userId) { // Prevent self-matching
        createGame(waitingPlayer, ws);
        waitingPlayer = null;
      } else {
        // Same user connected again, perhaps in a new tab.
        // Don't match with self. Keep them as waitingPlayer or replace if this is a newer connection.
        // For now, we'll just ignore this case and the old waitingPlayer remains.
        console.log("User tried to match with themselves. Ignoring.");
         ws.send(JSON.stringify({
            type: 'waiting',
            message: 'Cannot match with yourself. Still waiting for opponent...'
        }));
      }
    }
  } else {
    ws.send(JSON.stringify({
        type: 'error', // Custom type for client to handle
        message: 'Authentication required to play. Please sign in and reconnect.'
    }));
    // Optionally close the connection if strict authentication is required to even receive piecesData
    // ws.close(); 
  }
  
  // Handle messages from client
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    
    // Handle move request
    if (data.type === 'move') {
      const game = games[ws.gameId];
      
      // Ensure it's the player's turn
      if (game && game.turn === ws.color) {
        const { from, to } = data;
        const piece = game.board[from[0]][from[1]];
        
        // Check if piece belongs to player
        if (piece && piece.player === ws.color) {
          // Validate and process move
          if (isValidMove(game, from, to, piece)) {
            processMove(game, from, to);
          }
        }
      }
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
    
    // If player was waiting, clear waiting player
    if (waitingPlayer === ws) {
      waitingPlayer = null;
    }
    
    // If player was in a game, notify opponent and end game
    const gameId = ws.gameId;
    if (gameId && games[gameId]) {
      const game = games[gameId];
      // Determine opponent's WebSocket connection
      let opponentWs = null;
      if (ws.color === 'white' && game.players.black) {
        opponentWs = game.players.black.ws;
      } else if (ws.color === 'black' && game.players.white) {
        opponentWs = game.players.white.ws;
      }
      
      if (opponentWs && opponentWs.readyState === WebSocket.OPEN) {
        const disconnectedPlayerName = ws.userName || (ws.color === 'white' ? 'White' : 'Black');
        opponentWs.send(JSON.stringify({
          type: 'opponentDisconnected',
          message: `Your opponent (${disconnectedPlayerName}) has disconnected. Game over.`
        }));
        // Also, update the game status for the disconnected player's game, so if they refresh they see it.
        // However, the game is deleted shortly after.
        // If the game wasn't deleted, you might set:
        // game.status = `${opponentWs.color === 'white' ? (game.players.white.name || 'White') : (game.players.black.name || 'Black')}_wins_by_disconnect`;
      }
      
      // Remove game
      delete games[gameId];
      console.log(`Game ${gameId} removed due to player disconnection.`);
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});