const Logger = require('qnode-log');
const _ = require('lodash');
const Path = require('path');
const Fs = require('fs');

//TODO: register Beans self as bean

class Beans {

    constructor(config) {
        this._logger = new Logger('Beans');
        this._all = {};
        this._beansInited = {};

        let cfg;
        if (config) cfg = config;
        else if (global.config) {
            if (global.config.Beans) {
                cfg = global.config.Beans;
            }
        }
        this._config = cfg = cfg || {};

        this.baseDir = (cfg.baseDir === null || cfg.baseDir === undefined) ? Beans.resolveBaseDir() : cfg.baseDir;
    }

    config(name, beanConfig) {
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

    initBean(bean) {
        const name = bean._name;

        if (!bean.init) {
            this._logger.debug('no init() method on bean: %s\n', name);
        } else {
            this._logger.debug('initing bean: %s', name);
            bean.init();
            this._logger.debug('inited bean: %s\n', name);
        }
    }

    renderThenInitBean(bean, name, beanModuleAsClass) {
        this.render(bean, name, beanModuleAsClass);
        this.initBean(bean);
    }

    init(notFirstTime) {
        if (notFirstTime) this._logger.debug('found more beans...');
        else this._logger.info('initing\n');

        const beansInited = this._beansInited;
        const all = _.clone(this._all);

        for (let name in all) {
            if (beansInited[name]) continue;

            const bean = all[name];
            this.initBean(bean);
            beansInited[name] = bean;
        }

        if (_.size(this._all) === _.size(beansInited)) {
            // no any more beans are dynamically created during bean.init();
            this._logger.info('inited\n');
            return;
        }

        this.init(true);
    }

    render(bean, name, beanModuleAsClass) {
        const bname = bean._name = name || bean._name;

        this._logger.debug('rendering bean: %s', bname);

        bean._module = beanModuleAsClass;
        if(!bean._logger) bean._logger = new Logger(bname);

        const config = {};
        _.merge(config, this._config[bname] || {});
        _.merge(config, bean._config || {});
        bean._config = config;

        bean._beans = this;

        this._logger.debug('rendered bean: %s', bname);
    }

    static resolveBaseDir(mainPath) {
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

    create(beanModulePathOrClass, name) {
        let beanModulePath, beanClass;
        if ('string' === typeof beanModulePathOrClass) {
            beanModulePath = beanModulePathOrClass;
        } else {
            beanClass = beanModulePathOrClass;
        }

        if (!name) {
            if (beanModulePath) name = Path.parse(beanModulePath).name;
            else if (beanClass) name = beanClass.name;
            else throw new Error(`dont know bean name: ${beanModulePathOrClass}`);
        }

        if (beanModulePath) {
            this._logger.debug('creating bean "%s" from module: %s', name, beanModulePath);
        } else {
            this._logger.debug('creating bean "%s"', name);
        }

        if (this._all[name]) throw new Error(`duplicated bean: ${name}`);

        if (!beanClass) {
            /* eslint global-require: "off" */
            beanClass = require(Path.join(this.baseDir, beanModulePath));
        }


        const r = new beanClass();
        this.render(r, name, r);

        this._all[name] = r;

        if (beanModulePath) {
            this._logger.debug('created bean "%s" from module: %s\n', name, beanModulePath);
        } else {
            this._logger.debug('created bean "%s"', name);
        }

        return r;
    }

    load(name) {
        const r = this._all[name];
        if (!r) throw new Error(`no bean named: ${name}`);
        return r;
    }

    get(name) {
        return this._all[name];
    }

}

const _D = Beans.DEFAULT = new Beans();

Beans.config = _D.config.bind(_D);
Beans.all = () => _D.all;
Beans.init = _D.init.bind(_D);
Beans.initBean = _D.initBean.bind(_D);
Beans.renderThenInitBean = _D.renderThenInitBean.bind(_D);
Beans.render = _D.render.bind(_D);
Beans.create = _D.create.bind(_D);
Beans.load = _D.load.bind(_D);
Beans.get = _D.get.bind(_D);

module.exports = Beans;
