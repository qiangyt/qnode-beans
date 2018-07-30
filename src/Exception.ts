/**
 * 扩展Error对象，以便放置一个自定义数据
 */
export default class Exception extends Error {

    public data:any;
    public args:any[];
    public ctx:any;
    
    constructor( data:any, ...args:any[] ) {
        super('');
        this.data = data;
        //this.args = ( arguments.length > 1 ) ? Array.from(arguments).slice(1) : [];
        this.args = args || [];
    }
}



