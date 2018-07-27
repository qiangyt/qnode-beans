const QError = require('qnode-error');
const InternalError = QError.InternalError;
const Logger = require('qnode-log');
const Misc = require('./Misc');
const logger = new Logger('Transaction');


/**
 * 
 */
module.exports = class Transaction {

    constructor( ctx, options ) {
        this.ctx = ctx || {};
        this.options = options;
        this.id = Misc.uuid();
        this.resources = [];

        this.finishing = false;
        this.finished = false;

        this.rollbacked = false;
        this.rollbacking = false;
        this.ignore = false;
    }


    startRollbackTimer() {
        const timeout = this.getTimeout();

        setTimeout( () => {
            if( !(this.finished || this.finishing || this.rollbacked || this.rollbacking ) ) {
                // 如果过了设定的超时时间以后，这个事务还是没被提交或回滚，那么自动回滚
                logger.fatal( 'rollback due to timeout: %s', this.toLogObject(true) );
                this.rollback();
            }
        }, timeout );
    }


    getTimeout() {
        let r = 0;

        if( this.options && this.options.timeout ) r = this.options.timeout;

        if( r <= 0 && global.tx && global.tx.timeout ) r = global.tx.timeout;

        if( !r || r <= 10 ) r = 10; // 10 seconds

        return r * 1000;
    }


    toLogObject( detail ) {
        return {
            ctx: this.ctx,
            resources: this.resources.map( res => { 
                return {
                    key: res.instance.key,
                    data: detail ? res.data : undefined
                }; 
            } ),
            finished: this.finished,
            finishing: this.finishing,
            rollbacked: this.rollbacked,
            rollbacking: this.rollbacking
        };
    }


    /**
     * 把一个资源排入事务。
     */
    enlist( instance ) {
        const debug = logger.isDebugEnabled();

        if( this.finished || this.finishing ) {
            const msg = 'transaction already finished/finishing';
            const logObj = this.toLogObject(false);
            logger.error( msg + `: %s`, logObj );
            throw new InternalError( msg, logObj );
        }
        
        if( !instance ) throw new InternalError( 'instance should be NOT undefined/null' );
        
        const key = instance.key;
        if( !key ) throw new InternalError( 'instance should be NOT undefined/null' );

        const instanceLog = {key, ctx: this.ctx};
        if(debug) logger.debug( 'enlisting: %s', instanceLog);

        const resources = this.resources;

        if( resources.length > 0 ) {
            const existing = resources[0];
            if( existing.instance.key === key ) {
                // 重复，但是可以容忍
                if(debug) logger.debug( 'enlistment ignored due to duplicated instance key: %s', instanceLog );
                return Promise.resolve(existing.data);
            }

            // 没有重复，但是目前还只支持但事务源（TODO: 后续考虑支持多个事务资源，2PC分布式事务），
            // 所以实际上this.resources.length <= 1
            const msg = 'some instance already enlisted before';
            const logObj = {ctx: this.ctx, key: existing.instance.key, description: existing.description};
            logger.error( msg + ": %s", logObj );
            throw new InternalError( msg, logObj );
        }

        return instance.enlistTx(this.options)
        .then( data => {
            if( !data ) throw new InternalError( 'enlisted data should be NOT undefined/null' );
            
            resources.push({instance, data});
            if(debug) logger.debug( 'enlisted: %s', instanceLog );

            this.ignore = false;

            return data;
        } );
    }


    _setFinishing( logObj, finishing ) {
        this.finishing = finishing;
        logObj.finishing = this.finishing;

        this.finished = !finishing;
        logObj.finished = this.finished;
    }


    _setRollbacking( logObj, rollbacking ) {
        this.rollbacking = rollbacking;
        logObj.rollbacking = this.rollbacking;

        this.rollbacked = !rollbacking;
        logObj.rollbacked = this.rollbacked;
    }


    commit() {
        const debug = logger.isDebugEnabled();
    
        const logObj = this.toLogObject(false);
        if(debug) logger.debug( 'committing: %s', logObj );

        if( this.finished || this.finishing ) {
            const msg = 'transaction already finished/finishing';
            logger.error( msg + ': %s', logObj );
            throw new InternalError( msg, logObj );
        }

        this._setFinishing( logObj, true );

        if( this.resources.length === 0 ) {
            this._setFinishing( logObj, false );

            if(debug) logger.debug( 'nothing to commit. %s', logObj );
            return Promise.resolve();
        }

        const res = this.resources[0];
        this.resources = [];
        
        if(debug) logger.debug( 'commit prepared. %s', logObj );

        return res.instance.commitTx(res.data)
        .then( () => {
            this._setFinishing( logObj, false );

            if(debug) logger.debug( 'commit-ed. %s', logObj );
         } )
        .catch( err => {
            this._setFinishing( logObj, false );
            
            const msg = 'commit failed';
            Object.assign( err, this.toLogObject(true) );
            logger.fatal( err, msg );
            throw new InternalError( msg, err );
        } );
    }


    rollback() {
        const debug = logger.isDebugEnabled();
        
        const logObj = this.toLogObject(false);
        if(debug) logger.debug( 'rollbacking. %s', logObj );

        if( this.finished || this.finishing ) {
            if( this.rollbacked || this.rollbacking ) return Promise.resolve();
            
            const msg = 'transaction already finished/finishing';
            logger.error( msg + ' %s', logObj );
            throw new InternalError( msg, logObj );
        }

        this._setFinishing( logObj, true );
        this._setRollbacking( logObj, true );

        if( this.resources.length === 0 ) {
            this._setFinishing( logObj, false );
            this._setRollbacking( logObj, false );

            if(debug) logger.debug( 'nothing to rollback. %s', logObj );
            return Promise.resolve();
        }


        const res = this.resources[0];
        this.resources = [];
        
        if(debug) logger.debug( 'rollback prepared. %s', logObj );

        return res.instance.rollbackTx(res.data)
        .then( () => {
            this._setFinishing( logObj, false );
            this._setRollbacking( logObj, false );

            logger.info( 'rollbacked. %s', logObj );
         } )
        .catch( err => {
            this._setFinishing( logObj, false );
            this._setRollbacking( logObj, false );

            // 标记rollback并未成功
            this.rollbacked = false; 
            logObj.rollbacked = this.rollbacked;

            const msg = 'rollback failed';
            Object.assign( err, this.toLogObject(true) );
            logger.fatal( err, msg );
        } );
    }

};
