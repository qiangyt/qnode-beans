const Logger = require('qnode-log');
const _ = require('lodash');
const Path = require('path');

class Beans {

    constructor(config) {
        this._logger = new Logger('Beans');
        this._all = {};
        this._beansInited = {};
        const cfg = this._config = config || global.config || {};
        this.baseDir = (cfg.baseDir === null || cfg.baseDir === undefined) ? Beans.resolveBaseDir() : cfg.baseDir;
    }

    prepare(name, beanConfig) {
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
            this._logger.debug('no init() method on bean: %s', name);
        } else {
            this._logger.debug('begin initing bean: %s', name);
            bean.init();
            this._logger.debug('inited bean: %s', name);
        }
    }

    init(notFirstTime) {
        if (notFirstTime) this._logger.debug('found more beans...');
        else this._logger.info('initing');

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
            this._logger.info('inited');
            return;
        }

        this.init(true);
    }

    render(bean, name, beanModuleAsClass) {
        const bname = bean._name = name || bean._name;

        this._logger.debug('rendering bean: %s', bname);

        bean._module = beanModuleAsClass;
        bean._logger = new Logger(bname);

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
        return Path.dirname(mainPath);
    }

    create(beanModulePath, name) {
        if (!name) {
            name = Path.parse(beanModulePath).name;
        }

        this._logger.debug('creating bean "%s" from module: %s', name, beanModulePath);

        if (this._all[name]) throw new Error(`duplicated bean: ${name}`);

        /* eslint global-require: "off" */
        const clazz = require(Path.join(this.baseDir, beanModulePath));

        const r = new clazz();
        this.render(r, name, clazz);

        this._all[name] = r;

        this._logger.debug('created bean "%s" from module: %s', name, beanModulePath);

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

const _D = Beans.DEFAULT = new Beans(global.config);

Beans.prepare = _D.prepare.bind(_D);
Beans.all = () => _D.all;
Beans.init = _D.init.bind(_D);
Beans.initBean = _D.initBean.bind(_D);
Beans.render = _D.render.bind(_D);
Beans.create = _D.create.bind(_D);
Beans.load = _D.load.bind(_D);
Beans.get = _D.get.bind(_D);

module.exports = Beans;