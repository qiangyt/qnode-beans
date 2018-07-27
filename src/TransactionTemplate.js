/* eslint no-catch-shadow: 'off' */

const Transaction = require('./Transaction');

/**
 * 
 */
module.exports = class TransactionTemplate {
    

    constructor(ctx, logger) {
        this.ctx = ctx;
        this.logger = logger;
    } 


    async executeNew( ctx, asyncAction ) {
        
        const log = this.logger, debug = log.isDebugEnabled();

        const tx = ctx.tx = new Transaction();
        const txId = tx.id;

        if (debug) log.debug('prepare db-tx: %s', txId);

        try {
            await asyncAction(ctx);
            ctx.tx = undefined;

            try {
                if (debug) log.debug('commiting db-tx: %s', txId);
                await tx.commit();
                if (debug) log.debug('commited db-tx: %s', txId);
            } catch (e) {
                log.error(e);
            }
        } catch (e) {
            ctx.tx = undefined;

            try {
                if (debug) log.debug('rollbacking db-tx: %s', txId);
                await tx.rollback();
                if (debug) log.debug('rollbacked db-tx: %s', txId);
            } catch (e) {
                log.error(e);
            }
            throw e;
        }
    }

};
