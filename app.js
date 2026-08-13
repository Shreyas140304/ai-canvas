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
