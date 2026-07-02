import { useEffect, useState } from "react";
import { StatusBar, Style } from "@capacitor/status-bar";
import { getToken, setToken } from "./lib/api";
import LoginScreen from "./screens/LoginScreen";
import ScanScreen from "./screens/ScanScreen";

const DEV_TOKEN = import.meta.env.VITE_DEV_TOKEN as string | undefined;

type Screen = "login" | "scan";

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: "#0f1117" }).catch(() => {});
    if (DEV_TOKEN) setToken(DEV_TOKEN);
    if (getToken()) setScreen("scan");
    setReady(true);
  }, []);

  if (!ready) return null;

  if (screen === "login") {
    return <LoginScreen onLogin={() => setScreen("scan")} />;
  }

  return <ScanScreen onLogout={() => setScreen("login")} />;
}
