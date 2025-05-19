// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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
      white: player1,
      black: player2
    },
    turn: 'white',
    board: initializeBoard(),
    status: 'active'
  };
  
  // Assign game to players
  player1.gameId = gameId;
  player1.color = 'white';
  player2.gameId = gameId;
  player2.color = 'black';
  
  // Store game
  games[gameId] = game;
  
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

// Send game state to players
function sendGameState(game) {
  const { white, black } = game.players;
  
  if (white && white.readyState === WebSocket.OPEN) {
    white.send(JSON.stringify({
      type: 'gameState',
      data: {
        ...game,
        playerColor: 'white'
      }
    }));
  }
  
  if (black && black.readyState === WebSocket.OPEN) {
    black.send(JSON.stringify({
      type: 'gameState',
      data: {
        ...game,
        playerColor: 'black'
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
  if (whitePiecesCount === 0) {
    game.status = 'black_wins';
  } else if (blackPiecesCount === 0) {
    game.status = 'white_wins';
  }
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Send pieces data to client
  ws.send(JSON.stringify({
    type: 'piecesData',
    data: piecesData
  }));
  
  // Handle game matching
  if (!waitingPlayer) {
    waitingPlayer = ws;
    ws.send(JSON.stringify({
      type: 'waiting',
      message: 'Waiting for opponent...'
    }));
  } else {
    // Create a new game with waiting player
    createGame(waitingPlayer, ws);
    waitingPlayer = null;
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
      const opponent = ws.color === 'white' ? game.players.black : game.players.white;
      
      if (opponent && opponent.readyState === WebSocket.OPEN) {
        opponent.send(JSON.stringify({
          type: 'opponentDisconnected',
          message: 'Your opponent has disconnected.'
        }));
      }
      
      // Remove game
      delete games[gameId];
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});