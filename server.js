/**
 * Module dependencies.
 */
var express = require('express');
var compress = require('compression');
var session = require('express-session');
var cookie = require('cookie');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var logger = require('morgan');
var csrf = require('lusca').csrf();
var methodOverride = require('method-override');

var _ = require('lodash');
var MongoStore = require('connect-mongo')({ session: session });

var flash = require('express-flash');
var path = require('path');
var mongoose = require('mongoose');
var passport = require('passport');
var expressValidator = require('express-validator');
var connectAssets = require('connect-assets');

/**
 * Controllers (route handlers).
 */
var homeController = require('./controllers/home');
var ajaxController = require('./controllers/ajax');
var userController = require('./controllers/user');

/**
 * API keys and Passport configuration.
 */
var secrets = require('./config/secrets');
var passportConf = require('./config/passport');

/**
 * Connect to MongoDB.
 */
mongoose.connect(secrets.db);
mongoose.connection.on('error', function() {
    console.error('MongoDB Connection Error. Make sure MongoDB is running.');
});

var hour = 3600000;
var day = hour * 24;
var week = day * 7;

/**
 * CSRF whitelist.
 */
var csrfExclude = ['/url1', '/url2'];

/**
 * Create Express server.
 */
var app = express();

/**
 * Socket setup.
 */
 // SocketIO
var http = require('http').Server(app);
var io = require('socket.io')(http);

var passportSocketIo = require('passport.socketio');
// SEssion Store
var sessionStore = new MongoStore({
    url: secrets.db,
    auto_reconnect: true
});

// io.use(passportSocketIo.authorize({
//     cookieParser: cookieParser,
//     passport: passport,
//     key: 'express.sid',
//     secret: secrets.sessionSecret,
//     store: sessionStore
// }));

io.use(function(socket, accept) {
  handshake = socket.handshake;

  if (handshake.headers.cookie) {
    handshake.cookie = cookie.parse(handshake.headers.cookie);

    handshake.sessionId = cookieParser.signedCookie(handshake.cookie['express.sid'], secrets.sessionSecret);
    // console.log(handshake.sessionId);
    sessionStore.get(handshake.sessionId, function(err, session) {
        handshake.session = session;
        if (!err && !session ) {
            err = new Error('session not found');
        }
        handshake.session = session;
        //accept(err, true);
    });


    accept(null, true);
  }
});


// io.use(function(socket, next) {
//     cookieParser(socket.handshake, {}, function(err) {
//         console.log(socket);
//         if (err) {
//             console.log("error in parsing cookie");
//             return next(err);
//         }
//         if (!socket.handshake.signedCookies) {
//             console.log("no secureCookies|signedCookies found");
//             return next(new Error("no secureCookies found"));
//         }
//         sessionStore.get(socket.handshake.signedCookies["express.sid"], function(err, session){
//             console.log(session);
//             socket.session = session;
//             if (!err && !session) err = new Error('session not found');
//             if (err) {
//                  console.log('failed connection to socket.io:', err);
//             } else {
//                  console.log('successful connection to socket.io');
//             }
//             next(err);

//         });
//     });
// });

io.on('connection', function(socket) {
    console.log("connection from client: ",socket.id);
    socket.on('queryStream', function(msg) {
        ajaxController.stream(socket, msg);
    });
});

/**
 * Express configuration.
 */
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(compress());
app.use(connectAssets({
    paths: ['public/css', 'public/js'],
    helperContext: app.locals
}));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(expressValidator());
app.use(methodOverride());
app.use(cookieParser());
app.use(session({
    secret: secrets.sessionSecret,
    store: sessionStore,
    key: 'express.sid'
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use(function(req, res, next) {
    // CSRF protection.
    if (_.contains(csrfExclude, req.path)) return next();
    csrf(req, res, next);
});
app.use(function(req, res, next) {
    // Make user object available in templates.
    res.locals.user = req.user;
    next();
});
app.use(function(req, res, next) {
    // Remember original destination before login.
    var path = req.path.split('/')[1];
    if (/auth|login|logout|signup|img|fonts|favicon/i.test(path)) {
        return next();
    }
    req.session.returnTo = req.path;
    next();
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: week }));
app.use(function(req, res, next) {
    req.io = io;
    next();
})

/**
 * Main routes.
 */
app.get('/', homeController.landing);
app.get('/home', homeController.index);
//app.get('/', passportConf.isAuthenticated, homeController.index);
//app.get('/login', userController.getLogin);
//app.post('/login', userController.postLogin);
//app.get('/logout', userController.logout);
//app.get('/forgot', userController.getForgot);
//app.post('/forgot', userController.postForgot);
//app.get('/reset/:token', userController.getReset);
//app.post('/reset/:token', userController.postReset);
//app.get('/signup', userController.getSignup);
//app.post('/signup', userController.postSignup);
//app.get('/account', passportConf.isAuthenticated, userController.getAccount);
//app.post('/account/profile', passportConf.isAuthenticated, userController.postUpdateProfile);
//app.post('/account/password', passportConf.isAuthenticated, userController.postUpdatePassword);
//app.post('/account/delete', passportConf.isAuthenticated, userController.postDeleteAccount);
//app.get('/account/unlink/:provider', passportConf.isAuthenticated, userController.getOauthUnlink);

/**
 * OAuth sign-in routes.
 */
app.get('/login', passport.authenticate('twitter'));
app.get('/auth/twitter/callback', passport.authenticate('twitter', {
    failureRedirect: '/auth/twitter',
    successRedirect: '/home' }
), function(req, res) {
   res.redirect(req.session.returnTo || '/');
});

/**
 * Start Express server.
 */
http.listen(app.get('port'), function() {
    console.log('Express server listening on port %d in %s mode', app.get('port'), app.get('env'));
});

module.exports = app;