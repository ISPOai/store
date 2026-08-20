import { THEME } from "@excalidraw/excalidraw";
import { connectToHost, DOM_EVENT_THEME } from "@ispo/sdk";
import { useEffect, useLayoutEffect, useState } from "react";

import type { Theme } from "@excalidraw/element/types";

import { STORAGE_KEYS } from "./app_constants";

const getDarkThemeMediaQuery = (): MediaQueryList | undefined =>
  window.matchMedia?.("(prefers-color-scheme: dark)");

const IS_ISPO =
  (globalThis as { __ISPO_ENV?: unknown }).__ISPO_ENV != null;

const isTheme = (value: unknown): value is Theme =>
  value === THEME.DARK || value === THEME.LIGHT;

const getHostTheme = (): Theme =>
  document.documentElement.classList.contains("dark")
    ? THEME.DARK
    : THEME.LIGHT;

const getSystemTheme = (): Theme =>
  getDarkThemeMediaQuery()?.matches ? THEME.DARK : THEME.LIGHT;

const getAmbientTheme = (): Theme =>
  IS_ISPO ? getHostTheme() : getSystemTheme();

export const useHandleAppTheme = () => {
  const [appTheme, setAppTheme] = useState<Theme | "system">(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_THEME) as
      | Theme
      | "system"
      | null;

    if (IS_ISPO) {
      return stored === THEME.DARK || stored === "system" ? stored : "system";
    }

    return stored || THEME.LIGHT;
  });
  const [editorTheme, setEditorTheme] = useState<Theme>(() =>
    getAmbientTheme(),
  );

  useLayoutEffect(() => {
    if (!IS_ISPO) {
      return;
    }

    const connection = connectToHost();
    if (isTheme(connection.theme)) {
      setEditorTheme(connection.theme);
    }

    return () => connection.disconnect();
  }, []);

  useEffect(() => {
    if (appTheme !== "system") {
      return;
    }

    if (IS_ISPO) {
      const handleThemeChange = (event: Event) => {
        const detail = (event as CustomEvent<{ name?: unknown }>).detail;
        setEditorTheme(isTheme(detail?.name) ? detail.name : getHostTheme());
      };

      setEditorTheme(getHostTheme());
      window.addEventListener(DOM_EVENT_THEME, handleThemeChange);

      return () => {
        window.removeEventListener(DOM_EVENT_THEME, handleThemeChange);
      };
    }

    const mediaQuery = getDarkThemeMediaQuery();
    const handleChange = (e: MediaQueryListEvent) => {
      setEditorTheme(e.matches ? THEME.DARK : THEME.LIGHT);
    };

    mediaQuery?.addEventListener("change", handleChange);

    return () => {
      mediaQuery?.removeEventListener("change", handleChange);
    };
  }, [appTheme]);

  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_STORAGE_THEME, appTheme);

    if (appTheme === "system") {
      setEditorTheme(getAmbientTheme());
    } else {
      setEditorTheme(appTheme);
    }
  }, [appTheme]);

  return { editorTheme, appTheme, setAppTheme };
};
