export const ExcalidrawPlusPromoBanner = ({
  isSignedIn,
}: {
  isSignedIn: boolean;
}) => {
  return (
    <a
      href={
        isSignedIn
          ? (globalThis.__ISPO_ENV||(globalThis.__ISPO_ENV={MODE:"production",PROD:true,DEV:false,SSR:false})).VITE_APP_PLUS_APP
          : `${
              (globalThis.__ISPO_ENV||(globalThis.__ISPO_ENV={MODE:"production",PROD:true,DEV:false,SSR:false})).VITE_APP_PLUS_LP
            }/plus?utm_source=excalidraw&utm_medium=app&utm_content=guestBanner#excalidraw-redirect`
      }
      target="_blank"
      rel="noopener"
      className="plus-banner"
    >
      Excalidraw+
    </a>
  );
};
