const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const camera = {
  x: 0,
  y: 0,
  zoom: 1,
};

function screenToWorld(screenX, screenY) {
  return {
    x: screenX / camera.zoom + camera.x,
    y: screenY / camera.zoom + camera.y,
  };
}

function worldToScreen(worldX, worldY) {
  return {
    x: (worldX - camera.x) * camera.zoom,
    y: (worldY - camera.y) * camera.zoom,
  };
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();

window.addEventListener("resize", resizeCanvas);

// -------------------------
// Stroke data
// -------------------------
let strokes = [];
let currentStroke = null;

let undoStack = [];
let redoStack = [];
let isErasing = false;

let isSelecting = false;
let selectedStroke = null;

let isMoving = false;
let lastMoveX = 0;
let lastMoveY = 0;
let moveStartPoints = null;

let isPanning = false;
let panPointerId = null;

let lastPanX = 0;
let lastPanY = 0;
// -------------------------
// Start drawing
// -------------------------

canvas.addEventListener("pointerdown", (event) => {
  if (isErasing) {
    eraseAt(event.clientX, event.clientY);

    canvas.setPointerCapture(event.pointerId);

    return;
  }

  if (isSelecting) {
    selectAt(event.clientX, event.clientY);

    if (selectedStroke) {
      isMoving = true;

      lastMoveX = event.clientX;
      lastMoveY = event.clientY;

      moveStartPoints = selectedStroke.points.map((point) => ({
        x: point.x,
        y: point.y,
      }));

      canvas.setPointerCapture(event.pointerId);
    }

    return;
  }

  if (isPanning) {
    panPointerId = event.pointerId;

    lastPanX = event.clientX;
    lastPanY = event.clientY;

    canvas.setPointerCapture(event.pointerId);

    return;
  }

  currentStroke = {
    points: [],
    color: "black",
    width: 3,
  };

  const point = screenToWorld(event.clientX, event.clientY);

  currentStroke.points.push(point);
});

// -------------------------
// Continue drawing
// -------------------------

canvas.addEventListener("pointermove", (event) => {
  if (isMoving && selectedStroke) {
    const dx = event.clientX - lastMoveX;
    const dy = event.clientY - lastMoveY;

    const worldDX = dx / camera.zoom;
    const worldDY = dy / camera.zoom;

    for (const point of selectedStroke.points) {
      point.x += worldDX;
      point.y += worldDY;
    }

    lastMoveX = event.clientX;
    lastMoveY = event.clientY;

    render();

    return;
  }

  if (isErasing) {
    eraseAt(event.clientX, event.clientY);
    return;
  }

  if (panPointerId === event.pointerId) {
    const dx = event.clientX - lastPanX;
    const dy = event.clientY - lastPanY;

    camera.x -= dx / camera.zoom;
    camera.y -= dy / camera.zoom;

    lastPanX = event.clientX;
    lastPanY = event.clientY;

    render();

    return;
  }

  if (!currentStroke) return;

  const point = screenToWorld(event.clientX, event.clientY);

  currentStroke.points.push(point);

  render();
});

// -------------------------
// Finish stroke
// -------------------------

canvas.addEventListener("pointerup", (event) => {
  if (isMoving) {
    isMoving = false;

    if (selectedStroke && moveStartPoints) {
      const endPoints = selectedStroke.points.map((point) => ({
        x: point.x,
        y: point.y,
      }));

      undoStack.push({
        type: "move",
        stroke: selectedStroke,
        before: moveStartPoints,
        after: endPoints,
      });

      redoStack = [];
    }

    moveStartPoints = null;

    canvas.releasePointerCapture(event.pointerId);

    render();

    return;
  }

  if (panPointerId === event.pointerId) {
    panPointerId = null;

    canvas.releasePointerCapture(event.pointerId);

    return;
  }

  if (!currentStroke) return;

  strokes.push(currentStroke);

  undoStack.push({
    type: "draw",
    stroke: currentStroke,
  });

  redoStack = [];
  currentStroke = null;

  render();
});

function undo() {
  if (undoStack.length === 0) {
    return;
  }

  const action = undoStack.pop();

  if (action.type === "draw") {
    const index = strokes.indexOf(action.stroke);

    if (index !== -1) {
      strokes.splice(index, 1);
    }
  } else if (action.type === "erase") {
    strokes.splice(action.index, 0, action.stroke);
  } else if (action.type === "move") {
    action.stroke.points = action.before.map((point) => ({
      x: point.x,
      y: point.y,
    }));
  }

  redoStack.push(action);

  render();
}

function redo() {
  if (redoStack.length === 0) {
    return;
  }

  const action = redoStack.pop();

  if (action.type === "draw") {
    strokes.push(action.stroke);
  } else if (action.type === "erase") {
    const index = strokes.indexOf(action.stroke);

    if (index !== -1) {
      strokes.splice(index, 1);
    }
  } else if (action.type === "move") {
    action.stroke.points = action.after.map((point) => ({
      x: point.x,
      y: point.y,
    }));
  }
  undoStack.push(action);

  render();
}

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();

  // Mouse position on screen
  const mouseX = event.clientX;
  const mouseY = event.clientY;

  // Find where the mouse is in the world
  const beforeZoom = screenToWorld(mouseX, mouseY);

  // Zoom in or out
  if (event.deltaY < 0) {
    camera.zoom *= 1.1;
  } else {
    camera.zoom /= 1.1;
  }

  // Prevent extreme zoom
  camera.zoom = Math.max(0.2, Math.min(camera.zoom, 5));

  // Find the camera position needed to keep
  // the same world point under the mouse
  camera.x = beforeZoom.x - mouseX / camera.zoom;
  camera.y = beforeZoom.y - mouseY / camera.zoom;

  render();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    isPanning = true;
    canvas.style.cursor = "grab";
  }

  if (event.ctrlKey && event.key === "z") {
    event.preventDefault();
    undo();
  }

  if (event.ctrlKey && event.key === "y") {
    event.preventDefault();
    redo();
  }

  if (event.key === "e" || event.key === "E") {
    isErasing = !isErasing;

    canvas.style.cursor = isErasing ? "not-allowed" : "crosshair";
  }

  if (event.key === "v") {
    isSelecting = !isSelecting;

    isErasing = false;

    selectedStroke = null;

    canvas.style.cursor = isSelecting ? "default" : "crosshair";

    render();
  }

  if (event.key === "Delete" && selectedStroke) {
    const index = strokes.indexOf(selectedStroke);

    if (index !== -1) {
      const removedStroke = strokes.splice(index, 1)[0];

      undoStack.push({
        type: "erase",
        stroke: removedStroke,
        index: index,
      });

      redoStack = [];

      selectedStroke = null;

      render();
    }
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    isPanning = false;
    canvas.style.cursor = "crosshair";
  }
});

window.addEventListener("blur", () => {
  isPanning = false;
  panPointerId = null;
  canvas.style.cursor = "crosshair";
});
// -------------------------
// Render everything
// -------------------------
function eraseAt(screenX, screenY) {
  const worldPoint = screenToWorld(screenX, screenY);

  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];

    for (const point of stroke.points) {
      const dx = point.x - worldPoint.x;
      const dy = point.y - worldPoint.y;

      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 15) {
        const removedStroke = strokes.splice(i, 1)[0];

        // Remember what was removed
        undoStack.push({
          type: "erase",
          stroke: removedStroke,
          index: i,
        });

        // New action destroys redo history
        redoStack = [];

        render();

        return;
      }
    }
  }
}

function selectAt(screenX, screenY) {
  const worldPoint = screenToWorld(screenX, screenY);

  selectedStroke = null;

  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];

    for (const point of stroke.points) {
      const dx = point.x - worldPoint.x;
      const dy = point.y - worldPoint.y;

      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 15) {
        selectedStroke = stroke;
        render();
        return;
      }
    }
  }

  render();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const stroke of strokes) {
    ctx.beginPath();

    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const points = stroke.points;

    if (points.length === 0) continue;

    const start = worldToScreen(points[0].x, points[0].y);

    ctx.moveTo(start.x, start.y);

    for (let i = 1; i < points.length; i++) {
      const point = worldToScreen(points[i].x, points[i].y);

      ctx.lineTo(point.x, point.y);
    }

    ctx.stroke();
  }

  // Draw current stroke while drawing

  if (currentStroke) {
    drawStroke(currentStroke);
  }

  if (selectedStroke) {
    drawSelectionBox(selectedStroke);
  }
}

function drawSelectionBox(stroke) {
  if (!stroke || stroke.points.length === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of stroke.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const topLeft = worldToScreen(minX, minY);
  const bottomRight = worldToScreen(maxX, maxY);

  ctx.save();

  ctx.strokeStyle = "blue";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);

  ctx.strokeRect(
    topLeft.x - 8,
    topLeft.y - 8,
    bottomRight.x - topLeft.x + 16,
    bottomRight.y - topLeft.y + 16,
  );

  ctx.restore();
}

function drawStroke(stroke) {
  const points = stroke.points;

  if (points.length === 0) return;

  ctx.beginPath();

  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const start = worldToScreen(points[0].x, points[0].y);

  ctx.moveTo(start.x, start.y);

  for (let i = 1; i < points.length; i++) {
    const point = worldToScreen(points[i].x, points[i].y);

    ctx.lineTo(point.x, point.y);
  }

  ctx.stroke();
}
