var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/index.parts.mjs
var index_parts_exports = {};
__export(index_parts_exports, {
  Control: () => SliderControl,
  Indicator: () => SliderIndicator,
  Label: () => SliderLabel,
  Root: () => SliderRoot,
  Thumb: () => SliderThumb,
  Track: () => SliderTrack,
  Value: () => SliderValue
});

// vendor/shims/react-esm.js
var react_esm_exports = {};
__export(react_esm_exports, {
  default: () => react_esm_default
});
__reExport(react_esm_exports, react_star);
import * as React from "react";
import * as react_star from "react";
var react_esm_default = React.default ?? React;

// node_modules/.pnpm/@floating-ui+utils@0.2.12/node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
function hasWindow() {
  return typeof window !== "undefined";
}
function getWindow(node) {
  var _node$ownerDocument;
  return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
}
function isElement(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof Element || value instanceof getWindow(value).Element;
}
function isHTMLElement(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
}
function isShadowRoot(value) {
  if (!hasWindow() || typeof ShadowRoot === "undefined") {
    return false;
  }
  return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/owner.mjs
function ownerDocument(node) {
  return node?.ownerDocument || document;
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useControlled.mjs
function useControlled({
  controlled,
  default: defaultProp,
  name,
  state = "value"
}) {
  const {
    current: isControlled
  } = react_esm_exports.useRef(controlled !== void 0);
  const [valueState, setValue] = react_esm_exports.useState(defaultProp);
  const value = isControlled ? controlled : valueState;
  if (false) {
    react_esm_exports.useEffect(() => {
      if (isControlled !== (controlled !== void 0)) {
        error([`A component is changing the ${isControlled ? "" : "un"}controlled ${state} state of ${name} to be ${isControlled ? "un" : ""}controlled.`, "Elements should not switch from uncontrolled to controlled (or vice versa).", `Decide between using a controlled or uncontrolled ${name} element for the lifetime of the component.`, "The nature of the state is determined during the first render. It's considered controlled if the value is not `undefined`.", "More info: https://fb.me/react-controlled-components"].join("\n"));
      }
    }, [state, name, controlled]);
    const {
      current: defaultValue
    } = react_esm_exports.useRef(defaultProp);
    react_esm_exports.useEffect(() => {
      if (!isControlled && serializeToDevModeString(defaultValue) !== serializeToDevModeString(defaultProp)) {
        error([`A component is changing the default ${state} state of an uncontrolled ${name} after being initialized. To suppress this warning opt to use a controlled ${name}.`].join("\n"));
      }
    }, [defaultProp]);
  }
  const setValueIfUncontrolled = react_esm_exports.useCallback((newValue) => {
    if (!isControlled) {
      setValue(newValue);
    }
  }, []);
  return [value, setValueIfUncontrolled];
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/safeReact.mjs
var SafeReact = {
  ...react_esm_exports
};

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useRefWithInit.mjs
var UNINITIALIZED = {};
function useRefWithInit(init, initArg) {
  const ref = react_esm_exports.useRef(UNINITIALIZED);
  if (ref.current === UNINITIALIZED) {
    ref.current = init(initArg);
  }
  return ref;
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useStableCallback.mjs
var useInsertionEffect = SafeReact.useInsertionEffect;
var useSafeInsertionEffect = (
  // React 17 doesn't have useInsertionEffect.
  useInsertionEffect && // Preact replaces useInsertionEffect with useLayoutEffect and fires too late.
  useInsertionEffect !== SafeReact.useLayoutEffect ? useInsertionEffect : (fn) => fn()
);
function useStableCallback(callback) {
  const stable = useRefWithInit(createStableCallback).current;
  stable.next = callback;
  useSafeInsertionEffect(stable.effect);
  return stable.trampoline;
}
function createStableCallback() {
  const stable = {
    next: void 0,
    callback: assertNotCalled,
    trampoline: (...args) => stable.callback?.(...args),
    effect: () => {
      stable.callback = stable.next;
    }
  };
  return stable;
}
function assertNotCalled() {
  if (false) {
    throw (
      /* minify-error-disabled */
      new Error("Base UI: Cannot call an event handler while rendering.")
    );
  }
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useIsoLayoutEffect.mjs
var noop = () => {
};
var useIsoLayoutEffect = typeof document !== "undefined" ? react_esm_exports.useLayoutEffect : noop;

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useValueAsRef.mjs
function useValueAsRef(value) {
  const latest = useRefWithInit(createLatestRef, value).current;
  latest.next = value;
  useIsoLayoutEffect(latest.effect);
  return latest;
}
function createLatestRef(value) {
  const latest = {
    current: value,
    next: value,
    effect: () => {
      latest.current = latest.next;
    }
  };
  return latest;
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/empty.mjs
function NOOP() {
}
var EMPTY_ARRAY = Object.freeze([]);
var EMPTY_OBJECT = Object.freeze({});

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/reason-parts.mjs
var reason_parts_exports = {};
__export(reason_parts_exports, {
  cancelOpen: () => cancelOpen,
  chipRemovePress: () => chipRemovePress,
  clearPress: () => clearPress,
  closePress: () => closePress,
  closeWatcher: () => closeWatcher,
  decrementPress: () => decrementPress,
  disabled: () => disabled,
  drag: () => drag,
  escapeKey: () => escapeKey,
  focusOut: () => focusOut,
  imperativeAction: () => imperativeAction,
  incrementPress: () => incrementPress,
  initial: () => initial,
  inputBlur: () => inputBlur,
  inputChange: () => inputChange,
  inputClear: () => inputClear,
  inputPaste: () => inputPaste,
  inputPress: () => inputPress,
  itemPress: () => itemPress,
  keyboard: () => keyboard,
  linkPress: () => linkPress,
  listNavigation: () => listNavigation,
  missing: () => missing,
  none: () => none,
  outsidePress: () => outsidePress,
  pointer: () => pointer,
  scrub: () => scrub,
  siblingOpen: () => siblingOpen,
  swipe: () => swipe,
  trackPress: () => trackPress,
  triggerFocus: () => triggerFocus,
  triggerHover: () => triggerHover,
  triggerPress: () => triggerPress,
  wheel: () => wheel,
  windowResize: () => windowResize
});
var none = "none";
var triggerPress = "trigger-press";
var triggerHover = "trigger-hover";
var triggerFocus = "trigger-focus";
var outsidePress = "outside-press";
var itemPress = "item-press";
var closePress = "close-press";
var linkPress = "link-press";
var clearPress = "clear-press";
var chipRemovePress = "chip-remove-press";
var trackPress = "track-press";
var incrementPress = "increment-press";
var decrementPress = "decrement-press";
var inputChange = "input-change";
var inputClear = "input-clear";
var inputBlur = "input-blur";
var inputPaste = "input-paste";
var inputPress = "input-press";
var focusOut = "focus-out";
var escapeKey = "escape-key";
var closeWatcher = "close-watcher";
var listNavigation = "list-navigation";
var keyboard = "keyboard";
var pointer = "pointer";
var drag = "drag";
var wheel = "wheel";
var scrub = "scrub";
var cancelOpen = "cancel-open";
var siblingOpen = "sibling-open";
var disabled = "disabled";
var missing = "missing";
var initial = "initial";
var imperativeAction = "imperative-action";
var swipe = "swipe";
var windowResize = "window-resize";

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/createBaseUIEventDetails.mjs
function createChangeEventDetails(reason, event, trigger, customProperties) {
  let canceled = false;
  let allowPropagation = false;
  const custom = customProperties ?? EMPTY_OBJECT;
  const details = {
    reason,
    event: event ?? new Event("base-ui"),
    cancel() {
      canceled = true;
    },
    allowPropagation() {
      allowPropagation = true;
    },
    get isCanceled() {
      return canceled;
    },
    get isPropagationAllowed() {
      return allowPropagation;
    },
    trigger,
    ...custom
  };
  return details;
}
function createGenericEventDetails(reason, event, customProperties) {
  const custom = customProperties ?? EMPTY_OBJECT;
  const details = {
    reason,
    event: event ?? new Event("base-ui"),
    ...custom
  };
  return details;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/useValueChanged.mjs
function useValueChanged(value, onChange) {
  const valueRef = react_esm_exports.useRef(value);
  const onChangeCallback = useStableCallback(onChange);
  useIsoLayoutEffect(() => {
    if (valueRef.current === value) {
      return;
    }
    onChangeCallback(valueRef.current);
  }, [value, onChangeCallback]);
  useIsoLayoutEffect(() => {
    valueRef.current = value;
  }, [value]);
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useId.mjs
var globalId = 0;
function useGlobalId(idOverride, prefix = "mui") {
  const [defaultId, setDefaultId] = react_esm_exports.useState(idOverride);
  const id = idOverride || defaultId;
  react_esm_exports.useEffect(() => {
    if (defaultId == null) {
      globalId += 1;
      setDefaultId(`${prefix}-${globalId}`);
    }
  }, [defaultId, prefix]);
  return id;
}
var maybeReactUseId = SafeReact.useId;
function useId(idOverride, prefix) {
  if (maybeReactUseId !== void 0) {
    const reactId = maybeReactUseId();
    return idOverride ?? (prefix ? `${prefix}-${reactId}` : reactId);
  }
  return useGlobalId(idOverride, prefix);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/useBaseUiId.mjs
function useBaseUiId(idOverride) {
  return useId(idOverride, "base-ui");
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/formatErrorMessage.mjs
function createFormatErrorMessage(baseUrl, prefix) {
  return function formatErrorMessage2(code, ...args) {
    const url = new URL(baseUrl);
    url.searchParams.set("code", code.toString());
    args.forEach((arg) => url.searchParams.append("args[]", arg));
    return `${prefix} error #${code}; visit ${url} for the full message.`;
  };
}
var formatErrorMessage = createFormatErrorMessage("https://base-ui.com/production-error", "Base UI");
var formatErrorMessage_default = formatErrorMessage;

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useMergedRefs.mjs
function useMergedRefs(a, b, c, d) {
  const forkRef = useRefWithInit(createForkRef).current;
  if (didChange(forkRef, a, b, c, d)) {
    update(forkRef, [a, b, c, d]);
  }
  return forkRef.callback;
}
function useMergedRefsN(refs) {
  const forkRef = useRefWithInit(createForkRef).current;
  if (didChangeN(forkRef, refs)) {
    update(forkRef, refs);
  }
  return forkRef.callback;
}
function createForkRef() {
  return {
    callback: null,
    cleanup: null,
    refs: []
  };
}
function didChange(forkRef, a, b, c, d) {
  return forkRef.refs[0] !== a || forkRef.refs[1] !== b || forkRef.refs[2] !== c || forkRef.refs[3] !== d;
}
function didChangeN(forkRef, newRefs) {
  return forkRef.refs.length !== newRefs.length || forkRef.refs.some((ref, index) => ref !== newRefs[index]);
}
function update(forkRef, refs) {
  forkRef.refs = refs;
  if (refs.every((ref) => ref == null)) {
    forkRef.callback = null;
    return;
  }
  forkRef.callback = (instance) => {
    if (forkRef.cleanup) {
      forkRef.cleanup();
      forkRef.cleanup = null;
    }
    if (instance != null) {
      const cleanupCallbacks = Array(refs.length).fill(null);
      for (let i = 0; i < refs.length; i += 1) {
        const ref = refs[i];
        if (ref == null) {
          continue;
        }
        switch (typeof ref) {
          case "function": {
            const refCleanup = ref(instance);
            if (typeof refCleanup === "function") {
              cleanupCallbacks[i] = refCleanup;
            }
            break;
          }
          case "object": {
            ref.current = instance;
            break;
          }
          default:
        }
      }
      forkRef.cleanup = () => {
        for (let i = 0; i < refs.length; i += 1) {
          const ref = refs[i];
          if (ref == null) {
            continue;
          }
          switch (typeof ref) {
            case "function": {
              const cleanupCallback = cleanupCallbacks[i];
              if (typeof cleanupCallback === "function") {
                cleanupCallback();
              } else {
                ref(null);
              }
              break;
            }
            case "object": {
              ref.current = null;
              break;
            }
            default:
          }
        }
      };
    }
  };
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/reactVersion.mjs
var majorVersion = parseInt(react_esm_exports.version, 10);
function isReactVersionAtLeast(reactVersionToCheck) {
  return majorVersion >= reactVersionToCheck;
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/getReactElementRef.mjs
function getReactElementRef(element) {
  if (!/* @__PURE__ */ react_esm_exports.isValidElement(element)) {
    return null;
  }
  const reactElement = element;
  const propsWithRef = reactElement.props;
  return (isReactVersionAtLeast(19) ? propsWithRef?.ref : reactElement.ref) ?? null;
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/mergeObjects.mjs
function mergeObjects(a, b) {
  if (a && !b) {
    return a;
  }
  if (!a && b) {
    return b;
  }
  if (a || b) {
    return {
      ...a,
      ...b
    };
  }
  return void 0;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/getStateAttributesProps.mjs
function getStateAttributesProps(state, customMapping) {
  const props = {};
  for (const key in state) {
    const value = state[key];
    if (customMapping?.hasOwnProperty(key)) {
      const customProps = customMapping[key](value);
      if (customProps != null) {
        Object.assign(props, customProps);
      }
      continue;
    }
    if (value === true) {
      props[`data-${key.toLowerCase()}`] = "";
    } else if (value) {
      props[`data-${key.toLowerCase()}`] = value.toString();
    }
  }
  return props;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/utils/resolveClassName.mjs
function resolveClassName(className, state) {
  return typeof className === "function" ? className(state) : className;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/utils/resolveStyle.mjs
function resolveStyle(style, state) {
  return typeof style === "function" ? style(state) : style;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/merge-props/mergeProps.mjs
var EMPTY_PROPS = {};
function mergeProps(a, b, c, d, e) {
  if (!c && !d && !e && !a) {
    return createInitialMergedProps(b);
  }
  let merged = createInitialMergedProps(a);
  if (b) {
    merged = mergeInto(merged, b);
  }
  if (c) {
    merged = mergeInto(merged, c);
  }
  if (d) {
    merged = mergeInto(merged, d);
  }
  if (e) {
    merged = mergeInto(merged, e);
  }
  return merged;
}
function mergePropsN(props) {
  if (props.length === 0) {
    return EMPTY_PROPS;
  }
  if (props.length === 1) {
    return createInitialMergedProps(props[0]);
  }
  let merged = createInitialMergedProps(props[0]);
  for (let i = 1; i < props.length; i += 1) {
    merged = mergeInto(merged, props[i]);
  }
  return merged;
}
function createInitialMergedProps(inputProps) {
  if (isPropsGetter(inputProps)) {
    return {
      ...resolvePropsGetter(inputProps, EMPTY_PROPS)
    };
  }
  return copyInitialProps(inputProps);
}
function mergeInto(merged, inputProps) {
  if (isPropsGetter(inputProps)) {
    return resolvePropsGetter(inputProps, merged);
  }
  return mutablyMergeInto(merged, inputProps);
}
function copyInitialProps(inputProps) {
  const copiedProps = {
    ...inputProps
  };
  for (const propName in copiedProps) {
    const propValue = copiedProps[propName];
    if (isEventHandler(propName, propValue)) {
      copiedProps[propName] = wrapEventHandler(propValue);
    }
  }
  return copiedProps;
}
function mutablyMergeInto(mergedProps, externalProps) {
  if (!externalProps) {
    return mergedProps;
  }
  for (const propName in externalProps) {
    const externalPropValue = externalProps[propName];
    switch (propName) {
      case "style": {
        mergedProps[propName] = mergeObjects(mergedProps.style, externalPropValue);
        break;
      }
      case "className": {
        mergedProps[propName] = mergeClassNames(mergedProps.className, externalPropValue);
        break;
      }
      default: {
        if (isEventHandler(propName, externalPropValue)) {
          mergedProps[propName] = mergeEventHandlers(mergedProps[propName], externalPropValue);
        } else {
          mergedProps[propName] = externalPropValue;
        }
      }
    }
  }
  return mergedProps;
}
function isEventHandler(key, value) {
  const code0 = key.charCodeAt(0);
  const code1 = key.charCodeAt(1);
  const code2 = key.charCodeAt(2);
  return code0 === 111 && code1 === 110 && code2 >= 65 && code2 <= 90 && (typeof value === "function" || typeof value === "undefined");
}
function isPropsGetter(inputProps) {
  return typeof inputProps === "function";
}
function resolvePropsGetter(inputProps, previousProps) {
  if (isPropsGetter(inputProps)) {
    return inputProps(previousProps);
  }
  return inputProps ?? EMPTY_PROPS;
}
function mergeEventHandlers(ourHandler, theirHandler) {
  if (!theirHandler) {
    return ourHandler;
  }
  if (!ourHandler) {
    return wrapEventHandler(theirHandler);
  }
  return (...args) => {
    const event = args[0];
    if (isSyntheticEvent(event)) {
      const baseUIEvent = event;
      makeEventPreventable(baseUIEvent);
      const result2 = theirHandler(...args);
      if (!baseUIEvent.baseUIHandlerPrevented) {
        ourHandler?.(...args);
      }
      return result2;
    }
    const result = theirHandler(...args);
    ourHandler?.(...args);
    return result;
  };
}
function wrapEventHandler(handler) {
  if (!handler) {
    return handler;
  }
  return (...args) => {
    const event = args[0];
    if (isSyntheticEvent(event)) {
      makeEventPreventable(event);
    }
    return handler(...args);
  };
}
function makeEventPreventable(event) {
  event.preventBaseUIHandler = () => {
    event.baseUIHandlerPrevented = true;
  };
  return event;
}
function mergeClassNames(ourClassName, theirClassName) {
  if (theirClassName) {
    if (ourClassName) {
      return theirClassName + " " + ourClassName;
    }
    return theirClassName;
  }
  return ourClassName;
}
function isSyntheticEvent(event) {
  return event != null && typeof event === "object" && "nativeEvent" in event;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/useRenderElement.mjs
function useRenderElement(element, componentProps, params = {}) {
  const renderProp = componentProps.render;
  const outProps = useRenderElementProps(componentProps, params);
  if (params.enabled === false) {
    return null;
  }
  const state = params.state ?? EMPTY_OBJECT;
  return evaluateRenderProp(element, renderProp, outProps, state);
}
function useRenderElementProps(componentProps, params = {}) {
  const {
    className: classNameProp,
    style: styleProp,
    render: renderProp
  } = componentProps;
  const {
    state = EMPTY_OBJECT,
    ref,
    props,
    stateAttributesMapping,
    enabled = true
  } = params;
  const className = enabled ? resolveClassName(classNameProp, state) : void 0;
  const style = enabled ? resolveStyle(styleProp, state) : void 0;
  const stateProps = enabled ? getStateAttributesProps(state, stateAttributesMapping) : EMPTY_OBJECT;
  const resolvedProps = enabled && props ? resolveRenderFunctionProps(props) : void 0;
  const outProps = enabled ? mergeObjects(stateProps, resolvedProps) ?? {} : EMPTY_OBJECT;
  if (typeof document !== "undefined") {
    if (!enabled) {
      useMergedRefs(null, null);
    } else if (Array.isArray(ref)) {
      outProps.ref = useMergedRefsN([outProps.ref, getReactElementRef(renderProp), ...ref]);
    } else {
      outProps.ref = useMergedRefs(outProps.ref, getReactElementRef(renderProp), ref);
    }
  }
  if (!enabled) {
    return EMPTY_OBJECT;
  }
  if (className !== void 0) {
    outProps.className = mergeClassNames(outProps.className, className);
  }
  if (style !== void 0) {
    outProps.style = mergeObjects(outProps.style, style);
  }
  return outProps;
}
function resolveRenderFunctionProps(props) {
  if (Array.isArray(props)) {
    return mergePropsN(props);
  }
  return mergeProps(void 0, props);
}
var REACT_LAZY_TYPE = Symbol.for("react.lazy");
function evaluateRenderProp(element, render, props, state) {
  if (render) {
    if (typeof render === "function") {
      if (false) {
        warnIfRenderPropLooksLikeComponent(render);
      }
      return render(props, state);
    }
    const mergedProps = mergeProps(props, render.props);
    mergedProps.ref = props.ref;
    let newElement = render;
    if (newElement?.$$typeof === REACT_LAZY_TYPE) {
      const children = react_esm_exports.Children.toArray(render);
      newElement = children[0];
    }
    if (false) {
      if (!/* @__PURE__ */ react_esm_exports.isValidElement(newElement)) {
        throw new Error(["Base UI: The `render` prop was provided an invalid React element as `React.isValidElement(render)` is `false`.", "A valid React element must be provided to the `render` prop because it is cloned with props to replace the default element.", "https://base-ui.com/r/invalid-render-prop"].join("\n"));
      }
    }
    return /* @__PURE__ */ react_esm_exports.cloneElement(newElement, mergedProps);
  }
  if (element) {
    if (typeof element === "string") {
      return renderTag(element, props);
    }
  }
  throw new Error(false ? "Base UI: Render element or function are not defined." : formatErrorMessage_default(8));
}
function renderTag(Tag, props) {
  if (Tag === "button") {
    return /* @__PURE__ */ (0, react_esm_exports.createElement)("button", {
      type: "button",
      ...props,
      key: props.key
    });
  }
  if (Tag === "img") {
    return /* @__PURE__ */ (0, react_esm_exports.createElement)("img", {
      alt: "",
      ...props,
      key: props.key
    });
  }
  return /* @__PURE__ */ react_esm_exports.createElement(Tag, props);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/clamp.mjs
function clamp(val, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  return Math.max(min, Math.min(val, max));
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/areArraysEqual.mjs
function areArraysEqual(array1, array2, itemComparer = (a, b) => a === b) {
  return array1.length === array2.length && array1.every((value, index) => itemComparer(value, array2[index]));
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/platform/parts.mjs
var parts_exports = {};
__export(parts_exports, {
  engine: () => engine_exports,
  env: () => env_exports,
  os: () => os_exports,
  screenReader: () => screen_reader_exports
});

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/platform/os.mjs
var os_exports = {};
__export(os_exports, {
  android: () => android,
  apple: () => apple,
  ios: () => ios,
  linux: () => linux,
  mac: () => mac,
  windows: () => windows
});

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/platform/shared.mjs
function readRawData() {
  if (typeof navigator === "undefined") {
    return {
      userAgent: "",
      platform: "",
      maxTouchPoints: 0
    };
  }
  if (false) {
    const uaData = navigator.userAgentData;
    if (uaData && Array.isArray(uaData.brands)) {
      return {
        userAgent: uaData.brands.map(({
          brand,
          version: version2
        }) => `${brand}/${version2}`).join(" "),
        platform: uaData.platform ?? navigator.platform ?? "",
        maxTouchPoints: navigator.maxTouchPoints ?? 0
      };
    }
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform ?? "",
    maxTouchPoints: navigator.maxTouchPoints ?? 0
  };
}
var {
  userAgent,
  platform,
  maxTouchPoints
} = readRawData();
var lowerUserAgent = userAgent.toLowerCase();
var lowerPlatform = platform.toLowerCase();

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/platform/os.mjs
var ios = /^i(os$|p)/.test(lowerPlatform) || lowerPlatform === "macintel" && maxTouchPoints > 1;
var ANDROID_STRING = "android";
var android = lowerPlatform === ANDROID_STRING || lowerUserAgent.includes(ANDROID_STRING);
var mac = !ios && lowerPlatform.startsWith("mac");
var windows = lowerPlatform.startsWith("win");
var linux = !android && /^(linux|chrome os)/.test(lowerPlatform);
var apple = mac || ios;

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/platform/engine.mjs
var engine_exports = {};
__export(engine_exports, {
  blink: () => blink,
  gecko: () => gecko,
  webkit: () => webkit
});
var webkit = typeof CSS !== "undefined" && !!CSS.supports?.("-webkit-backdrop-filter:none");
var gecko = !webkit && lowerUserAgent.includes("firefox");
var blink = !webkit && lowerUserAgent.includes("chrom");

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/platform/screen-reader.mjs
var screen_reader_exports = {};
__export(screen_reader_exports, {
  voiceOver: () => voiceOver
});
var voiceOver = apple;

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/platform/env.mjs
var env_exports = {};
__export(env_exports, {
  jsdom: () => jsdom
});
var jsdom = /jsdom|happydom/.test(lowerUserAgent);

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/shadowDom.mjs
function activeElement(doc) {
  let element = doc.activeElement;
  while (element?.shadowRoot?.activeElement != null) {
    element = element.shadowRoot.activeElement;
  }
  return element;
}
function contains(parent, child) {
  if (!parent || !child) {
    return false;
  }
  const rootNode = child.getRootNode?.();
  if (parent.contains(child)) {
    return true;
  }
  if (rootNode && isShadowRoot(rootNode)) {
    let next = child;
    while (next) {
      if (parent === next) {
        return true;
      }
      next = next.parentNode || next.host;
    }
  }
  return false;
}
function getTarget(event) {
  if ("composedPath" in event) {
    return event.composedPath()[0];
  }
  return event.target;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/floating-ui-react/utils/element.mjs
function matchesFocusVisible(element) {
  if (!element || parts_exports.env.jsdom) {
    return true;
  }
  try {
    return element.matches(":focus-visible");
  } catch (_e) {
    return true;
  }
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/composite/list/CompositeListContext.mjs
var CompositeListContext = /* @__PURE__ */ react_esm_exports.createContext({
  register: () => {
  },
  unregister: () => {
  },
  subscribeMapChange: () => {
    return () => {
    };
  },
  elementsRef: {
    current: []
  },
  nextIndexRef: {
    current: 0
  }
});
if (false) CompositeListContext.displayName = "CompositeListContext";
function useCompositeListContext() {
  return react_esm_exports.useContext(CompositeListContext);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/composite/list/CompositeList.mjs
import { jsx as _jsx } from "react/jsx-runtime";
function CompositeList(props) {
  const {
    children,
    elementsRef,
    labelsRef,
    onMapChange: onMapChangeProp
  } = props;
  const onMapChange = useStableCallback(onMapChangeProp);
  const nextIndexRef = react_esm_exports.useRef(0);
  const listeners = useRefWithInit(createListeners).current;
  const map = useRefWithInit(createMap).current;
  const [mapTick, setMapTick] = react_esm_exports.useState(0);
  const lastTickRef = react_esm_exports.useRef(mapTick);
  const register = useStableCallback((node, metadata) => {
    map.set(node, metadata ?? null);
    lastTickRef.current += 1;
    setMapTick(lastTickRef.current);
  });
  const unregister = useStableCallback((node) => {
    map.delete(node);
    lastTickRef.current += 1;
    setMapTick(lastTickRef.current);
  });
  const sortedMap = react_esm_exports.useMemo(() => {
    disableEslintWarning(mapTick);
    const newMap = /* @__PURE__ */ new Map();
    const sortedNodes = Array.from(map.keys()).filter((node) => node.isConnected).sort(sortByDocumentPosition);
    sortedNodes.forEach((node, index) => {
      const metadata = map.get(node) ?? {};
      newMap.set(node, {
        ...metadata,
        index
      });
    });
    return newMap;
  }, [map, mapTick]);
  useIsoLayoutEffect(() => {
    if (typeof MutationObserver !== "function" || sortedMap.size === 0) {
      return void 0;
    }
    const mutationObserver = new MutationObserver((entries) => {
      const diff = /* @__PURE__ */ new Set();
      const updateDiff = (node) => diff.has(node) ? diff.delete(node) : diff.add(node);
      entries.forEach((entry) => {
        entry.removedNodes.forEach(updateDiff);
        entry.addedNodes.forEach(updateDiff);
      });
      if (diff.size === 0) {
        lastTickRef.current += 1;
        setMapTick(lastTickRef.current);
      }
    });
    sortedMap.forEach((_, node) => {
      if (node.parentElement) {
        mutationObserver.observe(node.parentElement, {
          childList: true
        });
      }
    });
    return () => {
      mutationObserver.disconnect();
    };
  }, [sortedMap]);
  useIsoLayoutEffect(() => {
    const shouldUpdateLengths = lastTickRef.current === mapTick;
    if (shouldUpdateLengths) {
      if (elementsRef.current.length !== sortedMap.size) {
        elementsRef.current.length = sortedMap.size;
      }
      if (labelsRef && labelsRef.current.length !== sortedMap.size) {
        labelsRef.current.length = sortedMap.size;
      }
      nextIndexRef.current = sortedMap.size;
    }
    onMapChange(sortedMap);
  }, [onMapChange, sortedMap, elementsRef, labelsRef, mapTick]);
  useIsoLayoutEffect(() => {
    return () => {
      elementsRef.current = [];
    };
  }, [elementsRef]);
  useIsoLayoutEffect(() => {
    return () => {
      if (labelsRef) {
        labelsRef.current = [];
      }
    };
  }, [labelsRef]);
  const subscribeMapChange = useStableCallback((fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  });
  useIsoLayoutEffect(() => {
    listeners.forEach((l) => l(sortedMap));
  }, [listeners, sortedMap]);
  const contextValue = react_esm_exports.useMemo(() => ({
    register,
    unregister,
    subscribeMapChange,
    elementsRef,
    labelsRef,
    nextIndexRef
  }), [register, unregister, subscribeMapChange, elementsRef, labelsRef, nextIndexRef]);
  return /* @__PURE__ */ _jsx(CompositeListContext.Provider, {
    value: contextValue,
    children
  });
}
function createMap() {
  return /* @__PURE__ */ new Map();
}
function createListeners() {
  return /* @__PURE__ */ new Set();
}
function sortByDocumentPosition(a, b) {
  const position = a.compareDocumentPosition(b);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING || position & Node.DOCUMENT_POSITION_CONTAINED_BY) {
    return -1;
  }
  if (position & Node.DOCUMENT_POSITION_PRECEDING || position & Node.DOCUMENT_POSITION_CONTAINS) {
    return 1;
  }
  return 0;
}
function disableEslintWarning(_) {
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/field/control/FieldControlDataAttributes.mjs
var FieldControlDataAttributes = /* @__PURE__ */ (function(FieldControlDataAttributes2) {
  FieldControlDataAttributes2["disabled"] = "data-disabled";
  FieldControlDataAttributes2["valid"] = "data-valid";
  FieldControlDataAttributes2["invalid"] = "data-invalid";
  FieldControlDataAttributes2["touched"] = "data-touched";
  FieldControlDataAttributes2["dirty"] = "data-dirty";
  FieldControlDataAttributes2["filled"] = "data-filled";
  FieldControlDataAttributes2["focused"] = "data-focused";
  return FieldControlDataAttributes2;
})({});

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/field-constants/constants.mjs
var DEFAULT_VALIDITY_STATE = {
  badInput: false,
  customError: false,
  patternMismatch: false,
  rangeOverflow: false,
  rangeUnderflow: false,
  stepMismatch: false,
  tooLong: false,
  tooShort: false,
  typeMismatch: false,
  valid: null,
  valueMissing: false
};
var DEFAULT_FIELD_STATE_ATTRIBUTES = {
  valid: null,
  touched: false,
  dirty: false,
  filled: false,
  focused: false
};
var DEFAULT_FIELD_ROOT_STATE = {
  disabled: false,
  ...DEFAULT_FIELD_STATE_ATTRIBUTES
};
var fieldValidityMapping = {
  valid(value) {
    if (value === null) {
      return null;
    }
    if (value) {
      return {
        [FieldControlDataAttributes.valid]: ""
      };
    }
    return {
      [FieldControlDataAttributes.invalid]: ""
    };
  }
};

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/field-root-context/FieldRootContext.mjs
var DEFAULT_FIELD_ROOT_CONTEXT = {
  invalid: void 0,
  name: void 0,
  validityData: {
    state: DEFAULT_VALIDITY_STATE,
    errors: [],
    error: "",
    value: "",
    initialValue: null
  },
  setValidityData: NOOP,
  disabled: void 0,
  touched: DEFAULT_FIELD_STATE_ATTRIBUTES.touched,
  setTouched: NOOP,
  dirty: DEFAULT_FIELD_STATE_ATTRIBUTES.dirty,
  setDirty: NOOP,
  filled: DEFAULT_FIELD_STATE_ATTRIBUTES.filled,
  setFilled: NOOP,
  focused: DEFAULT_FIELD_STATE_ATTRIBUTES.focused,
  setFocused: NOOP,
  validate: () => null,
  validationMode: "onSubmit",
  validationDebounceTime: 0,
  shouldValidateOnChange: () => false,
  state: DEFAULT_FIELD_ROOT_STATE,
  markedDirtyRef: {
    current: false
  },
  registerFieldControl: NOOP,
  validation: {
    getValidationProps: (_disabled, props = EMPTY_OBJECT) => props,
    inputRef: {
      current: null
    },
    registerInput: NOOP,
    commit: async () => {
    },
    change: NOOP
  }
};
var FieldRootContext = /* @__PURE__ */ react_esm_exports.createContext(DEFAULT_FIELD_ROOT_CONTEXT);
if (false) FieldRootContext.displayName = "FieldRootContext";
function useFieldRootContext(optional = true) {
  const context = react_esm_exports.useContext(FieldRootContext);
  if (context.setValidityData === NOOP && !optional) {
    throw new Error(false ? "Base UI: FieldRootContext is missing. Field parts must be placed within <Field.Root>." : formatErrorMessage_default(28));
  }
  return context;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/field-register-control/useRegisterFieldControl.mjs
function useRegisterFieldControl(controlRef, id, value, getFormValueOverride, enabled = true, name) {
  const {
    registerFieldControl
  } = useFieldRootContext();
  const sourceRef = react_esm_exports.useRef(null);
  if (!sourceRef.current) {
    sourceRef.current = Symbol();
  }
  useIsoLayoutEffect(() => {
    const source = sourceRef.current;
    if (!source || !enabled) {
      return void 0;
    }
    const registration = {
      controlRef,
      getValue: getFormValueOverride,
      id,
      name,
      value
    };
    registerFieldControl(source, registration);
    return () => {
      registerFieldControl(source, void 0);
    };
  }, [controlRef, enabled, getFormValueOverride, id, name, registerFieldControl, value]);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/form-context/FormContext.mjs
var FormContext = /* @__PURE__ */ react_esm_exports.createContext({
  formRef: {
    current: {
      fields: /* @__PURE__ */ new Map()
    }
  },
  errors: {},
  clearErrors: NOOP,
  validationMode: "onSubmit",
  submitAttemptedRef: {
    current: false
  }
});
if (false) FormContext.displayName = "FormContext";
function useFormContext() {
  return react_esm_exports.useContext(FormContext);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/labelable-provider/LabelableContext.mjs
var LabelableContext = /* @__PURE__ */ react_esm_exports.createContext({
  controlId: void 0,
  registerControlId: NOOP,
  labelId: void 0,
  setLabelId: NOOP,
  messageIds: [],
  setMessageIds: NOOP,
  getDescriptionProps: (externalProps) => externalProps
});
if (false) LabelableContext.displayName = "LabelableContext";
function useLabelableContext() {
  return react_esm_exports.useContext(LabelableContext);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/utils/resolveAriaLabelledBy.mjs
function getDefaultLabelId(id) {
  return id == null ? void 0 : `${id}-label`;
}
function resolveAriaLabelledBy(fieldLabelId, localLabelId) {
  return fieldLabelId ?? localLabelId;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/utils/asc.mjs
function asc(a, b) {
  return a - b;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/utils/replaceArrayItemAtIndex.mjs
function replaceArrayItemAtIndex(array, index, newValue) {
  const output = array.slice();
  output[index] = newValue;
  return output.sort(asc);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/utils/getSliderValue.mjs
function getSliderValue(valueInput, index, min, max, range, values) {
  let newValue = valueInput;
  newValue = clamp(newValue, min, max);
  if (range) {
    newValue = replaceArrayItemAtIndex(
      values,
      index,
      // Bound the new value to the thumb's neighbours.
      clamp(newValue, values[index - 1] ?? -Infinity, values[index + 1] ?? Infinity)
    );
  }
  return newValue;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/utils/validateMinimumDistance.mjs
function validateMinimumDistance(values, step, minStepsBetweenValues) {
  if (!Array.isArray(values)) {
    return true;
  }
  const distances = values.reduce((acc, val, index, vals) => {
    if (index === vals.length - 1) {
      return acc;
    }
    acc.push(Math.abs(val - vals[index + 1]));
    return acc;
  }, []);
  return Math.min(...distances) >= step * minStepsBetweenValues;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/root/stateAttributesMapping.mjs
var sliderStateAttributesMapping = {
  activeThumbIndex: () => null,
  max: () => null,
  min: () => null,
  minStepsBetweenValues: () => null,
  step: () => null,
  values: () => null,
  ...fieldValidityMapping
};

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/root/SliderRootContext.mjs
var SliderRootContext = /* @__PURE__ */ react_esm_exports.createContext(void 0);
if (false) SliderRootContext.displayName = "SliderRootContext";
function useSliderRootContext() {
  const context = react_esm_exports.useContext(SliderRootContext);
  if (context === void 0) {
    throw new Error(false ? "Base UI: SliderRootContext is missing. Slider parts must be placed within <Slider.Root>." : formatErrorMessage_default(62));
  }
  return context;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/root/SliderRoot.mjs
import { jsx as _jsx2 } from "react/jsx-runtime";
function getSliderChangeEventReason(event) {
  return "key" in event ? reason_parts_exports.keyboard : reason_parts_exports.inputChange;
}
function areValuesEqual(newValue, oldValue) {
  if (typeof newValue === "number" && typeof oldValue === "number") {
    return newValue === oldValue;
  }
  if (Array.isArray(newValue) && Array.isArray(oldValue)) {
    return areArraysEqual(newValue, oldValue);
  }
  return false;
}
var SliderRoot = /* @__PURE__ */ react_esm_exports.forwardRef(function SliderRoot2(componentProps, forwardedRef) {
  const {
    "aria-labelledby": ariaLabelledByProp,
    className,
    defaultValue,
    disabled: disabledProp = false,
    id: idProp,
    format,
    largeStep = 10,
    locale,
    render,
    max = 100,
    min = 0,
    minStepsBetweenValues = 0,
    form,
    name: nameProp,
    onValueChange: onValueChangeProp,
    onValueCommitted: onValueCommittedProp,
    orientation = "horizontal",
    step = 1,
    thumbCollisionBehavior = "push",
    thumbAlignment = "center",
    value: valueProp,
    style,
    ...elementProps
  } = componentProps;
  const id = useBaseUiId(idProp);
  const defaultLabelId = getDefaultLabelId(id);
  const onValueChange = useStableCallback(onValueChangeProp);
  const onValueCommitted = useStableCallback(onValueCommittedProp);
  const {
    clearErrors
  } = useFormContext();
  const {
    state: fieldState,
    disabled: fieldDisabled,
    name: fieldName,
    setTouched,
    setDirty,
    validityData,
    validation
  } = useFieldRootContext();
  const {
    labelId: fieldLabelId
  } = useLabelableContext();
  const [labelId, setLabelId] = react_esm_exports.useState();
  const ariaLabelledby = ariaLabelledByProp ?? resolveAriaLabelledBy(fieldLabelId, labelId);
  const disabled2 = fieldDisabled || disabledProp;
  const name = fieldName ?? nameProp;
  const [valueUnwrapped, setValueUnwrapped] = useControlled({
    controlled: valueProp,
    default: defaultValue ?? min,
    name: "Slider"
  });
  const sliderRef = react_esm_exports.useRef(null);
  const controlRef = react_esm_exports.useRef(null);
  const thumbRefs = react_esm_exports.useRef([]);
  const pressedInputRef = react_esm_exports.useRef(null);
  const pressedThumbCenterOffsetRef = react_esm_exports.useRef(null);
  const pressedThumbIndexRef = react_esm_exports.useRef(-1);
  const pressedValuesRef = react_esm_exports.useRef(null);
  const lastChangeReasonRef = react_esm_exports.useRef("none");
  const formatOptionsRef = useValueAsRef(format);
  const [active, setActiveState] = react_esm_exports.useState(-1);
  const [lastUsedThumbIndex, setLastUsedThumbIndex] = react_esm_exports.useState(-1);
  const [dragging, setDragging] = react_esm_exports.useState(false);
  const [thumbMap, setThumbMap] = react_esm_exports.useState(() => /* @__PURE__ */ new Map());
  const [indicatorPosition, setIndicatorPosition] = react_esm_exports.useState([void 0, void 0]);
  const setActive = useStableCallback((value) => {
    setActiveState(value);
    if (value !== -1) {
      setLastUsedThumbIndex(value);
    }
  });
  useRegisterFieldControl(validation.inputRef, id, valueUnwrapped, void 0, !disabled2, nameProp);
  useValueChanged(valueUnwrapped, () => {
    clearErrors(name);
    validation.change(valueUnwrapped);
    const initialValue = validityData.initialValue;
    let isDirty;
    if (Array.isArray(valueUnwrapped) && Array.isArray(initialValue)) {
      isDirty = !areArraysEqual(valueUnwrapped, initialValue);
    } else {
      isDirty = valueUnwrapped !== initialValue;
    }
    setDirty(isDirty);
  });
  const registerFieldControlRef = useStableCallback((element2) => {
    if (element2) {
      controlRef.current = element2;
    }
  });
  const range = Array.isArray(valueUnwrapped);
  const values = react_esm_exports.useMemo(() => {
    if (!range) {
      return [clamp(valueUnwrapped, min, max)];
    }
    return valueUnwrapped.slice().sort(asc);
  }, [max, min, range, valueUnwrapped]);
  const setValue = useStableCallback((newValue, details) => {
    if (Number.isNaN(newValue) || areValuesEqual(newValue, valueUnwrapped)) {
      return false;
    }
    const changeDetails = details ?? createChangeEventDetails(reason_parts_exports.none, void 0, void 0, {
      activeThumbIndex: -1
    });
    const nativeEvent = changeDetails.event;
    const EventConstructor = nativeEvent.constructor ?? Event;
    const clonedEvent = new EventConstructor(nativeEvent.type, nativeEvent);
    Object.defineProperty(clonedEvent, "target", {
      writable: true,
      value: {
        value: newValue,
        name
      }
    });
    changeDetails.event = clonedEvent;
    onValueChange(newValue, changeDetails);
    if (changeDetails.isCanceled) {
      return false;
    }
    lastChangeReasonRef.current = changeDetails.reason;
    setValueUnwrapped(newValue);
    return true;
  });
  const handleInputChange = useStableCallback((valueInput, index, event) => {
    const newValue = getSliderValue(valueInput, index, min, max, range, values);
    if (validateMinimumDistance(newValue, step, minStepsBetweenValues)) {
      const reason = getSliderChangeEventReason(event);
      const applied = setValue(newValue, createChangeEventDetails(reason, event.nativeEvent, void 0, {
        activeThumbIndex: index
      }));
      setTouched(true);
      if (applied) {
        onValueCommitted(newValue, createGenericEventDetails(reason, event.nativeEvent));
      }
    }
  });
  if (false) {
    if (min >= max) {
      warn("Slider `max` must be greater than `min`.");
    }
  }
  useIsoLayoutEffect(() => {
    const activeEl = activeElement(ownerDocument(sliderRef.current));
    if (disabled2 && contains(sliderRef.current, activeEl)) {
      activeEl.blur();
    }
  }, [disabled2]);
  if (disabled2 && active !== -1) {
    setActive(-1);
  }
  const state = react_esm_exports.useMemo(() => ({
    ...fieldState,
    activeThumbIndex: active,
    disabled: disabled2,
    dragging,
    orientation,
    max,
    min,
    minStepsBetweenValues,
    step,
    values
  }), [fieldState, active, disabled2, dragging, max, min, minStepsBetweenValues, orientation, step, values]);
  const contextValue = react_esm_exports.useMemo(() => ({
    active,
    controlRef,
    disabled: disabled2,
    dragging,
    validation,
    formatOptionsRef,
    handleInputChange,
    indicatorPosition,
    inset: thumbAlignment !== "center",
    labelId: ariaLabelledby,
    rootLabelId: defaultLabelId,
    largeStep,
    lastUsedThumbIndex,
    lastChangeReasonRef,
    form,
    locale,
    max,
    min,
    minStepsBetweenValues,
    name,
    onValueCommitted,
    orientation,
    pressedInputRef,
    pressedThumbCenterOffsetRef,
    pressedThumbIndexRef,
    pressedValuesRef,
    registerFieldControlRef,
    renderBeforeHydration: thumbAlignment === "edge",
    setActive,
    setDragging,
    setIndicatorPosition,
    setLabelId,
    setValue,
    state,
    step,
    thumbCollisionBehavior,
    thumbMap,
    thumbRefs,
    values
  }), [active, controlRef, ariaLabelledby, defaultLabelId, disabled2, dragging, validation, formatOptionsRef, handleInputChange, indicatorPosition, largeStep, lastUsedThumbIndex, lastChangeReasonRef, form, locale, max, min, minStepsBetweenValues, name, onValueCommitted, orientation, pressedInputRef, pressedThumbCenterOffsetRef, pressedThumbIndexRef, pressedValuesRef, registerFieldControlRef, setActive, setDragging, setIndicatorPosition, setLabelId, setValue, state, step, thumbCollisionBehavior, thumbAlignment, thumbMap, thumbRefs, values]);
  const element = useRenderElement("div", componentProps, {
    state,
    ref: [forwardedRef, sliderRef],
    props: [{
      "aria-labelledby": ariaLabelledby,
      id,
      role: "group"
    }, elementProps, (props) => validation.getValidationProps(disabled2, props)],
    stateAttributesMapping: sliderStateAttributesMapping
  });
  return /* @__PURE__ */ _jsx2(SliderRootContext.Provider, {
    value: contextValue,
    children: /* @__PURE__ */ _jsx2(CompositeList, {
      elementsRef: thumbRefs,
      onMapChange: setThumbMap,
      children: element
    })
  });
});
if (false) SliderRoot.displayName = "SliderRoot";

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/utils/useRegisteredLabelId.mjs
function useRegisteredLabelId(idProp, setLabelId) {
  const id = useBaseUiId(idProp);
  useIsoLayoutEffect(() => {
    setLabelId(id);
    return () => {
      setLabelId(void 0);
    };
  }, [id, setLabelId]);
  return id;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/labelable-provider/useLabel.mjs
function useLabel(params = {}) {
  const {
    id: idProp,
    fallbackControlId,
    native = false,
    setLabelId: setLabelIdProp,
    focusControl: focusControlProp
  } = params;
  const {
    controlId: contextControlId,
    setLabelId: setContextLabelId
  } = useLabelableContext();
  const syncLabelId = useStableCallback((nextLabelId) => {
    setContextLabelId(nextLabelId);
    setLabelIdProp?.(nextLabelId);
  });
  const id = useRegisteredLabelId(idProp, syncLabelId);
  const resolvedControlId = contextControlId ?? fallbackControlId;
  function focusControl(event) {
    if (focusControlProp) {
      focusControlProp(event, resolvedControlId);
      return;
    }
    if (!resolvedControlId) {
      return;
    }
    const controlElement = ownerDocument(event.currentTarget).getElementById(resolvedControlId);
    if (isHTMLElement(controlElement)) {
      focusElementWithVisible(controlElement);
    }
  }
  function handleInteraction(event) {
    const target = getTarget(event.nativeEvent);
    if (target?.closest("button,input,select,textarea")) {
      return;
    }
    if (!event.defaultPrevented && event.detail > 1) {
      event.preventDefault();
    }
    if (native) {
      return;
    }
    focusControl(event);
  }
  return native ? {
    id,
    htmlFor: resolvedControlId ?? void 0,
    onMouseDown: handleInteraction
  } : {
    id,
    onClick: handleInteraction,
    onPointerDown(event) {
      event.preventDefault();
    }
  };
}
function focusElementWithVisible(element) {
  element.focus({
    // Available from Chrome 144+ (January 2026).
    // Safari and Firefox already support it.
    focusVisible: true
  });
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/label/SliderLabel.mjs
var SliderLabel = /* @__PURE__ */ react_esm_exports.forwardRef(function SliderLabel2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const elementPropsWithoutId = elementProps;
  delete elementPropsWithoutId.id;
  const {
    state,
    setLabelId,
    controlRef,
    rootLabelId
  } = useSliderRootContext();
  function focusControl(event, controlId) {
    if (controlId) {
      const controlElement = ownerDocument(event.currentTarget).getElementById(controlId);
      if (isHTMLElement(controlElement)) {
        focusElementWithVisible(controlElement);
        return;
      }
    }
    const fallbackInputs = controlRef.current?.querySelectorAll('input[type="range"]');
    const fallbackInput = fallbackInputs?.length === 1 ? fallbackInputs[0] : null;
    if (isHTMLElement(fallbackInput)) {
      focusElementWithVisible(fallbackInput);
    }
  }
  const labelProps = useLabel({
    id: rootLabelId,
    setLabelId,
    focusControl
  });
  return useRenderElement("div", componentProps, {
    ref: forwardedRef,
    state,
    props: [labelProps, elementProps],
    stateAttributesMapping: sliderStateAttributesMapping
  });
});
if (false) SliderLabel.displayName = "SliderLabel";

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/utils/stringifyLocale.mjs
function stringifyLocale(locale) {
  if (Array.isArray(locale)) {
    return locale.map((value) => stringifyLocale(value)).join(",");
  }
  if (locale == null) {
    return "";
  }
  return String(locale);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/utils/formatNumber.mjs
var cache = /* @__PURE__ */ new Map();
function getFormatter(locale, options) {
  const optionsString = JSON.stringify({
    locale: stringifyLocale(locale),
    options
  });
  const cachedFormatter = cache.get(optionsString);
  if (cachedFormatter) {
    return cachedFormatter;
  }
  const formatter = new Intl.NumberFormat(locale, options);
  cache.set(optionsString, formatter);
  return formatter;
}
function formatNumber(value, locale, options) {
  if (value == null) {
    return "";
  }
  return getFormatter(locale, options).format(value);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/value/SliderValue.mjs
var SliderValue = /* @__PURE__ */ react_esm_exports.forwardRef(function SliderValue2(componentProps, forwardedRef) {
  const {
    "aria-live": ariaLive = "off",
    render,
    className,
    children,
    style,
    ...elementProps
  } = componentProps;
  const {
    thumbMap,
    state,
    values,
    formatOptionsRef,
    locale
  } = useSliderRootContext();
  let htmlFor = "";
  for (const thumbMetadata of thumbMap.values()) {
    if (thumbMetadata?.inputId) {
      htmlFor += `${thumbMetadata.inputId} `;
    }
  }
  const outputFor = htmlFor.trim() === "" ? void 0 : htmlFor.trim();
  const formattedValues = react_esm_exports.useMemo(() => {
    const arr = [];
    for (let i = 0; i < values.length; i += 1) {
      arr.push(formatNumber(values[i], locale, formatOptionsRef.current ?? void 0));
    }
    return arr;
  }, [formatOptionsRef, locale, values]);
  const defaultDisplayValue = values.map((v, i) => formattedValues[i] || v).join(" \u2013 ");
  const element = useRenderElement("output", componentProps, {
    state,
    ref: forwardedRef,
    props: [{
      // off by default because it will keep announcing when the slider is being dragged
      // and also when the value is changing (but not yet committed)
      "aria-live": ariaLive,
      children: typeof children === "function" ? children(formattedValues, values) : defaultDisplayValue,
      htmlFor: outputFor
    }, elementProps],
    stateAttributesMapping: sliderStateAttributesMapping
  });
  return element;
});
if (false) SliderValue.displayName = "SliderValue";

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/addEventListener.mjs
function addEventListener(target, type, listener, options) {
  target.addEventListener(type, listener, options);
  return () => {
    target.removeEventListener(type, listener, options);
  };
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useOnMount.mjs
var EMPTY = [];
function useOnMount(fn) {
  react_esm_exports.useEffect(fn, EMPTY);
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useAnimationFrame.mjs
var EMPTY2 = null;
var LAST_RAF = globalThis.requestAnimationFrame;
var Scheduler = class {
  /* This implementation uses an array as a backing data-structure for frame callbacks.
   * It allows `O(1)` callback cancelling by inserting a `null` in the array, though it
   * never calls the native `cancelAnimationFrame` if there are no frames left. This can
   * be much more efficient if there is a call pattern that alterns as
   * "request-cancel-request-cancel-…".
   * But in the case of "request-request-…-cancel-cancel-…", it leaves the final animation
   * frame to run anyway. We turn that frame into a `O(1)` no-op via `callbacksCount`. */
  callbacks = [];
  callbacksCount = 0;
  nextId = 1;
  startId = 1;
  isScheduled = false;
  tick = (timestamp) => {
    this.isScheduled = false;
    const currentCallbacks = this.callbacks;
    const currentCallbacksCount = this.callbacksCount;
    this.callbacks = [];
    this.callbacksCount = 0;
    this.startId = this.nextId;
    if (currentCallbacksCount > 0) {
      for (let i = 0; i < currentCallbacks.length; i += 1) {
        currentCallbacks[i]?.(timestamp);
      }
    }
  };
  request(fn) {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.push(fn);
    this.callbacksCount += 1;
    const didRAFChange = false;
    if (!this.isScheduled || didRAFChange) {
      requestAnimationFrame(this.tick);
      this.isScheduled = true;
    }
    return id;
  }
  cancel(id) {
    const index = id - this.startId;
    if (index < 0 || index >= this.callbacks.length) {
      return;
    }
    this.callbacks[index] = null;
    this.callbacksCount -= 1;
  }
};
var scheduler = new Scheduler();
var AnimationFrame = class _AnimationFrame {
  static create() {
    return new _AnimationFrame();
  }
  static request(fn) {
    return scheduler.request(fn);
  }
  static cancel(id) {
    return scheduler.cancel(id);
  }
  currentId = EMPTY2;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  request(fn) {
    this.cancel();
    this.currentId = scheduler.request(() => {
      this.currentId = EMPTY2;
      fn();
    });
  }
  cancel = () => {
    if (this.currentId !== EMPTY2) {
      scheduler.cancel(this.currentId);
      this.currentId = EMPTY2;
    }
  };
  disposeEffect = () => {
    return this.cancel;
  };
};
function useAnimationFrame() {
  const timeout = useRefWithInit(AnimationFrame.create).current;
  useOnMount(timeout.disposeEffect);
  return timeout;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/direction-context/DirectionContext.mjs
var DirectionContext = /* @__PURE__ */ react_esm_exports.createContext(void 0);
if (false) DirectionContext.displayName = "DirectionContext";
function useDirection() {
  const context = react_esm_exports.useContext(DirectionContext);
  return context?.direction ?? "ltr";
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/utils/getMidpoint.mjs
function getMidpoint(element) {
  const rect = element.getBoundingClientRect();
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2
  };
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/utils/roundValueToStep.mjs
function getDecimalPrecision(num) {
  if (num === 0) {
    return 0;
  }
  if (Math.abs(num) < 1) {
    const parts = num.toExponential().split("e-");
    const matissaDecimalPart = parts[0].split(".")[1];
    return (matissaDecimalPart ? matissaDecimalPart.length : 0) + parseInt(parts[1], 10);
  }
  const decimalPart = num.toString().split(".")[1];
  return decimalPart ? decimalPart.length : 0;
}
function roundValueToStep(value, step, min) {
  const nearest = Math.round((value - min) / step) * step + min;
  return Number(nearest.toFixed(Math.max(getDecimalPrecision(step), getDecimalPrecision(min))));
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/utils/getPushedThumbValues.mjs
function getPushedThumbValues({
  values,
  index,
  nextValue,
  min,
  max,
  step,
  minStepsBetweenValues,
  initialValues
}) {
  if (values.length === 0) {
    return [];
  }
  const nextValues = values.slice();
  const minValueDifference = step * minStepsBetweenValues;
  const lastIndex = nextValues.length - 1;
  const baseInitialValues = initialValues ?? values;
  const indexMin = min + index * minValueDifference;
  const indexMax = max - (lastIndex - index) * minValueDifference;
  nextValues[index] = clamp(nextValue, indexMin, indexMax);
  for (let i = index + 1; i <= lastIndex; i += 1) {
    const minAllowed = nextValues[i - 1] + minValueDifference;
    const maxAllowed = max - (lastIndex - i) * minValueDifference;
    const initialValue = baseInitialValues[i] ?? nextValues[i];
    let candidate = Math.max(nextValues[i], minAllowed);
    if (initialValue < candidate) {
      candidate = Math.max(initialValue, minAllowed);
    }
    nextValues[i] = clamp(candidate, minAllowed, maxAllowed);
  }
  for (let i = index - 1; i >= 0; i -= 1) {
    const maxAllowed = nextValues[i + 1] - minValueDifference;
    const minAllowed = min + i * minValueDifference;
    const initialValue = baseInitialValues[i] ?? nextValues[i];
    let candidate = Math.min(nextValues[i], maxAllowed);
    if (initialValue > candidate) {
      candidate = Math.min(initialValue, maxAllowed);
    }
    nextValues[i] = clamp(candidate, minAllowed, maxAllowed);
  }
  for (let i = 0; i <= lastIndex; i += 1) {
    nextValues[i] = Number(nextValues[i].toFixed(12));
  }
  return nextValues;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/utils/resolveThumbCollision.mjs
function resolveThumbCollision({
  behavior,
  values,
  currentValues,
  initialValues,
  pressedIndex,
  nextValue,
  min,
  max,
  step,
  minStepsBetweenValues
}) {
  const activeValues = currentValues ?? values;
  const baselineValues = initialValues ?? values;
  const range = activeValues.length > 1;
  if (!range) {
    return {
      value: nextValue,
      thumbIndex: 0,
      didSwap: false
    };
  }
  const minValueDifference = step * minStepsBetweenValues;
  switch (behavior) {
    case "swap": {
      const pressedInitialValue = activeValues[pressedIndex];
      const epsilon = 1e-7;
      const candidateValues = activeValues.slice();
      const previousNeighbor = candidateValues[pressedIndex - 1];
      const nextNeighbor = candidateValues[pressedIndex + 1];
      const lowerBound = previousNeighbor != null ? previousNeighbor + minValueDifference : min;
      const upperBound = nextNeighbor != null ? nextNeighbor - minValueDifference : max;
      const constrainedValue = clamp(nextValue, lowerBound, upperBound);
      const pressedValueAfterClamp = Number(constrainedValue.toFixed(12));
      candidateValues[pressedIndex] = pressedValueAfterClamp;
      const movingForward = nextValue > pressedInitialValue;
      const movingBackward = nextValue < pressedInitialValue;
      const shouldSwapForward = movingForward && nextNeighbor != null && nextValue >= nextNeighbor - epsilon;
      const shouldSwapBackward = movingBackward && previousNeighbor != null && nextValue <= previousNeighbor + epsilon;
      if (!shouldSwapForward && !shouldSwapBackward) {
        return {
          value: candidateValues,
          thumbIndex: pressedIndex,
          didSwap: false
        };
      }
      const targetIndex = shouldSwapForward ? pressedIndex + 1 : pressedIndex - 1;
      const initialValuesForPush = candidateValues.map((_, index) => {
        if (index === pressedIndex) {
          return pressedValueAfterClamp;
        }
        const baseline = baselineValues[index];
        if (baseline != null) {
          return baseline;
        }
        return activeValues[index];
      });
      let nextValueForTarget = nextValue;
      if (shouldSwapForward) {
        nextValueForTarget = Math.max(nextValue, candidateValues[targetIndex]);
      } else {
        nextValueForTarget = Math.min(nextValue, candidateValues[targetIndex]);
      }
      const adjustedValues = getPushedThumbValues({
        values: candidateValues,
        index: targetIndex,
        nextValue: nextValueForTarget,
        min,
        max,
        step,
        minStepsBetweenValues,
        initialValues: initialValuesForPush
      });
      const neighborIndex = shouldSwapForward ? targetIndex - 1 : targetIndex + 1;
      if (neighborIndex >= 0 && neighborIndex < adjustedValues.length) {
        const previousValue = adjustedValues[neighborIndex - 1];
        const nextValueAfter = adjustedValues[neighborIndex + 1];
        let neighborLowerBound = previousValue != null ? previousValue + minValueDifference : min;
        neighborLowerBound = Math.max(neighborLowerBound, min + neighborIndex * minValueDifference);
        let neighborUpperBound = nextValueAfter != null ? nextValueAfter - minValueDifference : max;
        neighborUpperBound = Math.min(neighborUpperBound, max - (adjustedValues.length - 1 - neighborIndex) * minValueDifference);
        const restoredValue = clamp(pressedValueAfterClamp, neighborLowerBound, neighborUpperBound);
        adjustedValues[neighborIndex] = Number(restoredValue.toFixed(12));
      }
      return {
        value: adjustedValues,
        thumbIndex: targetIndex,
        didSwap: true
      };
    }
    case "push": {
      const nextValues = getPushedThumbValues({
        values: activeValues,
        index: pressedIndex,
        nextValue,
        min,
        max,
        step,
        minStepsBetweenValues
      });
      return {
        value: nextValues,
        thumbIndex: pressedIndex,
        didSwap: false
      };
    }
    case "none":
    default: {
      const candidateValues = activeValues.slice();
      const previousNeighbor = candidateValues[pressedIndex - 1];
      const nextNeighbor = candidateValues[pressedIndex + 1];
      const lowerBound = previousNeighbor != null ? previousNeighbor + minValueDifference : min;
      const upperBound = nextNeighbor != null ? nextNeighbor - minValueDifference : max;
      const constrainedValue = clamp(nextValue, lowerBound, upperBound);
      candidateValues[pressedIndex] = Number(constrainedValue.toFixed(12));
      return {
        value: candidateValues,
        thumbIndex: pressedIndex,
        didSwap: false
      };
    }
  }
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/control/SliderControl.mjs
var INTENTIONAL_DRAG_COUNT_THRESHOLD = 2;
function getControlOffset(styles, vertical) {
  if (!styles) {
    return {
      start: 0,
      end: 0
    };
  }
  function parseSize(value) {
    const parsed = value != null ? parseFloat(value) : 0;
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  const start = !vertical ? "InlineStart" : "Top";
  const end = !vertical ? "InlineEnd" : "Bottom";
  return {
    start: parseSize(styles[`border${start}Width`]) + parseSize(styles[`padding${start}`]),
    end: parseSize(styles[`border${end}Width`]) + parseSize(styles[`padding${end}`])
  };
}
function getFingerCoords(event, touchIdRef) {
  if (touchIdRef.current != null && event.changedTouches) {
    const touchEvent = event;
    for (let i = 0; i < touchEvent.changedTouches.length; i += 1) {
      const touch = touchEvent.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        return {
          x: touch.clientX,
          y: touch.clientY
        };
      }
    }
    return null;
  }
  return {
    x: event.clientX,
    y: event.clientY
  };
}
var SliderControl = /* @__PURE__ */ react_esm_exports.forwardRef(function SliderControl2(componentProps, forwardedRef) {
  const {
    render: renderProp,
    className,
    style,
    ...elementProps
  } = componentProps;
  const {
    disabled: disabled2,
    dragging,
    inset,
    lastChangeReasonRef,
    max,
    min,
    minStepsBetweenValues,
    onValueCommitted,
    orientation,
    pressedInputRef,
    pressedThumbCenterOffsetRef,
    pressedThumbIndexRef,
    pressedValuesRef,
    registerFieldControlRef,
    renderBeforeHydration,
    setActive,
    setDragging,
    setValue,
    state,
    step,
    thumbCollisionBehavior,
    thumbRefs,
    values
  } = useSliderRootContext();
  const direction = useDirection();
  const range = values.length > 1;
  const vertical = orientation === "vertical";
  const controlRef = react_esm_exports.useRef(null);
  const stylesRef = react_esm_exports.useRef(null);
  const setStylesRef = useStableCallback((element2) => {
    if (element2 && stylesRef.current == null) {
      stylesRef.current = getWindow(element2).getComputedStyle(element2);
    }
  });
  const touchIdRef = react_esm_exports.useRef(null);
  const moveCountRef = react_esm_exports.useRef(0);
  const insetThumbOffsetRef = react_esm_exports.useRef(0);
  const currentInteractionValueRef = react_esm_exports.useRef(null);
  const latestValuesRef = useValueAsRef(values);
  function updatePressedThumb(nextIndex) {
    if (pressedThumbIndexRef.current !== nextIndex) {
      pressedThumbIndexRef.current = nextIndex;
    }
    const thumbElement = thumbRefs.current[nextIndex];
    if (!thumbElement) {
      pressedThumbCenterOffsetRef.current = null;
      pressedInputRef.current = null;
      return;
    }
    pressedInputRef.current = thumbElement.querySelector('input[type="range"]');
  }
  function resetPressedThumb() {
    pressedThumbIndexRef.current = -1;
    pressedThumbCenterOffsetRef.current = null;
    pressedInputRef.current = null;
  }
  function isTargetDisabledThumb(target) {
    if (!isElement(target)) {
      return false;
    }
    return thumbRefs.current.some((thumbEl) => {
      if (!isElement(thumbEl) || !contains(thumbEl, target)) {
        return false;
      }
      return thumbEl.querySelector('input[type="range"]')?.disabled === true;
    });
  }
  function getFingerState(fingerCoords) {
    const control = controlRef.current;
    const thumbIndex = pressedThumbIndexRef.current;
    if (!control || !range && (thumbIndex < 0 || thumbIndex >= values.length)) {
      return null;
    }
    const {
      width,
      height,
      bottom,
      left,
      right
    } = control.getBoundingClientRect();
    const controlOffset = getControlOffset(stylesRef.current, vertical);
    const insetThumbOffset = insetThumbOffsetRef.current;
    const controlSize = (vertical ? height : width) - controlOffset.start - controlOffset.end - insetThumbOffset * 2;
    const thumbCenterOffset = pressedThumbCenterOffsetRef.current ?? 0;
    const fingerX = fingerCoords.x - thumbCenterOffset;
    const fingerY = fingerCoords.y - thumbCenterOffset;
    const valueSize = vertical ? bottom - fingerY - controlOffset.end : (direction === "rtl" ? right - fingerX : fingerX - left) - controlOffset.start;
    const valueRescaled = clamp((valueSize - insetThumbOffset) / controlSize, 0, 1);
    let newValue = (max - min) * valueRescaled + min;
    newValue = roundValueToStep(newValue, step, min);
    newValue = clamp(newValue, min, max);
    if (!range) {
      return {
        value: newValue,
        thumbIndex,
        didSwap: false
      };
    }
    if (thumbIndex < 0) {
      return null;
    }
    const collisionResult = resolveThumbCollision({
      behavior: thumbCollisionBehavior,
      values,
      currentValues: latestValuesRef.current ?? values,
      initialValues: pressedValuesRef.current,
      pressedIndex: thumbIndex,
      nextValue: newValue,
      min,
      max,
      step,
      minStepsBetweenValues
    });
    return collisionResult;
  }
  function startPressing(fingerCoords) {
    pressedValuesRef.current = range ? values.slice() : null;
    currentInteractionValueRef.current = null;
    latestValuesRef.current = values;
    const pressedThumbIndex = pressedThumbIndexRef.current;
    let closestThumbIndex = pressedThumbIndex;
    if (pressedThumbIndex > -1 && pressedThumbIndex < values.length) {
      if (values[pressedThumbIndex] === max) {
        let candidateIndex = pressedThumbIndex;
        while (candidateIndex > 0 && values[candidateIndex - 1] === max) {
          candidateIndex -= 1;
        }
        closestThumbIndex = candidateIndex;
      }
    } else {
      const axis = !vertical ? "x" : "y";
      let minDistance;
      closestThumbIndex = -1;
      for (let i = 0; i < thumbRefs.current.length; i += 1) {
        const thumbEl = thumbRefs.current[i];
        if (isElement(thumbEl) && !thumbEl.querySelector('input[type="range"]')?.disabled) {
          const midpoint = getMidpoint(thumbEl);
          const distance = Math.abs(fingerCoords[axis] - midpoint[axis]);
          if (minDistance === void 0 || distance <= minDistance) {
            closestThumbIndex = i;
            minDistance = distance;
          }
        }
      }
    }
    if (closestThumbIndex > -1 && closestThumbIndex !== pressedThumbIndex) {
      updatePressedThumb(closestThumbIndex);
    }
    if (inset) {
      const thumbEl = thumbRefs.current[closestThumbIndex];
      if (isElement(thumbEl)) {
        const thumbRect = thumbEl.getBoundingClientRect();
        const side = !vertical ? "width" : "height";
        insetThumbOffsetRef.current = thumbRect[side] / 2;
      }
    }
  }
  function focusThumb(thumbIndex) {
    const input = thumbRefs.current?.[thumbIndex]?.querySelector('input[type="range"]');
    if (!input) {
      return;
    }
    input.focus({
      preventScroll: true,
      // Prevent pointer-driven focus rings in browsers that support this option.
      // Supported in Chrome from 144+.
      focusVisible: false
    });
  }
  function setValueFromPointer(finger, reason, nativeEvent) {
    const applied = setValue(finger.value, createChangeEventDetails(reason, nativeEvent, void 0, {
      activeThumbIndex: finger.thumbIndex
    }));
    if (applied) {
      currentInteractionValueRef.current = finger.value;
      latestValuesRef.current = Array.isArray(finger.value) ? finger.value : [finger.value];
      if (finger.didSwap) {
        updatePressedThumb(finger.thumbIndex);
      }
    }
    return applied;
  }
  const handleTouchMove = useStableCallback((nativeEvent) => {
    const fingerCoords = getFingerCoords(nativeEvent, touchIdRef);
    if (fingerCoords == null) {
      return;
    }
    moveCountRef.current += 1;
    if (nativeEvent.type === "pointermove" && nativeEvent.buttons === 0) {
      handleTouchEnd(nativeEvent);
      return;
    }
    const finger = getFingerState(fingerCoords);
    if (finger == null) {
      return;
    }
    if (validateMinimumDistance(finger.value, step, minStepsBetweenValues)) {
      if (!dragging && moveCountRef.current > INTENTIONAL_DRAG_COUNT_THRESHOLD) {
        setDragging(true);
      }
      const applied = setValueFromPointer(finger, reason_parts_exports.drag, nativeEvent);
      if (applied && finger.didSwap) {
        focusThumb(finger.thumbIndex);
      }
    }
  });
  const handleTouchEnd = useStableCallback((nativeEvent) => {
    setActive(-1);
    setDragging(false);
    pressedInputRef.current = null;
    pressedThumbCenterOffsetRef.current = null;
    if (currentInteractionValueRef.current != null) {
      const commitReason = lastChangeReasonRef.current;
      onValueCommitted(currentInteractionValueRef.current, createGenericEventDetails(commitReason, nativeEvent));
    }
    if ("pointerType" in nativeEvent && controlRef.current?.hasPointerCapture(nativeEvent.pointerId)) {
      controlRef.current?.releasePointerCapture(nativeEvent.pointerId);
    }
    pressedThumbIndexRef.current = -1;
    touchIdRef.current = null;
    pressedValuesRef.current = null;
    currentInteractionValueRef.current = null;
    stopListening();
  });
  const handleTouchStart = useStableCallback((nativeEvent) => {
    if (disabled2) {
      return;
    }
    if (isTargetDisabledThumb(getTarget(nativeEvent))) {
      resetPressedThumb();
      return;
    }
    const touch = nativeEvent.changedTouches[0];
    if (touch != null) {
      touchIdRef.current = touch.identifier;
    }
    const fingerCoords = getFingerCoords(nativeEvent, touchIdRef);
    if (fingerCoords != null) {
      startPressing(fingerCoords);
      const finger = getFingerState(fingerCoords);
      if (finger == null) {
        return;
      }
      focusThumb(finger.thumbIndex);
      const applied = setValueFromPointer(finger, reason_parts_exports.trackPress, nativeEvent);
      if (applied && finger.didSwap) {
        focusThumb(finger.thumbIndex);
      }
    }
    moveCountRef.current = 0;
    const doc = ownerDocument(controlRef.current);
    doc.addEventListener("touchmove", handleTouchMove, {
      passive: true
    });
    doc.addEventListener("touchend", handleTouchEnd, {
      passive: true
    });
  });
  const stopListening = useStableCallback(() => {
    const doc = ownerDocument(controlRef.current);
    doc.removeEventListener("pointermove", handleTouchMove);
    doc.removeEventListener("pointerup", handleTouchEnd);
    doc.removeEventListener("touchmove", handleTouchMove);
    doc.removeEventListener("touchend", handleTouchEnd);
    pressedValuesRef.current = null;
    currentInteractionValueRef.current = null;
  });
  const focusFrame = useAnimationFrame();
  react_esm_exports.useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return () => stopListening();
    }
    const unsubscribeTouchStart = addEventListener(control, "touchstart", handleTouchStart, {
      passive: true
    });
    return () => {
      unsubscribeTouchStart();
      focusFrame.cancel();
      stopListening();
    };
  }, [stopListening, handleTouchStart, controlRef, focusFrame]);
  react_esm_exports.useEffect(() => {
    if (disabled2) {
      stopListening();
    }
  }, [disabled2, stopListening]);
  const element = useRenderElement("div", componentProps, {
    state,
    ref: [forwardedRef, registerFieldControlRef, controlRef, setStylesRef],
    props: [{
      ["data-base-ui-slider-control"]: renderBeforeHydration ? "" : void 0,
      onPointerDown(event) {
        const control = controlRef.current;
        const target = getTarget(event.nativeEvent);
        if (!control || disabled2 || event.defaultPrevented || !isElement(target) || // Only handle left clicks
        event.button !== 0) {
          return;
        }
        if (isTargetDisabledThumb(target)) {
          resetPressedThumb();
          return;
        }
        const fingerCoords = getFingerCoords(event, touchIdRef);
        if (fingerCoords != null) {
          startPressing(fingerCoords);
          const finger = getFingerState(fingerCoords);
          if (finger == null) {
            return;
          }
          const pressedOnFocusedThumb = contains(thumbRefs.current[finger.thumbIndex], activeElement(ownerDocument(control)));
          if (pressedOnFocusedThumb) {
            event.preventDefault();
          } else {
            focusFrame.request(() => {
              focusThumb(finger.thumbIndex);
            });
          }
          setDragging(true);
          const pressedOnAnyThumb = pressedThumbCenterOffsetRef.current != null;
          if (!pressedOnAnyThumb) {
            const applied = setValueFromPointer(finger, reason_parts_exports.trackPress, event.nativeEvent);
            if (applied && finger.didSwap) {
              focusThumb(finger.thumbIndex);
            }
          }
        }
        if (event.nativeEvent.pointerId) {
          control.setPointerCapture(event.nativeEvent.pointerId);
        }
        moveCountRef.current = 0;
        const doc = ownerDocument(controlRef.current);
        doc.addEventListener("pointermove", handleTouchMove, {
          passive: true
        });
        doc.addEventListener("pointerup", handleTouchEnd, {
          once: true
        });
      }
    }, elementProps],
    stateAttributesMapping: sliderStateAttributesMapping
  });
  return element;
});
if (false) SliderControl.displayName = "SliderControl";

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/track/SliderTrack.mjs
var SliderTrack = /* @__PURE__ */ react_esm_exports.forwardRef(function SliderTrack2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const {
    state
  } = useSliderRootContext();
  const element = useRenderElement("div", componentProps, {
    state,
    ref: forwardedRef,
    props: [{
      style: {
        position: "relative"
      }
    }, elementProps],
    stateAttributesMapping: sliderStateAttributesMapping
  });
  return element;
});
if (false) SliderTrack.displayName = "SliderTrack";

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/visuallyHidden.mjs
var visuallyHiddenBase = {
  clipPath: "inset(50%)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  border: 0,
  padding: 0,
  width: 1,
  height: 1,
  margin: -1
};
var visuallyHidden = {
  ...visuallyHiddenBase,
  position: "fixed",
  top: 0,
  left: 0
};
var visuallyHiddenInput = {
  ...visuallyHiddenBase,
  position: "absolute"
};

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/utils/useIsHydrating.mjs
function subscribe() {
  return NOOP;
}
function getSnapshot() {
  return false;
}
function getServerSnapshot() {
  return true;
}
function useIsHydrating() {
  return (0, react_esm_exports.useSyncExternalStore)(subscribe, getSnapshot, getServerSnapshot);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/utils/valueToPercent.mjs
function valueToPercent(value, min, max) {
  return (value - min) * 100 / (max - min);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/composite/composite.mjs
var ARROW_UP = "ArrowUp";
var ARROW_DOWN = "ArrowDown";
var ARROW_LEFT = "ArrowLeft";
var ARROW_RIGHT = "ArrowRight";
var HOME = "Home";
var END = "End";
var PAGE_UP = "PageUp";
var PAGE_DOWN = "PageDown";
var HORIZONTAL_KEYS = /* @__PURE__ */ new Set([ARROW_LEFT, ARROW_RIGHT]);
var VERTICAL_KEYS = /* @__PURE__ */ new Set([ARROW_UP, ARROW_DOWN]);
var ARROW_KEYS = /* @__PURE__ */ new Set([...HORIZONTAL_KEYS, ...VERTICAL_KEYS]);
var COMPOSITE_KEYS = /* @__PURE__ */ new Set([...ARROW_KEYS, HOME, END]);

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/composite/list/useCompositeListItem.mjs
var IndexGuessBehavior = /* @__PURE__ */ (function(IndexGuessBehavior2) {
  IndexGuessBehavior2[IndexGuessBehavior2["None"] = 0] = "None";
  IndexGuessBehavior2[IndexGuessBehavior2["GuessFromOrder"] = 1] = "GuessFromOrder";
  return IndexGuessBehavior2;
})({});
function useCompositeListItem(params = {}) {
  const {
    label,
    metadata,
    textRef,
    indexGuessBehavior,
    index: externalIndex
  } = params;
  const {
    register,
    unregister,
    subscribeMapChange,
    elementsRef,
    labelsRef,
    nextIndexRef
  } = useCompositeListContext();
  const indexRef = react_esm_exports.useRef(-1);
  const [index, setIndex] = react_esm_exports.useState(externalIndex ?? (indexGuessBehavior === IndexGuessBehavior.GuessFromOrder ? () => {
    if (indexRef.current === -1) {
      const newIndex = nextIndexRef.current;
      nextIndexRef.current += 1;
      indexRef.current = newIndex;
    }
    return indexRef.current;
  } : -1));
  const componentRef = react_esm_exports.useRef(null);
  const ref = react_esm_exports.useCallback((node) => {
    componentRef.current = node;
    if (index !== -1 && node !== null) {
      elementsRef.current[index] = node;
      if (labelsRef) {
        const isLabelDefined = label !== void 0;
        labelsRef.current[index] = isLabelDefined ? label : textRef?.current?.textContent ?? node.textContent;
      }
    }
  }, [index, elementsRef, labelsRef, label, textRef]);
  useIsoLayoutEffect(() => {
    if (externalIndex != null) {
      return void 0;
    }
    const node = componentRef.current;
    if (node) {
      register(node, metadata);
      return () => {
        unregister(node);
      };
    }
    return void 0;
  }, [externalIndex, register, unregister, metadata]);
  useIsoLayoutEffect(() => {
    if (externalIndex != null) {
      return void 0;
    }
    return subscribeMapChange((map) => {
      const i = componentRef.current ? map.get(componentRef.current)?.index : null;
      if (i != null) {
        setIndex(i);
      }
    });
  }, [externalIndex, subscribeMapChange, setIndex]);
  return {
    ref,
    index
  };
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/csp-context/CSPContext.mjs
var CSPContext = /* @__PURE__ */ react_esm_exports.createContext(void 0);
if (false) CSPContext.displayName = "CSPContext";
var DEFAULT_CSP_CONTEXT_VALUE = {
  disableStyleElements: false
};
function useCSPContext() {
  return react_esm_exports.useContext(CSPContext) ?? DEFAULT_CSP_CONTEXT_VALUE;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/labelable-provider/useLabelableId.mjs
function useLabelableId(params = {}) {
  const {
    id,
    implicit = false,
    controlRef
  } = params;
  const {
    controlId,
    registerControlId
  } = useLabelableContext();
  const defaultId = useBaseUiId(id);
  const controlIdForEffect = implicit ? controlId : void 0;
  const controlSourceRef = useRefWithInit(() => Symbol("labelable-control"));
  const hasRegisteredRef = react_esm_exports.useRef(false);
  const hadExplicitIdRef = react_esm_exports.useRef(id != null);
  const unregisterControlId = useStableCallback(() => {
    if (!hasRegisteredRef.current || registerControlId === NOOP) {
      return;
    }
    hasRegisteredRef.current = false;
    registerControlId(controlSourceRef.current, void 0);
  });
  useIsoLayoutEffect(() => {
    if (registerControlId === NOOP) {
      return void 0;
    }
    let nextId;
    if (implicit) {
      const elem = controlRef?.current;
      if (isElement(elem) && elem.closest("label") != null) {
        nextId = id ?? null;
      } else {
        nextId = controlIdForEffect ?? defaultId;
      }
    } else if (id != null) {
      hadExplicitIdRef.current = true;
      nextId = id;
    } else if (hadExplicitIdRef.current) {
      nextId = defaultId;
    } else {
      unregisterControlId();
      return void 0;
    }
    if (nextId === void 0) {
      unregisterControlId();
      return void 0;
    }
    hasRegisteredRef.current = true;
    registerControlId(controlSourceRef.current, nextId);
    return void 0;
  }, [id, controlRef, controlIdForEffect, registerControlId, implicit, defaultId, controlSourceRef, unregisterControlId]);
  react_esm_exports.useEffect(() => {
    return unregisterControlId;
  }, [unregisterControlId]);
  return controlId ?? defaultId;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/thumb/SliderThumbDataAttributes.mjs
var SliderThumbDataAttributes = /* @__PURE__ */ (function(SliderThumbDataAttributes2) {
  SliderThumbDataAttributes2["index"] = "data-index";
  SliderThumbDataAttributes2["dragging"] = "data-dragging";
  SliderThumbDataAttributes2["orientation"] = "data-orientation";
  SliderThumbDataAttributes2["disabled"] = "data-disabled";
  SliderThumbDataAttributes2["valid"] = "data-valid";
  SliderThumbDataAttributes2["invalid"] = "data-invalid";
  SliderThumbDataAttributes2["touched"] = "data-touched";
  SliderThumbDataAttributes2["dirty"] = "data-dirty";
  SliderThumbDataAttributes2["focused"] = "data-focused";
  return SliderThumbDataAttributes2;
})({});

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/thumb/prehydrationScript.min.mjs
var script = '!function(){const t=document.currentScript?.parentElement;if(!t)return;const e=t.closest("[data-base-ui-slider-control]");if(!e)return;const r=e.querySelector("[data-base-ui-slider-indicator]"),i=e.getBoundingClientRect(),n="vertical"===e.getAttribute("data-orientation")?"height":"width",o=e.querySelectorAll(\'input[type="range"]\'),l=o.length>1,s=o.length-1;let a=null,u=null;for(let t=0;t<o.length;t+=1){const e=o[t],y=parseFloat(e.getAttribute("value")??"");if(Number.isNaN(y))return;const c=e.parentElement;if(!c)return;const p=parseFloat(e.getAttribute("max")??"100"),g=parseFloat(e.getAttribute("min")??"0"),b=c?.getBoundingClientRect(),d=i[n]-b[n],m=100*(y-g)/(p-g),v=(b[n]/2+d*m/100)/i[n]*100;c.style.setProperty("--position",`${v}%`),Number.isFinite(v)&&(c.style.removeProperty("visibility"),r&&(0===t?(a=v,r.style.setProperty("--start-position",`${v}%`),l||r.style.removeProperty("visibility")):t===s&&(u=v-(a??0),r.style.setProperty("--end-position",`${v}%`),r.style.setProperty("--relative-size",`${u}%`),r.style.removeProperty("visibility"))))}}();';

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/thumb/SliderThumb.mjs
import { jsx as _jsx3, jsxs as _jsxs } from "react/jsx-runtime";
var ALL_KEYS = /* @__PURE__ */ new Set([...COMPOSITE_KEYS, PAGE_UP, PAGE_DOWN]);
function getDefaultAriaValueText(values, index, format, locale) {
  if (index < 0) {
    return void 0;
  }
  if (values.length === 2) {
    if (index === 0) {
      return `${formatNumber(values[index], locale, format)} start range`;
    }
    return `${formatNumber(values[index], locale, format)} end range`;
  }
  return format ? formatNumber(values[index], locale, format) : void 0;
}
function getNewValue(thumbValue, increment, direction, min, max) {
  const value = direction === 1 ? thumbValue + increment : thumbValue - increment;
  const roundedValue = Number(value.toFixed(Math.max(getDecimalPrecision(thumbValue), getDecimalPrecision(increment), getDecimalPrecision(min))));
  return clamp(roundedValue, min, max);
}
var SliderThumb = /* @__PURE__ */ react_esm_exports.forwardRef(function SliderThumb2(componentProps, forwardedRef) {
  const {
    render,
    children: childrenProp,
    className,
    "aria-describedby": ariaDescribedByProp,
    "aria-label": ariaLabelProp,
    "aria-labelledby": ariaLabelledByProp,
    "aria-valuetext": ariaValueTextProp,
    disabled: disabledProp = false,
    getAriaLabel: getAriaLabelProp,
    getAriaValueText: getAriaValueTextProp,
    id: idProp,
    index: indexProp,
    inputRef: inputRefProp,
    onBlur: onBlurProp,
    onFocus: onFocusProp,
    onKeyDown: onKeyDownProp,
    tabIndex: tabIndexProp,
    style,
    ...elementProps
  } = componentProps;
  const {
    nonce
  } = useCSPContext();
  const id = useBaseUiId(idProp);
  const {
    active: activeIndex,
    lastUsedThumbIndex,
    controlRef,
    disabled: contextDisabled,
    validation,
    formatOptionsRef,
    handleInputChange,
    inset,
    labelId,
    largeStep,
    locale,
    max,
    min,
    minStepsBetweenValues,
    form,
    name,
    orientation,
    pressedInputRef,
    pressedThumbCenterOffsetRef,
    pressedThumbIndexRef,
    renderBeforeHydration,
    setActive,
    setIndicatorPosition,
    state,
    step,
    values: sliderValues
  } = useSliderRootContext();
  const direction = useDirection();
  const disabled2 = disabledProp || contextDisabled;
  const range = sliderValues.length > 1;
  const vertical = orientation === "vertical";
  const rtl = direction === "rtl";
  const {
    setTouched,
    setFocused,
    validationMode
  } = useFieldRootContext();
  const thumbRef = react_esm_exports.useRef(null);
  const inputRef = react_esm_exports.useRef(null);
  const restoringFocusVisibleRef = react_esm_exports.useRef(false);
  const defaultInputId = useBaseUiId();
  const labelableId = useLabelableId();
  const inputId = range ? defaultInputId : labelableId;
  const thumbMetadata = react_esm_exports.useMemo(() => ({
    inputId
  }), [inputId]);
  const {
    ref: listItemRef,
    index: compositeIndex
  } = useCompositeListItem({
    metadata: thumbMetadata
  });
  const index = !range ? 0 : indexProp ?? compositeIndex;
  const last = index === sliderValues.length - 1;
  const thumbValue = sliderValues[index];
  const thumbValuePercent = valueToPercent(thumbValue, min, max);
  const [positionPercent, setPositionPercent] = react_esm_exports.useState();
  const isHydrating = useIsHydrating();
  const safeLastUsedThumbIndex = lastUsedThumbIndex >= 0 && lastUsedThumbIndex < sliderValues.length ? lastUsedThumbIndex : -1;
  const getInsetPosition = useStableCallback(() => {
    const control = controlRef.current;
    const thumb = thumbRef.current;
    if (!control || !thumb) {
      return;
    }
    const thumbRect = thumb.getBoundingClientRect();
    const controlRect = control.getBoundingClientRect();
    const side = vertical ? "height" : "width";
    const controlSize = controlRect[side] - thumbRect[side];
    const thumbOffsetFromControlEdge = thumbRect[side] / 2 + controlSize * thumbValuePercent / 100;
    const nextPositionPercent = thumbOffsetFromControlEdge / controlRect[side] * 100;
    const nextInsetPosition = Number.isFinite(nextPositionPercent) ? nextPositionPercent : void 0;
    setPositionPercent(nextInsetPosition);
    if (index === 0) {
      setIndicatorPosition((prevPosition) => [nextInsetPosition, prevPosition[1]]);
    } else if (last) {
      setIndicatorPosition((prevPosition) => [prevPosition[0], nextInsetPosition]);
    }
  });
  useIsoLayoutEffect(() => {
    if (inset) {
      queueMicrotask(getInsetPosition);
    }
  }, [getInsetPosition, inset]);
  useIsoLayoutEffect(() => {
    if (inset) {
      getInsetPosition();
    }
  }, [getInsetPosition, inset, thumbValuePercent]);
  useIsoLayoutEffect(() => {
    if (!inset) {
      return void 0;
    }
    const control = controlRef.current;
    const thumb = thumbRef.current;
    if (!control || !thumb) {
      return void 0;
    }
    const ResizeObserverCtor = getWindow(control).ResizeObserver;
    if (typeof ResizeObserverCtor !== "function") {
      return void 0;
    }
    const resizeObserver = new ResizeObserverCtor(getInsetPosition);
    resizeObserver.observe(control);
    resizeObserver.observe(thumb);
    return () => {
      resizeObserver.disconnect();
    };
  }, [controlRef, getInsetPosition, inset]);
  const startEdge = vertical ? "bottom" : "insetInlineStart";
  const crossOffsetProperty = vertical ? "left" : "top";
  let zIndex;
  if (range) {
    if (activeIndex === index) {
      zIndex = 2;
    } else if (safeLastUsedThumbIndex === index) {
      zIndex = 1;
    }
  } else if (activeIndex === index) {
    zIndex = 1;
  }
  let thumbStyle;
  if (inset) {
    thumbStyle = {
      ["--position"]: `${positionPercent ?? 0}%`,
      visibility: renderBeforeHydration && isHydrating || positionPercent === void 0 ? "hidden" : void 0,
      position: "absolute",
      [startEdge]: "var(--position)",
      [crossOffsetProperty]: "50%",
      translate: `${(vertical || !rtl ? -1 : 1) * 50}% ${(vertical ? 1 : -1) * 50}%`,
      zIndex
    };
  } else {
    thumbStyle = !Number.isFinite(thumbValuePercent) ? visuallyHidden : {
      position: "absolute",
      [startEdge]: `${thumbValuePercent}%`,
      [crossOffsetProperty]: "50%",
      translate: `${(vertical || !rtl ? -1 : 1) * 50}% ${(vertical ? 1 : -1) * 50}%`,
      zIndex
    };
  }
  let cssWritingMode;
  if (orientation === "vertical") {
    cssWritingMode = rtl ? "vertical-rl" : "vertical-lr";
  }
  const ariaLabel = typeof getAriaLabelProp === "function" ? getAriaLabelProp(index) : ariaLabelProp;
  const inputProps = mergeProps({
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledByProp ?? (ariaLabel == null ? labelId : void 0),
    "aria-describedby": ariaDescribedByProp,
    "aria-orientation": orientation,
    "aria-valuenow": thumbValue,
    "aria-valuetext": typeof getAriaValueTextProp === "function" ? getAriaValueTextProp(formatNumber(thumbValue, locale, formatOptionsRef.current ?? void 0), thumbValue, index) : ariaValueTextProp ?? getDefaultAriaValueText(sliderValues, index, formatOptionsRef.current ?? void 0, locale),
    disabled: disabled2,
    form,
    id: inputId,
    max,
    min,
    name,
    onChange(event) {
      handleInputChange(event.currentTarget.valueAsNumber, index, event);
    },
    onFocus(event) {
      const isRestoringFocusVisible = restoringFocusVisibleRef.current;
      restoringFocusVisibleRef.current = false;
      setActive(index);
      setFocused(true);
      if (isRestoringFocusVisible) {
        event.stopPropagation();
      }
    },
    onBlur(event) {
      if (restoringFocusVisibleRef.current) {
        event.stopPropagation();
        return;
      }
      if (!thumbRef.current) {
        return;
      }
      setActive(-1);
      setTouched(true);
      setFocused(false);
      if (validationMode === "onBlur") {
        validation.commit(getSliderValue(thumbValue, index, min, max, range, sliderValues));
      }
    },
    onKeyDown(event) {
      if (event.defaultPrevented) {
        return;
      }
      if (!ALL_KEYS.has(event.key)) {
        return;
      }
      if (COMPOSITE_KEYS.has(event.key)) {
        event.stopPropagation();
      }
      let newValue = null;
      const roundedValue = roundValueToStep(thumbValue, step, min);
      switch (event.key) {
        case ARROW_UP:
          newValue = getNewValue(roundedValue, event.shiftKey ? largeStep : step, 1, min, max);
          break;
        case ARROW_RIGHT:
          newValue = getNewValue(roundedValue, event.shiftKey ? largeStep : step, rtl ? -1 : 1, min, max);
          break;
        case ARROW_DOWN:
          newValue = getNewValue(roundedValue, event.shiftKey ? largeStep : step, -1, min, max);
          break;
        case ARROW_LEFT:
          newValue = getNewValue(roundedValue, event.shiftKey ? largeStep : step, rtl ? 1 : -1, min, max);
          break;
        case PAGE_UP:
          newValue = getNewValue(roundedValue, largeStep, 1, min, max);
          break;
        case PAGE_DOWN:
          newValue = getNewValue(roundedValue, largeStep, -1, min, max);
          break;
        case END:
          newValue = max;
          if (range) {
            newValue = Number.isFinite(sliderValues[index + 1]) ? sliderValues[index + 1] - step * minStepsBetweenValues : max;
          }
          break;
        case HOME:
          newValue = min;
          if (range) {
            newValue = Number.isFinite(sliderValues[index - 1]) ? sliderValues[index - 1] + step * minStepsBetweenValues : min;
          }
          break;
        default:
          break;
      }
      if (newValue !== null) {
        const input = event.currentTarget;
        if (!matchesFocusVisible(input)) {
          restoringFocusVisibleRef.current = true;
          input.blur();
          input.focus({
            preventScroll: true,
            // Show `:focus-visible` after keyboard interaction, even if the
            // thumb was previously focused by a pointer.
            focusVisible: true
          });
        }
        handleInputChange(newValue, index, event);
        event.preventDefault();
      }
    },
    step,
    style: {
      ...visuallyHidden,
      // So that VoiceOver's focus indicator matches the thumb's dimensions
      width: "100%",
      height: "100%",
      writingMode: cssWritingMode
    },
    tabIndex: tabIndexProp ?? void 0,
    type: "range",
    value: thumbValue ?? ""
  }, (props) => validation.getValidationProps(disabled2, props), {
    onKeyDown: onKeyDownProp
  });
  const mergedInputRef = useMergedRefs(inputRef, validation.inputRef, inputRefProp);
  const element = useRenderElement("div", componentProps, {
    state,
    ref: [forwardedRef, listItemRef, thumbRef],
    props: [{
      [SliderThumbDataAttributes.index]: index,
      children: /* @__PURE__ */ _jsxs(react_esm_exports.Fragment, {
        children: [childrenProp, /* @__PURE__ */ _jsx3("input", {
          ref: mergedInputRef,
          ...inputProps,
          suppressHydrationWarning: true
        }), inset && isHydrating && renderBeforeHydration && // this must be rendered with the last thumb to ensure all
        // preceding thumbs are already rendered in the DOM
        last && /* @__PURE__ */ _jsx3("script", {
          nonce,
          dangerouslySetInnerHTML: {
            __html: script
          },
          suppressHydrationWarning: true
        })]
      }),
      id,
      onBlur: onBlurProp,
      onFocus: onFocusProp,
      onPointerDown(event) {
        if (disabled2) {
          return;
        }
        pressedThumbIndexRef.current = index;
        if (thumbRef.current != null) {
          const axis = orientation === "horizontal" ? "x" : "y";
          const midpoint = getMidpoint(thumbRef.current);
          const offset = (orientation === "horizontal" ? event.clientX : event.clientY) - midpoint[axis];
          pressedThumbCenterOffsetRef.current = offset;
        }
        if (inputRef.current != null && pressedInputRef.current !== inputRef.current) {
          pressedInputRef.current = inputRef.current;
        }
      },
      style: thumbStyle,
      suppressHydrationWarning: renderBeforeHydration || void 0
    }, elementProps],
    stateAttributesMapping: sliderStateAttributesMapping
  });
  return element;
});
if (false) SliderThumb.displayName = "SliderThumb";

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/slider/indicator/SliderIndicator.mjs
function getInsetStyles(vertical, range, start, end, renderBeforeHydration, hydrating) {
  const visibility = start === void 0 || range && end === void 0 ? "hidden" : void 0;
  const startEdge = vertical ? "bottom" : "insetInlineStart";
  const mainSide = vertical ? "height" : "width";
  const crossSide = vertical ? "width" : "height";
  const styles = {
    visibility: renderBeforeHydration && hydrating ? "hidden" : visibility,
    position: vertical ? "absolute" : "relative",
    [crossSide]: "inherit"
  };
  styles["--start-position"] = `${start ?? 0}%`;
  if (!range) {
    styles[startEdge] = 0;
    styles[mainSide] = "var(--start-position)";
    return styles;
  }
  styles["--relative-size"] = `${(end ?? 0) - (start ?? 0)}%`;
  styles[startEdge] = "var(--start-position)";
  styles[mainSide] = "var(--relative-size)";
  return styles;
}
function getCenteredStyles(vertical, range, start, end) {
  const startEdge = vertical ? "bottom" : "insetInlineStart";
  const mainSide = vertical ? "height" : "width";
  const crossSide = vertical ? "width" : "height";
  const styles = {
    position: vertical ? "absolute" : "relative",
    [crossSide]: "inherit"
  };
  if (!range) {
    styles[startEdge] = 0;
    styles[mainSide] = `${start}%`;
    return styles;
  }
  const size = end - start;
  styles[startEdge] = `${start}%`;
  styles[mainSide] = `${size}%`;
  return styles;
}
var SliderIndicator = /* @__PURE__ */ react_esm_exports.forwardRef(function SliderIndicator2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style: styleProp,
    ...elementProps
  } = componentProps;
  const {
    indicatorPosition,
    inset,
    max,
    min,
    orientation,
    renderBeforeHydration,
    state,
    values
  } = useSliderRootContext();
  const isHydrating = useIsHydrating();
  const vertical = orientation === "vertical";
  const range = values.length > 1;
  const style = inset ? getInsetStyles(vertical, range, indicatorPosition[0], indicatorPosition[1], renderBeforeHydration, isHydrating) : getCenteredStyles(vertical, range, valueToPercent(values[0], min, max), valueToPercent(values[values.length - 1], min, max));
  const element = useRenderElement("div", componentProps, {
    state,
    ref: forwardedRef,
    props: [{
      ["data-base-ui-slider-indicator"]: renderBeforeHydration ? "" : void 0,
      style,
      suppressHydrationWarning: renderBeforeHydration || void 0
    }, elementProps],
    stateAttributesMapping: sliderStateAttributesMapping
  });
  return element;
});
if (false) SliderIndicator.displayName = "SliderIndicator";
export {
  index_parts_exports as Slider
};
