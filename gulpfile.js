var gulp = require("gulp");
var ts = require("gulp-typescript");
var tsProject = ts.createProject("tsconfig.json");
var sourcemaps = require('gulp-sourcemaps');
var merge2 = require('merge2');
var fs = require('fs');
var rimraf = require('rimraf');


gulp.task("clean", function() {
    rimraf('dist', () => {});
});

gulp.task("default", function() {
    var tsResult = tsProject.src().pipe(tsProject());

    gulp.src(['./src/**/*.js', './src/**/*.json'])
        .pipe(gulp.dest('dist'));

    return merge2([ // Merge the two output streams, so this task is finished when the IO of both operations is done.
        tsResult.dts.pipe(gulp.dest('dist')),
        tsResult.js.pipe(gulp.dest('dist'))
    ]);
});


gulp.task('watch', ['default'], function() {
    gulp.watch('src/**/*.ts', ['default']);
});