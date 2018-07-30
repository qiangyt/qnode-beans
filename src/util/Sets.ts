export function fromArray<T>( array:T[] ):Set<T> {
    if( array === null ) return null;
    if( array === undefined ) return undefined;
    
    const r = new Set<T>();
    array.forEach( i => r.add(i) );
    return r;
}


export function fromAnyStringArray( array:any ):Set<string> {
    return fromArray( <string[]>array );
}