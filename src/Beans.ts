import * as LoggerFactory from './Logger';
import {Logger} from './Logger';
import Bean from './Bean';
import * as _ from 'lodash';
import * as Path from 'path';
import * as Fs from 'fs';

//TODO: register Beans self as bean

declare module global {
    let config:any;
}


export default class Beans {

    static DEFAULT:Beans = new Beans();

    private _config:any;
    private _baseDir:string;
    private _logger:Logger;
    private _all:any = {};
    private _beansInited:any = {};
    

    constructor(config:any = undefined) {
        
        let cfg;
        if (config) cfg = config;
        else if (global.config) {
            if (global.config.beans) {
                cfg = global.config.beans;
            }
        }
        this._config = cfg = cfg || {};
        this._config.name = this._config.name || 'Beans';
        this._logger = cfg.logDisabled ? null : LoggerFactory.create(cfg.name);

        this._baseDir = (cfg.baseDir === null || cfg.baseDir === undefined) ? Beans.resolveBaseDir() : cfg.baseDir;
    }


    config(name:string, beanConfig = {}) {
        if (this._all[name]) {
            throw new Error(`cannot configure the already-created bean named "${name}"`);
        }
        let existing = this._config[name];
        if (!existing) {
            existing = this._config[name] = beanConfig;
        } else {
            _.merge(existing, beanConfig);
        }
    }


    get all() {
        return this._all;
    }


    async initBean(bean:Bean) {
        const log = this._logger;
        const logArgs = {beanName:bean._name};

        if (!bean.init) {
            if(log) log.debug(logArgs, 'bean has no init() method');
            return;
        }

        if(log) log.debug(logArgs, 'start to init bean');
            
        let r;
            
        try {
            r = bean.init();
        } catch(err) {
            if(log) log.error(logArgs, 'end to init bean');
            throw err;
        }

        if( r && r.then && r.catch ) {
            // the init method is async (AKA. return Promise)
            try {
                await r;
            } catch(err) {
                if(log) log.error(logArgs, 'end to init bean');
                throw err;
            }
        }
            
        if(log) log.debug(logArgs, 'end to init bean');
    }


    async renderThenInitBean(bean:Bean, name:string, beanModuleAsClass:NodeModule) {
        this.render(bean, name, beanModuleAsClass);
        await this.initBean(bean);
    }


    async init(notFirstTime:boolean) {
        const log = this._logger;

        if (!notFirstTime) {
            if(log) log.info('initing\n');
        }

        const beansInited = this._beansInited;
        const all = _.clone(this._all);

        for (let name in all) {
            if (beansInited[name]) continue;

            const bean = all[name];
            await this.initBean(bean);
            beansInited[name] = bean;
        }

        const remaining = _.size(this._all) - _.size(beansInited);
        if (remaining === 0) {
            // no any more beans are dynamically created during bean.init();
            if(log) log.info('inited\n');
            return;
        }

        if(log) log.debug({remaining}, 'found more beans...');
        await this.init(true);
    }


    render(bean:Bean, name:string, beanModuleAsClass:NodeModule) {
        const beanName = bean._name = name || bean._name;
        const logArgs = {beanName};

        const log = this._logger;
        if(log) log.debug(logArgs, 'rendering');

        bean._module = beanModuleAsClass;
        if(!bean._logger) bean._logger = LoggerFactory.create(beanName);

        const config = {};
        _.merge(config, this._config[beanName] || {});
        _.merge(config, bean._config || {});
        bean._config = config;

        bean._beans = this;

        if(log) log.debug(logArgs, 'rendered');
    }


    static resolveBaseDir(mainPath='') {
        mainPath = mainPath || process.mainModule.filename;
        const posOfNM = mainPath.indexOf('node_modules');

        if (posOfNM >= 0) {
            return mainPath.substring(0, posOfNM - 1);
        }

        let dir = mainPath;
        while (true) {
            let r = Path.dirname(dir);
            if (r === dir) {
                throw new Error('failed to resolve base dir: ' + mainPath);
            }
            dir = r;

            /* eslint no-sync: "off" */
            let stat;
            try {
                stat = Fs.statSync(Path.join(r, 'node_modules'));
                if (stat.isDirectory()) {
                    stat = Fs.statSync(Path.join(r, 'package.json'));
                    if (stat.isFile()) {
                        return r;
                    }
                }
            } catch (e) {
                dir = r;
            }
        }
    }


    create(beanModulePathOrClass:string|any, beanName:string = undefined) {

        const log = this._logger;

        let beanModulePath:string, beanClass;
        if ('string' === typeof beanModulePathOrClass) {
            beanModulePath = beanModulePathOrClass;
        } else {
            beanClass = beanModulePathOrClass;
        }

        if (!beanName) {
            if (beanModulePath) beanName = Path.parse(beanModulePath).name;
            else if (beanClass) beanName = beanClass.name;
            else {
                if(log) log.error({beanModulePathOrClass}, 'dont know bean name');
                throw new Error(`dont know bean name: ${beanModulePathOrClass}`);
            }
        }
        
        if(log) log.debug({beanName, beanModulePath}, 'creating bean');

        if (this._all[beanName]) {
            if(log) log.error({beanName}, 'duplicated bean');
            throw new Error(`duplicated bean: ${beanName}`);
        }

        if (!beanClass) {
            /* eslint global-require: "off" */
            beanClass = require(Path.join(this._baseDir, beanModulePath));
        }


        const r = new beanClass();
        this.render(r, beanName, beanClass);

        this._all[beanName] = r;

        if(log) log.debug({beanName, beanModulePath}, 'created bean');
        return r;
    }

    create2(beanModulePathOrClass:string|any, beanName:string = undefined) {

        const log = this._logger;

        let beanModulePath:string, beanClass;
        if ('string' === typeof beanModulePathOrClass) {
            beanModulePath = beanModulePathOrClass;
        } else {
            beanClass = beanModulePathOrClass;
        }

        if (!beanName) {
            if (beanModulePath) beanName = Path.parse(beanModulePath).name;
            else if (beanClass) beanName = beanClass.name;
            else {
                if(log) log.error({beanModulePathOrClass}, 'dont know bean name');
                throw new Error(`dont know bean name: ${beanModulePathOrClass}`);
            }
        }
        
        if(log) log.debug({beanName, beanModulePath}, 'creating bean');

        if (this._all[beanName]) {
            log.error({beanName}, 'duplicated bean');
            throw new Error(`duplicated bean: ${beanName}`);
        }

        if (!beanClass) {
            /* eslint global-require: "off" */
            beanClass = require(Path.join(this._baseDir, beanModulePath));
        }


        const r = new beanClass();
        this.render(r, beanName, beanClass);

        this._all[beanName] = r;

        if(log) log.debug({beanName, beanModulePath}, 'created bean');
        return r;
    }


    load(name:string) {
        const r = this.get(name);
        if (!r) throw new Error(`no bean named: ${name}`);
        return r;
    }


    get(name:string) {
        return this._all[name];
    }
}

const _D = Beans.DEFAULT;
const _Beans:any = Beans;

_Beans.config = _D.config.bind(_D);
_Beans.all = () => _D.all;
_Beans.init = _D.init.bind(_D);
_Beans.initBean = _D.initBean.bind(_D);
_Beans.renderThenInitBean = _D.renderThenInitBean.bind(_D);
_Beans.render = _D.render.bind(_D);
_Beans.create = _D.create.bind(_D);
_Beans.load = _D.load.bind(_D);
_Beans.get = _D.get.bind(_D);

module.exports = Beans;
