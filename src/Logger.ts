import * as util from 'util';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as Path from 'path';
import * as bunyan from 'bunyan';
import Time from './util/Time';
import Config from './Config';
import CodePath from './util/CodePath';
const BunyanConsoleStream = require('./BunyanConsoleStream');


declare module global {
    let workFolder:string;
    
    let product:string;
    let module:string;
    let logLevel:string;
    let logsFolder:string;
    let logsFile:string;
    let errorLogsFile:string;
    let fatalLogsFile:string;

    let isLocal:boolean;
    let isProd:boolean;
}

const env = process.env;

global.logLevel = env['QNODE_LOG_LEVEL'] || (global.isProd ? 'info' : 'debug');
console.log('global.logLevel = ' + global.logLevel);

const launchTime = new Date();

global.logsFolder = Path.join( global.workFolder, 'logs', Time.formatYearMonth(launchTime) );
console.log('global.logsFolder = ' + global.logsFolder);


const pid = process.pid; // pid is used to append to log file path to survive cluster-ed execution
const logFilePrefix = `${global.product}-${global.module}_${Time.formatDate(launchTime)}_${global.isLocal ? 'local': ('' + pid)}`;

global.logsFile = Path.join( global.logsFolder, logFilePrefix + '.log' );
console.log('global.logsFile = ' + global.logsFile);

global.errorLogsFile = Path.join( global.logsFolder, logFilePrefix + '.error.log' );
console.log('global.errorLogsFile = ' + global.errorLogsFile);

global.fatalLogsFile = Path.join( global.logsFolder, logFilePrefix + '.fatal.log' );
console.log('global.fatalLogsFile = ' + global.fatalLogsFile);

// 初始化logs目录
/*eslint no-sync: "off"*/
try {
    fs.statSync(global.logsFolder);
} catch( e ) {
    mkdirp.sync(global.logsFolder);
}

function loadConfiguration() {
    const r:any = new Config('logger', CodePath.resolve('../config'));    

    if( !r.name ) r.name = global.product;
    if( !r.level ) r.level = global.logLevel;
    if( !r.src ) r.src = !global.isProd;
    if( !r.rotationPeriod ) r.rotationPeriod = '1d';// daily rotation
    if( !r.rotationCount ) r.rotationCount = 30;   // keep 30-days back copies
    if( !r.errorRotationPeriod ) r.errorRotationPeriod = '1m';// monthly rotation
    if( !r.errorRotationCount ) r.errorRotationCount = 3;   // keep 3-month back copies
    if( !r.fatalRotationPeriod ) r.fatalRotationPeriod = '1m';// monthly rotation
    if( !r.fatalRotationCount ) r.fatalRotationCount = 12;   // keep 12-month back copies

    return r;
}

const cfg = loadConfiguration();


function contextSerializer(ctx:any) {
    const r = {
        apiName: ctx.apiDefinition ? ctx.apiDefinition.name : undefined,
        spanId: ctx.spanId,
        traceId: ctx.traceId,
        previousSpanId: ctx.previousSpanId,
        txId:<any>(undefined),
        isTxOwner:<boolean>(undefined)
    };

    if( ctx.tx ) {
        r.txId = ctx.tx.id;
        r.isTxOwner = ctx.isTxOwner;
    }

    return r;
}

///////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
const rootLoggerOptions = {
    name: cfg.name,
    level: cfg.level,
    src: cfg.src,
    serializers: {
        ctx: contextSerializer,
        err: bunyan.stdSerializers.err,
        req: bunyan.stdSerializers.req,
        res: bunyan.stdSerializers.res
    },
    streams: [
        {
            level: cfg.level,
            type: 'raw',
            stream: new BunyanConsoleStream(process.stdout)
        },
        {
            level: 'error',
            type: 'raw',
            stream: new BunyanConsoleStream(process.stderr)
        },
        {
            type: 'rotating-file',
            period: cfg.rotationPeriod,
            count: cfg.rotationCount,
            path: global.logsFile,
            level: cfg.level
        },
        {
            type: 'rotating-file',
            period: cfg.errorRotationPeriod,
            count: cfg.errorRotationCount,
            path: global.errorLogsFile,
            level: 'error'
        }, 
        {
            type: 'rotating-file',
            period: cfg.fatalRotationPeriod,
            count: cfg.fatalRotationCount,
            path: global.fatalLogsFile,
            level: 'fatal'
        }
    ]
};


const rootLogger = bunyan.createLogger(<bunyan.LoggerOptions>rootLoggerOptions);


process.on( 'uncaughtException', (err:Error) => {
  rootLogger.fatal(err, 'uncaught exception. exiting...');
  process.exit(1);/* eslint no-process-exit: 'off' */
} );



// In those cases that using external log rotation utilities like logrotate on Linux or logadm on SmartOS/Illumos,
// tell bunyan to reopen the file stream
process.on('SIGUSR2', function () {
    rootLogger.reopenFileStreams();
});

export type Logger = bunyan;

/**
 * 对bunyan日志库的简单封装，以便统一日志设置
 */
export function create(nameOrBean:string|any):Logger {
    const id = util.isString(nameOrBean) ? nameOrBean : nameOrBean._name;
    return rootLogger.child( {id} );
}

export { cfg as config };
