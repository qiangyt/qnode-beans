

export default class Base64 {

    /**
     * base64编码
     */
    static encode( toEncode:any ) {
        return new Buffer(toEncode).toString('base64');
    }

    /**
     * base64解码
     */
    public static decode( base64EncodedString:string ) {
        return new Buffer( base64EncodedString, 'base64' ).toString();
    }

}
