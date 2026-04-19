"use client";

import { useEffect, useRef, useState } from "react";
import {
  Pen,
  Eraser,
  Trash2,
  Shapes,
  Circle,
  Square,
  MousePointer2,
  Type,
  ArrowRight,
} from "lucide-react";

type ShapeTool = "circle" | "square" | "arrow";
type StrokeTool = "pen" | "eraser";
type Point = { x: number; y: number };
type Stroke = {
  kind: "stroke";
  points: Point[];
  tool: StrokeTool;
  width: number;
  color?: string;
};
type Shape = {
  kind: "shape";
  tool: ShapeTool;
  start: Point;
  end: Point;
};
type TextElement = {
  kind: "text";
  point: Point;
  value: string;
  color: string;
  fontSize: number;
  width: number;
  height: number;
};
type CanvasElement = Stroke | Shape | TextElement;
type ActiveText = {
  point: Point;
  screenPoint: Point;
  value: string;
  width: number;
  height: number;
  fontSize: number;
  editingIndex?: number;
};
type SelectionBox = {
  start: Point;
  end: Point;
};
type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type SelectionMenu = {
  x: number;
  y: number;
};

export default function Page() {
  const topBarHeight = 48;
  const penColors = [
    { name: "black", value: "#000000" },
    { name: "white", value: "#ffffff" },
    { name: "grey", value: "#9ca3af" },
    { name: "purple", value: "#c084fc" },
    { name: "purple", value: "#a855f7" },
    { name: "blue", value: "#4f7cff" },
    { name: "blue", value: "#38bdf8" },
    { name: "yellow", value: "#facc15" },
    { name: "orange", value: "#f97316" },
    { name: "green", value: "#10b981" },
    { name: "green", value: "#4ade80" },
    { name: "red", value: "#fb7185" },
    { name: "red", value: "#ef4444" },
  ];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<
    "cursor" | "text" | StrokeTool | ShapeTool
  >("pen");
  const [showShapesMenu, setShowShapesMenu] = useState(false);
  const [showPenMenu, setShowPenMenu] = useState(false);
  const [showEraserMenu, setShowEraserMenu] = useState(false);
  const lastPos = useRef<Point | null>(null);
  const lastMid = useRef<Point | null>(null);
  const [shapeStart, setShapeStart] = useState<Point | null>(null);
  const [snapshot, setSnapshot] = useState<ImageData | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [penWidth, setPenWidth] = useState(4);
  const [penColor, setPenColor] = useState("#000000");
  const [eraserWidth, setEraserWidth] = useState(24);
  const [activeText, setActiveText] = useState<ActiveText | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenu | null>(null);
  const shapeEnd = useRef<Point | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panStart = useRef<{ screen: Point; offset: Point } | null>(null);
  const isPanningRef = useRef(false);
  const didPanRef = useRef(false);
  const selectionStart = useRef<Point | null>(null);
  const isSelectingRef = useRef(false);
  const isDraggingTextRef = useRef(false);
  const textDragStart = useRef<{ screen: Point; textScreen: Point } | null>(
    null
  );
  const copiedElements = useRef<CanvasElement[]>([]);

  const [elements, setElements] = useState<CanvasElement[]>([]);

  const currentStroke = useRef<Stroke | null>(null);
  const activeTextScreenX = activeText?.screenPoint.x;
  const activeTextScreenY = activeText?.screenPoint.y;

  const getTextFontSize = (width: number, height: number) =>
    Math.max(12, Math.min(96, Math.round(Math.min(width / 5, height * 0.55))));

  const getTextBounds = (text: TextElement): Bounds => ({
    x: text.point.x,
    y: text.point.y,
    width: text.width,
    height: text.height,
  });

  const drawShape = (
    ctx: CanvasRenderingContext2D,
    shape: ShapeTool,
    startX: number,
    startY: number,
    currentX: number,
    currentY: number
  ) => {
    const width = currentX - startX;
    const height = currentY - startY;

    ctx.beginPath();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;

    if (shape === "square") {
      ctx.strokeRect(startX, startY, width, height);
      return;
    }

    if (shape === "circle") {
      const radius = Math.sqrt(width * width + height * height);
      ctx.arc(startX, startY, radius, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    if (shape === "arrow") {
      const angle = Math.atan2(height, width);
      const headLength = 18;

      ctx.moveTo(startX, startY);
      ctx.lineTo(currentX, currentY);
      ctx.lineTo(
        currentX - headLength * Math.cos(angle - Math.PI / 6),
        currentY - headLength * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(currentX, currentY);
      ctx.lineTo(
        currentX - headLength * Math.cos(angle + Math.PI / 6),
        currentY - headLength * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
      return;
    }
  };

  const getSelectionBounds = (selection: SelectionBox): Bounds => ({
    x: Math.min(selection.start.x, selection.end.x),
    y: Math.min(selection.start.y, selection.end.y),
    width: Math.abs(selection.end.x - selection.start.x),
    height: Math.abs(selection.end.y - selection.start.y),
  });

  const getStrokeBounds = (stroke: Stroke): Bounds | null => {
    if (!stroke.points.length) return null;

    let minX = stroke.points[0].x;
    let minY = stroke.points[0].y;
    let maxX = stroke.points[0].x;
    let maxY = stroke.points[0].y;
    const padding = stroke.width / 2 + 4 / zoomRef.current;

    for (const point of stroke.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    };
  };

  const boundsIntersect = (a: Bounds, b: Bounds) =>
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y;

  const pointInBounds = (point: Point, bounds: Bounds) =>
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height;

  const getSelectedPenElementIndexes = (selection: SelectionBox) => {
    const selectedIndexes = new Set<number>();
    const selectionBounds = getSelectionBounds(selection);

    elements.forEach((element, index) => {
      if (element.kind !== "stroke" || element.tool !== "pen") return;

      const strokeBounds = getStrokeBounds(element);
      if (strokeBounds && boundsIntersect(selectionBounds, strokeBounds)) {
        selectedIndexes.add(index);
      }
    });

    return selectedIndexes;
  };

  const drawSelectedStrokeHighlights = (
    ctx: CanvasRenderingContext2D,
    selection: SelectionBox
  ) => {
    const selectedIndexes = getSelectedPenElementIndexes(selection);

    ctx.save();
    ctx.lineWidth = 1.5 / zoomRef.current;
    ctx.strokeStyle = "#2563eb";
    ctx.fillStyle = "rgba(37,99,235,0.05)";

    for (const index of selectedIndexes) {
      const element = elements[index];
      if (element.kind !== "stroke") continue;

      const strokeBounds = getStrokeBounds(element);
      if (!strokeBounds) continue;

      ctx.fillRect(
        strokeBounds.x,
        strokeBounds.y,
        strokeBounds.width,
        strokeBounds.height
      );
      ctx.strokeRect(
        strokeBounds.x,
        strokeBounds.y,
        strokeBounds.width,
        strokeBounds.height
      );
    }

    ctx.restore();
  };

  const drawSelectionBox = (
    ctx: CanvasRenderingContext2D,
    selection: SelectionBox
  ) => {
    const { x, y, width, height } = getSelectionBounds(selection);
    const handleSize = 8 / zoomRef.current;
    const halfHandle = handleSize / 2;
    const handles = [
      { x, y },
      { x: x + width / 2, y },
      { x: x + width, y },
      { x, y: y + height / 2 },
      { x: x + width, y: y + height / 2 },
      { x, y: y + height },
      { x: x + width / 2, y: y + height },
      { x: x + width, y: y + height },
    ];

    ctx.save();
    ctx.lineWidth = 2 / zoomRef.current;
    ctx.strokeStyle = "#2563eb";
    ctx.fillStyle = "rgba(37,99,235,0.08)";
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = "#2563eb";
    for (const handle of handles) {
      ctx.fillRect(
        handle.x - halfHandle,
        handle.y - halfHandle,
        handleSize,
        handleSize
      );
    }

    ctx.restore();
  };

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight - topBarHeight;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    for (const element of elements) {
      if (element.kind === "shape") {
        drawShape(
          ctx,
          element.tool,
          element.start.x,
          element.start.y,
          element.end.x,
          element.end.y
        );
        continue;
      }

      if (element.kind === "text") {
        ctx.fillStyle = element.color;
        ctx.font = `${element.fontSize}px Arial, sans-serif`;
        ctx.textBaseline = "top";

        element.value.split("\n").forEach((line, index) => {
          ctx.fillText(line, element.point.x, element.point.y + index * element.fontSize * 1.25);
        });
        continue;
      }

      if (!element.points.length) continue;

      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = element.tool === "pen" ? element.color ?? "black" : "#ffffff";
      ctx.lineWidth = element.width;

      if (element.points.length === 1) {
        const p = element.points[0];
        ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = element.tool === "pen" ? element.color ?? "black" : "#ffffff";
        ctx.fill();
        continue;
      }

      ctx.moveTo(element.points[0].x, element.points[0].y);

      for (let i = 1; i < element.points.length; i++) {
        const prev = element.points[i - 1];
        const curr = element.points[i];
        const midX = (prev.x + curr.x) / 2;
        const midY = (prev.y + curr.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      }

      const lastPoint = element.points[element.points.length - 1];
      ctx.lineTo(lastPoint.x, lastPoint.y);
      ctx.stroke();
    }

    if (currentStroke.current && currentStroke.current.points.length > 0) {
      const stroke = currentStroke.current;

      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = stroke.tool === "pen" ? stroke.color ?? "black" : "#ffffff";
      ctx.lineWidth = stroke.width;

      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = stroke.tool === "pen" ? stroke.color ?? "black" : "#ffffff";
        ctx.fill();
      } else {
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

        for (let i = 1; i < stroke.points.length; i++) {
          const prev = stroke.points[i - 1];
          const curr = stroke.points[i];
          const midX = (prev.x + curr.x) / 2;
          const midY = (prev.y + curr.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        }

        const lastPoint = stroke.points[stroke.points.length - 1];
        ctx.lineTo(lastPoint.x, lastPoint.y);
        ctx.stroke();
      }
    }

    if (selectionBox) {
      drawSelectedStrokeHighlights(ctx, selectionBox);
      drawSelectionBox(ctx, selectionBox);
    }

    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = window.innerWidth;
      const cssHeight = window.innerHeight - topBarHeight;

      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      redrawCanvas();
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  useEffect(() => {
    redrawCanvas();
  }, [offset, zoom, elements, selectionBox]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    setActiveText((prev) =>
      prev
        ? {
            ...prev,
            screenPoint: {
              x: prev.point.x * zoom + offset.x,
              y: prev.point.y * zoom + offset.y + topBarHeight,
            },
          }
        : prev
    );
  }, [offset, zoom]);

  useEffect(() => {
    if (activeTextScreenX === undefined || activeTextScreenY === undefined) return;

    const focusTimer = window.setTimeout(() => {
      textInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [activeTextScreenX, activeTextScreenY]);

  useEffect(() => {
    if (!activeText || !textInputRef.current) return;

    const textInput = textInputRef.current;
    const resizeObserver = new ResizeObserver(([entry]) => {
      const borderBox = entry.borderBoxSize?.[0];
      const rect = textInput.getBoundingClientRect();
      const nextWidth = Math.round(borderBox?.inlineSize ?? rect.width);
      const nextHeight = Math.round(borderBox?.blockSize ?? rect.height);
      const nextFontSize = getTextFontSize(nextWidth, nextHeight);

      setActiveText((prev) => {
        if (
          !prev ||
          (prev.width === nextWidth &&
            prev.height === nextHeight &&
            prev.fontSize === nextFontSize)
        ) {
          return prev;
        }

        return {
          ...prev,
          width: nextWidth,
          height: nextHeight,
          fontSize: nextFontSize,
        };
      });
    });

    resizeObserver.observe(textInput);

    return () => resizeObserver.disconnect();
  }, [activeText]);

  useEffect(() => {
    const moveText = (e: MouseEvent) => {
      if (!isDraggingTextRef.current || !textDragStart.current) return;

      const nextScreenPoint = {
        x:
          textDragStart.current.textScreen.x +
          e.clientX -
          textDragStart.current.screen.x,
        y:
          textDragStart.current.textScreen.y +
          e.clientY -
          textDragStart.current.screen.y,
      };

      setActiveText((prev) =>
        prev
          ? {
              ...prev,
              screenPoint: nextScreenPoint,
              point: {
                x: (nextScreenPoint.x - offsetRef.current.x) / zoomRef.current,
                y:
                  (nextScreenPoint.y -
                    topBarHeight -
                    offsetRef.current.y) /
                  zoomRef.current,
              },
            }
          : prev
      );
    };

    const stopMovingText = () => {
      isDraggingTextRef.current = false;
      textDragStart.current = null;
    };

    window.addEventListener("mousemove", moveText);
    window.addEventListener("mouseup", stopMovingText);

    return () => {
      window.removeEventListener("mousemove", moveText);
      window.removeEventListener("mouseup", stopMovingText);
    };
  }, []);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    return {
      x: (e.clientX - rect.left - offset.x) / zoom,
      y: (e.clientY - rect.top - offset.y) / zoom,
    };
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const currentZoom = zoomRef.current;
    const currentOffset = offsetRef.current;
    const nextZoom = Math.min(4, Math.max(0.25, currentZoom * zoomFactor));
    const worldX = (mouseX - currentOffset.x) / currentZoom;
    const worldY = (mouseY - currentOffset.y) / currentZoom;
    const nextOffset = {
      x: mouseX - worldX * nextZoom,
      y: mouseY - worldY * nextZoom,
    };

    zoomRef.current = nextZoom;
    offsetRef.current = nextOffset;
    setZoom(nextZoom);
    setOffset(nextOffset);
  };

  const commitActiveText = () => {
    if (!activeText) return;

    const value = activeText.value.trim();
    if (value) {
      const nextText: TextElement = {
        kind: "text",
        point: activeText.point,
        value,
        color: "#000000",
        fontSize: activeText.fontSize,
        width: activeText.width,
        height: activeText.height,
      };

      setElements((prev) => {
        if (activeText.editingIndex === undefined) {
          return [...prev, nextText];
        }

        return prev.map((element, index) =>
          index === activeText.editingIndex ? nextText : element
        );
      });
    }

    setActiveText(null);
  };

  const copySelection = () => {
    if (!selectionBox) return;

    const selectedIndexes = getSelectedPenElementIndexes(selectionBox);
    const selectedElements = elements.filter((_, index) =>
      selectedIndexes.has(index)
    );

    copiedElements.current = selectedElements;
    setSelectionMenu(null);

    navigator.clipboard
      ?.writeText(JSON.stringify(selectedElements))
      .catch(() => {
        copiedElements.current = selectedElements;
      });
  };

  const deleteSelection = () => {
    if (!selectionBox) return;

    const selectedIndexes = getSelectedPenElementIndexes(selectionBox);
    setElements((prev) => prev.filter((_, index) => !selectedIndexes.has(index)));
    setSelectionBox(null);
    setSelectionMenu(null);
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    if (tool === "cursor") {
      if (e.button === 2) {
        e.preventDefault();
        isPanningRef.current = true;
        didPanRef.current = false;
        setIsPanning(true);
        panStart.current = {
          screen: { x: e.clientX, y: e.clientY },
          offset: offsetRef.current,
        };
      }

      if (e.button === 0) {
        const point = getCanvasCoordinates(e);
        setSelectionMenu(null);
        selectionStart.current = point;
        isSelectingRef.current = true;
        setIsSelecting(true);
        setSelectionBox({ start: point, end: point });
      }

      return;
    }

    if (tool === "text") {
      return;
    }

    const { x, y } = getCanvasCoordinates(e);

    if (
      tool === "circle" ||
      tool === "square" ||
      tool === "arrow"
    ) {
      setIsDrawing(true);
      setShapeStart({ x, y });
      shapeEnd.current = { x, y };
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      setSnapshot(
        ctx.getImageData(0, 0, canvas.clientWidth * dpr, canvas.clientHeight * dpr)
      );
      return;
    }

    if (tool === "pen" || tool === "eraser") {
      currentStroke.current = {
        kind: "stroke",
        points: [{ x, y }],
        tool,
        width: tool === "pen" ? penWidth : eraserWidth,
        color: tool === "pen" ? penColor : undefined,
      };
    }

    lastPos.current = { x, y };
    lastMid.current = { x, y };
    setIsDrawing(true);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== "text") return;
    if (activeText) {
      textInputRef.current?.focus();
      return;
    }

    const { x, y } = getCanvasCoordinates(e);
    const textIndex = elements.findLastIndex(
      (element) =>
        element.kind === "text" &&
        pointInBounds({ x, y }, getTextBounds(element))
    );

    if (textIndex !== -1) {
      const textElement = elements[textIndex];
      if (textElement.kind === "text") {
        setActiveText({
          point: textElement.point,
          screenPoint: {
            x: textElement.point.x * zoomRef.current + offsetRef.current.x,
            y:
              textElement.point.y * zoomRef.current +
              offsetRef.current.y +
              topBarHeight,
          },
          value: textElement.value,
          width: textElement.width,
          height: textElement.height,
          fontSize: textElement.fontSize,
          editingIndex: textIndex,
        });
      }

      return;
    }

    setActiveText({
      point: { x, y },
      screenPoint: { x: e.clientX, y: e.clientY },
      value: "",
      width: 120,
      height: 44,
      fontSize: getTextFontSize(120, 44),
    });
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanningRef.current && panStart.current) {
      e.preventDefault();
      const dx = e.clientX - panStart.current.screen.x;
      const dy = e.clientY - panStart.current.screen.y;

      const nextOffset = {
        x: panStart.current.offset.x + dx,
        y: panStart.current.offset.y + dy,
      };

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        didPanRef.current = true;
      }

      offsetRef.current = nextOffset;
      setOffset(nextOffset);
      return;
    }

    if (isSelectingRef.current && selectionStart.current) {
      setSelectionBox({
        start: selectionStart.current,
        end: getCanvasCoordinates(e),
      });
      return;
    }

    if (!isDrawing) return;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e);

    if (
      (
        tool === "circle" ||
        tool === "square" ||
        tool === "arrow"
      ) &&
      shapeStart &&
      snapshot
    ) {
      shapeEnd.current = { x, y };
      ctx.putImageData(snapshot, 0, 0);

      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);
      drawShape(ctx, tool, shapeStart.x, shapeStart.y, x, y);
      ctx.restore();

      return;
    }

    if (!lastPos.current || !lastMid.current) return;

    const midX = (lastPos.current.x + x) / 2;
    const midY = (lastPos.current.y + y) / 2;

    if (currentStroke.current) {
      currentStroke.current.points.push({ x, y });
      redrawCanvas();
    }

    lastPos.current = { x, y };
    lastMid.current = { x: midX, y: midY };
  };

  const clearCanvas = () => {
    setElements([]);
    setActiveText(null);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight - topBarHeight;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
  };
  const stopDrawing = (e?: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanningRef.current) {
      const shouldOpenMenu =
        e &&
        !didPanRef.current &&
        selectionBox &&
        pointInBounds(getCanvasCoordinates(e), getSelectionBounds(selectionBox));

      isPanningRef.current = false;
      setIsPanning(false);
      didPanRef.current = false;
      panStart.current = null;

      if (shouldOpenMenu) {
        setSelectionMenu({ x: e.clientX, y: e.clientY });
      }

      return;
    }

    if (isSelectingRef.current) {
      const selection = selectionBox;
      isSelectingRef.current = false;
      setIsSelecting(false);
      selectionStart.current = null;

      if (
        selection &&
        Math.abs(selection.end.x - selection.start.x) < 3 &&
        Math.abs(selection.end.y - selection.start.y) < 3
      ) {
        setSelectionBox(null);
      }

      return;
    }

    if (
      (
        tool === "circle" ||
        tool === "square" ||
        tool === "arrow"
      ) &&
      shapeStart &&
      shapeEnd.current
    ) {
      const finalShapeEnd = shapeEnd.current;

      setElements((prev) => [
        ...prev,
        {
          kind: "shape",
          tool,
          start: shapeStart,
          end: finalShapeEnd,
        },
      ]);
    }

    if (currentStroke.current) {
      const finishedStroke = {
        kind: "stroke" as const,
        points: [...currentStroke.current.points],
        tool: currentStroke.current.tool,
        width: currentStroke.current.width,
        color: currentStroke.current.color,
      };

      setElements((prev) => [...prev, finishedStroke]);
      currentStroke.current = null;
    }

    setIsDrawing(false);
    lastPos.current = null;
    lastMid.current = null;
    setShapeStart(null);
    setSnapshot(null);
    shapeEnd.current = null;
  };

  const canvasCursor: string =
    tool === "cursor" ? isPanning ? "grabbing" : isSelecting ? "crosshair" : "grab" : tool === "eraser" ? "cell" : tool === "text" ? "text" : "crosshair";

  const isCursorActive = tool === "cursor";
  const isTextActive = tool === "text";
  const isPenActive = tool === "pen";

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#ffffff",
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={(e) => stopDrawing(e)}
        onMouseLeave={() => stopDrawing()}
        onClick={handleCanvasClick}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
        style={{
          position: "fixed",
          top: `${topBarHeight}px`,
          left: 0,
          width: "100vw",
          height: `calc(100vh - ${topBarHeight}px)`,
          display: "block",
          background: "#ffffff",
          cursor: canvasCursor,
        }}
      />

      {activeText && (
        <textarea
          ref={textInputRef}
          autoFocus
          placeholder="Type here"
          value={activeText.value}
          onChange={(e) =>
            setActiveText((prev) =>
              prev ? { ...prev, value: e.target.value } : prev
            )
          }
          onMouseUp={(e) => {
            const target = e.currentTarget;
            setActiveText((prev) =>
              prev
                ? {
                    ...prev,
                    width: target.offsetWidth,
                    height: target.offsetHeight,
                    fontSize: getTextFontSize(
                      target.offsetWidth,
                      target.offsetHeight
                    ),
                  }
                : prev
            );
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => {
            e.stopPropagation();

            const rect = e.currentTarget.getBoundingClientRect();
            const isResizeCorner =
              e.clientX > rect.right - 18 && e.clientY > rect.bottom - 18;

            if (isResizeCorner) return;

            isDraggingTextRef.current = true;
            textDragStart.current = {
              screen: { x: e.clientX, y: e.clientY },
              textScreen: activeText.screenPoint,
            };
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setActiveText(null);
            }

            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              commitActiveText();
            }
          }}
          style={{
            position: "fixed",
            top: `${activeText.screenPoint.y}px`,
            left: `${activeText.screenPoint.x}px`,
            width: `${activeText.width}px`,
            height: `${activeText.height}px`,
            minWidth: "72px",
            minHeight: "30px",
            padding: "4px 6px",
            border: "2px solid #000000",
            borderRadius: "2px",
            outline: "none",
            background: "#ffffff",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.14)",
            color: "#000000",
            caretColor: "#000000",
            fontSize: `${activeText.fontSize}px`,
            fontFamily: "Arial, sans-serif",
            lineHeight: 1.25,
            resize: "both",
            overflow: "auto",
            boxSizing: "border-box",
            zIndex: 60,
          }}
        />
      )}

      {selectionMenu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: `${selectionMenu.y}px`,
            left: `${selectionMenu.x}px`,
            display: "flex",
            flexDirection: "column",
            minWidth: "82px",
            padding: "3px",
            borderRadius: "6px",
            background: "#ffffff",
            boxShadow: "0 6px 16px rgba(0,0,0,0.16)",
            border: "1px solid rgba(17,24,39,0.12)",
            zIndex: 80,
          }}
        >
          <button
            onClick={copySelection}
            style={{
              padding: "6px 8px",
              border: "none",
              borderRadius: "4px",
              background: "transparent",
              color: "#111827",
              fontSize: "12px",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            Copy
          </button>
          <button
            onClick={deleteSelection}
            style={{
              padding: "6px 8px",
              border: "none",
              borderRadius: "4px",
              background: "transparent",
              color: "#111827",
              fontSize: "12px",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      )}

      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: `${topBarHeight}px`,
          background:
            "linear-gradient(90deg, #7c3aed 0%, #3b82f6 50%, #22c55e 100%)",
          zIndex: 50,
        }}
      />

      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "30px",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          padding: "8px",
          borderRadius: "12px",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 8px 25px rgba(0,0,0,0.18)",
          zIndex: 20,
        }}
      >
        <button
          onClick={() => {
            setTool("cursor");
            setShowPenMenu(false);
            setShowEraserMenu(false);
            setShowShapesMenu(false);
          }}
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "8px",
            border: "none",
            background: isCursorActive ? "#7c3aed" : "#f3f4f6",
            color: isCursorActive ? "white" : "#111827",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <MousePointer2 size={18} />
        </button>

        <button
          onClick={() => {
            setTool("text");
            setShowPenMenu(false);
            setShowEraserMenu(false);
            setShowShapesMenu(false);
          }}
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "8px",
            border: "none",
            background: isTextActive ? "#7c3aed" : "#f3f4f6",
            color: isTextActive ? "white" : "#111827",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <Type size={19} />
        </button>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => {
              const nextIsOpen = !(tool === "pen" && showPenMenu);
              setTool("pen");
              setShowPenMenu(nextIsOpen);
              setShowEraserMenu(false);
              setShowShapesMenu(false);
            }}
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "8px",
              border: "none",
              background: tool === "pen" ? "#7c3aed" : "#f3f4f6",
              color: tool === "pen" ? "white" : "#111827",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <Pen size={18} />
          </button>

          {showPenMenu && isPenActive && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "54px",
                transform: "translateY(-50%)",
                minWidth: "206px",
                padding: "9px 12px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.96)",
                color: "#111827",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                boxSizing: "border-box",
                boxShadow: "0 8px 25px rgba(0,0,0,0.18)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 22px)",
                  gap: "6px",
                  padding: 0,
                }}
              >
                {penColors.map((color) => (
                  <button
                    key={`${color.name}-${color.value}`}
                    aria-label={`Use ${color.name} pen`}
                    onClick={() => setPenColor(color.value)}
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "6px",
                      border:
                        penColor === color.value
                          ? "2px solid #7c3aed"
                          : "2px solid transparent",
                      background:
                        penColor === color.value
                          ? "rgba(124,58,237,0.1)"
                          : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        width: "14px",
                        height: "14px",
                        borderRadius: "5px",
                        background: color.value,
                        boxShadow:
                          color.value === "#ffffff"
                            ? "inset 0 0 0 1px rgba(0,0,0,0.25)"
                            : "none",
                      }}
                    />
                  </button>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    minWidth: "20px",
                    textAlign: "center",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  {penWidth}
                </div>
                <input
                  type="range"
                  min="1"
                  max="24"
                  value={penWidth}
                  onChange={(e) => setPenWidth(Number(e.target.value))}
                  style={{
                    width: "100%",
                    accentColor: "#7c3aed",
                    cursor: "pointer",
                  }}
                />
                <div
                  style={{
                    width: `${Math.max(6, penWidth)}px`,
                    height: `${Math.max(6, penWidth)}px`,
                    borderRadius: "999px",
                    background: penColor,
                    boxShadow:
                      penColor === "#ffffff"
                        ? "inset 0 0 0 1px rgba(0,0,0,0.25)"
                        : "none",
                    flexShrink: 0,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => {
              const nextIsOpen = !(tool === "eraser" && showEraserMenu);
              setTool("eraser");
              setShowEraserMenu(nextIsOpen);
              setShowPenMenu(false);
              setShowShapesMenu(false);
            }}
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "8px",
              border: "none",
              background: tool === "eraser" ? "#7c3aed" : "#f3f4f6",
              color: tool === "eraser" ? "white" : "#111827",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <Eraser size={18} />
          </button>

          {showEraserMenu && tool === "eraser" && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "54px",
                transform: "translateY(-50%)",
                minWidth: "190px",
                padding: "12px 14px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.96)",
                color: "#111827",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                boxSizing: "border-box",
                boxShadow: "0 8px 25px rgba(0,0,0,0.18)",
              }}
            >
              <div
                style={{
                  minWidth: "20px",
                  textAlign: "center",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                {eraserWidth}
              </div>
              <input
                type="range"
                min="8"
                max="64"
                value={eraserWidth}
                onChange={(e) => setEraserWidth(Number(e.target.value))}
                style={{
                  width: "100%",
                  accentColor: "#7c3aed",
                  cursor: "pointer",
                }}
              />
              <div
                style={{
                  width: `${Math.max(8, eraserWidth)}px`,
                  height: `${Math.max(8, eraserWidth)}px`,
                  borderRadius: "999px",
                  background: "white",
                  flexShrink: 0,
                }}
              />
            </div>
          )}
        </div>

        <button
          onClick={clearCanvas}
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "8px",
            border: "none",
            background: "#f3f4f6",
            color: "#111827",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <Trash2 size={18} />
        </button>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => {
              setShowShapesMenu((prev) => !prev);
              setShowPenMenu(false);
              setShowEraserMenu(false);
            }}
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "8px",
              border: "none",
              background: ["circle", "square", "arrow"].includes(tool)
                ? "#7c3aed"
                : "#f3f4f6",
              color: ["circle", "square", "arrow"].includes(tool)
                ? "#fff"
                : "#111827",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Shapes size={18} />
          </button>

          {showShapesMenu && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "54px",
                transform: "translateY(-50%)",
                display: "flex",
                gap: "10px",
                padding: "10px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.96)",
                boxShadow: "0 8px 25px rgba(0,0,0,0.18)",
              }}
            >
              <button
                onClick={() => {
                  setTool("circle");
                  setShowShapesMenu(false);
                  setShowPenMenu(false);
                  setShowEraserMenu(false);
                }}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: "#111827",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Circle size={18} />
              </button>

              <button
                onClick={() => {
                  setTool("square");
                  setShowShapesMenu(false);
                  setShowPenMenu(false);
                  setShowEraserMenu(false);
                }}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: "#111827",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Square size={18} />
              </button>

              <button
                onClick={() => {
                  setTool("arrow");
                  setShowShapesMenu(false);
                  setShowPenMenu(false);
                  setShowEraserMenu(false);
                }}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: "#111827",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
