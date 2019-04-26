'use strict';

var _ = require('lodash');
var hbs = require('hbs');
var redis = require('redis');
var Dropbox = require('dropbox');
var request = require('request');

var client = redis.createClient(process.env.REDIS_URL);
var dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
var ignoreFolders = process.env.DROPBOX_IGNORE_FOLDERS ? process.env.DROPBOX_IGNORE_FOLDERS.toLowerCase().split(',') : [];

client.on('error', function (err) {
  console.error('Error ' + err);
});

var _app = null;
module.exports = {
  setApp: function(app) {
    _app = app;
  },
  index: function(req, res, next) {
    // Respond to Dropbox webhook challenge
    if (req.query.challenge) {
      console.log('Challenged by dropbox: ' + req.query.challenge);
      res.send(req.query.challenge);
    }
    else {
      // Get dropbox cursor
      var cursor_key = 'dropbox/cursor/'+process.env.DROPBOX_ACCESS_TOKEN+'/'+process.env.DROPBOX_FOLDER;
      client.get(cursor_key, function(err, cursor) {
        if (cursor) {
          console.log('Listing changes from cursor', cursor);
          // Get changed files
          dbx.filesListFolderContinue({cursor:cursor})
          .then(function(response) {
            // TODO: get all entries if response.has_more == true
            // response.entries = [{".tag":"deleted","name":"2014 - airdrop economy.xls","path_display":"/k&e/2014 - airdrop economy.xls","path_lower":"/k&e/2014 - airdrop economy.xls"},{".tag":"deleted","name":"2013 - iphone5.xlsx","path_display":"/k&e/2013 - iphone5.xlsx","path_lower":"/k&e/2013 - iphone5.xlsx"},{".tag":"file","client_modified":"2016-06-18T09:38:53Z","id":"id:aF8ShzpyFi0AAAAAAAAAag","name":"Voucher hyrbil sommar 2016 copy.pdf","parent_shared_folder_id":"89220786","path_display":"/K&E/Voucher hyrbil sommar 2016 copy.pdf","path_lower":"/k&e/voucher hyrbil sommar 2016 copy.pdf","rev":"3b1055166b2","server_modified":"2016-08-06T19:21:41Z","sharing_info":{"modified_by":"dbid:AACcjKKc3tEzjjTrgwXsBMHdTGgvZE8paBk","parent_shared_folder_id":"89220786","read_only":false},"size":378800},{".tag":"file","client_modified":"2013-02-11T16:01:27Z","id":"id:aF8ShzpyFi0AAAAAAAAAEA","name":"2013 - iPhone5x.xlsx","parent_shared_folder_id":"89220786","path_display":"/K&E/2013 - iPhone5x.xlsx","path_lower":"/k&e/2013 - iphone5x.xlsx","rev":"3b4055166b2","server_modified":"2016-08-06T19:22:13Z","sharing_info":{"modified_by":"dbid:AACcjKKc3tEzjjTrgwXsBMHdTGgvZE8paBk","parent_shared_folder_id":"89220786","read_only":false},"size":44402},{".tag":"file","client_modified":"2016-08-06T19:22:30Z","id":"id:aF8ShzpyFi0AAAAAAAAADw","name":"2012 - Digitalkameror.xlsx","parent_shared_folder_id":"89220786","path_display":"/K&E/2012 - Digitalkameror.xlsx","path_lower":"/k&e/2012 - digitalkameror.xlsx","rev":"3b5055166b2","server_modified":"2016-08-06T19:22:35Z","sharing_info":{"modified_by":"dbid:AACcjKKc3tEzjjTrgwXsBMHdTGgvZE8paBk","parent_shared_folder_id":"89220786","read_only":false},"size":30148}];
            console.log('Dropbox change count + has_more', _.countBy(response.entries, '.tag'), response.has_more);
            var deleted = _.filter(response.entries, function(e) {
              return e['.tag'] === 'deleted';
            }).filter(function(e) {
              return _some(ignoreFolders, function(x) {
                e.path_lower.indexOf(x) >= 0;
              });
            }).sort(function(a,b) {
              return a.path_lower.localeCompare(b.path_lower);
            });
            if (deleted.length > 0) {
              // Retrieve e-mail of dropbox user
              dbx.usersGetCurrentAccount()
              .then(function(emailResponse) {
                var receiver = process.env.RECEIVER_EMAIL ? process.env.RECEIVER_EMAIL : emailResponse.email;
                var message = 'Dropbox: ' + deleted[0].name;
                if (deleted.length > 1) {
                  message += ' and ' + (deleted.length-1) + ' other files were deleted';
                }
                else {
                  message += ' was deleted';
                }
                if (process.env.DROPBOX_FOLDER) {
                  message +=  ' from ' + process.env.DROPBOX_FOLDER;
                }
                var context = {
                  message: message,
                  // message: 'Dropbox: ' + deleted.length + ' files deleted from ' + process.env.DROPBOX_FOLDER + ' ' + new Date().toISOString(),
                  email: receiver,
                  deleted_count: deleted.length,
                  deleted: deleted
                };
                res.render('default', context);
                // Send e-mail
                _app.render('default', context, function(err, html) {
                  console.log('Sending e-mail to ' + receiver + ': ' + context.message);
                  request.post(
                      'https://api.mailgun.net/v3/' + process.env.MAILGUN_DOMAIN + '/messages',
                      {
                        auth: {
                          user: 'api',
                          pass: process.env.MAILGUN_API_KEY
                        },
                        form: {
                          from: process.env.SENDER_EMAIL,
                          to: receiver,
                          subject: context.message,
                          text: context.message,
                          html: html
                        }
                      },
                      function (error, response, body) {
                          if (error || response.statusCode != 200) {
                            console.error('Failed to send e-mail', error, response.statusCode);
                          }
                          else {
                              console.log('Successfully sent e-mail', body);
                          }
                      }
                  );
                });
                // Store new cursor in REDIS
                client.set(cursor_key, response.cursor, redis.print);
                console.log('New cursor', response.cursor);
              })
              .catch(function(error) {
                console.error(error);
                res.render('error', {
                  message: error,
                  error: error
                });
              });
            }
            else {
              console.log('No changes');
              res.render('default', {
                message: 'No changes'
              });
              // Store new cursor in REDIS
              client.set(cursor_key, response.cursor, redis.print);
              console.log('New cursor', response.cursor);
            }
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
            console.log('Created cursor');
            res.render('default', {
              message: 'Created cursor'
            });
          })
          .catch(function(error) {
            console.error(error);
            res.render('error', {
              message: error,
              error: error
            });
          });
        }
      });
    }
  }
}