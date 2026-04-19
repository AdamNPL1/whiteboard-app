"use client";

import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";

export default function Home() {
  return (
<>
    {/* 🔥 TOP BAR */}
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 50,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        background: "linear-gradient(90deg, #6a5acd, #7b68ee)",
        color: "white",
        fontWeight: "bold",
      }}
    >
      <div>mojatablica</div>
      <div style={{ display: "flex", gap: 12 }}>
        <div>Info</div>
        <div>Zaloguj się</div>
        <div>Zarejestruj się</div>
      </div>
    </div>

    {/* 🧠 BOARD */}
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw />
    </div>
  </>
);
}

