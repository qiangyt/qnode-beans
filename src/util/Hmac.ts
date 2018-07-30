import * as Crypto from 'crypto';


export default class Hmac {

    static sha1( input:Buffer, key:string ) {
        const result = Crypto.createHmac('sha1', key);
        result.update( input );
        return result.digest();
    }

}

