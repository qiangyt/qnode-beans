const Logger = require('qnode-log');
const _ = require('lodash');
const Path = require('path');

class Beans {

    constructor(config) {
        this._logger = new Logger('Beans');
        this._all = {};
        this._beansInited = {};
        this._config = config || global.config || {};
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

    init() {
        const beansInited = this._beansInited;
        const logger = this._logger;
        const all = _.clone(this._all);

        for (let name in all) {
            if (beansInited[name]) continue;

            const b = all[name];
            if (b.init) {
                logger.debug('begin initing bean: %s', name);
                b.init();
                logger.debug('inited bean: %s', name);
            }
            beansInited[name] = b;
        }

        if (_.size(this._all) === _.size(beansInited)) {
            // no any more beans are dynamically created during bean.init();
            return;
        }

        this.init();
    }

    render(bean, name, beanModuleAsClass) {
        bean._module = beanModuleAsClass;
        bean._name = name;
        bean._logger = new Logger(name);
        bean._config = this._config[name] || {};
        bean._beans = this;
    }

    create(beanModulePath, name) {
        if (!name) {
            name = _.lowerFirst(Path.parse(beanModulePath).name);
        }

        if (this._all[name]) throw new Error(`duplicated bean: ${name}`);

        /* eslint global-require: "off" */
        const clazz = require(beanModulePath);
        const r = new clazz();
        this.render(r, name, clazz);

        this._all[name] = r;

        this._logger.debug('loaded bean %s from module: %s', name, beanModulePath);

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

Beans.DEFAULT = new Beans(global.config);

module.exports = Beans;