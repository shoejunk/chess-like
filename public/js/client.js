// client.js - to be included in public/js/client.js

// Game canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Constants
const BOARD_SIZE = 8;
const SQUARE_SIZE = 80;
const HEALTH_BAR_HEIGHT = 10;
const HEALTH_BAR_WIDTH = 60;
const HEALTH_BAR_OFFSET = 10;

// Set canvas size
canvas.width = BOARD_SIZE * SQUARE_SIZE;
canvas.height = BOARD_SIZE * SQUARE_SIZE;

// Game state
let gameState = null;
let piecesData = null;
let selectedPiece = null;
let playerColor = null;
let pieceImages = {};

// Connect to WebSocket server
const socket = new WebSocket(`ws://${window.location.host}`);

// WebSocket event handlers
socket.onopen = () => {
  console.log('Connected to server');
  document.getElementById('status').textContent = 'Connected to server...';
};

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'piecesData':
      // Store pieces data and preload images
      piecesData = message.data;
      preloadImages();
      break;
      
    case 'waiting':
      document.getElementById('status').textContent = message.message;
      break;
      
    case 'gameState':
      // Update game state
      gameState = message.data;
      playerColor = message.data.playerColor;
      document.getElementById('status').textContent = 
        gameState.status === 'active' 
          ? `Game active - ${gameState.turn}'s turn${playerColor === gameState.turn ? ' (Your turn)' : ''}` 
          : `Game over - ${gameState.status.split('_')[0]} wins!`;
      
      // Render the updated board
      renderBoard();
      break;
      
    case 'opponentDisconnected':
      document.getElementById('status').textContent = message.message;
      break;
  }
};

socket.onclose = () => {
  console.log('Disconnected from server');
  document.getElementById('status').textContent = 'Disconnected from server';
};

// Preload piece images
function preloadImages() {
  Object.keys(piecesData).forEach(pieceType => {
    const piece = piecesData[pieceType];
    const img = new Image();
    img.src = piece.image;
    pieceImages[pieceType] = img;
  });
}

// Render the game board
function renderBoard() {
  if (!gameState) return;
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw board squares
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      // Alternate square colors
      ctx.fillStyle = (row + col) % 2 === 0 ? '#ececd7' : '#7c945d';
      
      // Highlight selected piece's square
      if (selectedPiece && selectedPiece.position[0] === row && selectedPiece.position[1] === col) {
        ctx.fillStyle = '#f6f669';
      }
      
      ctx.fillRect(col * SQUARE_SIZE, row * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
    }
  }
  
  // Draw pieces and health bars
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = gameState.board[row][col];
      if (piece) {
        // Draw piece image
        const img = pieceImages[piece.type];
        if (img) {
          ctx.drawImage(
            img, 
            col * SQUARE_SIZE + 10, 
            row * SQUARE_SIZE + 10, 
            SQUARE_SIZE - 20, 
            SQUARE_SIZE - 20
          );
        }
        
        // Draw health bar background
        ctx.fillStyle = '#333';
        ctx.fillRect(
          col * SQUARE_SIZE + (SQUARE_SIZE - HEALTH_BAR_WIDTH) / 2,
          row * SQUARE_SIZE + HEALTH_BAR_OFFSET,
          HEALTH_BAR_WIDTH,
          HEALTH_BAR_HEIGHT
        );
        
        // Calculate health percentage
        const maxHealth = piecesData[piece.type].health;
        const healthPercentage = Math.max(0, piece.health / maxHealth);
        
        // Draw health bar fill
        ctx.fillStyle = healthPercentage > 0.5 ? '#4CAF50' : healthPercentage > 0.25 ? '#FFC107' : '#F44336';
        ctx.fillRect(
          col * SQUARE_SIZE + (SQUARE_SIZE - HEALTH_BAR_WIDTH) / 2,
          row * SQUARE_SIZE + HEALTH_BAR_OFFSET,
          HEALTH_BAR_WIDTH * healthPercentage,
          HEALTH_BAR_HEIGHT
        );
      }
    }
  }
}

// Handle canvas click
canvas.addEventListener('click', (event) => {
  // Only allow interaction if game is active and it's the player's turn
  if (!gameState || gameState.status !== 'active' || gameState.turn !== playerColor) {
    return;
  }
  
  // Get clicked square coordinates
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  const col = Math.floor(x / SQUARE_SIZE);
  const row = Math.floor(y / SQUARE_SIZE);
  
  // If a piece is already selected
  if (selectedPiece) {
    // Same square clicked again - deselect
    if (selectedPiece.position[0] === row && selectedPiece.position[1] === col) {
      selectedPiece = null;
      renderBoard();
      return;
    }
    
    // Different square clicked - attempt move
    socket.send(JSON.stringify({
      type: 'move',
      from: selectedPiece.position,
      to: [row, col]
    }));
    
    // Reset selection
    selectedPiece = null;
  } 
  // No piece selected yet
  else {
    const piece = gameState.board[row][col];
    
    // Only allow selecting the player's own pieces
    if (piece && piece.player === playerColor) {
      selectedPiece = piece;
      renderBoard();
    }
  }
});

// Initial render
renderBoard();