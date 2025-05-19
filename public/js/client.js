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
const WHITE_CONTROL_COLOR = 'rgba(173, 216, 230, 0.5)'; // Light blue with 50% opacity
const BLACK_CONTROL_COLOR = 'rgba(255, 182, 193, 0.5)'; // Light red/pink with 50% opacity
const DRAG_THRESHOLD = 5; // Pixels

// Set canvas size
canvas.width = BOARD_SIZE * SQUARE_SIZE;
canvas.height = BOARD_SIZE * SQUARE_SIZE;

// Game state
let gameState = null;
let piecesData = null;
let selectedPiece = null;
let playerColor = null;
let pieceImages = {};
let totalImagesToLoad = 0;
let imagesLoadedSuccessfully = 0;

// Drag and Drop state
let isDragging = false;
let draggedPiece = null;
let draggedPieceOrigPos = null; // e.g., { row: r, col: c }
let mousePos = { x: 0, y: 0 }; // To store current mouse coordinates relative to canvas


// Connect to WebSocket server
const socket = new WebSocket(`ws://${window.location.host}`);

// Function to render the board with a ghost piece during drag
function renderBoardWithGhostPiece() {
  renderBoard(); // Render the main board first

  if (isDragging && draggedPiece) {
    const img = pieceImages[draggedPiece.type];
    if (img && img.complete) { // Check if image is loaded
      // Draw the ghost piece centered on the mouse cursor
      ctx.globalAlpha = 0.7; // Make ghost piece slightly transparent
      ctx.drawImage(
        img,
        mousePos.x - (SQUARE_SIZE - 20) / 2, // Center based on actual drawn piece size
        mousePos.y - (SQUARE_SIZE - 20) / 2,
        SQUARE_SIZE - 20,
        SQUARE_SIZE - 20
      );
      ctx.globalAlpha = 1.0; // Reset global alpha
    }
  }
}

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
      // Only call renderBoard if all images have finished loading.
      // The preloadImages function's onload/onerror handlers will call renderBoard
      // once image loading is complete if gameState is already set.
      if (imagesLoadedSuccessfully === totalImagesToLoad) {
        renderBoard();
      }
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
  totalImagesToLoad = Object.keys(piecesData).length;
  imagesLoadedSuccessfully = 0;

  if (totalImagesToLoad === 0) {
    // No images to load, check if gameState is ready
    if (gameState) {
      renderBoard();
    }
    return;
  }

  Object.keys(piecesData).forEach(pieceType => {
    const piece = piecesData[pieceType];
    const img = new Image();
    img.src = piece.image;

    img.onload = () => {
      imagesLoadedSuccessfully++;
      if (imagesLoadedSuccessfully === totalImagesToLoad && gameState) {
        renderBoard();
      }
    };

    img.onerror = () => {
      console.error(`Failed to load image: ${piece.image}`);
      imagesLoadedSuccessfully++; // Count as an attempted load
      if (imagesLoadedSuccessfully === totalImagesToLoad && gameState) {
        renderBoard();
      }
    };
    pieceImages[pieceType] = img;
  });
}

// Render the game board
function renderBoard() {
  // It's possible preloadImages completes before gameState is set,
  // so renderBoard might be called when gameState is null.
  // Also, the initial renderBoard() call at the end of the script might occur before gameState is ready.
  if (!gameState || !piecesData) {
    console.log("RenderBoard called but gameState or piecesData not ready yet.");
    return;
  }
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw board squares
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      // Alternate square colors
      ctx.fillStyle = (row + col) % 2 === 0 ? '#ececd7' : '#7c945d';
      ctx.fillRect(col * SQUARE_SIZE, row * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
    }
  }

  // Draw control tints
  if (gameState.squareControl) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const control = gameState.squareControl[row][col];
        if (control === 'white') {
          ctx.fillStyle = WHITE_CONTROL_COLOR;
          ctx.fillRect(col * SQUARE_SIZE, row * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
        } else if (control === 'black') {
          ctx.fillStyle = BLACK_CONTROL_COLOR;
          ctx.fillRect(col * SQUARE_SIZE, row * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
        }
      }
    }
  }
  
  // Highlight selected piece's square (drawn over tints)
  if (selectedPiece) {
    ctx.fillStyle = '#f6f669'; // Yellow highlight for selected piece
    ctx.fillRect(
      selectedPiece.position[1] * SQUARE_SIZE, 
      selectedPiece.position[0] * SQUARE_SIZE, 
      SQUARE_SIZE, 
      SQUARE_SIZE
    );
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

  // Display steam for the current player if it's their turn
  if (gameState && playerColor && gameState.turn === playerColor) {
    let steamCount = 0;
    if (playerColor === 'white' && gameState.whiteSteam !== undefined) {
      steamCount = gameState.whiteSteam;
    } else if (playerColor === 'black' && gameState.blackSteam !== undefined) {
      steamCount = gameState.blackSteam;
    }

    ctx.fillStyle = 'black'; // Color of the text
    ctx.font = '20px Arial'; // Font size and type
    ctx.textAlign = 'left'; // Align text to the left
    ctx.textBaseline = 'top'; // Align text to the top
    ctx.fillText(`Steam: ${steamCount}`, 10, 10); // Position (10, 10)
  }
}

// --- Event Listeners for Drag and Drop and Click ---

let justDragged = false; // Flag to help click handler ignore click after drag

canvas.addEventListener('mousedown', (event) => {
  if (!gameState || gameState.status !== 'active' || gameState.turn !== playerColor) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;
  const col = Math.floor(canvasX / SQUARE_SIZE);
  const row = Math.floor(canvasY / SQUARE_SIZE);

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return; 
  }

  const piece = gameState.board[row][col];

  if (piece && piece.player === playerColor) {
    isDragging = true;
    draggedPiece = piece; 
    draggedPieceOrigPos = { row: row, col: col };
    mousePos = { x: canvasX, y: canvasY }; 

    // DO NOT set selectedPiece here. Selection is determined on mouseup.
    console.log(`Mousedown: Initiating potential drag for ${draggedPiece.type} from (${row},${col})`);
    // renderBoard(); // No selection highlight on mousedown itself.
  }
  event.preventDefault(); 
});

canvas.addEventListener('mousemove', (event) => {
  if (isDragging) {
    if (!gameState || gameState.status !== 'active' || gameState.turn !== playerColor) {
      isDragging = false;
      draggedPiece = null; // Clear drag state if game becomes invalid
      draggedPieceOrigPos = null;
      renderBoard(); 
      return;
    }
    const rect = canvas.getBoundingClientRect();
    mousePos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    renderBoardWithGhostPiece();
  }
});

canvas.addEventListener('mouseup', (event) => {
  if (!isDragging) {
    return;
  }

  const dx = mousePos.x - draggedPieceOrigPos.x; // mousePos is relative to canvas, draggedPieceOrigPos was set using canvas coords too
  const dy = mousePos.y - draggedPieceOrigPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  isDragging = false; // End dragging state regardless of action

  if (distance < DRAG_THRESHOLD) {
    // --- CLICK ACTION ---
    console.log(`Mouseup: Detected CLICK action on ${draggedPiece.type} at (${draggedPieceOrigPos.row},${draggedPieceOrigPos.col})`);
    if (selectedPiece && selectedPiece.position[0] === draggedPieceOrigPos.row && selectedPiece.position[1] === draggedPieceOrigPos.col) {
      selectedPiece = null; // Deselect if clicking the already selected piece
      console.log("Deselected piece.");
    } else {
      selectedPiece = draggedPiece; // Select the clicked piece
      console.log(`Selected piece: ${selectedPiece.type}`);
    }
    justDragged = false; // This was a click, not a drag-move, so click handler should not be suppressed for moves.
  } else {
    // --- DRAG ACTION ---
    console.log(`Mouseup: Detected DRAG action for ${draggedPiece.type}`);
    let moveAttempted = false;
    if (gameState && gameState.status === 'active' && gameState.turn === playerColor) {
      const targetCol = Math.floor(mousePos.x / SQUARE_SIZE);
      const targetRow = Math.floor(mousePos.y / SQUARE_SIZE);

      if (targetRow >= 0 && targetRow < BOARD_SIZE && targetCol >= 0 && targetCol < BOARD_SIZE) {
        // Only send move if it's a different square (already guaranteed by distance check for drag)
        // but good to keep for clarity if threshold is very small.
        if (targetRow !== draggedPieceOrigPos.row || targetCol !== draggedPieceOrigPos.col) {
          console.log(`Attempting to move ${draggedPiece.type} from (${draggedPieceOrigPos.row}, ${draggedPieceOrigPos.col}) to (${targetRow}, ${targetCol})`);
          socket.send(JSON.stringify({
            type: 'move',
            from: [draggedPieceOrigPos.row, draggedPieceOrigPos.col],
            to: [targetRow, targetCol]
          }));
          moveAttempted = true;
        } else {
          // This case should ideally not be reached if distance >= DRAG_THRESHOLD
          console.log("Drag ended on the same square, but was considered a drag. No action.");
        }
      } else {
        console.log("Drag target square is outside the board. Move cancelled.");
      }
    } else {
      console.log("Drag action, but game inactive or not player's turn. Move cancelled.");
    }

    if (moveAttempted) {
      justDragged = true; // A drag-move was attempted, suppress click handler for moves.
      selectedPiece = null; // Clear selection after a drag-move attempt.
    } else {
      justDragged = false; // No move attempted (e.g. dragged off board), click handler not suppressed.
      // selectedPiece remains as it was before the drag started, or null if nothing was selected.
      // If a piece was selected, and drag failed (e.g. off-board), it remains selected.
    }
  }

  draggedPiece = null;
  draggedPieceOrigPos = null;
  renderBoard(); // Re-render to reflect selection changes or clean up ghost piece.
});

canvas.addEventListener('click', (event) => {
  if (justDragged) {
    justDragged = false; // Reset flag
    console.log("Click event ignored as it followed a drag-move action.");
    // selectedPiece is already null if a drag-move was made.
    // No need to call renderBoard() here, mouseup already did.
    return;
  }

  if (!gameState || gameState.status !== 'active' || gameState.turn !== playerColor) {
    // If game is not in a state to allow moves, a click should not do anything.
    // selectedPiece might be set from a previous turn or click, ensure it's cleared if game state invalid.
    // However, mouseup's "click action" part already handles selection based on game state.
    // This check is more for safety.
    // selectedPiece = null; // Potentially clear selection if game state changed unexpectedly.
    // renderBoard();
    return;
  }
  
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const col = Math.floor(x / SQUARE_SIZE);
  const row = Math.floor(y / SQUARE_SIZE);

  if (selectedPiece) {
    // A piece is currently selected. This click is either to move it or select another friendly piece.
    if (selectedPiece.position[0] === row && selectedPiece.position[1] === col) {
      // Clicked on the *already selected* piece.
      // mouseup's "click action" logic should have handled toggling selection.
      // So, if we reach here and the clicked piece is still selectedPiece,
      // it implies an unexpected sequence or that the user is clicking it again
      // after it was selected by mouseup.
      // For robustness, let's ensure it deselects.
      console.log(`Click Handler: Clicked on already selected piece ${selectedPiece.type}. Deselecting (as fallback).`);
      // selectedPiece = null; // mouseup should have handled this. If not, this is a safe reset.
      // No action needed here if mouseup is the primary selection handler for "clicks".
    } else {
      // Clicked on a *different* square.
      const targetPiece = gameState.board[row][col];
      if (targetPiece && targetPiece.player === playerColor) {
        // Clicked on another friendly piece: switch selection.
        console.log(`Click Handler: Switching selection from ${selectedPiece.type} to ${targetPiece.type}`);
        selectedPiece = targetPiece;
      } else {
        // Clicked on an empty square or an opponent's piece: attempt to move.
        console.log(`Click Handler: Attempting to move ${selectedPiece.type} from (${selectedPiece.position[0]},${selectedPiece.position[1]}) to (${row},${col})`);
        socket.send(JSON.stringify({
          type: 'move',
          from: selectedPiece.position,
          to: [row, col]
        }));
        selectedPiece = null; // Clear selection after attempting a move.
      }
    }
  } else {
    // No piece is currently selected.
    // A "first click" to select a piece is now handled by the "click action" part of mouseup.
    // So, if selectedPiece is null here, it means the user clicked an empty square,
    // an opponent's piece, or their own piece (which mouseup then selected).
    // If mouseup selected a piece, selectedPiece wouldn't be null here.
    // Thus, this path means a click on an empty/opponent square when nothing is selected. Do nothing.
    console.log("Click Handler: No piece selected, and click was not a primary selection action (handled by mouseup). No action.");
  }
  
  renderBoard(); // Re-render to reflect any changes from this handler.
});

// Initial render is problematic if assets or gameState aren't ready.
// renderBoard(); 
// We will now rely on the logic within preloadImages and gameState message handler to call renderBoard.