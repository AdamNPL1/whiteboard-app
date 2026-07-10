"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Minus, Plus, Trash2, Underline } from "lucide-react";
import { Group, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";

type KonvaTextPrototypeProps = {
  topOffset: number;
  active: boolean;
  interactive: boolean;
  toolbarBackground: string;
  panelBorderColor: string;
  panelTextColor: string;
  panelDividerColor: string;
  selectedControlBackground: string;
};

type PrototypeText = {
  x: number;
  y: number;
  text: string;
  width: number;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

const lineHeight = 1.15;
const textPadding = 8;
const selectionHandleSize = 10;
const textColorChoices = [
  "#0f172a",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ffffff",
];

export default function KonvaTextPrototype({
  topOffset,
  active,
  interactive,
  toolbarBackground,
  panelBorderColor,
  panelTextColor,
  panelDividerColor,
  selectedControlBackground,
}: KonvaTextPrototypeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const customColorInputRef = useRef<HTMLInputElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [isVisible, setIsVisible] = useState(true);
  const [isSelected, setIsSelected] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [textObject, setTextObject] = useState<PrototypeText>({
    x: 160,
    y: 120,
    text: "",
    width: 420,
    fontSize: 44,
    color: "#0f172a",
    bold: false,
    italic: false,
    underline: false,
  });

  useEffect(() => {
    const updateViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: Math.max(0, window.innerHeight - topOffset),
      });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
    };
  }, [topOffset]);

  useEffect(() => {
    if (!isSelected || !groupRef.current || !transformerRef.current) return;

    transformerRef.current.nodes([groupRef.current]);
    transformerRef.current.forceUpdate();
    transformerRef.current.getLayer()?.batchDraw();
  }, [isSelected, textObject]);

  useEffect(() => {
    if (!active || !isSelected || isEditing) return;
    if (!groupRef.current || !transformerRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      if (!groupRef.current || !transformerRef.current) return;

      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.forceUpdate();
      transformerRef.current.getLayer()?.batchDraw();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [active, isEditing, isSelected, textObject.width, textObject.fontSize]);

  useEffect(() => {
    if (interactive) return;

    const frame = window.requestAnimationFrame(() => {
      setIsEditing(false);
      setShowColorPalette(false);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [interactive]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!active) {
        setIsEditing(false);
        setIsSelected(false);
        setShowColorPalette(false);
        return;
      }

      if (isVisible) {
        setIsSelected(true);
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [active, isVisible]);

  useEffect(() => {
    if (!isEditing) return;

    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [isEditing]);

  const estimatedHeight = (() => {
    const lines = Math.max(1, textObject.text.split("\n").length);
    return Math.max(
      textObject.fontSize * lineHeight * lines + textPadding * 2,
      textObject.fontSize * 1.5
    );
  })();

  const toolbarLeft = Math.max(16, textObject.x);
  const toolbarTop = Math.max(12, textObject.y + topOffset - 56);
  const fontStyle = textObject.bold
    ? textObject.italic
      ? "bold italic"
      : "bold"
    : textObject.italic
    ? "italic"
    : "normal";
  const textDecoration = textObject.underline ? "underline" : "";

  if (viewport.width === 0 || viewport.height === 0) {
    return null;
  }

  if (!active || !isVisible) {
    return null;
  }

  const commitEditorText = (value: string) => {
    setTextObject((current) => ({
      ...current,
      text: value.replace(/\r/g, ""),
    }));
    setIsEditing(false);
  };

  const removeTextObject = () => {
    setIsEditing(false);
    setIsSelected(false);
    setIsVisible(false);
    setShowColorPalette(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: `${topOffset}px`,
        width: `${viewport.width}px`,
        height: `${viewport.height}px`,
        zIndex: 10,
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      {isSelected && interactive ? (
        <div
          style={{
            position: "fixed",
            left: `${toolbarLeft}px`,
            top: `${toolbarTop}px`,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 10px",
            borderRadius: "14px",
            background: toolbarBackground,
            border: `1px solid ${panelBorderColor}`,
            color: panelTextColor,
            boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
            backdropFilter: "blur(14px)",
            zIndex: 85,
            pointerEvents: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button
              type="button"
              onClick={() =>
                setTextObject((current) => ({
                  ...current,
                  fontSize: Math.max(12, current.fontSize - 2),
                }))
              }
              style={toolbarButtonStyle(
                false,
                panelTextColor,
                selectedControlBackground
              )}
            >
              <Minus size={14} />
            </button>
            <input
              type="number"
              min={12}
              max={240}
              value={textObject.fontSize}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (!Number.isFinite(nextValue)) return;
                setTextObject((current) => ({
                  ...current,
                  fontSize: Math.max(12, Math.min(240, Math.round(nextValue))),
                }));
              }}
              style={{
                width: "52px",
                height: "28px",
                borderRadius: "8px",
                border: `1px solid ${panelBorderColor}`,
                background: selectedControlBackground,
                color: panelTextColor,
                fontSize: "13px",
                fontWeight: 600,
                textAlign: "center",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() =>
                setTextObject((current) => ({
                  ...current,
                  fontSize: Math.min(240, current.fontSize + 2),
                }))
              }
              style={toolbarButtonStyle(
                false,
                panelTextColor,
                selectedControlBackground
              )}
            >
              <Plus size={14} />
            </button>
          </div>

          <div style={{ ...toolbarDividerStyle, background: panelDividerColor }} />

          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowColorPalette((current) => !current)}
              style={{
                ...toolbarButtonStyle(
                  showColorPalette,
                  panelTextColor,
                  selectedControlBackground
                ),
                width: "32px",
              }}
              aria-label="Choose text color"
            >
              <span
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "999px",
                  background: textObject.color,
                  border: `1px solid ${panelBorderColor}`,
                }}
              />
            </button>

            {showColorPalette ? (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 10px)",
                  left: "-8px",
                  display: "grid",
                  gridTemplateColumns: "repeat(5, 24px)",
                  gap: "8px",
                  padding: "10px",
                  borderRadius: "12px",
                  background: toolbarBackground,
                  border: `1px solid ${panelBorderColor}`,
                  boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
                }}
              >
                {textColorChoices.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      setTextObject((current) => ({
                        ...current,
                        color,
                      }));
                      setShowColorPalette(false);
                    }}
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "999px",
                      border:
                        textObject.color === color
                          ? "2px solid #2563eb"
                          : `1px solid ${panelBorderColor}`,
                      background: color,
                      cursor: "pointer",
                      boxShadow:
                        color === "#ffffff"
                          ? "inset 0 0 0 1px rgba(15,23,42,0.16)"
                          : "none",
                    }}
                    aria-label={`Use color ${color}`}
                  />
                ))}
                <button
                  type="button"
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "999px",
                    border: `1px solid ${panelBorderColor}`,
                    background:
                      "conic-gradient(from 180deg, #ff4d4d, #f59e0b, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ff4d4d)",
                    cursor: "pointer",
                    position: "relative",
                    overflow: "hidden",
                  }}
                  aria-label="Choose custom color"
                >
                  <span
                    style={{
                      position: "absolute",
                      inset: "4px",
                      borderRadius: "999px",
                      background: toolbarBackground,
                    }}
                  />
                  <input
                    ref={customColorInputRef}
                    type="color"
                    value={textObject.color}
                    onChange={(event) => {
                      setTextObject((current) => ({
                        ...current,
                        color: event.target.value,
                      }));
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      opacity: 0.01,
                      cursor: "pointer",
                    }}
                  />
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ ...toolbarDividerStyle, background: panelDividerColor }} />

          <button
            type="button"
            onClick={() =>
              setTextObject((current) => ({
                ...current,
                bold: !current.bold,
              }))
            }
            style={toolbarButtonStyle(
              textObject.bold,
              panelTextColor,
              selectedControlBackground
            )}
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            onClick={() =>
              setTextObject((current) => ({
                ...current,
                italic: !current.italic,
              }))
            }
            style={toolbarButtonStyle(
              textObject.italic,
              panelTextColor,
              selectedControlBackground
            )}
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            onClick={() =>
              setTextObject((current) => ({
                ...current,
                underline: !current.underline,
              }))
            }
            style={toolbarButtonStyle(
              textObject.underline,
              panelTextColor,
              selectedControlBackground
            )}
          >
            <Underline size={14} />
          </button>

          <div style={{ ...toolbarDividerStyle, background: panelDividerColor }} />

          <button
            type="button"
            onClick={removeTextObject}
            style={toolbarButtonStyle(
              false,
              panelTextColor,
              selectedControlBackground
            )}
            aria-label="Delete text"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : null}

      <Stage
        width={viewport.width}
        height={viewport.height}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) {
            setIsSelected(false);
          }
        }}
        style={{ background: "transparent" }}
      >
        <Layer>
          {!isEditing ? (
            <Group
              ref={groupRef}
              x={textObject.x}
              y={textObject.y}
              draggable={interactive}
              onClick={() => setIsSelected(true)}
              onTap={() => setIsSelected(true)}
              onDblClick={() => {
                if (!interactive) return;
                setIsSelected(true);
                setIsEditing(true);
              }}
              onDblTap={() => {
                if (!interactive) return;
                setIsSelected(true);
                setIsEditing(true);
              }}
              onDragMove={(event) => {
                setTextObject((current) => ({
                  ...current,
                  x: event.target.x(),
                  y: event.target.y(),
                }));
              }}
              onDragEnd={(event) => {
                setTextObject((current) => ({
                  ...current,
                  x: event.target.x(),
                  y: event.target.y(),
                }));
              }}
              onTransform={(event) => {
                const node = event.target as Konva.Group;
                const nextScaleX = node.scaleX();
                const nextScaleY = node.scaleY();
                const scaleAverage = (nextScaleX + nextScaleY) / 2;

                setTextObject((current) => ({
                  ...current,
                  x: node.x(),
                  y: node.y(),
                  width: Math.max(140, current.width * nextScaleX),
                  fontSize: Math.max(
                    16,
                    Math.round(current.fontSize * scaleAverage)
                  ),
                }));

                node.scaleX(1);
                node.scaleY(1);
              }}
            >
              <Rect
                x={0}
                y={0}
                width={textObject.width}
                height={estimatedHeight}
                fill="rgba(0,0,0,0.001)"
              />
              {isSelected && !textObject.text.trim() ? (
                <>
                  <Rect
                    x={0}
                    y={0}
                    width={textObject.width}
                    height={estimatedHeight}
                    stroke="#2563eb"
                    strokeWidth={1.5}
                    listening={false}
                  />
                  {[
                    { x: 0, y: 0 },
                    { x: textObject.width / 2, y: 0 },
                    { x: textObject.width, y: 0 },
                    { x: 0, y: estimatedHeight / 2 },
                    { x: textObject.width, y: estimatedHeight / 2 },
                    { x: 0, y: estimatedHeight },
                    { x: textObject.width / 2, y: estimatedHeight },
                    { x: textObject.width, y: estimatedHeight },
                  ].map((handle, index) => (
                    <Rect
                      key={`selection-handle-${index}`}
                      x={handle.x - selectionHandleSize / 2}
                      y={handle.y - selectionHandleSize / 2}
                      width={selectionHandleSize}
                      height={selectionHandleSize}
                      fill="#ffffff"
                      stroke="#2563eb"
                      strokeWidth={1.5}
                      listening={false}
                    />
                  ))}
                </>
              ) : null}
              <Text
                x={0}
                y={0}
                text={textObject.text}
                width={textObject.width}
                fontSize={textObject.fontSize}
                fontFamily='"Segoe UI", Arial, sans-serif'
                fill={textObject.color}
                fontStyle={fontStyle}
                textDecoration={textDecoration}
                lineHeight={lineHeight}
                padding={textPadding}
              />
            </Group>
          ) : null}

          {isSelected && interactive && !isEditing ? (
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              enabledAnchors={[
                "top-left",
                "top-right",
                "bottom-left",
                "bottom-right",
              ]}
              borderStroke="#2563eb"
              borderStrokeWidth={1.5}
              anchorFill="#ffffff"
              anchorStroke="#2563eb"
              anchorStrokeWidth={1.5}
              anchorSize={10}
              boundBoxFunc={(_, newBox) => ({
                ...newBox,
                width: Math.max(140, newBox.width),
                height: Math.max(40, newBox.height),
              })}
            />
          ) : null}
        </Layer>
      </Stage>

      {isEditing ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={(event) => {
            commitEditorText(event.currentTarget.innerText);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              commitEditorText(event.currentTarget.innerText);
            }
          }}
          style={{
            position: "absolute",
            left: `${textObject.x}px`,
            top: `${textObject.y}px`,
            width: `${textObject.width}px`,
            minHeight: `${estimatedHeight}px`,
            padding: `${textPadding}px`,
            outline: "none",
            border: "1.5px solid #2563eb",
            color: textObject.color,
            fontSize: `${textObject.fontSize}px`,
            fontFamily: '"Segoe UI", Arial, sans-serif',
            fontStyle: textObject.italic ? "italic" : "normal",
            fontWeight: textObject.bold ? 700 : 400,
            textDecoration: textObject.underline ? "underline" : "none",
            lineHeight: `${lineHeight}`,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            background: "transparent",
            boxSizing: "border-box",
          }}
        >
          {textObject.text}
        </div>
      ) : null}
    </div>
  );
}

const toolbarDividerStyle = {
  width: "1px",
  height: "20px",
  background: "currentColor",
  opacity: 0.18,
} as const;

const toolbarButtonStyle = (
  active: boolean,
  panelTextColor = "#f8fafc",
  selectedControlBackground = "rgba(124,58,237,0.88)"
) =>
  ({
    width: "32px",
    height: "32px",
    border: "none",
    borderRadius: "9px",
    background: active ? selectedControlBackground : "transparent",
    color: panelTextColor,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
    transition: "background 0.18s ease",
  }) as const;
