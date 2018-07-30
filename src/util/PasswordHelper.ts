import * as Crypto from 'crypto';


export default class PasswordHelper {

    static generateSalt():number {
        const r = Math.random() * 1000000000;
        return Math.floor(r);
    }

    static hash( password:string, salt:number ):string {
        const hash = Crypto.createHash('sha256');
        hash.update( password + '-' + salt );
        return hash.digest('base64');
    }

    static verify( passwordInput:string, salt:number, hashedPassword:string ) {
        const hashedPasswordToVerify = PasswordHelper.hash( passwordInput, salt );
        return hashedPasswordToVerify === hashedPassword;
    }

}

