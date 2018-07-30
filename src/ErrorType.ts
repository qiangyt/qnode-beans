const vsprintf = require("sprintf-js").vsprintf;


/**
 * 定义一个预定义的错误类别
 * 
 * TODO: support open-tracing
 */
export default class ErrorType {

    constructor( public key:string, public code:number, public formaters:any ) {
        if( !formaters['en_US'] ) throw new Error("Error '" + code + "': missing formater for locale 'en_US'");
        if( !formaters['zh_CN'] ) throw new Error("Error '" + code + "': missing formater for locale 'zh_CN'");
    }

    build( args:any[], locale = 'zh_CN' ) {
        let formater = this.formaters[locale];
        if( !formater ) formater = this.formaters['en_US'];

        return {
            code: '' + this.code, // return the code as text so that conforms to default behaviors of restify
            key: this.key,
            message: vsprintf( formater, args ),
            time: new Date().getTime()
        };
    }
}



