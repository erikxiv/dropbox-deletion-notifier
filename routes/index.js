'use strict';

var _ = require('lodash');
var hbs = require('hbs');
var redis = require('redis');
var Dropbox = require('dropbox');
var sg_helper = require('sendgrid').mail
var request = require('request');

var client = redis.createClient(process.env.REDIS_URL);
var dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
var sg = require('sendgrid')(process.env.SENDGRID_API_KEY);

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
          // Get changed files
          dbx.filesListFolderContinue({cursor:cursor})
          .then(function(response) {
            // TODO: get all entries if response.has_more == true
            // response.entries = [{".tag":"deleted","name":"2014 - airdrop economy.xls","path_display":"/k&e/2014 - airdrop economy.xls","path_lower":"/k&e/2014 - airdrop economy.xls"},{".tag":"deleted","name":"2013 - iphone5.xlsx","path_display":"/k&e/2013 - iphone5.xlsx","path_lower":"/k&e/2013 - iphone5.xlsx"},{".tag":"file","client_modified":"2016-06-18T09:38:53Z","id":"id:aF8ShzpyFi0AAAAAAAAAag","name":"Voucher hyrbil sommar 2016 copy.pdf","parent_shared_folder_id":"89220786","path_display":"/K&E/Voucher hyrbil sommar 2016 copy.pdf","path_lower":"/k&e/voucher hyrbil sommar 2016 copy.pdf","rev":"3b1055166b2","server_modified":"2016-08-06T19:21:41Z","sharing_info":{"modified_by":"dbid:AACcjKKc3tEzjjTrgwXsBMHdTGgvZE8paBk","parent_shared_folder_id":"89220786","read_only":false},"size":378800},{".tag":"file","client_modified":"2013-02-11T16:01:27Z","id":"id:aF8ShzpyFi0AAAAAAAAAEA","name":"2013 - iPhone5x.xlsx","parent_shared_folder_id":"89220786","path_display":"/K&E/2013 - iPhone5x.xlsx","path_lower":"/k&e/2013 - iphone5x.xlsx","rev":"3b4055166b2","server_modified":"2016-08-06T19:22:13Z","sharing_info":{"modified_by":"dbid:AACcjKKc3tEzjjTrgwXsBMHdTGgvZE8paBk","parent_shared_folder_id":"89220786","read_only":false},"size":44402},{".tag":"file","client_modified":"2016-08-06T19:22:30Z","id":"id:aF8ShzpyFi0AAAAAAAAADw","name":"2012 - Digitalkameror.xlsx","parent_shared_folder_id":"89220786","path_display":"/K&E/2012 - Digitalkameror.xlsx","path_lower":"/k&e/2012 - digitalkameror.xlsx","rev":"3b5055166b2","server_modified":"2016-08-06T19:22:35Z","sharing_info":{"modified_by":"dbid:AACcjKKc3tEzjjTrgwXsBMHdTGgvZE8paBk","parent_shared_folder_id":"89220786","read_only":false},"size":30148}];
            var deleted = _.reject(response.entries, function(e) {
              return e['.tag'] === 'deleted';
            }).sort(function(a,b) {
              return a.path_lower.localeCompare(b.path_lower);
            });
            if (deleted.length > 0) {
              // Retrieve e-mail of dropbox user
              dbx.usersGetCurrentAccount()
              .then(function(emailResponse) {
                var receiver = process.env.RECEIVER_EMAIL ? process.env.RECEIVER_EMAIL : emailResponse.email;
                var context = {
                  message: 'Dropbox: ' + deleted[0].name + ' and ' + (deleted.length-1) + ' other files where deleted from ' + process.env.DROPBOX_FOLDER,
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
                        qs: {
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
                  // var from_email = new sg_helper.Email(process.env.SENDER_EMAIL);
                  // var to_email = new sg_helper.Email(receiver);
                  // var subject = context.message;
                  // var content = new sg_helper.Content('text/html', html);
                  // var mail = new sg_helper.Mail(from_email, subject, to_email, content);
                  // var request = sg.emptyRequest({
                  //   method: 'POST',
                  //   path: '/v3/mail/send',
                  //   body: mail.toJSON()
                  // });
                  // console.log(subject);
                  // sg.API(request, function(error, response) {
                  //   console.log(response.statusCode)
                  //   console.log(response.body)
                  //   console.log(response.headers)
                  // });
                });
                // Store new cursor in REDIS
                client.set(cursor_key, response.cursor, redis.print);
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