var moment = require('moment');
var http = require('http');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

//---- globals and constants

var nodeVer = process.versions.node.split('.').map(Number);
var nodeSpawnSupportsStdio = (nodeVer[0] > 0 || nodeVer[1] >= 8);

// Internal debug logging via `console.warn`.
var _selfTrace = function selfTraceNoop() { };
if (process.env.BUNYAN_SELF_TRACE === '1') {
    _selfTrace = function selfTrace() {
        process.stderr.write('[bunyan self-trace] ');
        console.warn.apply(null, arguments);
    }
}

// Output modes.
var OM_LONG = 1;
var OM_JSON = 2;
var OM_INSPECT = 3;
var OM_SIMPLE = 4;
var OM_SHORT = 5;
var OM_BUNYAN = 6;
var OM_FROM_NAME = {
    'long': OM_LONG,
    'paul': OM_LONG,  /* backward compat */
    'json': OM_JSON,
    'inspect': OM_INSPECT,
    'simple': OM_SIMPLE,
    'short': OM_SHORT,
    'bunyan': OM_BUNYAN
};


// Levels
var TRACE = 10;
var DEBUG = 20;
var INFO = 30;
var WARN = 40;
var ERROR = 50;
var FATAL = 60;

var levelFromName = {
    'trace': TRACE,
    'debug': DEBUG,
    'info': INFO,
    'warn': WARN,
    'error': ERROR,
    'fatal': FATAL
};
var nameFromLevel = {};
var upperNameFromLevel = {};
var upperPaddedNameFromLevel = {};
Object.keys(levelFromName).forEach(function (name) {
    var lvl = levelFromName[name];
    nameFromLevel[lvl] = name;
    upperNameFromLevel[lvl] = name.toUpperCase();
    upperPaddedNameFromLevel[lvl] = (
        name.length === 4 ? ' ' : '') + name.toUpperCase();
});


// Display time formats.
var TIME_UTC = 1;  // the default, bunyan's native format
var TIME_LOCAL = 2;

// Timezone formats: output format -> momentjs format string
var TIMEZONE_UTC_FORMATS = {
    long: '[[]YYYY-MM-DD[T]HH:mm:ss.SSS[Z][]]',
    short: 'HH:mm:ss.SSS[Z]'
};
var TIMEZONE_LOCAL_FORMATS = {
    long: '[[]YYYY-MM-DD[T]HH:mm:ss.SSSZ[]]',
    short: 'HH:mm:ss.SSS'
};


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
// Suggested colors (some are unreadable in common cases):
// - Good: cyan, yellow (limited use), bold, green, magenta, red
// - Bad: blue (not visible on cmd.exe), grey (same color as background on
//   Solarized Dark theme from <https://github.com/altercation/solarized>, see
//   issue #160)
var colors = {
    'bold': [1, 22],
    'italic': [3, 23],
    'underline': [4, 24],
    'inverse': [7, 27],
    'white': [37, 39],
    'grey': [90, 39],
    'black': [30, 39],
    'blue': [34, 39],
    'cyan': [36, 39],
    'green': [32, 39],
    'magenta': [35, 39],
    'red': [31, 39],
    'yellow': [33, 39]
};

function stylizeWithColor(str, color) {
    if (!str)
        return '';
    var codes = colors[color];
    if (codes) {
        return '\033[' + codes[0] + 'm' + str +
            '\033[' + codes[1] + 'm';
    } else {
        return str;
    }
}

/**
 * Is this a valid Bunyan log record.
 */
function isValidRecord(rec) {
    if (rec.v == null ||
        rec.level == null ||
        rec.name == null ||
        rec.hostname == null ||
        rec.pid == null ||
        rec.time == null ||
        rec.msg == null) {
        // Not valid Bunyan log.
        return false;
    } else {
        return true;
    }
}

var format = util.format;
if (!format) {
    /* BEGIN JSSTYLED */
    // If not node 0.6, then use its `util.format`:
    // <https://github.com/joyent/node/blob/master/lib/util.js#L22>:
    var inspect = util.inspect;
    var formatRegExp = /%[sdj%]/g;
    format = function format(f) {
        if (typeof f !== 'string') {
            var objects = [];
            for (var i = 0; i < arguments.length; i++) {
                objects.push(inspect(arguments[i]));
            }
            return objects.join(' ');
        }

        var i = 1;
        var args = arguments;
        var len = args.length;
        var str = String(f).replace(formatRegExp, function (x) {
            if (i >= len)
                return x;
            switch (x) {
                case '%s': return String(args[i++]);
                case '%d': return Number(args[i++]);
                case '%j': return JSON.stringify(args[i++]);
                case '%%': return '%';
                default:
                    return x;
            }
        });
        for (var x = args[i]; i < len; x = args[++i]) {
            if (x === null || typeof x !== 'object') {
                str += ' ' + x;
            } else {
                str += ' ' + inspect(x);
            }
        }
        return str;
    };
    /* END JSSTYLED */
}


function indent(s) {
    return '    ' + s.split(/\r?\n/).join('\n    ');
}

/**
 * Print out a single result, considering input options.
 */
function emitRecord(rec, line, opts, stylize) {
    var short = false;

    switch (opts.outputMode) {
        case OM_SHORT:
            short = true;
        /* jsl:fall-thru */

        case OM_LONG:
            //    [time] LEVEL: name[/comp]/pid on hostname (src): msg* (extras...)
            //        msg*
            //        --
            //        long and multi-line extras
            //        ...
            // If 'msg' is single-line, then it goes in the top line.
            // If 'req', show the request.
            // If 'res', show the response.
            // If 'err' and 'err.stack' then show that.
            if (!isValidRecord(rec)) {
                return emit(line + '\n');
            }

            delete rec.v;

            // Time.
            var time;
            if (!short && opts.timeFormat === TIME_UTC) {
                // Fast default path: We assume the raw `rec.time` is a UTC time
                // in ISO 8601 format (per spec).
                time = '[' + rec.time + ']';
            } else if (!moment && opts.timeFormat === TIME_UTC) {
                // Don't require momentjs install, as long as not using TIME_LOCAL.
                time = rec.time.substr(11);
            } else {
                var tzFormat;
                var moTime = moment(rec.time);
                switch (opts.timeFormat) {
                    case TIME_UTC:
                        tzFormat = TIMEZONE_UTC_FORMATS[short ? 'short' : 'long'];
                        moTime.utc();
                        break;
                    case TIME_LOCAL:
                        tzFormat = TIMEZONE_LOCAL_FORMATS[short ? 'short' : 'long'];
                        break;
                    default:
                        throw new Error('unexpected timeFormat: ' + opts.timeFormat);
                };
                time = moTime.format(tzFormat);
            }
            time = stylize(time, 'none');
            delete rec.time;

            var nameStr = rec.name;
            delete rec.name;

            if (rec.component) {
                nameStr += '/' + rec.component;
            }
            delete rec.component;

            if (!short)
                nameStr += '/' + rec.pid;
            delete rec.pid;

            var level = (upperPaddedNameFromLevel[rec.level] || 'LVL' + rec.level);
            if (opts.color) {
                var colorFromLevel = {
                    10: 'white',    // TRACE
                    20: 'yellow',   // DEBUG
                    30: 'cyan',     // INFO
                    40: 'magenta',  // WARN
                    50: 'red',      // ERROR
                    60: 'inverse',  // FATAL
                };
                level = stylize(level, colorFromLevel[rec.level]);
            }
            delete rec.level;

            var src = '';
            if (rec.src && rec.src.file) {
                var s = rec.src;
                if (s.func) {
                    src = format(' (%s:%d in %s)', s.file, s.line, s.func);
                } else {
                    src = format(' (%s:%d)', s.file, s.line);
                }
                src = stylize(src, 'green');
            }
            delete rec.src;

            var hostname = rec.hostname;
            delete rec.hostname;

            var extras = [];
            var details = [];

            if (rec.req_id) {
                extras.push('req_id=' + rec.req_id);
            }
            delete rec.req_id;

            var onelineMsg;
            if (rec.msg.indexOf('\n') !== -1) {
                onelineMsg = '';
                details.push(indent(stylize(rec.msg, 'cyan')));
            } else {
                onelineMsg = ' ' + stylize(rec.msg, 'cyan');
            }
            delete rec.msg;

            if (rec.req && typeof (rec.req) === 'object') {
                var req = rec.req;
                delete rec.req;
                var headers = req.headers;
                if (!headers) {
                    headers = '';
                } else if (typeof (headers) === 'string') {
                    headers = '\n' + headers;
                } else if (typeof (headers) === 'object') {
                    headers = '\n' + Object.keys(headers).map(function (h) {
                        return h + ': ' + headers[h];
                    }).join('\n');
                }
                s = format('%s %s HTTP/%s%s', req.method,
                    req.url,
                    req.httpVersion || '1.1',
                    headers
                );
                delete req.url;
                delete req.method;
                delete req.httpVersion;
                delete req.headers;
                if (req.body) {
                    s += '\n\n' + (typeof (req.body) === 'object'
                        ? JSON.stringify(req.body, null, 2) : req.body);
                    delete req.body;
                }
                if (req.trailers && Object.keys(req.trailers) > 0) {
                    s += '\n' + Object.keys(req.trailers).map(function (t) {
                        return t + ': ' + req.trailers[t];
                    }).join('\n');
                }
                delete req.trailers;
                details.push(indent(s));
                // E.g. for extra 'foo' field on 'req', add 'req.foo' at
                // top-level. This *does* have the potential to stomp on a
                // literal 'req.foo' key.
                Object.keys(req).forEach(function (k) {
                    rec['req.' + k] = req[k];
                })
            }

            if (rec.client_req && typeof (rec.client_req) === 'object') {
                var client_req = rec.client_req;
                delete rec.client_req;

                var headers = client_req.headers;
                delete client_req.headers;

                s = format('%s %s HTTP/%s%s',
                    client_req.method,
                    client_req.url,
                    client_req.httpVersion || '1.1',
                    (headers ?
                        '\n' + Object.keys(headers).map(
                            function (h) {
                                return h + ': ' + headers[h];
                            }).join('\n') :
                        ''));
                delete client_req.method;
                delete client_req.url;
                delete client_req.httpVersion;

                if (client_req.body) {
                    s += '\n\n' + (typeof (client_req.body) === 'object' ?
                        JSON.stringify(client_req.body, null, 2) :
                        client_req.body);
                    delete client_req.body;
                }
                // E.g. for extra 'foo' field on 'client_req', add
                // 'client_req.foo' at top-level. This *does* have the potential
                // to stomp on a literal 'client_req.foo' key.
                Object.keys(client_req).forEach(function (k) {
                    rec['client_req.' + k] = client_req[k];
                });
                details.push(indent(s));
            }

            function _res(res) {
                var s = '';

                /*
                 * Handle `res.header` or `res.headers` as either a string or
                 * an object of header key/value pairs. Prefer `res.header` if set,
                 * because that's what Bunyan's own `res` serializer specifies,
                 * because that's the value in Node.js's core HTTP server response
                 * implementation that has all the implicit headers.
                 *
                 * Note: `res.header` (string) typically includes the 'HTTP/1.1 ...'
                 * status line.
                 */
                var headerTypes = { string: true, object: true };
                var headers;
                var headersStr = '';
                var headersHaveStatusLine = false;
                if (res.header && headerTypes[typeof (res.header)]) {
                    headers = res.header;
                    delete res.header;
                } else if (res.headers && headerTypes[typeof (res.headers)]) {
                    headers = res.headers;
                    delete res.headers;
                }
                if (headers === undefined) {
                    /* pass through */
                } else if (typeof (headers) === 'string') {
                    headersStr = headers.trimRight(); // Trim the CRLF.
                    if (headersStr.slice(0, 5) === 'HTTP/') {
                        headersHaveStatusLine = true;
                    }
                } else {
                    headersStr += Object.keys(headers).map(
                        function (h) { return h + ': ' + headers[h]; }).join('\n');
                }

                /*
                 * Add a 'HTTP/1.1 ...' status line if the headers didn't already
                 * include it.
                 */
                if (!headersHaveStatusLine && res.statusCode !== undefined) {
                    s += format('HTTP/1.1 %s %s\n', res.statusCode,
                        http.STATUS_CODES[res.statusCode]);
                }
                delete res.statusCode;
                s += headersStr;

                if (res.body !== undefined) {
                    var body = (typeof (res.body) === 'object'
                        ? JSON.stringify(res.body, null, 2) : res.body);
                    if (body.length > 0) { s += '\n\n' + body };
                    delete res.body;
                } else {
                    s = s.trimRight();
                }
                if (res.trailer) {
                    s += '\n' + res.trailer;
                }
                delete res.trailer;
                if (s) {
                    details.push(indent(s));
                }
                // E.g. for extra 'foo' field on 'res', add 'res.foo' at
                // top-level. This *does* have the potential to stomp on a
                // literal 'res.foo' key.
                Object.keys(res).forEach(function (k) {
                    rec['res.' + k] = res[k];
                });
            }

            if (rec.res && typeof (rec.res) === 'object') {
                _res(rec.res);
                delete rec.res;
            }
            if (rec.client_res && typeof (rec.client_res) === 'object') {
                _res(rec.client_res);
                delete rec.client_res;
            }

            if (rec.err && rec.err.stack) {
                var err = rec.err
                if (typeof (err.stack) !== 'string') {
                    details.push(indent(err.stack.toString()));
                } else {
                    details.push(indent(err.stack));
                }
                delete err.message;
                delete err.name;
                delete err.stack;
                // E.g. for extra 'foo' field on 'err', add 'err.foo' at
                // top-level. This *does* have the potential to stomp on a
                // literal 'err.foo' key.
                Object.keys(err).forEach(function (k) {
                    rec['err.' + k] = err[k];
                })
                delete rec.err;
            }

            var leftover = Object.keys(rec);
            for (var i = 0; i < leftover.length; i++) {
                var key = leftover[i];
                var value = rec[key];
                var stringified = false;
                if (typeof (value) !== 'string') {
                    value = JSON.stringify(value, null, 2);
                    stringified = true;
                }
                if (value === undefined) {
                    value = '';
                }
                if (value.indexOf('\n') !== -1 || value.length > 50) {
                    details.push(indent(key + ': ' + value));
                } else if (!stringified && (value.indexOf(' ') != -1 ||
                    value.length === 0)) {
                    extras.push(key + '=' + JSON.stringify(value));
                } else {
                    extras.push(key + '=' + value);
                }
            }

            extras = stylize(
                (extras.length ? ' (' + extras.join(', ') + ')' : ''), 'none');
            details = stylize(
                (details.length ? details.join('\n    --\n') + '\n' : ''), 'none');
            if (!short)
                emit(format('%s %s: %s on %s%s:%s%s\n%s',
                    time,
                    level,
                    nameStr,
                    hostname || '<no-hostname>',
                    src,
                    onelineMsg,
                    extras,
                    details));
            else
                emit(format('%s %s %s:%s%s\n%s',
                    time,
                    level,
                    nameStr,
                    onelineMsg,
                    extras,
                    details));
            break;

        case OM_INSPECT:
            emit(util.inspect(rec, false, Infinity, true) + '\n');
            break;

        case OM_BUNYAN:
            emit(JSON.stringify(rec, null, 0) + '\n');
            break;

        case OM_JSON:
            emit(JSON.stringify(rec, null, opts.jsonIndent) + '\n');
            break;

        case OM_SIMPLE:
            /* JSSTYLED */
            // <http://logging.apache.org/log4j/1.2/apidocs/org/apache/log4j/SimpleLayout.html>
            if (!isValidRecord(rec)) {
                return emit(line + '\n');
            }
            emit(format('%s - %s\n',
                upperNameFromLevel[rec.level] || 'LVL' + rec.level,
                rec.msg));
            break;
        default:
            throw new Error('unknown output mode: ' + opts.outputMode);
    }
}


function emit(s) {
    const stdConsole = this.stdConsole || process.stdout;
    try {
        stdConsole.write(s);
    } catch (writeErr) {
        _selfTrace('exception from stdout.write:', writeErr)
        // Handle any exceptions in stdout writing in `stdout.on('error', ...)`.
    }
}



function BunyanConsoleStream(stdConsole) {
    this.stdConsole = stdConsole;
    this.writable = true;
    EventEmitter.call(this);
}

const opts = {
    color: true,
    outputMode: OM_LONG,
    timeFormat: TIME_LOCAL
};

BunyanConsoleStream.prototype.write = function (record) {
    if (!this.writable) throw (new Error('BunyanConsoleStream has been ended already'));

    emitRecord(record, '', opts, stylizeWithColor);
    return (true);
};

BunyanConsoleStream.prototype.end = function () {
    if (arguments.length > 0)
        this.write.apply(this, Array.prototype.slice.call(arguments));
    this.writable = false;
};

BunyanConsoleStream.prototype.destroy = function () {
    this.writable = false;
    this.emit('close');
};

BunyanConsoleStream.prototype.destroySoon = function () {
    this.destroy();
};

util.inherits(BunyanConsoleStream, EventEmitter);

module.exports = BunyanConsoleStream;
