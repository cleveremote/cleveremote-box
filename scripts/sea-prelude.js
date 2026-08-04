"use strict";
process.env.NODE_ENV = process.env.NODE_ENV || "production";
(function initRealRequire() {
  var path = require("node:path");
  var Module = require("node:module");
  var fakeEntry = path.join(path.dirname(process.execPath), "sea-entry.cjs");
  require = Module.createRequire(fakeEntry);
})();
