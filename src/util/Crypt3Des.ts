import Base64 from './Base64';
import * as Crypto from 'crypto';


export default class Crypt3Des {

    private config:any = {};
    
    public key:string;
    public iv:string;
    public base64DecodedKey:string;


    init() {
        this.key = this.config.key;
        this.iv = this.config.iv;

        if( !this.key ) throw new Error('<Crypt3Des.key> is not configured');
        if( undefined === this.iv ) throw new Error('<Crypt3Des.iv> is not configured');

        this.base64DecodedKey = Base64.decode(this.key);
    }

    /**
     * 3DES/CBC加密
     */
    encrypt_cbc_base64( input:string ) {
        input = Crypt3Des.padding( input );

        const cipher = Crypto.createCipheriv( 'des-ede3-cbc', this.base64DecodedKey, this.iv );
        cipher.setAutoPadding(false);

        let ciph = cipher.update( input, 'utf8', 'base64' );
        ciph += cipher.final('base64');

        return Crypt3Des.removeBR(ciph);
    }

    /**
     * 3DES/CBC解密
     */
    decrypt_cbc_base64( encrypted:any ) {
        const decipher = Crypto.createDecipheriv('des-ede3-cbc', this.base64DecodedKey, this.iv);
        decipher.setAutoPadding(false);

        let txt = (<any>decipher).update(encrypted, 'base64', 'base64');
        txt += decipher.final('base64');

        return Crypt3Des.removePadding(txt);
    }

    /**
     * 用\0补齐字符串，使其长度是8的倍数
     */
    static padding( str:string ) {
        const len = 8 - (str.length % 8);
        const result = [str];

        for( let i = 0; i < len; i++ ) result.push( '\0' );

        return result.join('');
    }
   
    /**
     * 去除补齐用的\0。
     */
    static removePadding( str:string ) {
        let last = str.length - 1;
        for( ; last >= 0; last-- ) {
            if( str[last] !== '\0' ) break;
        }
        return str.substring( 0, last + 1 );
    }

	/**
     * 去除回车符(\r, \n)
     */
    static removeBR( str:string ) {
        let len = str.length;
        const result = [];
        for( let i = 0; i < len; i++ ) {
            let c = str[i];
            if( c !== '\n' && c !== '\r' ) result.push(c);
        }
        return result.join('');
    }

}

