


export default class Time {

    /**
     * 
     */
    static formatAsISO8601( time:Date ) {
        return Time.formatDate(time) + 'T' + Time.formatTime(time, false) + 'Z';
    }

    /**
     * 
     */
    static format( time:Date, includeMilliseconds:boolean ) {
        return Time.formatDate(time) + ' ' + Time.formatTime(time, includeMilliseconds);
    }

    /**
     * 
     */
    static formatYearMonth( time:Date ) {
        let result = '' + time.getFullYear();

        const mon = time.getMonth() + 1;
        result += '-' + (( mon < 10 ) ? '0' : '') + mon;

        return result;
    }

    /**
     * 
     */
    static formatDate( time:Date ) {

        let result = Time.formatYearMonth( time );

        const date = time.getDate();
        result += '-' + (( date < 10 ) ? '0' : '') + date;
    
        return result;
    }

    /**
     * 
     */
    static formatTime( time:Date, includeMilliseconds:boolean ) {
        let result = '';

        const hour = time.getHours();
        result += (( hour < 10 ) ? '0' : '') + hour;

        const min = time.getMinutes();
        result += ':' + (( min < 10 ) ? '0' : '') + min;

        const sec = time.getSeconds();
        result += ':' + (( sec < 10 ) ? '0' : '') + sec;
    
        if( includeMilliseconds ) {
            result += '.' + time.getMilliseconds();
        }

        return result;
    }

}
