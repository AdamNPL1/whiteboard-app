"use client";

import Link from "next/link";
import NextImage from "next/image";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Pen,
  Eraser,
  Trash2,
  Shapes,
  Circle,
  Square,
  Triangle,
  Minus,
  MousePointer2,
  Type,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowRight,
  Bold,
  BookOpenText,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Download,
  Italic,
  LayoutGrid,
  Languages,
  List,
  ListOrdered,
  Lock,
  Mail,
  Clock3,
  History,
  CloudOff,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Redo2,
  Ruler,
  Search,
  Settings,
  Share2,
  Send,
  Star,
  Underline,
  Undo2,
  Upload,
  UserRound,
  Sun,
  Crown,
  LogOut,
  AlertTriangle,
  Video,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useLanguage } from "@/lib/i18n";
import { useCall } from "@/app/components/CallProvider";
import TurnstileWidget from "@/app/components/TurnstileWidget";
import SupportChatbot from "@/app/components/SupportChatbot";
import { reportRealtimeDiagnostics } from "@/lib/realtime-diagnostics";
import {
  LIVE_STROKE_PROTOCOL_VERSION,
  MAX_LIVE_STROKE_BATCH_POINTS,
  MAX_LIVE_STROKE_POINTS,
  parseLiveStrokePoints,
  parseLiveStrokeStart,
} from "@/lib/board-live-strokes";

type ShapeTool =
  | "circle"
  | "square"
  | "triangle"
  | "arrow"
  | "line"
  | "ruler"
  | "oval"
  | "curve";
type StrokeTool = "pen" | "eraser";
type Point = { x: number; y: number };

const DRAWABLE_SHAPE_TOOLS = new Set<ShapeTool>([
  "circle",
  "square",
  "triangle",
  "arrow",
  "line",
  "ruler",
  "oval",
  "curve",
]);

const isDrawableShapeTool = (candidate: string): candidate is ShapeTool =>
  DRAWABLE_SHAPE_TOOLS.has(candidate as ShapeTool);

const BLACK_CROSSHAIR_CURSOR =
  'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22%3E%3Cpath d=%22M12 1v22M1 12h22%22 stroke=%22white%22 stroke-width=%224%22/%3E%3Cpath d=%22M12 1v22M1 12h22%22 stroke=%22black%22 stroke-width=%222%22/%3E%3C/svg%3E") 12 12, crosshair';

const ERASER_CURSOR =
  'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%225%22 y1=%2219%22 x2=%2219%22 y2=%225%22 gradientUnits=%22userSpaceOnUse%22%3E%3Cstop stop-color=%22%239b4df1%22/%3E%3Cstop offset=%221%22 stop-color=%22%2358b9df%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cg transform=%22rotate(45 12 12)%22 fill=%22none%22 stroke=%22url(%23g)%22 stroke-width=%222.5%22 stroke-linejoin=%22round%22%3E%3Crect x=%226.5%22 y=%222.5%22 width=%2211%22 height=%2219%22 rx=%223.5%22/%3E%3Cpath d=%22M6.5 14.5h11%22/%3E%3C/g%3E%3C/svg%3E") 12 12, auto';

type Stroke = {
  kind: "stroke";
  id?: string;
  points: Point[];
  tool: StrokeTool;
  width: number;
  color?: string;
  style?: StrokeStyle;
};
type RemoteLiveStroke = {
  stroke: Stroke;
  senderId: string;
  sequence: number;
  updatedAt: number;
  completedAt?: number;
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
type ImageElement = {
  kind: "image";
  point: Point;
  width: number;
  height: number;
  src: string;
  name: string;
  rotation?: number;
};
type ConverterKind = "km-mi" | "kg-lb" | "c-f" | "gb-mb" | "cm-in";
type ConverterElement = {
  kind: "converter";
  point: Point;
  width: number;
  height: number;
  converter: ConverterKind;
  value: number;
};
type CalculatorElement = {
  kind: "calculator";
  point: Point;
  width: number;
  height: number;
  expression: string;
};
type CanvasElement =
  | Stroke
  | Shape
  | TextElement
  | ImageElement
  | ConverterElement
  | CalculatorElement;
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

const converterOptions: Array<{
  value: ConverterKind;
  label: string;
  inputUnit: string;
  outputUnit: string;
}> = [
  { value: "km-mi", label: "Kilometres → miles", inputUnit: "km", outputUnit: "mi" },
  { value: "kg-lb", label: "Kilograms → pounds", inputUnit: "kg", outputUnit: "lb" },
  { value: "c-f", label: "Celsius → Fahrenheit", inputUnit: "°C", outputUnit: "°F" },
  { value: "gb-mb", label: "Gigabytes → megabytes", inputUnit: "GB", outputUnit: "MB" },
  { value: "cm-in", label: "Centimetres → inches", inputUnit: "cm", outputUnit: "in" },
];

const convertBoardValue = (kind: ConverterKind, value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (kind === "km-mi") return value * 0.621371;
  if (kind === "kg-lb") return value * 2.20462;
  if (kind === "c-f") return value * 1.8 + 32;
  if (kind === "gb-mb") return value * 1024;
  return value / 2.54;
};

const formatConvertedValue = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);

const calculateExpression = (expression: string): number | null => {
  const source = expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  if (!source || !/^[0-9+\-*/().]+$/.test(source)) return null;
  let index = 0;
  const parseNumber = (): number => {
    if (source[index] === "(") {
      index += 1;
      const value = parseAddSubtract();
      if (source[index] !== ")") throw new Error("Missing closing parenthesis");
      index += 1;
      return value;
    }
    const start = index;
    if (source[index] === "+" || source[index] === "-") index += 1;
    while (/[0-9.]/.test(source[index] ?? "")) index += 1;
    const value = Number(source.slice(start, index));
    if (!Number.isFinite(value)) throw new Error("Invalid number");
    return value;
  };
  const parseMultiplyDivide = (): number => {
    let value = parseNumber();
    while (source[index] === "*" || source[index] === "/") {
      const operator = source[index++];
      const next = parseNumber();
      value = operator === "*" ? value * next : value / next;
    }
    return value;
  };
  function parseAddSubtract(): number {
    let value = parseMultiplyDivide();
    while (source[index] === "+" || source[index] === "-") {
      const operator = source[index++];
      const next = parseMultiplyDivide();
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  }
  try {
    const value = parseAddSubtract();
    return index === source.length && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};
type SelectionMenu = {
  x: number;
  y: number;
};
type TextSelection = {
  start: number;
  end: number;
};
type SettingsSection = "background" | "language" | "account";
type GridMode = "none" | "dots" | "small" | "standard" | "large";
type TextResizeHandle = "n" | "e" | "s" | "w" | "nw" | "ne" | "sw" | "se";
type CanvasPointerInput = Pick<PointerEvent, "clientX" | "clientY">;
type AuthMode = "login" | "register";
type SocialAuthProvider = "google" | "apple";
const enabledSocialProviders: Array<{
  label: string;
  value: SocialAuthProvider;
}> = [
  ...(process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true"
    ? [{ label: "Google", value: "google" as const }]
    : []),
  ...(process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED === "true"
    ? [{ label: "Apple", value: "apple" as const }]
    : []),
];
type BoardSaveState =
  | "saved"
  | "dirty"
  | "saving"
  | "error"
  | "offline"
  | "conflict";
type PublicAccount = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt?: string;
  plan: "basic" | "pro" | "master";
  subscriptionStatus: "inactive" | "trialing" | "active" | "past_due" | "canceled";
  subscriptionCancelAtPeriodEnd?: boolean;
  subscriptionCurrentPeriodEnd?: string | null;
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
  ownedByUser?: boolean;
  shareCount?: number;
  sharePermission?: "viewer" | "editor";
};
type BoardShareSummary = {
  id: string;
  email: string;
  createdAt: string;
  status: "pending" | "accepted";
  permission: "viewer" | "editor";
  expiresAt?: string;
  acceptedAt?: string;
};
type BoardVersionSummary = {
  id: string;
  boardName: string;
  reason: "automatic" | "before_restore" | "before_trash";
  sourceUpdatedAt: string;
  createdAt: string;
  elementCount: number;
  calendarEntryCount: number;
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
  const { language, setLanguage, text: t } = useLanguage();
  const { setBoardContext } = useCall();
  const topBarHeight = 48;
  const appSansFontFamily =
    'var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const accountPanelFontFamily = appSansFontFamily;
  const lightCanvasColor = "#ffffff";
  const greyCanvasColor = "#6b7280";
  const darkCanvasColor = "#111111";
  const neonCanvasBackground = "neon";
  const neonCanvasBaseColor = "#070816";
  const classicRulerColor = "#d0a12b";
  const classicRulerTextColor = "#3b2908";
  const floralCanvasBackground = "floral";
  const floralBackgroundImage = "/floral-background.png";
  const floralBackgroundTile = { width: 1600, height: 900 };
  const basePenColors = [
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
  const neonPenColors = [
    { name: "neon cyan", value: "#39ffef" },
    { name: "electric blue", value: "#38bdf8" },
    { name: "neon violet", value: "#a855f7" },
    { name: "hot pink", value: "#ff4fd8" },
    { name: "laser red", value: "#ff416c" },
    { name: "neon orange", value: "#ff8a1f" },
    { name: "acid yellow", value: "#f5ff3b" },
    { name: "neon lime", value: "#9dff3b" },
    { name: "bright green", value: "#35ff8a" },
    { name: "white", value: "#ffffff" },
    { name: "soft lavender", value: "#d8b4fe" },
    { name: "aqua", value: "#67e8f9" },
    { name: "magenta", value: "#f472ff" },
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
  const importedImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const imageTransformRef = useRef<{
    mode: "move" | "resize" | "rotate";
    pointerId: number;
    index: number;
    startClient: Point;
    startImage: ImageElement;
    startDistance?: number;
    startAngle?: number;
    didRecordHistory?: boolean;
  } | null>(null);
  const converterDragRef = useRef<{
    index: number;
    pointerId: number;
    startClient: Point;
    startPoint: Point;
    didRecordHistory: boolean;
  } | null>(null);
  const calculatorDragRef = useRef<{
    index: number;
    pointerId: number;
    startClient: Point;
    startPoint: Point;
    didRecordHistory: boolean;
  } | null>(null);
  const backgroundColorInputRef = useRef<HTMLInputElement | null>(null);
  const floralBackgroundRef = useRef<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<
    "cursor" | "text" | "textbox" | StrokeTool | ShapeTool
  >("pen");
  const [showShapesMenu, setShowShapesMenu] = useState(false);
  const [showPenMenu, setShowPenMenu] = useState(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [showSpecialTools, setShowSpecialTools] = useState(false);
  const [showBrainstormMenu, setShowBrainstormMenu] = useState(false);
  const [showPersonalLayer, setShowPersonalLayer] = useState(false);
  const [personalNoteTitle, setPersonalNoteTitle] = useState("My private notes");
  const [personalNoteContent, setPersonalNoteContent] = useState("");
  const [personalNoteLoadedBoardId, setPersonalNoteLoadedBoardId] = useState("");
  const [personalNoteSaveState, setPersonalNoteSaveState] = useState<"loading" | "saving" | "saved" | "error">("loading");
  const [isInterfaceDarkMode, setIsInterfaceDarkMode] = useState(false);
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
  const penColors =
    canvasBackground === neonCanvasBackground ? neonPenColors : basePenColors;
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
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [welcomeCelebration, setWelcomeCelebration] = useState<{
    name: string;
    kind: "login" | "created" | "logout";
  } | null>(null);
  const [showGuestWelcome, setShowGuestWelcome] = useState(true);
  const [showGuestFeatureShowcase, setShowGuestFeatureShowcase] = useState(false);
  const [guestFeatureIndex, setGuestFeatureIndex] = useState(0);
  const guestFeatureTrackRef = useRef<HTMLDivElement | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);
  const [currentAccountName, setCurrentAccountName] = useState("");
  const [currentAccountEmail, setCurrentAccountEmail] = useState("");
  const [currentAccountId, setCurrentAccountId] = useState("");

  useEffect(() => {
    if (!currentAccountId) {
      setIsInterfaceDarkMode(false);
      return;
    }

    setIsInterfaceDarkMode(
      window.localStorage.getItem("scriboo-interface-theme") === "dark"
    );
  }, [currentAccountId]);

  useEffect(() => {
    const theme = currentAccountId && isInterfaceDarkMode ? "dark" : "light";
    document.documentElement.dataset.scribooTheme = theme;

    if (currentAccountId) {
      window.localStorage.setItem("scriboo-interface-theme", theme);
    }
  }, [currentAccountId, isInterfaceDarkMode]);

  const [currentAccountPlan, setCurrentAccountPlan] = useState<
    "basic" | "pro" | "master"
  >(
    "basic"
  );
  const [currentSubscriptionStatus, setCurrentSubscriptionStatus] = useState<
    "inactive" | "trialing" | "active" | "past_due" | "canceled"
  >("inactive");
  const [currentSubscriptionCancelAtPeriodEnd, setCurrentSubscriptionCancelAtPeriodEnd] =
    useState(false);
  const [currentSubscriptionCurrentPeriodEnd, setCurrentSubscriptionCurrentPeriodEnd] =
    useState<string | null>(null);
  const [currentMaxBoards, setCurrentMaxBoards] = useState(5);
  const [boardActionMessage, setBoardActionMessage] = useState("");
  const [confirmationDialog, setConfirmationDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    tone: "default" | "danger";
  } | null>(null);
  const confirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const requestConfirmation = useCallback(
    (options: {
      title: string;
      message: string;
      confirmLabel?: string;
      tone?: "default" | "danger";
    }) =>
      new Promise<boolean>((resolve) => {
        confirmationResolverRef.current?.(false);
        confirmationResolverRef.current = resolve;
        setConfirmationDialog({
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel ?? t("Continue", "Kontynuuj"),
          tone: options.tone ?? "default",
        });
      }),
    [t]
  );

  const resolveConfirmation = useCallback((confirmed: boolean) => {
    const resolve = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setConfirmationDialog(null);
    resolve?.(confirmed);
  }, []);

  useEffect(() => {
    if (!confirmationDialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") resolveConfirmation(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmationDialog, resolveConfirmation]);
  const [billingMessage, setBillingMessage] = useState("");
  const checkoutAttemptIdsRef = useRef<Record<string, string>>({});
  const [billingMessageTone, setBillingMessageTone] = useState<
    "error" | "success"
  >("success");
  const [billingNotice, setBillingNotice] = useState<{
    title: string;
    message: string;
    tone: "error" | "success";
  } | null>(null);
  const [billingChangeRequest, setBillingChangeRequest] = useState<{
    currentPlan: "basic" | "pro" | "master";
    targetPlan: "basic" | "pro" | "master";
    currency: "pln" | "eur";
    estimatedImmediateCharge?: number | null;
    estimatedNextMonthlyCharge?: number | null;
    changeEffectiveAt?: string | null;
  } | null>(null);
  const [billingCurrency, setBillingCurrency] = useState<"pln" | "eur">("pln");
  const [pendingBillingPlan, setPendingBillingPlan] = useState<
    "basic" | "pro" | "master" | ""
  >("");
  const [isBillingPortalLoading, setIsBillingPortalLoading] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSupportChat, setShowSupportChat] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] =
    useState("");
  const [deleteAccountError, setDeleteAccountError] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isExportingAccountData, setIsExportingAccountData] = useState(false);
  const [accountExportError, setAccountExportError] = useState("");
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSection>("background");
  const [showBoardsMenu, setShowBoardsMenu] = useState(false);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [sharingBoard, setSharingBoard] = useState<BoardSummary | null>(null);
  const [boardShares, setBoardShares] = useState<BoardShareSummary[]>([]);
  const [versionHistoryBoard, setVersionHistoryBoard] =
    useState<BoardSummary | null>(null);
  const [boardVersions, setBoardVersions] = useState<BoardVersionSummary[]>([]);
  const [versionRetentionDays, setVersionRetentionDays] = useState(30);
  const [isVersionHistoryLoading, setIsVersionHistoryLoading] = useState(false);
  const [versionHistoryMessage, setVersionHistoryMessage] = useState("");
  const [exportingBoard, setExportingBoard] = useState<BoardSummary | null>(null);
  const [boardExportMessage, setBoardExportMessage] = useState("");
  const [isBoardExporting, setIsBoardExporting] = useState(false);
  const [shareEmailInput, setShareEmailInput] = useState("");
  const [shareLimit, setShareLimit] = useState(1);
  const [sharePanelMessage, setSharePanelMessage] = useState("");
  const [sharePanelTone, setSharePanelTone] = useState<"error" | "success" | "info">(
    "success"
  );
  const [isSharePanelLoading, setIsSharePanelLoading] = useState(false);
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
  const [boardSaveState, setBoardSaveState] =
    useState<BoardSaveState>("saved");
  const [isOnline, setIsOnline] = useState(true);
  const activeBoard = boards.find(
    (board) => board.id === activeBoardId && !board.deletedAt
  );

  useEffect(() => {
    const isObsoleteLoadingNotice =
      boardActionMessage.startsWith("Boards are still loading") ||
      boardActionMessage.startsWith("Tablice nadal się ładują");

    if (!isBoardsLoading && isObsoleteLoadingNotice) {
      setBoardActionMessage("");
    }
  }, [boardActionMessage, isBoardsLoading]);

  useEffect(() => {
    setBoardContext(
      activeBoard ? { id: activeBoard.id, name: activeBoard.name } : null
    );
  }, [activeBoard, setBoardContext]);

  useEffect(() => {
    if (!showPersonalLayer || !activeBoardId || !currentAccountId) return;
    let cancelled = false;
    setPersonalNoteSaveState("loading");
    fetch(`/api/boards/${encodeURIComponent(activeBoardId)}/personal-note`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | { note?: { title?: string; content?: string }; error?: string }
          | null;
        if (!response.ok) throw new Error(data?.error ?? "Could not load private notes.");
        if (cancelled) return;
        setPersonalNoteTitle(data?.note?.title ?? "My private notes");
        setPersonalNoteContent(data?.note?.content ?? "");
        setPersonalNoteLoadedBoardId(activeBoardId);
        setPersonalNoteSaveState("saved");
      })
      .catch(() => {
        if (!cancelled) setPersonalNoteSaveState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [activeBoardId, currentAccountId, showPersonalLayer]);

  useEffect(() => {
    if (
      !showPersonalLayer ||
      !activeBoardId ||
      personalNoteLoadedBoardId !== activeBoardId
    ) return;
    setPersonalNoteSaveState("saving");
    const timeout = window.setTimeout(() => {
      fetch(`/api/boards/${encodeURIComponent(activeBoardId)}/personal-note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: personalNoteTitle,
          content: personalNoteContent,
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Save failed");
          setPersonalNoteSaveState("saved");
        })
        .catch(() => setPersonalNoteSaveState("error"));
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [
    activeBoardId,
    personalNoteContent,
    personalNoteLoadedBoardId,
    personalNoteTitle,
    showPersonalLayer,
  ]);

  useEffect(
    () => () => {
      setBoardContext(null);
    },
    [setBoardContext]
  );
  const [isRegisterCtaHovered, setIsRegisterCtaHovered] = useState(false);
  const [isAuthSubmitHovered, setIsAuthSubmitHovered] = useState(false);
  const [isNewBoardButtonHovered, setIsNewBoardButtonHovered] = useState(false);
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
  const personalNoteRef = useRef<HTMLTextAreaElement | null>(null);
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
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const undoStackRef = useRef<CanvasElement[][]>([]);
  const redoStackRef = useRef<CanvasElement[][]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const [redoDepth, setRedoDepth] = useState(0);

  const recordCanvasHistory = (snapshot = elements) => {
    undoStackRef.current = [...undoStackRef.current.slice(-99), snapshot];
    redoStackRef.current = [];
    setUndoDepth(undoStackRef.current.length);
    setRedoDepth(0);
  };

  const undoCanvasChange = () => {
    const previous = undoStackRef.current.at(-1);
    if (!previous) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, elements];
    setElements(previous);
    setUndoDepth(undoStackRef.current.length);
    setRedoDepth(redoStackRef.current.length);
    setActiveText(null);
    setSelectedImageIndex(null);
    setSelectionBox(null);
    setSelectionMenu(null);
  };

  const redoCanvasChange = () => {
    const next = redoStackRef.current.at(-1);
    if (!next) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, elements];
    setElements(next);
    setUndoDepth(undoStackRef.current.length);
    setRedoDepth(redoStackRef.current.length);
    setActiveText(null);
    setSelectedImageIndex(null);
    setSelectionBox(null);
    setSelectionMenu(null);
  };

  const handleUndoRedoShortcut = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      target?.isContentEditable ||
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA"
    ) {
      return;
    }

    const hasCommandKey = event.ctrlKey || event.metaKey;
    if (!hasCommandKey) return;

    if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redoCanvasChange();
      } else {
        undoCanvasChange();
      }
    } else if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoCanvasChange();
    }
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => handleUndoRedoShortcut(event);
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const currentStroke = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);
  const renderedLiveStrokePointCountRef = useRef(0);
  const latestRedrawCanvasRef = useRef<() => void>(() => {});
  const pendingRedrawFrame = useRef<number | null>(null);
  const autosaveBoardTimeoutRef = useRef<number | null>(null);
  const boardRealtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const boardRealtimeReadyRef = useRef(false);
  const pendingBoardRealtimeMessageRef = useRef<{
    boardId: string;
    updatedAt: string;
  } | null>(null);
  const boardRealtimeClientIdRef = useRef(crypto.randomUUID());
  const remoteLiveStrokesRef = useRef<Map<string, RemoteLiveStroke>>(new Map());
  const remoteLiveTextsRef = useRef<
    Map<string, { element: TextElement; updatedAt: number }>
  >(new Map());
  const localLiveTextRef = useRef<{ id: string; boardId: string } | null>(null);
  const localLiveTextCommittedRef = useRef(false);
  const localLiveStrokeRef = useRef<{
    strokeId: string;
    sequence: number;
    sentPointCount: number;
    lastSentAt: number;
    flushTimer: number | null;
  } | null>(null);
  const latestRemoteRefreshRef = useRef(0);
  const suppressBoardAutosaveUntilRef = useRef(0);
  const boardChangeVersionRef = useRef(0);
  const latestSaveAttemptRef = useRef(0);
  const hasUnsavedBoardChangesRef = useRef(false);
  const pendingLocalBoardClearRef = useRef(false);
  const latestBoardDocumentRef = useRef<BoardDocument>({
    elements,
    canvasBackground,
    customCanvasBackground,
    gridMode,
    gridOpacity,
    calendarEntries,
  });
  const boardSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const boardUpdatedAtRef = useRef<Record<string, string>>({});
  latestBoardDocumentRef.current = {
    elements,
    canvasBackground,
    customCanvasBackground,
    gridMode,
    gridOpacity,
    calendarEntries,
  };

  const broadcastBoardSaved = useCallback((boardId: string, updatedAt: string) => {
    const channel = boardRealtimeChannelRef.current;
    if (!channel || !boardId || !updatedAt) return;
    if (!boardRealtimeReadyRef.current) {
      pendingBoardRealtimeMessageRef.current = { boardId, updatedAt };
      return;
    }
    void channel
      .send({
        type: "broadcast",
        event: "board-saved",
        payload: {
          boardId,
          updatedAt,
          senderId: boardRealtimeClientIdRef.current,
          sentAt: Date.now(),
        },
      })
      .catch(() => undefined);
  }, []);

  const requestCanvasRedraw = useCallback(() => {
    if (pendingRedrawFrame.current !== null) return;
    pendingRedrawFrame.current = window.requestAnimationFrame(() => {
      pendingRedrawFrame.current = null;
      latestRedrawCanvasRef.current();
    });
  }, []);

  const sendLiveStrokeMessage = useCallback(
    (
      event:
        | "stroke-start"
        | "stroke-points"
        | "stroke-end"
        | "board-cleared"
        | "text-preview"
        | "text-end",
      payload: object
    ) => {
      const channel = boardRealtimeChannelRef.current;
      if (!channel || !boardRealtimeReadyRef.current) return;
      void channel
        .send({
          type: "broadcast",
          event,
          payload: { ...payload, sentAt: Date.now() },
        })
        .catch(() => undefined);
    },
    []
  );

  useEffect(() => {
    if (!activeBoardId || !boardRealtimeReadyRef.current) return;

    if (!activeText) {
      const previous = localLiveTextRef.current;
      if (previous) {
        sendLiveStrokeMessage("text-end", {
          version: 1,
          boardId: previous.boardId,
          senderId: boardRealtimeClientIdRef.current,
          textId: previous.id,
          committed: localLiveTextCommittedRef.current,
        });
        localLiveTextRef.current = null;
        localLiveTextCommittedRef.current = false;
      }
      return;
    }

    if (!localLiveTextRef.current || localLiveTextRef.current.boardId !== activeBoardId) {
      localLiveTextRef.current = { id: crypto.randomUUID(), boardId: activeBoardId };
      localLiveTextCommittedRef.current = false;
    }
    const liveText = localLiveTextRef.current;
    const timer = window.setTimeout(() => {
      sendLiveStrokeMessage("text-preview", {
        version: 1,
        boardId: activeBoardId,
        senderId: boardRealtimeClientIdRef.current,
        textId: liveText.id,
        element: {
          kind: "text",
          point: activeText.point,
          value: activeText.value.slice(0, 20_000),
          color: activeText.color,
          runs: activeText.runs,
          fontFamily: activeText.fontFamily,
          fontWeight: activeText.fontWeight,
          fontSize: activeText.fontSize,
          fontStyle: activeText.fontStyle,
          underline: activeText.underline,
          textAlign: activeText.textAlign,
          width: Math.max(1, activeText.width),
          height: Math.max(1, activeText.height),
          measurementSpace: "screen",
          measurementZoom: zoomRef.current || activeTextZoomRef.current || 1,
          backgroundColor: activeText.backgroundColor,
        },
      });
    }, 50);

    return () => window.clearTimeout(timer);
  }, [activeBoardId, activeText, sendLiveStrokeMessage]);
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
    setShowForgotPassword(false);
    setShowLoginModal(true);
  };

  const showWelcomeCelebration = (
    name: string | null | undefined,
    kind: "login" | "created" | "logout"
  ) => {
    const displayName = name?.trim() || t("Scriboo user", "Użytkowniku Scriboo");
    setWelcomeCelebration({ name: displayName, kind });
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
      setAuthMessage(t("Enter your email address.", "Wprowadź adres e-mail."));
      return;
    }

    setIsAuthSubmitting(true);
    setAuthMessage("");
    setCanResendConfirmation(false);

    try {
      if (!password) {
      setAuthMessage(t("Enter your password.", "Wprowadź hasło."));
        return;
      }

      if (authMode === "register") {
        const data = await readAuthResponse(
          await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              email,
              password,
              confirmPassword,
              acceptedLegal: hasAcceptedLegal,
              turnstileToken,
            }),
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
          setCurrentSubscriptionCancelAtPeriodEnd(
            data.user.subscriptionCancelAtPeriodEnd ?? false
          );
          setCurrentSubscriptionCurrentPeriodEnd(
            data.user.subscriptionCurrentPeriodEnd ?? null
          );
          setAuthMessage("");
          setShowLoginModal(false);
          window.dispatchEvent(new Event("scriboo-auth-changed"));
          showWelcomeCelebration(data.user.name ?? name, "created");
          return;
        }

        setAuthMode("login");
        setAuthMessage(data.message ?? "Check your email to confirm your account.");
        setCanResendConfirmation(true);
        setTurnstileResetSignal((value) => value + 1);
        return;
      }

      const data = await readAuthResponse(
        await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, turnstileToken }),
        })
      );

      setCurrentAccountId(data.user?.id ?? "");
      setCurrentAccountName(data.user?.name ?? "");
      setCurrentAccountEmail(data.user?.email ?? email);
      setAuthPassword("");
      setAuthMessage("");
      setShowLoginModal(false);
      window.dispatchEvent(new Event("scriboo-auth-changed"));
      showWelcomeCelebration(data.user?.name, "login");
      void loadCurrentAccount();
    } catch (error) {
      if (authMode === "register") {
        setTurnstileResetSignal((value) => value + 1);
      }
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
      setTurnstileResetSignal((value) => value + 1);
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
          body: JSON.stringify({
            email: authEmail.trim().toLowerCase(),
            turnstileToken,
          }),
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
      setTurnstileResetSignal((value) => value + 1);
      setIsAuthSubmitting(false);
    }
  };

  const signOut = async () => {
    const departingName = currentAccountName;
    const boardSave =
      currentAccountId && activeBoardId
        ? persistBoard(activeBoardId).catch(() => null)
        : Promise.resolve(null);

    setShowProfileMenu(false);
    showWelcomeCelebration(departingName, "logout");
    setCurrentAccountId("");
    setCurrentAccountName("");
    setCurrentAccountEmail("");
    setCurrentAccountPlan("basic");
    setCurrentSubscriptionStatus("inactive");
    setCurrentSubscriptionCancelAtPeriodEnd(false);
    setCurrentSubscriptionCurrentPeriodEnd(null);
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

    // The interface signs out immediately. Keep the authenticated session just
    // long enough to finish saving the active board, then clear both the server
    // cookie and the browser client's cached session.
    await boardSave;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    await getSupabaseBrowserClient().auth.signOut({ scope: "local" }).catch(() => null);
    window.dispatchEvent(new Event("scriboo-auth-changed"));
  };

  const closeDeleteAccountModal = () => {
    if (isDeletingAccount) return;
    setShowDeleteAccountModal(false);
    setDeleteAccountPassword("");
    setDeleteAccountConfirmation("");
    setDeleteAccountError("");
  };

  const deleteAccount = async () => {
    if (isDeletingAccount) return;

    if (!deleteAccountPassword) {
      setDeleteAccountError(t("Enter your password.", "Wprowadź hasło."));
      return;
    }

    if (deleteAccountConfirmation.trim() !== "DELETE") {
      setDeleteAccountError(t('Type "DELETE" exactly to continue.', 'Wpisz dokładnie "DELETE", aby kontynuować.'));
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountError("");

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: deleteAccountPassword,
          confirmation: deleteAccountConfirmation.trim(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setDeleteAccountError(
          data.error ?? "Could not delete your account. Nothing was changed."
        );
        return;
      }

      window.location.assign("/?account-deleted=true");
    } catch {
      setDeleteAccountError(
        "Could not reach the server. Your account was not deleted."
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const downloadAccountData = async () => {
    if (isExportingAccountData) return;

    setIsExportingAccountData(true);
    setAccountExportError("");

    try {
      const response = await fetch("/api/account/export", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setAccountExportError(
          data.error ?? "Could not prepare your data export right now."
        );
        return;
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileNameMatch = disposition.match(/filename="([^"]+)"/i);

      link.href = downloadUrl;
      link.download = fileNameMatch?.[1] ?? "blackboard-data-export.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch {
      setAccountExportError(
        "Could not reach the server. Your data export was not created."
      );
    } finally {
      setIsExportingAccountData(false);
    }
  };

  const loadCurrentAccount = async () => {
    const data = (await fetch("/api/auth/me", {
      cache: "no-store",
    })
      .then((response) => response.json())
      .catch(() => ({ user: null }))) as { user: PublicAccount | null };

    setCurrentAccountId(data.user?.id ?? "");
    setCurrentAccountName(data.user?.name ?? "");
    setCurrentAccountEmail(data.user?.email ?? "");
    setCurrentAccountPlan(data.user?.plan ?? "basic");
    setCurrentSubscriptionStatus(data.user?.subscriptionStatus ?? "inactive");
    setCurrentSubscriptionCancelAtPeriodEnd(
      data.user?.subscriptionCancelAtPeriodEnd ?? false
    );
    setCurrentSubscriptionCurrentPeriodEnd(
      data.user?.subscriptionCurrentPeriodEnd ?? null
    );

    if (data.user && typeof window !== "undefined") {
      const currentUrl = new URL(window.location.href);
      const welcome = currentUrl.searchParams.get("welcome");
      if (welcome === "login" || welcome === "created") {
        showWelcomeCelebration(data.user.name, welcome);
        currentUrl.searchParams.delete("welcome");
        window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      }
    }
  };

  const closeAuthModal = () => {
    setShowLoginModal(false);
    setShowForgotPassword(false);
    setAuthMessage("");
    setCanResendConfirmation(false);
  };

  const applyBoardDocument = (document: BoardDocument) => {
    suppressBoardAutosaveUntilRef.current = Date.now() + 1200;
    hasUnsavedBoardChangesRef.current = false;
    pendingLocalBoardClearRef.current = false;
    setBoardSaveState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "saved");
    currentStroke.current = null;
    remoteLiveStrokesRef.current.clear();
    remoteLiveTextsRef.current.clear();
    setIsDrawing(false);
    setShapeStart(null);
    setSnapshot(null);
    shapeEnd.current = null;
    setActiveText(null);
    setSelectedImageIndex(null);
    setSelectionBox(null);
    setSelectionMenu(null);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoDepth(0);
    setRedoDepth(0);
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
      maxBoards?: number | null;
      board?: {
        id: string;
        name: string;
        createdAt?: string;
        updatedAt?: string;
        deletedAt?: string;
        starred?: boolean;
        previewDocument?: BoardDocument;
        ownedByUser?: boolean;
        shareCount?: number;
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

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsOnline(false);
      setBoardSaveState("offline");
      throw new Error("You are offline. Your changes have not been saved yet.");
    }

    const version = boardChangeVersionRef.current;
    const attempt = latestSaveAttemptRef.current + 1;
    latestSaveAttemptRef.current = attempt;
    const documentSnapshot = latestBoardDocumentRef.current;

    const saveOperation = boardSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          throw new Error("OFFLINE");
        }

        if (attempt === latestSaveAttemptRef.current) {
          setBoardSaveState("saving");
        }

        const data = await readBoardResponse(
          await fetch(`/api/boards/${boardId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...documentSnapshot,
              expectedUpdatedAt: boardUpdatedAtRef.current[boardId],
            }),
          })
        );

        if (data.board && typeof data.board.updatedAt === "string") {
          const savedBoard = data.board as NonNullable<typeof data.board> & {
            updatedAt: string;
          };
          const savedUpdatedAt: string = savedBoard.updatedAt;
          boardUpdatedAtRef.current[boardId] = savedUpdatedAt;

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
                    previewDocument:
                      savedBoard.document ?? board.previewDocument,
                  }
                : board
            )
          );
          broadcastBoardSaved(boardId, savedUpdatedAt);
        }
      });

    boardSaveQueueRef.current = saveOperation.then(
      () => undefined,
      () => undefined
    );

    try {
      await saveOperation;
      if (attempt === latestSaveAttemptRef.current) {
        if (boardChangeVersionRef.current === version) {
          hasUnsavedBoardChangesRef.current = false;
          pendingLocalBoardClearRef.current = false;
          setBoardSaveState("saved");
        } else {
          setBoardSaveState("dirty");
        }
      }
    } catch (error) {
      hasUnsavedBoardChangesRef.current = true;
      const conflict =
        error instanceof Error &&
        error.message.includes("changed in another window or by another editor");

      if (conflict) {
        try {
          const latest = await readBoardResponse(
            await fetch(`/api/boards/${encodeURIComponent(boardId)}`, {
              cache: "no-store",
            })
          );
          if (latest.board?.id === boardId && latest.board.updatedAt) {
            if (pendingLocalBoardClearRef.current) {
              // A clear is a deletion operation, not an additive stroke
              // conflict. Retrying against the newest revision preserves the
              // empty/new document instead of merging deleted server objects
              // back into it.
              boardUpdatedAtRef.current[boardId] = latest.board.updatedAt;
              setBoardSaveState("dirty");
              window.setTimeout(() => {
                void persistBoard(boardId).catch(() => undefined);
              }, 0);
              return;
            }
            const serverElements = Array.isArray(latest.board.document.elements)
              ? latest.board.document.elements
              : [];
            const serverStrokeIds = new Set(
              serverElements
                .filter(
                  (element): element is Stroke =>
                    element.kind === "stroke" && typeof element.id === "string"
                )
                .map((stroke) => stroke.id as string)
            );
            const missingLocalStrokes = documentSnapshot.elements.filter(
              (element): element is Stroke =>
                element.kind === "stroke" &&
                typeof element.id === "string" &&
                !serverStrokeIds.has(element.id)
            );

            if (missingLocalStrokes.length > 0) {
              boardUpdatedAtRef.current[boardId] = latest.board.updatedAt;
              setElements([...serverElements, ...missingLocalStrokes]);
              setBoardSaveState("dirty");
              return;
            }
          }
        } catch {
          // Keep the original conflict state if recovery cannot load the
          // authoritative version. The existing exact-board recovery remains.
        }
      }

      if (attempt === latestSaveAttemptRef.current) {
        const offline =
          (error instanceof Error && error.message === "OFFLINE") ||
          (typeof navigator !== "undefined" && !navigator.onLine);
        if (offline) setIsOnline(false);
        setBoardSaveState(conflict ? "conflict" : offline ? "offline" : "error");
      }
      throw error;
    }
  };

  const requestPasswordReset = async () => {
    const email = authEmail.trim().toLowerCase();

    if (!email || isAuthSubmitting) {
      if (!email) {
      setAuthMessage(t("Enter your email address first.", "Najpierw wprowadź adres e-mail."));
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
          body: JSON.stringify({ email, turnstileToken }),
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
      setTurnstileResetSignal((value) => value + 1);
      setIsAuthSubmitting(false);
    }
  };

  const loadBoards = async () => {
    if (!currentAccountId) return;

    setBoardActionMessage("");
    setIsBoardsLoading(true);

    try {
      const data = await readBoardResponse(await fetch("/api/boards"));
      setBoards(data.boards ?? []);
      setActiveBoardId(data.activeBoardId ?? "");
      setCurrentMaxBoards(
        data.maxBoards === null
          ? Number.POSITIVE_INFINITY
          : data.maxBoards ?? 5
      );

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
    if (boardId === activeBoardId) {
      setShowBoardsMenu(false);
      return;
    }

    setBoardActionMessage("");
    setIsBoardsLoading(true);

    try {
      // Saving an unchanged board before every navigation can produce a stale
      // version conflict on a collaborator's tablet and prevent selection.
      // Flush only genuine local work.
      if (activeBoardId && hasUnsavedBoardChangesRef.current) {
        await persistBoard(activeBoardId);
      }

      const data = await readBoardResponse(
        await fetch(`/api/boards/${boardId}/select`, {
          method: "POST",
        })
      );

      setBoards(data.boards ?? []);
      setActiveBoardId(data.activeBoardId ?? boardId);
      if (data.board?.updatedAt) {
        boardUpdatedAtRef.current[boardId] = data.board.updatedAt;
      }
      setCurrentMaxBoards(
        data.maxBoards === null
          ? Number.POSITIVE_INFINITY
          : data.maxBoards ?? currentMaxBoards
      );

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
      setShowBoardsMenu(false);
    } catch (error) {
      setBoardActionMessage(
        error instanceof Error ? error.message : t("Could not open this board.", "Nie udało się otworzyć tej tablicy.")
      );
    } finally {
      setIsBoardsLoading(false);
    }
  };

  const createBoard = async () => {
    if (!currentAccountId) {
      setBoardActionMessage(
        t("Log in to create a board.", "Zaloguj się, aby utworzyć tablicę.")
      );
      return;
    }

    if (liveBoardsCount >= currentMaxBoards) {
      setBoardActionMessage(
        t(
          `Your ${currentPlanLabel} plan allows up to ${currentMaxBoards} boards.`,
          `Twój plan ${currentPlanLabel} pozwala utworzyć maksymalnie ${currentMaxBoards} tablic.`
        )
      );
      return;
    }

    if (isBoardsLoading) {
      return;
    }

    setBoardActionMessage("");
    setIsBoardsLoading(true);

    try {
      const confirmLeavingConflictedBoard = () =>
        requestConfirmation({
          title: t("Create a new board?", "Utworzyć nową tablicę?"),
          message: t(
            "A newer version of the current board is already saved. You can leave this outdated local copy without overwriting the newer board.",
            "Nowsza wersja bieżącej tablicy jest już zapisana. Możesz opuścić tę nieaktualną kopię lokalną bez nadpisywania nowszej tablicy."
          ),
          confirmLabel: t("Create new board", "Utwórz nową tablicę"),
        });
      let leaveConflictedBoard =
        boardSaveState === "conflict" && (await confirmLeavingConflictedBoard());

      if (boardSaveState === "conflict" && !leaveConflictedBoard) {
        return;
      }

      if (activeBoardId && !leaveConflictedBoard) {
        try {
          await persistBoard(activeBoardId);
        } catch (error) {
          const newlyDetectedConflict =
            error instanceof Error &&
            error.message.includes(
              "changed in another window or by another editor"
            );
          if (!newlyDetectedConflict) throw error;

          leaveConflictedBoard = await confirmLeavingConflictedBoard();
          if (!leaveConflictedBoard) return;
          setBoardActionMessage("");
        }
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
      hasUnsavedBoardChangesRef.current = false;
      setBoardSaveState("saved");
      setCurrentMaxBoards(
        data.maxBoards === null
          ? Number.POSITIVE_INFINITY
          : data.maxBoards ?? currentMaxBoards
      );

      if (data.board?.document) {
        applyBoardDocument(data.board.document);
      }

      if (data.board?.id) {
        setEditingBoardId(data.board.id);
        setEditingBoardName(data.board.name);
      }
    } catch (error) {
      setBoardActionMessage(
        error instanceof Error ? error.message : "Could not create a new board."
      );
    } finally {
      setIsBoardsLoading(false);
    }
  };

  const moveBoardToTrash = async (board: BoardSummary) => {
    if (board.deletedAt) return;

    const confirmed = await requestConfirmation({
      title: t("Move board to Trash?", "Przenieść tablicę do Kosza?"),
      message: t(
        `“${board.name}” can be restored for 30 days. After that, Scriboo will permanently delete it.`,
        `Tablicę „${board.name}” można przywrócić przez 30 dni. Po tym czasie Scriboo usunie ją trwale.`
      ),
      confirmLabel: t("Move to Trash", "Przenieś do Kosza"),
      tone: "danger",
    });

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

  const restoreBoardFromTrash = async (board: BoardSummary) => {
    if (!board.deletedAt || board.ownedByUser === false) return;

    setIsBoardsLoading(true);

    try {
      const data = await readBoardResponse(
        await fetch(`/api/boards/${board.id}/trash`, { method: "POST" })
      );

      setBoards(data.boards ?? []);
      setActiveBoardId(data.activeBoardId ?? board.id);
      setBoardBrowserView("all");

      if (data.board?.document) {
        applyBoardDocument(data.board.document);
      }
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Could not restore this board."
      );
    } finally {
      setIsBoardsLoading(false);
    }
  };

  const permanentlyDeleteBoard = async (board: BoardSummary) => {
    if (!board.deletedAt || board.ownedByUser === false) return;

    const confirmed = await requestConfirmation({
      title: t("Permanently delete board?", "Trwale usunąć tablicę?"),
      message: t(
        `“${board.name}” and its sharing access and version history will be deleted. This cannot be undone.`,
        `Tablica „${board.name}”, jej udostępnienia i historia wersji zostaną usunięte. Tej operacji nie można cofnąć.`
      ),
      confirmLabel: t("Delete permanently", "Usuń trwale"),
      tone: "danger",
    });
    if (!confirmed) return;

    setIsBoardsLoading(true);

    try {
      const data = await readBoardResponse(
        await fetch(`/api/boards/${board.id}/trash`, { method: "DELETE" })
      );

      setBoards(data.boards ?? []);
      setActiveBoardId(data.activeBoardId ?? "");

      if (data.board?.document) {
        applyBoardDocument(data.board.document);
      }
    } catch (error) {
      setAuthMessage(
        error instanceof Error
          ? error.message
          : "Could not permanently delete this board."
      );
    } finally {
      setIsBoardsLoading(false);
    }
  };

  const openVersionHistory = async (board: BoardSummary) => {
    if (board.deletedAt || board.ownedByUser === false) return;

    setVersionHistoryBoard(board);
    setBoardVersions([]);
    setVersionHistoryMessage("");
    setIsVersionHistoryLoading(true);

    try {
      if (board.id === activeBoardId && hasUnsavedBoardChangesRef.current) {
        await persistBoard(board.id);
      }

      const response = await fetch(`/api/boards/${board.id}/versions`);
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        versions?: BoardVersionSummary[];
        retentionDays?: number;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not load version history.");
      }

      setBoardVersions(data.versions ?? []);
      setVersionRetentionDays(data.retentionDays ?? 30);
    } catch (error) {
      setVersionHistoryMessage(
        error instanceof Error ? error.message : "Could not load version history."
      );
    } finally {
      setIsVersionHistoryLoading(false);
    }
  };

  const restoreBoardVersion = async (version: BoardVersionSummary) => {
    if (!versionHistoryBoard || isVersionHistoryLoading) return;

    const confirmed = await requestConfirmation({
      title: t("Restore this version?", "Przywrócić tę wersję?"),
      message: t(
        `Scriboo will first preserve the current version of “${versionHistoryBoard.name}” for recovery.`,
        `Scriboo najpierw zachowa bieżącą wersję tablicy „${versionHistoryBoard.name}”, aby można ją było odzyskać.`
      ),
      confirmLabel: t("Restore version", "Przywróć wersję"),
    });
    if (!confirmed) return;

    setIsVersionHistoryLoading(true);
    setVersionHistoryMessage("");

    try {
      const data = await readBoardResponse(
        await fetch(`/api/boards/${versionHistoryBoard.id}/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId: version.id }),
        })
      );

      if (data.board) {
        const restoredBoard = data.board;
        setBoards((previous) =>
          previous.map((board) =>
            board.id === restoredBoard.id
              ? {
                  ...board,
                  name: restoredBoard.name,
                  updatedAt: restoredBoard.updatedAt ?? board.updatedAt,
                  previewDocument:
                    restoredBoard.previewDocument ?? restoredBoard.document,
                }
              : board
          )
        );
        setActiveBoardId(restoredBoard.id);
        applyBoardDocument(restoredBoard.document);
      }

      setVersionHistoryBoard(null);
      setBoardVersions([]);
      setShowBoardsMenu(false);
    } catch (error) {
      setVersionHistoryMessage(
        error instanceof Error ? error.message : "Could not restore this version."
      );
    } finally {
      setIsVersionHistoryLoading(false);
    }
  };

  const getBoardDocumentForExport = (board: BoardSummary): BoardDocument =>
    board.id === activeBoardId
      ? {
          elements,
          canvasBackground,
          customCanvasBackground,
          gridMode,
          gridOpacity,
          calendarEntries,
        }
      : board.previewDocument;

  const getSafeExportFileName = (boardName: string) => {
    const safeName = boardName
      .trim()
      .replace(/[^a-zA-Z0-9\-_ ]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60);
    return safeName || "scriboo-board";
  };

  const downloadBoardBlob = (blob: Blob, fileName: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 500);
  };

  const getExportElementBounds = (element: CanvasElement): Bounds | null => {
    if (element.kind === "calculator") {
      return {
        x: element.point.x,
        y: element.point.y,
        width: element.width,
        height: element.height,
      };
    }
    if (element.kind === "converter") {
      return {
        x: element.point.x,
        y: element.point.y,
        width: element.width,
        height: element.height,
      };
    }
    if (element.kind === "image") {
      return {
        x: element.point.x,
        y: element.point.y,
        width: element.width,
        height: element.height,
      };
    }

    if (element.kind === "stroke") {
      if (!element.points.length) return null;
      const padding = element.width + 8;
      const xs = element.points.map((point) => point.x);
      const ys = element.points.map((point) => point.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      return {
        x: minX - padding,
        y: minY - padding,
        width: Math.max(1, maxX - minX + padding * 2),
        height: Math.max(1, maxY - minY + padding * 2),
      };
    }

    if (element.kind === "text") {
      return {
        x: element.point.x - 4,
        y: element.point.y - 4,
        width: Math.max(1, getTextLengthInCanvas(element, element.width) + 8),
        height: Math.max(1, getTextLengthInCanvas(element, element.height) + 8),
      };
    }

    const padding = element.width + 12;
    if (element.tool === "circle") {
      const radius = Math.hypot(
        element.end.x - element.start.x,
        element.end.y - element.start.y
      );
      return {
        x: element.start.x - radius - padding,
        y: element.start.y - radius - padding,
        width: Math.max(1, radius * 2 + padding * 2),
        height: Math.max(1, radius * 2 + padding * 2),
      };
    }

    const minX = Math.min(element.start.x, element.end.x);
    const minY = Math.min(element.start.y, element.end.y);
    const maxX = Math.max(element.start.x, element.end.x);
    const maxY = Math.max(element.start.y, element.end.y);
    const arrowPadding = element.tool === "arrow" ? Math.max(22, element.width * 5) : 0;
    return {
      x: minX - padding - arrowPadding,
      y: minY - padding - arrowPadding,
      width: Math.max(1, maxX - minX + (padding + arrowPadding) * 2),
      height: Math.max(1, maxY - minY + (padding + arrowPadding) * 2),
    };
  };

  const createBoardExportCanvas = (board: BoardSummary) => {
    const documentToExport = getBoardDocumentForExport(board);
    const elementBounds = documentToExport.elements
      .map(getExportElementBounds)
      .filter((bounds): bounds is Bounds => Boolean(bounds));
    const padding = 64;
    const contentBounds = elementBounds.length
      ? {
          x: Math.min(...elementBounds.map((bounds) => bounds.x)) - padding,
          y: Math.min(...elementBounds.map((bounds) => bounds.y)) - padding,
          width:
            Math.max(...elementBounds.map((bounds) => bounds.x + bounds.width)) -
            Math.min(...elementBounds.map((bounds) => bounds.x)) +
            padding * 2,
          height:
            Math.max(...elementBounds.map((bounds) => bounds.y + bounds.height)) -
            Math.min(...elementBounds.map((bounds) => bounds.y)) +
            padding * 2,
        }
      : { x: 0, y: 0, width: 1600, height: 900 };
    const renderScale = Math.min(
      2,
      4096 / Math.max(1, contentBounds.width),
      4096 / Math.max(1, contentBounds.height)
    );
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = Math.max(1, Math.round(contentBounds.width * renderScale));
    exportCanvas.height = Math.max(1, Math.round(contentBounds.height * renderScale));
    const context = exportCanvas.getContext("2d");
    if (!context) throw new Error("Your browser could not create the export image.");

    const background =
      documentToExport.canvasBackground === floralCanvasBackground
        ? lightCanvasColor
        : documentToExport.canvasBackground === neonCanvasBackground
          ? neonCanvasBaseColor
          : documentToExport.canvasBackground || lightCanvasColor;
    context.fillStyle = background;
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    if (documentToExport.canvasBackground === neonCanvasBackground) {
      const glow = context.createRadialGradient(
        exportCanvas.width * 0.2,
        exportCanvas.height * 0.18,
        0,
        exportCanvas.width * 0.2,
        exportCanvas.height * 0.18,
        Math.max(exportCanvas.width, exportCanvas.height) * 0.72
      );
      glow.addColorStop(0, "rgba(124,58,237,0.3)");
      glow.addColorStop(0.5, "rgba(14,165,233,0.09)");
      glow.addColorStop(1, "rgba(7,8,22,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    }
    context.save();
    context.scale(renderScale, renderScale);
    context.translate(-contentBounds.x, -contentBounds.y);

    if (
      documentToExport.canvasBackground === floralCanvasBackground &&
      floralBackgroundRef.current?.complete
    ) {
      const floralImage = floralBackgroundRef.current;
      const { width: tileWidth, height: tileHeight } = floralBackgroundTile;
      const startX = Math.floor(contentBounds.x / tileWidth) * tileWidth;
      const startY = Math.floor(contentBounds.y / tileHeight) * tileHeight;
      for (
        let x = startX;
        x < contentBounds.x + contentBounds.width;
        x += tileWidth
      ) {
        for (
          let y = startY;
          y < contentBounds.y + contentBounds.height;
          y += tileHeight
        ) {
          context.drawImage(floralImage, x, y, tileWidth, tileHeight);
        }
      }
    }

    if (documentToExport.gridMode !== "none" && documentToExport.gridOpacity > 0) {
      const spacing =
        documentToExport.gridMode === "dots"
          ? 48
          : documentToExport.gridMode === "small"
          ? 24
          : documentToExport.gridMode === "large"
          ? 72
          : 40;
      const lightGrid =
        background === darkCanvasColor ||
        background === greyCanvasColor ||
        documentToExport.canvasBackground === neonCanvasBackground;
      const exportGridColor = lightGrid
        ? `rgba(255,255,255,${documentToExport.gridOpacity / 100})`
        : `rgba(15,23,42,${documentToExport.gridOpacity / 100})`;
      const startX = Math.floor(contentBounds.x / spacing) * spacing;
      const startY = Math.floor(contentBounds.y / spacing) * spacing;
      if (documentToExport.gridMode === "dots") {
        context.fillStyle = exportGridColor;
        for (let x = startX; x <= contentBounds.x + contentBounds.width; x += spacing) {
          for (let y = startY; y <= contentBounds.y + contentBounds.height; y += spacing) {
            context.beginPath();
            context.arc(x, y, 1.7, 0, Math.PI * 2);
            context.fill();
          }
        }
      } else {
        context.beginPath();
        context.lineWidth = 1;
        context.strokeStyle = exportGridColor;
        for (let x = startX; x <= contentBounds.x + contentBounds.width; x += spacing) {
          context.moveTo(x, contentBounds.y);
          context.lineTo(x, contentBounds.y + contentBounds.height);
        }
        for (let y = startY; y <= contentBounds.y + contentBounds.height; y += spacing) {
          context.moveTo(contentBounds.x, y);
          context.lineTo(contentBounds.x + contentBounds.width, y);
        }
        context.stroke();
      }
    }

    documentToExport.elements.forEach((element) => {
      if (element.kind === "calculator") {
        drawCalculatorElement(context, element);
        return;
      }
      if (element.kind === "converter") {
        drawConverterElement(context, element);
        return;
      }
      if (element.kind === "image") {
        const image = importedImageCacheRef.current.get(element.src);
        if (image?.complete) {
          const centerX = element.point.x + element.width / 2;
          const centerY = element.point.y + element.height / 2;
          context.save();
          context.translate(centerX, centerY);
          context.rotate(((element.rotation ?? 0) * Math.PI) / 180);
          context.drawImage(
            image,
            -element.width / 2,
            -element.height / 2,
            element.width,
            element.height
          );
          context.restore();
        }
      } else if (element.kind === "stroke") {
        context.strokeStyle = element.color ?? "#111827";
        context.fillStyle = element.color ?? "#111827";
        drawStrokePath(context, element.points, element.width, element.style);
      } else if (element.kind === "shape") {
        drawShape(
          context,
          element.tool,
          element.start.x,
          element.start.y,
          element.end.x,
          element.end.y,
          element.width,
          element.color,
          element.style
        );
      } else {
        drawTextElement(context, element);
      }
    });
    context.restore();
    return exportCanvas;
  };

  const exportBoardAsPng = async (board: BoardSummary) => {
    setIsBoardExporting(true);
    setBoardExportMessage("");
    try {
      const exportCanvas = createBoardExportCanvas(board);
      const blob = await new Promise<Blob>((resolve, reject) =>
        exportCanvas.toBlob(
          (result) =>
            result ? resolve(result) : reject(new Error("PNG creation failed.")),
          "image/png"
        )
      );
      downloadBoardBlob(blob, `${getSafeExportFileName(board.name)}.png`);
      setBoardExportMessage(t("PNG downloaded.", "Pobrano PNG."));
    } catch (error) {
      setBoardExportMessage(
        error instanceof Error ? error.message : "Could not export this PNG."
      );
    } finally {
      setIsBoardExporting(false);
    }
  };

  const createPdfFromJpeg = (
    jpegBytes: Uint8Array,
    imageWidth: number,
    imageHeight: number
  ) => {
    const encoder = new TextEncoder();
    const landscape = imageWidth >= imageHeight;
    const pageWidth = landscape ? 842 : 595;
    const pageHeight = landscape ? 595 : 842;
    const margin = 24;
    const fitScale = Math.min(
      (pageWidth - margin * 2) / imageWidth,
      (pageHeight - margin * 2) / imageHeight
    );
    const drawWidth = imageWidth * fitScale;
    const drawHeight = imageHeight * fitScale;
    const drawX = (pageWidth - drawWidth) / 2;
    const drawY = (pageHeight - drawHeight) / 2;
    const content = `q ${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(
      2
    )} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm /Im0 Do Q`;
    const chunks: BlobPart[] = [];
    const offsets = [0];
    let byteLength = 0;
    const append = (chunk: string | ArrayBuffer) => {
      chunks.push(chunk);
      byteLength +=
        typeof chunk === "string" ? encoder.encode(chunk).length : chunk.byteLength;
    };
    const object = (id: number, body: string, suffix = "") => {
      offsets[id] = byteLength;
      append(`${id} 0 obj\n`);
      append(body);
      append(`${suffix}\nendobj\n`);
    };

    append("%PDF-1.4\n%Scriboo\n");
    object(1, "<< /Type /Catalog /Pages 2 0 R >>");
    object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    object(
      3,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
    );
    offsets[4] = byteLength;
    append("4 0 obj\n");
    append(
      `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\nstream\n`
    );
    const jpegBuffer = new ArrayBuffer(jpegBytes.byteLength);
    new Uint8Array(jpegBuffer).set(jpegBytes);
    append(jpegBuffer);
    append("\nendstream\nendobj\n");
    object(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
    const xrefOffset = byteLength;
    append("xref\n0 6\n0000000000 65535 f \n");
    for (let id = 1; id <= 5; id += 1) {
      append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
    }
    append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    return new Blob(chunks, { type: "application/pdf" });
  };

  const exportBoardAsPdf = async (board: BoardSummary) => {
    setIsBoardExporting(true);
    setBoardExportMessage("");
    try {
      const exportCanvas = createBoardExportCanvas(board);
      const dataUrl = exportCanvas.toDataURL("image/jpeg", 0.94);
      const binary = window.atob(dataUrl.split(",")[1] ?? "");
      const jpegBytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0)
      );
      const pdf = createPdfFromJpeg(
        jpegBytes,
        exportCanvas.width,
        exportCanvas.height
      );
      downloadBoardBlob(pdf, `${getSafeExportFileName(board.name)}.pdf`);
    setBoardExportMessage(t("PDF downloaded.", "Pobrano PDF."));
    } catch (error) {
      setBoardExportMessage(
        error instanceof Error ? error.message : "Could not export this PDF."
      );
    } finally {
      setIsBoardExporting(false);
    }
  };

  const exportBoardAsJson = (board: BoardSummary) => {
    setBoardExportMessage("");
    const payload = {
      format: "scriboo-board",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      board: {
        id: board.id,
        name: board.name,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        document: getBoardDocumentForExport(board),
      },
    };
    downloadBoardBlob(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
      `${getSafeExportFileName(board.name)}.scriboo.json`
    );
    setBoardExportMessage(t("Editable JSON backup downloaded.", "Pobrano edytowalną kopię JSON."));
  };

  const escapeCalendarText = (value: string) =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");

  const exportBoardCalendar = (board: BoardSummary) => {
    const entries = getBoardDocumentForExport(board).calendarEntries;
    if (!entries.length) {
      setBoardExportMessage(t("This board has no calendar entries to export.", "Ta tablica nie ma wpisów kalendarza do eksportu."));
      return;
    }
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Scriboo//Board Calendar//EN",
      "CALSCALE:GREGORIAN",
      `X-WR-CALNAME:${escapeCalendarText(board.name)}`,
      ...entries.flatMap((entry) => {
        const date = entry.date.replace(/-/g, "");
        const start = entry.startHour.replace(":", "").padEnd(4, "0");
        const end = entry.endHour.replace(":", "").padEnd(4, "0");
        return [
          "BEGIN:VEVENT",
          `UID:${entry.id}@scribooapp.com`,
          `DTSTAMP:${stamp}`,
          `DTSTART:${date}T${start}00`,
          `DTEND:${date}T${end}00`,
          `SUMMARY:${escapeCalendarText(entry.title)}`,
          "END:VEVENT",
        ];
      }),
      "END:VCALENDAR",
      "",
    ];
    downloadBoardBlob(
      new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" }),
      `${getSafeExportFileName(board.name)}-calendar.ics`
    );
    setBoardExportMessage(t("Calendar file downloaded.", "Pobrano plik kalendarza."));
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
      setAuthMessage(t("Enter a board name.", "Wprowadź nazwę tablicy."));
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
      if (data.board?.updatedAt) {
        broadcastBoardSaved(boardId, data.board.updatedAt);
      }
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

  const openSharePanel = async (board: BoardSummary) => {
    if (board.ownedByUser === false) return;

    setSharingBoard(board);
    setBoardShares([]);
    setShareEmailInput("");
    setSharePanelMessage("");
    setSharePanelTone("success");
    setIsSharePanelLoading(true);

    try {
      const response = await fetch(`/api/boards/${board.id}/shares`);
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        shares?: BoardShareSummary[];
        shareLimit?: number;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not load board sharing.");
      }

      setBoardShares(data.shares ?? []);
      setShareLimit(data.shareLimit ?? 1);
    } catch (error) {
      setSharePanelMessage(
        error instanceof Error ? error.message : "Could not load board sharing."
      );
      setSharePanelTone("error");
    } finally {
      setIsSharePanelLoading(false);
    }
  };

  const submitBoardShare = async () => {
    if (!sharingBoard || !shareEmailInput.trim()) return;

    const normalizedEmail = shareEmailInput.trim().toLowerCase();
    const existingShare = boardShares.find(
      (share) => share.email.trim().toLowerCase() === normalizedEmail
    );
    if (existingShare) {
      if (existingShare.status === "accepted") {
        setSharePanelMessage(
          t(
            "This board is already shared with this person.",
            "Ta tablica jest już udostępniona tej osobie."
          )
        );
      } else {
        setSharePanelMessage(
          t(
            "An invitation has already been sent to this person.",
            "Zaproszenie zostało już wysłane do tej osoby."
          )
        );
      }
      setSharePanelTone("info");
      return;
    }

    setIsSharePanelLoading(true);
    setSharePanelMessage("");

    try {
      const response = await fetch(`/api/boards/${sharingBoard.id}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: shareEmailInput.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        share?: BoardShareSummary;
        shareCount?: number;
        shareLimit?: number;
        inviteEmailSent?: boolean;
        inviteEmailError?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not share this board.");
      }

      if (data.share) {
        const nextShare = data.share as BoardShareSummary;
        setBoardShares((previous) => {
          const existingIndex = previous.findIndex(
            (share) =>
              share.id === nextShare.id ||
              share.email.toLowerCase() === nextShare.email.toLowerCase()
          );

          if (existingIndex === -1) {
            return [...previous, nextShare];
          }

          return previous.map((share, index) =>
            index === existingIndex ? nextShare : share
          );
        });
      }
      if (typeof data.shareLimit === "number") {
        setShareLimit(data.shareLimit);
      }
      if (typeof data.shareCount === "number") {
        setBoards((previousBoards) =>
          previousBoards.map((board) =>
            board.id === sharingBoard.id
              ? { ...board, shareCount: data.shareCount }
              : board
          )
        );
      }
      setShareEmailInput("");
      if (data.inviteEmailSent) {
      setSharePanelMessage(t("Board shared successfully and invite email sent.", "Tablica została udostępniona, a zaproszenie wysłane."));
        setSharePanelTone("success");
      } else {
        setSharePanelMessage(
          "Board shared successfully, but the invite email could not be sent."
        );
        setSharePanelTone("error");
      }
    } catch (error) {
      setSharePanelMessage(
        error instanceof Error ? error.message : "Could not share this board."
      );
      setSharePanelTone("error");
    } finally {
      setIsSharePanelLoading(false);
    }
  };

  const removeBoardShare = async (share: BoardShareSummary) => {
    if (!sharingBoard) return;

    setIsSharePanelLoading(true);
    setSharePanelMessage("");

    try {
      const response = await fetch(
        `/api/boards/${sharingBoard.id}/shares/${share.id}`,
        {
          method: "DELETE",
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        shareCount?: number;
        shareLimit?: number;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove board sharing.");
      }

      setBoardShares((previous) =>
        previous.filter((item) => item.id !== share.id)
      );
      if (typeof data.shareLimit === "number") {
        setShareLimit(data.shareLimit);
      }
      if (typeof data.shareCount === "number") {
        setBoards((previousBoards) =>
          previousBoards.map((board) =>
            board.id === sharingBoard.id
              ? { ...board, shareCount: data.shareCount }
              : board
          )
        );
      }
      setSharePanelMessage(t("Sharing removed.", "Udostępnienie zostało usunięte."));
      setSharePanelTone("success");
    } catch (error) {
      setSharePanelMessage(
        error instanceof Error
          ? error.message
          : "Could not remove board sharing."
      );
      setSharePanelTone("error");
    } finally {
      setIsSharePanelLoading(false);
    }
  };

  const liveBoardsCount = boards.filter(
    (board) => board.ownedByUser !== false && !board.deletedAt
  ).length;
  const hasUnlimitedBoards = !Number.isFinite(currentMaxBoards);
  const boardUsageLabel = hasUnlimitedBoards
    ? language === "pl"
      ? `Użyto ${liveBoardsCount} tablic`
      : `${liveBoardsCount} board${liveBoardsCount === 1 ? "" : "s"} used`
    : language === "pl"
    ? `Użyto ${liveBoardsCount} / ${currentMaxBoards} tablic`
    : `${liveBoardsCount} / ${currentMaxBoards} boards used`;
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
    : "Free";
  const currentWorkspacePlanLabel = currentPlanLabel;
  const currentWorkspaceStatusMessage = hasUnlimitedBoards
    ? t(
        `You are currently logged in on the ${currentWorkspacePlanLabel} plan with unlimited saved boards.`,
        `Jesteś zalogowany w planie ${currentWorkspacePlanLabel} z nielimitowaną liczbą zapisanych tablic.`
      )
    : t(
        `You are currently logged in on the ${currentWorkspacePlanLabel} plan with up to ${currentMaxBoards} saved board${currentMaxBoards === 1 ? "" : "s"}.`,
        `Jesteś zalogowany w planie ${currentWorkspacePlanLabel} z limitem ${currentMaxBoards} zapisanych tablic.`
      );
  const currentSubscriptionEndLabel = currentSubscriptionCurrentPeriodEnd
    ? new Intl.DateTimeFormat(language === "pl" ? "pl-PL" : "en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(currentSubscriptionCurrentPeriodEnd))
    : "";
  const currentSubscriptionEndingMessage =
    currentSubscriptionCancelAtPeriodEnd && currentSubscriptionEndLabel
      ? t(
          `Your ${currentWorkspacePlanLabel} plan is scheduled to end on ${currentSubscriptionEndLabel}.`,
          `Twój plan ${currentWorkspacePlanLabel} zakończy się ${currentSubscriptionEndLabel}.`
        )
      : "";
  const currentPlanRank = hasActivePaidSubscription
    ? currentAccountPlan === "master"
      ? 3
      : currentAccountPlan === "pro"
      ? 2
      : 1
    : 0;
  const canUseCalendar =
    hasActivePaidSubscription &&
    (currentAccountPlan === "pro" || currentAccountPlan === "master");
  const isCalendarReadOnly = !canUseCalendar;
  const isBoardsBrowserVisible = showBoardsMenu;
  const isCalendarBrowserVisible =
    isBoardsBrowserVisible && boardBrowserView === "calendar";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const requestedView = searchParams.get("view");
    const checkoutStatus = searchParams.get("checkout");

    if (requestedView === "plan" || checkoutStatus === "success" || checkoutStatus === "cancelled") {
      setShowBoardsMenu(true);
      setBoardBrowserView("plan");
    }
  }, []);

  useEffect(() => {
    if (!canUseCalendar) {
      setSelectedCalendarEntryId("");
      setEditingCalendarEntryId("");
    }
  }, [canUseCalendar]);

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

  const formatBillingAmount = (
    amount: number | null | undefined,
    currency: "pln" | "eur"
  ) => {
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      return null;
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const getBillingPlanBasePrice = (
    plan: "basic" | "pro" | "master",
    currency: "pln" | "eur"
  ) => {
    if (plan === "master") {
      return currency === "eur" ? "24.99" : "79.99";
    }

    if (plan === "pro") {
      return currency === "eur" ? "14.99" : "49.99";
    }

    return currency === "eur" ? "9.99" : "29.99";
  };

  const getBillingPlanRank = (plan: "basic" | "pro" | "master") => {
    if (plan === "master") return 2;
    if (plan === "pro") return 1;
    return 0;
  };

  const applyBillingCheckoutResponse = (data: {
    message?: string;
    plan?: "basic" | "pro" | "master";
    maxBoards?: number | null;
    subscriptionStatus?:
      | "inactive"
      | "trialing"
      | "active"
      | "past_due"
      | "canceled";
  }) => {
    if (data.plan) {
      setCurrentAccountPlan(data.plan);
    }

    if (data.subscriptionStatus) {
      setCurrentSubscriptionStatus(data.subscriptionStatus);
    }

    if (data.maxBoards === null) {
      setCurrentMaxBoards(Number.POSITIVE_INFINITY);
    } else if (typeof data.maxBoards === "number") {
      setCurrentMaxBoards(data.maxBoards);
    }

    setBillingMessageTone("success");
    setBillingMessage(
      data.message ?? "Billing flow is ready for the next Stripe step."
    );
    setBillingNotice({
      title: "Billing updated",
      message: data.message ?? "Billing flow is ready for the next Stripe step.",
      tone: "success",
    });
  };

  const runPlanCheckout = async (
    targetPlan: "basic" | "pro" | "master",
    confirmSubscriptionChange = false
  ): Promise<void> => {
    const attemptKey = `${targetPlan}:${billingCurrency}`;
    const attemptId =
      checkoutAttemptIdsRef.current[attemptKey] ?? crypto.randomUUID();
    checkoutAttemptIdsRef.current[attemptKey] = attemptId;
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetPlan,
        targetCurrency: billingCurrency,
        confirmSubscriptionChange,
        attemptId,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      message?: string;
      checkoutUrl?: string;
      plan?: "basic" | "pro" | "master";
      maxBoards?: number | null;
      subscriptionStatus?:
        | "inactive"
        | "trialing"
        | "active"
        | "past_due"
        | "canceled";
      requiresPlanChangeConfirmation?: boolean;
      currentPlan?: "basic" | "pro" | "master";
      targetPlan?: "basic" | "pro" | "master";
      currency?: "pln" | "eur";
      estimatedImmediateCharge?: number | null;
      estimatedNextMonthlyCharge?: number | null;
      changeEffectiveAt?: string | null;
    };

    if (!response.ok) {
      const nextMessage =
        data.error ?? "Could not start the billing flow for this plan.";
      setBillingMessageTone("error");
      setBillingMessage(nextMessage);
      setBillingNotice({
        title: "Billing error",
        message: nextMessage,
        tone: "error",
      });
      return;
    }

    if (
      data.requiresPlanChangeConfirmation &&
      !confirmSubscriptionChange &&
      (data.estimatedImmediateCharge ?? null) === 0 &&
      getBillingPlanRank(data.targetPlan ?? targetPlan) >
        getBillingPlanRank(data.currentPlan ?? currentAccountPlan)
    ) {
      setBillingMessageTone("success");
      setBillingMessage(
        `Your upgrade starts now. From next month you will be charged ${getBillingPlanBasePrice(
          data.targetPlan ?? targetPlan,
          data.currency ?? billingCurrency
        )} ${(data.currency ?? billingCurrency).toUpperCase()} per month.`
      );
      await runPlanCheckout(targetPlan, true);
      return;
    }

    if (data.requiresPlanChangeConfirmation) {
      setBillingChangeRequest({
        currentPlan: data.currentPlan ?? currentAccountPlan,
        targetPlan: data.targetPlan ?? targetPlan,
        currency: data.currency ?? billingCurrency,
        estimatedImmediateCharge: data.estimatedImmediateCharge,
        estimatedNextMonthlyCharge: data.estimatedNextMonthlyCharge,
        changeEffectiveAt: data.changeEffectiveAt,
      });
      return;
    }

    if (data.checkoutUrl) {
      window.location.assign(data.checkoutUrl);
      return;
    }

    delete checkoutAttemptIdsRef.current[attemptKey];
    applyBillingCheckoutResponse(data);
  };

  const startPlanCheckout = async (targetPlan: "basic" | "pro" | "master") => {
    if (!currentAccountId || pendingBillingPlan) {
      return;
    }

    setPendingBillingPlan(targetPlan);
    setBillingMessage("");

    try {
      await runPlanCheckout(targetPlan, false);
    } finally {
      setPendingBillingPlan("");
    }
  };

  const openBillingPortal = async () => {
    if (!currentAccountId || isBillingPortalLoading || !hasActivePaidSubscription) {
      return;
    }

    setIsBillingPortalLoading(true);
    setBillingMessage("");

    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        portalUrl?: string;
      };

      if (!response.ok) {
        setBillingMessageTone("error");
        setBillingMessage(
          data.error ?? "Could not open the billing portal."
        );
        return;
      }

      if (data.portalUrl) {
        window.location.assign(data.portalUrl);
        return;
      }

      setBillingMessageTone("error");
      setBillingMessage("Stripe billing portal did not return a redirect URL.");
    } finally {
      setIsBillingPortalLoading(false);
    }
  };

  useEffect(() => {
    if (!currentAccountId || typeof window === "undefined") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const checkoutStatus = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");

    if (checkoutStatus !== "success" || !sessionId) {
      return;
    }

    let isCancelled = false;

    const confirmCheckout = async () => {
      setBillingMessageTone("success");
      setBillingMessage("Confirming your Stripe payment...");

      try {
        const response = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          plan?: "basic" | "pro" | "master";
          maxBoards?: number | null;
          subscriptionStatus?:
            | "inactive"
            | "trialing"
            | "active"
            | "past_due"
            | "canceled";
        };

        if (isCancelled) {
          return;
        }

        if (!response.ok) {
          setBillingMessageTone("error");
          setBillingMessage(
            data.error ?? "Could not confirm the Stripe checkout result."
          );
          return;
        }

        setCurrentAccountPlan(data.plan ?? "basic");
        setCurrentSubscriptionStatus(data.subscriptionStatus ?? "active");
        setCurrentMaxBoards(
          data.maxBoards === null
            ? Number.POSITIVE_INFINITY
            : typeof data.maxBoards === "number"
              ? data.maxBoards
              : 5
        );
        setBillingMessageTone("success");
        setBillingMessage(
          `Your workspace is now on the ${(data.plan ?? "basic").toUpperCase()} plan.`
        );

        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("checkout");
        nextUrl.searchParams.delete("session_id");
        window.history.replaceState({}, "", nextUrl.toString());
      } catch {
        if (isCancelled) {
          return;
        }

        setBillingMessageTone("error");
        setBillingMessage("Could not confirm the Stripe checkout result.");
      }
    };

    void confirmCheckout();

    return () => {
      isCancelled = true;
    };
  }, [currentAccountId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);

    if (searchParams.get("view") !== "plan") {
      return;
    }

    void loadCurrentAccount();
  }, []);

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

  const billingCurrencyLabel = billingCurrency.toUpperCase();
  const topBarPaletteGradient =
    "linear-gradient(90deg, #8b46ff 0%, #4b8fff 46%, #19c3bc 78%, #30cf68 100%)";
  const signatureIndigoGradient =
    `linear-gradient(0deg, rgba(4,8,34,0.12), rgba(4,8,34,0.12)), ${topBarPaletteGradient}`;
  const signatureIndigoButtonGradient =
    `linear-gradient(0deg, rgba(12,19,63,0.12), rgba(12,19,63,0.12)), ${topBarPaletteGradient}`;
  const topBarWarmCardGradient =
    "linear-gradient(135deg, rgba(235,142,76,0.17) 0%, rgba(248,207,96,0.14) 30%, rgba(255,255,255,0.98) 72%, rgba(104,168,239,0.1) 100%)";
  const topBarCoolCardGradient =
    "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(239,226,114,0.1) 24%, rgba(66,179,182,0.12) 68%, rgba(104,168,239,0.15) 100%)";
  const topBarFeaturedChipGradient =
    "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%)";
  const topBarGradient = isInterfaceDarkMode
    ? "linear-gradient(90deg, #171a35 0%, #202541 52%, #172d3a 100%)"
    : topBarPaletteGradient;
  const premiumHeadingStyle = {
    letterSpacing: "-0.045em",
    fontWeight: 650,
    textRendering: "optimizeLegibility" as const,
    WebkitFontSmoothing: "antialiased" as const,
    MozOsxFontSmoothing: "grayscale" as const,
  };
  const premiumBodyStyle = {
    textRendering: "optimizeLegibility" as const,
    WebkitFontSmoothing: "antialiased" as const,
    MozOsxFontSmoothing: "grayscale" as const,
  };
  const premiumShellShadow =
    "0 30px 86px rgba(15,23,42,0.16), 0 1px 0 rgba(255,255,255,0.82) inset";
  const premiumCardShadow =
    "0 18px 44px rgba(15,23,42,0.08), 0 1px 0 rgba(255,255,255,0.7) inset";
  const premiumFeaturedCardShadow =
    "0 30px 74px rgba(31,74,178,0.24), 0 1px 0 rgba(255,255,255,0.14) inset";
  const billingPlans = [
    {
      name: "Basic",
      value: "basic" as const,
      prices: { pln: "29.99", eur: "9.99" },
      priceSuffix: `${billingCurrencyLabel} / ${t("month", "miesiąc")}`,
      accent: topBarWarmCardGradient,
      border: "rgba(217,138,86,0.24)",
      text: "#1f2937",
      buttonBackground: "rgba(255,255,255,0.78)",
      buttonText: "#c25c2f",
      checkBackground: "rgba(217,138,86,0.12)",
      features: [
        t("Up to 5 boards", "Do 5 tablic"),
        t("Share with up to 1 person", "Udostępnianie 1 osobie"),
      ],
    },
    {
      name: "Pro",
      value: "pro" as const,
      prices: { pln: "49.99", eur: "14.99" },
      priceSuffix: `${billingCurrencyLabel} / ${t("month", "miesiąc")}`,
      accent: signatureIndigoGradient,
      border: "rgba(59,130,246,0.3)",
      text: "#ffffff",
      buttonBackground: "#ffffff",
      buttonText: "#166534",
      checkBackground: "rgba(255,255,255,0.18)",
      features: [
        t("Unlimited boards", "Nielimitowane tablice"),
        t("Share with up to 3 people", "Udostępnianie 3 osobom"),
        t("Calendar planning", "Planowanie w kalendarzu"),
      ],
      featured: true,
    },
    {
      name: "Master",
      value: "master" as const,
      prices: { pln: "79.99", eur: "21.99" },
      priceSuffix: `${billingCurrencyLabel} / ${t("month", "miesiąc")}`,
      accent: topBarCoolCardGradient,
      border: "rgba(89,171,168,0.26)",
      text: "#0f172a",
      buttonBackground: "rgba(255,255,255,0.72)",
      buttonText: "#16738a",
      checkBackground: "rgba(89,171,168,0.14)",
      features: [
        t("Unlimited boards", "Nielimitowane tablice"),
        t("Share with up to 10 people", "Udostępnianie 10 osobom"),
        t("Calendar planning", "Planowanie w kalendarzu"),
        t("Full premium experience", "Pełne funkcje premium"),
        t("Maximum workspace control", "Maksymalna kontrola przestrzeni"),
      ],
    },
  ];

  const calendarMonthDate = new Date(
    calendarCursor.getFullYear(),
    calendarCursor.getMonth(),
    1
  );

  const calendarMonthLabel = new Intl.DateTimeFormat(language === "pl" ? "pl-PL" : "en-US", {
    month: "long",
    year: "numeric",
  }).format(calendarMonthDate);

  const calendarDayLabel = new Intl.DateTimeFormat(language === "pl" ? "pl-PL" : "en-US", {
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
    if (!canUseCalendar) return;

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
    if (!canUseCalendar) return;

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
    if (!canUseCalendar) return;

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
    if (!canUseCalendar) return;

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
    if (!canUseCalendar) return;

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

  const getCalendarEntryColor = (entry: CalendarEntry) =>
    normalizeCalendarEntryColor(entry.color, entry.id);

  const beginEditingCalendarEntry = (entryId: string) => {
    if (!canUseCalendar) return;

    setSelectedCalendarEntryId(entryId);
    setEditingCalendarEntryId(entryId);
  };

  const lockCalendarEntry = (entryId: string) => {
    if (!canUseCalendar) return;

    setEditingCalendarEntryId((previousId) =>
      previousId === entryId ? "" : previousId
    );
    setSelectedCalendarEntryId("");
  };

  const selectCalendarEntry = (entryId: string) => {
    if (!canUseCalendar) return;

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
      ? t("Recent boards", "Ostatnie tablice")
      : boardBrowserView === "mine"
      ? t("My boards", "Moje tablice")
      : boardBrowserView === "starred"
      ? t("Starred boards", "Ulubione tablice")
      : boardBrowserView === "trash"
      ? t("Trash", "Kosz")
      : boardBrowserView === "calendar"
      ? t("Calendar", "Kalendarz")
      : boardBrowserView === "plan"
      ? t("Your plan", "Twój plan")
      : t("All boards", "Wszystkie tablice");

  const boardBrowserDescription =
    boardBrowserView === "recent"
      ? t("Your most recently updated boards appear first.", "Najnowsze zmodyfikowane tablice są wyświetlane jako pierwsze.")
      : boardBrowserView === "mine"
      ? t("Boards connected to your account.", "Tablice powiązane z Twoim kontem.")
      : boardBrowserView === "starred"
      ? t("Keep important boards close.", "Miej ważne tablice zawsze pod ręką.")
      : boardBrowserView === "trash"
      ? t("Deleted boards stay here for 30 days before disappearing.", "Usunięte tablice pozostają tutaj przez 30 dni.")
      : boardBrowserView === "calendar"
      ? t("Type meetings, schedules, and reminders directly into each day.", "Dodawaj spotkania, harmonogramy i przypomnienia bezpośrednio do każdego dnia.")
      : boardBrowserView === "plan"
      ? t("Choose the workspace plan that fits how you build, organize, and schedule.", "Wybierz plan przestrzeni dopasowany do tworzenia, organizacji i planowania.")
      : t("Open, rename, and create boards from one clean workspace.", "Otwieraj, zmieniaj nazwy i twórz tablice w jednym miejscu.");

  const formatBoardDate = (value: string) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return t("Recently updated", "Ostatnio zaktualizowano");
    }

    return new Intl.DateTimeFormat(language === "pl" ? "pl-PL" : "en-US", {
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
      if (element.kind === "calculator") {
        includePoint(element.point.x, element.point.y);
        includePoint(
          element.point.x + element.width,
          element.point.y + element.height
        );
        return;
      }
      if (element.kind === "converter") {
        includePoint(element.point.x, element.point.y);
        includePoint(
          element.point.x + element.width,
          element.point.y + element.height
        );
        return;
      }
      if (element.kind === "image") {
        includePoint(element.point.x, element.point.y);
        includePoint(
          element.point.x + element.width,
          element.point.y + element.height
        );
        return;
      }

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
    const previewHeight = 180;
    const previewPadding = 18;
    const previewElements = board.previewDocument.elements;
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

      if (element.tool === "oval") {
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

      if (element.tool === "curve") {
        const deltaX = element.end.x - element.start.x;
        return (
          <path
            key={index}
            d={`M ${element.start.x} ${element.start.y} C ${element.start.x + deltaX * 0.38} ${element.start.y}, ${element.end.x - deltaX * 0.38} ${element.end.y}, ${element.end.x} ${element.end.y}`}
            fill="none"
            stroke={element.color}
            strokeWidth={element.width}
            strokeDasharray={dashArray}
            strokeLinecap="round"
          />
        );
      }

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

      if (element.tool === "ruler") {
        const length = Math.hypot(
          element.end.x - element.start.x,
          element.end.y - element.start.y
        );
        const labelX = (element.start.x + element.end.x) / 2;
        const labelY = (element.start.y + element.end.y) / 2 - 12;
        return (
          <g key={index}>
            <line
              x1={element.start.x}
              y1={element.start.y}
              x2={element.end.x}
              y2={element.end.y}
              stroke={classicRulerColor}
              strokeWidth={element.width}
              strokeLinecap="round"
            />
            <circle cx={element.start.x} cy={element.start.y} r={3} fill={classicRulerColor} />
            <circle cx={element.end.x} cy={element.end.y} r={3} fill={classicRulerColor} />
            <text
              x={labelX}
              y={labelY}
              fill={classicRulerColor}
              fontSize="12"
              fontWeight="700"
              textAnchor="middle"
            >
              {Math.round(length)} px
            </text>
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
              if (element.kind === "image") {
                return (
                  <image
                    key={index}
                    href={element.src}
                    x={element.point.x}
                    y={element.point.y}
                    width={element.width}
                    height={element.height}
                    preserveAspectRatio="xMidYMid meet"
                    transform={`rotate(${element.rotation ?? 0} ${
                      element.point.x + element.width / 2
                    } ${element.point.y + element.height / 2})`}
                  />
                );
              }

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

              if (element.kind === "converter") {
                const option =
                  converterOptions.find(
                    (item) => item.value === element.converter
                  ) ?? converterOptions[0];
                return (
                  <g key={index}>
                    <rect
                      x={element.point.x}
                      y={element.point.y}
                      width={element.width}
                      height={element.height}
                      rx={18}
                      fill="#ffffff"
                      stroke="rgba(124,58,237,0.3)"
                    />
                    <text x={element.point.x + 16} y={element.point.y + 27} fill="#0f172a" fontSize="14" fontWeight="700">
                      Unit converter
                    </text>
                    <text x={element.point.x + 16} y={element.point.y + 77} fill="#5b21b6" fontSize="14" fontWeight="700">
                      {formatConvertedValue(element.value)} {option.inputUnit}
                    </text>
                    <text x={element.point.x + 16} y={element.point.y + 121} fill="#075985" fontSize="14" fontWeight="700">
                      {formatConvertedValue(convertBoardValue(element.converter, element.value))} {option.outputUnit}
                    </text>
                  </g>
                );
              }

              if (element.kind === "calculator") {
                const result = calculateExpression(element.expression);
                return (
                  <g key={index}>
                    <rect x={element.point.x} y={element.point.y} width={element.width} height={element.height} rx={18} fill="#ffffff" stroke="rgba(75,143,255,0.3)" />
                    <text x={element.point.x + 16} y={element.point.y + 27} fill="#0f172a" fontSize="14" fontWeight="700">Calculator</text>
                    <text x={element.point.x + element.width - 18} y={element.point.y + 67} fill="#64748b" fontSize="12" textAnchor="end">{element.expression || "0"}</text>
                    <text x={element.point.x + element.width - 18} y={element.point.y + 96} fill="#0f172a" fontSize="19" fontWeight="800" textAnchor="end">{result === null ? "—" : formatConvertedValue(result)}</text>
                  </g>
                );
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

  const refreshBoardFromRealtime = useEffectEvent(
    async (boardId: string, updatedAt?: string) => {
      if (!boardId || boardId !== activeBoardId || !currentAccountId) return;
      const knownUpdatedAt = boardUpdatedAtRef.current[boardId];
      if (
        updatedAt &&
        knownUpdatedAt &&
        new Date(updatedAt).getTime() <= new Date(knownUpdatedAt).getTime()
      ) {
        return;
      }

      const refreshAttempt = latestRemoteRefreshRef.current + 1;
      latestRemoteRefreshRef.current = refreshAttempt;
      const data = await readBoardResponse(
        await fetch(`/api/boards/${encodeURIComponent(boardId)}`, {
          cache: "no-store",
        })
      );
      if (refreshAttempt !== latestRemoteRefreshRef.current) return;
      if (data.board?.id !== boardId) return;

      const remoteUpdatedAt = data.board.updatedAt;
      if (!remoteUpdatedAt) return;
      const latestKnownUpdatedAt = boardUpdatedAtRef.current[boardId];
      if (
        latestKnownUpdatedAt &&
        new Date(remoteUpdatedAt).getTime() <=
          new Date(latestKnownUpdatedAt).getTime()
      ) {
        return;
      }

      // Compare the authoritative server version before deciding there is a
      // conflict. This lets a periodic recovery check run harmlessly while a
      // user is drawing when no newer remote version actually exists.
      if (hasUnsavedBoardChangesRef.current || isDrawingRef.current) {
        setBoardSaveState("conflict");
        return;
      }

      boardUpdatedAtRef.current[boardId] = remoteUpdatedAt;
      setBoards((previousBoards) =>
        previousBoards.map((board) =>
          board.id === boardId
            ? {
                ...board,
                name: data.board?.name ?? board.name,
                createdAt: data.board?.createdAt ?? board.createdAt,
                updatedAt: remoteUpdatedAt,
                deletedAt: data.board?.deletedAt,
                starred: data.board?.starred ?? board.starred,
                previewDocument: data.board?.document ?? board.previewDocument,
              }
            : board
        )
      );
      applyBoardDocument(data.board.document);
    }
  );

  const beginLivePenStroke = useCallback(
    (stroke: Stroke) => {
      if (!activeBoardId || stroke.tool !== "pen" || !stroke.id) return;
      const state = {
        strokeId: stroke.id,
        sequence: 0,
        sentPointCount: stroke.points.length,
        lastSentAt: performance.now(),
        flushTimer: null,
      };
      localLiveStrokeRef.current = state;
      sendLiveStrokeMessage("stroke-start", {
        version: LIVE_STROKE_PROTOCOL_VERSION,
        boardId: activeBoardId,
        senderId: boardRealtimeClientIdRef.current,
        strokeId: stroke.id,
        sequence: state.sequence,
        width: stroke.width,
        color: stroke.color ?? "#000000",
        style: stroke.style ?? "solid",
        points: stroke.points,
      });
    },
    [activeBoardId, sendLiveStrokeMessage]
  );

  const flushLivePenPoints = useCallback(
    (force = false) => {
      const state = localLiveStrokeRef.current;
      const stroke = currentStroke.current;
      if (!state || !stroke || stroke.id !== state.strokeId || !activeBoardId) {
        return;
      }

      const elapsed = performance.now() - state.lastSentAt;
      if (!force && elapsed < 40) {
        if (state.flushTimer === null) {
          state.flushTimer = window.setTimeout(() => {
            const latest = localLiveStrokeRef.current;
            if (latest) latest.flushTimer = null;
            flushLivePenPoints(true);
          }, Math.max(1, 40 - elapsed));
        }
        return;
      }

      if (state.flushTimer !== null) {
        window.clearTimeout(state.flushTimer);
        state.flushTimer = null;
      }

      while (state.sentPointCount < stroke.points.length) {
        const points = stroke.points.slice(
          state.sentPointCount,
          state.sentPointCount + MAX_LIVE_STROKE_BATCH_POINTS
        );
        if (!points.length) break;
        state.sequence += 1;
        state.sentPointCount += points.length;
        sendLiveStrokeMessage("stroke-points", {
          version: LIVE_STROKE_PROTOCOL_VERSION,
          boardId: activeBoardId,
          senderId: boardRealtimeClientIdRef.current,
          strokeId: state.strokeId,
          sequence: state.sequence,
          points,
        });
      }
      state.lastSentAt = performance.now();
    },
    [activeBoardId, sendLiveStrokeMessage]
  );

  const finishLivePenStroke = useCallback(
    (stroke: Stroke) => {
      const state = localLiveStrokeRef.current;
      if (!state || !stroke.id || stroke.id !== state.strokeId || !activeBoardId) {
        return;
      }
      flushLivePenPoints(true);
      state.sequence += 1;
      const finalPoints =
        stroke.points.length <= MAX_LIVE_STROKE_POINTS
          ? stroke.points
          : Array.from({ length: MAX_LIVE_STROKE_POINTS }, (_, index) =>
              stroke.points[
                Math.round(
                  (index * (stroke.points.length - 1)) /
                    (MAX_LIVE_STROKE_POINTS - 1)
                )
              ]
            );
      sendLiveStrokeMessage("stroke-end", {
        version: LIVE_STROKE_PROTOCOL_VERSION,
        boardId: activeBoardId,
        senderId: boardRealtimeClientIdRef.current,
        strokeId: state.strokeId,
        sequence: state.sequence,
        points: finalPoints,
      });
      if (state.flushTimer !== null) window.clearTimeout(state.flushTimer);
      localLiveStrokeRef.current = null;
    },
    [activeBoardId, flushLivePenPoints, sendLiveStrokeMessage]
  );

  const retryUnsavedBoardEffect = useEffectEvent(() => {
    if (
      currentAccountId &&
      activeBoardId &&
      hasUnsavedBoardChangesRef.current
    ) {
      persistBoard(activeBoardId).catch(() => null);
    }
  });

  useEffect(() => {
    const existing = boardRealtimeChannelRef.current;
    if (existing) {
      boardRealtimeChannelRef.current = null;
      boardRealtimeReadyRef.current = false;
      void getSupabaseBrowserClient().removeChannel(existing);
    }
    if (!currentAccountId || !activeBoardId) return;

    const supabase = getSupabaseBrowserClient();
    const remoteStrokes = remoteLiveStrokesRef.current;
    const remoteTexts = remoteLiveTextsRef.current;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void (async () => {
      // Private channels must not subscribe before the authenticated Realtime
      // token is ready. The previous race was especially visible on tablets.
      await supabase.realtime.setAuth();
      if (cancelled) return;

      const nextChannel = supabase.channel(`board:${activeBoardId}`, {
        config: { private: true, broadcast: { ack: false, self: false } },
      });
      channel = nextChannel;
      const reportBoardEvent = (event: string, payload: unknown) => {
        const sentAt =
          payload && typeof payload === "object" && "sentAt" in payload
            ? Number((payload as { sentAt?: unknown }).sentAt)
            : NaN;
        reportRealtimeDiagnostics({
          boardLastEvent: `${event} at ${new Date().toLocaleTimeString()}`,
          boardLatencyMs: Number.isFinite(sentAt)
            ? Math.max(0, Date.now() - sentAt)
            : null,
          error: "",
        });
      };
      nextChannel.on("broadcast", { event: "board-saved" }, ({ payload }) => {
        reportBoardEvent("board-saved", payload);
        const message = payload as {
          boardId?: unknown;
          updatedAt?: unknown;
          senderId?: unknown;
        };
        if (
          message.senderId === boardRealtimeClientIdRef.current ||
          message.boardId !== activeBoardId ||
          typeof message.updatedAt !== "string"
        ) {
          return;
        }
        void refreshBoardFromRealtime(activeBoardId, message.updatedAt).catch(
          () => undefined
        );
      });
      nextChannel.on("broadcast", { event: "stroke-start" }, ({ payload }) => {
        reportBoardEvent("stroke-start", payload);
        const message = parseLiveStrokeStart(payload);
        if (
          !message ||
          message.boardId !== activeBoardId ||
          message.senderId === boardRealtimeClientIdRef.current
        ) {
          return;
        }
        remoteLiveStrokesRef.current.set(
          `${message.senderId}:${message.strokeId}`,
          {
            senderId: message.senderId,
            sequence: message.sequence,
            updatedAt: Date.now(),
            stroke: {
              kind: "stroke",
              id: message.strokeId,
              tool: "pen",
              width: message.width,
              color: message.color,
              style: message.style,
              points: message.points,
            },
          }
        );
        requestCanvasRedraw();
      });
      nextChannel.on("broadcast", { event: "stroke-points" }, ({ payload }) => {
        reportBoardEvent("stroke-points", payload);
        const message = parseLiveStrokePoints(payload);
        if (
          !message ||
          message.boardId !== activeBoardId ||
          message.senderId === boardRealtimeClientIdRef.current
        ) {
          return;
        }
        const key = `${message.senderId}:${message.strokeId}`;
        const remote = remoteLiveStrokesRef.current.get(key);
        if (!remote || message.sequence <= remote.sequence) return;
        remote.sequence = message.sequence;
        remote.updatedAt = Date.now();
        remote.stroke.points = [
          ...remote.stroke.points,
          ...message.points,
        ].slice(0, MAX_LIVE_STROKE_POINTS);
        requestCanvasRedraw();
      });
      nextChannel.on("broadcast", { event: "stroke-end" }, ({ payload }) => {
        reportBoardEvent("stroke-end", payload);
        const message = parseLiveStrokePoints(payload, { final: true });
        if (
          !message ||
          message.boardId !== activeBoardId ||
          message.senderId === boardRealtimeClientIdRef.current
        ) {
          return;
        }
        const key = `${message.senderId}:${message.strokeId}`;
        const remote = remoteLiveStrokesRef.current.get(key);
        if (!remote || message.sequence <= remote.sequence) return;
        remote.sequence = message.sequence;
        remote.updatedAt = Date.now();
        remote.completedAt = Date.now();
        remote.stroke.points = message.points;
        requestCanvasRedraw();
      });
      nextChannel.on("broadcast", { event: "board-cleared" }, ({ payload }) => {
        reportBoardEvent("board-cleared", payload);
        if (!payload || typeof payload !== "object") return;
        const message = payload as {
          boardId?: unknown;
          senderId?: unknown;
        };
        if (
          message.boardId !== activeBoardId ||
          message.senderId === boardRealtimeClientIdRef.current
        ) return;
        if (hasUnsavedBoardChangesRef.current || isDrawingRef.current) {
          setBoardSaveState("conflict");
          return;
        }
        suppressBoardAutosaveUntilRef.current = Date.now() + 1_200;
        remoteStrokes.clear();
        remoteTexts.clear();
        setElements([]);
        setActiveText(null);
        setSelectedImageIndex(null);
        requestCanvasRedraw();
      });
      nextChannel.on("broadcast", { event: "text-preview" }, ({ payload }) => {
        reportBoardEvent("text-preview", payload);
        if (!payload || typeof payload !== "object") return;
        const message = payload as {
          version?: unknown;
          boardId?: unknown;
          senderId?: unknown;
          textId?: unknown;
          element?: unknown;
        };
        if (
          message.version !== 1 ||
          message.boardId !== activeBoardId ||
          message.senderId === boardRealtimeClientIdRef.current ||
          typeof message.senderId !== "string" ||
          typeof message.textId !== "string" ||
          !message.element ||
          typeof message.element !== "object"
        ) return;
        const element = message.element as Partial<TextElement>;
        if (
          element.kind !== "text" ||
          typeof element.value !== "string" ||
          element.value.length > 20_000 ||
          !element.point ||
          !Number.isFinite(element.point.x) ||
          !Number.isFinite(element.point.y) ||
          typeof element.color !== "string" ||
          typeof element.fontFamily !== "string" ||
          typeof element.fontSize !== "number" ||
          typeof element.width !== "number" ||
          typeof element.height !== "number"
        ) return;
        remoteTexts.set(
          `${message.senderId}:${message.textId}`,
          { element: element as TextElement, updatedAt: Date.now() }
        );
        requestCanvasRedraw();
      });
      nextChannel.on("broadcast", { event: "text-end" }, ({ payload }) => {
        reportBoardEvent("text-end", payload);
        if (!payload || typeof payload !== "object") return;
        const message = payload as {
          boardId?: unknown;
          senderId?: unknown;
          textId?: unknown;
          committed?: unknown;
        };
        if (
          message.boardId !== activeBoardId ||
          typeof message.senderId !== "string" ||
          typeof message.textId !== "string"
        ) return;
        const key = `${message.senderId}:${message.textId}`;
        if (message.committed === true) {
          const remote = remoteTexts.get(key);
          if (remote) remote.updatedAt = Date.now();
        } else {
          remoteTexts.delete(key);
        }
        requestCanvasRedraw();
      });
      nextChannel.subscribe((status, subscriptionError) => {
        if (cancelled) return;
        boardRealtimeReadyRef.current = status === "SUBSCRIBED";
        const subscriptionErrorMessage = subscriptionError?.message?.trim();
        if (subscriptionError) {
          console.error("Scriboo board realtime subscription failed", {
            status,
            boardId: activeBoardId,
            error: subscriptionError,
          });
        }
        reportRealtimeDiagnostics({
          boardStatus: status.toLowerCase(),
          error:
            status === "CHANNEL_ERROR" || status === "TIMED_OUT"
              ? `Board realtime ${status.toLowerCase()}${
                  subscriptionErrorMessage
                    ? `: ${subscriptionErrorMessage}`
                    : " (no server details returned)"
                }`
              : "",
        });
        if (status !== "SUBSCRIBED") return;
        const pending = pendingBoardRealtimeMessageRef.current;
        if (!pending || pending.boardId !== activeBoardId) return;
        pendingBoardRealtimeMessageRef.current = null;
        broadcastBoardSaved(pending.boardId, pending.updatedAt);
      });
      boardRealtimeChannelRef.current = nextChannel;
    })().catch((error: unknown) => {
      if (!cancelled) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Unknown authentication error";
        console.error("Scriboo board realtime setup failed", error);
        boardRealtimeReadyRef.current = false;
        reportRealtimeDiagnostics({
          boardStatus: "error",
          error: `Board realtime authentication failed: ${message}`,
        });
      }
    });

    return () => {
      cancelled = true;
      const local = localLiveStrokeRef.current;
      if (local && local.flushTimer !== null) {
        window.clearTimeout(local.flushTimer);
      }
      localLiveStrokeRef.current = null;
      localLiveTextRef.current = null;
      remoteStrokes.clear();
      remoteTexts.clear();
      requestCanvasRedraw();
      if (boardRealtimeChannelRef.current === channel) {
        boardRealtimeChannelRef.current = null;
        boardRealtimeReadyRef.current = false;
      }
      if (channel) void supabase.removeChannel(channel);
    };
  }, [
    activeBoardId,
    broadcastBoardSaved,
    currentAccountId,
    requestCanvasRedraw,
  ]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      let removed = false;
      for (const [key, remote] of remoteLiveStrokesRef.current) {
        const lifetime = remote.completedAt
          ? now - remote.completedAt
          : now - remote.updatedAt;
        const maximumLifetime = remote.completedAt ? 12_000 : 30_000;
        if (lifetime > maximumLifetime) {
          remoteLiveStrokesRef.current.delete(key);
          removed = true;
        }
      }
      for (const [key, remote] of remoteLiveTextsRef.current) {
        if (now - remote.updatedAt > 30_000) {
          remoteLiveTextsRef.current.delete(key);
          removed = true;
        }
      }
      if (removed) requestCanvasRedraw();
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [requestCanvasRedraw]);

  useEffect(() => {
    if (!currentAccountId || !activeBoardId) return;

    const recoverMissedBoardUpdate = (force = false) => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      // Live broadcasts are authoritative while the channel is healthy. The
      // polling path exists only to recover while Realtime is disconnected;
      // continuously downloading the full board caused avoidable database
      // pressure and could make sharing/calling queries time out.
      if (!force && boardRealtimeReadyRef.current) return;
      void refreshBoardFromRealtime(activeBoardId).catch(() => undefined);
    };
    const recoverAfterWake = () => recoverMissedBoardUpdate(true);

    // Realtime remains the fast path. This modest fallback makes missed
    // broadcasts, tablet sleep/wake, and temporary channel failures recover
    // automatically instead of leaving two users permanently out of sync.
    const interval = window.setInterval(recoverMissedBoardUpdate, 5_000);
    window.addEventListener("focus", recoverAfterWake);
    window.addEventListener("online", recoverAfterWake);
    document.addEventListener("visibilitychange", recoverAfterWake);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", recoverAfterWake);
      window.removeEventListener("online", recoverAfterWake);
      document.removeEventListener("visibilitychange", recoverAfterWake);
    };
  }, [activeBoardId, currentAccountId]);

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

  const getSmoothedStrokePoints = (points: Point[]) => {
    if (points.length < 3) return points;

    const smoothPass = (input: Point[]) => {
      const output = [input[0]];

      for (let i = 1; i < input.length - 1; i += 1) {
        const previous = input[i - 1];
        const current = input[i];
        const next = input[i + 1];

        output.push({
          x: previous.x * 0.2 + current.x * 0.6 + next.x * 0.2,
          y: previous.y * 0.2 + current.y * 0.6 + next.y * 0.2,
        });
      }

      output.push(input[input.length - 1]);
      return output;
    };

    const firstPass = smoothPass(points);
    return points.length > 5 ? smoothPass(firstPass) : firstPass;
  };

  const handleSocialAuth = async (provider: SocialAuthProvider) => {
    if (isAuthSubmitting) return;

    setIsAuthSubmitting(true);
    setAuthMessage("");
    setCanResendConfirmation(false);

    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/custom?welcome=login")}`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });

      if (error) {
        throw error;
      }

      if (!data.url) {
        throw new Error("Could not start social login.");
      }

      window.location.assign(data.url);
    } catch (error) {
      const providerLabel = provider === "google" ? "Google" : "Apple";
      setAuthMessage(
        error instanceof Error
          ? error.message
          : `${providerLabel} login is not available right now.`
      );
      setIsAuthSubmitting(false);
    }
  };

  const drawStrokePath = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    width: number,
    style?: StrokeStyle
  ) => {
    if (!points.length) return;

    const smoothedPoints = getSmoothedStrokePoints(points);

    ctx.lineCap = getStrokeLineCap(style);
    ctx.lineJoin = "round";
    ctx.lineWidth = width;
    ctx.setLineDash(getStrokeDashPattern(style, width));

    if (smoothedPoints.length === 1) {
      const point = smoothedPoints[0];
      ctx.beginPath();
      ctx.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(smoothedPoints[0].x, smoothedPoints[0].y);

    if (smoothedPoints.length === 2) {
      ctx.lineTo(smoothedPoints[1].x, smoothedPoints[1].y);
      ctx.stroke();
      return;
    }

    const tension = 0.14;

    for (let i = 0; i < smoothedPoints.length - 1; i++) {
      const p0 = smoothedPoints[i - 1] ?? smoothedPoints[i];
      const p1 = smoothedPoints[i];
      const p2 = smoothedPoints[i + 1];
      const p3 = smoothedPoints[i + 2] ?? p2;

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

    if (shape === "oval") {
      ctx.ellipse(
        startX + shapeWidth / 2,
        startY + height / 2,
        Math.max(Math.abs(shapeWidth) / 2, 1),
        Math.max(Math.abs(height) / 2, 1),
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      return;
    }

    if (shape === "curve") {
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(
        startX + shapeWidth * 0.38,
        startY,
        currentX - shapeWidth * 0.38,
        currentY,
        currentX,
        currentY
      );
      ctx.stroke();
      return;
    }

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

    if (shape === "triangle") {
      ctx.moveTo(startX + shapeWidth / 2, startY);
      ctx.lineTo(currentX, currentY);
      ctx.lineTo(startX, currentY);
      ctx.closePath();
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

    if (shape === "ruler") {
      const length = Math.hypot(shapeWidth, height);
      if (length < 1) return;

      const angle = Math.atan2(height, shapeWidth);
      const capHeight = 14;
      const tickSpacing = 10;

      ctx.save();
      ctx.translate(startX, startY);
      ctx.rotate(angle);
      ctx.setLineDash([]);
      ctx.lineCap = "round";
      ctx.strokeStyle = classicRulerColor;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length, 0);
      ctx.moveTo(0, -capHeight);
      ctx.lineTo(0, capHeight);
      ctx.moveTo(length, -capHeight);
      ctx.lineTo(length, capHeight);

      const tickCount = Math.min(Math.floor(length / tickSpacing), 500);
      for (let index = 1; index < tickCount; index += 1) {
        const x = index * tickSpacing;
        const tickHeight = index % 5 === 0 ? 8 : 4;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, tickHeight);
      }
      ctx.stroke();

      const label = `${Math.round(length)} px`;
      ctx.font = "600 12px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const labelWidth = ctx.measureText(label).width + 14;
      const labelX = length / 2;
      const labelY = -19;
      ctx.fillStyle = classicRulerColor;
      ctx.beginPath();
      ctx.roundRect(labelX - labelWidth / 2, labelY - 10, labelWidth, 20, 7);
      ctx.fill();
      ctx.fillStyle = classicRulerTextColor;
      ctx.fillText(label, labelX, labelY + 0.5);
      ctx.restore();
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
  const isNeonCanvas = canvasBackground === neonCanvasBackground;
  const canvasFillColor = isFloralCanvas
    ? lightCanvasColor
    : isNeonCanvas
      ? neonCanvasBaseColor
      : canvasBackground;
  const canvasCssBackground = isNeonCanvas
    ? "radial-gradient(circle at 18% 16%, rgba(124,58,237,0.3), transparent 38%), radial-gradient(circle at 82% 78%, rgba(6,182,212,0.18), transparent 42%), #070816"
    : canvasFillColor;

  const drawCanvasBackground = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    ctx.fillStyle = canvasFillColor;
    ctx.fillRect(0, 0, width, height);

    if (isNeonCanvas) {
      const violetGlow = ctx.createRadialGradient(
        width * 0.18,
        height * 0.16,
        0,
        width * 0.18,
        height * 0.16,
        Math.max(width, height) * 0.62
      );
      violetGlow.addColorStop(0, "rgba(124,58,237,0.3)");
      violetGlow.addColorStop(0.5, "rgba(59,130,246,0.08)");
      violetGlow.addColorStop(1, "rgba(7,8,22,0)");
      ctx.fillStyle = violetGlow;
      ctx.fillRect(0, 0, width, height);

      const cyanGlow = ctx.createRadialGradient(
        width * 0.84,
        height * 0.82,
        0,
        width * 0.84,
        height * 0.82,
        Math.max(width, height) * 0.48
      );
      cyanGlow.addColorStop(0, "rgba(6,182,212,0.2)");
      cyanGlow.addColorStop(1, "rgba(7,8,22,0)");
      ctx.fillStyle = cyanGlow;
      ctx.fillRect(0, 0, width, height);
    }

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
      gridMode === "dots"
        ? 48
        : gridMode === "small"
        ? 24
        : gridMode === "large"
        ? 72
        : 40;
    const gridVisibleLeft = -offset.x / zoom;
    const gridVisibleTop = -offset.y / zoom;
    const gridVisibleRight = (width - offset.x) / zoom;
    const gridVisibleBottom = (height - offset.y) / zoom;
    const gridStartX = Math.floor(gridVisibleLeft / gridSpacing) * gridSpacing;
    const gridStartY = Math.floor(gridVisibleTop / gridSpacing) * gridSpacing;
    const shouldUseLightGrid =
      canvasBackground === darkCanvasColor ||
      canvasBackground === greyCanvasColor ||
      canvasBackground === neonCanvasBackground;
    const gridColor =
      shouldUseLightGrid
        ? `rgba(255,255,255,${(gridOpacity / 100).toFixed(2)})`
        : `rgba(15,23,42,${(gridOpacity / 100).toFixed(2)})`;

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    if (gridMode === "dots") {
      ctx.fillStyle = gridColor;
      const dotRadius = 1.7 / Math.max(zoom, 0.35);
      for (let x = gridStartX; x <= gridVisibleRight; x += gridSpacing) {
        for (let y = gridStartY; y <= gridVisibleBottom; y += gridSpacing) {
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      return;
    }

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

    const activeEraserStroke =
      currentStroke.current?.tool === "eraser" ? currentStroke.current : null;
    const visibleElements = activeEraserStroke
      ? eraseElements(elements, activeEraserStroke)
      : elements;

    for (const [index, element] of visibleElements.entries()) {
      if (activeText?.editingIndex === index) {
        continue;
      }
      reportRealtimeDiagnostics({ boardStatus: "closed" });

      if (element.kind === "converter") {
        drawConverterElement(ctx, element);
        continue;
      }

      if (element.kind === "calculator") {
        drawCalculatorElement(ctx, element);
        continue;
      }

      if (element.kind === "image") {
        const cachedImage = importedImageCacheRef.current.get(element.src);
        if (cachedImage?.complete) {
          const centerX = element.point.x + element.width / 2;
          const centerY = element.point.y + element.height / 2;
          ctx.save();
          ctx.translate(centerX, centerY);
          ctx.rotate(((element.rotation ?? 0) * Math.PI) / 180);
          ctx.drawImage(
            cachedImage,
            -element.width / 2,
            -element.height / 2,
            element.width,
            element.height
          );
          ctx.restore();
        } else {
          const image = new Image();
          image.onload = () => {
            importedImageCacheRef.current.set(element.src, image);
            latestRedrawCanvasRef.current();
          };
          image.src = element.src;
          importedImageCacheRef.current.set(element.src, image);
        }
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

    if (
      currentStroke.current?.tool === "pen" &&
      currentStroke.current.points.length > 0
    ) {
      const stroke = currentStroke.current;
      ctx.strokeStyle = stroke.color ?? "black";
      ctx.fillStyle = stroke.color ?? "black";
      drawStrokePath(ctx, stroke.points, stroke.width, stroke.style);
    }

    for (const remote of remoteLiveStrokesRef.current.values()) {
      const stroke = remote.stroke;
      if (stroke.points.length === 0) continue;
      ctx.strokeStyle = stroke.color ?? "black";
      ctx.fillStyle = stroke.color ?? "black";
      drawStrokePath(ctx, stroke.points, stroke.width, stroke.style);
    }

    for (const remote of remoteLiveTextsRef.current.values()) {
      drawTextElement(ctx, remote.element);
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
    requestCanvasRedraw();
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

  useEffect(() => {
    if (!welcomeCelebration) return;
    const timeout = window.setTimeout(() => setWelcomeCelebration(null), 2_050);
    return () => window.clearTimeout(timeout);
  }, [welcomeCelebration]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const refreshAccountState = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      void loadCurrentAccount();
    };

    window.addEventListener("focus", refreshAccountState);
    window.addEventListener("pageshow", refreshAccountState);
    document.addEventListener("visibilitychange", refreshAccountState);

    return () => {
      window.removeEventListener("focus", refreshAccountState);
      window.removeEventListener("pageshow", refreshAccountState);
      document.removeEventListener("visibilitychange", refreshAccountState);
    };
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
    for (const board of boards) {
      if (board.updatedAt) boardUpdatedAtRef.current[board.id] = board.updatedAt;
    }
  }, [boards]);

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
      if (!(target instanceof Element)) return;

      // Board actions render their dialogs outside of the boards panel. Treat
      // those layers as part of the panel so interacting with a dialog does
      // not close the board browser underneath it.
      if (target.closest("[data-board-browser-layer='true']")) return;

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
    const handleOnline = () => {
      setIsOnline(true);
      if (hasUnsavedBoardChangesRef.current) {
        setBoardSaveState("dirty");
        window.setTimeout(() => retryUnsavedBoardEffect(), 0);
      } else {
        setBoardSaveState("saved");
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setBoardSaveState("offline");
    };

    setIsOnline(navigator.onLine);
    if (!navigator.onLine) setBoardSaveState("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const warnAboutUnsavedChanges = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedBoardChangesRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnAboutUnsavedChanges);
    return () =>
      window.removeEventListener("beforeunload", warnAboutUnsavedChanges);
  }, []);

  useEffect(() => {
    if (!currentAccountId || !activeBoardId) return;
    if (Date.now() < suppressBoardAutosaveUntilRef.current) return;

    boardChangeVersionRef.current += 1;
    hasUnsavedBoardChangesRef.current = true;

    const browserIsOnline = navigator.onLine;
    setIsOnline(browserIsOnline);
    setBoardSaveState(browserIsOnline ? "dirty" : "offline");

    if (autosaveBoardTimeoutRef.current !== null) {
      window.clearTimeout(autosaveBoardTimeoutRef.current);
    }

    if (!browserIsOnline) return;

    autosaveBoardTimeoutRef.current = window.setTimeout(() => {
      persistBoardEffect(activeBoardId);
      autosaveBoardTimeoutRef.current = null;
    }, 220);

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

  const insertConverterObject = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const center = getCanvasCoordinatesFromClient(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    recordCanvasHistory();
    setElements((previous) => [
      ...previous,
      {
        kind: "converter",
        point: { x: center.x - 110, y: center.y - 74 },
        width: 220,
        height: 148,
        converter: "km-mi",
        value: 1,
      },
    ]);
    setShowBrainstormMenu(false);
  };

  const publishPersonalNoteSelection = () => {
    const note = personalNoteRef.current;
    const canvas = canvasRef.current;
    if (!note || !canvas) return;
    if (
      activeBoard?.ownedByUser === false &&
      activeBoard.sharePermission !== "editor"
    ) {
      window.alert(t("You only have view access to this board.", "Masz tylko dostęp do podglądu tej tablicy."));
      return;
    }
    const selected = personalNoteContent
      .slice(note.selectionStart, note.selectionEnd)
      .trim();
    if (!selected) {
      window.alert(t("Select some private text to publish first.", "Najpierw zaznacz prywatny tekst do opublikowania."));
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const center = getCanvasCoordinatesFromClient(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    const fontSize = 20;
    const width = 360;
    const lineCount = Math.max(1, Math.ceil(selected.length / 38));
    recordCanvasHistory();
    setElements((previous) => [
      ...previous,
      {
        kind: "text",
        point: { x: center.x - width / 2, y: center.y - 40 },
        value: selected,
        color: penColor,
        runs: [],
        fontFamily: textFontFamily,
        fontWeight: 500,
        fontSize,
        fontStyle: "normal",
        underline: false,
        textAlign: "left",
        width,
        height: Math.max(52, lineCount * fontSize * textLineHeight + 20),
        backgroundColor: "rgba(255,255,255,0.9)",
      },
    ]);
  };

  const drawConverterElement = (
    ctx: CanvasRenderingContext2D,
    converter: ConverterElement
  ) => {
    const option =
      converterOptions.find((item) => item.value === converter.converter) ??
      converterOptions[0];
    const result = convertBoardValue(converter.converter, converter.value);
    const { x, y } = converter.point;
    ctx.save();
    ctx.shadowColor = "rgba(15,23,42,0.14)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.beginPath();
    ctx.roundRect(x, y, converter.width, converter.height, 18);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(124,58,237,0.24)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 14px Inter, system-ui, sans-serif";
    ctx.fillText("Unit converter", x + 16, y + 25);
    ctx.fillStyle = "#64748b";
    ctx.font = "500 11px Inter, system-ui, sans-serif";
    ctx.fillText(option.label, x + 16, y + 44);
    ctx.fillStyle = "#f5f3ff";
    ctx.beginPath();
    ctx.roundRect(x + 14, y + 57, converter.width - 28, 32, 9);
    ctx.fill();
    ctx.fillStyle = "#5b21b6";
    ctx.font = "700 14px Inter, system-ui, sans-serif";
    ctx.fillText(`${formatConvertedValue(converter.value)} ${option.inputUnit}`, x + 25, y + 78);
    ctx.fillStyle = "#e0f2fe";
    ctx.beginPath();
    ctx.roundRect(x + 14, y + 101, converter.width - 28, 32, 9);
    ctx.fill();
    ctx.fillStyle = "#075985";
    ctx.fillText(`${formatConvertedValue(result)} ${option.outputUnit}`, x + 25, y + 122);
    ctx.restore();
  };

  const drawCalculatorElement = (
    ctx: CanvasRenderingContext2D,
    calculator: CalculatorElement
  ) => {
    const { x, y } = calculator.point;
    const result = calculateExpression(calculator.expression);
    ctx.save();
    ctx.shadowColor = "rgba(15,23,42,0.14)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.beginPath();
    ctx.roundRect(x, y, calculator.width, calculator.height, 18);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(75,143,255,0.24)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 14px Inter, system-ui, sans-serif";
    ctx.fillText("Calculator", x + 16, y + 25);
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.roundRect(x + 14, y + 42, calculator.width - 28, 64, 11);
    ctx.fill();
    ctx.fillStyle = "#64748b";
    ctx.font = "500 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(calculator.expression || "0", x + calculator.width - 24, y + 65);
    ctx.fillStyle = "#0f172a";
    ctx.font = "800 19px Inter, system-ui, sans-serif";
    ctx.fillText(result === null ? "—" : formatConvertedValue(result), x + calculator.width - 24, y + 94);
    ctx.textAlign = "left";
    ctx.fillStyle = "#eef2ff";
    ctx.beginPath();
    ctx.roundRect(x + 14, y + 120, calculator.width - 28, calculator.height - 134, 12);
    ctx.fill();
    ctx.restore();
  };

  const updateConverterObject = (
    index: number,
    update: Partial<Pick<ConverterElement, "converter" | "value">>
  ) => {
    recordCanvasHistory();
    setElements((previous) =>
      previous.map((element, elementIndex) =>
        elementIndex === index && element.kind === "converter"
          ? { ...element, ...update }
          : element
      )
    );
  };

  const beginConverterDrag = (
    event: React.PointerEvent<HTMLElement>,
    index: number,
    converter: ConverterElement
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    converterDragRef.current = {
      index,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPoint: converter.point,
      didRecordHistory: false,
    };
  };

  const moveConverter = (event: React.PointerEvent<HTMLElement>) => {
    const drag = converterDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (!drag.didRecordHistory) {
      recordCanvasHistory();
      drag.didRecordHistory = true;
    }
    const dx = (event.clientX - drag.startClient.x) / zoomRef.current;
    const dy = (event.clientY - drag.startClient.y) / zoomRef.current;
    setElements((previous) =>
      previous.map((element, index) =>
        index === drag.index && element.kind === "converter"
          ? {
              ...element,
              point: { x: drag.startPoint.x + dx, y: drag.startPoint.y + dy },
            }
          : element
      )
    );
  };

  const endConverterDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    converterDragRef.current = null;
  };

  const insertCalculatorObject = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const center = getCanvasCoordinatesFromClient(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    recordCanvasHistory();
    setElements((previous) => [
      ...previous,
      {
        kind: "calculator",
        point: { x: center.x - 100, y: center.y - 145 },
        width: 200,
        height: 290,
        expression: "",
      },
    ]);
  };

  const beginCalculatorDrag = (
    event: React.PointerEvent<HTMLElement>,
    index: number,
    calculator: CalculatorElement
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    calculatorDragRef.current = {
      index,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPoint: calculator.point,
      didRecordHistory: false,
    };
  };

  const moveCalculator = (event: React.PointerEvent<HTMLElement>) => {
    const drag = calculatorDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (!drag.didRecordHistory) {
      recordCanvasHistory();
      drag.didRecordHistory = true;
    }
    const dx = (event.clientX - drag.startClient.x) / zoomRef.current;
    const dy = (event.clientY - drag.startClient.y) / zoomRef.current;
    setElements((previous) =>
      previous.map((element, index) =>
        index === drag.index && element.kind === "calculator"
          ? {
              ...element,
              point: { x: drag.startPoint.x + dx, y: drag.startPoint.y + dy },
            }
          : element
      )
    );
  };

  const endCalculatorDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    calculatorDragRef.current = null;
  };

  const setCalculatorExpression = (index: number, expression: string) => {
    setElements((previous) =>
      previous.map((element, elementIndex) =>
        elementIndex === index && element.kind === "calculator"
          ? { ...element, expression: expression.slice(0, 80) }
          : element
      )
    );
  };

  const importImageFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      window.alert(t("Please choose an image file.", "Wybierz plik obrazu."));
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const center = getCanvasCoordinatesFromClient(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );

    const imported = await Promise.all(
      imageFiles.map(
        (file, index) =>
          new Promise<ImageElement | null>((resolve) => {
            if (file.size > 10 * 1024 * 1024) {
              resolve(null);
              return;
            }

            const reader = new FileReader();
            reader.onerror = () => resolve(null);
            reader.onload = () => {
              if (typeof reader.result !== "string") {
                resolve(null);
                return;
              }

              const image = new Image();
              image.onerror = () => resolve(null);
              image.onload = () => {
                const maxWidth = Math.max(240, rect.width / zoomRef.current * 0.55);
                const maxHeight = Math.max(180, rect.height / zoomRef.current * 0.55);
                const scale = Math.min(
                  1,
                  maxWidth / image.naturalWidth,
                  maxHeight / image.naturalHeight
                );
                const width = Math.max(1, image.naturalWidth * scale);
                const height = Math.max(1, image.naturalHeight * scale);
                const src = reader.result as string;
                importedImageCacheRef.current.set(src, image);
                resolve({
                  kind: "image",
                  point: {
                    x: center.x - width / 2 + index * 24,
                    y: center.y - height / 2 + index * 24,
                  },
                  width,
                  height,
                  src,
                  name: file.name,
                });
              };
              image.src = reader.result;
            };
            reader.readAsDataURL(file);
          })
      )
    );

    const validImages = imported.filter(
      (image): image is ImageElement => image !== null
    );
    if (!validImages.length) {
      window.alert(
        t(
          "The image could not be imported. Use PNG, JPG, WebP, GIF, or SVG under 10 MB.",
          "Nie udało się zaimportować obrazu. Użyj PNG, JPG, WebP, GIF lub SVG poniżej 10 MB."
        )
      );
      return;
    }

    const firstImportedIndex = elements.length;
    recordCanvasHistory();
    setElements((previous) => [...previous, ...validImages]);
    setSelectedImageIndex(firstImportedIndex);
    setTool("cursor");
  };

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
        ? Math.max(0.24, 0.6 / zoomRef.current)
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
          distance > 18 ? 0.9 : distance > 10 ? 0.82 : distance > 4 ? 0.72 : 0.58;
        const stabilizedPoint = {
          x: previousPoint.x + (point.x - previousPoint.x) * smoothing,
          y: previousPoint.y + (point.y - previousPoint.y) * smoothing,
        };
        const stabilizedDistance = Math.hypot(
          stabilizedPoint.x - previousPoint.x,
          stabilizedPoint.y - previousPoint.y
        );
        const interpolationSteps = Math.min(
          5,
          Math.max(1, Math.floor(stabilizedDistance / 2.8))
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

    const shouldCommit = activeText.value.length > 0 || Boolean(activeText.backgroundColor);
    localLiveTextCommittedRef.current = shouldCommit;

    if (shouldCommit) {
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

      recordCanvasHistory();
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
    if (selectedIndexes.size === 0) return;
    recordCanvasHistory();
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

  const findImageAtPoint = (point: Point) => {
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      const element = elements[index];
      if (element.kind !== "image") continue;
      const centerX = element.point.x + element.width / 2;
      const centerY = element.point.y + element.height / 2;
      const radians = -((element.rotation ?? 0) * Math.PI) / 180;
      const dx = point.x - centerX;
      const dy = point.y - centerY;
      const localX = dx * Math.cos(radians) - dy * Math.sin(radians);
      const localY = dx * Math.sin(radians) + dy * Math.cos(radians);
      if (
        Math.abs(localX) <= element.width / 2 &&
        Math.abs(localY) <= element.height / 2
      ) {
        return index;
      }
    }
    return -1;
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

        const imageIndex = findImageAtPoint(point);
        if (imageIndex !== -1) {
          setSelectedImageIndex(imageIndex);
          setSelectionBox(null);
          return;
        }
        setSelectedImageIndex(null);

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

    if (isDrawableShapeTool(tool)) {
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
      const nextStroke: Stroke = {
        kind: "stroke",
        id: tool === "pen" ? crypto.randomUUID() : undefined,
        points: [{ x, y }],
        tool,
        width: tool === "pen" ? penWidth : eraserWidth,
        color: tool === "pen" ? penColor : undefined,
        style: tool === "pen" ? strokeStyle : undefined,
      };
      currentStroke.current = nextStroke;
      renderedLiveStrokePointCountRef.current = 1;
      if (tool === "pen") beginLivePenStroke(nextStroke);
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

    if (isDrawableShapeTool(tool) && shapeStart && snapshot) {
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
          flushLivePenPoints();
          if (currentStroke.current.style === "solid") {
            drawLivePenStrokeSegment();
          } else {
            // Incremental fragments restart the browser's dash pattern for every
            // tiny segment. Redraw the complete active path so dashed and dotted
            // strokes are visible and correctly spaced while the pointer moves.
            scheduleRedrawCanvas();
          }
        } else {
          scheduleRedrawCanvas();
        }
      }
    }

  };

  const clearCanvas = async () => {
    if (elements.length === 0) return;
    const confirmed = await requestConfirmation({
      title: t("Clear this board?", "Wyczyścić tę tablicę?"),
      message: t(
        "Every object will be removed. Scriboo will preserve the previous board in version history before saving the empty board.",
        "Wszystkie obiekty zostaną usunięte. Scriboo zachowa poprzednią tablicę w historii wersji przed zapisaniem pustej tablicy."
      ),
      confirmLabel: t("Clear board", "Wyczyść tablicę"),
      tone: "danger",
    });
    if (!confirmed) return;

    recordCanvasHistory();
    pendingLocalBoardClearRef.current = true;
    latestBoardDocumentRef.current = {
      ...latestBoardDocumentRef.current,
      elements: [],
    };
    setElements([]);
    setActiveText(null);
    setSelectedImageIndex(null);
    sendLiveStrokeMessage("board-cleared", {
      version: 1,
      boardId: activeBoardId,
      senderId: boardRealtimeClientIdRef.current,
    });

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

    if (isDrawableShapeTool(tool) && shapeStart && shapeEnd.current) {
      const finalShapeEnd = shapeEnd.current;

      recordCanvasHistory();
      setElements((prev) => [
        ...prev,
        {
          kind: "shape",
          tool,
          start: shapeStart,
          end: finalShapeEnd,
          width: penWidth,
          color: tool === "ruler" ? classicRulerColor : penColor,
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

        recordCanvasHistory();
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
        id: currentStroke.current.id,
        points: [...currentStroke.current.points],
        tool: currentStroke.current.tool,
        width: currentStroke.current.width,
        color: currentStroke.current.color,
        style: currentStroke.current.style,
      };

      finishLivePenStroke(finishedStroke);
      recordCanvasHistory();
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
    isPanning || tool === "pen" ? "none" : tool === "cursor" ? isSelecting ? BLACK_CROSSHAIR_CURSOR : "default" : tool === "eraser" ? ERASER_CURSOR : tool === "text" || tool === "textbox" ? "text" : BLACK_CROSSHAIR_CURSOR;

  const beginImageTransform = (
    e: React.PointerEvent<HTMLDivElement>,
    mode: "move" | "resize" | "rotate"
  ) => {
    if (selectedImageIndex === null) return;
    const image = elements[selectedImageIndex];
    if (!image || image.kind !== "image") return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const centerX =
      (image.point.x + image.width / 2) * zoom + offset.x;
    const centerY =
      (image.point.y + image.height / 2) * zoom + offset.y + topBarHeight;
    imageTransformRef.current = {
      mode,
      pointerId: e.pointerId,
      index: selectedImageIndex,
      startClient: { x: e.clientX, y: e.clientY },
      startImage: { ...image, point: { ...image.point } },
      startDistance: Math.hypot(e.clientX - centerX, e.clientY - centerY),
      startAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX),
    };
  };

  const updateImageTransform = (e: React.PointerEvent<HTMLDivElement>) => {
    const gesture = imageTransformRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    e.preventDefault();
    if (!gesture.didRecordHistory) {
      recordCanvasHistory();
      gesture.didRecordHistory = true;
    }
    const image = gesture.startImage;
    const centerX = image.point.x + image.width / 2;
    const centerY = image.point.y + image.height / 2;
    let nextImage: ImageElement = image;

    if (gesture.mode === "move") {
      nextImage = {
        ...image,
        point: {
          x: image.point.x + (e.clientX - gesture.startClient.x) / zoomRef.current,
          y: image.point.y + (e.clientY - gesture.startClient.y) / zoomRef.current,
        },
      };
    } else {
      const screenCenterX = centerX * zoomRef.current + offsetRef.current.x;
      const screenCenterY =
        centerY * zoomRef.current + offsetRef.current.y + topBarHeight;
      if (gesture.mode === "resize") {
        const distance = Math.hypot(
          e.clientX - screenCenterX,
          e.clientY - screenCenterY
        );
        const scale = Math.max(
          0.08,
          distance / Math.max(1, gesture.startDistance ?? 1)
        );
        const width = Math.max(32 / zoomRef.current, image.width * scale);
        const height = Math.max(32 / zoomRef.current, image.height * scale);
        nextImage = {
          ...image,
          width,
          height,
          point: { x: centerX - width / 2, y: centerY - height / 2 },
        };
      } else {
        const angle = Math.atan2(
          e.clientY - screenCenterY,
          e.clientX - screenCenterX
        );
        nextImage = {
          ...image,
          rotation:
            (image.rotation ?? 0) +
            ((angle - (gesture.startAngle ?? 0)) * 180) / Math.PI,
        };
      }
    }

    setElements((previous) =>
      previous.map((element, index) =>
        index === gesture.index ? nextImage : element
      )
    );
  };

  const endImageTransform = (e: React.PointerEvent<HTMLDivElement>) => {
    if (imageTransformRef.current?.pointerId !== e.pointerId) return;
    imageTransformRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const selectShapeTool = (nextTool: ShapeTool) => {
    // A shape popover closes underneath the pointer. Clear any drawing/panning
    // cursor left behind by the previous tool before revealing the canvas.
    isPanningRef.current = false;
    setIsPanning(false);
    setPanningCursorPoint(null);
    hidePenCursor();
    document.body.style.cursor = "";
    document.documentElement.style.cursor = "";

    setTool(nextTool);
    setShowShapesMenu(false);
    setShowPenMenu(false);
    setShowTextMenu(false);
    setShowEraserMenu(false);
  };

  const isCursorActive = tool === "cursor";
  const isTextActive = tool === "text";
  const isPenActive = tool === "pen";
  const isDarkCanvas =
    isInterfaceDarkMode ||
    canvasBackground === darkCanvasColor ||
    canvasBackground === neonCanvasBackground;
  const isGreyCanvas = canvasBackground === greyCanvasColor;
  const toolbarBackground = isInterfaceDarkMode
    ? "linear-gradient(180deg, rgba(32,37,65,0.97) 0%, rgba(24,28,53,0.97) 100%)"
    : isDarkCanvas
    ? "rgba(30,30,30,0.94)"
    : isGreyCanvas
    ? "rgba(75,85,99,0.94)"
    : "rgba(255,255,255,0.92)";
  const popoverBackground = isInterfaceDarkMode
    ? "rgba(31,36,63,0.98)"
    : isDarkCanvas
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

  const guestFeatures = [
    {
      key: "video",
      title: t("Video calls", "Rozmowy wideo"),
      eyebrow: t("Meet without leaving the board", "Spotkajcie się bez opuszczania tablicy"),
      description: t(
        "Clear one-to-one conversations beside the work you are creating together.",
        "Wyraźne rozmowy jeden na jeden obok pracy, którą tworzycie razem."
      ),
      accent: "linear-gradient(145deg, #252ea8 0%, #4e6ff0 48%, #6bc8be 100%)",
    },
    {
      key: "calendar",
      title: t("Calendar", "Kalendarz"),
      eyebrow: t("Keep every session in view", "Miej każde spotkanie pod kontrolą"),
      description: t(
        "Plan lessons, sessions, and follow-ups in one calm, organized place.",
        "Planuj lekcje, spotkania i kolejne kroki w jednym uporządkowanym miejscu."
      ),
      accent: "linear-gradient(145deg, #5e35d9 0%, #547ee8 48%, #55c49a 100%)",
    },
    {
      key: "whiteboard",
      title: t("Whiteboard", "Tablica"),
      eyebrow: t("Think visually, together", "Myślcie wizualnie, razem"),
      description: t(
        "Draw, explain, import materials, and return to every shared idea later.",
        "Rysuj, tłumacz, dodawaj materiały i wracaj później do wspólnych pomysłów."
      ),
      accent: "linear-gradient(145deg, #7138e5 0%, #4d86eb 52%, #55caaa 100%)",
    },
  ] as const;

  const guestShowcasePageCount = 3;

  const scrollGuestFeatures = (nextIndex: number) => {
    const normalizedIndex =
      (nextIndex + guestShowcasePageCount) % guestShowcasePageCount;
    setGuestFeatureIndex(normalizedIndex);
    const track = guestFeatureTrackRef.current;
    const page = track?.querySelector<HTMLElement>("[data-scriboo-feature-page]");
    if (!track || !page) return;
    const gap = 18;
    track.scrollTo({
      left: normalizedIndex * (page.offsetWidth + gap),
      behavior: "smooth",
    });
  };

  return (
    <div
      className={isInterfaceDarkMode ? "scriboo-dark-interface" : undefined}
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
      {confirmationDialog && (
        <div
          data-board-browser-layer="true"
          role="presentation"
          onMouseDown={(event) => event.stopPropagation()}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 500,
            display: "grid",
            placeItems: "center",
            padding: "20px",
            background: "rgba(15,23,42,0.42)",
            backdropFilter: "blur(8px)",
            animation: "scriboo-fade-in 180ms ease-out",
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="scriboo-confirmation-title"
            aria-describedby="scriboo-confirmation-message"
            style={{
              width: "min(430px, calc(100vw - 40px))",
              padding: "24px",
              borderRadius: "22px",
              border: "1px solid rgba(203,213,225,0.88)",
              background: isInterfaceDarkMode ? "#20263d" : "rgba(255,255,255,0.98)",
              color: isInterfaceDarkMode ? "#f8fafc" : "#0f172a",
              boxShadow: "0 28px 90px rgba(15,23,42,0.3)",
              display: "grid",
              gap: "18px",
              animation: "scriboo-dialog-enter 220ms cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "13px" }}>
              <span
                aria-hidden="true"
                style={{
                  width: "42px",
                  height: "42px",
                  flex: "0 0 auto",
                  borderRadius: "13px",
                  display: "grid",
                  placeItems: "center",
                  background:
                    confirmationDialog.tone === "danger" ? "#fee2e2" : "#ede9fe",
                  color:
                    confirmationDialog.tone === "danger" ? "#b91c1c" : "#6d28d9",
                }}
              >
                <AlertTriangle size={20} />
              </span>
              <div style={{ minWidth: 0, display: "grid", gap: "8px" }}>
                <h2
                  id="scriboo-confirmation-title"
                  style={{ margin: 0, fontSize: "20px", lineHeight: 1.2 }}
                >
                  {confirmationDialog.title}
                </h2>
                <p
                  id="scriboo-confirmation-message"
                  style={{ margin: 0, color: isInterfaceDarkMode ? "#cbd5e1" : "#64748b", fontSize: "14px", lineHeight: 1.55 }}
                >
                  {confirmationDialog.message}
                </p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <button
                type="button"
                onClick={() => resolveConfirmation(false)}
                style={{ minHeight: "44px", borderRadius: "12px", border: "1px solid #cbd5e1", background: isInterfaceDarkMode ? "#303853" : "#f8fafc", color: isInterfaceDarkMode ? "#f8fafc" : "#334155", fontWeight: 750, cursor: "pointer" }}
              >
                {t("Cancel", "Anuluj")}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => resolveConfirmation(true)}
                style={{ minHeight: "44px", borderRadius: "12px", border: "none", background: confirmationDialog.tone === "danger" ? "#dc2626" : signatureIndigoGradient, color: "#ffffff", fontWeight: 800, cursor: "pointer", boxShadow: confirmationDialog.tone === "danger" ? "0 10px 24px rgba(220,38,38,0.2)" : "0 10px 24px rgba(109,40,217,0.22)" }}
              >
                {confirmationDialog.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}

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
          filter: isInterfaceDarkMode ? "brightness(0.91)" : "none",
          transition: "filter 180ms ease",
          cursor: canvasCursor,
          touchAction: "none",
          userSelect: "none",
        }}
      />

      {!showBoardsMenu &&
        elements.map((element, index) => {
          if (element.kind !== "converter") return null;
          const option =
            converterOptions.find((item) => item.value === element.converter) ??
            converterOptions[0];
          const result = convertBoardValue(element.converter, element.value);
          return (
            <section
              key={`converter-${index}`}
              aria-label={t("Unit converter", "Przelicznik jednostek")}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              style={{
                position: "fixed",
                left: `${element.point.x * zoom + offset.x}px`,
                top: `${element.point.y * zoom + offset.y + topBarHeight}px`,
                width: `${element.width}px`,
                minHeight: `${element.height}px`,
                boxSizing: "border-box",
                padding: "12px",
                borderRadius: "18px",
                border: "1px solid rgba(124,58,237,0.24)",
                background: "rgba(255,255,255,0.98)",
                color: "#0f172a",
                boxShadow: "0 12px 32px rgba(15,23,42,0.16)",
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                zIndex: 11,
                display: "grid",
                gap: "8px",
                fontFamily: appSansFontFamily,
              }}
            >
              <div
                onPointerDown={(event) => beginConverterDrag(event, index, element)}
                onPointerMove={moveConverter}
                onPointerUp={endConverterDrag}
                onPointerCancel={endConverterDrag}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  cursor: "grab",
                  touchAction: "none",
                }}
              >
                <strong style={{ fontSize: "14px" }}>
                  {t("Unit converter", "Przelicznik jednostek")}
                </strong>
                <button
                  type="button"
                  aria-label={t("Remove converter", "Usuń przelicznik")}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    recordCanvasHistory();
                    setElements((previous) =>
                      previous.filter((_, elementIndex) => elementIndex !== index)
                    );
                  }}
                  style={{
                    width: "22px",
                    height: "22px",
                    border: "none",
                    borderRadius: "7px",
                    background: "#f1f5f9",
                    color: "#64748b",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <X size={13} />
                </button>
              </div>
              <select
                value={element.converter}
                aria-label={t("Conversion type", "Typ przeliczenia")}
                onChange={(event) =>
                  updateConverterObject(index, {
                    converter: event.currentTarget.value as ConverterKind,
                  })
                }
                style={{
                  width: "100%",
                  height: "30px",
                  borderRadius: "8px",
                  border: "1px solid #ddd6fe",
                  background: "#fafafa",
                  color: "#334155",
                  padding: "0 8px",
                  fontSize: "11px",
                  outline: "none",
                }}
              >
                {converterOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px" }}>
                <input
                  type="number"
                  value={element.value}
                  aria-label={t("Value to convert", "Wartość do przeliczenia")}
                  onChange={(event) =>
                    updateConverterObject(index, {
                      value: Number(event.currentTarget.value),
                    })
                  }
                  style={{
                    minWidth: 0,
                    height: "30px",
                    boxSizing: "border-box",
                    borderRadius: "8px",
                    border: "1px solid #ddd6fe",
                    background: "#f5f3ff",
                    color: "#5b21b6",
                    padding: "0 9px",
                    fontWeight: 700,
                    outline: "none",
                  }}
                />
                <span style={{ alignSelf: "center", color: "#6d28d9", fontSize: "12px", fontWeight: 750 }}>
                  {option.inputUnit}
                </span>
              </div>
              <output
                style={{
                  minHeight: "30px",
                  borderRadius: "8px",
                  background: "#e0f2fe",
                  color: "#075985",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 10px",
                  fontSize: "13px",
                  fontWeight: 800,
                }}
              >
                {formatConvertedValue(result)} {option.outputUnit}
              </output>
            </section>
          );
        })}

      {!showBoardsMenu &&
        elements.map((element, index) => {
          if (element.kind !== "calculator") return null;
          const result = calculateExpression(element.expression);
          const keys = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "⌫", "0", ".", "="];
          return (
            <section
              key={`calculator-${index}`}
              aria-label={t("Calculator", "Kalkulator")}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              style={{
                position: "fixed",
                left: `${element.point.x * zoom + offset.x}px`,
                top: `${element.point.y * zoom + offset.y + topBarHeight}px`,
                width: `${element.width}px`,
                minHeight: `${element.height}px`,
                boxSizing: "border-box",
                padding: "12px",
                borderRadius: "18px",
                border: "1px solid rgba(75,143,255,0.24)",
                background: "rgba(255,255,255,0.98)",
                color: "#0f172a",
                boxShadow: "0 12px 32px rgba(15,23,42,0.16)",
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                zIndex: 11,
                display: "grid",
                gap: "9px",
                fontFamily: appSansFontFamily,
              }}
            >
              <div
                onPointerDown={(event) => beginCalculatorDrag(event, index, element)}
                onPointerMove={moveCalculator}
                onPointerUp={endCalculatorDrag}
                onPointerCancel={endCalculatorDrag}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "grab", touchAction: "none" }}
              >
                <strong style={{ fontSize: "14px" }}>{t("Calculator", "Kalkulator")}</strong>
                <button
                  type="button"
                  aria-label={t("Remove calculator", "Usuń kalkulator")}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    recordCanvasHistory();
                    setElements((previous) => previous.filter((_, elementIndex) => elementIndex !== index));
                  }}
                  style={{ width: "22px", height: "22px", border: "none", borderRadius: "7px", background: "#f1f5f9", color: "#64748b", display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}
                >
                  <X size={13} />
                </button>
              </div>
              <div style={{ minHeight: "58px", borderRadius: "11px", background: "#f8fafc", padding: "8px 10px", display: "grid", justifyItems: "end", alignContent: "center", gap: "4px", overflow: "hidden" }}>
                <span style={{ width: "100%", color: "#64748b", fontSize: "12px", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{element.expression || "0"}</span>
                <strong style={{ fontSize: "19px", letterSpacing: "-0.02em" }}>{result === null ? "—" : formatConvertedValue(result)}</strong>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                {keys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      recordCanvasHistory();
                      if (key === "C") setCalculatorExpression(index, "");
                      else if (key === "⌫") setCalculatorExpression(index, element.expression.slice(0, -1));
                      else if (key === "=") {
                        if (result !== null) setCalculatorExpression(index, String(result));
                      } else setCalculatorExpression(index, element.expression + key);
                    }}
                    style={{
                      height: "31px",
                      border: "none",
                      borderRadius: "8px",
                      background: ["÷", "×", "-", "+", "="].includes(key) ? "#ede9fe" : key === "C" ? "#fee2e2" : "#f1f5f9",
                      color: key === "C" ? "#b91c1c" : ["÷", "×", "-", "+", "="].includes(key) ? "#6d28d9" : "#334155",
                      fontSize: "13px",
                      fontWeight: 750,
                      cursor: "pointer",
                    }}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </section>
          );
        })}

      {showPersonalLayer && activeBoardId && currentAccountId && (
        <aside
          aria-label={t("Personal writing layer", "Prywatna warstwa tekstowa")}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          style={{
            position: "fixed",
            top: `${topBarHeight + 14}px`,
            right: "14px",
            bottom: "14px",
            width: "min(470px, calc(100vw - 28px))",
            boxSizing: "border-box",
            borderRadius: "22px",
            border: "1px solid rgba(148,163,184,0.3)",
            background: "#fffefb",
            color: "#172033",
            boxShadow: "0 24px 70px rgba(15,23,42,0.2)",
            zIndex: 35,
            display: "grid",
            gridTemplateRows: "auto auto minmax(0, 1fr) auto",
            overflow: "hidden",
            fontFamily: appSansFontFamily,
          }}
        >
          <header
            style={{
              padding: "16px 18px 13px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              gap: "11px",
              background: "rgba(255,255,255,0.92)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "11px",
                background: "linear-gradient(135deg, rgba(139,70,255,0.12), rgba(25,195,188,0.12))",
                color: "#6d4df4",
                display: "grid",
                placeItems: "center",
                flex: "0 0 auto",
              }}
            >
              <BookOpenText size={18} />
            </span>
            <div style={{ minWidth: 0, flex: 1, display: "grid", gap: "3px" }}>
              <strong style={{ fontSize: "15px" }}>{t("My Layer", "Moja warstwa")}</strong>
              <span style={{ color: "#64748b", fontSize: "11px" }}>
                {t("Private to you on this board", "Prywatna tylko dla Ciebie na tej tablicy")}
              </span>
            </div>
            <span style={{ color: personalNoteSaveState === "error" ? "#b91c1c" : "#64748b", fontSize: "10px", fontWeight: 700 }}>
              {personalNoteSaveState === "loading"
                ? t("Loading…", "Ładowanie…")
                : personalNoteSaveState === "saving"
                  ? t("Saving…", "Zapisywanie…")
                  : personalNoteSaveState === "error"
                    ? t("Not saved", "Nie zapisano")
                    : t("Private · Saved", "Prywatne · Zapisano")}
            </span>
            <button
              type="button"
              aria-label={t("Close personal layer", "Zamknij warstwę prywatną")}
              onClick={() => setShowPersonalLayer(false)}
              style={{ width: "30px", height: "30px", border: "none", borderRadius: "9px", background: "#f1f5f9", color: "#475569", display: "grid", placeItems: "center", padding: 0, cursor: "pointer" }}
            >
              <X size={15} />
            </button>
          </header>
          <input
            value={personalNoteTitle}
            maxLength={120}
            disabled={personalNoteSaveState === "loading"}
            aria-label={t("Private document title", "Tytuł prywatnego dokumentu")}
            onChange={(event) => setPersonalNoteTitle(event.currentTarget.value)}
            placeholder={t("Untitled private document", "Prywatny dokument bez tytułu")}
            style={{
              margin: "18px 28px 8px",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "#111827",
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: "25px",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          />
          <textarea
            ref={personalNoteRef}
            value={personalNoteContent}
            maxLength={100000}
            disabled={personalNoteSaveState === "loading"}
            aria-label={t("Private document", "Prywatny dokument")}
            onChange={(event) => setPersonalNoteContent(event.currentTarget.value)}
            placeholder={t(
              "Write privately here. Draft an answer, analyze the board, or prepare feedback…",
              "Pisz tutaj prywatnie. Przygotuj odpowiedź, przeanalizuj tablicę lub opracuj feedback…"
            )}
            style={{
              width: "auto",
              minHeight: 0,
              resize: "none",
              margin: "0 18px 14px",
              padding: "11px 18px 40px 42px",
              boxSizing: "border-box",
              border: "1px solid #eee9df",
              borderRadius: "14px",
              outline: "none",
              backgroundColor: "#fffefb",
              backgroundImage:
                "linear-gradient(90deg, transparent 0, transparent 27px, rgba(248,113,113,0.2) 28px, transparent 29px), repeating-linear-gradient(180deg, transparent 0, transparent 27px, rgba(148,163,184,0.18) 28px, transparent 29px)",
              backgroundPosition: "0 10px",
              color: "#263246",
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: "16px",
              lineHeight: "29px",
              caretColor: "#6d28d9",
            }}
          />
          <footer
            style={{
              padding: "12px 18px",
              borderTop: "1px solid #e5e7eb",
              background: "rgba(255,255,255,0.94)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <span style={{ color: "#64748b", fontSize: "11px", lineHeight: 1.35 }}>
              {t("Select text, then publish only that part.", "Zaznacz tekst i opublikuj tylko wybrany fragment.")}
            </span>
            <button
              type="button"
              onClick={publishPersonalNoteSelection}
              style={{
                minWidth: "148px",
                height: "38px",
                padding: "0 14px",
                border: "none",
                borderRadius: "11px",
                background: signatureIndigoGradient,
                color: "#ffffff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
                fontSize: "12px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 8px 20px rgba(91,33,182,0.18)",
              }}
            >
              <Send size={14} />
              {t("Publish to Shared", "Opublikuj we wspólnej")}
            </button>
          </footer>
        </aside>
      )}

      {selectedImageIndex !== null && (() => {
        const selectedImage = elements[selectedImageIndex];
        if (!selectedImage || selectedImage.kind !== "image") return null;
        const handleStyle = {
          position: "absolute" as const,
          width: "12px",
          height: "12px",
          borderRadius: "999px",
          border: "2px solid #ffffff",
          background: "#7c3aed",
          boxShadow: "0 1px 5px rgba(15,23,42,0.35)",
          touchAction: "none" as const,
        };
        const transformEvents = {
          onPointerMove: updateImageTransform,
          onPointerUp: endImageTransform,
          onPointerCancel: endImageTransform,
        };

        return (
          <div
            aria-label={t("Selected image", "Wybrany obraz")}
            onPointerDown={(event) => beginImageTransform(event, "move")}
            {...transformEvents}
            style={{
              position: "fixed",
              left: `${selectedImage.point.x * zoom + offset.x}px`,
              top: `${selectedImage.point.y * zoom + offset.y + topBarHeight}px`,
              width: `${selectedImage.width * zoom}px`,
              height: `${selectedImage.height * zoom}px`,
              border: "2px solid #7c3aed",
              boxSizing: "border-box",
              transform: `rotate(${selectedImage.rotation ?? 0}deg)`,
              transformOrigin: "center",
              cursor: "move",
              touchAction: "none",
              zIndex: 12,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                top: "-28px",
                width: "2px",
                height: "26px",
                background: "#7c3aed",
                transform: "translateX(-50%)",
                pointerEvents: "none",
              }}
            />
            <div
              aria-label={t("Rotate image", "Obróć obraz")}
              onPointerDown={(event) => beginImageTransform(event, "rotate")}
              {...transformEvents}
              style={{
                ...handleStyle,
                left: "50%",
                top: "-35px",
                width: "15px",
                height: "15px",
                transform: "translate(-50%, -50%)",
                cursor: "grab",
              }}
            />
            {[
              { left: "0%", top: "0%", cursor: "nwse-resize" },
              { left: "100%", top: "0%", cursor: "nesw-resize" },
              { left: "0%", top: "100%", cursor: "nesw-resize" },
              { left: "100%", top: "100%", cursor: "nwse-resize" },
            ].map((handle, index) => (
              <div
                key={index}
                aria-label={t("Resize image", "Zmień rozmiar obrazu")}
                onPointerDown={(event) => beginImageTransform(event, "resize")}
                {...transformEvents}
                style={{
                  ...handleStyle,
                  left: handle.left,
                  top: handle.top,
                  transform: "translate(-50%, -50%)",
                  cursor: handle.cursor,
                }}
              />
            ))}
          </div>
        );
      })()}

      {penCursorPoint && tool === "pen" && !isPanning && (
        <div
          ref={penCursorElementRef}
          aria-hidden="true"
          className="board-pen-cursor"
          style={{
            position: "fixed",
            left: `${penCursorPoint.x}px`,
            top: `${penCursorPoint.y}px`,
            width: "24px",
            height: "24px",
            transform: `translate(-2px, -22px) ${
              isDrawing ? "scale(0.96)" : "scale(1)"
            }`,
            pointerEvents: "none",
            zIndex: 200,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            shapeRendering="geometricPrecision"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient
                id="pen-cursor-gradient"
                x1="2"
                y1="22"
                x2="22"
                y2="2"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#9b4df1" />
                <stop offset="1" stopColor="#58b9df" />
              </linearGradient>
            </defs>
            <path
              d="M21.174 6.812A2.815 2.815 0 0 0 17.188 2.826L3.842 16.174A2 2 0 0 0 3.342 17.004L2.021 21.356A.5.5 0 0 0 2.644 21.978L6.997 20.658A2 2 0 0 0 7.827 20.161L21.174 6.812Z"
              stroke="url(#pen-cursor-gradient)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M15 5L19 9"
              stroke="url(#pen-cursor-gradient)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
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
                  aria-label={t("Choose writing style", "Wybierz styl pisania")}
                  title={t("Choose writing style", "Wybierz styl pisania")}
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
                        aria-label={t("Text size", "Rozmiar tekstu")}
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
                        aria-label={t("Increase text size", "Zwiększ rozmiar tekstu")}
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
                        aria-label={t("Decrease text size", "Zmniejsz rozmiar tekstu")}
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
                  aria-label={t("Choose text formatting", "Wybierz formatowanie tekstu")}
                  title={t("Choose text formatting", "Wybierz formatowanie tekstu")}
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
                    aria-label={t("Square opacity", "Krycie kwadratu")}
                    title={t("Square opacity", "Krycie kwadratu")}
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
                        <span>{t("Opacity", "Krycie")}</span>
                        <span>{activeTextBoxOpacity}%</span>
                      </div>
                      <input
                          aria-label={t("Square opacity", "Krycie kwadratu")}
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
                  aria-label={t("Choose text color", "Wybierz kolor tekstu")}
                  title={t("Choose text color", "Wybierz kolor tekstu")}
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
                            {t("Opacity", "Krycie")}
                    </div>
                    <input
                          aria-label={t("Text opacity", "Krycie tekstu")}
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
                  aria-label={t("Choose text alignment", "Wybierz wyrównanie tekstu")}
                  title={t("Choose text alignment", "Wybierz wyrównanie tekstu")}
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
                  aria-label={t("Choose list style", "Wybierz styl listy")}
                  title={t("Choose list style", "Wybierz styl listy")}
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
                  {t("Copy", "Kopiuj")}
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
                  {t("Delete", "Usuń")}
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
                  {t("Text size", "Rozmiar tekstu")}
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

      {welcomeCelebration && typeof document !== "undefined" && createPortal(
        <section
          className="scriboo-welcome-celebration"
          role="status"
          aria-live="polite"
          aria-label={t(
            welcomeCelebration.kind === "logout"
              ? `See you soon, ${welcomeCelebration.name}!`
              : `Welcome, ${welcomeCelebration.name}!`,
            welcomeCelebration.kind === "logout"
              ? `Do zobaczenia, ${welcomeCelebration.name}!`
              : `Witaj, ${welcomeCelebration.name}!`
          )}
          onClick={() => setWelcomeCelebration(null)}
        >
          <div className="scriboo-welcome-celebration__glow" aria-hidden="true" />
          <div className="scriboo-welcome-celebration__burst" aria-hidden="true">
            <span className="scriboo-welcome-celebration__popper">
              {welcomeCelebration.kind === "logout" ? "👋" : "🎉"}
            </span>
            {Array.from({ length: 18 }, (_, index) => {
              const palette = ["#7447e8", "#5792e3", "#59bda5", "#f59e7a", "#f3c969"];
              const angle = (index / 18) * Math.PI * 2;
              const distance = 72 + (index % 5) * 18;
              return (
                <i
                  key={index}
                  className="scriboo-welcome-celebration__confetti"
                  style={
                    {
                      "--confetti-x": `${Math.cos(angle) * distance}px`,
                      "--confetti-y": `${Math.sin(angle) * distance}px`,
                      "--confetti-color": palette[index % palette.length],
                      "--confetti-delay": `${(index % 6) * 35}ms`,
                      "--confetti-rotation": `${index * 47}deg`,
                    } as React.CSSProperties
                  }
                />
              );
            })}
          </div>
          <div className="scriboo-welcome-celebration__copy">
            <span>
              {welcomeCelebration.kind === "logout"
                ? t("See you soon", "Do zobaczenia")
                : welcomeCelebration.kind === "created"
                  ? t("Your Scriboo workspace is ready", "Twoja przestrzeń Scriboo jest gotowa")
                  : t("Welcome back", "Witaj ponownie")}
            </span>
            <strong>{welcomeCelebration.name}!</strong>
          </div>
        </section>,
        document.body
      )}

      {showLoginModal && showForgotPassword && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAuthModal();
          }}
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            padding: "20px",
            background:
              "radial-gradient(circle at 18% 12%, rgba(124,58,237,0.12), transparent 34%), rgba(241,245,249,0.74)",
            backdropFilter: "blur(16px)",
            zIndex: 151,
          }}
        >
          <form
            aria-labelledby="forgot-password-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void requestPasswordReset();
            }}
            style={{
              position: "relative",
              width: "min(620px, calc(100vw - 32px))",
              boxSizing: "border-box",
              padding: "clamp(28px, 6vw, 52px)",
              borderRadius: "28px",
              border: "1px solid rgba(203,213,225,0.88)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(250,252,255,0.98))",
              boxShadow:
                "0 32px 90px rgba(30,41,59,0.18), inset 0 1px 0 rgba(255,255,255,0.95)",
              color: "#111827",
              fontFamily: appSansFontFamily,
            }}
          >
            <button
              type="button"
              aria-label={t("Close password reset", "Zamknij resetowanie hasła")}
              onClick={closeAuthModal}
              style={{
                position: "absolute",
                top: "18px",
                right: "18px",
                width: "38px",
                height: "38px",
                borderRadius: "12px",
                border: "1px solid rgba(203,213,225,0.8)",
                background: "rgba(248,250,252,0.92)",
                color: "#475569",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>

            <div
              aria-hidden="true"
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "20px",
                display: "grid",
                placeItems: "center",
                marginBottom: "34px",
                background:
                  "linear-gradient(145deg, rgba(124,58,237,0.1), rgba(96,165,250,0.13))",
                color: "#6846f5",
              }}
            >
              <Mail size={30} strokeWidth={2.2} />
            </div>

            <h1
              id="forgot-password-title"
              style={{
                margin: 0,
                color: "#10111c",
                fontSize: "clamp(30px, 5vw, 42px)",
                lineHeight: 1.08,
                letterSpacing: "-0.045em",
                fontWeight: 850,
              }}
            >
              {t("Forgot password?", "Nie pamiętasz hasła?")}
            </h1>
            <p
              style={{
                margin: "18px 0 34px",
                color: "#71809f",
                fontSize: "clamp(15px, 2.5vw, 18px)",
                lineHeight: 1.55,
                fontWeight: 520,
              }}
            >
              {t(
                "Enter your email and we’ll send you a secure password-reset link.",
                "Wpisz swój adres e-mail, a wyślemy Ci bezpieczny link do zresetowania hasła."
              )}
            </p>

            <label style={{ display: "grid", gap: "10px" }}>
              <span style={{ color: "#111827", fontSize: "14px", fontWeight: 800 }}>
                {t("Email address", "Adres e-mail")}
              </span>
              <div style={{ position: "relative" }}>
                <Mail
                  size={19}
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "18px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#a7b1c9",
                    pointerEvents: "none",
                  }}
                />
                <input
                  required
                  autoFocus
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.currentTarget.value)}
                  placeholder={t("you@example.com", "twoj@email.pl")}
                  style={{
                    width: "100%",
                    height: "58px",
                    boxSizing: "border-box",
                    padding: "0 18px 0 50px",
                    borderRadius: "18px",
                    border: "1.5px solid rgba(203,213,225,0.9)",
                    background: "rgba(255,255,255,0.95)",
                    color: "#111827",
                    outlineColor: "#7c3aed",
                    fontSize: "16px",
                    fontWeight: 600,
                    boxShadow: "inset 0 1px 2px rgba(15,23,42,0.025)",
                  }}
                />
              </div>
            </label>

            <div style={{ marginTop: "16px" }}>
              <TurnstileWidget
                onTokenChange={handleTurnstileToken}
                resetSignal={turnstileResetSignal}
              />
            </div>

            {authMessage && (
              <div
                role={isPositiveAuthMessage ? "status" : "alert"}
                style={{
                  marginTop: "16px",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  background: isPositiveAuthMessage
                    ? "rgba(34,197,94,0.1)"
                    : "rgba(239,68,68,0.09)",
                  color: isPositiveAuthMessage ? "#15803d" : "#b91c1c",
                  fontSize: "13px",
                  fontWeight: 750,
                  lineHeight: 1.45,
                }}
              >
                {authMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthSubmitting}
              style={{
                width: "100%",
                height: "58px",
                marginTop: "20px",
                border: "1px solid rgba(255,255,255,0.5)",
                borderRadius: "18px",
                background: signatureIndigoGradient,
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                fontSize: "16px",
                fontWeight: 850,
                cursor: isAuthSubmitting ? "default" : "pointer",
                opacity: isAuthSubmitting ? 0.7 : 1,
                boxShadow: "0 14px 28px rgba(99,102,241,0.2)",
                transition: "transform 0.2s ease, filter 0.2s ease",
              }}
            >
              {isAuthSubmitting
                ? t("Sending…", "Wysyłanie…")
                : t("Send reset link", "Wyślij link resetujący")}
              {!isAuthSubmitting && <ArrowRight size={19} />}
            </button>

            <div
              style={{
                marginTop: "30px",
                textAlign: "center",
                color: "#8a96ae",
                fontSize: "14px",
                fontWeight: 650,
              }}
            >
              {t("Remember your password?", "Pamiętasz swoje hasło?")} {" "}
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(false);
                  setAuthMessage("");
                }}
                style={{
                  border: 0,
                  padding: 0,
                  background: "transparent",
                  color: "#6846f5",
                  font: "inherit",
                  fontWeight: 850,
                  cursor: "pointer",
                }}
              >
                {t("Sign in", "Zaloguj się")}
              </button>
            </div>
          </form>
        </div>
      )}

      {showLoginModal && !showForgotPassword && (
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
              padding: "24px",
              borderRadius: "24px",
              border: "1px solid rgba(255,255,255,0.56)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.985) 0%, rgba(248,251,255,0.965) 100%)",
              boxShadow:
                "0 30px 90px rgba(17,24,39,0.24), 0 10px 28px rgba(59,130,246,0.08), inset 0 1px 0 rgba(255,255,255,0.94)",
              color: "#111827",
              backdropFilter: "blur(20px)",
              fontFamily: appSansFontFamily,
              textRendering: "optimizeLegibility",
              WebkitFontSmoothing: "antialiased",
              MozOsxFontSmoothing: "grayscale",
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
                    fontSize: "25px",
                    fontWeight: 800,
                    letterSpacing: "-0.045em",
                    lineHeight: 1.02,
                    color: "#0f172a",
                    textRendering: "optimizeLegibility",
                    WebkitFontSmoothing: "antialiased",
                    MozOsxFontSmoothing: "grayscale",
                  }}
                >
                  {authMode === "register" ? "Utworz konto" : "Zaloguj sie"}
                </div>
                <div
                  style={{
                    marginTop: "6px",
                    color: "#64748b",
                    fontSize: "14px",
                    fontWeight: 500,
                    letterSpacing: "-0.015em",
                  }}
                >
                  {t("Return to your board.", "Wróć do swojej tablicy.")}
                </div>
              </div>
              <button
                type="button"
                aria-label={t("Close login", "Zamknij logowanie")}
                onClick={closeAuthModal}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "12px",
                  border: "1px solid rgba(203,213,225,0.78)",
                  background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(244,247,251,0.92))",
                  color: "#0f172a",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  boxShadow: "0 10px 24px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.84)",
                  transition: "transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                display: enabledSocialProviders.length ? "grid" : "none",
                gridTemplateColumns: `repeat(${enabledSocialProviders.length}, minmax(0, 1fr))`,
                gap: "10px",
                marginBottom: "14px",
              }}
            >
              {enabledSocialProviders.map((provider) => (
                <button
                  key={provider.value}
                  type="button"
                  disabled={isAuthSubmitting}
                  onClick={() => void handleSocialAuth(provider.value)}
                  style={{
                    height: "44px",
                    borderRadius: "14px",
                    border: "1px solid rgba(203,213,225,0.9)",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))",
                    color: "#111827",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: isAuthSubmitting ? "default" : "pointer",
                    boxShadow: "0 10px 22px rgba(15,23,42,0.055), inset 0 1px 0 rgba(255,255,255,0.9)",
                    letterSpacing: "-0.01em",
                    opacity: isAuthSubmitting ? 0.72 : 1,
                  }}
                >
                  {provider.label}
                </button>
              ))}
            </div>

            <div
              style={{
                display: enabledSocialProviders.length ? "flex" : "none",
                alignItems: "center",
                gap: "10px",
                margin: "14px 0 16px",
                color: "#9aa8ba",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              <div style={{ height: "1px", flex: 1, background: "linear-gradient(90deg, rgba(226,232,240,0), rgba(226,232,240,1))" }} />
                    {t("or", "lub")}
              <div style={{ height: "1px", flex: 1, background: "linear-gradient(90deg, rgba(226,232,240,1), rgba(226,232,240,0))" }} />
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
                    {t("Name", "Imię")}
                </span>
                <input
                  type="text"
                  autoComplete="name"
                      placeholder={t("Your name", "Twoje imię")}
                  value={authName}
                  onChange={(e) => setAuthName(e.currentTarget.value)}
                  style={{
                    width: "100%",
                    height: "46px",
                    padding: "0 14px",
                    borderRadius: "14px",
                    border: "1px solid rgba(203,213,225,0.92)",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,252,255,0.98))",
                    color: "#111827",
                    fontSize: "15px",
                    fontWeight: 600,
                    boxSizing: "border-box",
                    outlineColor: "#7c3aed",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), 0 4px 12px rgba(15,23,42,0.035)",
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
                    {t("Email", "E-mail")}
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
                      placeholder={t("you@example.com", "twoj@email.pl")}
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.currentTarget.value)}
                  style={{
                    width: "100%",
                    height: "46px",
                    padding: "0 14px 0 40px",
                    borderRadius: "14px",
                    border: "1px solid rgba(203,213,225,0.92)",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,252,255,0.98))",
                    color: "#111827",
                    fontSize: "15px",
                    fontWeight: 600,
                    boxSizing: "border-box",
                    outlineColor: "#7c3aed",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), 0 4px 12px rgba(15,23,42,0.035)",
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
                    {t("Password", "Hasło")}
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
                      placeholder={t("Enter password", "Wpisz hasło")}
                  style={{
                    width: "100%",
                    height: "46px",
                    padding: "0 14px 0 40px",
                    borderRadius: "14px",
                    border: "1px solid rgba(203,213,225,0.92)",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,252,255,0.98))",
                    color: "#111827",
                    fontSize: "15px",
                    fontWeight: 600,
                    boxSizing: "border-box",
                    outlineColor: "#7c3aed",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), 0 4px 12px rgba(15,23,42,0.035)",
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
                    {t("Confirm password", "Powtórz hasło")}
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
                      placeholder={t("Enter password again", "Wpisz hasło ponownie")}
                    value={authConfirmPassword}
                    onChange={(e) =>
                      setAuthConfirmPassword(e.currentTarget.value)
                    }
                    style={{
                      width: "100%",
                      height: "46px",
                      padding: "0 14px 0 40px",
                      borderRadius: "14px",
                      border: "1px solid rgba(203,213,225,0.92)",
                      background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,252,255,0.98))",
                      color: "#111827",
                      fontSize: "15px",
                      fontWeight: 600,
                      boxSizing: "border-box",
                      outlineColor: "#7c3aed",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), 0 4px 12px rgba(15,23,42,0.035)",
                    }}
                  />
                </div>
              </label>
            )}

            {authMode === "register" && (
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "9px",
                  marginBottom: "14px",
                  color: "#475569",
                  fontSize: "12px",
                  lineHeight: 1.5,
                  fontWeight: 650,
                }}
              >
                <input
                  type="checkbox"
                  checked={hasAcceptedLegal}
                  onChange={(event) =>
                    setHasAcceptedLegal(event.currentTarget.checked)
                  }
                  required
                  style={{ accentColor: "#7c3aed", marginTop: 2 }}
                />
                <span>
                  {t("I accept the", "Akceptuję")} <Link href="/terms">{t("Terms of Service", "Regulamin")}</Link>{" "}
                  {t("and confirm that I have read the", "i potwierdzam zapoznanie się z")} <Link href="/privacy">{t("Privacy Policy", "Polityką prywatności")}</Link>.
                </span>
              </label>
            )}

            <TurnstileWidget
              onTokenChange={handleTurnstileToken}
              resetSignal={turnstileResetSignal}
            />

            <div
              style={{
                display: authMode === "login" ? "flex" : "none",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "18px",
                color: "#64748b",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input type="checkbox" style={{ accentColor: "#7c3aed" }} />
                      {t("Remember me", "Zapamiętaj mnie")}
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(true);
                  setAuthMessage("");
                  setCanResendConfirmation(false);
                }}
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
                    {t("Forgot password?", "Nie pamiętasz hasła?")}
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
                    {t("Resend confirmation email", "Wyślij ponownie e-mail potwierdzający")}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthSubmitting}
              onMouseEnter={() => {
                if (!isAuthSubmitting) setIsAuthSubmitHovered(true);
              }}
              onMouseLeave={() => setIsAuthSubmitHovered(false)}
              style={{
                width: "100%",
                height: "48px",
                borderRadius: "16px",
                border: isAuthSubmitHovered
                  ? "1px solid rgba(255,255,255,0.74)"
                  : "1px solid rgba(255,255,255,0.58)",
                background: signatureIndigoGradient,
                backgroundSize: "145% 145%",
                backgroundPosition: isAuthSubmitHovered
                  ? "100% 50%"
                  : "0% 50%",
                color: "#ffffff",
                fontSize: 0,
                fontWeight: 800,
                cursor: isAuthSubmitting ? "default" : "pointer",
                opacity: isAuthSubmitting ? 0.72 : 1,
                boxShadow:
                  isAuthSubmitHovered && !isAuthSubmitting
                    ? "0 14px 28px rgba(15,23,42,0.18), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.22)"
                    : "0 8px 20px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.18)",
                transition:
                  "border-color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease, filter 0.22s ease, background-position 0.42s ease",
                transform:
                  isAuthSubmitHovered && !isAuthSubmitting
                    ? "translateY(-1.5px) scale(1.018)"
                    : "translateY(-0.5px)",
                filter:
                  isAuthSubmitHovered && !isAuthSubmitting
                    ? "saturate(1.08) brightness(1.05)"
                    : "none",
              }}
            >
              <span style={{ fontSize: "16px", letterSpacing: "-0.02em" }}>
                {isAuthSubmitting
                  ? "Please wait..."
                  : authMode === "register"
                  ? "Create account"
                  : "Log in"}
              </span>
            </button>

            <div
              style={{
                display: "block",
                marginTop: "18px",
                textAlign: "center",
                color: "#64748b",
                fontSize: "13px",
                fontWeight: 700,
                lineHeight: 1.45,
              }}
            >
              <span>
                {authMode === "register" ? "Masz juz konto?" : "Nie masz konta?"}
              </span>{" "}
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
                  fontSize: "13px",
                  fontWeight: 900,
                  cursor: "pointer",
                  padding: 0,
                  letterSpacing: "-0.01em",
                }}
              >
                {authMode === "register" ? "Zaloguj sie" : "Zarejestruj sie"}
              </button>
            </div>
          </form>
        </div>
      )}

      {!currentAccountId && showGuestWelcome && !showLoginModal && (
        <aside
          className="scriboo-guest-welcome"
          aria-label={t("Welcome to Scriboo", "Witamy w Scriboo")}
          onPointerEnter={hidePenCursor}
          onPointerMove={hidePenCursor}
          style={{
            position: "fixed",
            right: "22px",
            bottom: "22px",
            width: "min(350px, calc(100vw - 32px))",
            padding: "20px",
            borderRadius: "24px",
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.98) 0%, rgba(248,250,255,0.97) 62%, rgba(239,253,248,0.96) 100%)",
            border: "1px solid rgba(203,213,225,0.78)",
            boxShadow:
              "0 26px 70px rgba(40,52,105,0.18), 0 1px 0 rgba(255,255,255,0.9) inset",
            color: "#0f172a",
            zIndex: 48,
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              width: "180px",
              height: "180px",
              right: "-82px",
              top: "-96px",
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(59,130,246,0.18), rgba(52,211,153,0.18))",
              filter: "blur(4px)",
              pointerEvents: "none",
            }}
          />

          <button
            type="button"
            aria-label={t("Close welcome message", "Zamknij wiadomość powitalną")}
            onClick={() => setShowGuestWelcome(false)}
            style={{
              position: "absolute",
              top: "14px",
              right: "14px",
              width: "30px",
              height: "30px",
              borderRadius: "10px",
              border: "1px solid rgba(203,213,225,0.72)",
              background: "rgba(255,255,255,0.72)",
              color: "#475569",
              display: "grid",
              placeItems: "center",
              padding: 0,
              cursor: "pointer",
              zIndex: 1,
            }}
          >
            <X size={15} />
          </button>

          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              paddingRight: "38px",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                flex: "0 0 auto",
                borderRadius: "14px",
                overflow: "hidden",
                background: "#f5f3ff",
                boxShadow: "0 9px 24px rgba(76,73,177,0.16)",
              }}
            >
              <NextImage
                src="/icon.png"
                alt=""
                width={1024}
                height={1024}
                priority
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <div>
              <div
                style={{
                  color: "#64748b",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {t("Welcome to", "Witamy w")}
              </div>
              <div
                style={{
                  position: "relative",
                  width: "142px",
                  height: "31px",
                  marginTop: "1px",
                  overflow: "hidden",
                }}
              >
                <NextImage
                  src="/scriboo-wordmark-transparent.png"
                  alt="Scriboo"
                  width={1992}
                  height={1024}
                  priority
                  draggable={false}
                  style={{
                    position: "absolute",
                    width: "144px",
                    height: "auto",
                    left: "-1px",
                    top: "-11px",
                    display: "block",
                    userSelect: "none",
                  }}
                />
              </div>
            </div>
          </div>

          <div
            style={{
              position: "relative",
              marginTop: "17px",
              fontSize: "15px",
              lineHeight: 1.48,
              fontWeight: 400,
              color: "#334155",
            }}
          >
            {t(
              "Bring your ideas together, shape them on a shared canvas, and build alongside people who inspire you.",
              "Połącz swoje pomysły, rozwijaj je na wspólnej tablicy i twórz razem z ludźmi, którzy Cię inspirują."
            )}
          </div>

          <div
            style={{
              position: "relative",
              marginTop: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#5b6478",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            <Star size={14} color="#7c3aed" />
            {t(
              "A welcoming workspace for ideas made together.",
              "Przyjazna przestrzeń dla pomysłów tworzonych razem."
            )}
          </div>

          <div
            style={{
              position: "relative",
              marginTop: "18px",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "10px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setShowGuestWelcome(false);
                openAuthModal("register");
              }}
              style={{
                minHeight: "42px",
                padding: "0 17px",
                borderRadius: "13px",
                border: "none",
                background:
                  "linear-gradient(100deg, #783de8 0%, #557ce9 54%, #54bba0 100%)",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 11px 25px rgba(84,91,210,0.2)",
              }}
            >
              {t("Join the community", "Dołącz do społeczności")}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowGuestWelcome(false);
                setShowGuestFeatureShowcase(true);
              }}
              style={{
                minHeight: "42px",
                padding: "0 13px",
                borderRadius: "13px",
                border: "1px solid rgba(203,213,225,0.82)",
                background: "rgba(255,255,255,0.76)",
                color: "#475569",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {t("Explore", "Odkrywaj")}
            </button>
          </div>
        </aside>
      )}

      {!currentAccountId && !showLoginModal && !showGuestFeatureShowcase && (
        <button
          type="button"
          className="scriboo-discover-rail"
          aria-label={t("Discover Scriboo features", "Poznaj funkcje Scriboo")}
          onClick={() => {
            setShowGuestWelcome(false);
            setShowGuestFeatureShowcase(true);
          }}
          onPointerEnter={hidePenCursor}
          onPointerMove={hidePenCursor}
        >
          <span>{t("Discover", "Odkrywaj")}</span>
          <ChevronLeft size={17} strokeWidth={2.4} />
        </button>
      )}

      {!currentAccountId && showGuestFeatureShowcase && !showLoginModal && (
        <section
          className="scriboo-feature-showcase"
          aria-label={t("Discover Scriboo", "Poznaj Scriboo")}
          onPointerEnter={hidePenCursor}
          onPointerMove={hidePenCursor}
        >
          <div className="scriboo-feature-showcase__glow" aria-hidden="true" />
          <header className="scriboo-feature-showcase__header">
            <div>
              <div className="scriboo-feature-showcase__eyebrow">
                {t("Everything works together", "Wszystko działa razem")}
              </div>
              <h2>{t("One workspace. Every session.", "Jedna przestrzeń. Każde spotkanie.")}</h2>
              <p>
                {t(
                  "Move between conversation, planning, and creation without breaking your flow.",
                  "Przechodź między rozmową, planowaniem i tworzeniem bez przerywania pracy."
                )}
              </p>
            </div>
            <button
              type="button"
              className="scriboo-feature-showcase__close"
              aria-label={t("Close feature showcase", "Zamknij prezentację funkcji")}
              onClick={() => setShowGuestFeatureShowcase(false)}
            >
              <X size={19} />
            </button>
          </header>

          <div
            ref={guestFeatureTrackRef}
            className="scriboo-feature-showcase__track"
            onScroll={(event) => {
              const track = event.currentTarget;
              const page = track.querySelector<HTMLElement>("[data-scriboo-feature-page]");
              if (!page) return;
              const nextIndex = Math.round(track.scrollLeft / (page.offsetWidth + 18));
              setGuestFeatureIndex(Math.max(0, Math.min(guestShowcasePageCount - 1, nextIndex)));
            }}
          >
            <div data-scriboo-feature-page className="scriboo-feature-page">
              <div className="scriboo-feature-page__cards">
              {guestFeatures.map((feature) => (
              <article
                key={feature.key}
                data-scriboo-feature-card
                className="scriboo-feature-card"
                style={{
                  backgroundImage: feature.accent,
                  backgroundSize: "185% 185%",
                  backgroundPosition: "0% 50%",
                }}
              >
                <span
                  className="scriboo-feature-card__gradient-wave"
                  aria-hidden="true"
                  style={{ backgroundImage: feature.accent }}
                />

                <div className="scriboo-feature-card__topline">
                  <span className="scriboo-feature-card__icon">
                    {feature.key === "video" ? (
                      <Video size={18} fill="currentColor" />
                    ) : feature.key === "calendar" ? (
                      <CalendarDays size={18} />
                    ) : (
                      <Pen size={18} />
                    )}
                  </span>
                  <span>{feature.title}</span>
                </div>

                <div className={`scriboo-feature-visual scriboo-feature-visual--${feature.key}`}>
                  {feature.key === "video" && (
                    <>
                      <div className="scriboo-video-person scriboo-video-person--primary">
                        <UserRound size={48} />
                        <span>{t("You", "Ty")}</span>
                      </div>
                      <div className="scriboo-video-person scriboo-video-person--secondary">
                        <UserRound size={33} />
                        <span>{t("Guest", "Gość")}</span>
                      </div>
                      <div className="scriboo-video-controls">
                        <span><Video size={15} /></span>
                        <span><UserRound size={15} /></span>
                        <span><Share2 size={15} /></span>
                      </div>
                    </>
                  )}
                  {feature.key === "calendar" && (
                    <>
                      <div className="scriboo-calendar-heading">
                        <div>
                          <small>{t("Your week", "Twój tydzień")}</small>
                          <strong>{t("Sessions", "Spotkania")}</strong>
                        </div>
                        <CalendarDays size={23} />
                      </div>
                      <div className="scriboo-calendar-grid">
                        {["09", "10", "11", "12", "13", "14", "15"].map((day, dayIndex) => (
                          <span key={day} className={dayIndex === 3 ? "is-active" : ""}>
                            <small>{["M", "T", "W", "T", "F", "S", "S"][dayIndex]}</small>
                            {day}
                          </span>
                        ))}
                      </div>
                      <div className="scriboo-calendar-event">
                        <Clock3 size={15} />
                        <div>
                          <strong>{t("Creative session", "Sesja kreatywna")}</strong>
                          <small>14:00–15:30</small>
                        </div>
                      </div>
                    </>
                  )}
                  {feature.key === "whiteboard" && (
                    <>
                      <div className="scriboo-board-toolbar">
                        <Pen size={15} />
                        <Type size={15} />
                        <Shapes size={15} />
                        <Upload size={15} />
                      </div>
                      <div className="scriboo-board-note scriboo-board-note--one">
                        {t("Explain", "Tłumacz")}
                      </div>
                      <div className="scriboo-board-note scriboo-board-note--two">
                        {t("Create", "Twórz")}
                      </div>
                      <svg className="scriboo-board-line" viewBox="0 0 260 130" aria-hidden="true">
                        <path d="M15 95 C55 15, 105 120, 155 48 S225 22, 248 78" />
                        <circle cx="155" cy="48" r="7" />
                      </svg>
                    </>
                  )}
                </div>

                <div className="scriboo-feature-card__copy">
                  <small>{feature.eyebrow}</small>
                  <p>{feature.description}</p>
                </div>
              </article>
              ))}
              </div>
            </div>

            <div data-scriboo-feature-page className="scriboo-feature-page">
              <div className="scriboo-workflow-page">
                <div className="scriboo-workflow-page__intro">
                  <small>{t("A simple rhythm", "Prosty rytm pracy")}</small>
                  <h3>{t("From preparation to progress.", "Od przygotowania do postępów.")}</h3>
                  <p>
                    {t(
                      "Keep every part of a session connected, before, during, and after you meet.",
                      "Połącz każdy etap spotkania — przed, w trakcie i po jego zakończeniu."
                    )}
                  </p>
                </div>
                <div className="scriboo-workflow-page__steps">
                  {[
                    {
                      number: "01",
                      icon: <CalendarDays size={25} />,
                      title: t("Prepare", "Przygotuj"),
                      copy: t("Plan the session and gather everything in one board.", "Zaplanuj spotkanie i zbierz wszystko na jednej tablicy."),
                    },
                    {
                      number: "02",
                      icon: <Video size={25} />,
                      title: t("Work together", "Pracujcie razem"),
                      copy: t("Talk, explain, and create without leaving the workspace.", "Rozmawiaj, tłumacz i twórz bez opuszczania przestrzeni."),
                    },
                    {
                      number: "03",
                      icon: <History size={25} />,
                      title: t("Continue", "Kontynuuj"),
                      copy: t("Return to the board and continue exactly where you stopped.", "Wróć do tablicy i kontynuuj dokładnie od tego miejsca."),
                    },
                  ].map((step) => (
                    <article key={step.number}>
                      <span className="scriboo-workflow-page__number">{step.number}</span>
                      <span className="scriboo-workflow-page__icon">{step.icon}</span>
                      <h4>{step.title}</h4>
                      <p>{step.copy}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <div data-scriboo-feature-page className="scriboo-feature-page">
              <div className="scriboo-feature-page__cards scriboo-feature-page__cards--pricing">
                {[
                  {
                    name: "Basic",
                    price: "29.99",
                    features: [
                      t("Up to 5 boards", "Do 5 tablic"),
                      t("Share with up to 1 person", "Udostępnianie 1 osobie"),
                    ],
                    button: t("Choose Basic", "Wybierz Basic"),
                    tone: "basic",
                  },
                  {
                    name: "Pro",
                    price: "49.99",
                    features: [
                      t("Unlimited boards", "Nielimitowane tablice"),
                      t("Share with up to 3 people", "Udostępnianie 3 osobom"),
                      t("Calendar planning", "Planowanie w kalendarzu"),
                    ],
                    button: t("Choose Pro", "Wybierz Pro"),
                    badge: t("Most popular", "Najpopularniejszy"),
                    tone: "pro",
                  },
                  {
                    name: "Master",
                    price: "79.99",
                    features: [
                      t("Unlimited boards", "Nielimitowane tablice"),
                      t("Share with up to 10 people", "Udostępnianie 10 osobom"),
                      t("Full premium experience", "Pełne doświadczenie premium"),
                    ],
                    button: t("Choose Master", "Wybierz Master"),
                    tone: "master",
                  },
                ].map((plan) => (
                  <article
                    key={plan.name}
                    className={`scriboo-showcase-plan scriboo-showcase-plan--${plan.tone}`}
                  >
                    <div className="scriboo-showcase-plan__heading">
                      <h3>{plan.name}</h3>
                      {plan.badge && <span>{plan.badge}</span>}
                    </div>
                    <div className="scriboo-showcase-plan__price">
                      <strong>{plan.price}</strong>
                      <span>PLN / {t("month", "miesiąc")}</span>
                    </div>
                    <ul>
                      {plan.features.map((item) => (
                        <li key={item}><Check size={15} /> <span>{item}</span></li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => openAuthModal("register")}
                    >
                      {plan.button}
                    </button>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <footer className="scriboo-feature-showcase__footer">
            <button
              type="button"
              aria-label={t("Previous feature", "Poprzednia funkcja")}
              onClick={() => scrollGuestFeatures(guestFeatureIndex - 1)}
            >
              <ChevronLeft size={21} />
            </button>
            <div className="scriboo-feature-showcase__dots" aria-label={t("Feature pages", "Strony funkcji") }>
              {Array.from({ length: guestShowcasePageCount }, (_, index) => (
                <button
                  type="button"
                  key={index}
                  className={index === guestFeatureIndex ? "is-active" : ""}
                  aria-label={
                    index === 0
                      ? t("Show features", "Pokaż funkcje")
                      : index === 1
                      ? t("Show how Scriboo works", "Pokaż, jak działa Scriboo")
                      : t("Show plans and pricing", "Pokaż plany i ceny")
                  }
                  onClick={() => scrollGuestFeatures(index)}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label={t("Next feature", "Następna funkcja")}
              onClick={() => scrollGuestFeatures(guestFeatureIndex + 1)}
            >
              <ChevronRight size={21} />
            </button>
          </footer>
        </section>
      )}

      {isToolbarCollapsed && (
        <button
          type="button"
          aria-label={t("Show drawing toolbar", "Pokaż pasek narzędzi")}
          title={t("Show toolbar", "Pokaż pasek")}
          onClick={() => setIsToolbarCollapsed(false)}
          style={{
            position: "fixed",
            top: "50%",
            left: 0,
            width: "28px",
            height: "58px",
            transform: "translateY(-50%)",
            borderTop: `1px solid ${panelBorderColor}`,
            borderRight: `1px solid ${panelBorderColor}`,
            borderBottom: `1px solid ${panelBorderColor}`,
            borderLeftWidth: 0,
            borderRadius: "0 12px 12px 0",
            background: toolbarBackground,
            color: panelTextColor,
            display: "grid",
            placeItems: "center",
            padding: 0,
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            boxShadow: "4px 8px 18px rgba(0,0,0,0.14)",
            zIndex: 20,
          }}
        >
          <ChevronRight size={18} />
        </button>
      )}

      <div
        className="scriboo-top-bar"
        onPointerEnter={hidePenCursor}
        onPointerMove={hidePenCursor}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: `${topBarHeight}px`,
          background: topBarGradient,
          cursor: "default",
          zIndex: 50,
          textRendering: "optimizeLegibility",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        {!currentAccountId && (
          <div
            className="scriboo-guest-wordmark"
            aria-label="Scriboo"
            style={{
              position: "absolute",
              top: "50%",
              left: "18px",
              transform: "translateY(-50%)",
              width: "148px",
              height: "38px",
              overflow: "hidden",
              filter: "drop-shadow(0 2px 6px rgba(35,35,105,0.14))",
              pointerEvents: "none",
            }}
          >
            <NextImage
              src="/scriboo-wordmark-white.png"
              alt="Scriboo"
              width={1992}
              height={1024}
              priority
              draggable={false}
              style={{
                position: "absolute",
                width: "150px",
                height: "auto",
                left: "-1px",
                top: "-11px",
                display: "block",
                userSelect: "none",
              }}
            />
          </div>
        )}

        <button
          aria-label={t("Settings", "Ustawienia")}
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
            display: currentAccountId ? "grid" : "none",
            placeItems: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Settings size={18} />
        </button>

        <div
          ref={boardsMenuContainerRef}
          style={{
            position: "absolute",
            top: "50%",
            left: "64px",
            transform: "translateY(-50%)",
            display: currentAccountId ? "block" : "none",
          }}
        >
            <button
            aria-label={t("Boards", "Tablice")}
              onClick={() => {
                setShowBoardsMenu((prev) =>
                  boardBrowserView === "calendar" ? true : !prev
                );
                setBoardBrowserView("all");
                setShowSettingsMenu(false);
              }}
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "10px",
                border: "none",
                background: "transparent",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                padding: 0,
                backdropFilter: "none",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect x="2.25" y="3" width="13.5" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                  <rect x="6" y="1.5" width="6" height="3.25" rx="1.2" fill="currentColor" />
                </svg>
              </button>

              <button
                type="button"
                aria-label={t("Calendar", "Kalendarz")}
                title={t("Calendar", "Kalendarz")}
                onClick={() => {
                  setBillingNotice(null);
                  setBoardBrowserView("calendar");
                  setShowBoardsMenu(true);
                  setShowSettingsMenu(false);
                }}
                style={{
                  position: "absolute",
                  top: 0,
                  left: "90px",
                  width: "34px",
                  height: "34px",
                  border: "none",
                  borderRadius: "10px",
                  background: "transparent",
                  color: "#ffffff",
                  display: "grid",
                  placeItems: "center",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <CalendarDays size={17} />
              </button>

          {showBoardsMenu && (
              <div
                className="scriboo-workspace-panel"
                style={{
                  position: "absolute",
                  top: "calc(100% + 10px)",
                  left: "-38px",
                  width: "min(1560px, calc(100vw - 24px))",
                  height: "min(880px, calc(100vh - 64px))",
                  borderRadius: "24px",
                  background:
                    "linear-gradient(180deg, rgba(250,252,255,0.985) 0%, rgba(247,251,255,0.985) 100%)",
                  border: "1px solid rgba(205,218,236,0.92)",
                  boxShadow: premiumShellShadow,
                  display: "grid",
                  gridTemplateColumns:
                    boardBrowserView === "calendar"
                      ? "minmax(0, 1fr)"
                      : "300px minmax(0, 1fr)",
                  overflow: "hidden",
                  zIndex: 90,
                  fontFamily: appSansFontFamily,
                  textRendering: "optimizeLegibility",
                  WebkitFontSmoothing: "antialiased",
                  MozOsxFontSmoothing: "grayscale",
                }}
              >
                {boardBrowserView !== "calendar" && <aside
                  className="scriboo-workspace-sidebar"
                  style={{
                    background:
                      "linear-gradient(180deg, #f8fafc 0%, #eef4ff 100%)",
                    borderRight: "1px solid rgba(203,213,225,0.74)",
                    padding: "30px 22px 24px",
                    display: "grid",
                    gridTemplateRows: boardActionMessage
                      ? "auto auto auto 1fr auto"
                      : "auto auto 1fr auto",
                    gap: "18px",
                    ...premiumBodyStyle,
                  }}
                >
                  <div
                    className="scriboo-workspace-header"
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
                    {t("Boards", "Tablice")}
                      </div>
                    </div>
                    <button
                    aria-label={t("Close boards", "Zamknij tablice")}
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
                      className="scriboo-new-board-button"
                      aria-label={t("Create board", "Utwórz tablicę")}
                      onClick={createBoard}
                      onMouseEnter={() => {
                        if (!isBoardsLoading && liveBoardsCount < currentMaxBoards) {
                          setIsNewBoardButtonHovered(true);
                        }
                      }}
                      onMouseLeave={() => setIsNewBoardButtonHovered(false)}
                      style={{
                      minHeight: "46px",
                      width: "100%",
                      borderRadius: "12px",
                      border: isInterfaceDarkMode
                        ? "1px solid rgba(255,255,255,0.76)"
                        : isNewBoardButtonHovered &&
                        !isBoardsLoading &&
                        liveBoardsCount < currentMaxBoards
                          ? "1px solid rgba(255,255,255,0.74)"
                          : "1px solid rgba(255,255,255,0.58)",
                      backgroundColor: isInterfaceDarkMode
                        ? isNewBoardButtonHovered
                          ? "#394263"
                          : "#303853"
                        : "transparent",
                      backgroundImage: isInterfaceDarkMode
                        ? "none"
                        : signatureIndigoGradient,
                      backgroundSize: "145% 145%",
                      backgroundPosition:
                        isNewBoardButtonHovered &&
                        !isBoardsLoading &&
                        liveBoardsCount < currentMaxBoards
                          ? "100% 50%"
                          : "0% 50%",
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      overflow: "hidden",
                      backgroundClip: "padding-box",
                      cursor:
                        isBoardsLoading || liveBoardsCount >= currentMaxBoards
                          ? "default"
                          : "pointer",
                      opacity: liveBoardsCount >= currentMaxBoards ? 0.55 : 1,
                      boxShadow: isInterfaceDarkMode
                        ? "0 9px 22px rgba(5,8,24,0.24), inset 0 1px 0 #ffffff"
                        : isNewBoardButtonHovered &&
                        !isBoardsLoading &&
                        liveBoardsCount < currentMaxBoards
                          ? "0 14px 28px rgba(15,23,42,0.18), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.22)"
                          : "0 8px 20px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.18)",
                      fontSize: "14px",
                      fontWeight: 600,
                      transition:
                        "border-color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease, filter 0.22s ease, background-position 0.42s ease",
                      transform:
                        isNewBoardButtonHovered &&
                        !isBoardsLoading &&
                        liveBoardsCount < currentMaxBoards
                          ? "translateY(-1.5px) scale(1.018)"
                          : "translateY(-0.5px)",
                      filter:
                        isNewBoardButtonHovered &&
                        !isBoardsLoading &&
                        liveBoardsCount < currentMaxBoards
                          ? "saturate(1.08) brightness(1.05)"
                          : "none",
                    }}
                    title={
                      liveBoardsCount >= currentMaxBoards
                        ? `${currentPlanLabel} lets you create up to ${currentMaxBoards} boards.`
                        : "Create a new board"
                    }
                  >
                    <Plus size={17} />
                        {t("New board", "Nowa tablica")}
                  </button>

                  {boardActionMessage && (
                    <div
                      role="alert"
                      style={{
                        marginTop: "8px",
                        padding: "9px 11px",
                        borderRadius: "10px",
                        border: "1px solid rgba(220,38,38,0.16)",
                        background: "rgba(254,226,226,0.72)",
                        color: "#b91c1c",
                        fontSize: "12px",
                        fontWeight: 650,
                        lineHeight: 1.35,
                      }}
                    >
                      {boardActionMessage}
                    </div>
                  )}

                  <div style={{ display: "grid", gap: "8px", alignContent: "start" }}>
                    {[
                      {
                        label: t("All boards", "Wszystkie tablice"),
                        value: "all" as const,
                        icon: <LayoutGrid size={15} />,
                      },
                      {
                        label: t("Recent", "Ostatnie"),
                        value: "recent" as const,
                        icon: <Clock3 size={15} />,
                      },
                      {
                        label: t("My boards", "Moje tablice"),
                        value: "mine" as const,
                        icon: <Monitor size={15} />,
                      },
                      {
                        label: t("Starred", "Ulubione"),
                        value: "starred" as const,
                        icon: <Star size={15} />,
                      },
                      {
                        label: t("Trash", "Kosz"),
                        value: "trash" as const,
                        icon: <Trash2 size={15} />,
                      },
                      {
                        label: t("Your plan", "Twój plan"),
                        value: "plan" as const,
                        icon: <Star size={15} />,
                      },
                    ].map((item) => {
                      const isActive = boardBrowserView === item.value;

                      return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setBoardBrowserView(item.value);
                        }}
                        style={{
                          height: "44px",
                          padding: "0 14px",
                          borderRadius: "12px",
                          border: isActive
                            ? "1px solid rgba(110,163,215,0.2)"
                            : "1px solid transparent",
                          background: isActive
                            ? "linear-gradient(90deg, rgba(139,70,255,0.055) 0%, rgba(75,143,255,0.05) 38%, rgba(25,195,188,0.048) 72%, rgba(48,207,104,0.048) 100%)"
                            : "transparent",
                          color: isActive ? "#145d93" : "#334155",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "10px",
                          fontSize: "14px",
                          fontWeight: isActive ? 560 : 460,
                          cursor: "pointer",
                          opacity: 1,
                          boxShadow: isActive
                            ? "0 8px 18px rgba(71,127,189,0.08), 0 1px 0 rgba(255,255,255,0.58) inset"
                            : "none",
                        }}
                      >
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                          }}
                        >
                          {item.icon}
                          {item.label}
                        </span>
                      </button>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      marginTop: "auto",
                      display: "grid",
                      gap: "12px",
                    }}
                  >
                    <div
                      className="scriboo-board-usage-card"
                      style={{
                        padding: "16px",
                        borderRadius: "14px",
                        background:
                          "linear-gradient(135deg, rgba(255,255,255,0.82) 0%, rgba(239,196,93,0.08) 34%, rgba(89,171,168,0.08) 100%)",
                        border: "1px solid rgba(110,163,215,0.18)",
                        boxShadow: premiumCardShadow,
                      }}
                    >
                      <div
                        style={{
                          color: "#0f172a",
                          fontSize: "14px",
                          fontWeight: 500,
                        }}
                      >
                        {boardUsageLabel}
                      </div>
                      <div
                        style={{
                          marginTop: "6px",
                          color: "#64748b",
                          fontSize: "12px",
                          lineHeight: 1.45,
                        }}
                      >
                        {t(
                          "Click a card to open it. Click the active board card title to rename it.",
                          "Kliknij kartę, aby ją otworzyć. Kliknij tytuł aktywnej tablicy, aby zmienić jej nazwę."
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "4px 2px",
                        borderRadius: "0",
                        background: "transparent",
                        border: "none",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "12px",
                        boxShadow: "none",
                      }}
                    >
                      <Link
                        href="/privacy"
                        style={{
                          color: "#64748b",
                          fontSize: "12px",
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                                {t("Privacy Policy", "Polityka prywatności")}
                      </Link>
                      <Link
                        href="/terms"
                        style={{
                          color: "#64748b",
                          fontSize: "12px",
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                                {t("Terms of Service", "Regulamin")}
                      </Link>
                    </div>
                  </div>
                </aside>}

                <section
                  className="scriboo-workspace-main"
                  style={{
                    position: "relative",
                    padding:
                      boardBrowserView === "calendar"
                        ? "34px 72px 28px 28px"
                        : "34px 28px 28px",
                    display: "grid",
                    gridTemplateRows: "auto auto auto 1fr",
                    gap: "16px",
                    minWidth: 0,
                    minHeight: 0,
                    background:
                      "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
                    ...premiumBodyStyle,
                  }}
                >
                  {boardBrowserView === "calendar" && (
                    <button
                      type="button"
                      aria-label={t("Close calendar", "Zamknij kalendarz")}
                      onClick={() => setShowBoardsMenu(false)}
                      style={{
                        position: "absolute",
                        top: "14px",
                        right: "14px",
                        width: "34px",
                        height: "34px",
                        borderRadius: "10px",
                        border: `1px solid ${panelBorderColor}`,
                        background: controlBackground,
                        color: panelTextColor,
                        display: "grid",
                        placeItems: "center",
                        padding: 0,
                        cursor: "pointer",
                        zIndex: 2,
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                  <div
                    className="scriboo-workspace-header"
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
                      {boardBrowserView === "plan" && (
                        <>
                          <div
                            className="scriboo-plan-status"
                            style={{
                              marginTop: "10px",
                              color: "#4f46e5",
                              fontSize: "13px",
                              fontWeight: 500,
                            }}
                          >
                            {currentWorkspaceStatusMessage}
                          </div>
                          {currentSubscriptionEndingMessage ? (
                            <div
                              style={{
                                marginTop: "8px",
                                color: "#b45309",
                                fontSize: "13px",
                                fontWeight: 600,
                              }}
                            >
                              {currentSubscriptionEndingMessage}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>

                    <div
                      style={{
                        minWidth: "180px",
                        padding: "8px 0",
                        borderRadius: "0",
                        border: "none",
                        background: "transparent",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        boxShadow: "none",
                      }}
                    >
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "999px",
                          background:
                            "linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)",
                          color: "#ffffff",
                          display: "grid",
                          placeItems: "center",
                          flex: "0 0 auto",
                          boxShadow: "0 8px 18px rgba(34,197,94,0.2)",
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
                            {t("Logged in", "Zalogowano")}
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

                  {boardBrowserView !== "plan" && (
                    <div
                      className="scriboo-workspace-controls"
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
                          borderRadius: "0",
                          border: "none",
                          borderBottom: "1px solid rgba(203,213,225,0.9)",
                          background: "transparent",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          boxShadow: "none",
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
                          gap: "4px",
                          flexWrap: "wrap",
                          padding: "0",
                          borderRadius: "0",
                          border: "none",
                          background: "transparent",
                          boxShadow: "none",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => goToCalendarMonth(-12)}
                          style={{
                            height: "44px",
                            padding: "0 8px",
                            borderRadius: "12px",
                            border: "none",
                            background: "transparent",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "13px",
                            fontWeight: 500,
                            cursor: "pointer",
                            color: "#52647c",
                          }}
                        >
                          <ChevronLeft size={16} />
                          {t("Year", "Rok")}
                        </button>
                        <button
                          type="button"
                          onClick={() => goToCalendarMonth(-1)}
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "12px",
                            border: "none",
                            background: "transparent",
                            color: "#52647c",
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
                            padding: "0 8px",
                            borderRadius: "12px",
                            border: "none",
                            background: "transparent",
                            color: "#0f172a",
                            display: "flex",
                            alignItems: "center",
                            fontSize: "15px",
                            fontWeight: 700,
                            letterSpacing: "-0.02em",
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
                            border: "none",
                            background: "transparent",
                            color: "#52647c",
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
                            padding: "0 8px",
                            borderRadius: "12px",
                            border: "none",
                            background: "transparent",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "13px",
                            fontWeight: 500,
                            cursor: "pointer",
                            color: "#52647c",
                          }}
                        >
                              {t("Year", "Rok")}
                          <ChevronRight size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => scrollCalendarHorizontally("left")}
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "12px",
                            border: "none",
                            background: "transparent",
                            color: "#52647c",
                            display: "grid",
                            placeItems: "center",
                            cursor: "pointer",
                          }}
                          aria-label={t("Scroll calendar left", "Przewiń kalendarz w lewo")}
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={jumpToCalendarToday}
                          style={{
                            height: "44px",
                            padding: "0 14px",
                            borderRadius: "999px",
                            border: "none",
                            background:
                              "linear-gradient(90deg, rgba(139,70,255,0.08) 0%, rgba(75,143,255,0.08) 38%, rgba(25,195,188,0.08) 72%, rgba(48,207,104,0.08) 100%)",
                            color: "#1d4ed8",
                            display: "flex",
                            alignItems: "center",
                            fontSize: "13px",
                            fontWeight: 600,
                            boxShadow: "none",
                            cursor: "pointer",
                          }}
                        >
                          {t("Today", "Dzisiaj")}
                        </button>
                        <button
                          type="button"
                          onClick={() => scrollCalendarHorizontally("right")}
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "12px",
                            border: "none",
                            background: "transparent",
                            color: "#52647c",
                            display: "grid",
                            placeItems: "center",
                            cursor: "pointer",
                          }}
                          aria-label={t("Scroll calendar right", "Przewiń kalendarz w prawo")}
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          height: "46px",
                          padding: "0 4px",
                          borderRadius: "0",
                          border: "none",
                          background: "transparent",
                          color: "#475569",
                          display: "flex",
                          alignItems: "center",
                          fontSize: "14px",
                          fontWeight: 600,
                        }}
                      >
                          {t("Modified recently", "Ostatnio zmodyfikowane")}
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
                          ...premiumBodyStyle,
                        }}
                      >
                        <div
                          className="scriboo-plan-stats"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: "14px",
                          }}
                        >
                          {[
                            {
                              label: t("Current plan", "Obecny plan"),
                              value: currentWorkspacePlanLabel,
                            },
                            {
                              label: t("Board access", "Dostęp do tablic"),
                              value: hasUnlimitedBoards
                                ? t("Unlimited saved boards", "Nielimitowane zapisane tablice")
                                : t(`Up to ${currentMaxBoards} saved boards`, `Do ${currentMaxBoards} zapisanych tablic`),
                            },
                            {
                              label: t("Subscription status", "Status subskrypcji"),
                              value:
                                currentSubscriptionCancelAtPeriodEnd &&
                                currentSubscriptionEndLabel
                                  ? `Ends on ${currentSubscriptionEndLabel}`
                                  : hasActivePaidSubscription
                                  ? "Paid plan active"
                                  : t("Free to upgrade anytime", "Możesz przejść na wyższy plan w każdej chwili"),
                            },
                          ].map((item) => (
                            <div
                              key={item.label}
                              className="scriboo-plan-stat"
                              style={{
                                minHeight: "70px",
                                borderRadius: "0",
                                border: "none",
                                borderLeft: "1px solid rgba(148,163,184,0.28)",
                                background: "transparent",
                                padding: "4px 18px",
                                display: "grid",
                                gap: "8px",
                                alignContent: "start",
                                boxShadow: "none",
                                ...premiumBodyStyle,
                              }}
                            >
                              <div
                                style={{
                                  color: "#64748b",
                                  fontSize: "11px",
                                  letterSpacing: "0.12em",
                                  textTransform: "uppercase",
                                  fontWeight: 700,
                                }}
                              >
                                {item.label}
                              </div>
                              <div
                                style={{
                                  color: "#0f172a",
                                  fontSize: "17px",
                                  lineHeight: 1.25,
                                  fontWeight: 700,
                                  letterSpacing: "-0.02em",
                                }}
                              >
                                {item.value}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(280px, 1fr))",
                            gap: "18px",
                          }}
                        >
                          <div
                            className="scriboo-plan-hero"
                            style={{
                              minHeight: "240px",
                              borderRadius: "12px",
                              border: "1px solid rgba(89,171,168,0.2)",
                              background: signatureIndigoGradient,
                              color: "#ffffff",
                              padding: "28px",
                              overflow: "hidden",
                              backgroundClip: "padding-box",
                              isolation: "isolate",
                              display: "grid",
                              gap: "20px",
                              alignContent: "space-between",
                              boxShadow: "0 30px 70px rgba(50,90,183,0.22)",
                              ...premiumBodyStyle,
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
                                    fontSize: "12px",
                                    color: "rgba(255,255,255,0.76)",
                                    letterSpacing: "0.12em",
                                    textTransform: "uppercase",
                                    fontWeight: 700,
                                  }}
                                >
                                  {t("Upgrade your workspace", "Ulepsz swoją przestrzeń roboczą")}
                                </div>
                                <div
                                  style={{
                                    marginTop: "10px",
                                    fontSize: "clamp(38px, 4.6vw, 56px)",
                                    lineHeight: 0.96,
                                    maxWidth: "560px",
                                    ...premiumHeadingStyle,
                                  }}
                                >
                                  {t("Pick the plan that matches your pace.", "Wybierz plan dopasowany do Twojego tempa.")}
                                </div>
                              </div>
                              <div
                                style={{
                                  width: "24px",
                                  height: "24px",
                                  display: "grid",
                                  placeItems: "center",
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
                                t("Clean organization", "Lepsza organizacja"),
                                t("Smarter scheduling", "Inteligentne planowanie"),
                                t("Better workspace flow", "Sprawniejsza praca"),
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
                                    color: "rgba(255,255,255,0.92)",
                                    fontWeight: 600,
                                    letterSpacing: "-0.01em",
                                  }}
                                >
                                  {badge}
                                </div>
                              ))}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: "10px",
                                flexWrap: "wrap",
                              }}
                            >
                              {[
                                `${t("Plan", "Plan")}: ${currentWorkspacePlanLabel}`,
                                hasUnlimitedBoards
                                  ? t("Unlimited boards", "Nielimitowane tablice")
                                  : t(`${currentMaxBoards} board limit`, `Limit ${currentMaxBoards} tablic`),
                              ].map((meta) => (
                                <div
                                  key={meta}
                                  style={{
                                    height: "32px",
                                    padding: "0 12px",
                                    borderRadius: "999px",
                                    background: "rgba(15,23,42,0.12)",
                                    border: "1px solid rgba(255,255,255,0.14)",
                                    display: "flex",
                                    alignItems: "center",
                                    fontSize: "12px",
                                    color: "rgba(255,255,255,0.9)",
                                    fontWeight: 600,
                                    letterSpacing: "-0.01em",
                                  }}
                                >
                                  {meta}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div
                            className="scriboo-plan-summary"
                            style={{
                              minHeight: "240px",
                              borderRadius: "20px",
                              border: "1px solid rgba(89,171,168,0.18)",
                              background:
                                "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(239,196,93,0.08) 18%, rgba(231,217,122,0.08) 34%, rgba(89,171,168,0.11) 72%, rgba(110,163,215,0.12) 100%)",
                              padding: "24px",
                              overflow: "hidden",
                              backgroundClip: "padding-box",
                              isolation: "isolate",
                              display: "grid",
                              gap: "16px",
                              alignContent: "start",
                              boxShadow:
                                "0 18px 42px rgba(37,99,235,0.08), 0 1px 0 rgba(255,255,255,0.8) inset",
                              ...premiumBodyStyle,
                            }}
                          >
                            <div
                              style={{
                                color: "#64748b",
                                fontSize: "12px",
                                letterSpacing: "0.12em",
                                textTransform: "uppercase",
                                fontWeight: 700,
                              }}
                            >
                              {t("Monthly billing", "Rozliczenie miesięczne")}
                            </div>
                            <div
                              style={{
                                color: "#0f172a",
                                fontSize: "clamp(30px, 3.6vw, 42px)",
                                lineHeight: 0.98,
                                maxWidth: "420px",
                                ...premiumHeadingStyle,
                              }}
                            >
                              {t("Clear pricing in", "Przejrzyste ceny w")} {billingCurrencyLabel}.
                            </div>
                            <div
                              style={{
                                color: "#64748b",
                                fontSize: "15px",
                                lineHeight: 1.65,
                                maxWidth: "420px",
                              }}
                            >
                              {t("Start simple, move up when your boards, schedules, and team rhythm need more room.", "Zacznij prosto i przejdź wyżej, gdy tablice, harmonogramy i praca zespołu będą potrzebować więcej miejsca.")}
                            </div>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "6px",
                                width: "fit-content",
                                borderRadius: "999px",
                                border: "1px solid rgba(89,171,168,0.18)",
                                background:
                                  "linear-gradient(135deg, rgba(255,255,255,0.94) 0%, rgba(231,217,122,0.1) 100%)",
                                boxShadow:
                                  "0 14px 30px rgba(37,99,235,0.08), 0 1px 0 rgba(255,255,255,0.72) inset",
                                overflow: "hidden",
                                backgroundClip: "padding-box",
                              }}
                            >
                              {(["pln"] as const).map((currency) => (
                                <button
                                  className="scriboo-plan-currency"
                                  key={currency}
                                  type="button"
                                  onClick={() => setBillingCurrency(currency)}
                                  style={{
                                    height: "34px",
                                    minWidth: "64px",
                                    padding: "0 14px",
                                    borderRadius: "999px",
                                    border:
                                      billingCurrency === currency
                                        ? "1px solid rgba(255,255,255,0.22)"
                                        : "1px solid transparent",
                                    background:
                                      billingCurrency === currency
                                        ? signatureIndigoButtonGradient
                                        : "transparent",
                                    color:
                                      billingCurrency === currency
                                        ? "#ffffff"
                                        : "#475569",
                                    fontSize: "13px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    overflow: "hidden",
                                    backgroundClip: "padding-box",
                                    isolation: "isolate",
                                    boxShadow:
                                      billingCurrency === currency
                                        ? "inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 14px rgba(37,99,235,0.14)"
                                        : "none",
                                  }}
                                >
                                  {currency.toUpperCase()}
                                </button>
                              ))}
                            </div>
                            {hasActivePaidSubscription && (
                              <button
                                type="button"
                                onClick={openBillingPortal}
                                disabled={isBillingPortalLoading}
                                style={{
                                  height: "42px",
                                  padding: "0 16px",
                                  width: "fit-content",
                                  borderRadius: "12px",
                                  border: "1px solid rgba(59,130,246,0.16)",
                                  background: "#ffffff",
                                  color: "#1d4ed8",
                                  fontSize: "13px",
                                  fontWeight: 700,
                                  cursor: isBillingPortalLoading ? "default" : "pointer",
                                  opacity: isBillingPortalLoading ? 0.72 : 1,
                                }}
                              >
                                {isBillingPortalLoading
                                  ? t("Opening billing...", "Otwieranie płatności...")
                                  : t("Manage subscription", "Zarządzaj subskrypcją")}
                              </button>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(260px, 1fr))",
                            gap: "18px",
                          }}
                        >
                          {billingPlans.map((plan) => (
                            <div
                              key={plan.name}
                              className={`scriboo-plan-card${
                                plan.featured ? " is-featured" : ""
                              }`}
                              style={{
                                minHeight: "384px",
                                borderRadius: "20px",
                                border: `1px solid ${plan.border}`,
                                background: plan.accent,
                                padding: "24px",
                                overflow: "hidden",
                                backgroundClip: "padding-box",
                                isolation: "isolate",
                                display: "grid",
                                gridTemplateRows: "auto auto 1fr auto",
                                gap: "18px",
                                boxShadow: plan.featured
                                  ? premiumFeaturedCardShadow
                                  : premiumCardShadow,
                                transform: plan.featured ? "translateY(-6px)" : "none",
                                ...premiumBodyStyle,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "start",
                                  flexWrap: "wrap",
                                  gap: "12px",
                                }}
                              >
                                <div
                                  style={{
                                    color: plan.text,
                                    fontSize: "24px",
                                    ...premiumHeadingStyle,
                                  }}
                                >
                                  {plan.name}
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "8px",
                                    flexWrap: "wrap",
                                    justifyContent: "flex-end",
                                  }}
                                >
                                  {hasActivePaidSubscription &&
                                    currentAccountPlan === plan.value && (
                                    <div
                                      style={{
                                        height: "28px",
                                        padding: "0 12px",
                                        borderRadius: "999px",
                                        background: plan.featured
                                          ? topBarFeaturedChipGradient
                                          : "rgba(217,138,86,0.1)",
                                        border: plan.featured
                                          ? "1px solid rgba(255,255,255,0.18)"
                                          : "1px solid rgba(217,138,86,0.16)",
                                        color: plan.featured ? "#ffffff" : "#c25c2f",
                                        display: "flex",
                                        alignItems: "center",
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        letterSpacing: "-0.01em",
                                      }}
                                    >
                                      {currentSubscriptionCancelAtPeriodEnd &&
                                      currentSubscriptionEndLabel
                                        ? `Active until ${currentSubscriptionEndLabel}`
                                        : t("Current plan", "Obecny plan")}
                                    </div>
                                  )}
                                  {plan.featured && (
                                    <div
                                      style={{
                                        height: "28px",
                                        padding: "0 12px",
                                        borderRadius: "999px",
                                        background: topBarFeaturedChipGradient,
                                        border: "1px solid rgba(255,255,255,0.18)",
                                        color: "#ffffff",
                                        display: "flex",
                                        alignItems: "center",
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        letterSpacing: "-0.01em",
                                      }}
                                    >
                                      {t("Most popular", "Najpopularniejszy")}
                                    </div>
                                  )}
                                </div>
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
                                    fontSize: "50px",
                                    lineHeight: 0.88,
                                    ...premiumHeadingStyle,
                                  }}
                                >
                                  {plan.prices[billingCurrency] === "0"
                                    ? "Free"
                                    : plan.prices[billingCurrency]}
                                </span>
                                {plan.priceSuffix ? (
                                  <span
                                    style={{
                                      fontSize: "16px",
                                      opacity: plan.featured ? 0.86 : 0.72,
                                      paddingBottom: "8px",
                                      fontWeight: 500,
                                      letterSpacing: "-0.02em",
                                    }}
                                  >
                                    {plan.priceSuffix}
                                  </span>
                                ) : null}
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
                                      fontSize: "15px",
                                      lineHeight: 1.35,
                                      fontWeight: 500,
                                      letterSpacing: "-0.015em",
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
                                className="scriboo-plan-action"
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
                                    : "1px solid rgba(110,163,215,0.18)",
                                  background: plan.featured
                                    ? "rgba(255,255,255,0.92)"
                                    : plan.buttonBackground,
                                  color: plan.buttonText,
                                  fontSize: "15px",
                                  fontWeight: 700,
                                  letterSpacing: "-0.015em",
                                  boxShadow: plan.featured
                                    ? "0 12px 28px rgba(10,11,45,0.18)"
                                    : "0 10px 24px rgba(89,171,168,0.08)",
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
                                <span
                                  style={{
                                    background: topBarPaletteGradient,
                                    WebkitBackgroundClip: "text",
                                    backgroundClip: "text",
                                    WebkitTextFillColor: "transparent",
                                    color: "transparent",
                                    display: "inline-block",
                                  }}
                                >
                                  {pendingBillingPlan === plan.value
                                    ? t("Opening billing...", "Otwieranie płatności...")
                                    : hasActivePaidSubscription &&
                                      currentAccountPlan === plan.value
                                    ? currentSubscriptionCancelAtPeriodEnd &&
                                      currentSubscriptionEndLabel
                                      ? `${plan.name} active until ${currentSubscriptionEndLabel}`
                                      : `${plan.name} active`
                                    : currentPlanRank === 0
                                    ? t(
                                        `Subscribe to ${plan.name}`,
                                        `Subskrybuj plan ${plan.name}`
                                      )
                                    : plan.value === "basic"
                                    ? t("Switch to Basic", "Przejdź na Basic")
                                    : currentPlanRank < (plan.value === "master" ? 3 : 2)
                                    ? t(`Upgrade to ${plan.name}`, `Przejdź na ${plan.name}`)
                                    : t(`Change to ${plan.name}`, `Zmień na ${plan.name}`)}
                                </span>
                              </button>
                            </div>
                          ))}
                        </div>
                        <div
                          className="scriboo-plan-legal"
                          style={{
                            marginTop: "16px",
                            padding: "14px 16px",
                            border: "1px solid rgba(148,163,184,0.28)",
                            borderRadius: "10px",
                            background: "rgba(248,250,252,0.82)",
                            color: "#475569",
                            fontSize: "12px",
                            lineHeight: 1.6,
                            fontWeight: 600,
                          }}
                        >
                          {t(
                            "Paid plans are monthly subscriptions that renew automatically until cancelled. The selected price and any charge due now will be shown again before payment. You can cancel through Manage subscription; access continues until the end of the paid billing period. By subscribing, you agree to the",
                            "Płatne plany są miesięcznymi subskrypcjami odnawianymi automatycznie do czasu anulowania. Wybrana cena i należna teraz opłata zostaną ponownie pokazane przed płatnością. Subskrypcję możesz anulować w sekcji zarządzania; dostęp pozostanie aktywny do końca opłaconego okresu. Subskrybując, akceptujesz"
                          )}{" "}
                          <Link
                            href="/terms"
                            style={{ color: "#2563eb", fontWeight: 800 }}
                          >
                            {t("Terms of Service", "Regulamin")}
                          </Link>{" "}
                          {t("and acknowledge the", "i potwierdzasz zapoznanie się z")}{" "}
                          <Link
                            href="/privacy"
                            style={{ color: "#2563eb", fontWeight: 800 }}
                          >
                            {t("Privacy Policy", "Polityką prywatności")}
                          </Link>
                          .
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
                        {(billingNotice || billingChangeRequest) && (
                          <div
                            style={{
                              position: "fixed",
                              inset: 0,
                              background: "rgba(15,23,42,0.48)",
                              display: "grid",
                              placeItems: "center",
                              padding: "24px",
                              zIndex: 140,
                            }}
                          >
                            <div
                              style={{
                                width: "min(100%, 480px)",
                                borderRadius: "22px",
                                background: "#ffffff",
                                boxShadow: "0 30px 80px rgba(15,23,42,0.28)",
                                border: "1px solid rgba(203,213,225,0.9)",
                                padding: "24px",
                                display: "grid",
                                gap: "16px",
                              }}
                            >
                              {billingChangeRequest ? (
                                (() => {
                                  const isUpgrade =
                                    getBillingPlanRank(
                                      billingChangeRequest.targetPlan
                                    ) >
                                    getBillingPlanRank(
                                      billingChangeRequest.currentPlan
                                    );
                                  const isFreeUpgradeNow =
                                    isUpgrade &&
                                    billingChangeRequest.estimatedImmediateCharge === 0;
                                  const nextMonthlyPrice =
                                    formatBillingAmount(
                                      billingChangeRequest.estimatedNextMonthlyCharge,
                                      billingChangeRequest.currency
                                    ) ??
                                    `${getBillingPlanBasePrice(
                                      billingChangeRequest.targetPlan,
                                      billingChangeRequest.currency
                                    )} ${billingChangeRequest.currency.toUpperCase()}`;

                                  return (
                                    <>
                                  <div
                                    style={{
                                      color: "#0f172a",
                                      fontSize: "24px",
                                      fontWeight: 700,
                                      lineHeight: 1.1,
                                    }}
                                  >
                                    {t("Confirm plan change", "Potwierdź zmianę planu")}
                                  </div>
                                  <div
                                    style={{
                                      color: "#475569",
                                      fontSize: "14px",
                                      lineHeight: 1.6,
                                    }}
                                  >
                                    {t("You are changing from", "Zmieniasz plan z")}{" "}
                                    <strong style={{ color: "#0f172a" }}>
                                      {billingChangeRequest.currentPlan}
                                    </strong>{" "}
                                    {t("to", "na")}{" "}
                                    <strong style={{ color: "#0f172a" }}>
                                      {billingChangeRequest.targetPlan}
                                    </strong>
                                    .
                                  </div>
                                  <div
                                    style={{
                                      borderRadius: "16px",
                                      border: "1px solid rgba(59,130,246,0.14)",
                                      background: "rgba(239,246,255,0.9)",
                                      padding: "16px",
                                      display: "grid",
                                      gap: "10px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: "12px",
                                        fontSize: "14px",
                                        color: "#334155",
                                      }}
                                    >
                                      <span>{t("Estimated charge now", "Szacowana opłata teraz")}</span>
                                      <strong style={{ color: "#0f172a" }}>
                                        {isFreeUpgradeNow
                                          ? `0 ${billingChangeRequest.currency.toUpperCase()}`
                                          : formatBillingAmount(
                                              billingChangeRequest.estimatedImmediateCharge,
                                              billingChangeRequest.currency
                                            ) ?? "Estimated by Stripe"}
                                      </strong>
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: "12px",
                                        fontSize: "14px",
                                        color: "#334155",
                                      }}
                                    >
                                      <span>
                                        {t("Next renewal price", "Cena kolejnego odnowienia")}
                                      </span>
                                      <strong style={{ color: "#0f172a" }}>
                                        {nextMonthlyPrice}
                                      </strong>
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      color: "#64748b",
                                      fontSize: "13px",
                                      lineHeight: 1.55,
                                    }}
                                  >
                                    {isUpgrade
                                      ? "Your upgrade starts right away. You keep the higher plan for the rest of this billing cycle at no extra cost, then Stripe charges the normal monthly price on your next renewal date."
                                      : `You keep your current plan until${
                                          billingChangeRequest.changeEffectiveAt
                                            ? ` ${new Date(
                                                billingChangeRequest.changeEffectiveAt
                                              ).toLocaleDateString()}`
                                            : " your next renewal date"
                                        }. The lower plan and its full monthly price begin then. There is no charge or credit today.`}
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "flex-end",
                                      gap: "10px",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBillingChangeRequest(null);
                                        setBillingMessageTone("success");
                                        setBillingMessage("Plan change canceled.");
                                      }}
                                      style={{
                                        height: "44px",
                                        padding: "0 16px",
                                        borderRadius: "12px",
                                        border: "1px solid rgba(203,213,225,0.9)",
                                        background: "#ffffff",
                                        color: "#475569",
                                        fontSize: "14px",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                    >
                                      {t("Cancel", "Anuluj")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const nextPlan = billingChangeRequest.targetPlan;
                                        setBillingChangeRequest(null);
                                        setPendingBillingPlan(nextPlan);
                                        try {
                                          await runPlanCheckout(nextPlan, true);
                                        } finally {
                                          setPendingBillingPlan("");
                                        }
                                      }}
                                      style={{
                                        height: "44px",
                                        padding: "0 18px",
                                        borderRadius: "12px",
                                        border: "1px solid rgba(59,130,246,0.16)",
                                        background:
                                          "linear-gradient(135deg, #2563eb 0%, #22c55e 100%)",
                                        color: "#ffffff",
                                        fontSize: "14px",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                    >
                                      {t("Confirm change", "Potwierdź zmianę")}
                                    </button>
                                  </div>
                                    </>
                                  );
                                })()
                              ) : billingNotice ? (
                                <>
                                  <div
                                    style={{
                                      color: "#0f172a",
                                      fontSize: "24px",
                                      fontWeight: 700,
                                      lineHeight: 1.1,
                                    }}
                                  >
                                    {billingNotice.title}
                                  </div>
                                  <div
                                    style={{
                                      color:
                                        billingNotice.tone === "success"
                                          ? "#166534"
                                          : "#b91c1c",
                                      fontSize: "15px",
                                      fontWeight: 700,
                                      lineHeight: 1.45,
                                    }}
                                  >
                                    {billingNotice.message}
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "flex-end",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => setBillingNotice(null)}
                                      style={{
                                        height: "44px",
                                        padding: "0 18px",
                                        borderRadius: "12px",
                                        border: "1px solid rgba(59,130,246,0.16)",
                                        background: "#ffffff",
                                        color: "#1d4ed8",
                                        fontSize: "14px",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                    >
                                      {t("OK", "OK")}
                                    </button>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : boardBrowserView === "calendar" ? (
                      <>
                        {isCalendarReadOnly && (
                          <div
                            style={{
                              marginBottom: "16px",
                              borderRadius: "0",
                              border: "none",
                              borderLeft: "3px solid rgba(34,197,94,0.45)",
                              background: "transparent",
                              padding: "4px 0 4px 14px",
                              display: "grid",
                              gap: "6px",
                            }}
                          >
                            <div
                              style={{
                                color: "#0f172a",
                                fontSize: "18px",
                                fontWeight: 700,
                                lineHeight: 1.2,
                              }}
                            >
                              {t("Calendar preview", "Podgląd kalendarza")}
                            </div>
                            <div
                              style={{
                                color: "#166534",
                                fontSize: "14px",
                                fontWeight: 600,
                                lineHeight: 1.55,
                              }}
                            >
                              {t("You can view your calendar here, but editing is available on the Pro and Master plans.", "Tutaj możesz przeglądać kalendarz, ale edycja jest dostępna w planach Pro i Master.")}
                            </div>
                          </div>
                        )}
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
                              gap: "12px",
                            }}
                          >
                            {calendarWeekdayLabels.map((label) => (
                              <div
                                key={label}
                                className="scriboo-calendar-weekday"
                                style={{
                                  padding: "0 8px",
                                  color: "#64748b",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  letterSpacing: "0.08em",
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
                              gap: "12px",
                              alignContent: "start",
                            }}
                          >
                          {calendarDays.map((day) => (
                            <div
                              key={day.key}
                              className="scriboo-calendar-day"
                              style={{
                                minHeight: "206px",
                                borderRadius: "8px",
                                border: "1px solid rgba(208,220,237,0.72)",
                                background: day.isToday
                                  ? "linear-gradient(180deg, rgba(59,130,246,0.1) 0%, rgba(255,255,255,1) 56%)"
                                  : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,252,255,0.98) 100%)",
                                boxShadow: day.isToday
                                  ? "0 10px 24px rgba(59,130,246,0.09)"
                                  : "0 4px 12px rgba(15,23,42,0.025)",
                                padding: "12px",
                                display: "grid",
                                alignContent: "start",
                                gap: "10px",
                                overflow: "hidden",
                                ...premiumBodyStyle,
                              }}
                            >
                              <div
                                style={{
                                  minHeight: "30px",
                                  color: day.isToday ? "#2563eb" : "#111827",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "6px",
                                  fontSize: "15px",
                                  fontWeight: 600,
                                  letterSpacing: "-0.02em",
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
                                          background: isInterfaceDarkMode
                                            ? "#5f6596"
                                            : signatureIndigoButtonGradient,
                                          color: "#ffffff",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          boxShadow: isInterfaceDarkMode
                                            ? "0 5px 12px rgba(8,10,28,0.24)"
                                            : "0 10px 18px rgba(59,130,246,0.22)",
                                          fontWeight: 700,
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
                                    fontWeight: 700,
                                    letterSpacing: "0.08em",
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
                                          padding: "8px",
                                          borderRadius: "14px",
                                          border: "1px solid rgba(190,214,242,0.95)",
                                          background:
                                            "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(247,251,255,0.99) 100%)",
                                          boxShadow:
                                            "0 16px 32px rgba(37,99,235,0.08), 0 1px 0 rgba(255,255,255,0.86) inset",
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
                                      aria-label={t("Start time", "Godzina rozpoczęcia")}
                                              style={{
                                                width: "100%",
                                                height: "34px",
                                                padding: "0 10px",
                                                borderRadius: "10px",
                                                border:
                                                  "1px solid rgba(203,213,225,0.9)",
                                                background:
                                                  "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
                                                color: "#0f172a",
                                                fontSize: "12px",
                                                fontWeight: 600,
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
                                                    width: "20px",
                                                    height: "20px",
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
                                                width: "24px",
                                                height: "24px",
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
                                      aria-label={t("Choose a custom event color", "Wybierz własny kolor wydarzenia")}
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
                                      aria-label={t("Confirm calendar entry", "Potwierdź wpis kalendarza")}
                                            style={{
                                              width: "32px",
                                              height: "32px",
                                              flex: "0 0 auto",
                                              borderRadius: "11px",
                                              border:
                                                "1px solid rgba(34,197,94,0.32)",
                                              background:
                                                "linear-gradient(135deg, #16c5b8 0%, #34d26b 100%)",
                                              color: "#ffffff",
                                              display: "grid",
                                              placeItems: "center",
                                              cursor: "pointer",
                                              boxShadow:
                                                "0 12px 24px rgba(22,163,74,0.18)",
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
                                    placeholder={t("Meeting, schedule, reminder...", "Spotkanie, harmonogram, przypomnienie...")}
                                          style={{
                                            width: "100%",
                                            minWidth: "120px",
                                            minHeight: "52px",
                                            padding: "10px 11px",
                                            borderRadius: "12px",
                                            border: "1px solid rgba(203,213,225,0.9)",
                                            background:
                                              "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(248,250,252,0.99) 100%)",
                                            color: "#0f172a",
                                            fontSize: "12px",
                                            fontWeight: 500,
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
                                          minHeight: "34px",
                                          height: "34px",
                                          padding: "0 11px",
                                          borderRadius: "11px",
                                          border:
                                            selectedCalendarEntryId === entry.id
                                              ? "1px solid rgba(15,23,42,0.18)"
                                              : "1px solid rgba(255,255,255,0.12)",
                                          background: getCalendarEntryColor(entry),
                                          color: "#ffffff",
                                          fontSize: "12px",
                                          fontWeight: 600,
                                          lineHeight: 1,
                                          textAlign: "left",
                                          cursor: canUseCalendar
                                            ? "pointer"
                                            : "default",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "6px",
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          boxShadow:
                                            selectedCalendarEntryId === entry.id
                                              ? "0 0 0 2px rgba(37,99,235,0.14), 0 10px 22px rgba(15,23,42,0.12)"
                                              : "0 10px 22px rgba(15,23,42,0.11), 0 1px 0 rgba(255,255,255,0.12) inset",
                                        }}
                                      >
                                        <span
                                          style={{
                                            flex: "0 0 auto",
                                            color: "rgba(255,255,255,0.84)",
                                            fontSize: "10px",
                                            fontWeight: 700,
                                            letterSpacing: "0.03em",
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
                                    {canUseCalendar &&
                                      selectedCalendarEntryId === entry.id &&
                                      editingCalendarEntryId !== entry.id && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removeCalendarEntry(entry.id);
                                          }}
                                      aria-label={t("Remove calendar entry", "Usuń wpis kalendarza")}
                                          style={{
                                            position: "absolute",
                                            top: "-8px",
                                            right: "-8px",
                                            width: "30px",
                                            height: "30px",
                                            borderRadius: "999px",
                                            border: "1px solid rgba(248,113,113,0.32)",
                                            background:
                                              "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(254,242,242,0.99) 100%)",
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
                                  className="scriboo-calendar-add"
                                  type="button"
                                  disabled={!canUseCalendar}
                                  onClick={() =>
                                    createCalendarEntry(
                                      getLocalCalendarDateKey(day.date)
                                    )
                                  }
                                  style={{
                                    height: "34px",
                                    borderRadius: "11px",
                                    border: "none",
                                    background: canUseCalendar
                                      ? "rgba(37,99,235,0.08)"
                                      : "transparent",
                                    color: canUseCalendar ? "#2563eb" : "#64748b",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "6px",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    letterSpacing: "0.01em",
                                    cursor: canUseCalendar
                                      ? "pointer"
                                      : "not-allowed",
                                    opacity: canUseCalendar ? 1 : 0.65,
                                    boxShadow: "none",
                                  }}
                                >
                                  <Plus size={12} />
                                    {canUseCalendar ? t("Add", "Dodaj") : t("Upgrade to edit", "Ulepsz plan, aby edytować")}
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
                              borderRadius: "0",
                              border: "none",
                              background: "transparent",
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
                                {t("No schedules on this calendar yet", "W tym kalendarzu nie ma jeszcze wydarzeń")}
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
                      className="scriboo-board-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(250px, 280px))",
                        gap: "24px",
                        alignContent: "start",
                      }}
                    >
                      {visibleBoards.map((board, index) => {
                        const isActive = board.id === activeBoardId;
                        const isEditing = board.id === editingBoardId;
                        const isInTrash = Boolean(board.deletedAt);
                        const isOwnedBoard = board.ownedByUser !== false;

                        return (
                          <div
                            key={board.id}
                            className={`scriboo-board-card has-real-clip${isActive ? " is-active" : ""}`}
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
                            }}
                          >
                            <div
                              className="scriboo-board-card-preview"
                              style={{
                                height: "180px",
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
                              className="scriboo-board-card-body"
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
                                    display: "grid",
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
                                      className="scriboo-board-card-title"
                                      type="button"
                                      onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        if (isBoardsLoading || isInTrash || !isOwnedBoard)
                                          return;
                                        startRenamingBoard(board);
                                      }}
                                      style={{
                                        padding: 0,
                                        border: "none",
                                        minWidth: 0,
                                        width: "100%",
                                        maxWidth: "100%",
                                        background: "transparent",
                                        color: "#0f172a",
                                        fontSize:
                                          board.name.length > 28
                                            ? "15px"
                                            : board.name.length > 18
                                              ? "17px"
                                              : "19px",
                                        fontWeight: 780,
                                        fontFamily: appSansFontFamily,
                                        lineHeight: 1.15,
                                        textAlign: "left",
                                        overflowWrap: "anywhere",
                                        wordBreak: "break-word",
                                        cursor:
                                          isBoardsLoading ||
                                          isInTrash ||
                                          !isOwnedBoard
                                            ? "default"
                                            : "pointer",
                                      }}
                                      title={
                                        isBoardsLoading || isInTrash || !isOwnedBoard
                                          ? undefined
                                          : "Double-click to rename"
                                      }
                                    >
                                      {board.name || `Board ${index + 1}`}
                                    </button>
                                    <div
                                      className="scriboo-board-card-statuses"
                                      style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: "6px",
                                      }}
                                    >
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
                                          {t("Active board", "Aktywna tablica")}
                                        </div>
                                      )}
                                      {!isOwnedBoard && !isInTrash && (
                                        <div
                                          style={{
                                            width: "fit-content",
                                            height: "24px",
                                            padding: "0 10px",
                                            borderRadius: "999px",
                                            border: "1px solid rgba(16,185,129,0.16)",
                                            background: "rgba(236,253,245,0.92)",
                                            color: "#047857",
                                            display: "flex",
                                            alignItems: "center",
                                            fontSize: "11px",
                                            fontWeight: 600,
                                          }}
                                        >
                                          {t("Shared with you", "Udostępniono Tobie")} · {board.sharePermission === "editor" ? t("Can edit", "Może edytować") : t("View only", "Tylko podgląd")}
                                        </div>
                                      )}
                                      {isOwnedBoard &&
                                        !isInTrash &&
                                        (board.shareCount ?? 0) > 0 && (
                                          <div
                                            style={{
                                              width: "fit-content",
                                              height: "24px",
                                              padding: "0 10px",
                                              borderRadius: "999px",
                                              border:
                                                "1px solid rgba(99,102,241,0.16)",
                                              background:
                                                "rgba(238,242,255,0.92)",
                                              color: "#4f46e5",
                                              display: "flex",
                                              alignItems: "center",
                                              fontSize: "11px",
                                              fontWeight: 600,
                                            }}
                                          >
                                            {t("Shared with", "Udostępniono")}{" "}{board.shareCount}
                                          </div>
                                        )}
                                    </div>
                                  </div>
                                  {!isInTrash && (
                                    <div
                                      className="scriboo-board-card-actions"
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        flexWrap: "wrap",
                                        justifyContent: "flex-end",
                                        width: "100%",
                                      }}
                                    >
                                      <button
                                        type="button"
                                        aria-label={`Export ${board.name}`}
                                        title={t("Export board", "Eksportuj tablicę")}
                                        disabled={isBoardsLoading}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setExportingBoard(board);
                                          setBoardExportMessage("");
                                        }}
                                        style={{
                                          width: "32px",
                                          height: "32px",
                                          borderRadius: "10px",
                                          border: "1px solid rgba(16,185,129,0.18)",
                                          background: "#ffffff",
                                          color: "#059669",
                                          display: "grid",
                                          placeItems: "center",
                                          cursor: isBoardsLoading ? "default" : "pointer",
                                          padding: 0,
                                        }}
                                      >
                                        <Download size={15} />
                                      </button>
                                      {isOwnedBoard && (
                                        <>
                                          <button
                                            type="button"
                                            aria-label={`Version history for ${board.name}`}
                                      title={t("Version history", "Historia wersji")}
                                            disabled={isBoardsLoading}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openVersionHistory(board).catch(() => null);
                                            }}
                                            style={{
                                              width: "32px",
                                              height: "32px",
                                              borderRadius: "10px",
                                              border:
                                                "1px solid rgba(14,165,233,0.18)",
                                              background: "#ffffff",
                                              color: "#0284c7",
                                              display: "grid",
                                              placeItems: "center",
                                              cursor:
                                                isBoardsLoading ? "default" : "pointer",
                                              padding: 0,
                                            }}
                                          >
                                            <History size={15} />
                                          </button>
                                          <button
                                            type="button"
                                            aria-label={`Share ${board.name}`}
                                            disabled={isBoardsLoading}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openSharePanel(board).catch(() => null);
                                            }}
                                            style={{
                                              width: "32px",
                                              height: "32px",
                                              borderRadius: "10px",
                                              border:
                                                "1px solid rgba(99,102,241,0.18)",
                                              background: "#ffffff",
                                              color: "#4f46e5",
                                              display: "grid",
                                              placeItems: "center",
                                              cursor:
                                                isBoardsLoading ? "default" : "pointer",
                                              padding: 0,
                                            }}
                                          >
                                            <Share2 size={15} />
                                          </button>
                                          <button
                                            type="button"
                                            aria-label={`${
                                              board.starred ? "Remove" : "Add"
                                            } ${board.name} ${
                                              board.starred ? "from" : "to"
                                            } starred`}
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
                                              color: board.starred
                                                ? "#f59e0b"
                                                : "#64748b",
                                              display: "grid",
                                              placeItems: "center",
                                              cursor:
                                                isBoardsLoading ? "default" : "pointer",
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
                                              border:
                                                "1px solid rgba(239,68,68,0.16)",
                                              background: "#ffffff",
                                              color: "#dc2626",
                                              display: "grid",
                                              placeItems: "center",
                                              cursor:
                                                isBoardsLoading ? "default" : "pointer",
                                              padding: 0,
                                            }}
                                          >
                                            <Trash2 size={15} />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {isInTrash && isOwnedBoard && (
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "8px",
                                  }}
                                >
                                  <button
                                    type="button"
                                    disabled={isBoardsLoading}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      restoreBoardFromTrash(board).catch(() => null);
                                    }}
                                    style={{
                                      height: "36px",
                                      borderRadius: "11px",
                                      border: "1px solid rgba(16,185,129,0.22)",
                                      background: "rgba(236,253,245,0.9)",
                                      color: "#047857",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      gap: "7px",
                                      fontFamily: appSansFontFamily,
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      cursor: isBoardsLoading ? "default" : "pointer",
                                    }}
                                  >
                                    <RefreshCw size={14} />
                                                {t("Restore", "Przywróć")}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBoardsLoading}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      permanentlyDeleteBoard(board).catch(() => null);
                                    }}
                                    style={{
                                      height: "36px",
                                      borderRadius: "11px",
                                      border: "1px solid rgba(239,68,68,0.2)",
                                      background: "rgba(254,242,242,0.9)",
                                      color: "#b91c1c",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      gap: "7px",
                                      fontFamily: appSansFontFamily,
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      cursor: isBoardsLoading ? "default" : "pointer",
                                    }}
                                  >
                                    <Trash2 size={14} />
                                                {t("Delete forever", "Usuń na zawsze")}
                                  </button>
                                </div>
                              )}

                              <div
                                className="scriboo-board-card-footer"
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
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "7px",
                                  }}
                                >
                                  <CalendarDays size={14} />
                                  {formatBoardDate(board.updatedAt)}
                                </span>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "5px",
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
                                    : <>{t("Open now", "Otwórz teraz")} <ArrowRight size={14} /></>}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {visibleBoards.length === 0 && (
                        <div
                          className="scriboo-workspace-empty"
                          style={{
                            gridColumn: "1 / -1",
                            minHeight: "260px",
                            borderRadius: "0",
                            border: "none",
                            background: "transparent",
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
                              {t("No boards match that search", "Brak tablic pasujących do wyszukiwania")}
                            </div>
                            <div
                              style={{
                                marginTop: "8px",
                                color: "#64748b",
                                fontSize: "14px",
                                lineHeight: 1.5,
                              }}
                            >
                              {t("Try another name, or create a new board for a fresh project.", "Spróbuj innej nazwy lub utwórz nową tablicę dla nowego projektu.")}
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
              className="scriboo-settings-panel"
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
                className="scriboo-settings-sidebar"
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
                  {t("Settings", "Ustawienia")}
                </div>

                <nav style={{ display: "grid", gap: "8px" }}>
                  {[
                    { id: "background", label: t("Background & appearance", "Tło i wygląd") },
                    { id: "language", label: t("Languages", "Języki") },
                    { id: "account", label: t("Account", "Konto") },
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
                        ) : item.id === "language" ? (
                          <Languages size={18} />
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
                className="scriboo-settings-main"
                style={{
                  position: "relative",
                  padding: "56px 36px 34px",
                  overflowY: "auto",
                }}
              >
                <button
                  aria-label={t("Close settings", "Zamknij ustawienia")}
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
                      {t("Background & appearance", "Tło i wygląd")}
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
                      {t("Board background", "Tło tablicy")}
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
                        aria-label={t("Choose a custom background color", "Wybierz własny kolor tła")}
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
                          label: "Neon",
                          value: neonCanvasBackground,
                          preview:
                            "radial-gradient(circle at 25% 20%, #7c3aed 0%, rgba(124,58,237,0.28) 28%, transparent 52%), radial-gradient(circle at 78% 76%, rgba(34,211,238,0.72), transparent 46%), #070816",
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
                              if (option.value === neonCanvasBackground) {
                                setPenColor("#39ffef");
                              }
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
                        {t("Grid mode", "Tryb siatki")}
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
                            label: t("None", "Brak"),
                            value: "none",
                            spacing: 0,
                          },
                          {
                            label: t("Dots", "Kropki"),
                            value: "dots",
                            spacing: 18,
                          },
                          {
                            label: t("Small", "Mała"),
                            value: "small",
                            spacing: 13,
                          },
                          {
                            label: "Standard",
                            value: "standard",
                            spacing: 20,
                          },
                          {
                            label: t("Large", "Duża"),
                            value: "large",
                            spacing: 32,
                          },
                        ].map((option) => {
                          const isActive = gridMode === option.value;
                          const previewBackground =
                            option.value === "none"
                              ? "linear-gradient(135deg, rgba(148,163,184,0.12), rgba(148,163,184,0.04))"
                              : option.value === "dots"
                              ? "radial-gradient(circle, rgba(100,116,139,0.48) 1.35px, transparent 1.55px)"
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
                          <span>{t("Grid opacity", "Przezroczystość siatki")}</span>
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

                {activeSettingsSection === "language" && (
                  <>
                    <h2
                      style={{
                        margin: "0 0 10px",
                        fontSize: "24px",
                        fontWeight: 700,
                        letterSpacing: "0",
                        lineHeight: 1.15,
                      }}
                    >
                      {t("Languages", "Języki")}
                    </h2>
                    <p
                      style={{
                        margin: "0 0 24px",
                        color: "#94a3b8",
                        fontSize: "14px",
                        lineHeight: 1.5,
                      }}
                    >
                      {t(
                        "Choose the language used throughout Scriboo.",
                        "Wybierz język używany w całym Scriboo."
                      )}
                    </p>
                    <div style={{ display: "grid", gap: "12px", maxWidth: "420px" }}>
                      {([
                        { value: "en" as const, label: "English" },
                        { value: "pl" as const, label: "Polski" },
                      ]).map((option) => {
                        const isActive = language === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setLanguage(option.value)}
                            aria-pressed={isActive}
                            style={{
                              minHeight: "66px",
                              padding: "0 18px",
                              borderRadius: "12px",
                              border: `1px solid ${
                                isActive ? "#7c3aed" : panelBorderColor
                              }`,
                              background: isActive
                                ? selectedControlBackground
                                : controlBackground,
                              color: panelTextColor,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              textAlign: "left",
                              cursor: "pointer",
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  width: "34px",
                                  height: "24px",
                                  borderRadius: "6px",
                                  border: "1px solid rgba(148,163,184,0.3)",
                                  background: "#ffffff",
                                  display: "grid",
                                  placeItems: "center",
                                  overflow: "hidden",
                                  boxShadow:
                                    "0 3px 9px rgba(15,23,42,0.1)",
                                  flex: "0 0 auto",
                                }}
                              >
                                {option.value === "en" ? (
                                  <svg
                                    viewBox="0 0 60 40"
                                    width="34"
                                    height="24"
                                    focusable="false"
                                  >
                                    <rect width="60" height="40" fill="#21468b" />
                                    <path d="M0 0 60 40M60 0 0 40" stroke="#fff" strokeWidth="9" />
                                    <path d="M0 0 60 40M60 0 0 40" stroke="#cf142b" strokeWidth="4" />
                                    <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="13" />
                                    <path d="M30 0v40M0 20h60" stroke="#cf142b" strokeWidth="7" />
                                  </svg>
                                ) : (
                                  <svg
                                    viewBox="0 0 60 40"
                                    width="34"
                                    height="24"
                                    focusable="false"
                                  >
                                    <rect width="60" height="20" fill="#fff" />
                                    <rect y="20" width="60" height="20" fill="#dc143c" />
                                  </svg>
                                )}
                              </span>
                              <span style={{ display: "grid", gap: "5px" }}>
                                <span style={{ fontSize: "15px", fontWeight: 700 }}>
                                  {option.label}
                                </span>
                                <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                                  {option.value === "en"
                                    ? t("Interface in English", "Interfejs w języku angielskim")
                                    : t("Interface in Polish", "Interfejs w języku polskim")}
                                </span>
                              </span>
                            </span>
                            {isActive && <Check size={19} />}
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
                      {t("Account", "Konto")}
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
                          {t("Signed in as", "Zalogowano jako")}
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
                          {t("Workspace plan", "Plan przestrzeni roboczej")}
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
                          type="button"
                          onClick={() => window.location.assign("/account-settings")}
                          style={{
                            width: "220px",
                            height: "42px",
                            borderRadius: "10px",
                            border: `1px solid ${panelBorderColor}`,
                            background: controlBackground,
                            color: panelTextColor,
                            fontSize: "14px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {t("Account & security", "Konto i bezpieczeństwo")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadAccountData()}
                          disabled={isExportingAccountData}
                          style={{
                            width: "220px",
                            height: "42px",
                            borderRadius: "10px",
                            border: `1px solid ${panelBorderColor}`,
                            background: controlBackground,
                            color: panelTextColor,
                            fontSize: "14px",
                            fontWeight: 700,
                            cursor: isExportingAccountData ? "default" : "pointer",
                            opacity: isExportingAccountData ? 0.72 : 1,
                          }}
                        >
                          {isExportingAccountData
                            ? t("Preparing export...", "Przygotowywanie eksportu...")
                            : t("Download my data", "Pobierz moje dane")}
                        </button>
                        <div
                          style={{
                            color: "#64748b",
                            fontSize: "12px",
                            lineHeight: 1.5,
                            maxWidth: "320px",
                          }}
                        >
                          {t(
                            "Download a JSON export with your account details, owned boards and board content, calendar entries, sharing records, and subscription information.",
                            "Pobierz eksport JSON zawierający dane konta, własne tablice i ich zawartość, wpisy kalendarza, udostępnienia oraz informacje o subskrypcji."
                          )}
                        </div>
                        {accountExportError && (
                          <div
                            role="alert"
                            style={{
                              padding: "10px 12px",
                              borderRadius: "10px",
                              background: "#fef2f2",
                              color: "#b91c1c",
                              fontSize: "13px",
                              fontWeight: 700,
                              lineHeight: 1.45,
                              maxWidth: "320px",
                            }}
                          >
                            {accountExportError}
                          </div>
                        )}
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
                          {t("Log out", "Wyloguj się")}
                        </button>
                        <div
                          style={{
                            marginTop: "10px",
                            paddingTop: "18px",
                            borderTop: "1px solid rgba(239,68,68,0.2)",
                            display: "grid",
                            gap: "10px",
                          }}
                        >
                          <div
                            style={{
                              color: "#991b1b",
                              fontSize: "14px",
                              fontWeight: 800,
                            }}
                          >
                            {t("Danger zone", "Strefa niebezpieczna")}
                          </div>
                          <div
                            style={{
                              color: "#64748b",
                              fontSize: "12px",
                              lineHeight: 1.5,
                            }}
                          >
                            {t(
                              "Permanently delete your account, boards, calendar entries, and sharing access.",
                              "Trwale usuń konto, tablice, wpisy kalendarza i dostęp do udostępnień."
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteAccountError("");
                              setShowDeleteAccountModal(true);
                            }}
                            style={{
                              width: "220px",
                              height: "42px",
                              borderRadius: "10px",
                              border: "1px solid rgba(220,38,38,0.35)",
                              background: "rgba(254,242,242,0.9)",
                              color: "#b91c1c",
                              fontSize: "14px",
                              fontWeight: 750,
                              cursor: "pointer",
                            }}
                          >
                            {t("Delete account", "Usuń konto")}
                          </button>
                        </div>
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
                          signatureIndigoButtonGradient,
                        color: "#ffffff",
                        fontSize: "14px",
                        fontWeight: 650,
                        cursor: "pointer",
                      }}
                    >
                      {t("Log in", "Zaloguj się")}
                    </button>
                  </>
                )}
              </main>
            </div>
          </div>
        )}

        {showDeleteAccountModal && (
          <div
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeDeleteAccountModal();
              }
            }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 180,
              display: "grid",
              placeItems: "center",
              padding: "20px",
              background: "rgba(15,23,42,0.56)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div
              className="scriboo-theme-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-account-title"
              onMouseDown={(event) => event.stopPropagation()}
              style={{
                width: "min(480px, calc(100vw - 32px))",
                padding: "24px",
                borderRadius: "18px",
                border: "1px solid rgba(239,68,68,0.22)",
                background: "#ffffff",
                color: "#0f172a",
                boxShadow: "0 30px 90px rgba(15,23,42,0.32)",
                display: "grid",
                gap: "16px",
                fontFamily: appSansFontFamily,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "start",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <div>
                  <div
                    id="delete-account-title"
                    style={{
                      color: "#991b1b",
                      fontSize: "22px",
                      fontWeight: 800,
                    }}
                  >
                {t("Permanently delete account?", "Trwale usunąć konto?")}
                  </div>
                  <div
                    style={{
                      marginTop: "7px",
                      color: "#64748b",
                      fontSize: "13px",
                      lineHeight: 1.55,
                    }}
                  >
                {t("This action cannot be undone.", "Tej operacji nie można cofnąć.")}
                  </div>
                </div>
                <button
                  type="button"
                aria-label={t("Close account deletion confirmation", "Zamknij potwierdzenie usunięcia konta")}
                  onClick={closeDeleteAccountModal}
                  disabled={isDeletingAccount}
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    color: "#334155",
                    display: "grid",
                    placeItems: "center",
                    cursor: isDeletingAccount ? "default" : "pointer",
                  }}
                >
                  <X size={17} />
                </button>
              </div>

              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "1px solid rgba(239,68,68,0.2)",
                  background: "#fef2f2",
                  color: "#7f1d1d",
                  fontSize: "13px",
                  lineHeight: 1.6,
                }}
              >
                <strong>{t("This will permanently remove:", "Zostaną trwale usunięte:")}</strong>
                <ul style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
                  <li>{t("Your profile and sign-in access", "Twój profil i dostęp do logowania")}</li>
                  <li>{t("All boards and calendar entries", "Wszystkie tablice i wpisy kalendarza")}</li>
                  <li>{t("All board invitations and sharing access", "Wszystkie zaproszenia i udostępnienia")}</li>
                  <li>{t("Your active subscription, which will be cancelled now", "Aktywna subskrypcja, która zostanie teraz anulowana")}</li>
                </ul>
                <div style={{ marginTop: "9px" }}>
                  Required billing records may remain with Stripe for accounting
                  and legal compliance. A confirmation will be emailed to{" "}
                  <strong>{currentAccountEmail}</strong>.
                </div>
              </div>

              <label
                style={{
                  display: "grid",
                  gap: "7px",
                  color: "#334155",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                  {t("Password", "Hasło")}
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deleteAccountPassword}
                  onChange={(event) =>
                    setDeleteAccountPassword(event.currentTarget.value)
                  }
                  disabled={isDeletingAccount}
                  style={{
                    height: "44px",
                    padding: "0 12px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    color: "#0f172a",
                    fontSize: "15px",
                    outlineColor: "#dc2626",
                  }}
                />
              </label>

              <label
                style={{
                  display: "grid",
                  gap: "7px",
                  color: "#334155",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                  {t("Type DELETE to confirm", "Wpisz DELETE, aby potwierdzić")}
                <input
                  type="text"
                  autoComplete="off"
                  value={deleteAccountConfirmation}
                  onChange={(event) =>
                    setDeleteAccountConfirmation(event.currentTarget.value)
                  }
                  disabled={isDeletingAccount}
                  style={{
                    height: "44px",
                    padding: "0 12px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    color: "#0f172a",
                    fontSize: "15px",
                    fontWeight: 700,
                    outlineColor: "#dc2626",
                  }}
                />
              </label>

              {deleteAccountError && (
                <div
                  role="alert"
                  style={{
                    padding: "10px 12px",
                    borderRadius: "10px",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    fontSize: "13px",
                    fontWeight: 700,
                    lineHeight: 1.45,
                  }}
                >
                  {deleteAccountError}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={closeDeleteAccountModal}
                  disabled={isDeletingAccount}
                  style={{
                    height: "42px",
                    padding: "0 16px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#334155",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: isDeletingAccount ? "default" : "pointer",
                  }}
                >
                  {t("Keep my account", "Zachowaj moje konto")}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteAccount()}
                  disabled={
                    isDeletingAccount ||
                    !deleteAccountPassword ||
                    deleteAccountConfirmation.trim() !== "DELETE"
                  }
                  style={{
                    height: "42px",
                    padding: "0 16px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#dc2626",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 800,
                    cursor:
                      isDeletingAccount ||
                      !deleteAccountPassword ||
                      deleteAccountConfirmation.trim() !== "DELETE"
                        ? "default"
                        : "pointer",
                    opacity:
                      isDeletingAccount ||
                      !deleteAccountPassword ||
                      deleteAccountConfirmation.trim() !== "DELETE"
                        ? 0.55
                        : 1,
                  }}
                >
                  {isDeletingAccount
                    ? "Deleting account..."
                    : "Permanently delete account"}
                </button>
              </div>
            </div>
          </div>
        )}

        {currentAccountEmail && activeBoard && !showBoardsMenu && (
          <div
            aria-label={t("Current board", "Bieżąca tablica")}
            style={{
              position: "absolute",
              top: `calc(100% + 10px)`,
              left: "14px",
              width: "min(320px, calc(100vw - 28px))",
              boxSizing: "border-box",
              height: "46px",
              padding: "0 12px 0 8px",
              borderRadius: "14px",
              background: "rgba(255,255,255,0.97)",
              border: "1px solid #d7dce5",
              boxShadow: "0 8px 22px rgba(15,23,42,0.1)",
              color: "#1f2937",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              zIndex: 3,
            }}
          >
            <button
              type="button"
              aria-label={t("Back to all boards", "Wróć do wszystkich tablic")}
              title={t("All boards", "Wszystkie tablice")}
              onClick={() => {
                setBoardBrowserView("all");
                setShowBoardsMenu(true);
                setShowSettingsMenu(false);
                setShowProfileMenu(false);
              }}
              style={{
                width: "26px",
                height: "26px",
                border: "none",
                background: "transparent",
                color: "#475569",
                display: "grid",
                placeItems: "center",
                padding: 0,
                cursor: "pointer",
                flex: "0 0 auto",
              }}
            >
              <ChevronLeft size={20} />
            </button>
            <span
              aria-hidden="true"
              style={{
                width: "1px",
                height: "24px",
                background: "#d7dce5",
                flex: "0 0 auto",
              }}
            />
            {editingBoardId === activeBoard.id ? (
              <input
                ref={boardNameInputRef}
                value={editingBoardName}
                maxLength={40}
                disabled={isBoardsLoading}
                aria-label={t("Rename board", "Zmień nazwę tablicy")}
                onChange={(event) => setEditingBoardName(event.currentTarget.value)}
                onBlur={() => void renameBoard(activeBoard.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    setEditingBoardId("");
                    setEditingBoardName("");
                  }
                }}
                style={{
                  minWidth: 0,
                  width: "100%",
                  height: "30px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  background: "#f8fafc",
                  color: "#0f172a",
                  padding: "0 8px",
                  outline: "none",
                  fontFamily: appSansFontFamily,
                  fontSize: "14px",
                  fontWeight: 620,
                }}
              />
            ) : (
              <button
                type="button"
                disabled={activeBoard.ownedByUser === false || isBoardsLoading}
                aria-label={
                  activeBoard.ownedByUser === false
                    ? activeBoard.name
                    : t(`Rename ${activeBoard.name}`, `Zmień nazwę ${activeBoard.name}`)
                }
                title={
                  activeBoard.ownedByUser === false
                    ? activeBoard.name
                    : t("Click to rename", "Kliknij, aby zmienić nazwę")
                }
                onClick={() => startRenamingBoard(activeBoard)}
                style={{
                  minWidth: 0,
                  flex: "1 1 auto",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  border: "none",
                  background: "transparent",
                  color: "#1f2937",
                  padding: 0,
                  fontFamily: appSansFontFamily,
                  fontSize: "14px",
                  fontWeight: 620,
                  textAlign: "left",
                  cursor:
                    activeBoard.ownedByUser === false || isBoardsLoading
                      ? "default"
                      : "text",
                }}
              >
                {activeBoard.name}
              </button>
            )}
          </div>
        )}

        {currentAccountEmail && activeBoardId && (
          <div
            aria-live="polite"
            aria-label={
              boardSaveState === "offline" || !isOnline
                ? "Offline. Changes will save after reconnecting."
                : boardSaveState === "conflict"
                  ? "This board changed elsewhere. Reload before editing further."
                  : boardSaveState === "error"
                  ? "Save failed. Retry saving."
                  : boardSaveState === "saving"
                    ? "Saving board."
                    : boardSaveState === "dirty"
                      ? "Board has unsaved changes."
                      : "Board saved."
            }
            style={{
              position: "absolute",
              top: "50%",
              left: "202px",
              transform: "translateY(-50%)",
              minHeight: "30px",
              padding: "0 10px",
              borderRadius: "999px",
              border: "none",
              background: "transparent",
              color: "#ffffff",
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              fontSize: "12px",
              fontWeight: 700,
              backdropFilter: "none",
              boxShadow: "none",
            }}
          >
            {boardSaveState === "offline" || !isOnline ? (
              <CloudOff size={14} />
            ) : boardSaveState === "error" || boardSaveState === "conflict" ? (
              <AlertTriangle size={14} />
            ) : boardSaveState === "saving" ? (
              <RefreshCw size={14} />
            ) : boardSaveState === "saved" ? (
              <CheckCircle2 size={14} />
            ) : (
              <RefreshCw size={14} />
            )}

            {(boardSaveState === "offline" ||
              !isOnline ||
              boardSaveState === "conflict" ||
              boardSaveState === "error") && (
              <span style={{ whiteSpace: "nowrap" }}>
                {boardSaveState === "offline" || !isOnline
                  ? "Offline — changes not saved"
                  : boardSaveState === "conflict"
                    ? "Newer board found"
                    : "Save failed"}
              </span>
            )}

            {(boardSaveState === "error" ||
              boardSaveState === "conflict" ||
              boardSaveState === "offline" ||
              !isOnline) && (
              <button
                type="button"
                disabled={!isOnline}
                onClick={async () => {
                  if (boardSaveState === "conflict") {
                    const reload = await requestConfirmation({
                      title: t("Load the newer board?", "Wczytać nowszą tablicę?"),
                      message: t(
                        "The outdated unsaved changes in this window will be discarded. The newer saved board will remain safe.",
                        "Nieaktualne, niezapisane zmiany w tym oknie zostaną odrzucone. Nowsza zapisana tablica pozostanie bezpieczna."
                      ),
                      confirmLabel: t("Load newer board", "Wczytaj nowszą tablicę"),
                    });
                    if (reload) loadBoards().catch(() => null);
                    return;
                  }
                  persistBoard(activeBoardId).catch(() => null);
                }}
                style={{
                  height: "22px",
                  padding: "0 8px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.44)",
                  background: "rgba(255,255,255,0.14)",
                  color: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  fontWeight: 800,
                  cursor: isOnline ? "pointer" : "default",
                  opacity: isOnline ? 1 : 0.62,
                }}
              >
                <RefreshCw size={11} />
                {boardSaveState === "conflict"
                  ? t("Reload", "Wczytaj ponownie")
                  : t("Retry", "Spróbuj ponownie")}
              </button>
            )}

            <span
              aria-hidden="true"
              style={{
                width: "1px",
                height: "18px",
                margin: "0 2px",
                background: "rgba(255,255,255,0.28)",
              }}
            />
            <button
              type="button"
              aria-label={t("Undo last change", "Cofnij ostatnią zmianę")}
              title={t("Undo", "Cofnij")}
              disabled={undoDepth === 0}
              onClick={undoCanvasChange}
              style={{
                width: "28px",
                height: "28px",
                padding: 0,
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                cursor: undoDepth > 0 ? "pointer" : "default",
                opacity: undoDepth > 0 ? 0.96 : 0.38,
                transition: "background 0.18s ease, opacity 0.18s ease",
              }}
            >
              <Undo2 size={17} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              aria-label={t("Redo last change", "Ponów ostatnią zmianę")}
              title={t("Redo", "Ponów")}
              disabled={redoDepth === 0}
              onClick={redoCanvasChange}
              style={{
                width: "28px",
                height: "28px",
                padding: 0,
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                cursor: redoDepth > 0 ? "pointer" : "default",
                opacity: redoDepth > 0 ? 0.96 : 0.38,
                transition: "background 0.18s ease, opacity 0.18s ease",
              }}
            >
              <Redo2 size={17} strokeWidth={2.2} />
            </button>
          </div>
        )}

        <SupportChatbot
          open={showSupportChat}
          onOpen={() => setShowSupportChat(true)}
          onClose={() => setShowSupportChat(false)}
        />

        {currentAccountEmail && (
          <div
            ref={profileMenuContainerRef}
            style={{
              position: "absolute",
              top: "50%",
              right: "16px",
              transform: "translateY(-50%)",
              display: "block",
            }}
          >
            <button
              type="button"
              onClick={() => setShowProfileMenu((previous) => !previous)}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "999px",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                background: "transparent",
                border: "none",
                padding: 0,
                lineHeight: 0,
                outline: "none",
                boxShadow: "none",
                appearance: "none",
                cursor: "pointer",
              }}
              aria-label={`Logged in as ${currentAccountEmail}`}
              title={currentAccountEmail}
            >
              <UserRound size={18} />
            </button>
            {showProfileMenu && (
              <div
                className="scriboo-account-popover"
                style={{
                  position: "absolute",
                  top: "calc(100% + 10px)",
                  right: 0,
                  width: "min(280px, calc(100vw - 24px))",
                  boxSizing: "border-box",
                  padding: "18px",
                  borderRadius: "24px",
                  border: "1px solid rgba(214,222,239,0.92)",
                  background:
                    "radial-gradient(circle at 18% 8%, rgba(124,58,237,0.08), transparent 34%), radial-gradient(circle at 92% 88%, rgba(74,222,128,0.09), transparent 38%), linear-gradient(145deg, rgba(255,255,255,0.99), rgba(250,252,255,0.975))",
                  boxShadow:
                    "0 32px 75px rgba(66,73,120,0.19), 0 1px 0 rgba(255,255,255,0.96) inset",
                  backdropFilter: "blur(22px)",
                  overflow: "hidden",
                  backgroundClip: "padding-box",
                  display: "grid",
                  gap: "13px",
                  fontFamily: accountPanelFontFamily,
                  textRendering: "optimizeLegibility",
                  WebkitFontSmoothing: "antialiased",
                  MozOsxFontSmoothing: "grayscale",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "54px minmax(0, 1fr)",
                    alignItems: "center",
                    gap: "13px",
                  }}
                >
                  <div
                    className="scriboo-account-avatar"
                    style={{
                      width: "54px",
                      height: "54px",
                      borderRadius: "17px",
                      border: "2px solid rgba(255,255,255,0.94)",
                      background:
                        "linear-gradient(145deg, rgba(242,238,255,0.98), rgba(218,213,255,0.94))",
                      boxShadow:
                        "0 15px 32px rgba(116,71,232,0.16), 0 1px 0 rgba(255,255,255,0.95) inset",
                      color: "#7048e8",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <UserRound size={26} strokeWidth={1.8} />
                  </div>
                  <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
                    <div
                      style={{
                        color: "#7779b9",
                        fontSize: "9px",
                        fontWeight: 750,
                        letterSpacing: "0.26em",
                        textTransform: "uppercase",
                      }}
                    >
                      {t("Account", "Konto")}
                    </div>
                    <div
                      style={{
                        color: "#0f172a",
                        fontSize: "18px",
                        fontWeight: 750,
                        lineHeight: 1.05,
                        letterSpacing: "-0.035em",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {currentAccountName || currentAccountEmail}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    height: "1px",
                    background:
                      "linear-gradient(90deg, rgba(199,210,254,0.95), rgba(219,234,254,0.7))",
                  }}
                />
                <div
                  style={{
                    color: "#667085",
                    fontSize: "12px",
                    fontWeight: 520,
                    lineHeight: 1.4,
                    letterSpacing: "0.002em",
                    wordBreak: "break-word",
                  }}
                >
                  {currentAccountEmail}
                </div>
                <div
                  className="scriboo-plan-chip"
                  style={{
                    justifySelf: "start",
                    height: "32px",
                    padding: "0 14px",
                    borderRadius: "999px",
                    border: "1px solid rgba(196,181,253,0.8)",
                    background:
                      "linear-gradient(180deg, rgba(250,248,255,0.98), rgba(242,239,255,0.98))",
                    color: "#6d28d9",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "10px",
                    fontWeight: 750,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    boxShadow: "0 1px 0 rgba(255,255,255,0.82) inset",
                  }}
                >
                      <Crown size={14} fill="currentColor" strokeWidth={1.7} />
                      {currentPlanLabel} {t("plan", "plan")}
                </div>
                <button
                  className="scriboo-theme-toggle"
                  type="button"
                  onClick={() => setIsInterfaceDarkMode((previous) => !previous)}
                  aria-label={
                    isInterfaceDarkMode
                      ? t("Use light mode", "Włącz jasny motyw")
                      : t("Use dark mode", "Włącz ciemny motyw")
                  }
                  style={{
                    height: "42px",
                    padding: "0 14px",
                    borderRadius: "13px",
                    border: "1px solid rgba(196,181,253,0.62)",
                    background: "rgba(124,58,237,0.07)",
                    color: "#5b3fd1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "9px" }}>
                    {isInterfaceDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                    {isInterfaceDarkMode
                      ? t("Light mode", "Jasny motyw")
                      : t("Dark mode", "Ciemny motyw")}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      width: "34px",
                      height: "20px",
                      padding: "2px",
                      borderRadius: "999px",
                      background: isInterfaceDarkMode ? "#7c3aed" : "#cbd5e1",
                      display: "flex",
                      justifyContent: isInterfaceDarkMode ? "flex-end" : "flex-start",
                      boxSizing: "border-box",
                    }}
                  >
                    <span
                      style={{
                        width: "16px",
                        height: "16px",
                        borderRadius: "999px",
                        background: "#ffffff",
                        boxShadow: "0 1px 4px rgba(15,23,42,0.25)",
                      }}
                    />
                  </span>
                </button>
                <button
                  className="scriboo-logout-button"
                  type="button"
                  onClick={signOut}
                  style={{
                    marginTop: "3px",
                    height: "48px",
                    padding: "0 17px",
                    borderRadius: "14px",
                    border: "1px solid rgba(255,255,255,0.45)",
                    background:
                      "linear-gradient(100deg, #7b4ded 0%, #5d8de5 48%, #68cf77 100%)",
                    color: "#ffffff",
                    display: "grid",
                    gridTemplateColumns: "24px 1fr 24px",
                    alignItems: "center",
                    fontSize: "15px",
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    boxShadow:
                      "0 18px 34px rgba(92,105,210,0.28), 0 1px 0 rgba(255,255,255,0.28) inset",
                    cursor: "pointer",
                    transition: "transform 160ms ease, box-shadow 160ms ease, filter 160ms ease",
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.transform = "translateY(-2px)";
                    event.currentTarget.style.filter = "saturate(1.08)";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.transform = "translateY(0)";
                    event.currentTarget.style.filter = "none";
                  }}
                >
                    <LogOut size={20} strokeWidth={2} />
                    <span>{t("Log out", "Wyloguj się")}</span>
                    <span aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}

        {exportingBoard && (
          <div
            data-board-browser-layer="true"
            onClick={() => {
              if (isBoardExporting) return;
              setExportingBoard(null);
              setBoardExportMessage("");
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.4)",
              display: "grid",
              placeItems: "center",
              padding: "20px",
              zIndex: 175,
            }}
          >
            <div
              className="scriboo-theme-dialog"
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "min(620px, 100%)",
                borderRadius: "24px",
                border: "1px solid rgba(203,213,225,0.9)",
                background: "#ffffff",
                boxShadow: "0 30px 90px rgba(15,23,42,0.24)",
                padding: "24px",
                display: "grid",
                gap: "18px",
                fontFamily: appSansFontFamily,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <div style={{ display: "grid", gap: "7px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      color: "#0f172a",
                      fontSize: "22px",
                      fontWeight: 780,
                    }}
                  >
                    <Download size={22} color="#059669" />
                {t("Export board", "Eksportuj tablicę")}
                  </div>
                  <div style={{ color: "#475569", fontSize: "13px", lineHeight: 1.5 }}>
                    {t("Download", "Pobierz")} <strong>{exportingBoard.name}</strong> {t("in the format you need. Your original board stays unchanged.", "w wybranym formacie. Oryginalna tablica pozostanie bez zmian.")}
                  </div>
                </div>
                <button
                  type="button"
              aria-label={t("Close board export", "Zamknij eksport tablicy")}
                  disabled={isBoardExporting}
                  onClick={() => {
                    setExportingBoard(null);
                    setBoardExportMessage("");
                  }}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "12px",
                    border: "1px solid rgba(203,213,225,0.9)",
                    background: "#ffffff",
                    color: "#334155",
                    display: "grid",
                    placeItems: "center",
                    cursor: isBoardExporting ? "default" : "pointer",
                    padding: 0,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "10px",
                }}
              >
                {[
                  {
                    title: "PNG image",
                    description: "Share the board as a clear image.",
                    accent: "#2563eb",
                    action: () => exportBoardAsPng(exportingBoard),
                  },
                  {
                    title: "PDF document",
                    description: "Print it or use it in a presentation.",
                    accent: "#7c3aed",
                    action: () => exportBoardAsPdf(exportingBoard),
                  },
                  {
                    title: "Scriboo JSON",
                    description: "A machine-readable, editable board backup.",
                    accent: "#0891b2",
                    action: () => exportBoardAsJson(exportingBoard),
                  },
                  {
                    title: "Calendar (.ics)",
                    description: "Open entries in Google, Apple or Outlook Calendar.",
                    accent: "#059669",
                    action: () => exportBoardCalendar(exportingBoard),
                  },
                ].map((option) => (
                  <button
                    key={option.title}
                    type="button"
                    disabled={isBoardExporting}
                    onClick={() => option.action()}
                    style={{
                      minHeight: "112px",
                      borderRadius: "16px",
                      border: `1px solid ${option.accent}2e`,
                      background: `${option.accent}0d`,
                      color: "#0f172a",
                      padding: "16px",
                      display: "grid",
                      alignContent: "center",
                      gap: "7px",
                      textAlign: "left",
                      fontFamily: appSansFontFamily,
                      cursor: isBoardExporting ? "default" : "pointer",
                      opacity: isBoardExporting ? 0.62 : 1,
                    }}
                  >
                    <span style={{ color: option.accent, fontSize: "14px", fontWeight: 760 }}>
                      {option.title}
                    </span>
                    <span style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.45 }}>
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>

              {boardExportMessage && (
                <div
                  style={{
                    borderRadius: "12px",
                    border: "1px solid rgba(16,185,129,0.16)",
                    background: "rgba(236,253,245,0.86)",
                    color: "#047857",
                    padding: "11px 13px",
                    fontSize: "13px",
                    fontWeight: 650,
                  }}
                >
                  {boardExportMessage}
                </div>
              )}
            </div>
          </div>
        )}

        {versionHistoryBoard && (
          <div
            data-board-browser-layer="true"
            onClick={() => {
              if (isVersionHistoryLoading) return;
              setVersionHistoryBoard(null);
              setBoardVersions([]);
              setVersionHistoryMessage("");
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.4)",
              display: "grid",
              placeItems: "center",
              padding: "20px",
              zIndex: 170,
            }}
          >
            <div
              className="scriboo-theme-dialog"
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "min(590px, 100%)",
                maxHeight: "min(720px, calc(100vh - 40px))",
                overflow: "auto",
                borderRadius: "24px",
                border: "1px solid rgba(203,213,225,0.9)",
                background: "#ffffff",
                boxShadow: "0 30px 90px rgba(15,23,42,0.24)",
                padding: "24px",
                display: "grid",
                gap: "18px",
                fontFamily: appSansFontFamily,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <div style={{ display: "grid", gap: "7px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      color: "#0f172a",
                      fontSize: "22px",
                      fontWeight: 780,
                    }}
                  >
                    <History size={22} color="#0284c7" />
                    {t("Version history", "Historia wersji")}
                  </div>
                  <div style={{ color: "#475569", fontSize: "13px", lineHeight: 1.5 }}>
                    {t("Earlier versions of", "Wcześniejsze wersje")} <strong>{versionHistoryBoard.name}</strong>. {t("Scriboo keeps up to 50 recent snapshots for", "Scriboo przechowuje do 50 ostatnich kopii przez")} {versionRetentionDays} {t("days.", "dni.")}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={t("Close version history", "Zamknij historię wersji")}
                  disabled={isVersionHistoryLoading}
                  onClick={() => {
                    setVersionHistoryBoard(null);
                    setBoardVersions([]);
                    setVersionHistoryMessage("");
                  }}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "12px",
                    border: "1px solid rgba(203,213,225,0.9)",
                    background: "#ffffff",
                    color: "#334155",
                    display: "grid",
                    placeItems: "center",
                    cursor: isVersionHistoryLoading ? "default" : "pointer",
                    padding: 0,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <div
                style={{
                  borderRadius: "14px",
                  border: "1px solid rgba(14,165,233,0.16)",
                  background: "rgba(240,249,255,0.78)",
                  color: "#075985",
                  padding: "12px 14px",
                  fontSize: "12px",
                  lineHeight: 1.5,
                }}
              >
                {t("Restoring does not destroy your current work. Scriboo saves the current board as a recovery version first.", "Przywracanie nie usuwa bieżącej pracy. Scriboo najpierw zapisuje obecną tablicę jako wersję odzyskiwania.")}
              </div>

              {versionHistoryMessage && (
                <div
                  style={{
                    borderRadius: "12px",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    padding: "11px 13px",
                    fontSize: "13px",
                    fontWeight: 650,
                  }}
                >
                  {versionHistoryMessage}
                </div>
              )}

              {isVersionHistoryLoading && boardVersions.length === 0 ? (
                <div
                  style={{
                    minHeight: "120px",
                    display: "grid",
                    placeItems: "center",
                    color: "#64748b",
                    fontSize: "13px",
                    fontWeight: 650,
                  }}
                >
                  {t("Loading recovery versions…", "Wczytywanie wersji odzyskiwania…")}
                </div>
              ) : boardVersions.length === 0 && !versionHistoryMessage ? (
                <div
                  style={{
                    borderRadius: "16px",
                    border: "1px dashed rgba(148,163,184,0.48)",
                    padding: "28px 18px",
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: "13px",
                    lineHeight: 1.55,
                  }}
                >
                  {t("No earlier versions yet. Scriboo creates snapshots automatically as you continue editing this board.", "Nie ma jeszcze wcześniejszych wersji. Scriboo tworzy kopie automatycznie podczas edycji tej tablicy.")}
                </div>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {boardVersions.map((version) => {
                    const reasonLabel =
                      version.reason === "before_restore"
                        ? "Before a previous recovery"
                        : version.reason === "before_trash"
                        ? "Before moving to Trash"
                        : "Automatic snapshot";

                    return (
                      <div
                        key={version.id}
                        style={{
                          borderRadius: "15px",
                          border: "1px solid rgba(226,232,240,0.95)",
                          background: "#ffffff",
                          padding: "14px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "14px",
                          boxShadow: "0 5px 16px rgba(15,23,42,0.04)",
                        }}
                      >
                        <div style={{ minWidth: 0, display: "grid", gap: "5px" }}>
                          <div style={{ color: "#0f172a", fontSize: "14px", fontWeight: 720 }}>
                            {reasonLabel}
                          </div>
                          <div style={{ color: "#64748b", fontSize: "12px" }}>
                            {formatBoardDate(version.createdAt)} · {version.elementCount}{" "}
                            {t("items", "elementów")} · {version.calendarEntryCount} {t("calendar entries", "wpisów kalendarza")}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isVersionHistoryLoading}
                          onClick={() => restoreBoardVersion(version).catch(() => null)}
                          style={{
                            height: "36px",
                            padding: "0 13px",
                            borderRadius: "11px",
                            border: "1px solid rgba(14,165,233,0.2)",
                            background: "rgba(240,249,255,0.9)",
                            color: "#0369a1",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "7px",
                            flex: "0 0 auto",
                            fontFamily: appSansFontFamily,
                            fontSize: "12px",
                            fontWeight: 720,
                            cursor: isVersionHistoryLoading ? "default" : "pointer",
                          }}
                        >
                          <RefreshCw size={14} />
                          {t("Restore", "Przywróć")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {sharingBoard && (
          <div
            data-board-browser-layer="true"
            onClick={() => {
              if (isSharePanelLoading) return;
              setSharingBoard(null);
              setSharePanelMessage("");
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.36)",
              display: "grid",
              placeItems: "center",
              padding: "20px",
              zIndex: 120,
            }}
          >
            <div
              className="scriboo-theme-dialog"
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "min(520px, 100%)",
                borderRadius: "24px",
                border: "1px solid rgba(203,213,225,0.86)",
                background: "#ffffff",
                boxShadow: "0 30px 90px rgba(15,23,42,0.22)",
                padding: "24px",
                display: "grid",
                gap: "18px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <div style={{ display: "grid", gap: "8px" }}>
                  <div
                    style={{
                      color: "#0f172a",
                      fontSize: "24px",
                      fontWeight: 700,
                    }}
                  >
                {t("Share board", "Udostępnij tablicę")}
                  </div>
                  <div
                    style={{
                      color: "#64748b",
                      fontSize: "14px",
                      lineHeight: 1.5,
                    }}
                  >
                    {t(
                      `${sharingBoard.name} can be shared with up to ${shareLimit} ${shareLimit === 1 ? "person" : "people"} on your ${currentPlanLabel} plan.`,
                      `Tablicę ${sharingBoard.name} możesz udostępnić maksymalnie ${shareLimit} osobom w planie ${currentPlanLabel}.`
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSharingBoard(null);
                    setSharePanelMessage("");
                  }}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "12px",
                    border: "1px solid rgba(203,213,225,0.8)",
                    background: "#ffffff",
                    color: "#475569",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <input
                  value={shareEmailInput}
                  onChange={(event) => {
                    setShareEmailInput(event.currentTarget.value);
                    if (sharePanelTone === "info") setSharePanelMessage("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitBoardShare().catch(() => null);
                    }
                  }}
              placeholder={t("Enter email address", "Wprowadź adres e-mail")}
                  style={{
                    flex: "1 1 auto",
                    height: "44px",
                    padding: "0 14px",
                    borderRadius: "12px",
                    border: "1px solid rgba(203,213,225,0.86)",
                    background: "#ffffff",
                    color: "#0f172a",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  disabled={isSharePanelLoading || !shareEmailInput.trim()}
                  onClick={() => submitBoardShare().catch(() => null)}
                  style={{
                    height: "44px",
                    padding: "0 16px",
                    borderRadius: "12px",
                    border: "none",
                    background:
                      signatureIndigoGradient,
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor:
                      isSharePanelLoading || !shareEmailInput.trim()
                        ? "default"
                        : "pointer",
                    opacity: isSharePanelLoading || !shareEmailInput.trim() ? 0.6 : 1,
                  }}
                >
                    {t("Share", "Udostępnij")}
                </button>
              </div>

              {sharePanelMessage && (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border:
                      sharePanelTone === "success"
                        ? "1px solid rgba(34,197,94,0.22)"
                        : sharePanelTone === "info"
                          ? "1px solid rgba(99,102,241,0.22)"
                        : "1px solid rgba(239,68,68,0.18)",
                    background:
                      sharePanelTone === "success"
                        ? "rgba(240,253,244,0.9)"
                        : sharePanelTone === "info"
                          ? "rgba(238,242,255,0.94)"
                        : "rgba(254,242,242,0.95)",
                    color:
                      sharePanelTone === "success"
                        ? "#166534"
                        : sharePanelTone === "info"
                          ? "#4338ca"
                          : "#b91c1c",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  {sharePanelMessage}
                </div>
              )}

              <div style={{ display: "grid", gap: "10px" }}>
                <div
                  style={{
                    color: isInterfaceDarkMode ? "#f8fafc" : "#0f172a",
                    fontSize: "14px",
                    fontWeight: 750,
                  }}
                >
                {t("People with access", "Osoby z dostępem")}
                </div>

                {boardShares.length === 0 ? (
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "14px",
                      border: "1px dashed rgba(203,213,225,0.86)",
                      color: "#64748b",
                      fontSize: "13px",
                    }}
                  >
                    {t("No one else has access yet.", "Nikt inny nie ma jeszcze dostępu.")}
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "10px" }}>
                    {boardShares.map((share) => (
                      <div
                        key={share.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                          padding: "12px 14px",
                          borderRadius: "14px",
                          border: "1px solid rgba(226,232,240,0.92)",
                          background: "#f8fafc",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gap: "3px",
                            color: "#0f172a",
                            fontSize: "14px",
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          <span>{share.email}</span>
                          <span style={{ color: share.status === "accepted" ? "#047857" : "#b45309", fontSize: "11px", fontWeight: 700 }}>
                            {share.status === "accepted"
                              ? share.permission === "editor" ? "Accepted · Can edit" : "Accepted · View only"
                              : t("Invitation pending", "Zaproszenie oczekuje")}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={isSharePanelLoading}
                          onClick={() => removeBoardShare(share).catch(() => null)}
                          style={{
                            height: "34px",
                            padding: "0 12px",
                            borderRadius: "10px",
                            border: "1px solid rgba(148,163,184,0.34)",
                            background: "#ffffff",
                            color: "#64748b",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: isSharePanelLoading ? "default" : "pointer",
                          }}
                        >
                          {share.status === "pending"
                            ? t("Cancel invitation", "Anuluj zaproszenie")
                            : t("Remove access", "Usuń dostęp")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div
          className="scriboo-guest-header-content"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: currentAccountEmail ? "none" : "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "18px",
            maxWidth: "980px",
            width: "calc(100% - 120px)",
            padding: "0 24px",
            zIndex: 2,
          }}
        >
          <span
            className="scriboo-guest-header-message"
            style={{
              color: "rgba(255,255,255,0.92)",
              fontFamily: appSansFontFamily,
              fontSize: "14.5px",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              lineHeight: 1,
              whiteSpace: "nowrap",
              flexShrink: 0,
              textRendering: "optimizeLegibility",
              WebkitFontSmoothing: "antialiased",
              MozOsxFontSmoothing: "grayscale",
              textShadow: "0 1px 10px rgba(15,23,42,0.18)",
            }}
          >
              {t("You are in guest mode. Create an account and choose the right plan. 🚀", "Jesteś w trybie gościa. Załóż konto i wybierz odpowiedni plan. 🚀")}
          </span>

          <div
            className="scriboo-guest-header-actions"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              flexShrink: 0,
            }}
          >
          <button
              className="scriboo-login-cta"
              aria-label={t("Log in", "Zaloguj się")}
            onClick={() => openAuthModal("login")}
            style={{
              minWidth: "124px",
              height: "34px",
              padding: "0 18px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.42)",
              background: "transparent",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: appSansFontFamily,
              fontSize: "15px",
              fontWeight: 650,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              cursor: "pointer",
              boxShadow:
                "0 8px 18px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.12)",
              whiteSpace: "nowrap",
              textRendering: "optimizeLegibility",
              WebkitFontSmoothing: "antialiased",
              MozOsxFontSmoothing: "grayscale",
              opacity: 0.96,
            }}
          >
            <span className="scriboo-login-cta__outline-pulse" aria-hidden="true" />
            <span
              className="scriboo-login-cta__label"
              style={{
                display: "inline-block",
                transform: "translateY(-0.5px)",
                lineHeight: 1,
                textRendering: "optimizeLegibility",
                WebkitFontSmoothing: "antialiased",
                MozOsxFontSmoothing: "grayscale",
              }}
            >
              {t("Log in", "Zaloguj się")}
            </span>
          </button>

          <span
            className="scriboo-guest-register-prompt"
            style={{
              color: "rgba(255,255,255,0.86)",
              fontFamily: appSansFontFamily,
              fontSize: "14px",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              lineHeight: 1,
              whiteSpace: "nowrap",
              textRendering: "optimizeLegibility",
              WebkitFontSmoothing: "antialiased",
              MozOsxFontSmoothing: "grayscale",
              textShadow: "0 1px 8px rgba(15,23,42,0.14)",
            }}
          >
              {t("Don't have an account?", "Nie masz konta?")}
          </span>

          <button
              aria-label={t("Register", "Zarejestruj się")}
            onClick={() => openAuthModal("register")}
            onMouseEnter={() => setIsRegisterCtaHovered(true)}
            onMouseLeave={() => setIsRegisterCtaHovered(false)}
            style={{
              minWidth: "148px",
              height: "34px",
              padding: "0 18px",
              borderRadius: "999px",
              border: isRegisterCtaHovered
                ? "1px solid rgba(255,255,255,0.74)"
                : "1px solid rgba(255,255,255,0.58)",
              background: signatureIndigoGradient,
              backgroundSize: "145% 145%",
              backgroundPosition: isRegisterCtaHovered
                ? "100% 50%"
                : "0% 50%",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: appSansFontFamily,
              fontSize: "15px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              cursor: "pointer",
              boxShadow:
                isRegisterCtaHovered
                  ? "0 14px 28px rgba(15,23,42,0.18), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.22)"
                  : "0 8px 20px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.18)",
              transition:
                "border-color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease, filter 0.22s ease, background-position 0.42s ease",
              whiteSpace: "nowrap",
              textRendering: "optimizeLegibility",
              WebkitFontSmoothing: "antialiased",
              MozOsxFontSmoothing: "grayscale",
              transform: isRegisterCtaHovered
                ? "translateY(-1.5px) scale(1.018)"
                : "translateY(-0.5px)",
              filter: isRegisterCtaHovered
                ? "saturate(1.08) brightness(1.05)"
                : "none",
            }}
          >
            <span
              style={{
                display: "inline-block",
                lineHeight: 1,
                transform: "translateY(-0.5px)",
                WebkitFontSmoothing: "antialiased",
                MozOsxFontSmoothing: "grayscale",
                textRendering: "optimizeLegibility",
              }}
            >
              {t("Register", "Zarejestruj się")}
            </span>
          </button>
          </div>
        </div>

      </div>

      {!isToolbarCollapsed && <div
        className="scriboo-drawing-toolbar"
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
        <button
          type="button"
          aria-label={t("Hide drawing toolbar", "Ukryj pasek narzędzi")}
          title={t("Hide toolbar", "Ukryj pasek")}
          onClick={() => {
            setShowPenMenu(false);
            setShowTextMenu(false);
            setShowEraserMenu(false);
            setShowShapesMenu(false);
            setIsToolbarCollapsed(true);
          }}
          style={{
            position: "absolute",
            top: "50%",
            right: "-31px",
            width: "25px",
            height: "34px",
            transform: "translateY(-50%)",
            border: `1px solid ${panelBorderColor}`,
            borderRadius: "9px",
            background: toolbarBackground,
            color: panelTextColor,
            display: "grid",
            placeItems: "center",
            padding: 0,
            cursor: "pointer",
            boxShadow: "0 5px 14px rgba(15,23,42,0.12)",
            zIndex: 1,
          }}
        >
          <ChevronLeft size={15} strokeWidth={2.1} />
        </button>

        <input
          ref={fileUploadRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          multiple
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = "";
            if (files.length) {
              void importImageFiles(files);
            }
          }}
          style={{ display: "none" }}
        />

        <button
          aria-label={t("Upload files", "Prześlij pliki")}
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
                  aria-hidden="true"
                  style={{
                    width: "24px",
                    height: "24px",
                    display: "grid",
                    placeItems: "center",
                    flex: "0 0 24px",
                  }}
                >
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
                    }}
                  />
                </div>
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
                width: "224px",
                minHeight: "64px",
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
                aria-hidden="true"
                style={{
                  width: "32px",
                  height: "32px",
                  display: "grid",
                  placeItems: "center",
                  flex: "0 0 32px",
                }}
              >
                <div
                  style={{
                    width: `${8 + ((eraserWidth - 8) / 56) * 24}px`,
                    height: `${8 + ((eraserWidth - 8) / 56) * 24}px`,
                    borderRadius: "999px",
                    background: canvasFillColor,
                    boxShadow: `inset 0 0 0 1px ${panelBorderColor}`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label={t("Ruler — drag to measure", "Linijka — przeciągnij, aby zmierzyć")}
          title={t("Ruler — drag to measure", "Linijka — przeciągnij, aby zmierzyć")}
          onClick={() => {
            if (activeText) {
              commitActiveText();
            }
            setTool("ruler");
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
            background: tool === "ruler" ? "#7c3aed" : inactiveToolBackground,
            color: tool === "ruler" ? "white" : panelTextColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <Ruler size={18} />
        </button>

        <button
          onClick={clearCanvas}
          aria-label={t("Clear board", "Wyczyść tablicę")}
          title={t("Clear board", "Wyczyść tablicę")}
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

        <button
          type="button"
          aria-expanded={showSpecialTools}
          aria-label={
            showSpecialTools
              ? t("Hide special tools", "Ukryj narzędzia specjalne")
              : t("Show special tools", "Pokaż narzędzia specjalne")
          }
          title={t("Special tools", "Narzędzia specjalne")}
          onClick={() =>
            setShowSpecialTools((previous) => {
              if (previous) setShowBrainstormMenu(false);
              return !previous;
            })
          }
          style={{
            width: "38px",
            height: "24px",
            borderRadius: "7px",
            border: "none",
            background: showSpecialTools
              ? "rgba(124,58,237,0.14)"
              : inactiveToolBackground,
            color: showSpecialTools ? "#7c3aed" : panelTextColor,
            display: "grid",
            placeItems: "center",
            padding: 0,
            cursor: "pointer",
            transition: "background 0.2s ease, color 0.2s ease",
          }}
        >
          {showSpecialTools ? (
            <ChevronUp size={16} strokeWidth={2.2} />
          ) : (
            <ChevronDown size={16} strokeWidth={2.2} />
          )}
        </button>

        {showSpecialTools && (
          <div
            aria-label={t("Special tools", "Narzędzia specjalne")}
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              width: "50px",
              minHeight: "186px",
              boxSizing: "border-box",
              padding: "9px 6px",
              borderRadius: "11px",
              border: isInterfaceDarkMode
                ? "1px solid rgba(255,255,255,0.08)"
                : "1px solid rgba(148,163,184,0.18)",
              background: toolbarBackground,
              backdropFilter: "blur(10px)",
              boxShadow: "0 10px 26px rgba(15,23,42,0.16)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <button
              type="button"
              aria-expanded={showBrainstormMenu}
              aria-label={t("Brainstorm tools", "Narzędzia burzy mózgów")}
              title={t("Brainstorm tools", "Narzędzia burzy mózgów")}
              onClick={() => setShowBrainstormMenu((previous) => !previous)}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "9px",
                border: "1px solid rgba(75,143,255,0.2)",
                background: showBrainstormMenu
                  ? "rgba(124,58,237,0.14)"
                  : "rgba(255,255,255,0.06)",
                display: "grid",
                placeItems: "center",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision">
                <defs>
                  <linearGradient id="scriboo-brainstorm-gradient" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#8b46ff" />
                    <stop offset="0.48" stopColor="#4b8fff" />
                    <stop offset="0.78" stopColor="#19c3bc" />
                    <stop offset="1" stopColor="#30cf68" />
                  </linearGradient>
                </defs>
                <path d="M7.45 14.15a6.1 6.1 0 1 1 9.1 0c-.95.78-1.35 1.55-1.48 2.35H8.93c-.13-.8-.53-1.57-1.48-2.35Z" stroke="url(#scriboo-brainstorm-gradient)" strokeWidth="2.05" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9.05 16.5h5.9a1 1 0 0 1 1 1v1.55a1 1 0 0 1-1 1h-5.9a1 1 0 0 1-1-1V17.5a1 1 0 0 1 1-1Z" stroke="url(#scriboo-brainstorm-gradient)" strokeWidth="2.05" strokeLinejoin="round" />
              </svg>
            </button>

            <button
              type="button"
              aria-label={t("Add unit converter", "Dodaj przelicznik jednostek")}
              title={t("Unit converter", "Przelicznik jednostek")}
              onClick={insertConverterObject}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "9px",
                border: "1px solid rgba(75,143,255,0.2)",
                background: "rgba(255,255,255,0.06)",
                display: "grid",
                placeItems: "center",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision">
                <defs>
                  <linearGradient id="scriboo-converter-icon-gradient" x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#8b46ff" />
                    <stop offset="0.48" stopColor="#4b8fff" />
                    <stop offset="0.78" stopColor="#19c3bc" />
                    <stop offset="1" stopColor="#30cf68" />
                  </linearGradient>
                </defs>
                <path d="M5 8h13.5M15.5 5l3 3-3 3M19 16H5.5M8.5 13l-3 3 3 3" stroke="url(#scriboo-converter-icon-gradient)" strokeWidth="2.05" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button
              type="button"
              aria-label={t("Add calculator", "Dodaj kalkulator")}
              title={t("Calculator", "Kalkulator")}
              onClick={insertCalculatorObject}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "9px",
                border: "1px solid rgba(75,143,255,0.2)",
                background: "rgba(255,255,255,0.06)",
                display: "grid",
                placeItems: "center",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision">
                <defs>
                  <linearGradient id="scriboo-calculator-icon-gradient" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#8b46ff" />
                    <stop offset="0.48" stopColor="#4b8fff" />
                    <stop offset="0.78" stopColor="#19c3bc" />
                    <stop offset="1" stopColor="#30cf68" />
                  </linearGradient>
                </defs>
                <rect x="5" y="3.5" width="14" height="17" rx="2.5" stroke="url(#scriboo-calculator-icon-gradient)" strokeWidth="2" />
                <path d="M8 7h8M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18h.01M12 18h3.5" stroke="url(#scriboo-calculator-icon-gradient)" strokeWidth="2.1" strokeLinecap="round" />
              </svg>
            </button>

            <button
              type="button"
              aria-label={t("Open personal layer", "Otwórz warstwę prywatną")}
              title={t("Personal writing layer", "Prywatna warstwa tekstowa")}
              onClick={() => setShowPersonalLayer(true)}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "9px",
                border: "1px solid rgba(75,143,255,0.2)",
                background: showPersonalLayer
                  ? "rgba(124,58,237,0.14)"
                  : "rgba(255,255,255,0.06)",
                display: "grid",
                placeItems: "center",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision">
                <defs>
                  <linearGradient id="scriboo-personal-layer-gradient" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#8b46ff" />
                    <stop offset="0.48" stopColor="#4b8fff" />
                    <stop offset="0.78" stopColor="#19c3bc" />
                    <stop offset="1" stopColor="#30cf68" />
                  </linearGradient>
                </defs>
                <path d="M6 4.5h9.5L19 8v11.5H6V4.5Z" stroke="url(#scriboo-personal-layer-gradient)" strokeWidth="1.9" strokeLinejoin="round" />
                <path d="M15.5 4.5V8H19M9 11h7M9 14h7M9 17h4.5" stroke="url(#scriboo-personal-layer-gradient)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {showBrainstormMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "54px",
                  transform: "translateY(-50%)",
                  display: "flex",
                  gap: "8px",
                  padding: "8px",
                  borderRadius: "11px",
                  border: isInterfaceDarkMode
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "1px solid rgba(148,163,184,0.18)",
                  background: popoverBackground,
                  boxShadow: "0 10px 26px rgba(15,23,42,0.18)",
                }}
              >
            <button
              type="button"
              aria-label={t("Mind-map oval", "Owal mapy myśli")}
              title={t("Mind-map oval", "Owal mapy myśli")}
              onClick={() => selectShapeTool("oval")}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "9px",
                border: "1px solid rgba(124,58,237,0.14)",
                background:
                  tool === "oval"
                    ? "rgba(124,58,237,0.14)"
                    : "rgba(255,255,255,0.06)",
                display: "grid",
                placeItems: "center",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <svg aria-hidden="true" width="24" height="20" viewBox="0 0 24 20" fill="none">
                <defs>
                  <linearGradient id="scriboo-mind-node-gradient" x1="2" y1="3" x2="22" y2="17" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#8b46ff" />
                    <stop offset="0.48" stopColor="#4b8fff" />
                    <stop offset="0.78" stopColor="#19c3bc" />
                    <stop offset="1" stopColor="#30cf68" />
                  </linearGradient>
                </defs>
                <ellipse cx="12" cy="10" rx="9" ry="5.5" stroke="url(#scriboo-mind-node-gradient)" strokeWidth="1.8" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={t("Mind-map connector", "Łącznik mapy myśli")}
              title={t("Mind-map connector", "Łącznik mapy myśli")}
              onClick={() => selectShapeTool("curve")}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "9px",
                border: "1px solid rgba(75,143,255,0.14)",
                background:
                  tool === "curve"
                    ? "rgba(75,143,255,0.14)"
                    : "rgba(255,255,255,0.06)",
                display: "grid",
                placeItems: "center",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <svg aria-hidden="true" width="24" height="20" viewBox="0 0 24 20" fill="none">
                <defs>
                  <linearGradient id="scriboo-mind-curve-gradient" x1="3" y1="4" x2="21" y2="16" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#8b46ff" />
                    <stop offset="0.5" stopColor="#4b8fff" />
                    <stop offset="1" stopColor="#19c3bc" />
                  </linearGradient>
                </defs>
                <path d="M3 5C8 5 9 15 14 15s5-7 7-7" stroke="url(#scriboo-mind-curve-gradient)" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
              </div>
            )}
          </div>
        )}

        <div
          aria-hidden="true"
          style={{ position: "relative", display: "none" }}
        >
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
              background: ["circle", "square", "triangle", "arrow", "line"].includes(tool)
                ? "rgba(124,58,237,0.14)"
                : inactiveToolBackground,
              color: panelTextColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg
              aria-hidden="true"
              width="23"
              height="23"
              viewBox="0 0 24 24"
              fill="none"
            >
              <defs>
                <linearGradient
                  id="scriboo-brain-gradient"
                  x1="2"
                  y1="3"
                  x2="22"
                  y2="21"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#8b46ff" />
                  <stop offset="0.48" stopColor="#4b8fff" />
                  <stop offset="0.78" stopColor="#19c3bc" />
                  <stop offset="1" stopColor="#30cf68" />
                </linearGradient>
              </defs>
              <path
                d="M7.45 14.15a6.1 6.1 0 1 1 9.1 0c-.95.78-1.35 1.55-1.48 2.35H8.93c-.13-.8-.53-1.57-1.48-2.35Z"
                stroke="url(#scriboo-brain-gradient)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.05 16.5h5.9a1 1 0 0 1 1 1v1.55a1 1 0 0 1-1 1h-5.9a1 1 0 0 1-1-1V17.5a1 1 0 0 1 1-1Z"
                stroke="url(#scriboo-brain-gradient)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 1.8v1.35M4.8 4.8l.95.95M2 11h1.4M19.2 4.8l-.95.95M22 11h-1.4"
                stroke="url(#scriboo-brain-gradient)"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
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
                onClick={() => selectShapeTool("circle")}
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
                onClick={() => selectShapeTool("square")}
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
                onClick={() => selectShapeTool("triangle")}
                aria-label={t("Triangle", "Trójkąt")}
                title={t("Triangle", "Trójkąt")}
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
                <Triangle size={18} />
              </button>

              <button
                onClick={() => selectShapeTool("arrow")}
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
                onClick={() => selectShapeTool("line")}
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

      </div>}
    </div>
  );
}

