var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/use-sync-external-store@1.6.0_react@19.2.8/node_modules/use-sync-external-store/cjs/use-sync-external-store.production.js
var require_use_sync_external_store_production = __commonJS({
  "node_modules/.pnpm/use-sync-external-store@1.6.0_react@19.2.8/node_modules/use-sync-external-store/cjs/use-sync-external-store.production.js"(exports) {
    "use strict";
    var useSyncExternalStore = __require("react").useSyncExternalStore;
    exports.useSyncExternalStore = useSyncExternalStore;
  }
});

// node_modules/.pnpm/use-sync-external-store@1.6.0_react@19.2.8/node_modules/use-sync-external-store/index.js
var require_use_sync_external_store = __commonJS({
  "node_modules/.pnpm/use-sync-external-store@1.6.0_react@19.2.8/node_modules/use-sync-external-store/index.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_use_sync_external_store_production();
    } else {
      module.exports = null;
    }
  }
});

// vendor/dist/.entry-use-sync-external-store.js
var entry_use_sync_external_store_exports = {};
__export(entry_use_sync_external_store_exports, {
  default: () => import_use_sync_external_store.default
});
__reExport(entry_use_sync_external_store_exports, __toESM(require_use_sync_external_store(), 1));
var import_use_sync_external_store = __toESM(require_use_sync_external_store(), 1);
var export_default = import_use_sync_external_store.default;
export {
  export_default as default
};
/*! Bundled license information:

use-sync-external-store/cjs/use-sync-external-store.production.js:
  (**
   * @license React
   * use-sync-external-store.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
