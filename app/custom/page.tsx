"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  Pen,
  Eraser,
  Trash2,
  Shapes,
  Circle,
  Square,
  Minus,
  MousePointer2,
  Type,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowRight,
  Bold,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Italic,
  LayoutGrid,
  List,
  ListOrdered,
  Lock,
  Mail,
  Clock3,
  Monitor,
  Plus,
  Search,
  Settings,
  Star,
  Underline,
  Upload,
  UserRound,
  X,
} from "lucide-react";

type ShapeTool = "circle" | "square" | "arrow" | "line";
type StrokeTool = "pen" | "eraser";
type Point = { x: number; y: number };
type Stroke = {
  kind: "stroke";
  points: Point[];
  tool: StrokeTool;
  width: number;
  color?: string;
  style?: StrokeStyle;
};
type Shape = {
  kind: "shape";
  tool: ShapeTool;
  start: Point;
  end: Point;
  width: number;
  color: string;
  style: StrokeStyle;
};
type StrokeStyle = "solid" | "dashed" | "dotted";
type TextAlign = "left" | "center" | "right";
type TextRun = {
  text: string;
  color: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  fontStyle: "normal" | "italic";
  underline: boolean;
};

type TextElement = {
  kind: "text";
  point: Point;
  value: string;
  color: string;
  runs: TextRun[];
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  fontStyle: "normal" | "italic";
  underline: boolean;
  textAlign: TextAlign;
  width: number;
  height: number;
  measurementSpace?: "canvas" | "screen";
  measurementZoom?: number;
  backgroundColor?: string;
};
type CanvasElement = Stroke | Shape | TextElement;
type ActiveText = {
  point: Point;
  screenPoint: Point;
  value: string;
  color: string;
  runs: TextRun[];
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  underline: boolean;
  typingFontSize: number;
  textAlign: TextAlign;
  backgroundColor?: string;
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
type TextSelection = {
  start: number;
  end: number;
};
type SettingsSection = "background" | "tools" | "account";
type GridMode = "none" | "small" | "standard" | "large";
type TextResizeHandle = "n" | "e" | "s" | "w" | "nw" | "ne" | "sw" | "se";
type CanvasPointerInput = Pick<PointerEvent, "clientX" | "clientY">;
type AuthMode = "login" | "register";
type PublicAccount = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt?: string;
  plan: "basic" | "pro" | "master";
  subscriptionStatus: "inactive" | "trialing" | "active" | "past_due" | "canceled";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  onboardingStatus: "new" | "started" | "completed";
};
type BoardSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  starred?: boolean;
  previewDocument: BoardDocument;
};
type CalendarEntry = {
  id: string;
  date: string;
  startHour: string;
  endHour: string;
  title: string;
  color: string;
};
type BoardDocument = {
  elements: CanvasElement[];
  canvasBackground: string;
  customCanvasBackground: string;
  gridMode: GridMode;
  gridOpacity: number;
  calendarEntries: CalendarEntry[];
};
type BoardBrowserView =
  | "all"
  | "recent"
  | "mine"
  | "starred"
  | "trash"
  | "calendar"
  | "plan";

export default function Page() {
  const topBarHeight = 48;
  const appSansFontFamily =
    'var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const lightCanvasColor = "#ffffff";
  const greyCanvasColor = "#6b7280";
  const darkCanvasColor = "#111111";
  const floralCanvasBackground = "floral";
  const floralBackgroundImage = "/floral-background.png";
  const floralBackgroundTile = { width: 1600, height: 900 };
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
  const textColorPalette = [
    { name: "White", value: "#ffffff" },
    { name: "Off white", value: "#f8fafc" },
    { name: "Light grey", value: "#d1d5db" },
    { name: "Grey", value: "#6b7280" },
    { name: "Black", value: "#111827" },
    { name: "Rose", value: "#e7b8bf" },
    { name: "Peach", value: "#edc99f" },
    { name: "Cream", value: "#f2dda3" },
    { name: "Mint", value: "#b9dfc0" },
    { name: "Blue", value: "#7da6f2" },
    { name: "Lavender", value: "#c4b5fd" },
    { name: "Pink", value: "#e09aa3" },
    { name: "Orange", value: "#edbd87" },
    { name: "Yellow", value: "#efd37f" },
    { name: "Green", value: "#9ccfa7" },
    { name: "Purple", value: "#a78bfa" },
    { name: "Red", value: "#c7332f" },
    { name: "Brown", value: "#b26025" },
    { name: "Ochre", value: "#c6922f" },
    { name: "Dark green", value: "#57965d" },
    { name: "Indigo", value: "#4f7cff" },
    { name: "Violet", value: "#5525dd" },
  ];
  const textFonts = [
    {
      name: "Sans",
      family: appSansFontFamily,
      weight: 400,
      preview: "Aa",
    },
    {
      name: "UI",
      family: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
      weight: 400,
      preview: "Aa",
    },
    {
      name: "Neo",
      family: '"Trebuchet MS", "Verdana", Arial, sans-serif',
      weight: 400,
      preview: "Aa",
    },
    {
      name: "Clean",
      family: 'Arial, "Helvetica Neue", sans-serif',
      weight: 400,
      preview: "Aa",
    },
  ];
  const fallbackCanvasFontFamily =
    '"Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
  const calendarHourOptions = Array.from({ length: 48 }, (_, index) => {
    const hour = Math.floor(index / 2);
    const minutes = index % 2 === 0 ? "00" : "30";
    const hourLabel =
      hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const meridiem = hour < 12 ? "AM" : "PM";
    const minuteLabel = minutes === "00" ? "" : `:${minutes}`;
    const compactLabel = `${hour.toString().padStart(2, "0")}:${minutes}`;

    return {
      value: `${hour.toString().padStart(2, "0")}:${minutes}`,
      label: `${hourLabel}:${minutes} ${meridiem}`,
      shortLabel: compactLabel,
    };
  });
  const calendarEntryColors = [
    "#7c3aed",
    "#dc2626",
    "#ea580c",
    "#2563eb",
    "#0891b2",
    "#16a34a",
    "#475569",
    "#db2777",
  ];
  const isValidCalendarEntryColor = (
    color: string | undefined
  ): color is string => typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color);
  const getFallbackCalendarEntryColor = (entryId: string) => {
    const colorIndex = Array.from(entryId).reduce(
      (total, character) => total + character.charCodeAt(0),
      0
    );

    return calendarEntryColors[colorIndex % calendarEntryColors.length];
  };
  const normalizeCalendarEntryColor = (
    color: string | undefined,
    entryId: string
  ) => {
    if (isValidCalendarEntryColor(color)) {
      return color;
    }

    return getFallbackCalendarEntryColor(entryId);
  };
  const normalizeCalendarHourValue = (
    hour: string | undefined,
    fallback: string
  ) =>
    typeof hour === "string" &&
    calendarHourOptions.some((option) => option.value === hour)
      ? hour
      : fallback;
  const getNextCalendarHourValue = (hour: string) => {
    const currentIndex = calendarHourOptions.findIndex(
      (option) => option.value === hour
    );

    if (currentIndex === -1) return "12:30";
    return calendarHourOptions[Math.min(currentIndex + 1, calendarHourOptions.length - 1)]
      .value;
  };
  const normalizeCalendarEntries = (entries: unknown[]): CalendarEntry[] =>
    entries.flatMap((entry, index) => {
      if (!entry || typeof entry !== "object") return [];

      const candidate = entry as {
        id?: string;
        date?: string;
        startHour?: string;
        endHour?: string;
        hour?: string;
        title?: string;
        color?: string;
      };

      if (typeof candidate.date !== "string") return [];

      const startHour = normalizeCalendarHourValue(
        typeof candidate.startHour === "string"
          ? candidate.startHour
          : candidate.hour,
        "12:00"
      );
      const endHour = normalizeCalendarHourValue(
        typeof candidate.endHour === "string"
          ? candidate.endHour
          : typeof candidate.startHour === "string"
          ? candidate.startHour
          : candidate.hour,
        "13:00"
      );

      return [
        {
          id:
            typeof candidate.id === "string" && candidate.id.length > 0
              ? candidate.id
              : `calendar-entry-${candidate.date}-${index}`,
          date: candidate.date,
          startHour,
          endHour,
          title: typeof candidate.title === "string" ? candidate.title : "",
          color: normalizeCalendarEntryColor(
            candidate.color,
            typeof candidate.id === "string" && candidate.id.length > 0
              ? candidate.id
              : `calendar-entry-${candidate.date}-${index}`
          ),
        },
      ];
    });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileUploadRef = useRef<HTMLInputElement | null>(null);
  const backgroundColorInputRef = useRef<HTMLInputElement | null>(null);
  const floralBackgroundRef = useRef<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<
    "cursor" | "text" | "textbox" | StrokeTool | ShapeTool
  >("pen");
  const [showShapesMenu, setShowShapesMenu] = useState(false);
  const [showPenMenu, setShowPenMenu] = useState(false);
  const [, setShowTextMenu] = useState(false);
  const textBoxOpacity = 0.75;
  const [showEraserMenu, setShowEraserMenu] = useState(false);
  const [shapeStart, setShapeStart] = useState<Point | null>(null);
  const [snapshot, setSnapshot] = useState<ImageData | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [penWidth, setPenWidth] = useState(4);
  const [penColor, setPenColor] = useState("#000000");
  const [eraserWidth, setEraserWidth] = useState(24);
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>("solid");
  const [textFontFamily, setTextFontFamily] = useState(textFonts[0].family);
  const [textFontWeight, setTextFontWeight] = useState(textFonts[0].weight);
  const [canvasBackground, setCanvasBackground] = useState(lightCanvasColor);
  const [customCanvasBackground, setCustomCanvasBackground] =
    useState("#131619");
  const [gridMode, setGridMode] = useState<GridMode>("none");
  const [gridOpacity, setGridOpacity] = useState(24);
  const [activeText, setActiveText] = useState<ActiveText | null>(null);
  const [showTextStyleMenu, setShowTextStyleMenu] = useState(false);
  const [showTextFormatMenu, setShowTextFormatMenu] = useState(false);
  const [showTextColorMenu, setShowTextColorMenu] = useState(false);
  const [showTextAlignMenu, setShowTextAlignMenu] = useState(false);
  const [showTextListMenu, setShowTextListMenu] = useState(false);
  const [showTextBoxOpacityMenu, setShowTextBoxOpacityMenu] = useState(false);
  const [textColorBase, setTextColorBase] = useState("#000000");
  const [textColorOpacity, setTextColorOpacity] = useState(1);
  const [, setTextSelection] = useState<TextSelection>({
    start: 0,
    end: 0,
  });
  const [isPanning, setIsPanning] = useState(false);
  const [penCursorPoint, setPenCursorPoint] = useState<Point | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [currentAccountName, setCurrentAccountName] = useState("");
  const [currentAccountEmail, setCurrentAccountEmail] = useState("");
  const [currentAccountId, setCurrentAccountId] = useState("");
  const [currentAccountPlan, setCurrentAccountPlan] = useState<
    "basic" | "pro" | "master"
  >(
    "basic"
  );
  const [currentSubscriptionStatus, setCurrentSubscriptionStatus] = useState<
    "inactive" | "trialing" | "active" | "past_due" | "canceled"
  >("inactive");
  const [currentMaxBoards, setCurrentMaxBoards] = useState(5);
  const [billingMessage, setBillingMessage] = useState("");
  const [billingMessageTone, setBillingMessageTone] = useState<
    "error" | "success"
  >("success");
  const [pendingBillingPlan, setPendingBillingPlan] = useState<
    "basic" | "pro" | "master" | ""
  >("");
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSection>("background");
  const [showBoardsMenu, setShowBoardsMenu] = useState(false);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState("");
  const [editingBoardId, setEditingBoardId] = useState("");
  const [editingBoardName, setEditingBoardName] = useState("");
  const [boardSearchQuery, setBoardSearchQuery] = useState("");
  const [boardBrowserView, setBoardBrowserView] =
    useState<BoardBrowserView>("all");
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);
  const [editingCalendarEntryId, setEditingCalendarEntryId] = useState("");
  const [selectedCalendarEntryId, setSelectedCalendarEntryId] = useState("");
  const [isBoardsLoading, setIsBoardsLoading] = useState(false);
  const [isRegisterHovered, setIsRegisterHovered] = useState(false);
  const [isFloralBackgroundLoaded, setIsFloralBackgroundLoaded] =
    useState(false);
  const [panningCursorPoint, setPanningCursorPoint] = useState<Point | null>(
    null
  );
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenu | null>(null);
  const [textSizeMenu, setTextSizeMenu] = useState<SelectionMenu | null>(null);
  const shapeEnd = useRef<Point | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const boardNameInputRef = useRef<HTMLInputElement | null>(null);
  const boardsMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const profileMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const calendarScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const calendarBottomScrollbarRef = useRef<HTMLDivElement | null>(null);
  const activeCalendarScrollSyncRef = useRef<"main" | "bottom" | null>(null);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const activeTextZoomRef = useRef(1);
  const panStart = useRef<{ screen: Point; offset: Point } | null>(null);
  const isPanningRef = useRef(false);
  const didPanRef = useRef(false);
  const selectionStart = useRef<Point | null>(null);
  const isSelectingRef = useRef(false);
  const isDraggingTextRef = useRef(false);
  const isResizingTextRef = useRef(false);
  const textDragStart = useRef<{ screen: Point; textScreen: Point } | null>(
    null
  );
  const textResizeStart = useRef<{
    screen: Point;
    screenPoint: Point;
    width: number;
    height: number;
    fontSize: number;
    runs: TextRun[];
    handle: TextResizeHandle;
  } | null>(null);
  const copiedElements = useRef<CanvasElement[]>([]);
  const penCursorElementRef = useRef<HTMLDivElement | null>(null);
  const penCursorPointRef = useRef<Point | null>(null);
  const pendingPenCursorFrame = useRef<number | null>(null);
  const pendingPenCursorPoint = useRef<Point | null>(null);

  const [elements, setElements] = useState<CanvasElement[]>([]);

  const currentStroke = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);
  const renderedLiveStrokePointCountRef = useRef(0);
  const latestRedrawCanvasRef = useRef<() => void>(() => {});
  const pendingRedrawFrame = useRef<number | null>(null);
  const autosaveBoardTimeoutRef = useRef<number | null>(null);
  const suppressBoardAutosaveUntilRef = useRef(0);
  const keepTextBoxInViewportRef = useRef(
    (screenPoint: Point, width: number, height: number) => ({
      screenPoint,
      point: screenPoint,
      width,
      height,
    })
  );
  const activeTextScreenX = activeText?.screenPoint.x;
  const activeTextScreenY = activeText?.screenPoint.y;
  const textPaddingX = 4;
  const textPaddingY = 2;
  const textLineHeight = 1.25;
  const textBoxSize = 200;
  const textBoxTextColor = "#ffffff";
  const textEditorTypography = {
    letterSpacing: "0",
    wordSpacing: "0",
    textTransform: "none",
    fontVariantLigatures: "none",
    fontKerning: "none",
    tabSize: 4,
  } as const;

  const getTextRuns = (
    text: Pick<TextElement, "value" | "color" | "fontFamily" | "fontSize"> & {
      fontWeight?: number;
      fontStyle?: "normal" | "italic";
      underline?: boolean;
      runs?: TextRun[];
    }
  ) => {
    const fallbackFontSize = clampTextFontSize(text.fontSize);

    return text.runs?.length
      ? text.runs.map((run) => ({
          text: run.text,
          color: run.color,
          fontFamily: run.fontFamily ?? text.fontFamily,
          fontWeight: run.fontWeight ?? getTextFontWeight(text),
          fontSize: clampTextFontSize(run.fontSize, fallbackFontSize),
          fontStyle: run.fontStyle ?? text.fontStyle ?? "normal",
          underline: run.underline ?? text.underline ?? false,
        }))
      : [
          {
            text: text.value,
            color: text.color,
            fontFamily: text.fontFamily,
            fontWeight: getTextFontWeight(text),
            fontSize: fallbackFontSize,
            fontStyle: text.fontStyle ?? "normal",
            underline: text.underline ?? false,
          },
        ];
  };
  const getTextFontWeight = (text: { fontWeight?: number }) =>
    text.fontWeight ?? 400;

  const clampTextFontSize = (fontSize: number, fallback = 24) => {
    const nextFontSize = Number.isFinite(fontSize)
      ? fontSize
      : Number.isFinite(fallback)
      ? fallback
      : 24;
    return Math.min(480, Math.max(1, Math.round(nextFontSize)));
  };

  const componentToHex = (component: number) =>
    component.toString(16).padStart(2, "0");

  const parseCssColor = (color: string) => {
    if (color.startsWith("#")) {
      if (color.length === 4) {
        return {
          hex: `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`,
          opacity: 1,
        };
      }

      return { hex: color.slice(0, 7), opacity: 1 };
    }

    const match = color.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)/
    );

    if (!match) {
      return { hex: "#000000", opacity: 1 };
    }

    return {
      hex: `#${componentToHex(Number(match[1]))}${componentToHex(
        Number(match[2])
      )}${componentToHex(Number(match[3]))}`,
      opacity: match[4] === undefined ? 1 : Number(match[4]),
    };
  };

  const getTextColorWithOpacity = (hex: string, opacity: number) => {
    const normalizedOpacity = Math.min(1, Math.max(0.1, opacity));
    if (normalizedOpacity >= 0.99) return hex;

    const red = parseInt(hex.slice(1, 3), 16);
    const green = parseInt(hex.slice(3, 5), 16);
    const blue = parseInt(hex.slice(5, 7), 16);

    return `rgba(${red}, ${green}, ${blue}, ${normalizedOpacity.toFixed(2)})`;
  };

  const syncTextColorControls = (color: string) => {
    const parsedColor = parseCssColor(color);
    setTextColorBase(parsedColor.hex);
    setTextColorOpacity(parsedColor.opacity);
  };

  const applyTextFont = (fontFamily: string, fontWeight: number) => {
    setTextFontFamily(fontFamily);
    setTextFontWeight(fontWeight);
    setShowTextStyleMenu(false);
    setShowTextFormatMenu(false);
    setShowTextListMenu(false);
    setActiveText((prev) =>
      prev
        ? {
            ...prev,
            fontFamily,
            fontWeight,
            runs: compactTextRuns(
              prev.runs.map((run) => ({
                ...run,
                fontFamily,
                fontWeight,
              }))
            ),
          }
        : prev
    );
    window.setTimeout(() => textInputRef.current?.focus(), 0);
  };

  const getCanvasFontFamily = (fontFamily: string) =>
    fontFamily.includes("var(--font-geist-sans)")
      ? fallbackCanvasFontFamily
      : fontFamily;

  const applyTextFormat = (
    format: "bold" | "italic" | "underline"
  ) => {
    setShowTextFormatMenu(false);
    setShowTextListMenu(false);
    setActiveText((prev) => {
      if (!prev) return prev;

      if (format === "bold") {
        const nextFontWeight = prev.fontWeight >= 700 ? 400 : 700;
        return {
          ...prev,
          fontWeight: nextFontWeight,
          runs: compactTextRuns(
            prev.runs.map((run) => ({
              ...run,
              fontWeight: nextFontWeight,
            }))
          ),
        };
      }

      if (format === "italic") {
        const nextFontStyle = prev.fontStyle === "italic" ? "normal" : "italic";
        return {
          ...prev,
          fontStyle: nextFontStyle,
          runs: compactTextRuns(
            prev.runs.map((run) => ({
              ...run,
              fontStyle: nextFontStyle,
            }))
          ),
        };
      }

      const nextUnderline = !prev.underline;
      return {
        ...prev,
        underline: nextUnderline,
        runs: compactTextRuns(
          prev.runs.map((run) => ({
            ...run,
            underline: nextUnderline,
          }))
        ),
      };
    });
    window.setTimeout(() => textInputRef.current?.focus(), 0);
  };

  const applyTextAlign = (textAlign: TextAlign) => {
    setShowTextAlignMenu(false);
    setShowTextListMenu(false);
    setActiveText((prev) => (prev ? { ...prev, textAlign } : prev));
    window.setTimeout(() => textInputRef.current?.focus(), 0);
  };

  const getListPrefixMatch = (line: string) =>
    line.match(/^(\s*)(?:(•)\s+|(\d+)\.\s+)(.*)$/);

  const applyTextList = (listStyle: "bullet" | "numbered") => {
    const target = textInputRef.current;
    setShowTextListMenu(false);

    setActiveText((prev) => {
      if (!prev || !target) return prev;

      const selectionStart = target.selectionStart ?? prev.value.length;
      const selectionEnd = target.selectionEnd ?? selectionStart;
      const lineStart = prev.value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
      const nextBreak = prev.value.indexOf("\n", selectionEnd);
      const lineEnd = nextBreak === -1 ? prev.value.length : nextBreak;
      const selectedText = prev.value.slice(lineStart, lineEnd);
      const lines = selectedText.split("\n");
      const shouldRemove =
        lines.length > 0 &&
        lines.every((line) => {
          const match = getListPrefixMatch(line);
          return Boolean(listStyle === "bullet" ? match?.[2] : match?.[3]);
        });
      const nextLines = lines.map((line, index) => {
        const match = getListPrefixMatch(line);
        const indent = match?.[1] ?? "";
        const content = match ? match[4] : line.trimStart();

        if (shouldRemove) {
          return `${indent}${content}`;
        }

        return listStyle === "bullet"
          ? `${indent}• ${content}`
          : `${indent}${index + 1}. ${content}`;
      });
      const nextValue = `${prev.value.slice(0, lineStart)}${nextLines.join(
        "\n"
      )}${prev.value.slice(lineEnd)}`;
      const nextRuns = updateTextRuns(
        prev.value,
        nextValue,
        prev.runs,
        prev.color,
        prev.fontFamily,
        prev.fontWeight,
        clampTextFontSize(prev.typingFontSize),
        prev.fontStyle,
        prev.underline
      );
      const nextSize = getTextRunsEditorSize(
        nextRuns,
        clampTextFontSize(prev.fontSize)
      );

      window.setTimeout(() => {
        textInputRef.current?.focus();
        textInputRef.current?.setSelectionRange(lineStart, lineStart);
        syncTextSelection(textInputRef.current);
      }, 0);

      return {
        ...prev,
        value: nextValue,
        runs: nextRuns,
        ...keepTextBoxInViewport(
          prev.screenPoint,
          Math.max(prev.width, nextSize.width),
          Math.max(prev.height, nextSize.height)
        ),
      };
    });
  };

  const continueTextList = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) {
      return false;
    }

    if (!activeText) return false;

    const target = e.currentTarget;
    const selectionStart = target.selectionStart;
    const selectionEnd = target.selectionEnd;
    if (selectionStart !== selectionEnd) return false;

    const lineStart = activeText.value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
    const currentLine = activeText.value.slice(lineStart, selectionStart);
    const match = getListPrefixMatch(currentLine);
    if (!match) return false;

    e.preventDefault();
    const content = match[4];
    const replacement =
      content.length === 0
        ? "\n"
        : match[2]
        ? `\n${match[1]}• `
        : `\n${match[1]}${Number(match[3]) + 1}. `;
    const removeEmptyPrefixLength = content.length === 0 ? currentLine.length : 0;
    const nextValue = `${activeText.value.slice(
      0,
      selectionStart - removeEmptyPrefixLength
    )}${replacement}${activeText.value.slice(selectionEnd)}`;
    const nextCursor =
      selectionStart - removeEmptyPrefixLength + replacement.length;

    setActiveText((prev) => {
      if (!prev) return prev;

      const nextRuns = updateTextRuns(
        prev.value,
        nextValue,
        prev.runs,
        prev.color,
        prev.fontFamily,
        prev.fontWeight,
        clampTextFontSize(prev.typingFontSize),
        prev.fontStyle,
        prev.underline
      );
      const nextSize = getTextRunsEditorSize(
        nextRuns,
        clampTextFontSize(prev.fontSize)
      );

      return {
        ...prev,
        value: nextValue,
        runs: nextRuns,
        ...keepTextBoxInViewport(
          prev.screenPoint,
          Math.max(prev.width, nextSize.width),
          Math.max(prev.height, nextSize.height)
        ),
      };
    });

    window.setTimeout(() => {
      textInputRef.current?.setSelectionRange(nextCursor, nextCursor);
      syncTextSelection(textInputRef.current);
    }, 0);
    return true;
  };

  const applyTextColor = (baseColor: string, opacity = textColorOpacity) => {
    const nextColor = getTextColorWithOpacity(baseColor, opacity);

    setPenColor(nextColor);
    setTextColorBase(baseColor);
    setTextColorOpacity(opacity);
    setShowTextColorMenu(false);
    setShowTextFormatMenu(false);
    setShowTextAlignMenu(false);
    setActiveText((prev) =>
      prev
        ? {
            ...prev,
            color: nextColor,
            runs: compactTextRuns(
              prev.runs.map((run) => ({
                ...run,
                color: nextColor,
              }))
            ),
          }
        : prev
    );
    window.setTimeout(() => textInputRef.current?.focus(), 0);
  };

  const applyTextColorOpacity = (opacity: number) => {
    applyTextColor(textColorBase, opacity);
  };

  const getTextBoxBackgroundWithOpacity = (opacity: number) => {
    const normalizedOpacity = Math.min(1, Math.max(0.1, opacity));
    return `rgba(47, 47, 47, ${normalizedOpacity.toFixed(2)})`;
  };

  const openAuthModal = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthName("");
    setAuthPassword("");
    setAuthConfirmPassword("");
    setAuthMessage("");
    setCanResendConfirmation(false);
    setShowLoginModal(true);
  };

  const readAuthResponse = async (response: Response) => {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      user?: PublicAccount;
      needsVerification?: boolean;
    };

    if (!response.ok) {
      const error = new Error(data.error ?? "Something went wrong.") as Error & {
        needsVerification?: boolean;
      };
      error.needsVerification = data.needsVerification;
      throw error;
    }

    return data;
  };

  const handleAuthSubmit = async () => {
    if (isAuthSubmitting) return;

    const email = authEmail.trim().toLowerCase();
    const name = authName.trim();
    const password = authPassword;
    const confirmPassword = authConfirmPassword;

    if (!email) {
      setAuthMessage("Enter your email address.");
      return;
    }

    setIsAuthSubmitting(true);
    setAuthMessage("");
    setCanResendConfirmation(false);

    try {
      if (!password) {
        setAuthMessage("Enter your password.");
        return;
      }

      if (authMode === "register") {
        const data = await readAuthResponse(
          await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, confirmPassword }),
          })
        );

        setAuthPassword("");
        setAuthConfirmPassword("");
        if (data.user?.id) {
          setCurrentAccountId(data.user.id);
          setCurrentAccountName(data.user.name ?? name);
          setCurrentAccountEmail(data.user.email ?? email);
          setCurrentAccountPlan(data.user.plan ?? "basic");
          setCurrentSubscriptionStatus(data.user.subscriptionStatus ?? "inactive");
          setAuthMessage("");
          setShowLoginModal(false);
          return;
        }

        setAuthMode("login");
        setAuthMessage(data.message ?? "Check your email to confirm your account.");
        setCanResendConfirmation(true);
        return;
      }

      const data = await readAuthResponse(
        await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        })
      );

      setCurrentAccountId(data.user?.id ?? "");
      setCurrentAccountName(data.user?.name ?? "");
      setCurrentAccountEmail(data.user?.email ?? email);
      setCurrentAccountPlan(data.user?.plan ?? "basic");
      setCurrentSubscriptionStatus(data.user?.subscriptionStatus ?? "inactive");
      setAuthPassword("");
      setAuthMessage("");
      setShowLoginModal(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong.";
      if (
        error instanceof Error &&
        "needsVerification" in error &&
        Boolean(
          (error as Error & {
            needsVerification?: boolean;
          }).needsVerification
        )
      ) {
        setCanResendConfirmation(true);
      }
      setAuthMessage(message);
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const resendConfirmationEmail = async () => {
    if (!authEmail.trim() || isAuthSubmitting) return;

    setIsAuthSubmitting(true);
    setAuthMessage("");

    try {
      const data = await readAuthResponse(
        await fetch("/api/auth/resend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: authEmail.trim().toLowerCase() }),
        })
      );

      setAuthMessage(data.message ?? "A new confirmation email was sent.");
      setCanResendConfirmation(true);
    } catch (error) {
      setAuthMessage(
        error instanceof Error
          ? error.message
          : "Could not resend the confirmation email."
      );
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const signOut = async () => {
    setShowProfileMenu(false);

    if (currentAccountId && activeBoardId) {
      await persistBoard(activeBoardId).catch(() => null);
    }

    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setCurrentAccountId("");
    setCurrentAccountName("");
    setCurrentAccountEmail("");
    setCurrentAccountPlan("basic");
    setCurrentSubscriptionStatus("inactive");
    setCurrentMaxBoards(5);
    setBoards([]);
    setActiveBoardId("");
    applyBoardDocument({
      elements: [],
      canvasBackground: lightCanvasColor,
      customCanvasBackground: "#131619",
      gridMode: "none",
      gridOpacity: 24,
      calendarEntries: [],
    });
  };

  const loadCurrentAccount = async () => {
    const data = (await fetch("/api/auth/me")
      .then((response) => response.json())
      .catch(() => ({ user: null }))) as { user: PublicAccount | null };

    setCurrentAccountId(data.user?.id ?? "");
    setCurrentAccountName(data.user?.name ?? "");
    setCurrentAccountEmail(data.user?.email ?? "");
    setCurrentAccountPlan(data.user?.plan ?? "basic");
    setCurrentSubscriptionStatus(data.user?.subscriptionStatus ?? "inactive");
  };

  const closeAuthModal = () => {
    setShowLoginModal(false);
    setAuthMessage("");
    setCanResendConfirmation(false);
  };

  const applyBoardDocument = (document: BoardDocument) => {
    suppressBoardAutosaveUntilRef.current = Date.now() + 1200;
    currentStroke.current = null;
    setIsDrawing(false);
    setShapeStart(null);
    setSnapshot(null);
    shapeEnd.current = null;
    setActiveText(null);
    setSelectionBox(null);
    setSelectionMenu(null);
    setElements(Array.isArray(document.elements) ? document.elements : []);
    setCanvasBackground(document.canvasBackground);
    setCustomCanvasBackground(document.customCanvasBackground);
    setGridMode(document.gridMode);
    setGridOpacity(document.gridOpacity);
    setCalendarEntries(
      normalizeCalendarEntries(
        Array.isArray(document.calendarEntries) ? document.calendarEntries : []
      )
    );
  };

  const readBoardResponse = async (response: Response) => {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      boards?: BoardSummary[];
      activeBoardId?: string;
      maxBoards?: number;
      board?: {
        id: string;
        name: string;
        createdAt?: string;
        updatedAt?: string;
        deletedAt?: string;
        starred?: boolean;
        previewDocument?: BoardDocument;
        document: BoardDocument;
      } | null;
    };

    if (!response.ok) {
      throw new Error(data.error ?? "Could not load boards.");
    }

    return data;
  };

  const persistBoard = async (boardId: string) => {
    if (!currentAccountId || !boardId) return;

    const data = await readBoardResponse(
      await fetch(`/api/boards/${boardId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          elements,
          canvasBackground,
          customCanvasBackground,
          gridMode,
          gridOpacity,
          calendarEntries,
        }),
      })
    );

    if (data.board && typeof data.board.updatedAt === "string") {
      const savedBoard = data.board as NonNullable<typeof data.board> & {
        updatedAt: string;
      };
      const savedUpdatedAt: string = savedBoard.updatedAt;

      setBoards((previousBoards) =>
        previousBoards.map<BoardSummary>((board) =>
          board.id === boardId
            ? {
                ...board,
                name: savedBoard.name ?? board.name,
                createdAt: savedBoard.createdAt ?? board.createdAt,
                updatedAt: savedUpdatedAt,
                deletedAt: savedBoard.deletedAt,
                starred: savedBoard.starred ?? board.starred,
                previewDocument: savedBoard.document ?? board.previewDocument,
              }
            : board
        )
      );
    }
  };

  const requestPasswordReset = async () => {
    const email = authEmail.trim().toLowerCase();

    if (!email || isAuthSubmitting) {
      if (!email) {
        setAuthMessage("Enter your email address first.");
      }
      return;
    }

    setIsAuthSubmitting(true);
    setAuthMessage("");

    try {
      const data = await readAuthResponse(
        await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        })
      );

      setAuthMessage(
        data.message ?? "If an account exists for this email, check your email."
      );
    } catch (error) {
      setAuthMessage(
        error instanceof Error
          ? error.message
          : "Could not send the reset email."
      );
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const loadBoards = async () => {
    if (!currentAccountId) return;

    setIsBoardsLoading(true);

    try {
      const data = await readBoardResponse(await fetch("/api/boards"));
      setBoards(data.boards ?? []);
      setActiveBoardId(data.activeBoardId ?? "");
      setCurrentMaxBoards(data.maxBoards ?? 5);

      if (data.board?.document) {
        applyBoardDocument(data.board.document);
      } else {
        applyBoardDocument({
          elements: [],
          canvasBackground: lightCanvasColor,
          customCanvasBackground: "#131619",
          gridMode: "none",
          gridOpacity: 24,
          calendarEntries: [],
        });
      }
    } finally {
      setIsBoardsLoading(false);
    }
  };

  const switchBoard = async (boardId: string) => {
    if (!currentAccountId || !boardId || isBoardsLoading) return;
    if (boardId === activeBoardId) return;

    setIsBoardsLoading(true);

    try {
      if (activeBoardId) {
        await persistBoard(activeBoardId);
      }

      const data = await readBoardResponse(
        await fetch(`/api/boards/${boardId}/select`, {
          method: "POST",
        })
      );

      setBoards(data.boards ?? []);
      setActiveBoardId(data.activeBoardId ?? boardId);
      setCurrentMaxBoards(data.maxBoards ?? currentMaxBoards);

      if (data.board?.document) {
        applyBoardDocument(data.board.document);
      } else {
        applyBoardDocument({
          elements: [],
          canvasBackground: lightCanvasColor,
          customCanvasBackground: "#131619",
          gridMode: "none",
          gridOpacity: 24,
          calendarEntries: [],
        });
      }
    } finally {
      setIsBoardsLoading(false);
    }
  };

  const createBoard = async () => {
    if (!currentAccountId || liveBoardsCount >= currentMaxBoards || isBoardsLoading)
      return;

    setIsBoardsLoading(true);

    try {
      if (activeBoardId) {
        await persistBoard(activeBoardId);
      }

      const data = await readBoardResponse(
        await fetch("/api/boards", {
          method: "POST",
        })
      );

      setBoardBrowserView("all");
      setBoardSearchQuery("");
      setBoards(data.boards ?? []);
      setActiveBoardId(data.activeBoardId ?? "");
      setCurrentMaxBoards(data.maxBoards ?? currentMaxBoards);

      if (data.board?.document) {
        applyBoardDocument(data.board.document);
      }

      if (data.board?.id) {
        setEditingBoardId(data.board.id);
        setEditingBoardName(data.board.name);
      }
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Could not create a new board."
      );
    } finally {
      setIsBoardsLoading(false);
    }
  };

  const moveBoardToTrash = async (board: BoardSummary) => {
    if (board.deletedAt) return;

    const confirmed = window.confirm(
      `Do you really wanna remove this board?\n\n"${board.name}" will stay in Trash for 30 days.`
    );

    if (!confirmed) return;

    setIsBoardsLoading(true);

    try {
      const data = await readBoardResponse(
        await fetch(`/api/boards/${board.id}`, {
          method: "DELETE",
        })
      );

      setBoards(data.boards ?? []);
      setActiveBoardId(data.activeBoardId ?? "");

      if (data.board?.document) {
        applyBoardDocument(data.board.document);
      } else {
        applyBoardDocument({
          elements: [],
          canvasBackground: lightCanvasColor,
          customCanvasBackground: "#131619",
          gridMode: "none",
          gridOpacity: 24,
          calendarEntries: [],
        });
      }

      if (boardBrowserView !== "trash") {
        setBoardBrowserView("trash");
      }
    } catch (error) {
      setAuthMessage(
        error instanceof Error
          ? error.message
          : "Could not move this board to trash."
      );
    } finally {
      setIsBoardsLoading(false);
    }
  };

  const startRenamingBoard = (board: BoardSummary) => {
    setEditingBoardId(board.id);
    setEditingBoardName(board.name);
    window.setTimeout(() => {
      boardNameInputRef.current?.focus();
      boardNameInputRef.current?.select();
    }, 0);
  };

  const renameBoard = async (boardId: string) => {
    const nextName = editingBoardName.trim();

    if (!boardId) return;

    if (!nextName) {
      setEditingBoardId("");
      setEditingBoardName("");
      setAuthMessage("Enter a board name.");
      return;
    }

    setIsBoardsLoading(true);

    try {
      const data = await readBoardResponse(
        await fetch(`/api/boards/${boardId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nextName }),
        })
      );

      setBoards(data.boards ?? []);
      setActiveBoardId(data.activeBoardId ?? activeBoardId);
      setEditingBoardId("");
      setEditingBoardName("");
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Could not rename this board."
      );
    } finally {
      setIsBoardsLoading(false);
    }
  };

  const toggleBoardStarred = async (board: BoardSummary) => {
    if (board.deletedAt) return;

    setIsBoardsLoading(true);

    try {
      const data = await readBoardResponse(
        await fetch(`/api/boards/${board.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ starred: !board.starred }),
        })
      );

      setBoards(data.boards ?? []);
      setActiveBoardId(data.activeBoardId ?? activeBoardId);
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Could not update this star."
      );
    } finally {
      setIsBoardsLoading(false);
    }
  };

  const liveBoardsCount = boards.filter((board) => !board.deletedAt).length;
  const hasActivePaidSubscription =
    currentSubscriptionStatus === "trialing" ||
    currentSubscriptionStatus === "active" ||
    currentSubscriptionStatus === "past_due";
  const currentPlanLabel = hasActivePaidSubscription
    ? currentAccountPlan === "master"
      ? "Master"
      : currentAccountPlan === "pro"
      ? "Pro"
      : "Basic"
    : "No active plan";
  const currentPlanRank = hasActivePaidSubscription
    ? currentAccountPlan === "master"
      ? 3
      : currentAccountPlan === "pro"
      ? 2
      : 1
    : 0;
  const isBoardsBrowserVisible = showBoardsMenu;
  const isCalendarBrowserVisible =
    isBoardsBrowserVisible && boardBrowserView === "calendar";

  const getBoardTimestamp = (value: string) => {
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  };

  const visibleBoards = (() => {
    if (!isBoardsBrowserVisible) {
      return [] as BoardSummary[];
    }

    const searchQuery = boardSearchQuery.trim().toLowerCase();
    const baseBoards =
      boardBrowserView === "trash"
        ? boards.filter((board) => Boolean(board.deletedAt))
        : boards.filter((board) => !board.deletedAt);
    const matchingBoards = baseBoards.filter((board) =>
      board.name.toLowerCase().includes(searchQuery)
    );

    if (boardBrowserView === "recent") {
      return [...matchingBoards].sort(
        (first, second) =>
          getBoardTimestamp(second.updatedAt) - getBoardTimestamp(first.updatedAt)
      );
    }

    if (boardBrowserView === "starred") {
      return matchingBoards
        .filter((board) => Boolean(board.starred))
        .sort(
          (first, second) =>
            getBoardTimestamp(second.updatedAt) - getBoardTimestamp(first.updatedAt)
        );
    }

    if (boardBrowserView === "trash") {
      return [...matchingBoards].sort(
        (first, second) =>
          getBoardTimestamp(second.deletedAt ?? second.updatedAt) -
          getBoardTimestamp(first.deletedAt ?? first.updatedAt)
      );
    }

    return matchingBoards;
  })();

  const startPlanCheckout = async (targetPlan: "basic" | "pro" | "master") => {
    if (!currentAccountId || pendingBillingPlan) {
      return;
    }

    setPendingBillingPlan(targetPlan);
    setBillingMessage("");

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPlan }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        checkoutUrl?: string;
      };

      if (!response.ok) {
        setBillingMessageTone("error");
        setBillingMessage(
          data.error ?? "Could not start the billing flow for this plan."
        );
        return;
      }

      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }

      setBillingMessageTone("success");
      setBillingMessage(
        data.message ?? "Billing flow is ready for the next Stripe step."
      );
    } finally {
      setPendingBillingPlan("");
    }
  };

  const calendarSchedules = isCalendarBrowserVisible
    ? [...normalizeCalendarEntries(calendarEntries)]
        .filter((entry) =>
          entry.title.toLowerCase().includes(boardSearchQuery.trim().toLowerCase())
        )
        .sort(
          (first, second) =>
            first.date.localeCompare(second.date) ||
            first.startHour.localeCompare(second.startHour) ||
            first.endHour.localeCompare(second.endHour) ||
            first.title.localeCompare(second.title)
        )
    : [];

  const calendarMonthDate = new Date(
    calendarCursor.getFullYear(),
    calendarCursor.getMonth(),
    1
  );

  const calendarMonthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(calendarMonthDate);

  const calendarDayLabel = new Intl.DateTimeFormat("en", {
    weekday: "short",
  });

  const calendarWeekdayLabels = Array.from({ length: 7 }, (_, index) =>
    calendarDayLabel.format(new Date(Date.UTC(2026, 0, 4 + index)))
  );

  const getLocalCalendarDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayDate = new Date();
  const todayDateKey = getLocalCalendarDateKey(todayDate);

  const calendarDays = (() => {
    if (!isCalendarBrowserVisible) {
      return [] as Array<{
        key: string;
        date: Date;
        dayNumber: number;
        isCurrentMonth: boolean;
        isToday: boolean;
        entries: CalendarEntry[];
      }>;
    }

    const year = calendarMonthDate.getFullYear();
    const month = calendarMonthDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const firstWeekday = (firstDayOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    return Array.from({ length: totalCells }, (_, index) => {
      const relativeDayNumber = index - firstWeekday + 1;
      const date = new Date(year, month, relativeDayNumber);
      const isCurrentMonth = date.getMonth() === month;
      const dateKey = getLocalCalendarDateKey(date);
      const dayEntries = calendarSchedules.filter((entry) => entry.date === dateKey);

      return {
        key: `${year}-${month}-${index}`,
        date,
        dayNumber: date.getDate(),
        isCurrentMonth,
        isToday: dateKey === todayDateKey,
        entries: dayEntries,
      };
    });
  })();

  const createCalendarEntry = (date: string) => {
    const entryId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${date}-${Date.now()}`;

    setSelectedCalendarEntryId("");
    setEditingCalendarEntryId(entryId);
    setCalendarEntries((previousEntries) => [
      ...previousEntries,
      {
        id: entryId,
        date,
        startHour: "12:00",
        endHour: "12:30",
        title: "",
        color: calendarEntryColors[0],
      },
    ]);
  };

  const updateCalendarEntry = (entryId: string, title: string) => {
    setCalendarEntries((previousEntries) =>
      previousEntries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              title: title.slice(0, 160),
            }
          : entry
      )
    );
  };

  const removeCalendarEntry = (entryId: string) => {
    setEditingCalendarEntryId((previousId) =>
      previousId === entryId ? "" : previousId
    );
    setSelectedCalendarEntryId((previousId) =>
      previousId === entryId ? "" : previousId
    );
    setCalendarEntries((previousEntries) =>
      previousEntries.filter((entry) => entry.id !== entryId)
    );
  };

  const updateCalendarEntryHours = (
    entryId: string,
    field: "startHour" | "endHour",
    hour: string
  ) => {
    const normalizedHour = normalizeCalendarHourValue(hour, "12:00");

    setCalendarEntries((previousEntries) =>
      previousEntries.map((entry) =>
        entry.id === entryId
          ? (() => {
              const nextEntry: CalendarEntry = {
                ...entry,
                [field]: normalizedHour,
              };

              if (field === "startHour") {
                nextEntry.endHour = getNextCalendarHourValue(normalizedHour);
                return nextEntry;
              }

              if (nextEntry.startHour > nextEntry.endHour) {
                nextEntry.startHour = normalizedHour;
              }

              return nextEntry;
            })()
          : entry
      )
    );
  };

  const updateCalendarEntryColor = (entryId: string, color: string) => {
    const normalizedColor = normalizeCalendarEntryColor(color, entryId);

    setCalendarEntries((previousEntries) =>
      previousEntries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              color: normalizedColor,
            }
          : entry
      )
    );
  };

  const getCalendarHourLabel = (
    hour: string,
    format: "full" | "short" = "full"
  ) => {
    const option = calendarHourOptions.find((entry) => entry.value === hour);
    if (!option) return hour;
    return format === "short" ? option.shortLabel : option.label;
  };

  const getCalendarHourRangeLabel = (entry: CalendarEntry) =>
    `${getCalendarHourLabel(entry.startHour, "short")} - ${getCalendarHourLabel(
      entry.endHour,
      "short"
    )}`;

  const getCalendarEntryColor = (entry: CalendarEntry) =>
    normalizeCalendarEntryColor(entry.color, entry.id);

  const beginEditingCalendarEntry = (entryId: string) => {
    setSelectedCalendarEntryId(entryId);
    setEditingCalendarEntryId(entryId);
  };

  const lockCalendarEntry = (entryId: string) => {
    setEditingCalendarEntryId((previousId) =>
      previousId === entryId ? "" : previousId
    );
    setSelectedCalendarEntryId("");
  };

  const selectCalendarEntry = (entryId: string) => {
    setEditingCalendarEntryId("");
    setSelectedCalendarEntryId(entryId);
  };

  const goToCalendarMonth = (offset: number) => {
    setCalendarCursor(
      (previous) => new Date(previous.getFullYear(), previous.getMonth() + offset, 1)
    );
  };

  const jumpToCalendarToday = () => {
    const today = new Date();
    setCalendarCursor(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const scrollCalendarHorizontally = (direction: "left" | "right") => {
    const container = calendarScrollContainerRef.current;
    if (!container) return;

    const distance = Math.max(320, Math.round(container.clientWidth * 0.6));
    container.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
  };

  const syncCalendarScrollFromMain = () => {
    if (activeCalendarScrollSyncRef.current === "bottom") return;

    const main = calendarScrollContainerRef.current;
    const bottom = calendarBottomScrollbarRef.current;
    if (!main || !bottom) return;

    activeCalendarScrollSyncRef.current = "main";
    bottom.scrollLeft = main.scrollLeft;
    window.requestAnimationFrame(() => {
      if (activeCalendarScrollSyncRef.current === "main") {
        activeCalendarScrollSyncRef.current = null;
      }
    });
  };

  const syncCalendarScrollFromBottom = () => {
    if (activeCalendarScrollSyncRef.current === "main") return;

    const main = calendarScrollContainerRef.current;
    const bottom = calendarBottomScrollbarRef.current;
    if (!main || !bottom) return;

    activeCalendarScrollSyncRef.current = "bottom";
    main.scrollLeft = bottom.scrollLeft;
    window.requestAnimationFrame(() => {
      if (activeCalendarScrollSyncRef.current === "bottom") {
        activeCalendarScrollSyncRef.current = null;
      }
    });
  };

  const boardBrowserHeading =
    boardBrowserView === "recent"
      ? "Recent boards"
      : boardBrowserView === "mine"
      ? "My boards"
      : boardBrowserView === "starred"
      ? "Starred boards"
      : boardBrowserView === "trash"
      ? "Trash"
      : boardBrowserView === "calendar"
      ? "Calendar"
      : boardBrowserView === "plan"
      ? "Your plan"
      : "All boards";

  const boardBrowserDescription =
    boardBrowserView === "recent"
      ? "Your most recently updated boards appear first."
      : boardBrowserView === "mine"
      ? "Boards connected to your account."
      : boardBrowserView === "starred"
      ? "Keep important boards close."
      : boardBrowserView === "trash"
      ? "Deleted boards stay here for 30 days before disappearing."
      : boardBrowserView === "calendar"
      ? "Type meetings, schedules, and reminders directly into each day."
      : boardBrowserView === "plan"
      ? "Choose the workspace plan that fits how you build, organize, and schedule."
      : "Open, rename, and create boards from one clean workspace.";

  const formatBoardDate = (value: string) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Recently updated";
    }

    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  const getBoardPreviewBackground = (board: BoardSummary) => {
    const previewBackground = board.previewDocument.canvasBackground;

    if (previewBackground === floralCanvasBackground) {
      return "#f8fafc";
    }

    if (previewBackground === board.previewDocument.customCanvasBackground) {
      return board.previewDocument.customCanvasBackground;
    }

    return previewBackground;
  };

  const getBoardPreviewBounds = (elementsToPreview: CanvasElement[]) => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const includePoint = (x: number, y: number, padding = 0) => {
      minX = Math.min(minX, x - padding);
      minY = Math.min(minY, y - padding);
      maxX = Math.max(maxX, x + padding);
      maxY = Math.max(maxY, y + padding);
    };

    elementsToPreview.forEach((element) => {
      if (element.kind === "stroke") {
        element.points.forEach((point) =>
          includePoint(point.x, point.y, element.width * 0.75)
        );
        return;
      }

      if (element.kind === "shape") {
        includePoint(element.start.x, element.start.y, element.width);
        includePoint(element.end.x, element.end.y, element.width);
        return;
      }

      includePoint(element.point.x, element.point.y, 2);
      includePoint(
        element.point.x + element.width,
        element.point.y + element.height,
        2
      );
    });

    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    ) {
      return null;
    }

    return {
      minX,
      minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  };

  const renderBoardPreviewContent = (board: BoardSummary) => {
    const previewWidth = 320;
    const previewHeight = 160;
    const previewPadding = 18;
    const previewElements = board.previewDocument.elements.slice(-18);
    const previewBounds = getBoardPreviewBounds(previewElements);

    if (!previewBounds || previewElements.length === 0) {
      return (
        <div
          style={{
            position: "absolute",
            inset: "14px",
            borderRadius: "12px",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.58) 100%)",
            border: "1px solid rgba(255,255,255,0.72)",
          }}
        />
      );
    }

    const scale = Math.min(
      (previewWidth - previewPadding * 2) / previewBounds.width,
      (previewHeight - previewPadding * 2) / previewBounds.height
    );
    const offsetX =
      (previewWidth - previewBounds.width * scale) / 2 -
      previewBounds.minX * scale;
    const offsetY =
      (previewHeight - previewBounds.height * scale) / 2 -
      previewBounds.minY * scale;

    const getStrokeDashArray = (style?: StrokeStyle) =>
      style === "dashed" ? "10 8" : style === "dotted" ? "2 6" : undefined;

    const renderShapePreview = (element: Shape, index: number) => {
      const x = Math.min(element.start.x, element.end.x);
      const y = Math.min(element.start.y, element.end.y);
      const width = Math.abs(element.end.x - element.start.x);
      const height = Math.abs(element.end.y - element.start.y);
      const dashArray = getStrokeDashArray(element.style);

      if (element.tool === "circle") {
        return (
          <ellipse
            key={index}
            cx={x + width / 2}
            cy={y + height / 2}
            rx={Math.max(width / 2, 1)}
            ry={Math.max(height / 2, 1)}
            fill="none"
            stroke={element.color}
            strokeWidth={element.width}
            strokeDasharray={dashArray}
          />
        );
      }

      if (element.tool === "square") {
        return (
          <rect
            key={index}
            x={x}
            y={y}
            width={Math.max(width, 1)}
            height={Math.max(height, 1)}
            rx={10}
            fill="none"
            stroke={element.color}
            strokeWidth={element.width}
            strokeDasharray={dashArray}
          />
        );
      }

      if (element.tool === "arrow") {
        const angle = Math.atan2(
          element.end.y - element.start.y,
          element.end.x - element.start.x
        );
        const arrowSize = Math.max(14, element.width * 3.5);
        const leftX =
          element.end.x - arrowSize * Math.cos(angle - Math.PI / 6);
        const leftY =
          element.end.y - arrowSize * Math.sin(angle - Math.PI / 6);
        const rightX =
          element.end.x - arrowSize * Math.cos(angle + Math.PI / 6);
        const rightY =
          element.end.y - arrowSize * Math.sin(angle + Math.PI / 6);

        return (
          <g key={index}>
            <line
              x1={element.start.x}
              y1={element.start.y}
              x2={element.end.x}
              y2={element.end.y}
              stroke={element.color}
              strokeWidth={element.width}
              strokeDasharray={dashArray}
              strokeLinecap="round"
            />
            <path
              d={`M ${leftX} ${leftY} L ${element.end.x} ${element.end.y} L ${rightX} ${rightY}`}
              fill="none"
              stroke={element.color}
              strokeWidth={element.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );
      }

      return (
        <line
          key={index}
          x1={element.start.x}
          y1={element.start.y}
          x2={element.end.x}
          y2={element.end.y}
          stroke={element.color}
          strokeWidth={element.width}
          strokeDasharray={dashArray}
          strokeLinecap="round"
        />
      );
    };

    return (
      <>
        <div
          style={{
            position: "absolute",
            inset: "14px",
            borderRadius: "12px",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 100%)",
            border: "1px solid rgba(255,255,255,0.42)",
          }}
        />
        <svg
          viewBox={`0 0 ${previewWidth} ${previewHeight}`}
          style={{
            position: "absolute",
            inset: "14px",
            width: "calc(100% - 28px)",
            height: "calc(100% - 28px)",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <rect
            x={0}
            y={0}
            width={previewWidth}
            height={previewHeight}
            fill={getBoardPreviewBackground(board)}
          />
          <g transform={`translate(${offsetX} ${offsetY}) scale(${scale})`}>
            {previewElements.map((element, index) => {
              if (element.kind === "stroke") {
                return (
                  <polyline
                    key={index}
                    points={element.points.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke={element.color ?? "#111827"}
                    strokeWidth={element.width}
                    strokeDasharray={getStrokeDashArray(element.style)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              }

              if (element.kind === "shape") {
                return renderShapePreview(element, index);
              }

              return (
                <g key={index}>
                  {element.backgroundColor && (
                    <rect
                      x={element.point.x}
                      y={element.point.y}
                      width={Math.max(element.width, 24)}
                      height={Math.max(element.height, 20)}
                      rx={10}
                      fill={element.backgroundColor}
                    />
                  )}
                  <text
                    x={element.point.x}
                    y={element.point.y + Math.max(element.fontSize, 16)}
                    fill={element.color}
                    fontFamily={appSansFontFamily}
                    fontSize={Math.max(14, element.fontSize)}
                    fontWeight={element.fontWeight}
                  >
                    {(element.value || "").slice(0, 22)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </>
    );
  };

  const loadBoardsEffect = useEffectEvent(() => {
    loadBoards().catch(() => null);
  });

  const persistBoardEffect = useEffectEvent((boardId: string) => {
    persistBoard(boardId).catch(() => null);
  });

  const applyTextBoxOpacity = (opacity: number) => {
    setActiveText((prev) =>
      prev?.backgroundColor
        ? {
            ...prev,
            backgroundColor: getTextBoxBackgroundWithOpacity(opacity),
          }
        : prev
    );
    window.setTimeout(() => textInputRef.current?.focus(), 0);
  };

  const applyTextSize = (fontSize: number) => {
    if (!Number.isFinite(fontSize)) return;

    const nextFontSize = clampTextFontSize(fontSize);
    setActiveText((prev) => {
      if (!prev) return prev;

      const nextRuns = compactTextRuns(
        prev.runs.map((run) => ({
          ...run,
          fontSize: nextFontSize,
        }))
      );
      const nextSize = getTextRunsEditorSize(nextRuns, nextFontSize);

      return {
        ...prev,
        fontSize: nextFontSize,
        typingFontSize: nextFontSize,
        runs: nextRuns,
        ...keepTextBoxInViewport(
          prev.screenPoint,
          Math.max(prev.width, nextSize.width),
          Math.max(prev.height, nextSize.height)
        ),
      };
    });
  };

  const runsHaveSameStyle = (first: TextRun, second: TextRun) =>
    first.color === second.color &&
    first.fontFamily === second.fontFamily &&
    first.fontWeight === second.fontWeight &&
    first.fontSize === second.fontSize &&
    first.fontStyle === second.fontStyle &&
    first.underline === second.underline;

  const compactTextRuns = (runs: TextRun[]) =>
    runs.reduce<TextRun[]>((nextRuns, run) => {
      if (!run.text) return nextRuns;

      const previousRun = nextRuns[nextRuns.length - 1];
      if (previousRun && runsHaveSameStyle(previousRun, run)) {
        nextRuns[nextRuns.length - 1] = {
          ...previousRun,
          text: previousRun.text + run.text,
        };
        return nextRuns;
      }

      nextRuns.push(run);
      return nextRuns;
    }, []);

  const sliceTextRuns = (runs: TextRun[], start: number, end: number) => {
    const nextRuns: TextRun[] = [];
    let position = 0;

    for (const run of runs) {
      const runStart = position;
      const runEnd = position + run.text.length;
      const sliceStart = Math.max(start, runStart);
      const sliceEnd = Math.min(end, runEnd);

      if (sliceStart < sliceEnd) {
        nextRuns.push({
          ...run,
          text: run.text.slice(sliceStart - runStart, sliceEnd - runStart),
        });
      }

      position = runEnd;
      if (position >= end) break;
    }

    return nextRuns;
  };

  const updateTextRuns = (
    previousValue: string,
    nextValue: string,
    runs: TextRun[],
    nextColor: string,
    nextFontFamily: string,
    nextFontWeight: number,
    nextFontSize: number,
    nextFontStyle: "normal" | "italic",
    nextUnderline: boolean
  ) => {
    const normalizedFontSize = clampTextFontSize(nextFontSize);

    if (nextValue === previousValue) return runs;

    let prefixLength = 0;
    while (
      prefixLength < previousValue.length &&
      prefixLength < nextValue.length &&
      previousValue[prefixLength] === nextValue[prefixLength]
    ) {
      prefixLength += 1;
    }

    let suffixLength = 0;
    while (
      suffixLength < previousValue.length - prefixLength &&
      suffixLength < nextValue.length - prefixLength &&
      previousValue[previousValue.length - 1 - suffixLength] ===
        nextValue[nextValue.length - 1 - suffixLength]
    ) {
      suffixLength += 1;
    }

    const insertedText = nextValue.slice(
      prefixLength,
      nextValue.length - suffixLength
    );
    const beforeRuns = sliceTextRuns(runs, 0, prefixLength);
    const afterRuns = sliceTextRuns(
      runs,
      previousValue.length - suffixLength,
      previousValue.length
    );
    const insertedRuns = insertedText
      ? [
          {
            text: insertedText,
            color: nextColor,
            fontFamily: nextFontFamily,
            fontWeight: nextFontWeight,
            fontSize: normalizedFontSize,
            fontStyle: nextFontStyle,
            underline: nextUnderline,
          },
        ]
      : [];

    return compactTextRuns([...beforeRuns, ...insertedRuns, ...afterRuns]);
  };

  const keepTextInputAligned = (target: HTMLTextAreaElement | null) => {
    if (!target) return;

    target.scrollLeft = 0;
    target.scrollTop = 0;
  };

  const syncTextSelection = (target: HTMLTextAreaElement | null) => {
    if (!target) return;

    setTextSelection({
      start: target.selectionStart ?? target.value.length,
      end: target.selectionEnd ?? target.selectionStart ?? target.value.length,
    });
  };

  const getTextRunsEditorSize = (runs: TextRun[], fontSize: number) => {
    const measuringCanvas = document.createElement("canvas");
    const measuringContext = measuringCanvas.getContext("2d");
    let currentLineWidth = 0;
    let longestLineWidth = 0;
    let currentLineHeight = fontSize * textLineHeight;
    let totalHeight = 0;

    for (const run of runs) {
      const runFontSize = clampTextFontSize(run.fontSize, fontSize);
      const runLineHeight = runFontSize * textLineHeight;
      currentLineHeight = Math.max(currentLineHeight, runLineHeight);

      if (measuringContext) {
        measuringContext.font = `${run.fontStyle} ${run.fontWeight} ${runFontSize}px ${getCanvasFontFamily(run.fontFamily)}`;
      }

      for (const character of run.text) {
        if (character === "\n") {
          longestLineWidth = Math.max(longestLineWidth, currentLineWidth);
          totalHeight += currentLineHeight;
          currentLineWidth = 0;
          currentLineHeight = fontSize * textLineHeight;
          continue;
        }

        currentLineWidth += measuringContext
          ? measuringContext.measureText(character).width
          : 0;
      }
    }

    longestLineWidth = Math.max(longestLineWidth, currentLineWidth);
    totalHeight += currentLineHeight;

    return {
      width: Math.max(48, Math.ceil(longestLineWidth) + textPaddingX * 2 + 28),
      height: Math.max(30, Math.ceil(totalHeight) + textPaddingY * 2),
    };
  };

  const getTextRunsContentHeight = (
    runs: readonly TextRun[],
    fallbackFontSize: number
  ) => {
    let currentLineHeight = fallbackFontSize * textLineHeight;
    let totalHeight = 0;

    for (const run of runs) {
      const runLineHeight =
        clampTextFontSize(run.fontSize, fallbackFontSize) * textLineHeight;
      currentLineHeight = Math.max(currentLineHeight, runLineHeight);

      for (const character of run.text) {
        if (character === "\n") {
          totalHeight += currentLineHeight;
          currentLineHeight = fallbackFontSize * textLineHeight;
        }
      }
    }

    return totalHeight + currentLineHeight;
  };

  const drawTextElement = (
    ctx: CanvasRenderingContext2D,
    text: TextElement
  ) => {
    const baseFontSize = clampTextFontSize(
      getTextLengthInCanvas(text, text.fontSize),
      text.fontSize
    );
    const textWidth = getTextLengthInCanvas(text, text.width);
    const textHeight = getTextLengthInCanvas(text, text.height);

    ctx.save();
    if (text.backgroundColor) {
      ctx.fillStyle = text.backgroundColor;
      ctx.fillRect(text.point.x, text.point.y, textWidth, textHeight);
    }

    ctx.beginPath();
    ctx.rect(text.point.x, text.point.y, textWidth, textHeight);
    ctx.clip();
    ctx.font = `${text.fontStyle ?? "normal"} ${getTextFontWeight(text)} ${baseFontSize}px ${getCanvasFontFamily(text.fontFamily)}`;
    ctx.textBaseline = "top";
    ctx.setLineDash([]);

    const lines: Array<Array<TextRun & { canvasFontSize: number }>> = [[]];

    for (const run of getTextRuns(text)) {
      const parts = run.text.split("\n");
      const canvasFontSize = clampTextFontSize(
        getTextLengthInCanvas(text, run.fontSize),
        baseFontSize
      );

      parts.forEach((part, index) => {
        if (index > 0) {
          lines.push([]);
        }

        if (part) {
          lines[lines.length - 1].push({ ...run, text: part, canvasFontSize });
        }
      });
    }

    const lineHeights = lines.map((line) =>
      Math.max(
        baseFontSize * textLineHeight,
        ...line.map((run) => run.canvasFontSize * textLineHeight)
      )
    );
    const lineWidths = lines.map((line) =>
      line.reduce((width, run) => {
        ctx.font = `${run.fontStyle} ${run.fontWeight} ${run.canvasFontSize}px ${getCanvasFontFamily(run.fontFamily)}`;
        return width + ctx.measureText(run.text).width;
      }, 0)
    );
    const textAlign = text.textAlign ?? (text.backgroundColor ? "center" : "left");
    const getAlignedLineX = (lineWidth: number) => {
      if (textAlign === "center") {
        return text.point.x + Math.max(0, (textWidth - lineWidth) / 2);
      }

      if (textAlign === "right") {
        return text.point.x + Math.max(textPaddingX, textWidth - lineWidth - textPaddingX);
      }

      return text.point.x + textPaddingX;
    };

    if (text.backgroundColor) {
      const totalLineHeight = lineHeights.reduce((sum, height) => sum + height, 0);
      let currentY =
        text.point.y + Math.max(0, (textHeight - totalLineHeight) / 2);

      lines.forEach((line, lineIndex) => {
        let currentX = getAlignedLineX(lineWidths[lineIndex]);

        line.forEach((run) => {
          const textWidth = (() => {
            ctx.font = `${run.fontStyle} ${run.fontWeight} ${run.canvasFontSize}px ${getCanvasFontFamily(run.fontFamily)}`;
            return ctx.measureText(run.text).width;
          })();

          ctx.fillStyle = run.color;
          ctx.font = `${run.fontStyle} ${run.fontWeight} ${run.canvasFontSize}px ${getCanvasFontFamily(run.fontFamily)}`;
          ctx.fillText(run.text, currentX, currentY);
          if (run.underline) {
            ctx.save();
            ctx.strokeStyle = run.color;
            ctx.lineWidth = Math.max(1, run.canvasFontSize / 14);
            ctx.beginPath();
            ctx.moveTo(currentX, currentY + run.canvasFontSize * 0.96);
            ctx.lineTo(currentX + textWidth, currentY + run.canvasFontSize * 0.96);
            ctx.stroke();
            ctx.restore();
          }
          currentX += textWidth;
        });

        currentY += lineHeights[lineIndex];
      });

      ctx.restore();
      return;
    }

    let currentY = text.point.y + textPaddingY;

    lines.forEach((line, lineIndex) => {
      let currentX = getAlignedLineX(lineWidths[lineIndex]);

      line.forEach((run) => {
        const textWidth = (() => {
          ctx.font = `${run.fontStyle} ${run.fontWeight} ${run.canvasFontSize}px ${getCanvasFontFamily(run.fontFamily)}`;
          return ctx.measureText(run.text).width;
        })();

        ctx.fillStyle = run.color;
        ctx.font = `${run.fontStyle} ${run.fontWeight} ${run.canvasFontSize}px ${getCanvasFontFamily(run.fontFamily)}`;
        ctx.fillText(run.text, currentX, currentY);
        if (run.underline) {
          ctx.save();
          ctx.strokeStyle = run.color;
          ctx.lineWidth = Math.max(1, run.canvasFontSize / 14);
          ctx.beginPath();
          ctx.moveTo(currentX, currentY + run.canvasFontSize * 0.96);
          ctx.lineTo(currentX + textWidth, currentY + run.canvasFontSize * 0.96);
          ctx.stroke();
          ctx.restore();
        }
        currentX += textWidth;
      });

      currentY += lineHeights[lineIndex];
    });

    ctx.restore();
  };

  const getTextCanvasPoint = (screenPoint: Point) => ({
    x: (screenPoint.x - offsetRef.current.x) / zoomRef.current,
    y: (screenPoint.y - topBarHeight - offsetRef.current.y) / zoomRef.current,
  });

  const screenLengthToCanvas = (value: number, zoomValue = zoomRef.current) =>
    value / zoomValue;
  const canvasLengthToScreen = (value: number, zoomValue = zoomRef.current) =>
    value * zoomValue;

  const getTextMeasurementZoom = (text: TextElement) =>
    text.measurementZoom && text.measurementZoom > 0
      ? text.measurementZoom
      : 1;

  const getTextLengthInCanvas = (text: TextElement, value: number) =>
    text.measurementSpace === "screen"
      ? screenLengthToCanvas(value, getTextMeasurementZoom(text))
      : value;

  const getTextLengthInScreen = (text: TextElement, value: number) =>
    text.measurementSpace === "screen"
      ? canvasLengthToScreen(
          screenLengthToCanvas(value, getTextMeasurementZoom(text))
        )
      : canvasLengthToScreen(value);

  const getScreenTextRuns = (text: TextElement) =>
    getTextRuns(text).map((run) => ({
      ...run,
      fontSize:
        text.measurementSpace === "screen"
          ? clampTextFontSize(
              canvasLengthToScreen(
                screenLengthToCanvas(run.fontSize, getTextMeasurementZoom(text))
              ),
              run.fontSize
            )
          : clampTextFontSize(canvasLengthToScreen(run.fontSize), run.fontSize),
    }));

  const keepTextBoxInViewport = (
    screenPoint: Point,
    width: number,
    height: number
  ) => {
    const margin = 8;
    const maxWidth = Math.max(48, window.innerWidth - margin * 2);
    const maxHeight = Math.max(30, window.innerHeight - topBarHeight - margin * 2);
    const nextWidth = Math.min(width, maxWidth);
    const nextHeight = Math.min(height, maxHeight);
    const minY = topBarHeight + margin;
    const maxX = Math.max(margin, window.innerWidth - nextWidth - margin);
    const maxY = Math.max(minY, window.innerHeight - nextHeight - margin);
    const nextScreenPoint = {
      x: Math.min(Math.max(screenPoint.x, margin), maxX),
      y: Math.min(Math.max(screenPoint.y, minY), maxY),
    };

    return {
      screenPoint: nextScreenPoint,
      point: getTextCanvasPoint(nextScreenPoint),
      width: nextWidth,
      height: nextHeight,
    };
  };
  useEffect(() => {
    keepTextBoxInViewportRef.current = keepTextBoxInViewport;
  });

  const getTextBounds = (text: TextElement): Bounds => ({
    x: text.point.x,
    y: text.point.y,
    width: getTextLengthInCanvas(text, text.width),
    height: getTextLengthInCanvas(text, text.height),
  });

  const getStrokeDashPattern = (style: StrokeStyle | undefined, width: number) => {
    if (style === "dashed") {
      return [Math.max(8, width * 1.5), Math.max(6, width * 1.1)];
    }

    if (style === "dotted") {
      return [0, Math.max(10, width * 2.2)];
    }

    return [];
  };

  const getStrokeLineCap = (style: StrokeStyle | undefined) =>
    style === "dashed" ? "butt" : "round";

  const drawStrokePath = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    width: number,
    style?: StrokeStyle
  ) => {
    if (!points.length) return;

    ctx.lineCap = getStrokeLineCap(style);
    ctx.lineJoin = "round";
    ctx.lineWidth = width;
    ctx.setLineDash(getStrokeDashPattern(style, width));

    if (points.length === 1) {
      const point = points[0];
      ctx.beginPath();
      ctx.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
      return;
    }

    const tension = 0.18;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] ?? points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? p2;

      ctx.bezierCurveTo(
        p1.x + (p2.x - p0.x) * tension,
        p1.y + (p2.y - p0.y) * tension,
        p2.x - (p3.x - p1.x) * tension,
        p2.y - (p3.y - p1.y) * tension,
        p2.x,
        p2.y
      );
    }

    ctx.stroke();
  };

  const drawLivePenStrokeSegment = () => {
    const stroke = currentStroke.current;
    if (!stroke || stroke.tool !== "pen" || stroke.points.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderedPointCount = renderedLiveStrokePointCountRef.current;
    const segmentStartIndex = Math.max(0, renderedPointCount - 3);
    const segmentPoints = stroke.points.slice(segmentStartIndex);
    if (!segmentPoints.length) return;

    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(offsetRef.current.x, offsetRef.current.y);
    ctx.scale(zoomRef.current, zoomRef.current);
    ctx.strokeStyle = stroke.color ?? "black";
    ctx.fillStyle = stroke.color ?? "black";
    drawStrokePath(ctx, segmentPoints, stroke.width, stroke.style);
    ctx.restore();

    renderedLiveStrokePointCountRef.current = stroke.points.length;
  };

  const drawShape = (
    ctx: CanvasRenderingContext2D,
    shape: ShapeTool,
    startX: number,
    startY: number,
    currentX: number,
    currentY: number,
    width = penWidth,
    color = penColor,
    style = strokeStyle
  ) => {
    const shapeWidth = currentX - startX;
    const height = currentY - startY;

    ctx.beginPath();
    ctx.lineCap = getStrokeLineCap(style);
    ctx.lineJoin = "round";
    ctx.setLineDash(getStrokeDashPattern(style, width));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;

    if (shape === "square") {
      ctx.strokeRect(startX, startY, shapeWidth, height);
      return;
    }

    if (shape === "circle") {
      const radius = Math.sqrt(shapeWidth * shapeWidth + height * height);
      ctx.arc(startX, startY, radius, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    if (shape === "arrow") {
      const angle = Math.atan2(height, shapeWidth);
      const headLength = Math.max(18, width * 4);

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

    if (shape === "line") {
      ctx.moveTo(startX, startY);
      ctx.lineTo(currentX, currentY);
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

  const getDistanceToSegment = (point: Point, start: Point, end: Point) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return Math.hypot(point.x - start.x, point.y - start.y);
    }

    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
      )
    );
    const projection = {
      x: start.x + t * dx,
      y: start.y + t * dy,
    };

    return Math.hypot(point.x - projection.x, point.y - projection.y);
  };

  const getOrientation = (a: Point, b: Point, c: Point) =>
    (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);

  const areSegmentsIntersecting = (
    firstStart: Point,
    firstEnd: Point,
    secondStart: Point,
    secondEnd: Point
  ) => {
    const firstOrientation = getOrientation(firstStart, firstEnd, secondStart);
    const secondOrientation = getOrientation(firstStart, firstEnd, secondEnd);
    const thirdOrientation = getOrientation(secondStart, secondEnd, firstStart);
    const fourthOrientation = getOrientation(secondStart, secondEnd, firstEnd);

    return (
      firstOrientation * secondOrientation < 0 &&
      thirdOrientation * fourthOrientation < 0
    );
  };

  const getSegmentDistance = (
    firstStart: Point,
    firstEnd: Point,
    secondStart: Point,
    secondEnd: Point
  ) => {
    if (areSegmentsIntersecting(firstStart, firstEnd, secondStart, secondEnd)) {
      return 0;
    }

    return Math.min(
      getDistanceToSegment(firstStart, secondStart, secondEnd),
      getDistanceToSegment(firstEnd, secondStart, secondEnd),
      getDistanceToSegment(secondStart, firstStart, firstEnd),
      getDistanceToSegment(secondEnd, firstStart, firstEnd)
    );
  };

  const isPointHitByEraser = (point: Point, eraser: Stroke, radius: number) => {
    if (!eraser.points.length) return false;

    if (eraser.points.length === 1) {
      return Math.hypot(point.x - eraser.points[0].x, point.y - eraser.points[0].y) <= radius;
    }

    for (let index = 1; index < eraser.points.length; index += 1) {
      if (
        getDistanceToSegment(
          point,
          eraser.points[index - 1],
          eraser.points[index]
        ) <= radius
      ) {
        return true;
      }
    }

    return false;
  };

  const isSegmentHitByEraser = (
    start: Point,
    end: Point,
    eraser: Stroke,
    radius: number
  ) => {
    if (!eraser.points.length) return false;

    if (eraser.points.length === 1) {
      return getDistanceToSegment(eraser.points[0], start, end) <= radius;
    }

    for (let index = 1; index < eraser.points.length; index += 1) {
      if (
        getSegmentDistance(
          start,
          end,
          eraser.points[index - 1],
          eraser.points[index]
        ) <= radius
      ) {
        return true;
      }
    }

    return false;
  };

  const erasePenStroke = (stroke: Stroke, eraser: Stroke) => {
    const erasedSegments: Stroke[] = [];
    let currentSegment: Point[] = [];
    const hitRadius = eraser.width / 2 + stroke.width / 2;

    const finishSegment = () => {
      if (!currentSegment.length) return;

      erasedSegments.push({
        ...stroke,
        points: currentSegment,
      });
      currentSegment = [];
    };

    for (let index = 0; index < stroke.points.length; index += 1) {
      const point = stroke.points[index];
      const previousPoint = stroke.points[index - 1];
      const pointWasErased = isPointHitByEraser(point, eraser, hitRadius);
      const segmentWasErased =
        previousPoint &&
        isSegmentHitByEraser(previousPoint, point, eraser, hitRadius);

      if (pointWasErased || segmentWasErased) {
        finishSegment();

        if (!pointWasErased && segmentWasErased) {
          currentSegment = [point];
        }

        continue;
      }

      currentSegment.push(point);
    }

    finishSegment();
    return erasedSegments;
  };

  const eraseElements = (targetElements: CanvasElement[], eraser: Stroke) =>
    targetElements.flatMap((element) => {
      if (element.kind !== "stroke" || element.tool !== "pen") {
        return [element];
      }

      return erasePenStroke(element, eraser);
    });

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

  const isFloralCanvas = canvasBackground === floralCanvasBackground;
  const canvasFillColor = isFloralCanvas ? lightCanvasColor : canvasBackground;
  const canvasCssBackground = canvasFillColor;

  const drawCanvasBackground = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    ctx.fillStyle = canvasFillColor;
    ctx.fillRect(0, 0, width, height);

    const floralImage = floralBackgroundRef.current;
    if (isFloralCanvas && floralImage?.complete) {
      const { width: tileWidth, height: tileHeight } = floralBackgroundTile;
      const floralVisibleLeft = -offset.x / zoom;
      const floralVisibleTop = -offset.y / zoom;
      const floralVisibleRight = (width - offset.x) / zoom;
      const floralVisibleBottom = (height - offset.y) / zoom;
      const floralStartX =
        Math.floor(floralVisibleLeft / tileWidth) * tileWidth;
      const floralStartY =
        Math.floor(floralVisibleTop / tileHeight) * tileHeight;

      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);

      for (let x = floralStartX; x < floralVisibleRight; x += tileWidth) {
        for (let y = floralStartY; y < floralVisibleBottom; y += tileHeight) {
          ctx.drawImage(floralImage, x, y, tileWidth, tileHeight);
        }
      }

      ctx.restore();
    }

    if (gridMode === "none" || gridOpacity <= 0) return;

    const gridSpacing =
      gridMode === "small" ? 24 : gridMode === "large" ? 72 : 40;
    const gridVisibleLeft = -offset.x / zoom;
    const gridVisibleTop = -offset.y / zoom;
    const gridVisibleRight = (width - offset.x) / zoom;
    const gridVisibleBottom = (height - offset.y) / zoom;
    const gridStartX = Math.floor(gridVisibleLeft / gridSpacing) * gridSpacing;
    const gridStartY = Math.floor(gridVisibleTop / gridSpacing) * gridSpacing;
    const shouldUseLightGrid =
      canvasBackground === darkCanvasColor || canvasBackground === greyCanvasColor;
    const gridColor =
      shouldUseLightGrid
        ? `rgba(255,255,255,${(gridOpacity / 100).toFixed(2)})`
        : `rgba(15,23,42,${(gridOpacity / 100).toFixed(2)})`;

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);
    ctx.beginPath();
    ctx.lineWidth = 1 / zoom;
    ctx.strokeStyle = gridColor;

    for (let x = gridStartX; x <= gridVisibleRight; x += gridSpacing) {
      ctx.moveTo(x, gridVisibleTop);
      ctx.lineTo(x, gridVisibleBottom);
    }

    for (let y = gridStartY; y <= gridVisibleBottom; y += gridSpacing) {
      ctx.moveTo(gridVisibleLeft, y);
      ctx.lineTo(gridVisibleRight, y);
    }

    ctx.stroke();
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

    drawCanvasBackground(ctx, cssWidth, cssHeight);

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    for (const [index, element] of elements.entries()) {
      if (activeText?.editingIndex === index) {
        continue;
      }

      if (element.kind === "shape") {
        drawShape(
          ctx,
          element.tool,
          element.start.x,
          element.start.y,
          element.end.x,
          element.end.y,
          element.width,
          element.color,
          element.style
        );
        continue;
      }

      if (element.kind === "text") {
        drawTextElement(ctx, element);
        continue;
      }

      ctx.strokeStyle =
        element.tool === "pen" ? element.color ?? "black" : canvasFillColor;
      ctx.fillStyle =
        element.tool === "pen" ? element.color ?? "black" : canvasFillColor;
      drawStrokePath(ctx, element.points, element.width, element.style);
    }

    if (currentStroke.current && currentStroke.current.points.length > 0) {
      const stroke = currentStroke.current;

      ctx.strokeStyle =
        stroke.tool === "pen" ? stroke.color ?? "black" : canvasFillColor;
      ctx.fillStyle =
        stroke.tool === "pen" ? stroke.color ?? "black" : canvasFillColor;
      drawStrokePath(ctx, stroke.points, stroke.width, stroke.style);
    }

    if (selectionBox) {
      drawSelectedStrokeHighlights(ctx, selectionBox);
      drawSelectionBox(ctx, selectionBox);
    }

    ctx.restore();
  };
  useEffect(() => {
    latestRedrawCanvasRef.current = redrawCanvas;
  });

  const scheduleRedrawCanvas = () => {
    if (pendingRedrawFrame.current !== null) return;

    pendingRedrawFrame.current = window.requestAnimationFrame(() => {
      pendingRedrawFrame.current = null;
      latestRedrawCanvasRef.current();
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let resizeFrame: number | null = null;

    const resizeCanvas = () => {
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }

      resizeFrame = window.requestAnimationFrame(() => {
        const dpr = window.devicePixelRatio || 1;
        const cssWidth = window.innerWidth;
        const cssHeight = window.innerHeight - topBarHeight;

        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        latestRedrawCanvasRef.current();
      });
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }

      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  useEffect(
    () => () => {
      if (pendingRedrawFrame.current !== null) {
        window.cancelAnimationFrame(pendingRedrawFrame.current);
      }

      if (pendingPenCursorFrame.current !== null) {
        window.cancelAnimationFrame(pendingPenCursorFrame.current);
      }

      if (autosaveBoardTimeoutRef.current !== null) {
        window.clearTimeout(autosaveBoardTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    loadCurrentAccount();
  }, []);

  const isPositiveAuthMessage =
    typeof authMessage === "string" &&
    /check your email|account created|verified|utworzone|sent/i.test(
      authMessage
    ) &&
    !/could not|incorrect|enter |match|failed|wait |not found|error/i.test(
      authMessage
    );

  useEffect(() => {
    if (!currentAccountId) return;
    loadBoardsEffect();
  }, [currentAccountId]);

  useEffect(() => {
    if (!isCalendarBrowserVisible) return;

    const latestEntry = [...calendarEntries]
      .filter((entry) => typeof entry.date === "string" && entry.date.length > 0)
      .sort((first, second) => second.date.localeCompare(first.date))[0];

    if (!latestEntry) return;

    const latestDate = new Date(latestEntry.date);
    if (Number.isNaN(latestDate.getTime())) return;

    setCalendarCursor((previous) =>
      previous.getFullYear() === latestDate.getFullYear() &&
      previous.getMonth() === latestDate.getMonth()
        ? previous
        : new Date(latestDate.getFullYear(), latestDate.getMonth(), 1)
    );
  }, [calendarEntries, isCalendarBrowserVisible]);

  useEffect(() => {
    if (!isCalendarBrowserVisible) return;

    syncCalendarScrollFromMain();
  }, [calendarMonthLabel, calendarDays.length, isCalendarBrowserVisible]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-calendar-entry-shell='true']")) return;

      setSelectedCalendarEntryId("");
      setEditingCalendarEntryId("");
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!showBoardsMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      const target = event.target;
      if (!(target instanceof Node)) return;

      if (boardsMenuContainerRef.current?.contains(target)) {
        return;
      }

      setShowBoardsMenu(false);
      setEditingBoardId("");
      setEditingBoardName("");
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [showBoardsMenu]);

  useEffect(() => {
    if (!showProfileMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      const target = event.target;
      if (!(target instanceof Node)) return;

      if (profileMenuContainerRef.current?.contains(target)) {
        return;
      }

      setShowProfileMenu(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [showProfileMenu]);

  useEffect(() => {
    let isMounted = true;
    let loadFrame: number | null = null;
    const image = new Image();
    const markFloralBackgroundLoaded = () => {
      if (!isMounted) return;

      floralBackgroundRef.current = image;
      setIsFloralBackgroundLoaded(true);
    };

    image.decoding = "async";
    image.src = floralBackgroundImage;
    image.onload = markFloralBackgroundLoaded;

    if (image.complete) {
      loadFrame = window.requestAnimationFrame(markFloralBackgroundLoaded);
    }

    return () => {
      isMounted = false;
      if (loadFrame !== null) {
        window.cancelAnimationFrame(loadFrame);
      }

      image.onload = null;
    };
  }, []);

  useEffect(() => {
    latestRedrawCanvasRef.current();
  }, [
    offset,
    zoom,
    elements,
    selectionBox,
    canvasBackground,
    gridMode,
    gridOpacity,
    isFloralBackgroundLoaded,
    activeText?.editingIndex,
  ]);

  useEffect(() => {
    if (!currentAccountId || !activeBoardId) return;
    if (Date.now() < suppressBoardAutosaveUntilRef.current) return;

    if (autosaveBoardTimeoutRef.current !== null) {
      window.clearTimeout(autosaveBoardTimeoutRef.current);
    }

    autosaveBoardTimeoutRef.current = window.setTimeout(() => {
      persistBoardEffect(activeBoardId);
      autosaveBoardTimeoutRef.current = null;
    }, 700);

    return () => {
      if (autosaveBoardTimeoutRef.current !== null) {
        window.clearTimeout(autosaveBoardTimeoutRef.current);
      }
    };
  }, [
    activeBoardId,
    canvasBackground,
    calendarEntries,
    currentAccountId,
    customCanvasBackground,
    elements,
    gridMode,
    gridOpacity,
  ]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    penCursorPointRef.current = penCursorPoint;
  }, [penCursorPoint]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const previousBodyCursor = document.body.style.cursor;
    const previousRootCursor = document.documentElement.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    if (isPanning) {
      document.body.style.cursor = "none";
      document.documentElement.style.cursor = "none";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.body.style.cursor = previousBodyCursor;
      document.documentElement.style.cursor = previousRootCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isPanning]);

  useEffect(() => {
    const positionTimer = window.setTimeout(() => {
      setActiveText((prev) => {
        if (!prev) {
          activeTextZoomRef.current = zoom;
          return prev;
        }

        const previousZoom = activeTextZoomRef.current || zoom;
        const textScale = previousZoom === 0 ? 1 : zoom / previousZoom;
        activeTextZoomRef.current = zoom;

        return {
          ...prev,
          screenPoint: {
            x: prev.point.x * zoom + offset.x,
            y: prev.point.y * zoom + offset.y + topBarHeight,
          },
          width: prev.width * textScale,
          height: prev.height * textScale,
          fontSize: clampTextFontSize(prev.fontSize * textScale, prev.fontSize),
          typingFontSize: clampTextFontSize(
            prev.typingFontSize * textScale,
            prev.typingFontSize
          ),
          runs: prev.runs.map((run) => ({
            ...run,
            fontSize: clampTextFontSize(run.fontSize * textScale, run.fontSize),
          })),
        };
      });
    }, 0);

    return () => window.clearTimeout(positionTimer);
  }, [offset, zoom]);

  useEffect(() => {
    if (activeTextScreenX === undefined || activeTextScreenY === undefined) return;

    const focusTimer = window.setTimeout(() => {
      textInputRef.current?.focus();
      keepTextInputAligned(textInputRef.current);
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [activeTextScreenX, activeTextScreenY]);

  useEffect(() => {
    keepTextInputAligned(textInputRef.current);
  }, [activeText?.value, activeText?.width, activeText?.height]);

  useEffect(() => {
    const moveOrResizeText = (clientX: number, clientY: number) => {
      if (isResizingTextRef.current && textResizeStart.current) {
        const dx = clientX - textResizeStart.current.screen.x;
        const dy = clientY - textResizeStart.current.screen.y;
        const startsOnLeft = textResizeStart.current.handle.includes("w");
        const startsOnTop = textResizeStart.current.handle.includes("n");
        const startsOnRight = textResizeStart.current.handle.includes("e");
        const startsOnBottom = textResizeStart.current.handle.includes("s");
        const changesWidth =
          startsOnLeft || startsOnRight;
        const changesHeight = startsOnTop || startsOnBottom;
        const dragDirection = {
          x: startsOnLeft ? -1 : startsOnRight ? 1 : 0,
          y: startsOnTop ? -1 : startsOnBottom ? 1 : 0,
        };
        const scaleFromWidth = changesWidth
          ? 1 + (dx * dragDirection.x) / textResizeStart.current.width
          : 1;
        const scaleFromHeight = changesHeight
          ? 1 + (dy * dragDirection.y) / textResizeStart.current.height
          : 1;
        const textScale = Math.max(
          0.05,
          changesWidth && changesHeight
            ? Math.max(scaleFromWidth, scaleFromHeight)
            : changesWidth
            ? scaleFromWidth
            : scaleFromHeight
        );
        const nextWidth = textResizeStart.current.width * textScale;
        const nextHeight = textResizeStart.current.height * textScale;
        const nextScreenPoint = {
          x: startsOnLeft
            ? textResizeStart.current.screenPoint.x +
              textResizeStart.current.width -
              nextWidth
            : changesHeight && !changesWidth
            ? textResizeStart.current.screenPoint.x +
              (textResizeStart.current.width - nextWidth) / 2
            : textResizeStart.current.screenPoint.x,
          y: startsOnTop
            ? textResizeStart.current.screenPoint.y +
              textResizeStart.current.height -
              nextHeight
            : changesWidth && !changesHeight
            ? textResizeStart.current.screenPoint.y +
              (textResizeStart.current.height - nextHeight) / 2
            : textResizeStart.current.screenPoint.y,
        };
        const nextFontSize = clampTextFontSize(
          textResizeStart.current.fontSize * textScale,
          textResizeStart.current.fontSize
        );
        const nextRuns = textResizeStart.current.runs.map((run) => ({
          ...run,
          fontSize: clampTextFontSize(run.fontSize * textScale, run.fontSize),
        }));
        const boundedTextBox = keepTextBoxInViewportRef.current(
          nextScreenPoint,
          nextWidth,
          nextHeight
        );

        setActiveText((prev) =>
          prev
            ? {
                ...prev,
                ...boundedTextBox,
                fontSize: nextFontSize,
                typingFontSize: nextFontSize,
                runs: nextRuns,
              }
            : prev
        );

        return;
      }

      if (!isDraggingTextRef.current || !textDragStart.current) return;

      const nextScreenPoint = {
        x:
          textDragStart.current.textScreen.x +
          clientX -
          textDragStart.current.screen.x,
        y:
          textDragStart.current.textScreen.y +
          clientY -
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

    const moveText = (e: MouseEvent) => {
      moveOrResizeText(e.clientX, e.clientY);
    };

    const moveTextPointer = (e: PointerEvent) => {
      moveOrResizeText(e.clientX, e.clientY);
    };

    const stopMovingText = () => {
      isDraggingTextRef.current = false;
      isResizingTextRef.current = false;
      textDragStart.current = null;
      textResizeStart.current = null;
    };

    window.addEventListener("mousemove", moveText);
    window.addEventListener("mouseup", stopMovingText);
    window.addEventListener("pointermove", moveTextPointer);
    window.addEventListener("pointerup", stopMovingText);

    return () => {
      window.removeEventListener("mousemove", moveText);
      window.removeEventListener("mouseup", stopMovingText);
      window.removeEventListener("pointermove", moveTextPointer);
      window.removeEventListener("pointerup", stopMovingText);
    };
  }, []);

  const getCanvasCoordinatesFromClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    return {
      x: (clientX - rect.left - offsetRef.current.x) / zoomRef.current,
      y: (clientY - rect.top - offsetRef.current.y) / zoomRef.current,
    };
  };

  const getCanvasCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>
  ) => getCanvasCoordinatesFromClient(e.clientX, e.clientY);

  const movePenCursorElement = (point: Point) => {
    const cursorElement = penCursorElementRef.current;
    if (!cursorElement) return;

    cursorElement.style.left = `${point.x}px`;
    cursorElement.style.top = `${point.y}px`;
  };

  const hidePenCursor = () => {
    if (pendingPenCursorFrame.current !== null) {
      window.cancelAnimationFrame(pendingPenCursorFrame.current);
      pendingPenCursorFrame.current = null;
    }

    pendingPenCursorPoint.current = null;
    penCursorPointRef.current = null;
    setPenCursorPoint(null);
  };

  const syncPenCursorPoint = (
    e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (tool === "pen") {
      pendingPenCursorPoint.current = { x: e.clientX, y: e.clientY };

      if (pendingPenCursorFrame.current !== null) {
        return;
      }

      pendingPenCursorFrame.current = window.requestAnimationFrame(() => {
        pendingPenCursorFrame.current = null;
        const nextPoint = pendingPenCursorPoint.current;
        const previousPoint = penCursorPointRef.current;

        if (
          nextPoint &&
          previousPoint &&
          previousPoint.x === nextPoint.x &&
          previousPoint.y === nextPoint.y
        ) {
          return;
        }

        penCursorPointRef.current = nextPoint;

        if (nextPoint) {
          movePenCursorElement(nextPoint);
        }

        if (!previousPoint) {
          setPenCursorPoint(nextPoint);
        }
      });
      return;
    }

    hidePenCursor();
  };

  const showPenCursorAtClientPoint = (clientX: number, clientY: number) => {
    if (pendingPenCursorFrame.current !== null) {
      window.cancelAnimationFrame(pendingPenCursorFrame.current);
      pendingPenCursorFrame.current = null;
    }

    const nextPoint = { x: clientX, y: clientY };
    pendingPenCursorPoint.current = nextPoint;
    penCursorPointRef.current = nextPoint;
    movePenCursorElement(nextPoint);
    setPenCursorPoint(nextPoint);
  };

  const appendStrokePoint = (point: Point, forceExactPoint = false) => {
    const stroke = currentStroke.current;
    if (!stroke) return false;

    const previousPoint = stroke.points[stroke.points.length - 1];
    const minDistance =
      stroke.tool === "pen"
        ? Math.max(0.18, 0.45 / zoomRef.current)
        : Math.max(0.25, 0.7 / zoomRef.current);

    if (previousPoint) {
      const distance = Math.hypot(
        point.x - previousPoint.x,
        point.y - previousPoint.y
      );

      if (forceExactPoint && stroke.tool === "pen") {
        if (distance < 0.01) return false;
        stroke.points.push(point);
        return true;
      }

      if (distance < minDistance) {
        return false;
      }

      if (stroke.tool === "pen") {
        const smoothing =
          distance > 18 ? 0.94 : distance > 10 ? 0.88 : distance > 4 ? 0.78 : 0.64;
        const stabilizedPoint = {
          x: previousPoint.x + (point.x - previousPoint.x) * smoothing,
          y: previousPoint.y + (point.y - previousPoint.y) * smoothing,
        };
        const stabilizedDistance = Math.hypot(
          stabilizedPoint.x - previousPoint.x,
          stabilizedPoint.y - previousPoint.y
        );
        const interpolationSteps = Math.min(
          4,
          Math.max(1, Math.floor(stabilizedDistance / 3.5))
        );

        for (let step = 1; step <= interpolationSteps; step += 1) {
          const t = step / interpolationSteps;
          stroke.points.push({
            x: previousPoint.x + (stabilizedPoint.x - previousPoint.x) * t,
            y: previousPoint.y + (stabilizedPoint.y - previousPoint.y) * t,
          });
        }

        return true;
      }
    }

    stroke.points.push(point);
    return true;
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

    if (activeText.value.length > 0 || activeText.backgroundColor) {
      const safeScreenFontSize = clampTextFontSize(activeText.fontSize);
      const commitZoom = zoomRef.current || activeTextZoomRef.current || 1;
      const nextText: TextElement = {
        kind: "text",
        point: activeText.point,
        value: activeText.value,
        color: activeText.color,
        runs: activeText.runs.map((run) => ({
          ...run,
          fontSize: clampTextFontSize(run.fontSize, safeScreenFontSize),
        })),
        fontFamily: activeText.fontFamily,
        fontWeight: activeText.fontWeight,
        fontSize: safeScreenFontSize,
        fontStyle: activeText.fontStyle,
        underline: activeText.underline,
        textAlign: activeText.textAlign,
        width: Math.max(1, activeText.width),
        height: Math.max(1, activeText.height),
        measurementSpace: "screen",
        measurementZoom: commitZoom,
        backgroundColor: activeText.backgroundColor,
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
    setTextSizeMenu(null);
    setShowTextStyleMenu(false);
    setShowTextFormatMenu(false);
    setShowTextColorMenu(false);
    setShowTextAlignMenu(false);
    setShowTextListMenu(false);
    setShowTextBoxOpacityMenu(false);
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

  const openTextAtPoint = (point: Point) => {
    const textIndex = elements.findLastIndex(
      (element) =>
        element.kind === "text" &&
        pointInBounds(point, getTextBounds(element))
    );

    if (textIndex === -1) return false;

    const textElement = elements[textIndex];
    if (textElement.kind !== "text") return false;

    const textElementFontSize = clampTextFontSize(
      getTextLengthInScreen(textElement, textElement.fontSize),
      textElement.fontSize
    );
    setTextFontFamily(textElement.fontFamily);
    setTextFontWeight(getTextFontWeight(textElement));
    syncTextColorControls(textElement.color);
    setTextSelection({
      start: textElement.value.length,
      end: textElement.value.length,
    });
    activeTextZoomRef.current = zoomRef.current;
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
      color: textElement.color,
      runs: getScreenTextRuns(textElement),
      width: Math.max(2, getTextLengthInScreen(textElement, textElement.width)),
      height: Math.max(24, getTextLengthInScreen(textElement, textElement.height)),
      fontSize: textElementFontSize,
      fontFamily: textElement.fontFamily,
      fontWeight: getTextFontWeight(textElement),
      fontStyle: textElement.fontStyle ?? "normal",
      underline: textElement.underline ?? false,
      typingFontSize: textElementFontSize,
      textAlign: textElement.textAlign ?? "left",
      backgroundColor: textElement.backgroundColor,
      editingIndex: textIndex,
    });
    setTool("cursor");
    return true;
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    syncPenCursorPoint(e);

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    e.currentTarget.setPointerCapture(e.pointerId);

    if (e.button === 2) {
      e.preventDefault();
      isPanningRef.current = true;
      didPanRef.current = false;
      setIsPanning(true);
      setPanningCursorPoint({ x: e.clientX, y: e.clientY });
      panStart.current = {
        screen: { x: e.clientX, y: e.clientY },
        offset: offsetRef.current,
      };
      return;
    }

    if (tool === "cursor") {
      if (e.button === 0) {
        const point = getCanvasCoordinates(e);

        if (activeText) {
          commitActiveText();
        }

        if (openTextAtPoint(point)) {
          return;
        }

        setSelectionMenu(null);
        selectionStart.current = point;
        isSelectingRef.current = true;
        setIsSelecting(true);
        setSelectionBox({ start: point, end: point });
      }

      return;
    }

    if (tool === "text" || tool === "textbox") {
      return;
    }

    const { x, y } = getCanvasCoordinates(e);

    if (
      tool === "circle" ||
      tool === "square" ||
      tool === "arrow" ||
      tool === "line"
    ) {
      isDrawingRef.current = true;
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
      e.preventDefault();
      currentStroke.current = {
        kind: "stroke",
        points: [{ x, y }],
        tool,
        width: tool === "pen" ? penWidth : eraserWidth,
        color: tool === "pen" ? penColor : undefined,
        style: tool === "pen" ? strokeStyle : undefined,
      };
      renderedLiveStrokePointCountRef.current = 1;
    }

    isDrawingRef.current = true;
    setIsDrawing(true);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== "text" && tool !== "textbox") return;

    const { x, y } = getCanvasCoordinates(e);

    if (activeText) {
      commitActiveText();
    }

    if (openTextAtPoint({ x, y })) {
      return;
    }

    if (tool === "textbox") {
      return;
    }

    syncTextColorControls(penColor);
    setTextSelection({ start: 0, end: 0 });
    activeTextZoomRef.current = zoomRef.current;
    setActiveText({
      point: { x, y },
      screenPoint: { x: e.clientX, y: e.clientY },
      value: "",
      color: penColor,
      runs: [],
      width: 48,
      height: 30,
      fontSize: 24,
      fontFamily: textFontFamily,
      fontWeight: textFontWeight,
      fontStyle: "normal",
      underline: false,
      typingFontSize: 24,
      textAlign: "left",
      editingIndex: undefined,
    });
    setTool("cursor");
  };

  const handleTextContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const selectionStart = target.selectionStart;
    const selectionEnd = target.selectionEnd;

    if (
      selectionStart === null ||
      selectionEnd === null ||
      selectionStart === selectionEnd
    ) {
      return;
    }

    e.preventDefault();
    setSelectionMenu(null);
    setTextSizeMenu({ x: e.clientX, y: e.clientY });
  };

  const startDraggingActiveText = (clientX: number, clientY: number) => {
    if (!activeText || (!activeText.value.length && !activeText.backgroundColor)) {
      return false;
    }

    setTextSizeMenu(null);
    setShowTextStyleMenu(false);
    setShowTextFormatMenu(false);
    setShowTextColorMenu(false);
    setShowTextAlignMenu(false);
    setShowTextListMenu(false);
    setShowTextBoxOpacityMenu(false);
    isDraggingTextRef.current = true;
    textDragStart.current = {
      screen: { x: clientX, y: clientY },
      textScreen: activeText.screenPoint,
    };

    return true;
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    syncPenCursorPoint(e);

    if (isPanningRef.current && panStart.current) {
      e.preventDefault();
      setPanningCursorPoint({ x: e.clientX, y: e.clientY });
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

    if (!isDrawingRef.current) return;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e);

    if (
      (
        tool === "circle" ||
        tool === "square" ||
        tool === "arrow" ||
        tool === "line"
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

    if (currentStroke.current) {
      const samples =
        typeof e.nativeEvent.getCoalescedEvents === "function"
          ? e.nativeEvent.getCoalescedEvents()
          : [e.nativeEvent];
      let didAppendPoint = false;

      for (const sample of samples as CanvasPointerInput[]) {
        didAppendPoint =
          appendStrokePoint(
            getCanvasCoordinatesFromClient(sample.clientX, sample.clientY)
          ) || didAppendPoint;
      }

      if (!didAppendPoint) {
        didAppendPoint = appendStrokePoint({ x, y });
      }

      if (didAppendPoint) {
        if (currentStroke.current?.tool === "pen") {
          drawLivePenStrokeSegment();
        } else {
          scheduleRedrawCanvas();
        }
      }
    }

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
    drawCanvasBackground(ctx, cssWidth, cssHeight);
  };
  const stopDrawing = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e) {
      syncPenCursorPoint(e);
      if (currentStroke.current && currentStroke.current.tool === "pen") {
        appendStrokePoint(getCanvasCoordinates(e), true);
      }
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }

    if (isPanningRef.current) {
      const shouldOpenMenu =
        e &&
        !didPanRef.current &&
        selectionBox &&
        pointInBounds(getCanvasCoordinates(e), getSelectionBounds(selectionBox));

      isPanningRef.current = false;
      isDrawingRef.current = false;
      setIsPanning(false);
      setPanningCursorPoint(null);
      didPanRef.current = false;
      panStart.current = null;

      if (e && tool === "pen") {
        showPenCursorAtClientPoint(e.clientX, e.clientY);
      }

      if (shouldOpenMenu) {
        setSelectionMenu({ x: e.clientX, y: e.clientY });
      }

      return;
    }

    if (isSelectingRef.current) {
      const selection = selectionBox;
      isSelectingRef.current = false;
      isDrawingRef.current = false;
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
        tool === "arrow" ||
        tool === "line"
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
          width: penWidth,
          color: penColor,
          style: strokeStyle,
        },
      ]);
    }

    if (currentStroke.current) {
      if (currentStroke.current.tool === "eraser") {
        const eraserStroke = {
          ...currentStroke.current,
          points: [...currentStroke.current.points],
        };

        setElements((prev) => eraseElements(prev, eraserStroke));
        currentStroke.current = null;
        isDrawingRef.current = false;
        renderedLiveStrokePointCountRef.current = 0;
        setIsDrawing(false);
        setShapeStart(null);
        setSnapshot(null);
        shapeEnd.current = null;
        return;
      }

      const finishedStroke = {
        kind: "stroke" as const,
        points: [...currentStroke.current.points],
        tool: currentStroke.current.tool,
        width: currentStroke.current.width,
        color: currentStroke.current.color,
        style: currentStroke.current.style,
      };

      setElements((prev) => [...prev, finishedStroke]);
      currentStroke.current = null;
      renderedLiveStrokePointCountRef.current = 0;
    }

    isDrawingRef.current = false;
    setIsDrawing(false);
    setShapeStart(null);
    setSnapshot(null);
    shapeEnd.current = null;

    if (e && tool === "pen") {
      showPenCursorAtClientPoint(e.clientX, e.clientY);
    }
  };

  const canvasCursor: string =
    isPanning || tool === "pen" ? "none" : tool === "cursor" ? isSelecting ? "crosshair" : "default" : tool === "eraser" ? "cell" : tool === "text" || tool === "textbox" ? "text" : "crosshair";

  const isCursorActive = tool === "cursor";
  const isTextActive = tool === "text";
  const isTextBoxActive = tool === "textbox";
  const isPenActive = tool === "pen";
  const isDarkCanvas = canvasBackground === darkCanvasColor;
  const isGreyCanvas = canvasBackground === greyCanvasColor;
  const toolbarBackground = isDarkCanvas
    ? "rgba(30,30,30,0.94)"
    : isGreyCanvas
    ? "rgba(75,85,99,0.94)"
    : "rgba(255,255,255,0.92)";
  const popoverBackground = isDarkCanvas
    ? "rgba(34,34,34,0.96)"
    : isGreyCanvas
    ? "rgba(82,92,106,0.96)"
    : "rgba(255,255,255,0.96)";
  const inactiveToolBackground = "transparent";
  const panelTextColor = isDarkCanvas || isGreyCanvas ? "#f9fafb" : "#111827";
  const panelBorderColor = isDarkCanvas
    ? "rgba(255,255,255,0.12)"
    : isGreyCanvas
    ? "rgba(255,255,255,0.18)"
    : "rgba(15,23,42,0.12)";
  const panelDividerColor = isDarkCanvas
    ? "rgba(255,255,255,0.12)"
    : isGreyCanvas
    ? "rgba(255,255,255,0.16)"
    : "rgba(15,23,42,0.08)";
  const selectedControlBackground = isDarkCanvas
    ? "rgba(124,58,237,0.24)"
    : isGreyCanvas
    ? "rgba(255,255,255,0.18)"
    : "rgba(124,58,237,0.12)";
  const controlBackground = isDarkCanvas
    ? "#2f2f2f"
    : isGreyCanvas
    ? "#596579"
    : "#ffffff";
  const activeTextToolbar = activeText
    ? (() => {
        const viewportWidth =
          typeof window === "undefined" ? 0 : window.innerWidth;
        const margin = 12;
        const toolbarWidth = viewportWidth
          ? Math.min(390, Math.max(360, viewportWidth - margin * 2))
          : 390;
        const centeredLeft =
          activeText.screenPoint.x + activeText.width / 2 - toolbarWidth / 2;
        const left = viewportWidth
          ? Math.min(
              Math.max(margin, centeredLeft),
              Math.max(margin, viewportWidth - toolbarWidth - margin)
            )
          : centeredLeft;
        const topAbove = activeText.screenPoint.y - 58;
        const topBelow = activeText.screenPoint.y + activeText.height + 14;

        return {
          left,
          top: topAbove > topBarHeight + margin ? topAbove : topBelow,
          width: toolbarWidth,
        };
      })()
    : null;
  const activeTextFont =
    textFonts.find(
      (font) =>
        font.family === activeText?.fontFamily &&
        font.weight === activeText.fontWeight
    ) ?? textFonts[0];
  const activeTextColor = activeText
    ? parseCssColor(activeText.color).hex
    : textColorBase;
  const activeTextBoxOpacity = activeText?.backgroundColor
    ? Math.round(parseCssColor(activeText.backgroundColor).opacity * 100)
    : Math.round(textBoxOpacity * 100);
  const activeTextLayoutSize = activeText
    ? clampTextFontSize(activeText.value ? activeText.fontSize : activeText.typingFontSize)
    : 24;
  const activeTextSize = activeText
    ? clampTextFontSize(activeText.typingFontSize)
    : 24;
  const activeTextDisplayRuns = activeText
    ? activeText.runs.length
      ? activeText.runs.map((run) => ({ ...run }))
      : getTextRuns({
          value: activeText.value,
          color: activeText.color,
          fontFamily: activeText.fontFamily,
          fontWeight: activeText.fontWeight,
          fontSize: activeTextLayoutSize,
          fontStyle: activeText.fontStyle,
          underline: activeText.underline,
        })
    : [];
  const activeTextContentHeight = activeText
    ? getTextRunsContentHeight(activeTextDisplayRuns, activeTextLayoutSize)
    : activeTextLayoutSize * textLineHeight;
  const activeTextBoxPaddingTop = activeText?.backgroundColor
    ? textPaddingY +
      Math.max(
        0,
        (activeText.height - textPaddingY * 2 - activeTextContentHeight) / 2
      )
    : textPaddingY;

  return (
    <div
      onMouseDown={() => {
        setSelectionMenu(null);
        setTextSizeMenu(null);
        setShowTextStyleMenu(false);
        setShowTextFormatMenu(false);
        setShowTextColorMenu(false);
        setShowTextAlignMenu(false);
        setShowTextListMenu(false);
        setShowTextBoxOpacityMenu(false);
      }}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: canvasCssBackground,
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={(e) => stopDrawing(e)}
        onPointerCancel={(e) => stopDrawing(e)}
        onPointerLeave={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
            hidePenCursor();
            stopDrawing(e);
          }
        }}
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
          background: canvasCssBackground,
          cursor: canvasCursor,
          touchAction: "none",
          userSelect: "none",
        }}
      />

      {penCursorPoint && tool === "pen" && !isPanning && (
        <div
          ref={penCursorElementRef}
          aria-hidden="true"
          className="board-pen-cursor"
          style={{
            position: "fixed",
            left: `${penCursorPoint.x}px`,
            top: `${penCursorPoint.y}px`,
            width: "20px",
            height: "20px",
            transform: `translate(-2px, -18px) rotate(43deg) ${
              isDrawing ? "scale(0.96)" : "scale(1)"
            }`,
            pointerEvents: "none",
            zIndex: 200,
          }}
        >
          <svg
            viewBox="0 0 20 20"
            width="20"
            height="20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9.8 2.5H12.9C13.6 2.5 14.2 3.1 14.2 3.8V13.8L11.4 17.5L8.6 13.8V3.8C8.6 3.1 9.1 2.5 9.8 2.5Z"
              fill="#ffffff"
              stroke="#111827"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path d="M8.6 13.6H14.2" stroke="#111827" strokeWidth="1.4" />
            <path
              d="M9.5 5.7H13.3"
              stroke="#111827"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <path
              d="M11.4 17.5L10.4 14.9H12.4L11.4 17.5Z"
              fill={penColor}
            />
          </svg>
        </div>
      )}

      {panningCursorPoint && (
        <div
          aria-hidden="true"
          className="board-pan-cursor"
          style={{
            position: "fixed",
            left: `${panningCursorPoint.x}px`,
            top: `${panningCursorPoint.y}px`,
            width: "22px",
            height: "22px",
            transform: "translate(-7px, -6px)",
            pointerEvents: "none",
            zIndex: 200,
          }}
        >
          <svg
            viewBox="0 0 32 32"
            width="22"
            height="22"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              className="board-pan-cursor-hand"
              d="M10 14V8.4C10 7.2 10.9 6.3 12 6.3C13.1 6.3 14 7.2 14 8.4V13V6.8C14 5.6 14.9 4.7 16 4.7C17.1 4.7 18 5.6 18 6.8V13V8.3C18 7.1 18.9 6.2 20 6.2C21.1 6.2 22 7.1 22 8.3V14V10.4C22 9.3 22.9 8.4 24 8.4C25.1 8.4 26 9.3 26 10.4V18.2C26 23.6 21.6 28 16.2 28H15C10 28 6 24 6 19V15.5C6 14.4 6.9 13.5 8 13.5C9.1 13.5 10 14.4 10 15.5V14Z"
              fill="#ffffff"
              stroke="#2f3137"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {activeText && (
        <>
          {activeTextToolbar && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: `${activeTextToolbar.top}px`,
                left: `${activeTextToolbar.left}px`,
                width: `${activeTextToolbar.width}px`,
                minHeight: "38px",
                padding: "5px 7px",
                borderRadius: "10px",
                background: popoverBackground,
                color: panelTextColor,
                border: `1px solid ${panelBorderColor}`,
                boxShadow: "0 14px 34px rgba(0,0,0,0.18)",
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "5px",
                boxSizing: "border-box",
                zIndex: 95,
              }}
            >
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  paddingRight: "6px",
                  borderRight: `1px solid ${panelDividerColor}`,
                }}
              >
                <button
                  aria-label="Choose writing style"
                  title="Choose writing style"
                  onClick={() => {
                    setShowTextColorMenu(false);
                    setShowTextFormatMenu(false);
                    setShowTextAlignMenu(false);
                    setShowTextListMenu(false);
                    setShowTextBoxOpacityMenu(false);
                    setShowTextStyleMenu((prev) => !prev);
                  }}
                  style={{
                    width: "36px",
                    height: "28px",
                    borderRadius: "6px",
                    border: "none",
                    background: "transparent",
                    color: panelTextColor,
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    padding: 0,
                    fontFamily: activeTextFont.family,
                    fontSize: "14px",
                    fontWeight: activeTextFont.weight,
                    lineHeight: 1,
                  }}
                >
                  {activeTextFont.preview}
                </button>

                {showTextStyleMenu && (
                  <div
                    style={{
                      position: "absolute",
                      top: "40px",
                      left: 0,
                      display: "flex",
                      gap: "6px",
                      padding: "8px",
                      borderRadius: "12px",
                      background: popoverBackground,
                      border: `1px solid ${panelBorderColor}`,
                      boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
                      zIndex: 110,
                    }}
                  >
                    {textFonts.map((font) => (
                      <button
                        key={font.name}
                        aria-label={`${font.name} writing style`}
                        title={`${font.name} writing style`}
                        onClick={() => applyTextFont(font.family, font.weight)}
                        style={{
                          width: "34px",
                          height: "28px",
                          borderRadius: "7px",
                          border:
                            activeText.fontFamily === font.family &&
                            activeText.fontWeight === font.weight
                              ? "2px solid #7c3aed"
                              : `1px solid ${panelBorderColor}`,
                          background:
                            activeText.fontFamily === font.family &&
                            activeText.fontWeight === font.weight
                              ? selectedControlBackground
                              : controlBackground,
                          color: panelTextColor,
                          display: "grid",
                          placeItems: "center",
                          cursor: "pointer",
                          padding: 0,
                          fontFamily: font.family,
                          fontSize: "14px",
                          fontWeight: font.weight,
                          lineHeight: 1,
                        }}
                      >
                        {font.preview}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <input
                  aria-label="Text size"
                  inputMode="numeric"
                  value={activeTextSize}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    if (!value) return;
                    applyTextSize(Number(value));
                  }}
                  style={{
                    width: "45px",
                    height: "28px",
                    borderRadius: "10px",
                    border: "none",
                    background: controlBackground,
                    color: panelTextColor,
                    fontSize: "15px",
                    fontWeight: 700,
                    textAlign: "center",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    gap: "1px",
                    width: "16px",
                    height: "28px",
                  }}
                >
                  <button
                    aria-label="Increase text size"
                    onClick={() => applyTextSize(activeTextSize + 1)}
                    style={{
                      width: "16px",
                      height: "13px",
                      border: "none",
                      background: "transparent",
                      color: panelTextColor,
                      display: "grid",
                      placeItems: "center",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <ChevronUp size={16} strokeWidth={2.5} />
                  </button>
                  <button
                    aria-label="Decrease text size"
                    onClick={() => applyTextSize(activeTextSize - 1)}
                    style={{
                      width: "16px",
                      height: "13px",
                      border: "none",
                      background: "transparent",
                      color: panelTextColor,
                      display: "grid",
                      placeItems: "center",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <ChevronDown size={16} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: "6px",
                  borderLeft: `1px solid ${panelDividerColor}`,
                }}
              >
                <button
                  aria-label="Choose text formatting"
                  title="Choose text formatting"
                  onClick={() => {
                    setShowTextStyleMenu(false);
                    setShowTextColorMenu(false);
                    setShowTextAlignMenu(false);
                    setShowTextListMenu(false);
                    setShowTextBoxOpacityMenu(false);
                    setShowTextFormatMenu((prev) => !prev);
                  }}
                  style={{
                    width: "38px",
                    height: "28px",
                    borderRadius: "8px",
                    border: "none",
                    background: showTextFormatMenu
                      ? "#4f7cff"
                      : "transparent",
                    color: showTextFormatMenu ? "#ffffff" : panelTextColor,
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: "16px",
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                >
                  AA
                </button>

                {showTextFormatMenu && (
                  <div
                    style={{
                      position: "absolute",
                      top: "40px",
                      left: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      padding: "4px",
                      borderRadius: "10px",
                      background: popoverBackground,
                      border: `1px solid ${panelBorderColor}`,
                      boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
                      zIndex: 112,
                    }}
                  >
                    {(["bold", "italic", "underline"] as const).map((format) => {
                      const isActive =
                        format === "bold"
                          ? activeText.fontWeight >= 700
                          : format === "italic"
                          ? activeText.fontStyle === "italic"
                          : activeText.underline;

                      return (
                      <button
                        key={format}
                        aria-label={
                          format === "bold"
                            ? "Bold"
                            : format === "italic"
                            ? "Italic"
                            : "Underline"
                        }
                        title={
                          format === "bold"
                            ? "Bold"
                            : format === "italic"
                            ? "Italic"
                            : "Underline"
                        }
                        onClick={() => applyTextFormat(format)}
                        style={{
                          width: "34px",
                          height: "30px",
                          borderRadius: "7px",
                          border: "none",
                          background: isActive
                            ? "#4f7cff"
                            : "transparent",
                          color: isActive ? "#ffffff" : panelTextColor,
                          display: "grid",
                          placeItems: "center",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {format === "bold" ? (
                          <Bold size={19} strokeWidth={3} />
                        ) : format === "italic" ? (
                          <Italic size={19} strokeWidth={3} />
                        ) : (
                          <Underline size={19} strokeWidth={3} />
                        )}
                      </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {activeText.backgroundColor && (
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: "6px",
                    borderLeft: `1px solid ${panelDividerColor}`,
                  }}
                >
                  <button
                    aria-label="Square opacity"
                    title="Square opacity"
                    onClick={() => {
                      setShowTextStyleMenu(false);
                      setShowTextFormatMenu(false);
                      setShowTextColorMenu(false);
                      setShowTextAlignMenu(false);
                      setShowTextListMenu(false);
                      setShowTextBoxOpacityMenu((prev) => !prev);
                    }}
                    style={{
                      width: "32px",
                      height: "28px",
                      borderRadius: "7px",
                      border: "none",
                      background: showTextBoxOpacityMenu
                        ? selectedControlBackground
                        : "transparent",
                      color: panelTextColor,
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <svg
                      aria-hidden="true"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="8"
                        stroke="currentColor"
                        strokeWidth="2.4"
                      />
                      <path
                        d="M12 4a8 8 0 0 1 0 16V4Z"
                        fill="currentColor"
                        opacity="0.35"
                      />
                    </svg>
                  </button>

                  {showTextBoxOpacityMenu && (
                    <div
                      style={{
                        position: "absolute",
                        top: "42px",
                        right: 0,
                        width: "190px",
                        padding: "10px 12px 12px",
                        borderRadius: "12px",
                        background: popoverBackground,
                        color: panelTextColor,
                        border: `1px solid ${panelBorderColor}`,
                        boxShadow: "0 16px 36px rgba(0,0,0,0.2)",
                        boxSizing: "border-box",
                        zIndex: 116,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: "13px",
                          fontWeight: 700,
                          marginBottom: "9px",
                        }}
                      >
                        <span>Opacity</span>
                        <span>{activeTextBoxOpacity}%</span>
                      </div>
                      <input
                        aria-label="Square opacity"
                        type="range"
                        className="modern-range"
                        min="10"
                        max="100"
                        value={activeTextBoxOpacity}
                        onChange={(e) =>
                          applyTextBoxOpacity(Number(e.target.value) / 100)
                        }
                        style={{
                          width: "100%",
                          accentColor: "#4f7cff",
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: "6px",
                  borderLeft: `1px solid ${panelDividerColor}`,
                }}
              >
                <button
                  aria-label="Choose text color"
                  title="Choose text color"
                  onClick={() => {
                    setShowTextStyleMenu(false);
                    setShowTextFormatMenu(false);
                    setShowTextAlignMenu(false);
                    setShowTextListMenu(false);
                    setShowTextBoxOpacityMenu(false);
                    setShowTextColorMenu((prev) => !prev);
                  }}
                  style={{
                    width: "32px",
                    height: "28px",
                    borderRadius: "7px",
                    border: "none",
                    background: showTextColorMenu
                      ? selectedControlBackground
                      : "transparent",
                    color: activeText.color,
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: "17px",
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      paddingBottom: "2px",
                      borderBottom: `3px solid ${activeText.color}`,
                    }}
                  >
                    A
                  </span>
                </button>

                {showTextColorMenu && (
                  <div
                    style={{
                      position: "absolute",
                      top: "42px",
                      right: 0,
                      width: "226px",
                      padding: "11px 13px 14px",
                      borderRadius: "12px",
                      background: popoverBackground,
                      color: panelTextColor,
                      border: `1px solid ${panelBorderColor}`,
                      boxShadow: "0 16px 36px rgba(0,0,0,0.2)",
                      boxSizing: "border-box",
                      zIndex: 115,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "15px",
                        fontWeight: 500,
                        marginBottom: "9px",
                      }}
                    >
                      Opacity
                    </div>
                    <input
                      aria-label="Text opacity"
                      type="range"
                      className="modern-range"
                      min="10"
                      max="100"
                      value={Math.round(textColorOpacity * 100)}
                      onChange={(e) =>
                        applyTextColorOpacity(Number(e.target.value) / 100)
                      }
                      style={{
                        width: "100%",
                        accentColor: "#4f7cff",
                        marginBottom: "11px",
                      }}
                    />
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(6, 24px)",
                        gap: "8px",
                      }}
                    >
                      {textColorPalette.map((color) => {
                        const isSelected = activeTextColor === color.value;

                        return (
                          <button
                            key={`${color.name}-${color.value}`}
                            aria-label={`${color.name} text color`}
                            title={color.name}
                            onClick={() => applyTextColor(color.value)}
                            style={{
                              width: "24px",
                              height: "24px",
                              borderRadius: "6px",
                              border: isSelected
                                ? "3px solid #4f7cff"
                                : `1px solid ${panelBorderColor}`,
                              background: color.value,
                              boxShadow:
                                color.value === "#ffffff" ||
                                color.value === "#f8fafc"
                                  ? "inset 0 0 0 1px rgba(15,23,42,0.12)"
                                  : "none",
                              cursor: "pointer",
                              padding: 0,
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            {isSelected && (
                              <Check
                                size={14}
                                strokeWidth={3}
                                color={
                                  color.value === "#ffffff" ||
                                  color.value === "#f8fafc"
                                    ? "#4f7cff"
                                    : "#ffffff"
                                }
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: "6px",
                  borderLeft: `1px solid ${panelDividerColor}`,
                }}
              >
                <button
                  aria-label="Choose text alignment"
                  title="Choose text alignment"
                  onClick={() => {
                    setShowTextStyleMenu(false);
                    setShowTextFormatMenu(false);
                    setShowTextColorMenu(false);
                    setShowTextListMenu(false);
                    setShowTextBoxOpacityMenu(false);
                    setShowTextAlignMenu((prev) => !prev);
                  }}
                  style={{
                    width: "34px",
                    height: "28px",
                    borderRadius: "8px",
                    border: "none",
                    background: showTextAlignMenu
                      ? "#4f7cff"
                      : "transparent",
                    color: showTextAlignMenu ? "#ffffff" : panelTextColor,
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {activeText.textAlign === "center" ? (
                    <AlignCenter size={20} strokeWidth={2.6} />
                  ) : activeText.textAlign === "right" ? (
                    <AlignRight size={20} strokeWidth={2.6} />
                  ) : (
                    <AlignLeft size={20} strokeWidth={2.6} />
                  )}
                </button>

                {showTextAlignMenu && (
                  <div
                    style={{
                      position: "absolute",
                      top: "40px",
                      left: 0,
                      display: "flex",
                      gap: "8px",
                      padding: "6px",
                      borderRadius: "12px",
                      background: popoverBackground,
                      border: `1px solid ${panelBorderColor}`,
                      boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
                      zIndex: 113,
                    }}
                  >
                    {(["left", "center", "right"] as TextAlign[]).map((alignment) => {
                      const isActive = activeText.textAlign === alignment;

                      return (
                        <button
                          key={alignment}
                          aria-label={`${alignment} align text`}
                          title={`${alignment} align text`}
                          onClick={() => applyTextAlign(alignment)}
                          style={{
                            width: "34px",
                            height: "30px",
                            borderRadius: "8px",
                            border: isActive
                              ? "2px solid #4f7cff"
                              : "none",
                            background: isActive
                              ? "#4f7cff"
                              : "transparent",
                            color: isActive ? "#ffffff" : panelTextColor,
                            display: "grid",
                            placeItems: "center",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          {alignment === "center" ? (
                            <AlignCenter size={20} strokeWidth={2.6} />
                          ) : alignment === "right" ? (
                            <AlignRight size={20} strokeWidth={2.6} />
                          ) : (
                            <AlignLeft size={20} strokeWidth={2.6} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: "6px",
                  borderLeft: `1px solid ${panelDividerColor}`,
                }}
              >
                <button
                  aria-label="Choose list style"
                  title="Choose list style"
                  onClick={() => {
                    setShowTextStyleMenu(false);
                    setShowTextFormatMenu(false);
                    setShowTextColorMenu(false);
                    setShowTextAlignMenu(false);
                    setShowTextBoxOpacityMenu(false);
                    setShowTextListMenu((prev) => !prev);
                  }}
                  style={{
                    width: "34px",
                    height: "28px",
                    borderRadius: "8px",
                    border: "none",
                    background: showTextListMenu ? "#4f7cff" : "transparent",
                    color: showTextListMenu ? "#ffffff" : panelTextColor,
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <List size={20} strokeWidth={2.6} />
                </button>

                {showTextListMenu && (
                  <div
                    style={{
                      position: "absolute",
                      top: "40px",
                      right: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      padding: "4px",
                      borderRadius: "10px",
                      background: popoverBackground,
                      border: `1px solid ${panelBorderColor}`,
                      boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
                      zIndex: 114,
                    }}
                  >
                    {(["bullet", "numbered"] as const).map((listStyle) => (
                      <button
                        key={listStyle}
                        aria-label={
                          listStyle === "bullet"
                            ? "Bulleted list"
                            : "Numbered list"
                        }
                        title={
                          listStyle === "bullet"
                            ? "Bulleted list"
                            : "Numbered list"
                        }
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyTextList(listStyle)}
                        style={{
                          width: "34px",
                          height: "30px",
                          borderRadius: "7px",
                          border: "none",
                          background: "transparent",
                          color: panelTextColor,
                          display: "grid",
                          placeItems: "center",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {listStyle === "bullet" ? (
                          <List size={20} strokeWidth={2.6} />
                        ) : (
                          <ListOrdered size={20} strokeWidth={2.6} />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {(activeText.value.length > 0 || activeText.backgroundColor) && (
            <div
              style={{
                position: "fixed",
                top: `${activeText.screenPoint.y}px`,
                left: `${activeText.screenPoint.x}px`,
                width: `${activeText.width}px`,
                height: `${activeText.height}px`,
                border: "1.5px solid #2563eb",
                boxSizing: "border-box",
                pointerEvents: "none",
                zIndex: 62,
              }}
            />
          )}
          {(activeText.value.length > 0 || activeText.backgroundColor) &&
            ([
              {
                edge: "top",
                x: activeText.screenPoint.x,
                y: activeText.screenPoint.y - 4,
                width: activeText.width,
                height: 4,
              },
              {
                edge: "right",
                x: activeText.screenPoint.x + activeText.width,
                y: activeText.screenPoint.y,
                width: 4,
                height: activeText.height,
              },
              {
                edge: "bottom",
                x: activeText.screenPoint.x,
                y: activeText.screenPoint.y + activeText.height,
                width: activeText.width,
                height: 4,
              },
              {
                edge: "left",
                x: activeText.screenPoint.x - 4,
                y: activeText.screenPoint.y,
                width: 4,
                height: activeText.height,
              },
            ]).map(({ edge, x, y, width, height }) => (
              <div
                key={edge}
                role="presentation"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  startDraggingActiveText(e.clientX, e.clientY);
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  startDraggingActiveText(e.clientX, e.clientY);
                }}
                style={{
                  position: "fixed",
                  left: `${x}px`,
                  top: `${y}px`,
                  width: `${width}px`,
                  height: `${height}px`,
                  cursor: "move",
                  zIndex: 79,
                }}
              />
            ))}
          {(activeText.value.length > 0 || activeText.backgroundColor) &&
            ([
              {
                handle: "nw" as const,
                x: activeText.screenPoint.x - 16,
                y: activeText.screenPoint.y - 16,
                cursor: "nwse-resize",
              },
              {
                handle: "n" as const,
                x: activeText.screenPoint.x + activeText.width / 2 - 8,
                y: activeText.screenPoint.y - 16,
                cursor: "ns-resize",
              },
              {
                handle: "ne" as const,
                x: activeText.screenPoint.x + activeText.width,
                y: activeText.screenPoint.y - 16,
                cursor: "nesw-resize",
              },
              {
                handle: "e" as const,
                x: activeText.screenPoint.x + activeText.width,
                y: activeText.screenPoint.y + activeText.height / 2 - 8,
                cursor: "ew-resize",
              },
              {
                handle: "se" as const,
                x: activeText.screenPoint.x + activeText.width,
                y: activeText.screenPoint.y + activeText.height,
                cursor: "nwse-resize",
              },
              {
                handle: "s" as const,
                x: activeText.screenPoint.x + activeText.width / 2 - 8,
                y: activeText.screenPoint.y + activeText.height,
                cursor: "ns-resize",
              },
              {
                handle: "sw" as const,
                x: activeText.screenPoint.x - 16,
                y: activeText.screenPoint.y + activeText.height,
                cursor: "nesw-resize",
              },
              {
                handle: "w" as const,
                x: activeText.screenPoint.x - 16,
                y: activeText.screenPoint.y + activeText.height / 2 - 8,
                cursor: "ew-resize",
              },
            ]).map(({ handle, x, y, cursor }) => (
              <div
                key={handle}
                role="presentation"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  isResizingTextRef.current = true;
                  textResizeStart.current = {
                    screen: { x: e.clientX, y: e.clientY },
                    screenPoint: activeText.screenPoint,
                    width: activeText.width,
                    height: activeText.height,
                    fontSize: activeTextLayoutSize,
                    runs: activeText.runs,
                    handle,
                  };
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  isResizingTextRef.current = true;
                  textResizeStart.current = {
                    screen: { x: e.clientX, y: e.clientY },
                    screenPoint: activeText.screenPoint,
                    width: activeText.width,
                    height: activeText.height,
                    fontSize: activeTextLayoutSize,
                    runs: activeText.runs,
                    handle,
                  };
                }}
                style={{
                  position: "fixed",
                  left: `${x}px`,
                  top: `${y}px`,
                  width: "16px",
                  height: "16px",
                  border: "4px solid transparent",
                  background: "transparent",
                  boxSizing: "border-box",
                  cursor,
                  zIndex: 80,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    inset: "4px",
                    border: "1.5px solid #2563eb",
                    background: canvasFillColor,
                    boxSizing: "border-box",
                    pointerEvents: "none",
                  }}
                />
              </div>
            ))}
          <textarea
            ref={textInputRef}
            className="custom-text-input"
            autoFocus
            wrap="off"
            value={activeText.value}
            onChange={(e) => {
              const value = e.target.value;
              keepTextInputAligned(e.currentTarget);
              syncTextSelection(e.currentTarget);
              const scrollWidth = e.currentTarget.scrollWidth;
              const scrollHeight = e.currentTarget.scrollHeight;
              setActiveText((prev) => {
                if (!prev) return prev;

                const nextColor = prev.color;
                const nextRuns = updateTextRuns(
                  prev.value,
                  value,
                  prev.runs,
                  nextColor,
                  prev.fontFamily,
                  prev.fontWeight,
                  clampTextFontSize(prev.typingFontSize),
                  prev.fontStyle,
                  prev.underline
                );
                const nextSize = getTextRunsEditorSize(
                  nextRuns,
                  clampTextFontSize(prev.fontSize)
                );

                return {
                  ...prev,
                  value,
                  runs: nextRuns,
                  ...keepTextBoxInViewport(
                    prev.screenPoint,
                    Math.max(prev.width, nextSize.width, scrollWidth),
                    Math.max(prev.height, nextSize.height, scrollHeight)
                  ),
                };
              });
            }}
            onInput={(e) => {
              keepTextInputAligned(e.currentTarget);
              syncTextSelection(e.currentTarget);
            }}
            onScroll={(e) => keepTextInputAligned(e.currentTarget)}
            onSelect={(e) => {
              keepTextInputAligned(e.currentTarget);
              syncTextSelection(e.currentTarget);
            }}
            onMouseUp={(e) => {
              const target = e.currentTarget;
              keepTextInputAligned(target);
              syncTextSelection(target);
              setActiveText((prev) =>
                prev
                  ? {
                      ...prev,
                      ...keepTextBoxInViewport(
                        prev.screenPoint,
                        target.offsetWidth,
                        target.offsetHeight
                      ),
                    }
                  : prev
              );
            }}
            onKeyUp={(e) => syncTextSelection(e.currentTarget)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              e.stopPropagation();
              syncTextSelection(e.currentTarget);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              syncTextSelection(e.currentTarget);
            }}
            onContextMenu={handleTextContextMenu}
            onKeyDown={(e) => {
              keepTextInputAligned(e.currentTarget);
              syncTextSelection(e.currentTarget);

              if (continueTextList(e)) {
                return;
              }

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
              minWidth:
                activeText.value.length > 0 || activeText.backgroundColor
                  ? "48px"
                  : "2px",
              minHeight:
                activeText.value.length > 0 || activeText.backgroundColor
                  ? "30px"
                  : "24px",
              padding:
                activeText.value.length > 0 || activeText.backgroundColor
                  ? activeText.backgroundColor
                    ? `${activeTextBoxPaddingTop}px ${textPaddingX}px 0`
                    : `${textPaddingY}px ${textPaddingX}px`
                  : 0,
              border: "none",
              borderRadius: "2px",
              outline: "none",
              background: "transparent",
              boxShadow: "none",
              color: activeText.color,
              caretColor: activeText.color,
              fontSize: `${activeTextLayoutSize}px`,
              fontFamily: activeText.fontFamily,
              fontWeight: activeText.fontWeight,
              fontStyle: activeText.fontStyle,
              lineHeight: textLineHeight,
              whiteSpace: "pre",
              textAlign: activeText.textAlign,
              resize: "none",
              overflow: "hidden",
              boxSizing: "border-box",
              zIndex: 60,
              cursor: "text",
              ...textEditorTypography,
            }}
          />
        </>
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
            background: popoverBackground,
            boxShadow: "0 6px 16px rgba(0,0,0,0.16)",
            border: `1px solid ${panelBorderColor}`,
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
              color: panelTextColor,
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
              color: panelTextColor,
              fontSize: "12px",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      )}

      {textSizeMenu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: `${textSizeMenu.y}px`,
            left: `${textSizeMenu.x}px`,
            display: "flex",
            flexDirection: "column",
            minWidth: "110px",
            maxWidth: "130px",
            padding: "8px",
            borderRadius: "16px",
            background: popoverBackground,
            boxShadow: "0 12px 28px rgba(0,0,0,0.14)",
            border: `1px solid ${panelBorderColor}`,
            zIndex: 90,
          }}
        >
          <div
            style={{
              marginBottom: "8px",
              fontSize: "13px",
              fontWeight: 700,
              color: panelTextColor,
            }}
          >
            Text size
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              maxHeight: "220px",
              overflowY: "auto",
              paddingRight: "2px",
            }}
          >
            {Array.from({ length: 100 }, (_, index) => index + 1).map((size) => (
              <button
                key={size}
                onClick={() => {
                  applyTextSize(size);
                  setTextSizeMenu(null);
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "none",
                  borderRadius: "10px",
                  background: "transparent",
                  color: panelTextColor,
                  textAlign: "left",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  borderBottom: `1px solid ${panelDividerColor}`,
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {showLoginModal && (
        <div
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeAuthModal();
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            padding: "20px",
            background: "rgba(15, 23, 42, 0.34)",
            backdropFilter: "blur(14px)",
            zIndex: 150,
          }}
        >
          <form
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              handleAuthSubmit();
            }}
            style={{
              width: "min(390px, calc(100vw - 32px))",
              padding: "22px",
              borderRadius: "22px",
              border: "1px solid rgba(255,255,255,0.34)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92))",
              boxShadow:
                "0 26px 80px rgba(17,24,39,0.32), inset 0 1px 0 rgba(255,255,255,0.85)",
              color: "#111827",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
                marginBottom: "18px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 0,
                    fontWeight: 800,
                    letterSpacing: "0",
                    lineHeight: 1.05,
                  }}
                >
                  <span style={{ fontSize: "24px" }}>
                    {authMode === "register"
                      ? "Utworz konto"
                      : "Zaloguj sie"}
                  </span>
                  Zaloguj się
                </div>
                <div
                  style={{
                    marginTop: "6px",
                    color: "#64748b",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  Wróć do swojej tablicy.
                </div>
              </div>
              <button
                type="button"
                aria-label="Zamknij logowanie"
                onClick={closeAuthModal}
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "10px",
                  border: "none",
                  background: "rgba(15,23,42,0.06)",
                  color: "#111827",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                marginBottom: "14px",
              }}
            >
              {["Google", "Apple"].map((provider) => (
                <button
                  key={provider}
                  type="button"
                  style={{
                    height: "42px",
                    borderRadius: "12px",
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: "#ffffff",
                    color: "#111827",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
                  }}
                >
                  {provider}
                </button>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                margin: "12px 0",
                color: "#94a3b8",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              <div style={{ height: "1px", flex: 1, background: "#e2e8f0" }} />
              lub
              <div style={{ height: "1px", flex: 1, background: "#e2e8f0" }} />
            </div>

            {authMode === "register" && (
              <label
                style={{
                  display: "block",
                  marginBottom: "10px",
                }}
              >
                <span
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    color: "#475569",
                    fontSize: "13px",
                    fontWeight: 700,
                  }}
                >
                  Name
                </span>
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  value={authName}
                  onChange={(e) => setAuthName(e.currentTarget.value)}
                  style={{
                    width: "100%",
                    height: "44px",
                    padding: "0 14px",
                    borderRadius: "13px",
                    border: "1px solid rgba(15,23,42,0.14)",
                    background: "#ffffff",
                    color: "#111827",
                    fontSize: "15px",
                    fontWeight: 600,
                    boxSizing: "border-box",
                    outlineColor: "#7c3aed",
                  }}
                />
              </label>
            )}

            <label
              style={{
                display: "block",
                marginBottom: "10px",
              }}
            >
              <span
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#475569",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                Email
              </span>
              <div style={{ position: "relative" }}>
                <Mail
                  size={17}
                  style={{
                    position: "absolute",
                    left: "13px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#7c3aed",
                  }}
                />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="twoj@email.pl"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.currentTarget.value)}
                  style={{
                    width: "100%",
                    height: "44px",
                    padding: "0 14px 0 40px",
                    borderRadius: "13px",
                    border: "1px solid rgba(15,23,42,0.14)",
                    background: "#ffffff",
                    color: "#111827",
                    fontSize: "15px",
                    fontWeight: 600,
                    boxSizing: "border-box",
                    outlineColor: "#7c3aed",
                  }}
                />
              </div>
            </label>

            <label
              style={{
                display: "block",
                marginBottom: "14px",
              }}
            >
              <span
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#475569",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                Hasło
              </span>
              <div style={{ position: "relative" }}>
                <Lock
                  size={17}
                  style={{
                    position: "absolute",
                    left: "13px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#7c3aed",
                  }}
                />
                <input
                  type="password"
                  autoComplete={
                    authMode === "register" ? "new-password" : "current-password"
                  }
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.currentTarget.value)}
                  placeholder="Wpisz hasło"
                  style={{
                    width: "100%",
                    height: "44px",
                    padding: "0 14px 0 40px",
                    borderRadius: "13px",
                    border: "1px solid rgba(15,23,42,0.14)",
                    background: "#ffffff",
                    color: "#111827",
                    fontSize: "15px",
                    fontWeight: 600,
                    boxSizing: "border-box",
                    outlineColor: "#7c3aed",
                  }}
                />
              </div>
            </label>

            {authMode === "register" && (
              <label style={{ display: "block", marginBottom: "14px" }}>
                <span
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    color: "#475569",
                    fontSize: "13px",
                    fontWeight: 700,
                  }}
                >
                  Powtorz haslo
                </span>
                <div style={{ position: "relative" }}>
                  <Lock
                    size={17}
                    style={{
                      position: "absolute",
                      left: "13px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#7c3aed",
                    }}
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Wpisz haslo ponownie"
                    value={authConfirmPassword}
                    onChange={(e) =>
                      setAuthConfirmPassword(e.currentTarget.value)
                    }
                    style={{
                      width: "100%",
                      height: "44px",
                      padding: "0 14px 0 40px",
                      borderRadius: "13px",
                      border: "1px solid rgba(15,23,42,0.14)",
                      background: "#ffffff",
                      color: "#111827",
                      fontSize: "15px",
                      fontWeight: 600,
                      boxSizing: "border-box",
                      outlineColor: "#7c3aed",
                    }}
                  />
                </div>
              </label>
            )}

            <div
              style={{
                display: authMode === "login" ? "flex" : "none",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "16px",
                color: "#64748b",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input type="checkbox" style={{ accentColor: "#7c3aed" }} />
                Zapamiętaj mnie
              </label>
              <button
                type="button"
                onClick={requestPasswordReset}
                disabled={isAuthSubmitting}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#7c3aed",
                  fontSize: "13px",
                  fontWeight: 800,
                  cursor: isAuthSubmitting ? "default" : "pointer",
                  opacity: isAuthSubmitting ? 0.72 : 1,
                  padding: 0,
                }}
              >
                Nie pamiętasz?
              </button>
            </div>

            {authMessage && (
              <div
                style={{
                  marginBottom: "14px",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  background:
                    isPositiveAuthMessage
                      ? "rgba(34,197,94,0.1)"
                      : "rgba(239,68,68,0.1)",
                  color:
                    isPositiveAuthMessage ? "#15803d" : "#b91c1c",
                  fontSize: "13px",
                  fontWeight: 700,
                  lineHeight: 1.3,
                }}
              >
                {authMessage}
              </div>
            )}

            {canResendConfirmation && (
              <div style={{ marginBottom: "14px" }}>
                <button
                  type="button"
                  onClick={resendConfirmationEmail}
                  disabled={isAuthSubmitting}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#7c3aed",
                    fontSize: "13px",
                    fontWeight: 800,
                    cursor: isAuthSubmitting ? "default" : "pointer",
                    opacity: isAuthSubmitting ? 0.72 : 1,
                    padding: 0,
                  }}
                >
                  Resend confirmation email
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthSubmitting}
              style={{
                width: "100%",
                height: "46px",
                borderRadius: "14px",
                border: "none",
                background:
                  "linear-gradient(90deg, #7c3aed 0%, #3b82f6 100%)",
                color: "#ffffff",
                fontSize: 0,
                fontWeight: 800,
                cursor: isAuthSubmitting ? "default" : "pointer",
                opacity: isAuthSubmitting ? 0.72 : 1,
                boxShadow: "0 14px 30px rgba(79,70,229,0.28)",
              }}
            >
              <span style={{ fontSize: "16px" }}>
                {isAuthSubmitting
                  ? "Please wait..."
                  : authMode === "register"
                  ? "Create account"
                  : "Log in"}
              </span>
              Zaloguj się
            </button>

            <div
              style={{
                display: "block",
                marginTop: "16px",
                textAlign: "center",
                color: "#64748b",
                fontSize: 0,
                fontWeight: 700,
              }}
            >
              <span style={{ fontSize: "13px" }}>
                {authMode === "register" ? "Masz juz konto?" : "Nie masz konta?"}
              </span>{" "}
              Nie masz konta?{" "}
              <button
                type="button"
                onClick={() => {
                  setAuthMode((prev) =>
                    prev === "register" ? "login" : "register"
                  );
                  setAuthPassword("");
                  setAuthConfirmPassword("");
                  setAuthMessage("");
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#7c3aed",
                  fontSize: 0,
                  fontWeight: 900,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <span style={{ fontSize: "13px" }}>
                  {authMode === "register" ? "Zaloguj sie" : "Zarejestruj sie"}
                </span>
                Zarejestruj się
              </button>
            </div>
          </form>
        </div>
      )}

      <div
        onPointerEnter={hidePenCursor}
        onPointerMove={hidePenCursor}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: `${topBarHeight}px`,
          background:
            "linear-gradient(90deg, #7c3aed 0%, #3b82f6 50%, #22c55e 100%)",
          cursor: "default",
          zIndex: 50,
        }}
      >
        <button
          aria-label="Ustawienia"
          onClick={() => {
            setShowSettingsMenu((prev) => !prev);
            setShowBoardsMenu(false);
            setShowPenMenu(false);
            setShowTextMenu(false);
            setShowEraserMenu(false);
            setShowShapesMenu(false);
          }}
          style={{
            position: "absolute",
            top: "50%",
            left: "16px",
            transform: "translateY(-50%)",
            width: "34px",
            height: "34px",
            border: "none",
            background: "transparent",
            color: "#ffffff",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Settings size={18} />
        </button>

        {currentAccountEmail && (
          <div
            ref={boardsMenuContainerRef}
            style={{
              position: "absolute",
              top: "50%",
              left: "64px",
              transform: "translateY(-50%)",
            }}
          >
            <button
              aria-label="Boards"
              onClick={() => {
                setShowBoardsMenu((prev) => !prev);
                setShowSettingsMenu(false);
              }}
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "10px",
                border: showBoardsMenu
                  ? "1.5px solid rgba(255,255,255,0.78)"
                  : "1.5px solid rgba(255,255,255,0.34)",
                background: showBoardsMenu
                  ? "rgba(255,255,255,0.16)"
                  : "rgba(255,255,255,0.08)",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                padding: 0,
                backdropFilter: "blur(8px)",
              }}
            >
              <LayoutGrid size={16} />
            </button>

            {showBoardsMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 10px)",
                  left: "-38px",
                  width: "min(1560px, calc(100vw - 24px))",
                  height: "min(880px, calc(100vh - 64px))",
                  borderRadius: "22px",
                  background: "rgba(248,250,252,0.98)",
                  border: "1px solid rgba(203,213,225,0.86)",
                  boxShadow: "0 34px 90px rgba(15,23,42,0.18)",
                  display: "grid",
                  gridTemplateColumns: "300px minmax(0, 1fr)",
                  overflow: "hidden",
                  zIndex: 90,
                  fontFamily: appSansFontFamily,
                }}
              >
                <aside
                  style={{
                    background:
                      "linear-gradient(180deg, #f8fafc 0%, #eef4ff 100%)",
                    borderRight: "1px solid rgba(203,213,225,0.74)",
                    padding: "30px 22px 24px",
                    display: "grid",
                    gridTemplateRows: "auto auto 1fr auto",
                    gap: "18px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: "#0f172a",
                          fontSize: "26px",
                          fontWeight: 600,
                          lineHeight: 1,
                        }}
                      >
                        Boards
                      </div>
                    </div>
                    <button
                      aria-label="Close boards"
                      onClick={() => setShowBoardsMenu(false)}
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "10px",
                        border: "1px solid rgba(203,213,225,0.8)",
                        background: "rgba(255,255,255,0.82)",
                        color: "#334155",
                        display: "grid",
                        placeItems: "center",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                    <button
                      aria-label="Create board"
                      onClick={createBoard}
                      disabled={isBoardsLoading || liveBoardsCount >= currentMaxBoards}
                      style={{
                      minHeight: "46px",
                      width: "100%",
                      borderRadius: "12px",
                      border: "none",
                      background:
                        "linear-gradient(135deg, #2563eb 0%, #4338ca 100%)",
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                        cursor:
                        isBoardsLoading || liveBoardsCount >= currentMaxBoards
                          ? "default"
                          : "pointer",
                      opacity: liveBoardsCount >= currentMaxBoards ? 0.55 : 1,
                      boxShadow: "0 14px 28px rgba(37,99,235,0.22)",
                      fontSize: "14px",
                      fontWeight: 500,
                    }}
                    title={
                      liveBoardsCount >= currentMaxBoards
                        ? `${currentPlanLabel} lets you create up to ${currentMaxBoards} boards.`
                        : "Create a new board"
                    }
                  >
                    <Plus size={17} />
                    New board
                  </button>

                  <div style={{ display: "grid", gap: "8px", alignContent: "start" }}>
                    {[
                      {
                        label: "All boards",
                        value: "all" as const,
                        icon: <LayoutGrid size={15} />,
                      },
                      {
                        label: "Recent",
                        value: "recent" as const,
                        icon: <Clock3 size={15} />,
                      },
                      {
                        label: "My boards",
                        value: "mine" as const,
                        icon: <Monitor size={15} />,
                      },
                      {
                        label: "Starred",
                        value: "starred" as const,
                        icon: <Star size={15} />,
                      },
                      {
                        label: "Trash",
                        value: "trash" as const,
                        icon: <Trash2 size={15} />,
                      },
                      {
                        label: "Calendar",
                        value: "calendar" as const,
                        icon: <CalendarDays size={15} />,
                      },
                      {
                        label: "Your plan",
                        value: "plan" as const,
                        icon: <Star size={15} />,
                      },
                    ].map((item) => {
                      const isActive = boardBrowserView === item.value;

                      return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setBoardBrowserView(item.value)}
                        style={{
                          height: "44px",
                          padding: "0 14px",
                          borderRadius: "12px",
                          border: isActive
                            ? "1px solid rgba(37,99,235,0.18)"
                            : "1px solid transparent",
                          background: isActive
                            ? "rgba(219,234,254,0.85)"
                            : "transparent",
                          color: isActive ? "#1d4ed8" : "#334155",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          fontSize: "14px",
                          fontWeight: isActive ? 560 : 460,
                          cursor: "pointer",
                        }}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      marginTop: "auto",
                      padding: "16px",
                      borderRadius: "14px",
                      background: "rgba(255,255,255,0.72)",
                      border: "1px solid rgba(203,213,225,0.74)",
                    }}
                  >
                    <div
                      style={{
                        color: "#0f172a",
                        fontSize: "14px",
                        fontWeight: 500,
                      }}
                    >
                      {liveBoardsCount} / {currentMaxBoards} boards used
                    </div>
                    <div
                      style={{
                        marginTop: "6px",
                        color: "#64748b",
                        fontSize: "12px",
                        lineHeight: 1.45,
                      }}
                    >
                      Click a card to open it. Click the active board card title to
                      rename it.
                    </div>
                  </div>
                </aside>

                <section
                  style={{
                    padding: "34px 28px 28px",
                    display: "grid",
                    gridTemplateRows: "auto auto auto 1fr",
                    gap: "16px",
                    minWidth: 0,
                    minHeight: 0,
                    background:
                      "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <h2
                        style={{
                          margin: 0,
                          color: "#0f172a",
                          fontSize: "32px",
                          fontWeight: 600,
                          lineHeight: 1.05,
                        }}
                      >
                        {boardBrowserHeading}
                      </h2>
                      <div
                        style={{
                          marginTop: "8px",
                          color: "#5b6b80",
                          fontSize: "14px",
                          fontWeight: 400,
                        }}
                      >
                        {boardBrowserDescription}
                      </div>
                    </div>

                    <div
                      style={{
                        minWidth: "220px",
                        padding: "12px 14px",
                        borderRadius: "14px",
                        border: "1px solid rgba(203,213,225,0.78)",
                        background: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
                      }}
                    >
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "12px",
                          background:
                            "linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)",
                          color: "#ffffff",
                          display: "grid",
                          placeItems: "center",
                          flex: "0 0 auto",
                          boxShadow: "0 10px 24px rgba(34,197,94,0.24)",
                        }}
                      >
                        <UserRound size={18} />
                      </div>
                      <div
                        style={{
                          minWidth: 0,
                          display: "grid",
                          gap: "4px",
                        }}
                      >
                        <div
                          style={{
                            color: "#16a34a",
                            fontSize: "11px",
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                          }}
                        >
                          Logged in
                        </div>
                        <div
                          style={{
                            color: "#111827",
                            fontSize: "14px",
                            fontWeight: 500,
                            textOverflow: "ellipsis",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {currentAccountEmail}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "12px",
                    }}
                  >
                    {boardBrowserView !== "plan" && [ 
                      { label: "Templates", icon: <LayoutGrid size={16} /> },
                      { label: "Diagram", icon: <LayoutGrid size={16} /> },
                      { label: "Import", icon: <Upload size={16} /> },
                    ].map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        style={{
                          height: "42px",
                          padding: "0 16px",
                          borderRadius: "12px",
                          border: "1px solid rgba(203,213,225,0.84)",
                          background: "#ffffff",
                          color: "#273449",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          fontSize: "13px",
                          fontWeight: 500,
                          cursor: "default",
                          boxShadow: "0 2px 0 rgba(15,23,42,0.02)",
                        }}
                      >
                        {action.icon}
                        {action.label}
                      </button>
                    ))}
                  </div>

                  {boardBrowserView !== "plan" && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "12px",
                        alignItems: "center",
                        opacity: boardBrowserView === "calendar" ? 0.7 : 1,
                      }}
                    >
                      <label
                        style={{
                          flex: "1 1 280px",
                          minWidth: "240px",
                          height: "44px",
                          padding: "0 15px",
                          borderRadius: "12px",
                          border: "1px solid rgba(203,213,225,0.84)",
                          background: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <Search size={16} color="#64748b" />
                        <input
                          value={boardSearchQuery}
                          onChange={(e) => setBoardSearchQuery(e.currentTarget.value)}
                          placeholder={
                            boardBrowserView === "calendar"
                              ? "Search schedules and meetings"
                              : "Search boards"
                          }
                          style={{
                            width: "100%",
                            border: "none",
                            outline: "none",
                            background: "transparent",
                            color: "#0f172a",
                            fontSize: "13px",
                            fontWeight: 520,
                          }}
                        />
                      </label>

                      {boardBrowserView === "calendar" ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => goToCalendarMonth(-12)}
                          style={{
                            height: "44px",
                            padding: "0 14px",
                            borderRadius: "12px",
                            border: "1px solid rgba(203,213,225,0.84)",
                            background: "#ffffff",
                            color: "#0f172a",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "13px",
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          <ChevronLeft size={16} />
                          Year
                        </button>
                        <button
                          type="button"
                          onClick={() => goToCalendarMonth(-1)}
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "12px",
                            border: "1px solid rgba(203,213,225,0.84)",
                            background: "#ffffff",
                            color: "#0f172a",
                            display: "grid",
                            placeItems: "center",
                            cursor: "pointer",
                          }}
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <div
                          style={{
                            height: "44px",
                            padding: "0 16px",
                            borderRadius: "12px",
                            border: "1px solid rgba(203,213,225,0.84)",
                            background: "#ffffff",
                            color: "#0f172a",
                            display: "flex",
                            alignItems: "center",
                            fontSize: "13px",
                            fontWeight: 500,
                          }}
                        >
                          {calendarMonthLabel}
                        </div>
                        <button
                          type="button"
                          onClick={() => goToCalendarMonth(1)}
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "12px",
                            border: "1px solid rgba(203,213,225,0.84)",
                            background: "#ffffff",
                            color: "#0f172a",
                            display: "grid",
                            placeItems: "center",
                            cursor: "pointer",
                          }}
                        >
                          <ChevronRight size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => goToCalendarMonth(12)}
                          style={{
                            height: "44px",
                            padding: "0 14px",
                            borderRadius: "12px",
                            border: "1px solid rgba(203,213,225,0.84)",
                            background: "#ffffff",
                            color: "#0f172a",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "13px",
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          Year
                          <ChevronRight size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => scrollCalendarHorizontally("left")}
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "12px",
                            border: "1px solid rgba(203,213,225,0.84)",
                            background: "#ffffff",
                            color: "#0f172a",
                            display: "grid",
                            placeItems: "center",
                            cursor: "pointer",
                          }}
                          aria-label="Scroll calendar left"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={jumpToCalendarToday}
                          style={{
                            height: "44px",
                            padding: "0 16px",
                            borderRadius: "12px",
                            border: "1px solid rgba(96,165,250,0.7)",
                            background: "#eef6ff",
                            color: "#1d4ed8",
                            display: "flex",
                            alignItems: "center",
                            fontSize: "13px",
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => scrollCalendarHorizontally("right")}
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "12px",
                            border: "1px solid rgba(203,213,225,0.84)",
                            background: "#ffffff",
                            color: "#0f172a",
                            display: "grid",
                            placeItems: "center",
                            cursor: "pointer",
                          }}
                          aria-label="Scroll calendar right"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          height: "46px",
                          padding: "0 16px",
                          borderRadius: "15px",
                          border: "1px solid rgba(203,213,225,0.95)",
                          background: "#ffffff",
                          color: "#475569",
                          display: "flex",
                          alignItems: "center",
                          fontSize: "14px",
                          fontWeight: 600,
                        }}
                      >
                        Modified recently
                      </div>
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      minHeight: 0,
                      overflowY: "auto",
                      paddingRight: "6px",
                      overscrollBehavior: "contain",
                    }}
                  >
                    {boardBrowserView === "plan" ? (
                      <div
                        style={{
                          display: "grid",
                          gap: "18px",
                          alignContent: "start",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.3fr 1fr",
                            gap: "18px",
                          }}
                        >
                          <div
                            style={{
                              minHeight: "220px",
                              borderRadius: "20px",
                              border: "1px solid rgba(59,130,246,0.16)",
                              background:
                                "linear-gradient(90deg, #7c3aed 0%, #3b82f6 50%, #22c55e 100%)",
                              color: "#ffffff",
                              padding: "24px",
                              display: "grid",
                              alignContent: "space-between",
                              boxShadow: "0 24px 60px rgba(59,130,246,0.2)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "start",
                                gap: "16px",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontSize: "13px",
                                    color: "rgba(255,255,255,0.72)",
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Upgrade your workspace
                                </div>
                                <div
                                  style={{
                                    marginTop: "10px",
                                    fontSize: "34px",
                                    lineHeight: 1.05,
                                    fontWeight: 600,
                                    maxWidth: "520px",
                                  }}
                                >
                                  Pick the plan that matches your pace.
                                </div>
                              </div>
                              <div
                                style={{
                                  width: "48px",
                                  height: "48px",
                                  borderRadius: "14px",
                                  background: "rgba(255,255,255,0.12)",
                                  display: "grid",
                                  placeItems: "center",
                                  backdropFilter: "blur(10px)",
                                }}
                              >
                                <Star size={20} />
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                gap: "12px",
                                flexWrap: "wrap",
                              }}
                            >
                              {[
                                "Faster planning",
                                "Smarter scheduling",
                                "Better workspace flow",
                              ].map((badge) => (
                                <div
                                  key={badge}
                                  style={{
                                    height: "34px",
                                    padding: "0 14px",
                                    borderRadius: "999px",
                                    background: "rgba(255,255,255,0.12)",
                                    border: "1px solid rgba(255,255,255,0.16)",
                                    display: "flex",
                                    alignItems: "center",
                                    fontSize: "13px",
                                    color: "rgba(255,255,255,0.88)",
                                  }}
                                >
                                  {badge}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div
                            style={{
                              minHeight: "220px",
                              borderRadius: "20px",
                              border: "1px solid rgba(34,197,94,0.18)",
                              background:
                                "linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)",
                              padding: "22px",
                              display: "grid",
                              gap: "16px",
                              alignContent: "start",
                              boxShadow: "0 18px 40px rgba(34,197,94,0.08)",
                            }}
                          >
                            <div
                              style={{
                                color: "#64748b",
                                fontSize: "12px",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                              }}
                            >
                              Monthly billing
                            </div>
                            <div
                              style={{
                                color: "#0f172a",
                                fontSize: "28px",
                                fontWeight: 600,
                                lineHeight: 1.1,
                              }}
                            >
                              Clear pricing in PLN.
                            </div>
                            <div
                              style={{
                                color: "#64748b",
                                fontSize: "14px",
                                lineHeight: 1.6,
                              }}
                            >
                              Start simple, move up when your boards, schedules, and team rhythm need more room.
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                            gap: "18px",
                          }}
                        >
                          {[
                            {
                              name: "Basic",
                              value: "basic" as const,
                              price: "39.99",
                              accent:
                                "linear-gradient(180deg, rgba(124,58,237,0.08) 0%, rgba(255,255,255,0.98) 62%, rgba(59,130,246,0.06) 100%)",
                              border: "rgba(124,58,237,0.22)",
                              text: "#1f2937",
                              buttonBackground: "#f5f3ff",
                              buttonText: "#6d28d9",
                              checkBackground: "rgba(124,58,237,0.1)",
                              features: [
                                "Calendar planning",
                                "Up to 5 boards",
                                "Personal scheduling",
                              ],
                            },
                            {
                              name: "Pro",
                              value: "pro" as const,
                              price: "59.99",
                              accent:
                                "linear-gradient(90deg, #7c3aed 0%, #3b82f6 50%, #22c55e 100%)",
                              border: "rgba(59,130,246,0.3)",
                              text: "#ffffff",
                              buttonBackground: "#ffffff",
                              buttonText: "#166534",
                              checkBackground: "rgba(255,255,255,0.18)",
                              features: [
                                "Priority workspace",
                                "Up to 12 boards",
                                "Sharper organization tools",
                              ],
                              featured: true,
                            },
                            {
                              name: "Master",
                              value: "master" as const,
                              price: "89.99",
                              accent:
                                "linear-gradient(180deg, rgba(34,197,94,0.08) 0%, rgba(255,255,255,0.98) 58%, rgba(59,130,246,0.08) 100%)",
                              border: "rgba(34,197,94,0.22)",
                              text: "#0f172a",
                              buttonBackground: "#f0fdf4",
                              buttonText: "#166534",
                              checkBackground: "rgba(34,197,94,0.12)",
                              features: [
                                "Full premium experience",
                                "Up to 25 boards",
                                "Maximum workspace control",
                              ],
                            },
                          ].map((plan) => (
                            <div
                              key={plan.name}
                              style={{
                                minHeight: "360px",
                                borderRadius: "20px",
                                border: `1px solid ${plan.border}`,
                                background: plan.accent,
                                padding: "22px",
                                display: "grid",
                                gridTemplateRows: "auto auto 1fr auto",
                                gap: "18px",
                                boxShadow: plan.featured
                                  ? "0 26px 60px rgba(59,130,246,0.22)"
                                  : "0 16px 34px rgba(15,23,42,0.08)",
                                transform: plan.featured ? "translateY(-6px)" : "none",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: "12px",
                                }}
                              >
                                <div
                                  style={{
                                    color: plan.text,
                                    fontSize: "22px",
                                    fontWeight: 600,
                                  }}
                                >
                                  {plan.name}
                                </div>
                                {hasActivePaidSubscription &&
                                  currentAccountPlan.toLowerCase() ===
                                    plan.name.toLowerCase() && (
                                  <div
                                    style={{
                                      height: "28px",
                                      padding: "0 12px",
                                      borderRadius: "999px",
                                      background: plan.featured
                                        ? "rgba(255,255,255,0.18)"
                                        : "rgba(124,58,237,0.08)",
                                      border: plan.featured
                                        ? "1px solid rgba(255,255,255,0.18)"
                                        : "1px solid rgba(124,58,237,0.14)",
                                      color: plan.featured ? "#ffffff" : "#6d28d9",
                                      display: "flex",
                                      alignItems: "center",
                                      fontSize: "12px",
                                      fontWeight: 700,
                                    }}
                                  >
                                    Current plan
                                  </div>
                                )}
                                {plan.featured && (
                                  <div
                                    style={{
                                      height: "28px",
                                      padding: "0 12px",
                                      borderRadius: "999px",
                                      background: "rgba(255,255,255,0.14)",
                                      border: "1px solid rgba(255,255,255,0.18)",
                                      color: "#ffffff",
                                      display: "flex",
                                      alignItems: "center",
                                      fontSize: "12px",
                                    }}
                                  >
                                    Most popular
                                  </div>
                                )}
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "end",
                                  gap: "6px",
                                  color: plan.text,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "44px",
                                    lineHeight: 0.95,
                                    fontWeight: 600,
                                  }}
                                >
                                  {plan.price}
                                </span>
                                <span
                                  style={{
                                    fontSize: "15px",
                                    opacity: plan.featured ? 0.86 : 0.72,
                                    paddingBottom: "7px",
                                  }}
                                >
                                  PLN / month
                                </span>
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gap: "12px",
                                  alignContent: "start",
                                }}
                              >
                                {plan.features.map((feature) => (
                                  <div
                                    key={feature}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "10px",
                                      color: plan.text,
                                      fontSize: "14px",
                                      opacity: plan.featured ? 0.95 : 0.82,
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: "22px",
                                        height: "22px",
                                        borderRadius: "999px",
                                        background: plan.checkBackground,
                                        display: "grid",
                                        placeItems: "center",
                                        flex: "0 0 auto",
                                      }}
                                    >
                                      <Check size={13} />
                                    </div>
                                    {feature}
                                  </div>
                                ))}
                              </div>

                              <button
                                type="button"
                                onClick={() => startPlanCheckout(plan.value)}
                                disabled={
                                  (hasActivePaidSubscription &&
                                    currentAccountPlan === plan.value) ||
                                  Boolean(pendingBillingPlan)
                                }
                                style={{
                                  height: "44px",
                                  borderRadius: "12px",
                                  border: plan.featured
                                    ? "1px solid rgba(255,255,255,0.18)"
                                    : "1px solid rgba(59,130,246,0.14)",
                                  background: plan.buttonBackground,
                                  color: plan.buttonText,
                                  fontSize: "14px",
                                  fontWeight: 500,
                                  cursor:
                                    (hasActivePaidSubscription &&
                                      currentAccountPlan === plan.value) ||
                                    Boolean(pendingBillingPlan)
                                      ? "default"
                                      : "pointer",
                                  opacity:
                                    (hasActivePaidSubscription &&
                                      currentAccountPlan === plan.value) ||
                                    Boolean(pendingBillingPlan)
                                      ? 0.88
                                      : 1,
                                }}
                              >
                                {pendingBillingPlan === plan.value
                                  ? "Opening billing..."
                                  : hasActivePaidSubscription &&
                                    currentAccountPlan === plan.value
                                  ? `${plan.name} active`
                                  : currentPlanRank === 0
                                  ? `Subscribe to ${plan.name}`
                                  : plan.value === "basic"
                                  ? "Switch to Basic"
                                  : currentPlanRank < (plan.value === "master" ? 3 : 2)
                                  ? `Upgrade to ${plan.name}`
                                  : `Change to ${plan.name}`}
                              </button>
                            </div>
                          ))}
                        </div>
                        {billingMessage && (
                          <div
                            style={{
                              marginTop: "18px",
                              padding: "14px 16px",
                              borderRadius: "14px",
                              border:
                                billingMessageTone === "success"
                                  ? "1px solid rgba(34,197,94,0.22)"
                                  : "1px solid rgba(239,68,68,0.18)",
                              background:
                                billingMessageTone === "success"
                                  ? "rgba(240,253,244,0.9)"
                                  : "rgba(254,242,242,0.94)",
                              color:
                                billingMessageTone === "success"
                                  ? "#166534"
                                  : "#b91c1c",
                              fontSize: "14px",
                              fontWeight: 700,
                              lineHeight: 1.45,
                            }}
                          >
                            {billingMessage}
                          </div>
                        )}
                      </div>
                    ) : boardBrowserView === "calendar" ? (
                      <>
                        <div
                          ref={calendarScrollContainerRef}
                          className="calendar-scroll-area"
                          onScroll={syncCalendarScrollFromMain}
                        style={{
                          display: "grid",
                          gap: "12px",
                          overflowX: "auto",
                          paddingBottom: "8px",
                          scrollbarWidth: "auto",
                          msOverflowStyle: "auto",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gap: "12px",
                            minWidth: "1420px",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                              gap: "10px",
                            }}
                          >
                            {calendarWeekdayLabels.map((label) => (
                              <div
                                key={label}
                                style={{
                                  padding: "0 6px",
                                  color: "#475569",
                                  fontSize: "11px",
                                  fontWeight: 500,
                                  letterSpacing: "0.04em",
                                  textTransform: "uppercase",
                                }}
                              >
                                {label}
                              </div>
                            ))}
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                              gap: "10px",
                              alignContent: "start",
                            }}
                          >
                          {calendarDays.map((day) => (
                            <div
                              key={day.key}
                              style={{
                                minHeight: "198px",
                                borderRadius: "12px",
                                border: "1px solid rgba(214,224,238,0.95)",
                                background: day.isToday
                                  ? "linear-gradient(180deg, rgba(59,130,246,0.08) 0%, rgba(255,255,255,1) 62%)"
                                  : "#ffffff",
                                boxShadow: day.isToday
                                  ? "0 14px 28px rgba(59,130,246,0.1)"
                                  : "0 10px 22px rgba(15,23,42,0.045)",
                                padding: "11px",
                                display: "grid",
                                alignContent: "start",
                                gap: "9px",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "26px",
                                  color: day.isToday ? "#2563eb" : "#111827",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "6px",
                                  fontSize: "13px",
                                  fontWeight: 500,
                                  opacity: 1,
                                }}
                              >
                                <span
                                  style={
                                    day.isToday
                                      ? {
                                          minWidth: "28px",
                                          height: "28px",
                                          padding: "0 9px",
                                          borderRadius: "999px",
                                          background:
                                            "linear-gradient(90deg, #7c3aed 0%, #3b82f6 100%)",
                                          color: "#ffffff",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          boxShadow:
                                            "0 10px 18px rgba(59,130,246,0.22)",
                                        }
                                      : undefined
                                  }
                                >
                                  {day.dayNumber ?? ""}
                                </span>
                                <span
                                  style={{
                                    color: day.isToday ? "#2563eb" : "#64748b",
                                    fontSize: "10px",
                                    fontWeight: 500,
                                    letterSpacing: "0.04em",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {calendarDayLabel.format(day.date)}
                                </span>
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gap: "5px",
                                  opacity: 1,
                                }}
                              >
                                {day.entries.map((entry) => (
                                  <div
                                    key={entry.id}
                                    data-calendar-entry-shell="true"
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns:
                                        editingCalendarEntryId === entry.id
                                          ? "minmax(0, 1fr)"
                                          : selectedCalendarEntryId === entry.id
                                          ? "minmax(0, 1fr) auto"
                                          : "minmax(0, 1fr)",
                                      gap: "6px",
                                      alignItems: "start",
                                      position: "relative",
                                    }}
                                  >
                                    {editingCalendarEntryId === entry.id ? (
                                      <div
                                        style={{
                                          display: "grid",
                                          gap: "6px",
                                          padding: "6px",
                                          borderRadius: "10px",
                                          border: "1px solid rgba(147,197,253,0.82)",
                                          background: "#ffffff",
                                          boxShadow:
                                            "0 8px 20px rgba(37,99,235,0.08)",
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr",
                                            gap: "0",
                                          }}
                                        >
                                          <label
                                            style={{
                                              display: "grid",
                                              gap: "0",
                                            }}
                                          >
                                            <div
                                              style={{
                                                position: "relative",
                                              }}
                                            >
                                              <select
                                              value={entry.startHour}
                                              onChange={(e) =>
                                                updateCalendarEntryHours(
                                                  entry.id,
                                                  "startHour",
                                                  e.currentTarget.value
                                                )
                                              }
                                              aria-label="Start time"
                                              style={{
                                                width: "100%",
                                                height: "30px",
                                                padding: "0 6px",
                                                borderRadius: "8px",
                                                border:
                                                  "1px solid rgba(203,213,225,0.95)",
                                                background: "#f8fafc",
                                                color: "#0f172a",
                                                fontSize: "12px",
                                                fontWeight: 500,
                                                outline: "none",
                                                boxSizing: "border-box",
                                              }}
                                            >
                                              {calendarHourOptions.map((option) => (
                                                <option
                                                  key={option.value}
                                                  value={option.value}
                                                >
                                                  {option.shortLabel}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        </label>
                                        </div>
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            gap: "5px",
                                          }}
                                        >
                                          <div
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "5px",
                                              flexWrap: "wrap",
                                            }}
                                          >
                                            {calendarEntryColors.map((color) => {
                                              const isSelected =
                                                getCalendarEntryColor(entry) === color;

                                              return (
                                                <button
                                                  key={color}
                                                  type="button"
                                                  onClick={() =>
                                                    updateCalendarEntryColor(
                                                      entry.id,
                                                      color
                                                    )
                                                  }
                                                  aria-label={`Use ${color} event color`}
                                                  style={{
                                                    width: "19px",
                                                    height: "19px",
                                                    borderRadius: "999px",
                                                    border: isSelected
                                                      ? "2px solid #0f172a"
                                                      : "2px solid rgba(255,255,255,0.95)",
                                                    background: color,
                                                    boxShadow: isSelected
                                                      ? "0 0 0 2px rgba(147,197,253,0.9)"
                                                      : "0 1px 4px rgba(15,23,42,0.12)",
                                                    cursor: "pointer",
                                                    padding: 0,
                                                  }}
                                                />
                                              );
                                            })}
                                            <label
                                              style={{
                                                position: "relative",
                                                width: "22px",
                                                height: "22px",
                                                borderRadius: "999px",
                                                border:
                                                  "2px solid rgba(255,255,255,0.98)",
                                                background: getCalendarEntryColor(entry),
                                                boxShadow:
                                                  calendarEntryColors.includes(
                                                    getCalendarEntryColor(entry)
                                                  )
                                                    ? "0 1px 4px rgba(15,23,42,0.12)"
                                                    : "0 0 0 2px rgba(147,197,253,0.9)",
                                                cursor: "pointer",
                                                overflow: "hidden",
                                                display: "grid",
                                                placeItems: "center",
                                              }}
                                            >
                                              <span
                                                aria-hidden="true"
                                                style={{
                                                  width: "8px",
                                                  height: "8px",
                                                  borderRadius: "999px",
                                                  border: "1.5px solid rgba(255,255,255,0.96)",
                                                  background: "rgba(15,23,42,0.18)",
                                                  boxShadow:
                                                    "0 1px 2px rgba(15,23,42,0.12)",
                                                }}
                                              />
                                              <input
                                                type="color"
                                                value={getCalendarEntryColor(entry)}
                                                onChange={(e) =>
                                                  updateCalendarEntryColor(
                                                    entry.id,
                                                    e.currentTarget.value
                                                  )
                                                }
                                                aria-label="Choose a custom event color"
                                                style={{
                                                  position: "absolute",
                                                  inset: 0,
                                                  width: "100%",
                                                  height: "100%",
                                                  opacity: 0,
                                                  cursor: "pointer",
                                                }}
                                              />
                                            </label>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              lockCalendarEntry(entry.id)
                                            }
                                            aria-label="Confirm calendar entry"
                                            style={{
                                              width: "28px",
                                              height: "28px",
                                              flex: "0 0 auto",
                                              borderRadius: "9px",
                                              border:
                                                "1px solid rgba(34,197,94,0.32)",
                                              background: "#15803d",
                                              color: "#ffffff",
                                              display: "grid",
                                              placeItems: "center",
                                              cursor: "pointer",
                                              boxShadow:
                                                "0 8px 18px rgba(22,163,74,0.18)",
                                              padding: 0,
                                            }}
                                          >
                                            <Check size={15} strokeWidth={3} />
                                          </button>
                                        </div>
                                        <textarea
                                          autoFocus
                                          value={entry.title}
                                          onChange={(e) =>
                                            updateCalendarEntry(
                                              entry.id,
                                              e.currentTarget.value
                                            )
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === "Escape") {
                                              e.preventDefault();
                                              lockCalendarEntry(entry.id);
                                            }

                                            if (e.key === "Enter" && !e.shiftKey) {
                                              e.preventDefault();
                                              lockCalendarEntry(entry.id);
                                            }
                                          }}
                                          placeholder="Meeting, schedule, reminder..."
                                          style={{
                                            width: "100%",
                                            minWidth: "120px",
                                            minHeight: "44px",
                                            padding: "8px",
                                            borderRadius: "9px",
                                            border: "1px solid rgba(203,213,225,0.95)",
                                            background: "#f8fafc",
                                            color: "#0f172a",
                                            fontSize: "12px",
                                            fontWeight: 400,
                                            outline: "none",
                                            resize: "both",
                                            overflow: "auto",
                                            boxSizing: "border-box",
                                            maxWidth: "100%",
                                            fontFamily: "inherit",
                                            lineHeight: 1.4,
                                          }}
                                        />
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          beginEditingCalendarEntry(entry.id)
                                        }
                                        onContextMenu={(e) => {
                                          e.preventDefault();
                                          selectCalendarEntry(entry.id);
                                        }}
                                        style={{
                                          minWidth: 0,
                                          minHeight: "28px",
                                          height: "28px",
                                          padding: "0 9px",
                                          borderRadius: "7px",
                                          border:
                                            selectedCalendarEntryId === entry.id
                                              ? "1px solid rgba(15,23,42,0.28)"
                                              : "1px solid transparent",
                                          background: getCalendarEntryColor(entry),
                                          color: "#ffffff",
                                          fontSize: "12px",
                                          fontWeight: 500,
                                          lineHeight: 1,
                                          textAlign: "left",
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "6px",
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          boxShadow:
                                            selectedCalendarEntryId === entry.id
                                              ? "0 0 0 2px rgba(37,99,235,0.18)"
                                              : "0 4px 10px rgba(15,23,42,0.08)",
                                        }}
                                      >
                                        <span
                                          style={{
                                            flex: "0 0 auto",
                                            color: "rgba(255,255,255,0.92)",
                                            fontSize: "10px",
                                            fontWeight: 500,
                                          }}
                                        >
                                          {getCalendarHourLabel(
                                            entry.startHour,
                                            "short"
                                          )}
                                        </span>
                                        <span
                                          style={{
                                            minWidth: 0,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                          }}
                                        >
                                          {entry.title.trim().length
                                            ? entry.title
                                            : "New meeting"}
                                        </span>
                                      </button>
                                    )}
                                    {selectedCalendarEntryId === entry.id &&
                                      editingCalendarEntryId !== entry.id && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removeCalendarEntry(entry.id);
                                          }}
                                          aria-label="Remove calendar entry"
                                          style={{
                                            position: "absolute",
                                            top: "-8px",
                                            right: "-8px",
                                            width: "28px",
                                            height: "28px",
                                            borderRadius: "999px",
                                            border: "1px solid rgba(248,113,113,0.32)",
                                            background: "#ffffff",
                                            color: "#dc2626",
                                            display: "grid",
                                            placeItems: "center",
                                            cursor: "pointer",
                                            padding: 0,
                                            boxShadow: "0 10px 22px rgba(239,68,68,0.16)",
                                          }}
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      )}
                                  </div>
                                ))}

                                <button
                                  type="button"
                                  onClick={() =>
                                    createCalendarEntry(
                                      getLocalCalendarDateKey(day.date)
                                    )
                                  }
                                  style={{
                                    height: "28px",
                                    borderRadius: "7px",
                                    border: "1px dashed rgba(96,165,250,0.86)",
                                    background: "rgba(239,246,255,0.68)",
                                    color: "#1d4ed8",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "4px",
                                    fontSize: "12px",
                                    fontWeight: 500,
                                    cursor: "pointer",
                                  }}
                                >
                                  <Plus size={12} />
                                  Add
                                </button>
                              </div>
                            </div>
                          ))}
                          </div>
                        </div>

                        {calendarSchedules.length === 0 && (
                          <div
                            style={{
                              minHeight: "260px",
                              borderRadius: "24px",
                              border: "1px dashed rgba(203,213,225,0.95)",
                              background:
                                "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
                              display: "grid",
                              placeItems: "center",
                              padding: "28px",
                              textAlign: "center",
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  color: "#0f172a",
                                  fontSize: "22px",
                                  fontWeight: 750,
                                }}
                              >
                                No schedules on this calendar yet
                              </div>
                              <div
                                style={{
                                  marginTop: "8px",
                                  color: "#64748b",
                                  fontSize: "14px",
                                  lineHeight: 1.5,
                                }}
                              >
                                Add a meeting or schedule to any day and it will stay
                                here with your board.
                              </div>
                            </div>
                          </div>
                        )}
                        </div>

                        <div
                          style={{
                            position: "sticky",
                            bottom: 0,
                            zIndex: 2,
                            paddingTop: "10px",
                            background:
                              "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.92) 38%, rgba(255,255,255,0.98) 100%)",
                          }}
                        >
                          <div
                            ref={calendarBottomScrollbarRef}
                            className="calendar-bottom-scrollbar"
                            onScroll={syncCalendarScrollFromBottom}
                            style={{
                              overflowX: "auto",
                              overflowY: "hidden",
                              paddingBottom: "2px",
                            }}
                          >
                            <div
                              style={{
                                width: "1420px",
                                height: "1px",
                              }}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(220px, 1fr))",
                        gap: "18px",
                        alignContent: "start",
                      }}
                    >
                      {visibleBoards.map((board, index) => {
                        const isActive = board.id === activeBoardId;
                        const isEditing = board.id === editingBoardId;
                        const isInTrash = Boolean(board.deletedAt);

                        return (
                          <div
                            key={board.id}
                            style={{
                              borderRadius: "20px",
                              border: isActive
                                ? "1px solid rgba(59,130,246,0.35)"
                                : "1px solid rgba(226,232,240,0.95)",
                              background: "#ffffff",
                              boxShadow: isActive
                                ? "0 16px 34px rgba(59,130,246,0.12)"
                                : "0 10px 26px rgba(15,23,42,0.06)",
                              overflow: "hidden",
                              cursor: isBoardsLoading ? "default" : "pointer",
                            }}
                            onClick={() => {
                              if (isEditing || isBoardsLoading || isInTrash) return;

                              switchBoard(board.id).catch(() => null);
                              setShowBoardsMenu(false);
                            }}
                          >
                            <div
                              style={{
                                height: "132px",
                                padding: "14px",
                                background: isActive
                                  ? "linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)"
                                  : "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                                borderBottom: "1px solid rgba(226,232,240,0.9)",
                                position: "relative",
                                overflow: "hidden",
                              }}
                            >
                              {renderBoardPreviewContent(board)}
                            </div>

                            <div
                              style={{
                                padding: "16px 16px 15px",
                                display: "grid",
                                gap: "10px",
                              }}
                            >
                              {isEditing ? (
                                <input
                                  ref={boardNameInputRef}
                                  value={editingBoardName}
                                  maxLength={40}
                                  disabled={isBoardsLoading}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setEditingBoardName(e.currentTarget.value)
                                  }
                                  onBlur={() => renameBoard(board.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      renameBoard(board.id);
                                    }

                                    if (e.key === "Escape") {
                                      setEditingBoardId("");
                                      setEditingBoardName("");
                                    }
                                  }}
                                  style={{
                                    height: "40px",
                                    width: "100%",
                                    padding: "0 13px",
                                    borderRadius: "12px",
                                    border: "1px solid rgba(59,130,246,0.3)",
                                    background: "#f8fbff",
                                    color: "#0f172a",
                                    fontSize: "15px",
                                    fontWeight: 700,
                                    fontFamily: appSansFontFamily,
                                    outline: "none",
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    justifyContent: "space-between",
                                    gap: "10px",
                                  }}
                                >
                                  <div
                                    style={{
                                      minWidth: 0,
                                      flex: "1 1 auto",
                                      display: "grid",
                                      gap: "6px",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        if (isBoardsLoading || isInTrash) return;
                                        startRenamingBoard(board);
                                      }}
                                      style={{
                                        padding: 0,
                                        border: "none",
                                      background: "transparent",
                                      color: "#0f172a",
                                      fontSize: "19px",
                                      fontWeight: 780,
                                      fontFamily: appSansFontFamily,
                                      lineHeight: 1.15,
                                      textAlign: "left",
                                      cursor:
                                          isBoardsLoading || isInTrash
                                            ? "default"
                                            : "pointer",
                                      }}
                                      title={
                                        isBoardsLoading || isInTrash
                                          ? undefined
                                          : "Double-click to rename"
                                      }
                                    >
                                      {board.name || `Board ${index + 1}`}
                                    </button>
                                    {isActive && !isInTrash && (
                                      <div
                                        style={{
                                          width: "fit-content",
                                          height: "24px",
                                          padding: "0 10px",
                                          borderRadius: "999px",
                                          border: "1px solid rgba(59,130,246,0.16)",
                                          background: "rgba(219,234,254,0.72)",
                                          color: "#2563eb",
                                          display: "flex",
                                          alignItems: "center",
                                          fontSize: "11px",
                                          fontWeight: 600,
                                          letterSpacing: "0.04em",
                                          textTransform: "uppercase",
                                        }}
                                      >
                                        Active board
                                      </div>
                                    )}
                                  </div>
                                  {!isInTrash && (
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        flex: "0 0 auto",
                                      }}
                                    >
                                      <button
                                        type="button"
                                        aria-label={`${
                                          board.starred ? "Remove" : "Add"
                                        } ${board.name} ${board.starred ? "from" : "to"} starred`}
                                        disabled={isBoardsLoading}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleBoardStarred(board).catch(() => null);
                                        }}
                                        style={{
                                          width: "32px",
                                          height: "32px",
                                          borderRadius: "10px",
                                          border: board.starred
                                            ? "1px solid rgba(245,158,11,0.24)"
                                            : "1px solid rgba(148,163,184,0.18)",
                                          background: "#ffffff",
                                          color: board.starred ? "#f59e0b" : "#64748b",
                                          display: "grid",
                                          placeItems: "center",
                                          cursor: isBoardsLoading ? "default" : "pointer",
                                          padding: 0,
                                        }}
                                      >
                                        <Star
                                          size={15}
                                          fill={board.starred ? "#f59e0b" : "none"}
                                        />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={`Move ${board.name} to trash`}
                                        disabled={isBoardsLoading}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveBoardToTrash(board).catch(() => null);
                                        }}
                                        style={{
                                          width: "32px",
                                          height: "32px",
                                          borderRadius: "10px",
                                          border: "1px solid rgba(239,68,68,0.16)",
                                          background: "#ffffff",
                                          color: "#dc2626",
                                          display: "grid",
                                          placeItems: "center",
                                          cursor: isBoardsLoading ? "default" : "pointer",
                                          padding: 0,
                                        }}
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}

                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "10px",
                                  color: "#64748b",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                }}
                              >
                                <span>{formatBoardDate(board.updatedAt)}</span>
                                <span
                                  style={{
                                    color: isInTrash
                                      ? "#b45309"
                                      : board.starred
                                      ? "#f59e0b"
                                      : isActive
                                      ? "#2563eb"
                                      : "#94a3b8",
                                  }}
                                >
                                  {isInTrash
                                    ? `Deletes after ${formatBoardDate(
                                        new Date(
                                          new Date(
                                            board.deletedAt ?? board.updatedAt
                                          ).getTime() +
                                            30 * 24 * 60 * 60 * 1000
                                        ).toISOString()
                                      )}`
                                    : board.starred
                                    ? "In starred"
                                    : isActive
                                    ? "Open now"
                                    : ""}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {visibleBoards.length === 0 && (
                        <div
                          style={{
                            gridColumn: "1 / -1",
                            minHeight: "260px",
                            borderRadius: "24px",
                            border: "1px dashed rgba(203,213,225,0.95)",
                            background:
                              "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
                            display: "grid",
                            placeItems: "center",
                            padding: "28px",
                            textAlign: "center",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                color: "#0f172a",
                                fontSize: "22px",
                                fontWeight: 750,
                              }}
                            >
                              No boards match that search
                            </div>
                            <div
                              style={{
                                marginTop: "8px",
                                color: "#64748b",
                                fontSize: "14px",
                                lineHeight: 1.5,
                              }}
                            >
                              Try another name, or create a new board for a fresh
                              project.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        )}

        {showSettingsMenu && (
          <div
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setShowSettingsMenu(false);
              }
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.28)",
              backdropFilter: "blur(8px)",
              display: "grid",
              placeItems: "center",
              zIndex: 100,
            }}
          >
            <div
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: "min(920px, calc(100vw - 32px))",
                height: "min(610px, calc(100vh - 82px))",
                borderRadius: "18px",
                border: `1px solid ${panelBorderColor}`,
                background: popoverBackground,
                color: panelTextColor,
                fontFamily: appSansFontFamily,
                WebkitFontSmoothing: "antialiased",
                MozOsxFontSmoothing: "grayscale",
                textRendering: "geometricPrecision",
                boxShadow: "0 24px 70px rgba(15,23,42,0.28)",
                display: "grid",
                gridTemplateColumns: "260px minmax(0, 1fr)",
                overflow: "hidden",
              }}
            >
              <aside
                style={{
                  padding: "22px 18px",
                  borderRight: `1px solid ${panelDividerColor}`,
                  background: isDarkCanvas
                    ? "rgba(20,20,20,0.72)"
                    : isGreyCanvas
                    ? "rgba(31,41,55,0.22)"
                    : "rgba(248,250,252,0.72)",
                }}
              >
                <div
                  style={{
                    marginBottom: "22px",
                    fontSize: "26px",
                    fontWeight: 700,
                    letterSpacing: "0",
                    lineHeight: 1.1,
                  }}
                >
                  Ustawienia
                </div>

                <nav style={{ display: "grid", gap: "8px" }}>
                  {[
                    { id: "background", label: "Tło i wygląd" },
                    { id: "tools", label: "Narzędzia" },
                    { id: "account", label: "Konto" },
                  ].map((item) => {
                    const isActive = activeSettingsSection === item.id;

                    return (
                      <button
                        key={item.id}
                        onClick={() =>
                          setActiveSettingsSection(item.id as SettingsSection)
                        }
                        style={{
                          height: "46px",
                          padding: "0 14px",
                          borderRadius: "8px",
                          border: "none",
                          background: isActive
                            ? selectedControlBackground
                            : "transparent",
                          color: isActive ? panelTextColor : "#94a3b8",
                          display: "flex",
                          alignItems: "center",
                          gap: "11px",
                          fontSize: "15px",
                          fontWeight: isActive ? 650 : 500,
                          lineHeight: 1,
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        {item.id === "background" ? (
                          <Square size={18} />
                        ) : item.id === "tools" ? (
                          <Pen size={18} />
                        ) : (
                          <Lock size={18} />
                        )}
                        {item.label}
                      </button>
                    );
                  })}
                </nav>
              </aside>

              <main
                style={{
                  position: "relative",
                  padding: "56px 36px 34px",
                  overflowY: "auto",
                }}
              >
                <button
                  aria-label="Zamknij ustawienia"
                  onClick={() => setShowSettingsMenu(false)}
                  style={{
                    position: "absolute",
                    top: "18px",
                    right: "18px",
                    width: "34px",
                    height: "34px",
                    border: "none",
                    borderRadius: "8px",
                    background: "transparent",
                    color: "#94a3b8",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <X size={22} />
                </button>

                {activeSettingsSection === "background" && (
                  <>
                    <h2
                      style={{
                        margin: "0 0 24px",
                        fontSize: "24px",
                        fontWeight: 700,
                        letterSpacing: "0",
                        lineHeight: 1.15,
                      }}
                    >
                      Tło i wygląd
                    </h2>
                    <div
                      style={{
                        marginBottom: "12px",
                        color: "#94a3b8",
                        fontSize: "14px",
                        fontWeight: 500,
                        lineHeight: 1.25,
                      }}
                    >
                      Tło tablicy
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
                        gap: "14px",
                      }}
                    >
                      <input
                        ref={backgroundColorInputRef}
                        type="color"
                        value={customCanvasBackground}
                        onChange={(e) => {
                          const nextColor = e.currentTarget.value;
                          setCustomCanvasBackground(nextColor);
                          setCanvasBackground(nextColor);
                        }}
                        aria-label="Wybierz własny kolor tła"
                        style={{
                          position: "absolute",
                          opacity: 0,
                          width: 0,
                          height: 0,
                          pointerEvents: "none",
                        }}
                      />
                      {[
                        {
                          label: "Białe",
                          value: lightCanvasColor,
                          preview: lightCanvasColor,
                        },
                        {
                          label: "Szare",
                          value: greyCanvasColor,
                          preview: greyCanvasColor,
                        },
                        {
                          label: "Czarne",
                          value: darkCanvasColor,
                          preview: darkCanvasColor,
                        },
                        {
                          label: "Kwiatowe",
                          value: floralCanvasBackground,
                          preview: `#ffffff url(${floralBackgroundImage}) center / cover no-repeat`,
                        },
                        {
                          label: "Kolor",
                          value: customCanvasBackground,
                          preview:
                            "linear-gradient(135deg, #ef4444 0%, #facc15 22%, #4ade80 42%, #38bdf8 58%, #7c3aed 76%, #ec4899 100%)",
                          isCustom: true,
                        },
                      ].map((option) => {
                        const isActive = option.isCustom
                          ? canvasBackground === customCanvasBackground
                          : canvasBackground === option.value;

                        return (
                          <button
                            key={option.label}
                            onClick={() => {
                              if (option.isCustom) {
                                setCanvasBackground(customCanvasBackground);
                                backgroundColorInputRef.current?.click();
                                return;
                              }

                              setCanvasBackground(option.value);
                            }}
                            style={{
                              minHeight: "128px",
                              padding: "12px",
                              borderRadius: "14px",
                              border: isActive
                                ? "2px solid rgba(124,58,237,0.72)"
                                : `1px solid ${panelBorderColor}`,
                              background: isActive
                                ? selectedControlBackground
                                : controlBackground,
                              color: panelTextColor,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "11px",
                              fontSize: "14px",
                              fontWeight: 600,
                              lineHeight: 1,
                              cursor: "pointer",
                              boxShadow: isActive
                                ? "0 12px 30px rgba(124,58,237,0.14)"
                                : "0 8px 20px rgba(15,23,42,0.06)",
                            }}
                          >
                            <span
                              style={{
                                position: "relative",
                                width: "64px",
                                height: "64px",
                                borderRadius: "16px",
                                border:
                                  option.value === lightCanvasColor
                                    ? "1px solid rgba(15,23,42,0.14)"
                                    : "1px solid rgba(255,255,255,0.35)",
                                background:
                                  option.isCustom && isActive
                                    ? customCanvasBackground
                                    : option.preview,
                                display: "grid",
                                placeItems: "center",
                                boxShadow:
                                  "inset 0 0 0 1px rgba(255,255,255,0.28)",
                                overflow: "hidden",
                              }}
                            >
                              {isActive && (
                                <span
                                  style={{
                                    width: "26px",
                                    height: "26px",
                                    borderRadius: "999px",
                                    background: "#a3e635",
                                    color: "#111827",
                                    display: "grid",
                                    placeItems: "center",
                                    boxShadow:
                                      "0 8px 18px rgba(132,204,22,0.28)",
                                  }}
                                >
                                  <Check size={15} strokeWidth={3} />
                                </span>
                              )}
                            </span>
                            <span>{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div
                      style={{
                        marginTop: "26px",
                        paddingTop: "22px",
                        borderTop: `1px solid ${panelDividerColor}`,
                      }}
                    >
                      <div
                        style={{
                          marginBottom: "12px",
                          color: "#94a3b8",
                          fontSize: "14px",
                          fontWeight: 500,
                          lineHeight: 1.25,
                        }}
                      >
                        Tryb siatki
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(116px, 1fr))",
                          gap: "12px",
                        }}
                      >
                        {[
                          {
                            label: "Brak",
                            value: "none",
                            spacing: 0,
                          },
                          {
                            label: "Mała",
                            value: "small",
                            spacing: 13,
                          },
                          {
                            label: "Standard",
                            value: "standard",
                            spacing: 20,
                          },
                          {
                            label: "Duża",
                            value: "large",
                            spacing: 32,
                          },
                        ].map((option) => {
                          const isActive = gridMode === option.value;
                          const previewBackground =
                            option.value === "none"
                              ? "linear-gradient(135deg, rgba(148,163,184,0.12), rgba(148,163,184,0.04))"
                              : `linear-gradient(rgba(100,116,139,0.28) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.28) 1px, transparent 1px)`;

                          return (
                            <button
                              key={option.value}
                              onClick={() =>
                                setGridMode(option.value as GridMode)
                              }
                              style={{
                                minHeight: "98px",
                                padding: "10px",
                                borderRadius: "14px",
                                border: isActive
                                  ? "2px solid rgba(124,58,237,0.72)"
                                  : `1px solid ${panelBorderColor}`,
                                background: isActive
                                  ? selectedControlBackground
                                  : controlBackground,
                                color: panelTextColor,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "9px",
                                fontSize: "13px",
                                fontWeight: 600,
                                cursor: "pointer",
                                boxShadow: isActive
                                  ? "0 12px 30px rgba(124,58,237,0.12)"
                                  : "0 8px 18px rgba(15,23,42,0.05)",
                              }}
                            >
                              <span
                                style={{
                                  position: "relative",
                                  width: "58px",
                                  height: "42px",
                                  borderRadius: "10px",
                                  border: "1px solid rgba(148,163,184,0.26)",
                                  background: previewBackground,
                                  backgroundSize:
                                    option.value === "none"
                                      ? "100% 100%"
                                      : `${option.spacing}px ${option.spacing}px`,
                                  overflow: "hidden",
                                }}
                              >
                                {option.value === "none" && (
                                  <span
                                    style={{
                                      position: "absolute",
                                      left: "9px",
                                      right: "9px",
                                      top: "50%",
                                      height: "2px",
                                      borderRadius: "999px",
                                      background: "rgba(100,116,139,0.48)",
                                      transform: "rotate(-28deg)",
                                    }}
                                  />
                                )}
                                {isActive && (
                                  <span
                                    style={{
                                      position: "absolute",
                                      right: "5px",
                                      bottom: "5px",
                                      width: "20px",
                                      height: "20px",
                                      borderRadius: "999px",
                                      background: "#a3e635",
                                      color: "#111827",
                                      display: "grid",
                                      placeItems: "center",
                                      boxShadow:
                                        "0 8px 18px rgba(132,204,22,0.24)",
                                    }}
                                  >
                                    <Check size={12} strokeWidth={3} />
                                  </span>
                                )}
                              </span>
                              <span>{option.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div
                        style={{
                          marginTop: "18px",
                          padding: "14px 16px",
                          borderRadius: "14px",
                          border: `1px solid ${panelBorderColor}`,
                          background: controlBackground,
                          boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            marginBottom: "10px",
                            color: panelTextColor,
                            fontSize: "13px",
                            fontWeight: 600,
                          }}
                        >
                          <span>Przezroczystość siatki</span>
                          <span style={{ color: "#94a3b8" }}>
                            {gridOpacity}%
                          </span>
                        </div>
                        <input
                          type="range"
                          className="modern-range"
                          min="0"
                          max="80"
                          value={gridOpacity}
                          onChange={(e) =>
                            setGridOpacity(Number(e.currentTarget.value))
                          }
                          style={{
                            accentColor: "#7c3aed",
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeSettingsSection === "tools" && (
                  <>
                    <h2
                      style={{
                        margin: "0 0 24px",
                        fontSize: "24px",
                        fontWeight: 700,
                        letterSpacing: "0",
                        lineHeight: 1.15,
                      }}
                    >
                      Narzędzia
                    </h2>
                    <div style={{ display: "grid", gap: "12px" }}>
                      {[
                        { label: "Kursor", value: "cursor" },
                        { label: "Pióro", value: "pen" },
                        { label: "Gumka", value: "eraser" },
                      ].map((option) => {
                        const isActive = tool === option.value;

                        return (
                          <button
                            key={option.value}
                            onClick={() =>
                              setTool(option.value as "cursor" | "pen" | "eraser")
                            }
                            style={{
                              minHeight: "58px",
                              padding: "0 16px",
                              borderRadius: "10px",
                              border: `1px solid ${panelBorderColor}`,
                              background: isActive
                                ? selectedControlBackground
                                : controlBackground,
                              color: panelTextColor,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              fontSize: "15px",
                              fontWeight: 600,
                              lineHeight: 1,
                              cursor: "pointer",
                            }}
                          >
                            {option.label}
                            {isActive && <Check size={18} />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {activeSettingsSection === "account" && (
                  <>
                    <h2
                      style={{
                        margin: "0 0 24px",
                        fontSize: "24px",
                        fontWeight: 700,
                        letterSpacing: "0",
                        lineHeight: 1.15,
                      }}
                    >
                      Konto
                    </h2>
                    {currentAccountEmail && (
                      <div
                        style={{
                          display: "grid",
                          gap: "12px",
                          maxWidth: "360px",
                        }}
                      >
                        <div
                          style={{
                            padding: "14px 16px",
                            borderRadius: "12px",
                            border: `1px solid ${panelBorderColor}`,
                            background: controlBackground,
                            color: panelTextColor,
                            fontSize: "14px",
                            fontWeight: 700,
                            lineHeight: 1.35,
                          }}
                        >
                          Signed in as
                          <div style={{ marginTop: "4px", color: "#7c3aed" }}>
                            {currentAccountName || currentAccountEmail}
                          </div>
                          <div
                            style={{
                              marginTop: "6px",
                              color: "#64748b",
                              fontSize: "13px",
                              fontWeight: 600,
                            }}
                          >
                            {currentAccountEmail}
                          </div>
                        </div>
                        <div
                          style={{
                            padding: "14px 16px",
                            borderRadius: "12px",
                            border: `1px solid ${panelBorderColor}`,
                            background: controlBackground,
                            color: panelTextColor,
                            fontSize: "14px",
                            fontWeight: 700,
                            lineHeight: 1.35,
                          }}
                        >
                          Workspace plan
                          <div
                            style={{
                              marginTop: "8px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "8px",
                              height: "30px",
                              padding: "0 12px",
                              borderRadius: "999px",
                              background: "rgba(124,58,237,0.1)",
                              color: "#6d28d9",
                              fontSize: "13px",
                              fontWeight: 800,
                              textTransform: "capitalize",
                            }}
                          >
                            {currentPlanLabel}
                          </div>
                          <div
                            style={{
                              marginTop: "10px",
                              color: "#64748b",
                              fontSize: "12px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            {currentSubscriptionStatus.replace("_", " ")}
                          </div>
                        </div>
                        <button
                          onClick={signOut}
                          style={{
                            width: "220px",
                            height: "42px",
                            borderRadius: "10px",
                            border: `1px solid ${panelBorderColor}`,
                            background: controlBackground,
                            color: panelTextColor,
                            fontSize: "14px",
                            fontWeight: 650,
                            cursor: "pointer",
                          }}
                        >
                          Log out
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setShowSettingsMenu(false);
                        openAuthModal("login");
                      }}
                      style={{
                        width: "220px",
                        height: "42px",
                        display: currentAccountEmail ? "none" : "inline-block",
                        borderRadius: "10px",
                        border: "none",
                        background:
                          "linear-gradient(90deg, #7c3aed 0%, #3b82f6 100%)",
                        color: "#ffffff",
                        fontSize: "14px",
                        fontWeight: 650,
                        cursor: "pointer",
                      }}
                    >
                      Zaloguj się
                    </button>
                  </>
                )}
              </main>
            </div>
          </div>
        )}

        {currentAccountEmail && (
          <div
            ref={profileMenuContainerRef}
            style={{
              position: "absolute",
              top: "50%",
              right: "16px",
              transform: "translateY(-50%)",
              display: "grid",
              justifyItems: "end",
              gap: "10px",
            }}
          >
            <button
              type="button"
              onClick={() => setShowProfileMenu((previous) => !previous)}
              style={{
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
              aria-label={`Logged in as ${currentAccountEmail}`}
              title={currentAccountEmail}
            >
              <UserRound size={18} />
            </button>
            {showProfileMenu && (
              <div
                style={{
                  minWidth: "166px",
                  padding: "12px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.24)",
                  background: "rgba(20,24,33,0.92)",
                  boxShadow: "0 18px 36px rgba(15,23,42,0.28)",
                  backdropFilter: "blur(16px)",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    fontSize: "11px",
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Account
                </div>
                <div
                  style={{
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 700,
                    lineHeight: 1.3,
                  }}
                >
                  {currentAccountName || currentAccountEmail}
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.72)",
                    fontSize: "12px",
                    fontWeight: 500,
                    lineHeight: 1.3,
                  }}
                >
                  {currentAccountEmail}
                </div>
                <div
                  style={{
                    justifySelf: "start",
                    height: "26px",
                    padding: "0 10px",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.08)",
                    color: "#c4b5fd",
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {currentPlanLabel} plan
                </div>
                <button
                  type="button"
                  onClick={signOut}
                  style={{
                    height: "38px",
                    padding: "0 16px",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "linear-gradient(90deg, #22c55e 0%, #34d399 100%)",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        )}

        <button
          aria-label="Zaloguj się"
          onClick={() => openAuthModal("login")}
          style={{
            position: "absolute",
            top: "50%",
            right: "153px",
            transform: "translateY(-50%)",
            height: "30px",
            padding: "0 17px",
            borderRadius: "999px",
            border: "1.5px solid rgba(255,255,255,0.34)",
            background: "rgba(255,255,255,0.08)",
            color: "#ffffff",
            display: currentAccountEmail ? "none" : "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: appSansFontFamily,
            fontSize: "14px",
            fontWeight: 500,
            letterSpacing: "0.01em",
            lineHeight: 1,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
          }}
        >
          Zaloguj się
        </button>

        <button
          aria-label="Zarejestruj się"
          onClick={() => openAuthModal("register")}
          onMouseEnter={() => setIsRegisterHovered(true)}
          onMouseLeave={() => setIsRegisterHovered(false)}
          style={{
            position: "absolute",
            top: "50%",
            right: "16px",
            transform: "translateY(-50%)",
            height: "30px",
            padding: "0 17px",
            borderRadius: "999px",
            border: "1.5px solid rgba(255,255,255,0.74)",
            background: isRegisterHovered
              ? "linear-gradient(90deg, #7c3aed 0%, #3b82f6 50%, #22c55e 100%)"
              : "#ffffff",
            color: isRegisterHovered ? "#ffffff" : "#7c3aed",
            display: currentAccountEmail ? "none" : "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: appSansFontFamily,
            fontSize: "14px",
            fontWeight: 500,
            letterSpacing: "0.01em",
            lineHeight: 1,
            cursor: "pointer",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.45)",
            transition: "background 0.2s ease, color 0.2s ease",
          }}
        >
          <span
            style={{
              backgroundImage: isRegisterHovered
                ? "none"
                : "linear-gradient(90deg, #7c3aed 0%, #3b82f6 50%, #22c55e 100%)",
              backgroundClip: isRegisterHovered ? "border-box" : "text",
              WebkitBackgroundClip: isRegisterHovered ? "border-box" : "text",
              WebkitTextFillColor: isRegisterHovered
                ? "#ffffff"
                : "transparent",
              display: "inline-block",
              lineHeight: 1.25,
              paddingBottom: "1px",
              WebkitFontSmoothing: "antialiased",
              MozOsxFontSmoothing: "grayscale",
              textRendering: "geometricPrecision",
            }}
          >
            Zarejestruj się
          </span>
        </button>

      </div>

      <div
        onPointerEnter={hidePenCursor}
        onPointerMove={hidePenCursor}
        style={{
          position: "fixed",
          top: "50%",
          left: "30px",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: "9px",
          padding: "6px",
          borderRadius: "11px",
          background: toolbarBackground,
          backdropFilter: "blur(10px)",
          boxShadow: "0 8px 25px rgba(0,0,0,0.18)",
          cursor: "default",
          zIndex: 20,
        }}
      >
        <input
          ref={fileUploadRef}
          type="file"
          multiple
          onChange={(e) => {
            e.currentTarget.value = "";
          }}
          style={{ display: "none" }}
        />

        <button
          aria-label="Upload files"
          onClick={() => {
            if (activeText) {
              commitActiveText();
            }

            setShowPenMenu(false);
            setShowTextMenu(false);
            setShowEraserMenu(false);
            setShowShapesMenu(false);
            fileUploadRef.current?.click();
          }}
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "8px",
            border: "none",
            background: inactiveToolBackground,
            color: panelTextColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <Upload size={18} />
        </button>

        <button
          onClick={() => {
            setTool("cursor");
            setShowPenMenu(false);
            setShowTextMenu(false);
            setShowEraserMenu(false);
            setShowShapesMenu(false);
          }}
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "8px",
            border: "none",
            background: isCursorActive ? "#7c3aed" : inactiveToolBackground,
            color: isCursorActive ? "white" : panelTextColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <MousePointer2 size={17} />
        </button>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => {
              setTool("text");
              setShowTextMenu(false);
              setShowPenMenu(false);
              setShowEraserMenu(false);
              setShowShapesMenu(false);
            }}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "8px",
              border: "none",
              background: isTextActive ? "#7c3aed" : inactiveToolBackground,
              color: isTextActive ? "white" : panelTextColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <Type size={18} />
          </button>
        </div>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => {
              const nextIsOpen = !(tool === "pen" && showPenMenu);
              setTool("pen");
              setShowPenMenu(nextIsOpen);
              setShowTextMenu(false);
              setShowEraserMenu(false);
              setShowShapesMenu(false);
            }}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "8px",
              border: "none",
              background: tool === "pen" ? "#7c3aed" : inactiveToolBackground,
              color: tool === "pen" ? "white" : panelTextColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <Pen size={17} />
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
                background: popoverBackground,
                color: panelTextColor,
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
                  className="modern-range"
                  min="1"
                  max="24"
                  value={penWidth}
                  onChange={(e) => setPenWidth(Number(e.target.value))}
                  style={{
                    accentColor: "#7c3aed",
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

              <div
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "flex-start",
                  gap: "3px",
                  paddingTop: "6px",
                  borderTop: `1px solid ${panelDividerColor}`,
                }}
              >
                {(["solid", "dashed", "dotted"] as StrokeStyle[]).map(
                  (styleOption) => (
                    <button
                      key={styleOption}
                      aria-label={
                        styleOption === "solid"
                          ? "Solid pen style"
                          : styleOption === "dashed"
                          ? "Dashed pen style"
                          : "Dotted pen style"
                      }
                      onClick={() => setStrokeStyle(styleOption)}
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "6px",
                        border:
                          strokeStyle === styleOption
                            ? "2px solid #7c3aed"
                            : `1px solid ${panelBorderColor}`,
                        background:
                          strokeStyle === styleOption
                            ? selectedControlBackground
                            : controlBackground,
                        display: "grid",
                        placeItems: "center",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {styleOption === "solid" ? (
                        <div
                          style={{
                            width: "10px",
                            height: "2px",
                            background: panelTextColor,
                          }}
                        />
                      ) : styleOption === "dashed" ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "12px",
                          }}
                        >
                          {Array.from({ length: 3 }).map((_, index) => (
                            <div
                              key={index}
                              style={{
                                width: "3px",
                                height: "3px",
                                background: panelTextColor,
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "12px",
                          }}
                        >
                          {Array.from({ length: 3 }).map((_, index) => (
                            <div
                              key={index}
                              style={{
                                width: "3px",
                                height: "3px",
                                borderRadius: "999px",
                                background: panelTextColor,
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </button>
                  )
                )}
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
              setShowTextMenu(false);
              setShowShapesMenu(false);
            }}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "8px",
              border: "none",
              background:
                tool === "eraser" ? "#7c3aed" : inactiveToolBackground,
              color: tool === "eraser" ? "white" : panelTextColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <Eraser size={17} />
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
                background: popoverBackground,
                color: panelTextColor,
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
                className="modern-range"
                min="8"
                max="64"
                value={eraserWidth}
                onChange={(e) => setEraserWidth(Number(e.target.value))}
                style={{
                  accentColor: "#7c3aed",
                }}
              />
              <div
                style={{
                  width: `${Math.max(8, eraserWidth)}px`,
                  height: `${Math.max(8, eraserWidth)}px`,
                  borderRadius: "999px",
                  background: canvasFillColor,
                  flexShrink: 0,
                }}
              />
            </div>
          )}
        </div>

        <button
          onClick={clearCanvas}
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "8px",
            border: "none",
            background: inactiveToolBackground,
            color: panelTextColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <Trash2 size={17} />
        </button>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => {
              setShowShapesMenu((prev) => !prev);
              setShowPenMenu(false);
              setShowTextMenu(false);
              setShowEraserMenu(false);
            }}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "8px",
              border: "none",
              background: ["circle", "square", "arrow", "line"].includes(tool)
                ? "#7c3aed"
                : inactiveToolBackground,
              color: ["circle", "square", "arrow", "line"].includes(tool)
                ? "#fff"
                : panelTextColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Shapes size={17} />
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
                background: popoverBackground,
                boxShadow: "0 8px 25px rgba(0,0,0,0.18)",
              }}
            >
              <button
                onClick={() => {
                  setTool("circle");
                  setShowShapesMenu(false);
                  setShowPenMenu(false);
                  setShowTextMenu(false);
                  setShowEraserMenu(false);
                }}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: panelTextColor,
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
                  setShowTextMenu(false);
                  setShowEraserMenu(false);
                }}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: panelTextColor,
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
                  setShowTextMenu(false);
                  setShowEraserMenu(false);
                }}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: panelTextColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <ArrowRight size={18} />
              </button>

              <button
                onClick={() => {
                  setTool("line");
                  setShowShapesMenu(false);
                  setShowPenMenu(false);
                  setShowTextMenu(false);
                  setShowEraserMenu(false);
                }}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: panelTextColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Minus size={20} />
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

