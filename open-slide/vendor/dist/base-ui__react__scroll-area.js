var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/index.parts.mjs
var index_parts_exports = {};
__export(index_parts_exports, {
  Content: () => ScrollAreaContent,
  Corner: () => ScrollAreaCorner,
  Root: () => ScrollAreaRoot,
  Scrollbar: () => ScrollAreaScrollbar,
  Thumb: () => ScrollAreaThumb,
  Viewport: () => ScrollAreaViewport
});

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/root/ScrollAreaRoot.mjs
import * as React10 from "react";

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/safeReact.mjs
import * as React from "react";
var SafeReact = {
  ...React
};

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useRefWithInit.mjs
import * as React2 from "react";
var UNINITIALIZED = {};
function useRefWithInit(init, initArg) {
  const ref = React2.useRef(UNINITIALIZED);
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

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useOnMount.mjs
import * as React3 from "react";
var EMPTY = [];
function useOnMount(fn) {
  React3.useEffect(fn, EMPTY);
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useTimeout.mjs
var EMPTY2 = 0;
var Timeout = class _Timeout {
  static create() {
    return new _Timeout();
  }
  currentId = EMPTY2;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  start(delay, fn) {
    this.clear();
    this.currentId = setTimeout(() => {
      this.currentId = EMPTY2;
      fn();
    }, delay);
  }
  isStarted() {
    return this.currentId !== EMPTY2;
  }
  clear = () => {
    if (this.currentId !== EMPTY2) {
      clearTimeout(this.currentId);
      this.currentId = EMPTY2;
    }
  };
  disposeEffect = () => {
    return this.clear;
  };
};
function useTimeout() {
  const timeout = useRefWithInit(Timeout.create).current;
  useOnMount(timeout.disposeEffect);
  return timeout;
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

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/root/ScrollAreaRootContext.mjs
import * as React4 from "react";
var ScrollAreaRootContext = /* @__PURE__ */ React4.createContext(void 0);
if (false) ScrollAreaRootContext.displayName = "ScrollAreaRootContext";
function useScrollAreaRootContext() {
  const context = React4.useContext(ScrollAreaRootContext);
  if (context === void 0) {
    throw new Error(false ? "Base UI: ScrollAreaRootContext is missing. ScrollArea parts must be placed within <ScrollArea.Root>." : formatErrorMessage_default(53));
  }
  return context;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/useRenderElement.mjs
import * as React7 from "react";

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

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/getReactElementRef.mjs
import * as React6 from "react";

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/reactVersion.mjs
import * as React5 from "react";
var majorVersion = parseInt(React5.version, 10);
function isReactVersionAtLeast(reactVersionToCheck) {
  return majorVersion >= reactVersionToCheck;
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/getReactElementRef.mjs
function getReactElementRef(element) {
  if (!/* @__PURE__ */ React6.isValidElement(element)) {
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

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/empty.mjs
var EMPTY_ARRAY = Object.freeze([]);
var EMPTY_OBJECT = Object.freeze({});

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
import { createElement as _createElement } from "react";
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
      const children = React7.Children.toArray(render);
      newElement = children[0];
    }
    if (false) {
      if (!/* @__PURE__ */ React7.isValidElement(newElement)) {
        throw new Error(["Base UI: The `render` prop was provided an invalid React element as `React.isValidElement(render)` is `false`.", "A valid React element must be provided to the `render` prop because it is cloned with props to replace the default element.", "https://base-ui.com/r/invalid-render-prop"].join("\n"));
      }
    }
    return /* @__PURE__ */ React7.cloneElement(newElement, mergedProps);
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
    return /* @__PURE__ */ _createElement("button", {
      type: "button",
      ...props,
      key: props.key
    });
  }
  if (Tag === "img") {
    return /* @__PURE__ */ _createElement("img", {
      alt: "",
      ...props,
      key: props.key
    });
  }
  return /* @__PURE__ */ React7.createElement(Tag, props);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/root/ScrollAreaRootCssVars.mjs
var ScrollAreaRootCssVars = /* @__PURE__ */ (function(ScrollAreaRootCssVars2) {
  ScrollAreaRootCssVars2["scrollAreaCornerHeight"] = "--scroll-area-corner-height";
  ScrollAreaRootCssVars2["scrollAreaCornerWidth"] = "--scroll-area-corner-width";
  return ScrollAreaRootCssVars2;
})({});

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/constants.mjs
var SCROLL_TIMEOUT = 500;
var MIN_THUMB_SIZE = 16;

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/utils/getOffset.mjs
function getOffset(element, prop, axis) {
  if (!element) {
    return 0;
  }
  const styles = getComputedStyle(element);
  const propAxis = axis === "x" ? "Inline" : "Block";
  if (axis === "x" && prop === "margin") {
    return parseFloat(styles[`${prop}InlineStart`]) * 2;
  }
  return parseFloat(styles[`${prop}${propAxis}Start`]) + parseFloat(styles[`${prop}${propAxis}End`]);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/scrollbar/ScrollAreaScrollbarDataAttributes.mjs
var ScrollAreaScrollbarDataAttributes = /* @__PURE__ */ (function(ScrollAreaScrollbarDataAttributes2) {
  ScrollAreaScrollbarDataAttributes2["orientation"] = "data-orientation";
  ScrollAreaScrollbarDataAttributes2["hovering"] = "data-hovering";
  ScrollAreaScrollbarDataAttributes2["scrolling"] = "data-scrolling";
  ScrollAreaScrollbarDataAttributes2["hasOverflowX"] = "data-has-overflow-x";
  ScrollAreaScrollbarDataAttributes2["hasOverflowY"] = "data-has-overflow-y";
  ScrollAreaScrollbarDataAttributes2["overflowXStart"] = "data-overflow-x-start";
  ScrollAreaScrollbarDataAttributes2["overflowXEnd"] = "data-overflow-x-end";
  ScrollAreaScrollbarDataAttributes2["overflowYStart"] = "data-overflow-y-start";
  ScrollAreaScrollbarDataAttributes2["overflowYEnd"] = "data-overflow-y-end";
  return ScrollAreaScrollbarDataAttributes2;
})({});

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/utils/styles.mjs
import { jsx as _jsx } from "react/jsx-runtime";
var DISABLE_SCROLLBAR_CLASS_NAME = "base-ui-disable-scrollbar";
var styleDisableScrollbar = {
  className: DISABLE_SCROLLBAR_CLASS_NAME,
  getElement(nonce) {
    return /* @__PURE__ */ _jsx("style", {
      nonce,
      href: DISABLE_SCROLLBAR_CLASS_NAME,
      precedence: "base-ui:low",
      children: `.${DISABLE_SCROLLBAR_CLASS_NAME}{scrollbar-width:none}.${DISABLE_SCROLLBAR_CLASS_NAME}::-webkit-scrollbar{display:none}`
    });
  }
};
if (false) styleDisableScrollbar.getElement.displayName = "styleDisableScrollbar.getElement";

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useId.mjs
import * as React8 from "react";
var globalId = 0;
function useGlobalId(idOverride, prefix = "mui") {
  const [defaultId, setDefaultId] = React8.useState(idOverride);
  const id = idOverride || defaultId;
  React8.useEffect(() => {
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

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/root/ScrollAreaRootDataAttributes.mjs
var ScrollAreaRootDataAttributes = /* @__PURE__ */ (function(ScrollAreaRootDataAttributes2) {
  ScrollAreaRootDataAttributes2["scrolling"] = "data-scrolling";
  ScrollAreaRootDataAttributes2["hasOverflowX"] = "data-has-overflow-x";
  ScrollAreaRootDataAttributes2["hasOverflowY"] = "data-has-overflow-y";
  ScrollAreaRootDataAttributes2["overflowXStart"] = "data-overflow-x-start";
  ScrollAreaRootDataAttributes2["overflowXEnd"] = "data-overflow-x-end";
  ScrollAreaRootDataAttributes2["overflowYStart"] = "data-overflow-y-start";
  ScrollAreaRootDataAttributes2["overflowYEnd"] = "data-overflow-y-end";
  return ScrollAreaRootDataAttributes2;
})({});

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/root/stateAttributes.mjs
var scrollAreaStateAttributesMapping = {
  hasOverflowX: (value) => value ? {
    [ScrollAreaRootDataAttributes.hasOverflowX]: ""
  } : null,
  hasOverflowY: (value) => value ? {
    [ScrollAreaRootDataAttributes.hasOverflowY]: ""
  } : null,
  overflowXStart: (value) => value ? {
    [ScrollAreaRootDataAttributes.overflowXStart]: ""
  } : null,
  overflowXEnd: (value) => value ? {
    [ScrollAreaRootDataAttributes.overflowXEnd]: ""
  } : null,
  overflowYStart: (value) => value ? {
    [ScrollAreaRootDataAttributes.overflowYStart]: ""
  } : null,
  overflowYEnd: (value) => value ? {
    [ScrollAreaRootDataAttributes.overflowYEnd]: ""
  } : null,
  cornerHidden: () => null
};

// node_modules/.pnpm/@floating-ui+utils@0.2.12/node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
function hasWindow() {
  return typeof window !== "undefined";
}
function getWindow(node) {
  var _node$ownerDocument;
  return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
}
function isShadowRoot(value) {
  if (!hasWindow() || typeof ShadowRoot === "undefined") {
    return false;
  }
  return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
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

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/csp-context/CSPContext.mjs
import * as React9 from "react";
var CSPContext = /* @__PURE__ */ React9.createContext(void 0);
if (false) CSPContext.displayName = "CSPContext";
var DEFAULT_CSP_CONTEXT_VALUE = {
  disableStyleElements: false
};
function useCSPContext() {
  return React9.useContext(CSPContext) ?? DEFAULT_CSP_CONTEXT_VALUE;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/root/ScrollAreaRoot.mjs
import { jsxs as _jsxs } from "react/jsx-runtime";
var DEFAULT_COORDS = {
  x: 0,
  y: 0
};
var DEFAULT_SIZE = {
  width: 0,
  height: 0
};
var DEFAULT_OVERFLOW_EDGES = {
  xStart: false,
  xEnd: false,
  yStart: false,
  yEnd: false
};
var DEFAULT_HIDDEN_STATE = {
  x: true,
  y: true,
  corner: true
};
var ScrollAreaRoot = /* @__PURE__ */ React10.forwardRef(function ScrollAreaRoot2(componentProps, forwardedRef) {
  const {
    render,
    className,
    overflowEdgeThreshold: overflowEdgeThresholdProp,
    style,
    ...elementProps
  } = componentProps;
  const {
    xStart,
    xEnd,
    yStart,
    yEnd
  } = normalizeOverflowEdgeThreshold(overflowEdgeThresholdProp);
  const rootId = useBaseUiId();
  const scrollYTimeout = useTimeout();
  const scrollXTimeout = useTimeout();
  const {
    nonce,
    disableStyleElements
  } = useCSPContext();
  const [hovering, setHovering] = React10.useState(false);
  const [scrollingX, setScrollingX] = React10.useState(false);
  const [scrollingY, setScrollingY] = React10.useState(false);
  const [touchModality, setTouchModality] = React10.useState(false);
  const [hasMeasuredScrollbar, setHasMeasuredScrollbar] = React10.useState(false);
  const [cornerSize, setCornerSize] = React10.useState(DEFAULT_SIZE);
  const [thumbSize, setThumbSize] = React10.useState(DEFAULT_SIZE);
  const [overflowEdges, setOverflowEdges] = React10.useState(DEFAULT_OVERFLOW_EDGES);
  const [hiddenState, setHiddenState] = React10.useState(DEFAULT_HIDDEN_STATE);
  const rootRef = React10.useRef(null);
  const viewportRef = React10.useRef(null);
  const scrollbarYRef = React10.useRef(null);
  const scrollbarXRef = React10.useRef(null);
  const thumbYRef = React10.useRef(null);
  const thumbXRef = React10.useRef(null);
  const cornerRef = React10.useRef(null);
  const thumbDraggingRef = React10.useRef(false);
  const startYRef = React10.useRef(0);
  const startXRef = React10.useRef(0);
  const startScrollTopRef = React10.useRef(0);
  const startScrollLeftRef = React10.useRef(0);
  const currentOrientationRef = React10.useRef("vertical");
  const scrollPositionRef = React10.useRef(DEFAULT_COORDS);
  const handleScroll = useStableCallback((scrollPosition) => {
    const offsetX = scrollPosition.x - scrollPositionRef.current.x;
    const offsetY = scrollPosition.y - scrollPositionRef.current.y;
    scrollPositionRef.current = scrollPosition;
    if (offsetY !== 0) {
      setScrollingY(true);
      scrollYTimeout.start(SCROLL_TIMEOUT, () => {
        setScrollingY(false);
      });
    }
    if (offsetX !== 0) {
      setScrollingX(true);
      scrollXTimeout.start(SCROLL_TIMEOUT, () => {
        setScrollingX(false);
      });
    }
  });
  const handlePointerDown = useStableCallback((event) => {
    if (event.button !== 0) {
      return;
    }
    thumbDraggingRef.current = true;
    startYRef.current = event.clientY;
    startXRef.current = event.clientX;
    currentOrientationRef.current = event.currentTarget.getAttribute(ScrollAreaScrollbarDataAttributes.orientation);
    if (viewportRef.current) {
      startScrollTopRef.current = viewportRef.current.scrollTop;
      startScrollLeftRef.current = viewportRef.current.scrollLeft;
    }
    if (thumbYRef.current && currentOrientationRef.current === "vertical") {
      thumbYRef.current.setPointerCapture(event.pointerId);
    }
    if (thumbXRef.current && currentOrientationRef.current === "horizontal") {
      thumbXRef.current.setPointerCapture(event.pointerId);
    }
  });
  const handlePointerMove = useStableCallback((event) => {
    if (!thumbDraggingRef.current) {
      return;
    }
    const deltaY = event.clientY - startYRef.current;
    const deltaX = event.clientX - startXRef.current;
    if (viewportRef.current) {
      const scrollableContentHeight = viewportRef.current.scrollHeight;
      const viewportHeight = viewportRef.current.clientHeight;
      const scrollableContentWidth = viewportRef.current.scrollWidth;
      const viewportWidth = viewportRef.current.clientWidth;
      if (thumbYRef.current && scrollbarYRef.current && currentOrientationRef.current === "vertical") {
        const scrollbarYOffset = getOffset(scrollbarYRef.current, "padding", "y");
        const thumbYOffset = getOffset(thumbYRef.current, "margin", "y");
        const thumbHeight = thumbYRef.current.offsetHeight;
        const maxThumbOffsetY = scrollbarYRef.current.offsetHeight - thumbHeight - scrollbarYOffset - thumbYOffset;
        const scrollRatioY = deltaY / maxThumbOffsetY;
        viewportRef.current.scrollTop = startScrollTopRef.current + scrollRatioY * (scrollableContentHeight - viewportHeight);
        event.preventDefault();
        setScrollingY(true);
        scrollYTimeout.start(SCROLL_TIMEOUT, () => {
          setScrollingY(false);
        });
      }
      if (thumbXRef.current && scrollbarXRef.current && currentOrientationRef.current === "horizontal") {
        const scrollbarXOffset = getOffset(scrollbarXRef.current, "padding", "x");
        const thumbXOffset = getOffset(thumbXRef.current, "margin", "x");
        const thumbWidth = thumbXRef.current.offsetWidth;
        const maxThumbOffsetX = scrollbarXRef.current.offsetWidth - thumbWidth - scrollbarXOffset - thumbXOffset;
        const scrollRatioX = deltaX / maxThumbOffsetX;
        viewportRef.current.scrollLeft = startScrollLeftRef.current + scrollRatioX * (scrollableContentWidth - viewportWidth);
        event.preventDefault();
        setScrollingX(true);
        scrollXTimeout.start(SCROLL_TIMEOUT, () => {
          setScrollingX(false);
        });
      }
    }
  });
  const handlePointerUp = useStableCallback((event) => {
    thumbDraggingRef.current = false;
    if (thumbYRef.current && currentOrientationRef.current === "vertical" && thumbYRef.current.hasPointerCapture(event.pointerId)) {
      thumbYRef.current.releasePointerCapture(event.pointerId);
    }
    if (thumbXRef.current && currentOrientationRef.current === "horizontal" && thumbXRef.current.hasPointerCapture(event.pointerId)) {
      thumbXRef.current.releasePointerCapture(event.pointerId);
    }
  });
  function handleTouchModalityChange(event) {
    setTouchModality(event.pointerType === "touch");
  }
  function handlePointerEnterOrMove(event) {
    handleTouchModalityChange(event);
    if (event.pointerType !== "touch") {
      const isTargetRootChild = contains(rootRef.current, event.target);
      setHovering(isTargetRootChild);
    }
  }
  const state = React10.useMemo(() => ({
    scrolling: scrollingX || scrollingY,
    hasOverflowX: !hiddenState.x,
    hasOverflowY: !hiddenState.y,
    overflowXStart: overflowEdges.xStart,
    overflowXEnd: overflowEdges.xEnd,
    overflowYStart: overflowEdges.yStart,
    overflowYEnd: overflowEdges.yEnd,
    cornerHidden: hiddenState.corner
  }), [scrollingX, scrollingY, hiddenState.x, hiddenState.y, hiddenState.corner, overflowEdges]);
  const props = {
    role: "presentation",
    onPointerEnter: handlePointerEnterOrMove,
    onPointerMove: handlePointerEnterOrMove,
    onPointerDown: handleTouchModalityChange,
    onPointerLeave() {
      setHovering(false);
    },
    style: {
      position: "relative",
      [ScrollAreaRootCssVars.scrollAreaCornerHeight]: `${cornerSize.height}px`,
      [ScrollAreaRootCssVars.scrollAreaCornerWidth]: `${cornerSize.width}px`
    }
  };
  const element = useRenderElement("div", componentProps, {
    state,
    ref: [forwardedRef, rootRef],
    props: [props, elementProps],
    stateAttributesMapping: scrollAreaStateAttributesMapping
  });
  const contextValue = React10.useMemo(() => ({
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleScroll,
    cornerSize,
    setCornerSize,
    thumbSize,
    setThumbSize,
    hasMeasuredScrollbar,
    setHasMeasuredScrollbar,
    touchModality,
    cornerRef,
    scrollingX,
    setScrollingX,
    scrollingY,
    setScrollingY,
    hovering,
    setHovering,
    viewportRef,
    rootRef,
    scrollbarYRef,
    scrollbarXRef,
    thumbYRef,
    thumbXRef,
    rootId,
    hiddenState,
    setHiddenState,
    overflowEdges,
    setOverflowEdges,
    viewportState: state,
    overflowEdgeThreshold: {
      xStart,
      xEnd,
      yStart,
      yEnd
    }
  }), [handlePointerDown, handlePointerMove, handlePointerUp, handleScroll, cornerSize, thumbSize, hasMeasuredScrollbar, touchModality, scrollingX, setScrollingX, scrollingY, setScrollingY, hovering, setHovering, rootId, hiddenState, overflowEdges, state, xStart, xEnd, yStart, yEnd]);
  return /* @__PURE__ */ _jsxs(ScrollAreaRootContext.Provider, {
    value: contextValue,
    children: [!disableStyleElements && styleDisableScrollbar.getElement(nonce), element]
  });
});
if (false) ScrollAreaRoot.displayName = "ScrollAreaRoot";
function normalizeOverflowEdgeThreshold(threshold) {
  if (typeof threshold === "number") {
    const value = Math.max(0, threshold);
    return {
      xStart: value,
      xEnd: value,
      yStart: value,
      yEnd: value
    };
  }
  return {
    xStart: Math.max(0, threshold?.xStart || 0),
    xEnd: Math.max(0, threshold?.xEnd || 0),
    yStart: Math.max(0, threshold?.yStart || 0),
    yEnd: Math.max(0, threshold?.yEnd || 0)
  };
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/viewport/ScrollAreaViewport.mjs
import * as React14 from "react";

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useIsoLayoutEffect.mjs
import * as React11 from "react";
var noop = () => {
};
var useIsoLayoutEffect = typeof document !== "undefined" ? React11.useLayoutEffect : noop;

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/viewport/ScrollAreaViewportContext.mjs
import * as React12 from "react";
var ScrollAreaViewportContext = /* @__PURE__ */ React12.createContext(void 0);
if (false) ScrollAreaViewportContext.displayName = "ScrollAreaViewportContext";
function useScrollAreaViewportContext() {
  const context = React12.useContext(ScrollAreaViewportContext);
  if (context === void 0) {
    throw new Error(false ? "Base UI: ScrollAreaViewportContext missing. ScrollAreaViewport parts must be placed within <ScrollArea.Viewport>." : formatErrorMessage_default(55));
  }
  return context;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/direction-context/DirectionContext.mjs
import * as React13 from "react";
var DirectionContext = /* @__PURE__ */ React13.createContext(void 0);
if (false) DirectionContext.displayName = "DirectionContext";
function useDirection() {
  const context = React13.useContext(DirectionContext);
  return context?.direction ?? "ltr";
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/clamp.mjs
function clamp(val, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  return Math.max(min, Math.min(val, max));
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/viewport/ScrollAreaViewportCssVars.mjs
var ScrollAreaViewportCssVars = /* @__PURE__ */ (function(ScrollAreaViewportCssVars2) {
  ScrollAreaViewportCssVars2["scrollAreaOverflowXStart"] = "--scroll-area-overflow-x-start";
  ScrollAreaViewportCssVars2["scrollAreaOverflowXEnd"] = "--scroll-area-overflow-x-end";
  ScrollAreaViewportCssVars2["scrollAreaOverflowYStart"] = "--scroll-area-overflow-y-start";
  ScrollAreaViewportCssVars2["scrollAreaOverflowYEnd"] = "--scroll-area-overflow-y-end";
  return ScrollAreaViewportCssVars2;
})({});

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/utils/scrollEdges.mjs
var SCROLL_EDGE_TOLERANCE_PX = 1;
function normalizeScrollOffset(value, max) {
  if (max <= 0) {
    return 0;
  }
  const clamped = clamp(value, 0, max);
  const startDistance = clamped;
  const endDistance = max - clamped;
  const withinStartTolerance = startDistance <= SCROLL_EDGE_TOLERANCE_PX;
  const withinEndTolerance = endDistance <= SCROLL_EDGE_TOLERANCE_PX;
  if (withinStartTolerance && withinEndTolerance) {
    return startDistance <= endDistance ? 0 : max;
  }
  if (withinStartTolerance) {
    return 0;
  }
  if (withinEndTolerance) {
    return max;
  }
  return clamped;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/viewport/ScrollAreaViewport.mjs
import { jsx as _jsx2 } from "react/jsx-runtime";
var scrollAreaOverflowVarsRegistered = false;
function removeCSSVariableInheritance() {
  if (scrollAreaOverflowVarsRegistered || // When `inherits: false`, specifying `inherit` on child elements doesn't work
  // in Safari. To let CSS features work correctly, this optimization must be skipped.
  parts_exports.engine.webkit) {
    return;
  }
  if (typeof CSS !== "undefined" && "registerProperty" in CSS) {
    [ScrollAreaViewportCssVars.scrollAreaOverflowXStart, ScrollAreaViewportCssVars.scrollAreaOverflowXEnd, ScrollAreaViewportCssVars.scrollAreaOverflowYStart, ScrollAreaViewportCssVars.scrollAreaOverflowYEnd].forEach((name) => {
      try {
        CSS.registerProperty({
          name,
          syntax: "<length>",
          inherits: false,
          initialValue: "0px"
        });
      } catch {
      }
    });
  }
  scrollAreaOverflowVarsRegistered = true;
}
var ScrollAreaViewport = /* @__PURE__ */ React14.forwardRef(function ScrollAreaViewport2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const {
    viewportRef,
    scrollbarYRef,
    scrollbarXRef,
    thumbYRef,
    thumbXRef,
    cornerRef,
    cornerSize,
    setCornerSize,
    setThumbSize,
    rootId,
    setHiddenState,
    hiddenState,
    setHasMeasuredScrollbar,
    handleScroll,
    setHovering,
    setOverflowEdges,
    overflowEdges,
    overflowEdgeThreshold,
    scrollingX,
    scrollingY
  } = useScrollAreaRootContext();
  const direction = useDirection();
  const programmaticScrollRef = React14.useRef(true);
  const lastMeasuredViewportMetricsRef = React14.useRef([NaN, NaN, NaN, NaN]);
  const scrollEndTimeout = useTimeout();
  const waitForAnimationsTimeout = useTimeout();
  const computeThumbPosition = useStableCallback(() => {
    const viewportEl = viewportRef.current;
    const scrollbarYEl = scrollbarYRef.current;
    const scrollbarXEl = scrollbarXRef.current;
    const thumbYEl = thumbYRef.current;
    const thumbXEl = thumbXRef.current;
    const cornerEl = cornerRef.current;
    if (!viewportEl) {
      return;
    }
    const scrollableContentHeight = viewportEl.scrollHeight;
    const scrollableContentWidth = viewportEl.scrollWidth;
    const viewportHeight = viewportEl.clientHeight;
    const viewportWidth = viewportEl.clientWidth;
    const scrollTop = viewportEl.scrollTop;
    const scrollLeft = viewportEl.scrollLeft;
    const lastMeasuredViewportMetrics = lastMeasuredViewportMetricsRef.current;
    const isFirstMeasurement = Number.isNaN(lastMeasuredViewportMetrics[0]);
    lastMeasuredViewportMetrics[0] = viewportHeight;
    lastMeasuredViewportMetrics[1] = scrollableContentHeight;
    lastMeasuredViewportMetrics[2] = viewportWidth;
    lastMeasuredViewportMetrics[3] = scrollableContentWidth;
    if (isFirstMeasurement) {
      setHasMeasuredScrollbar(true);
    }
    if (scrollableContentHeight === 0 || scrollableContentWidth === 0) {
      return;
    }
    const nextHiddenState = getHiddenState(viewportEl);
    const scrollbarYHidden = nextHiddenState.y;
    const scrollbarXHidden = nextHiddenState.x;
    const ratioX = viewportWidth / scrollableContentWidth;
    const ratioY = viewportHeight / scrollableContentHeight;
    const maxScrollLeft = Math.max(0, scrollableContentWidth - viewportWidth);
    const maxScrollTop = Math.max(0, scrollableContentHeight - viewportHeight);
    let scrollLeftFromStart = 0;
    let scrollLeftFromEnd = 0;
    if (!scrollbarXHidden) {
      let rawScrollLeftFromStart = 0;
      if (direction === "rtl") {
        rawScrollLeftFromStart = clamp(-scrollLeft, 0, maxScrollLeft);
      } else {
        rawScrollLeftFromStart = clamp(scrollLeft, 0, maxScrollLeft);
      }
      scrollLeftFromStart = normalizeScrollOffset(rawScrollLeftFromStart, maxScrollLeft);
      scrollLeftFromEnd = maxScrollLeft - scrollLeftFromStart;
    }
    const rawScrollTopFromStart = !scrollbarYHidden ? clamp(scrollTop, 0, maxScrollTop) : 0;
    const scrollTopFromStart = !scrollbarYHidden ? normalizeScrollOffset(rawScrollTopFromStart, maxScrollTop) : 0;
    const scrollTopFromEnd = !scrollbarYHidden ? maxScrollTop - scrollTopFromStart : 0;
    const nextWidth = scrollbarXHidden ? 0 : viewportWidth;
    const nextHeight = scrollbarYHidden ? 0 : viewportHeight;
    let nextCornerWidth = 0;
    let nextCornerHeight = 0;
    if (!scrollbarXHidden && !scrollbarYHidden) {
      nextCornerWidth = scrollbarYEl?.offsetWidth || 0;
      nextCornerHeight = scrollbarXEl?.offsetHeight || 0;
    }
    const cornerNotYetSized = cornerSize.width === 0 && cornerSize.height === 0;
    const cornerWidthOffset = cornerNotYetSized ? nextCornerWidth : 0;
    const cornerHeightOffset = cornerNotYetSized ? nextCornerHeight : 0;
    const scrollbarXOffset = getOffset(scrollbarXEl, "padding", "x");
    const scrollbarYOffset = getOffset(scrollbarYEl, "padding", "y");
    const thumbXOffset = getOffset(thumbXEl, "margin", "x");
    const thumbYOffset = getOffset(thumbYEl, "margin", "y");
    const idealNextWidth = nextWidth - scrollbarXOffset - thumbXOffset;
    const idealNextHeight = nextHeight - scrollbarYOffset - thumbYOffset;
    const maxNextWidth = scrollbarXEl ? Math.min(scrollbarXEl.offsetWidth - cornerWidthOffset, idealNextWidth) : idealNextWidth;
    const maxNextHeight = scrollbarYEl ? Math.min(scrollbarYEl.offsetHeight - cornerHeightOffset, idealNextHeight) : idealNextHeight;
    const clampedNextWidth = Math.max(MIN_THUMB_SIZE, maxNextWidth * ratioX);
    const clampedNextHeight = Math.max(MIN_THUMB_SIZE, maxNextHeight * ratioY);
    setThumbSize((prevSize) => {
      if (prevSize.height === clampedNextHeight && prevSize.width === clampedNextWidth) {
        return prevSize;
      }
      return {
        width: clampedNextWidth,
        height: clampedNextHeight
      };
    });
    if (scrollbarYEl && thumbYEl) {
      const maxThumbOffsetY = scrollbarYEl.offsetHeight - clampedNextHeight - scrollbarYOffset - thumbYOffset;
      const scrollRangeY = scrollableContentHeight - viewportHeight;
      const scrollRatioY = scrollRangeY === 0 ? 0 : scrollTop / scrollRangeY;
      const thumbOffsetY = Math.min(maxThumbOffsetY, Math.max(0, scrollRatioY * maxThumbOffsetY));
      thumbYEl.style.transform = `translate3d(0,${thumbOffsetY}px,0)`;
    }
    if (scrollbarXEl && thumbXEl) {
      const maxThumbOffsetX = scrollbarXEl.offsetWidth - clampedNextWidth - scrollbarXOffset - thumbXOffset;
      const scrollRangeX = scrollableContentWidth - viewportWidth;
      const scrollRatioX = scrollRangeX === 0 ? 0 : scrollLeft / scrollRangeX;
      const thumbOffsetX = direction === "rtl" ? clamp(scrollRatioX * maxThumbOffsetX, -maxThumbOffsetX, 0) : clamp(scrollRatioX * maxThumbOffsetX, 0, maxThumbOffsetX);
      thumbXEl.style.transform = `translate3d(${thumbOffsetX}px,0,0)`;
    }
    const overflowMetricsPx = [[ScrollAreaViewportCssVars.scrollAreaOverflowXStart, scrollLeftFromStart], [ScrollAreaViewportCssVars.scrollAreaOverflowXEnd, scrollLeftFromEnd], [ScrollAreaViewportCssVars.scrollAreaOverflowYStart, scrollTopFromStart], [ScrollAreaViewportCssVars.scrollAreaOverflowYEnd, scrollTopFromEnd]];
    for (const [cssVar, value] of overflowMetricsPx) {
      viewportEl.style.setProperty(cssVar, `${value}px`);
    }
    if (cornerEl) {
      if (scrollbarXHidden || scrollbarYHidden) {
        setCornerSize({
          width: 0,
          height: 0
        });
      } else if (!scrollbarXHidden && !scrollbarYHidden) {
        setCornerSize({
          width: nextCornerWidth,
          height: nextCornerHeight
        });
      }
    }
    setHiddenState((prevState) => mergeHiddenState(prevState, nextHiddenState));
    const nextOverflowEdges = {
      xStart: !scrollbarXHidden && scrollLeftFromStart > overflowEdgeThreshold.xStart,
      xEnd: !scrollbarXHidden && scrollLeftFromEnd > overflowEdgeThreshold.xEnd,
      yStart: !scrollbarYHidden && scrollTopFromStart > overflowEdgeThreshold.yStart,
      yEnd: !scrollbarYHidden && scrollTopFromEnd > overflowEdgeThreshold.yEnd
    };
    setOverflowEdges((prev) => {
      if (prev.xStart === nextOverflowEdges.xStart && prev.xEnd === nextOverflowEdges.xEnd && prev.yStart === nextOverflowEdges.yStart && prev.yEnd === nextOverflowEdges.yEnd) {
        return prev;
      }
      return nextOverflowEdges;
    });
  });
  useIsoLayoutEffect(() => {
    if (!viewportRef.current) {
      return;
    }
    removeCSSVariableInheritance();
  }, [viewportRef]);
  useIsoLayoutEffect(() => {
    queueMicrotask(computeThumbPosition);
  }, [computeThumbPosition, hiddenState, direction, overflowEdgeThreshold.xStart, overflowEdgeThreshold.xEnd, overflowEdgeThreshold.yStart, overflowEdgeThreshold.yEnd]);
  useIsoLayoutEffect(() => {
    if (viewportRef.current?.matches(":hover")) {
      setHovering(true);
    }
  }, [viewportRef, setHovering]);
  useIsoLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (typeof ResizeObserver === "undefined" || !viewport) {
      return void 0;
    }
    let hasInitialized = false;
    const resizeObserver = new ResizeObserver(() => {
      if (!hasInitialized) {
        hasInitialized = true;
        const lastMeasuredViewportMetrics = lastMeasuredViewportMetricsRef.current;
        if (lastMeasuredViewportMetrics[0] === viewport.clientHeight && lastMeasuredViewportMetrics[1] === viewport.scrollHeight && lastMeasuredViewportMetrics[2] === viewport.clientWidth && lastMeasuredViewportMetrics[3] === viewport.scrollWidth) {
          return;
        }
      }
      computeThumbPosition();
    });
    resizeObserver.observe(viewport);
    waitForAnimationsTimeout.start(0, () => {
      const animations = viewport.getAnimations({
        subtree: true
      });
      if (animations.length === 0) {
        return;
      }
      Promise.allSettled(animations.map((animation) => animation.finished)).then(computeThumbPosition).catch(() => {
      });
    });
    return () => {
      resizeObserver.disconnect();
      waitForAnimationsTimeout.clear();
    };
  }, [computeThumbPosition, viewportRef, waitForAnimationsTimeout]);
  function handleUserInteraction() {
    programmaticScrollRef.current = false;
  }
  const props = {
    role: "presentation",
    ...rootId && {
      "data-id": `${rootId}-viewport`
    },
    // https://accessibilityinsights.io/info-examples/web/scrollable-region-focusable/
    // Keep non-scrollable viewports out of tab order.
    tabIndex: hiddenState.x && hiddenState.y ? -1 : 0,
    className: styleDisableScrollbar.className,
    style: {
      overflow: "scroll"
    },
    onScroll() {
      if (!viewportRef.current) {
        return;
      }
      computeThumbPosition();
      if (!programmaticScrollRef.current) {
        handleScroll({
          x: viewportRef.current.scrollLeft,
          y: viewportRef.current.scrollTop
        });
      }
      scrollEndTimeout.start(100, () => {
        programmaticScrollRef.current = true;
      });
    },
    onWheel: handleUserInteraction,
    onTouchMove: handleUserInteraction,
    onPointerMove: handleUserInteraction,
    onPointerEnter: handleUserInteraction,
    onKeyDown: handleUserInteraction
  };
  const viewportState = React14.useMemo(() => ({
    scrolling: scrollingX || scrollingY,
    hasOverflowX: !hiddenState.x,
    hasOverflowY: !hiddenState.y,
    overflowXStart: overflowEdges.xStart,
    overflowXEnd: overflowEdges.xEnd,
    overflowYStart: overflowEdges.yStart,
    overflowYEnd: overflowEdges.yEnd,
    cornerHidden: hiddenState.corner
  }), [scrollingX, scrollingY, hiddenState.x, hiddenState.y, hiddenState.corner, overflowEdges]);
  const element = useRenderElement("div", componentProps, {
    ref: [forwardedRef, viewportRef],
    state: viewportState,
    props: [props, elementProps],
    stateAttributesMapping: scrollAreaStateAttributesMapping
  });
  const contextValue = React14.useMemo(() => ({
    computeThumbPosition
  }), [computeThumbPosition]);
  return /* @__PURE__ */ _jsx2(ScrollAreaViewportContext.Provider, {
    value: contextValue,
    children: element
  });
});
if (false) ScrollAreaViewport.displayName = "ScrollAreaViewport";
function getHiddenState(viewport) {
  const y = viewport.clientHeight >= viewport.scrollHeight;
  const x = viewport.clientWidth >= viewport.scrollWidth;
  return {
    y,
    x,
    corner: y || x
  };
}
function mergeHiddenState(prevState, nextState) {
  if (prevState.y === nextState.y && prevState.x === nextState.x && prevState.corner === nextState.corner) {
    return prevState;
  }
  return nextState;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/scrollbar/ScrollAreaScrollbar.mjs
import * as React16 from "react";

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/addEventListener.mjs
function addEventListener(target, type, listener, options) {
  target.addEventListener(type, listener, options);
  return () => {
    target.removeEventListener(type, listener, options);
  };
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/scrollbar/ScrollAreaScrollbarContext.mjs
import * as React15 from "react";
var ScrollAreaScrollbarContext = /* @__PURE__ */ React15.createContext(void 0);
if (false) ScrollAreaScrollbarContext.displayName = "ScrollAreaScrollbarContext";
function useScrollAreaScrollbarContext() {
  const context = React15.useContext(ScrollAreaScrollbarContext);
  if (context === void 0) {
    throw new Error(false ? "Base UI: ScrollAreaScrollbarContext is missing. ScrollAreaScrollbar parts must be placed within <ScrollArea.Scrollbar>." : formatErrorMessage_default(54));
  }
  return context;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/scrollbar/ScrollAreaScrollbarCssVars.mjs
var ScrollAreaScrollbarCssVars = /* @__PURE__ */ (function(ScrollAreaScrollbarCssVars2) {
  ScrollAreaScrollbarCssVars2["scrollAreaThumbHeight"] = "--scroll-area-thumb-height";
  ScrollAreaScrollbarCssVars2["scrollAreaThumbWidth"] = "--scroll-area-thumb-width";
  return ScrollAreaScrollbarCssVars2;
})({});

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/scrollbar/ScrollAreaScrollbar.mjs
import { jsx as _jsx3 } from "react/jsx-runtime";
var ScrollAreaScrollbar = /* @__PURE__ */ React16.forwardRef(function ScrollAreaScrollbar2(componentProps, forwardedRef) {
  const {
    render,
    className,
    orientation = "vertical",
    keepMounted = false,
    style,
    ...elementProps
  } = componentProps;
  const {
    hovering,
    scrollingX,
    scrollingY,
    hiddenState,
    overflowEdges,
    scrollbarYRef,
    scrollbarXRef,
    viewportRef,
    thumbYRef,
    thumbXRef,
    handlePointerDown,
    handlePointerUp,
    handleScroll,
    rootId,
    thumbSize,
    hasMeasuredScrollbar
  } = useScrollAreaRootContext();
  const state = {
    hovering,
    scrolling: {
      horizontal: scrollingX,
      vertical: scrollingY
    }[orientation],
    orientation,
    hasOverflowX: !hiddenState.x,
    hasOverflowY: !hiddenState.y,
    overflowXStart: overflowEdges.xStart,
    overflowXEnd: overflowEdges.xEnd,
    overflowYStart: overflowEdges.yStart,
    overflowYEnd: overflowEdges.yEnd,
    cornerHidden: hiddenState.corner
  };
  const direction = useDirection();
  const hideTrackUntilMeasured = !hasMeasuredScrollbar && !keepMounted;
  const isHidden = orientation === "vertical" ? hiddenState.y : hiddenState.x;
  const shouldRender = keepMounted || !isHidden;
  React16.useEffect(() => {
    if (!shouldRender) {
      return void 0;
    }
    const viewportEl = viewportRef.current;
    const scrollbarEl = orientation === "vertical" ? scrollbarYRef.current : scrollbarXRef.current;
    if (!scrollbarEl) {
      return void 0;
    }
    function handleWheel(event) {
      if (!viewportEl || !scrollbarEl || event.ctrlKey) {
        return;
      }
      const horizontal = orientation === "horizontal";
      const scrollProperty = horizontal ? "scrollLeft" : "scrollTop";
      const delta = horizontal ? event.deltaX : event.deltaY;
      if (delta === 0) {
        return;
      }
      const maxScroll = horizontal ? viewportEl.scrollWidth - viewportEl.clientWidth : viewportEl.scrollHeight - viewportEl.clientHeight;
      const minScroll = horizontal && direction === "rtl" ? -maxScroll : 0;
      const maxScrollValue = horizontal && direction === "rtl" ? 0 : maxScroll;
      const scrollValue = viewportEl[scrollProperty];
      if (scrollValue <= minScroll && delta < 0 || scrollValue >= maxScrollValue && delta > 0) {
        return;
      }
      event.preventDefault();
      viewportEl[scrollProperty] = Math.min(maxScrollValue, Math.max(minScroll, scrollValue + delta));
      handleScroll({
        x: viewportEl.scrollLeft,
        y: viewportEl.scrollTop
      });
    }
    return addEventListener(scrollbarEl, "wheel", handleWheel, {
      passive: false
    });
  }, [direction, handleScroll, orientation, scrollbarXRef, scrollbarYRef, shouldRender, viewportRef]);
  const props = {
    ...rootId && {
      "data-id": `${rootId}-scrollbar`
    },
    onPointerDown(event) {
      if (event.button !== 0) {
        return;
      }
      const target = getTarget(event.nativeEvent);
      const thumb = orientation === "vertical" ? thumbYRef.current : thumbXRef.current;
      if (thumb && contains(thumb, target)) {
        return;
      }
      if (!viewportRef.current) {
        return;
      }
      if (thumbYRef.current && scrollbarYRef.current && orientation === "vertical") {
        const thumbYOffset = getOffset(thumbYRef.current, "margin", "y");
        const scrollbarYOffset = getOffset(scrollbarYRef.current, "padding", "y");
        const thumbHeight = thumbYRef.current.offsetHeight;
        const trackRectY = scrollbarYRef.current.getBoundingClientRect();
        const clickY = event.clientY - trackRectY.top - thumbHeight / 2 - scrollbarYOffset + thumbYOffset / 2;
        const scrollableContentHeight = viewportRef.current.scrollHeight;
        const viewportHeight = viewportRef.current.clientHeight;
        const maxThumbOffsetY = scrollbarYRef.current.offsetHeight - thumbHeight - scrollbarYOffset - thumbYOffset;
        const scrollRatioY = clickY / maxThumbOffsetY;
        const newScrollTop = scrollRatioY * (scrollableContentHeight - viewportHeight);
        viewportRef.current.scrollTop = newScrollTop;
      }
      if (thumbXRef.current && scrollbarXRef.current && orientation === "horizontal") {
        const thumbXOffset = getOffset(thumbXRef.current, "margin", "x");
        const scrollbarXOffset = getOffset(scrollbarXRef.current, "padding", "x");
        const thumbWidth = thumbXRef.current.offsetWidth;
        const trackRectX = scrollbarXRef.current.getBoundingClientRect();
        const clickX = event.clientX - trackRectX.left - thumbWidth / 2 - scrollbarXOffset + thumbXOffset / 2;
        const scrollableContentWidth = viewportRef.current.scrollWidth;
        const viewportWidth = viewportRef.current.clientWidth;
        const maxThumbOffsetX = scrollbarXRef.current.offsetWidth - thumbWidth - scrollbarXOffset - thumbXOffset;
        const scrollRatioX = clickX / maxThumbOffsetX;
        let newScrollLeft;
        if (direction === "rtl") {
          newScrollLeft = (1 - scrollRatioX) * (scrollableContentWidth - viewportWidth);
          if (viewportRef.current.scrollLeft <= 0) {
            newScrollLeft = -newScrollLeft;
          }
        } else {
          newScrollLeft = scrollRatioX * (scrollableContentWidth - viewportWidth);
        }
        viewportRef.current.scrollLeft = newScrollLeft;
      }
      handleScroll({
        x: viewportRef.current.scrollLeft,
        y: viewportRef.current.scrollTop
      });
      handlePointerDown(event);
    },
    onPointerUp: handlePointerUp,
    // Mirror `onPointerUp` so a browser-cancelled gesture on the track (no thumb
    // child captures the pointer) still clears the drag state.
    onPointerCancel: handlePointerUp,
    style: {
      position: "absolute",
      touchAction: "none",
      WebkitUserSelect: "none",
      userSelect: "none",
      visibility: hideTrackUntilMeasured ? "hidden" : void 0,
      ...orientation === "vertical" && {
        top: 0,
        bottom: `var(${ScrollAreaRootCssVars.scrollAreaCornerHeight})`,
        insetInlineEnd: 0,
        [ScrollAreaScrollbarCssVars.scrollAreaThumbHeight]: `${thumbSize.height}px`
      },
      ...orientation === "horizontal" && {
        insetInlineStart: 0,
        insetInlineEnd: `var(${ScrollAreaRootCssVars.scrollAreaCornerWidth})`,
        bottom: 0,
        [ScrollAreaScrollbarCssVars.scrollAreaThumbWidth]: `${thumbSize.width}px`
      }
    }
  };
  const element = useRenderElement("div", componentProps, {
    ref: [forwardedRef, orientation === "vertical" ? scrollbarYRef : scrollbarXRef],
    state,
    props: [props, elementProps],
    stateAttributesMapping: scrollAreaStateAttributesMapping
  });
  const contextValue = React16.useMemo(() => ({
    orientation
  }), [orientation]);
  if (!shouldRender) {
    return null;
  }
  return /* @__PURE__ */ _jsx3(ScrollAreaScrollbarContext.Provider, {
    value: contextValue,
    children: element
  });
});
if (false) ScrollAreaScrollbar.displayName = "ScrollAreaScrollbar";

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/content/ScrollAreaContent.mjs
import * as React17 from "react";
var ScrollAreaContent = /* @__PURE__ */ React17.forwardRef(function ScrollAreaContent2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const {
    computeThumbPosition
  } = useScrollAreaViewportContext();
  const {
    hasMeasuredScrollbar,
    viewportState
  } = useScrollAreaRootContext();
  const contentWrapperRef = React17.useRef(null);
  const computeOnInitialResizeRef = React17.useRef(hasMeasuredScrollbar);
  useIsoLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return void 0;
    }
    let hasInitialized = false;
    const resizeObserver = new ResizeObserver(() => {
      if (!hasInitialized) {
        hasInitialized = true;
        if (!computeOnInitialResizeRef.current) {
          return;
        }
      }
      computeThumbPosition();
    });
    if (contentWrapperRef.current) {
      resizeObserver.observe(contentWrapperRef.current);
    }
    return () => {
      resizeObserver.disconnect();
    };
  }, [computeThumbPosition]);
  const element = useRenderElement("div", componentProps, {
    ref: [forwardedRef, contentWrapperRef],
    state: viewportState,
    stateAttributesMapping: scrollAreaStateAttributesMapping,
    props: [{
      role: "presentation",
      style: {
        minWidth: "fit-content"
      }
    }, elementProps]
  });
  return element;
});
if (false) ScrollAreaContent.displayName = "ScrollAreaContent";

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/thumb/ScrollAreaThumb.mjs
import * as React18 from "react";
var ScrollAreaThumb = /* @__PURE__ */ React18.forwardRef(function ScrollAreaThumb2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const {
    thumbYRef,
    thumbXRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    setScrollingX,
    setScrollingY,
    scrollingX,
    scrollingY,
    hasMeasuredScrollbar
  } = useScrollAreaRootContext();
  const {
    orientation
  } = useScrollAreaScrollbarContext();
  const state = {
    scrolling: orientation === "horizontal" ? scrollingX : scrollingY,
    orientation
  };
  function endDrag(event) {
    if (orientation === "vertical") {
      setScrollingY(false);
    }
    if (orientation === "horizontal") {
      setScrollingX(false);
    }
    handlePointerUp(event);
  }
  const element = useRenderElement("div", componentProps, {
    ref: [forwardedRef, orientation === "vertical" ? thumbYRef : thumbXRef],
    state,
    props: [{
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      style: {
        visibility: hasMeasuredScrollbar ? void 0 : "hidden",
        ...orientation === "vertical" && {
          height: `var(${ScrollAreaScrollbarCssVars.scrollAreaThumbHeight})`
        },
        ...orientation === "horizontal" && {
          width: `var(${ScrollAreaScrollbarCssVars.scrollAreaThumbWidth})`
        }
      }
    }, elementProps]
  });
  return element;
});
if (false) ScrollAreaThumb.displayName = "ScrollAreaThumb";

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/scroll-area/corner/ScrollAreaCorner.mjs
import * as React19 from "react";
var ScrollAreaCorner = /* @__PURE__ */ React19.forwardRef(function ScrollAreaCorner2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const {
    cornerRef,
    cornerSize,
    hiddenState
  } = useScrollAreaRootContext();
  const element = useRenderElement("div", componentProps, {
    ref: [forwardedRef, cornerRef],
    props: [{
      style: {
        position: "absolute",
        bottom: 0,
        insetInlineEnd: 0,
        width: cornerSize.width,
        height: cornerSize.height
      }
    }, elementProps]
  });
  if (hiddenState.corner) {
    return null;
  }
  return element;
});
if (false) ScrollAreaCorner.displayName = "ScrollAreaCorner";
export {
  index_parts_exports as ScrollArea
};
