import { VERSIONS } from "@excalidraw/common";

import { t } from "../i18n";

import type { ExcalidrawProps, UIAppState } from "../types";

const LibraryMenuBrowseButton = ({
  theme,
  id,
  libraryReturnUrl,
}: {
  libraryReturnUrl: ExcalidrawProps["libraryReturnUrl"];
  theme: UIAppState["theme"];
  id: string;
}) => {
  const referrer =
    libraryReturnUrl || window.location.origin + window.location.pathname;
  return (
    <a
      className="library-menu-browse-button"
      href={`${(globalThis.__ISPO_ENV||(globalThis.__ISPO_ENV={MODE:"production",PROD:true,DEV:false,SSR:false})).VITE_APP_LIBRARY_URL}?target=${
        window.name || "_blank"
      }&referrer=${referrer}&useHash=true&token=${id}&theme=${theme}&version=${
        VERSIONS.excalidrawLibrary
      }`}
      target="_excalidraw_libraries"
    >
      {t("labels.libraries")}
    </a>
  );
};

export default LibraryMenuBrowseButton;
