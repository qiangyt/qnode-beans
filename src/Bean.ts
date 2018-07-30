import {Logger} from './Logger';
import Beans from './Beans';


export default class Bean {

    public _config:any;
    public _name:string;
    public _logger:Logger;
    public _beans:Beans;
    public _module:NodeModule;


    init():any {
    }

}
