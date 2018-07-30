import * as Uuid from 'uuid';

export function uuid():string {
    return Uuid.v4();
}

export function prettyJson(obj:any):string {
    return JSON.stringify(obj, null, 4);
}
