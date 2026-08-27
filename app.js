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

let aiObjects = [];
let draggingAI = null;
let aiDragOffsetX = 0;
let aiDragOffsetY = 0;
let resizingAI = null;
let aiResizeStartWidth = 0;
let aiResizeStartHeight = 0;
let aiResizeStartX = 0;
let aiResizeStartY = 0;
let selectedAI = null;
let aiMoveStartX = 0;
let aiMoveStartY = 0;

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

let isResizing = false;
let resizeStartPoints = null;
let resizeStartBox = null;
// -------------------------
// Start drawing
// -------------------------
function isOnAIResizeHandle(object, worldX, worldY) {
  if (!object) return false;

  const handleSize = 15;

  const handleX = object.x + object.width;
  const handleY = object.y + object.height;

  return (
    worldX >= handleX - handleSize &&
    worldX <= handleX + handleSize &&
    worldY >= handleY - handleSize &&
    worldY <= handleY + handleSize
  );
}

function isOnResizeHandle(screenX, screenY) {
  if (!selectedStroke) return false;

  const bounds = getStrokeBounds(selectedStroke);

  const bottomRight = worldToScreen(bounds.maxX, bounds.maxY);

  return (
    screenX >= bottomRight.x &&
    screenX <= bottomRight.x + 15 &&
    screenY >= bottomRight.y &&
    screenY <= bottomRight.y + 15
  );
}

canvas.addEventListener("pointerdown", (event) => {
  const worldPoint = screenToWorld(event.clientX, event.clientY);
  if (!isSelecting && !isErasing && !isPanning) {
    selectedStroke = null;
    selectedAI = null;
  }
  // -------------------------
  // PAN
  // -------------------------
  if (isPanning) {
    panPointerId = event.pointerId;

    lastPanX = event.clientX;
    lastPanY = event.clientY;

    canvas.setPointerCapture(event.pointerId);

    return;
  }

  // -------------------------
  // ERASER
  // -------------------------
  if (isErasing) {
    eraseAt(event.clientX, event.clientY);

    canvas.setPointerCapture(event.pointerId);

    return;
  }

  // -------------------------
  // SELECTOR
  // -------------------------
  if (isSelecting) {
    // AI resize handle
    for (let i = aiObjects.length - 1; i >= 0; i--) {
      const object = aiObjects[i];

      if (isOnAIResizeHandle(object, worldPoint.x, worldPoint.y)) {
        resizingAI = object;

        aiResizeStartWidth = object.width;
        aiResizeStartHeight = object.height;

        aiResizeStartX = worldPoint.x;
        aiResizeStartY = worldPoint.y;

        canvas.setPointerCapture(event.pointerId);

        return;
      }
    }

    // AI object
    const clickedAI = getAIObjectAt(worldPoint.x, worldPoint.y);

    if (clickedAI) {
      selectedAI = clickedAI;
      selectedStroke = null;

      isMoving = false;
      isResizing = false;

      draggingAI = clickedAI;

      aiMoveStartX = clickedAI.x;
      aiMoveStartY = clickedAI.y;

      aiDragOffsetX = worldPoint.x - clickedAI.x;
      aiDragOffsetY = worldPoint.y - clickedAI.y;

      canvas.setPointerCapture(event.pointerId);

      return;
    }

    // -------------------------
    // NORMAL STROKE SELECTION
    // -------------------------

    if (selectedStroke && isOnResizeHandle(event.clientX, event.clientY)) {
      isResizing = true;
      selectedAI = null;

      resizeStartPoints = selectedStroke.points.map((point) => ({
        x: point.x,
        y: point.y,
      }));

      resizeStartBox = getStrokeBounds(selectedStroke);

      canvas.setPointerCapture(event.pointerId);

      return;
    }

    // Try to select a stroke
    selectAt(event.clientX, event.clientY);

    console.log("SELECT RESULT:", !!selectedStroke);

    if (selectedStroke !== null) {
      console.log("STARTING STROKE MOVE");

      selectedAI = null;
      draggingAI = null;
      resizingAI = null;

      isMoving = true;

      lastMoveX = event.clientX;
      lastMoveY = event.clientY;

      moveStartPoints = selectedStroke.points.map((point) => ({
        x: point.x,
        y: point.y,
      }));

      canvas.setPointerCapture(event.pointerId);

      console.log("isMoving is now:", isMoving);

      return;
    }

    return;
  }

  // -------------------------
  // DRAW
  // -------------------------
  console.log("STARTING DRAW");
  currentStroke = {
    points: [],
    color: "black",
    width: 3,
  };

  currentStroke.points.push(worldPoint);
});

// -------------------------
// Continue drawing
// -------------------------

canvas.addEventListener("pointermove", (event) => {
  console.log("MOVE:", {
    isMoving,
    hasStroke: !!selectedStroke,
    draggingAI: !!draggingAI,
    resizingAI: !!resizingAI,
  });
  if (resizingAI) {
    const worldPoint = screenToWorld(event.clientX, event.clientY);

    const dx = worldPoint.x - aiResizeStartX;
    const dy = worldPoint.y - aiResizeStartY;

    resizingAI.width = Math.max(100, aiResizeStartWidth + dx);

    resizingAI.height = Math.max(80, aiResizeStartHeight + dy);

    render();

    return;
  }

  if (draggingAI) {
    const worldPoint = screenToWorld(event.clientX, event.clientY);

    draggingAI.x = worldPoint.x - aiDragOffsetX;
    draggingAI.y = worldPoint.y - aiDragOffsetY;

    render();

    return;
  }

  if (isResizing && selectedStroke) {
    const current = screenToWorld(event.clientX, event.clientY);

    const startWidth = resizeStartBox.maxX - resizeStartBox.minX;

    const startHeight = resizeStartBox.maxY - resizeStartBox.minY;

    if (startWidth === 0 || startHeight === 0) {
      return;
    }

    const newWidth = current.x - resizeStartBox.minX;

    const newHeight = current.y - resizeStartBox.minY;

    const scaleX = Math.max(0.1, newWidth / startWidth);

    const scaleY = Math.max(0.1, newHeight / startHeight);

    for (let i = 0; i < selectedStroke.points.length; i++) {
      const original = resizeStartPoints[i];

      selectedStroke.points[i].x =
        resizeStartBox.minX + (original.x - resizeStartBox.minX) * scaleX;

      selectedStroke.points[i].y =
        resizeStartBox.minY + (original.y - resizeStartBox.minY) * scaleY;
    }

    render();

    return;
  }

  if (isMoving && selectedStroke) {
    console.log("MOVING STROKE!");
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
  if (resizingAI) {
    resizingAI = null;

    canvas.releasePointerCapture(event.pointerId);

    render();

    return;
  }

  if (draggingAI) {
    const movedAI = draggingAI;

    const action = {
      type: "moveAI",
      object: movedAI,

      before: {
        x: aiMoveStartX,
        y: aiMoveStartY,
      },

      after: {
        x: movedAI.x,
        y: movedAI.y,
      },
    };

    // Only create an undo action if it actually moved
    if (
      action.before.x !== action.after.x ||
      action.before.y !== action.after.y
    ) {
      undoStack.push(action);
      redoStack = [];
    }

    draggingAI = null;

    canvas.releasePointerCapture(event.pointerId);

    render();

    return;
  }

  if (isResizing) {
    isResizing = false;

    if (selectedStroke && resizeStartPoints) {
      const endPoints = selectedStroke.points.map((point) => ({
        x: point.x,
        y: point.y,
      }));

      undoStack.push({
        type: "resize",
        stroke: selectedStroke,
        before: resizeStartPoints,
        after: endPoints,
      });

      redoStack = [];
    }

    resizeStartPoints = null;
    resizeStartBox = null;

    canvas.releasePointerCapture(event.pointerId);

    render();

    return;
  }

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
  } else if (action.type === "moveAI") {
    action.object.x = action.before.x;
    action.object.y = action.before.y;
  } else if (action.type === "resize") {
    action.stroke.points = action.before.map((point) => ({
      x: point.x,
      y: point.y,
    }));
  } else if (action.type === "load") {
    strokes = JSON.parse(JSON.stringify(action.before));
  } else if (action.type === "deleteAI") {
    aiObjects.splice(action.index, 0, action.object);
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
  } else if (action.type === "moveAI") {
    action.object.x = action.after.x;
    action.object.y = action.after.y;
  } else if (action.type === "resize") {
    action.stroke.points = action.after.map((point) => ({
      x: point.x,
      y: point.y,
    }));
  } else if (action.type === "load") {
    strokes = JSON.parse(JSON.stringify(action.after));
  } else if (action.type === "deleteAI") {
    aiObjects.splice(action.index, 1);
  }

  undoStack.push(action);

  render();
}

function saveCanvas() {
  const canvasData = {
    version: 1,
    strokes: strokes,
  };

  const json = JSON.stringify(canvasData, null, 2);

  const blob = new Blob([json], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = "my-canvas.json";

  link.click();

  URL.revokeObjectURL(url);
}

function loadCanvas(file) {
  const reader = new FileReader();

  reader.onload = function (event) {
    try {
      const data = JSON.parse(event.target.result);

      if (!data.strokes || !Array.isArray(data.strokes)) {
        alert("Invalid canvas file");
        return;
      }

      // Save current state before loading
      const previousStrokes = JSON.parse(JSON.stringify(strokes));

      // Load new state
      const loadedStrokes = JSON.parse(JSON.stringify(data.strokes));

      strokes = loadedStrokes;

      // Record LOAD as an undoable action
      undoStack.push({
        type: "load",
        before: previousStrokes,
        after: loadedStrokes,
      });

      redoStack = [];
      selectedStroke = null;

      render();
    } catch (error) {
      alert("Could not load canvas file");
    }
  };

  reader.readAsText(file);
}

function exportPNG() {
  const link = document.createElement("a");

  link.download = "my-canvas.png";
  link.href = canvas.toDataURL("image/png");

  link.click();
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

  if (event.key === "v" || event.key === "V") {
    isSelecting = !isSelecting;

    isErasing = false;

    selectedStroke = null;
    selectedAI = null;

    canvas.style.cursor = isSelecting ? "default" : "crosshair";

    console.log("SELECTOR MODE:", isSelecting);

    render();
  }

  if (event.key === "Delete" && selectedAI) {
    const index = aiObjects.indexOf(selectedAI);

    if (index !== -1) {
      const removedAI = aiObjects.splice(index, 1)[0];

      undoStack.push({
        type: "deleteAI",
        object: removedAI,
        index: index,
      });

      redoStack = [];

      selectedAI = null;

      render();
    }

    return;
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
      const screenPoint = worldToScreen(point.x, point.y);

      const dx = screenPoint.x - screenX;
      const dy = screenPoint.y - screenY;

      const distance = Math.sqrt(dx * dx + dy * dy);

      // 20 pixels selection tolerance
      if (distance < 20) {
        selectedStroke = stroke;

        console.log("SELECTED STROKE:", selectedStroke);

        render();
        return;
      }
    }
  }

  console.log("NO STROKE SELECTED");

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

  drawAIObjects();
  if (selectedStroke) {
    drawSelectionBox(selectedStroke);
  }
}

function getStrokeBounds(stroke) {
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

  return {
    minX,
    minY,
    maxX,
    maxY,
  };
}

async function previewAIContext() {
  const region = getSelectedRegion();

  if (!region) {
    alert("Select a stroke first.");
    return;
  }

  const contextStrokes = getContextStrokes();

  const width = Math.ceil(region.maxX - region.minX);
  const height = Math.ceil(region.maxY - region.minY);

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;

  const tempCtx = tempCanvas.getContext("2d");

  // White background
  tempCtx.fillStyle = "white";
  tempCtx.fillRect(0, 0, width, height);

  // Draw context strokes
  for (const stroke of contextStrokes) {
    const points = stroke.points;

    if (points.length === 0) {
      continue;
    }

    tempCtx.beginPath();

    tempCtx.strokeStyle = stroke.color;
    tempCtx.lineWidth = stroke.width;
    tempCtx.lineCap = "round";
    tempCtx.lineJoin = "round";

    tempCtx.moveTo(points[0].x - region.minX, points[0].y - region.minY);

    for (let i = 1; i < points.length; i++) {
      tempCtx.lineTo(points[i].x - region.minX, points[i].y - region.minY);
    }

    tempCtx.stroke();
  }

  // Convert canvas to PNG data
  const imageData = tempCanvas.toDataURL("image/png");

  console.log("PNG created");
  console.log("Sending image to backend...");

  try {
    const response = await fetch("/api/ai", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        image: imageData,
      }),
    });

    const data = await response.json();

    console.log("BACKEND RESPONSE:", data);

    if (data.success && data.response) {
      const aiObject = data.response;

      aiObjects.push(aiObject);

      console.log("AI OBJECT ADDED:", aiObject);

      render();
    }
  } catch (error) {
    console.error("AI request failed:", error);
  }
}
document
  .getElementById("contextBtn")
  .addEventListener("click", previewAIContext);

function getContextStrokes() {
  if (!selectedStroke) {
    return [];
  }

  const selectedBounds = getStrokeBounds(selectedStroke);

  const margin = 150;

  const region = {
    minX: selectedBounds.minX - margin,
    minY: selectedBounds.minY - margin,
    maxX: selectedBounds.maxX + margin,
    maxY: selectedBounds.maxY + margin,
  };

  return strokes.filter((stroke) => {
    const bounds = getStrokeBounds(stroke);

    return (
      bounds.maxX >= region.minX &&
      bounds.minX <= region.maxX &&
      bounds.maxY >= region.minY &&
      bounds.minY <= region.maxY
    );
  });
}

function getSelectedRegion() {
  const contextStrokes = getContextStrokes();

  if (contextStrokes.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of contextStrokes) {
    const bounds = getStrokeBounds(stroke);

    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);

    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  const margin = 50;

  return {
    minX: minX - margin,
    minY: minY - margin,
    maxX: maxX + margin,
    maxY: maxY + margin,
  };
}

function drawSelectionBox(stroke) {
  if (!stroke || stroke.points.length === 0) return;

  const bounds = getStrokeBounds(stroke);

  const topLeft = worldToScreen(bounds.minX, bounds.minY);

  const bottomRight = worldToScreen(bounds.maxX, bounds.maxY);

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

  // Resize handle
  ctx.setLineDash([]);

  ctx.fillStyle = "blue";

  ctx.fillRect(bottomRight.x + 2, bottomRight.y + 2, 10, 10);

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

document.getElementById("saveBtn").addEventListener("click", saveCanvas);

// for loading the canvas
const loadBtn = document.getElementById("loadBtn");
const loadInput = document.getElementById("loadInput");

loadBtn.addEventListener("click", () => {
  loadInput.click();
});

loadInput.addEventListener("change", (event) => {
  const file = event.target.files[0];

  if (!file) return;

  loadCanvas(file);

  // Allow loading the same file again later
  loadInput.value = "";
});

document.getElementById("exportBtn").addEventListener("click", exportPNG);

function createFakeAIResponse() {
  const region = getSelectedRegion();

  if (!region) {
    alert("Select a stroke first.");
    return;
  }

  const aiObject = {
    type: "text",

    x: region.maxX + 80,
    y: region.minY,

    width: 300,
    height: 150,

    content: "The derivative of x² is 2x.",
  };

  aiObjects.push(aiObject);

  render();

  console.log("AI object created:", aiObject);
}

function drawAIObjects() {
  for (const object of aiObjects) {
    const position = worldToScreen(object.x, object.y);

    const width = object.width * camera.zoom;
    const height = object.height * camera.zoom;

    // Box
    ctx.fillStyle = "white";
    ctx.fillRect(position.x, position.y, width, height);

    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;

    ctx.strokeRect(position.x, position.y, width, height);

    // Title
    ctx.fillStyle = "black";

    ctx.font = `${16 * camera.zoom}px Arial`;

    ctx.fillText(
      "AI Response",
      position.x + 15 * camera.zoom,
      position.y + 25 * camera.zoom,
    );

    // Response
    ctx.font = `${14 * camera.zoom}px Arial`;

    ctx.fillText(
      object.content,
      position.x + 15 * camera.zoom,
      position.y + 55 * camera.zoom,
    );

    // Resize handle
    ctx.fillStyle = "blue";

    ctx.fillRect(position.x + width - 8, position.y + height - 8, 10, 10);
  }
}

function getAIObjectAt(worldX, worldY) {
  for (let i = aiObjects.length - 1; i >= 0; i--) {
    const object = aiObjects[i];

    if (
      worldX >= object.x &&
      worldX <= object.x + object.width &&
      worldY >= object.y &&
      worldY <= object.y + object.height
    ) {
      return object;
    }
  }

  return null;
}

document.getElementById("aiTestBtn").addEventListener("click", () => {
  createFakeAIResponse();
});
