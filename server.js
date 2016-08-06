"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var env = require("node-env-file");

var envFile = path.join(__dirname, "./.env");
if (process.env.NODE_ENV === "development" || typeof process.env.NODE_ENV === "undefined" && fs.existsSync(envFile)) {
  env(envFile);
}

var app = require("./app");

app.set("port", (process.env.PORT || 8080));

http.createServer(app).listen(app.get("port"), function() {
  console.log("Express server listening on port " + app.get("port"));
});
