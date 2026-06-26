import React from "react";

import { Card } from "@excalidraw/excalidraw/components/Card";
import { ToolButton } from "@excalidraw/excalidraw/components/ToolButton";
import {
  exportToFileIcon,
  ExportImageIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

import { exportPngToISPO, exportSceneToISPO } from "../data/ispo";

/**
 * The single export surface for the ISPO-hosted Excalidraw. Renders two cards
 * inside the Export dialog: save the editable scene, or save a PNG — both into
 * ISPO Files through the host Files picker. There is intentionally no
 * save-to-disk or shareable-link option.
 */
export const ExportToISPO: React.FC<{
  elements: readonly NonDeletedExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  name: string;
  onError: (error: Error) => void;
  onSuccess: () => void;
}> = ({ elements, appState, files, name, onError, onSuccess }) => {
  const { t } = useI18n();

  const run = async (
    fn: (
      elements: readonly NonDeletedExcalidrawElement[],
      appState: Partial<AppState>,
      files: BinaryFiles,
      name: string,
    ) => Promise<unknown>,
  ) => {
    try {
      const result = await fn(elements, appState, files, name);
      // `files.save` resolves to `null` when the user cancels the picker.
      if (result) {
        onSuccess();
      }
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };

  return (
    <>
      <Card color="primary">
        <div className="Card-icon">{exportToFileIcon}</div>
        <h2>{t("exportDialog.ispo_scene_title")}</h2>
        <div className="Card-details">
          {t("exportDialog.ispo_scene_details")}
        </div>
        <ToolButton
          className="Card-button"
          type="button"
          title={t("exportDialog.ispo_scene_button")}
          aria-label={t("exportDialog.ispo_scene_button")}
          showAriaLabel={true}
          onClick={() => run(exportSceneToISPO)}
        />
      </Card>
      <Card color="primary">
        <div className="Card-icon">{ExportImageIcon}</div>
        <h2>{t("exportDialog.ispo_image_title")}</h2>
        <div className="Card-details">
          {t("exportDialog.ispo_image_details")}
        </div>
        <ToolButton
          className="Card-button"
          type="button"
          title={t("exportDialog.ispo_image_button")}
          aria-label={t("exportDialog.ispo_image_button")}
          showAriaLabel={true}
          onClick={() => run(exportPngToISPO)}
        />
      </Card>
    </>
  );
};
