var gulp = require('gulp');
var babelify = require('babelify');
var browserify = require('browserify');
var vinylSourceStream = require('vinyl-source-stream');
var vinylBuffer = require('vinyl-buffer');
var plugins = require('gulp-load-plugins')();
// Конфиги
var src = {
	app: 'src/yaCsp.js',
	all: 'src/**/*.js'
}
var out = {
	file: 'yaCsp.min.js',
	folder: 'build/'
}
// Поднятие dev-сервера
function webServer() {
	return gulp.src('')
	  .pipe(plugins.webserver({
	  	directoryListing: true,
	      path: '/',
	      port: 3000
	  }));
};
// Сбор скриптов
gulp.task('scripts', function() {
	var sources = browserify({
		entries: src.app,
		debug: true
	})
	.transform(babelify.configure({}));

	return sources.bundle()
	  .on('error', function(err) {
			this.emit("end");
	  })
		.pipe(vinylSourceStream(out.file))
		.pipe(vinylBuffer())
		.pipe(plugins.sourcemaps.init({
			loadMaps: true
		}))
		.pipe(plugins.uglify())
		.pipe(plugins.sourcemaps.write('./', {
			includeContent: true
		}))
		.pipe(gulp.dest(out.folder))
		.on('error', function (error) {
        console.error('' + error);
    });
});
// Минификация плагина КриптоПро
gulp.task('plugin', function() {
	return gulp.src('cadesplugin_api.js')
		.pipe(plugins.uglify())
		.pipe(gulp.dest(out.folder));
});
// Валидация исходников
gulp.task('check', function chec() {
	gulp.src(src.all)
		.pipe(plugins.jshint({
        esnext: true
    }))
    .pipe(plugins.jshint.reporter('default'));
});
// Сборка в режиме разработчика с поднятием web-сервера
// и слежением за изменениями
gulp.task('dev', ['check', 'scripts', 'plugin'], function() {
	webServer();
	gulp.watch([src.all], ['check', 'scripts']);
});
// Релищная сборка
gulp.task('default', ['check', 'scripts', 'plugin']);
