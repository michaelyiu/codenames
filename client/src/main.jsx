import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Room from "./pages/Room.jsx";
import "./styles.css";

// GitHub Pages SPA redirect: 404.html encodes the original path as ?p=/room/ABCD
// Restore it so React Router sees the correct route.
const sp = new URLSearchParams(window.location.search);
const redirectPath = sp.get("p");
if (redirectPath) {
  sp.delete("p");
  const remaining = sp.toString();
  const newUrl =
    import.meta.env.BASE_URL.replace(/\/$/, "") +
    redirectPath +
    (remaining ? "?" + remaining : "");
  window.history.replaceState(null, "", newUrl);
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:code" element={<Room />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
