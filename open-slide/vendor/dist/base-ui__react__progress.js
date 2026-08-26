var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/progress/index.parts.mjs
var index_parts_exports = {};
__export(index_parts_exports, {
  Indicator: () => ProgressIndicator,
  Label: () => ProgressLabel,
  Root: () => ProgressRoot,
  Track: () => ProgressTrack,
  Value: () => ProgressValue
});

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/progress/root/ProgressRoot.mjs
import * as React7 from "react";

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useIsoLayoutEffect.mjs
import * as React from "react";
var noop = () => {
};
var useIsoLayoutEffect = typeof document !== "undefined" ? React.useLayoutEffect : noop;

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
function formatNumberValue(value, locale, format) {
  if (value == null) {
    return "";
  }
  if (!format) {
    return formatNumber(value / 100, locale, {
      style: "percent"
    });
  }
  return formatNumber(value, locale, format);
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

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/internals/useRenderElement.mjs
import * as React5 from "react";

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
import * as React4 from "react";

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/reactVersion.mjs
import * as React3 from "react";
var majorVersion = parseInt(React3.version, 10);
function isReactVersionAtLeast(reactVersionToCheck) {
  return majorVersion >= reactVersionToCheck;
}

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/getReactElementRef.mjs
function getReactElementRef(element) {
  if (!/* @__PURE__ */ React4.isValidElement(element)) {
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
      const children = React5.Children.toArray(render);
      newElement = children[0];
    }
    if (false) {
      if (!/* @__PURE__ */ React5.isValidElement(newElement)) {
        throw new Error(["Base UI: The `render` prop was provided an invalid React element as `React.isValidElement(render)` is `false`.", "A valid React element must be provided to the `render` prop because it is cloned with props to replace the default element.", "https://base-ui.com/r/invalid-render-prop"].join("\n"));
      }
    }
    return /* @__PURE__ */ React5.cloneElement(newElement, mergedProps);
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
  return /* @__PURE__ */ React5.createElement(Tag, props);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/progress/root/ProgressRootContext.mjs
import * as React6 from "react";
var ProgressRootContext = /* @__PURE__ */ React6.createContext(void 0);
if (false) ProgressRootContext.displayName = "ProgressRootContext";
function useProgressRootContext() {
  const context = React6.useContext(ProgressRootContext);
  if (context === void 0) {
    throw new Error(false ? "Base UI: ProgressRootContext is missing. Progress parts must be placed within <Progress.Root>." : formatErrorMessage_default(51));
  }
  return context;
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/progress/root/ProgressRootDataAttributes.mjs
var ProgressRootDataAttributes = /* @__PURE__ */ (function(ProgressRootDataAttributes2) {
  ProgressRootDataAttributes2["complete"] = "data-complete";
  ProgressRootDataAttributes2["indeterminate"] = "data-indeterminate";
  ProgressRootDataAttributes2["progressing"] = "data-progressing";
  return ProgressRootDataAttributes2;
})({});

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/progress/root/stateAttributesMapping.mjs
var progressStateAttributesMapping = {
  status(value) {
    if (value === "progressing") {
      return {
        [ProgressRootDataAttributes.progressing]: ""
      };
    }
    if (value === "complete") {
      return {
        [ProgressRootDataAttributes.complete]: ""
      };
    }
    if (value === "indeterminate") {
      return {
        [ProgressRootDataAttributes.indeterminate]: ""
      };
    }
    return null;
  }
};

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/progress/root/ProgressRoot.mjs
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function getDefaultAriaValueText(formattedValue, value) {
  if (value == null) {
    return "indeterminate progress";
  }
  return formattedValue || `${value}%`;
}
var ProgressRoot = /* @__PURE__ */ React7.forwardRef(function ProgressRoot2(componentProps, forwardedRef) {
  const {
    format,
    getAriaValueText = getDefaultAriaValueText,
    locale,
    max = 100,
    min = 0,
    value,
    render,
    className,
    children,
    style,
    ...elementProps
  } = componentProps;
  const [labelId, setLabelId] = React7.useState();
  const formatOptionsRef = useValueAsRef(format);
  let status = "indeterminate";
  if (Number.isFinite(value)) {
    status = value === max ? "complete" : "progressing";
  }
  const formattedValue = formatNumberValue(value, locale, formatOptionsRef.current);
  const state = React7.useMemo(() => ({
    status
  }), [status]);
  const defaultProps = {
    "aria-labelledby": labelId,
    "aria-valuemax": max,
    "aria-valuemin": min,
    "aria-valuenow": value ?? void 0,
    "aria-valuetext": getAriaValueText(formattedValue, value),
    role: "progressbar",
    children: /* @__PURE__ */ _jsxs(React7.Fragment, {
      children: [children, /* @__PURE__ */ _jsx("span", {
        role: "presentation",
        style: visuallyHidden,
        children: "x"
      })]
    })
  };
  const contextValue = React7.useMemo(() => ({
    formattedValue,
    max,
    min,
    setLabelId,
    state,
    status,
    value
  }), [formattedValue, max, min, setLabelId, state, status, value]);
  const element = useRenderElement("div", componentProps, {
    state,
    ref: forwardedRef,
    props: [defaultProps, elementProps],
    stateAttributesMapping: progressStateAttributesMapping
  });
  return /* @__PURE__ */ _jsx(ProgressRootContext.Provider, {
    value: contextValue,
    children: element
  });
});
if (false) ProgressRoot.displayName = "ProgressRoot";

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/progress/track/ProgressTrack.mjs
import * as React8 from "react";
var ProgressTrack = /* @__PURE__ */ React8.forwardRef(function ProgressTrack2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const {
    state
  } = useProgressRootContext();
  const element = useRenderElement("div", componentProps, {
    state,
    ref: forwardedRef,
    props: elementProps,
    stateAttributesMapping: progressStateAttributesMapping
  });
  return element;
});
if (false) ProgressTrack.displayName = "ProgressTrack";

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/progress/indicator/ProgressIndicator.mjs
import * as React9 from "react";

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/utils/valueToPercent.mjs
function valueToPercent(value, min, max) {
  return (value - min) * 100 / (max - min);
}

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/progress/indicator/ProgressIndicator.mjs
var ProgressIndicator = /* @__PURE__ */ React9.forwardRef(function ProgressIndicator2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    ...elementProps
  } = componentProps;
  const {
    max,
    min,
    value,
    state
  } = useProgressRootContext();
  const percentageValue = Number.isFinite(value) && value !== null ? valueToPercent(value, min, max) : null;
  const indicatorStyle = percentageValue == null ? {} : {
    insetInlineStart: 0,
    height: "inherit",
    width: `${percentageValue}%`
  };
  const element = useRenderElement("div", componentProps, {
    state,
    ref: forwardedRef,
    props: [{
      style: indicatorStyle
    }, elementProps],
    stateAttributesMapping: progressStateAttributesMapping
  });
  return element;
});
if (false) ProgressIndicator.displayName = "ProgressIndicator";

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/progress/value/ProgressValue.mjs
import * as React10 from "react";
var ProgressValue = /* @__PURE__ */ React10.forwardRef(function ProgressValue2(componentProps, forwardedRef) {
  const {
    className,
    render,
    children,
    style,
    ...elementProps
  } = componentProps;
  const {
    value,
    formattedValue,
    state
  } = useProgressRootContext();
  const formattedValueArg = value == null ? "indeterminate" : formattedValue;
  const formattedValueDisplay = value == null ? null : formattedValue;
  const element = useRenderElement("span", componentProps, {
    state,
    ref: forwardedRef,
    props: [{
      "aria-hidden": true,
      children: typeof children === "function" ? children(formattedValueArg, value) : formattedValueDisplay
    }, elementProps],
    stateAttributesMapping: progressStateAttributesMapping
  });
  return element;
});
if (false) ProgressValue.displayName = "ProgressValue";

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/progress/label/ProgressLabel.mjs
import * as React13 from "react";

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useId.mjs
import * as React12 from "react";

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/safeReact.mjs
import * as React11 from "react";
var SafeReact = {
  ...React11
};

// node_modules/.pnpm/@base-ui+utils@0.3.1_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/utils/useId.mjs
var globalId = 0;
function useGlobalId(idOverride, prefix = "mui") {
  const [defaultId, setDefaultId] = React12.useState(idOverride);
  const id = idOverride || defaultId;
  React12.useEffect(() => {
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

// node_modules/.pnpm/@base-ui+react@1.6.0_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@base-ui/react/progress/label/ProgressLabel.mjs
var ProgressLabel = /* @__PURE__ */ React13.forwardRef(function ProgressLabel2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    id: idProp,
    ...elementProps
  } = componentProps;
  const {
    setLabelId,
    state
  } = useProgressRootContext();
  const id = useRegisteredLabelId(idProp, setLabelId);
  const element = useRenderElement("span", componentProps, {
    state,
    ref: forwardedRef,
    props: [{
      id,
      role: "presentation"
    }, elementProps],
    stateAttributesMapping: progressStateAttributesMapping
  });
  return element;
});
if (false) ProgressLabel.displayName = "ProgressLabel";
export {
  index_parts_exports as Progress
};
