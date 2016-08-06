"use strict";

var gulp = require('gulp');
var nodemon = require('gulp-nodemon');

/**
 * Start the server in development mode
 */
gulp.task('server', function() {
  nodemon({
    script: 'server.js',
    ext: 'js json hbs',
    ignore: ['gulpfile.js', 'public/', 'assets/', 'node_modules/', 'test/', 'tmp/'],
    env: {
      'NODE_ENV': 'development'
    }
  });
});

gulp.task('default', ['server']);
