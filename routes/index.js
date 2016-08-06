"use strict";

var fs = require('fs');
var hbs = require("hbs");
var path = require("path");
var redis = require("redis");
var Dropbox = require('dropbox');

var client = redis.createClient(process.env.REDIS_URL);
var dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });

client.on("error", function (err) {
  console.log("Error " + err);
});

module.exports = function(req, res, next) {
  // Get dropbox cursor
  var cursor_key = 'dropbox/cursor/'+process.env.DROPBOX_ACCESS_TOKEN+'/'+process.env.DROPBOX_FOLDER;
  client.get(cursor_key, function(err, cursor) {
    if (cursor) {
      // Get changed files
      dbx.filesListFolderContinue({cursor:cursor})
      .then(function(response) {
        if (response.entries.length > 0) {
          // TODO: get all entries if response.has_more == true
          res.send(response.entries);
        }
        else {
          res.send('No new entries');
        }
        // Store new cursor in REDIS
        client.set(cursor_key, response.cursor, redis.print);
      })
    }
    else {
      // Create cursor
      dbx.filesListFolderGetLatestCursor({
        path: process.env.DROPBOX_FOLDER,
        recursive: true,
        include_deleted: true
      })
      .then(function(response) {
        // Store cursor in REDIS
        client.set(cursor_key, response.cursor, redis.print);
        res.send('Created cursor');
      });
    }
  });
  // Retrieve e-mail of dropbox user
  // dbx.usersGetCurrentAccount()
  // .then(function(response) {
  //   res.send(response.email);
  // })
  // .catch(function(error) {
  //   res.send(error);
  // });

  // res.send("Hello there");
};