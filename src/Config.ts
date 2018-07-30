/* eslint no-process-env:'off' */

import * as Fs from 'fs';
import * as Path from 'path';
import * as Os from 'os';
import * as _ from 'lodash';
import CodePath from './util/CodePath';
import * as Misc from './util/Misc';

const Yaml = require('js-yaml');
const Mkdirp = require('mkdirp');

const env = process.env;
const ENV = env.NODE_ENV || 'test';

const YAML_LOAD_OPTIONS = {};
const YAML_DUMP_OPTIONS = {};
const FILE_READ_OPTIONS = { encoding: 'utf-8' || env.CHARSET };

const pkg = require(CodePath.resolve('../package.json'));

declare module global {
    let isLinux:boolean;
    let isMac:boolean;

    let product:string;
    let module:string;
    let workFolder:string;
    let profile:string;
    
    let isLocal:boolean;
    let isDev:boolean;
    let isTest:boolean;
    let isUat:boolean;
    let isProd:boolean;
}

global.isLinux = (Os.platform() === 'linux');
global.isMac = (Os.platform() === 'darwin');

global.isLocal = ('local' === ENV);
global.isDev = ('dev' === ENV);
global.isTest = ('test' === ENV);
global.isUat = ('uat' === ENV);
global.isProd = ('prod' === ENV);
global.product = env['QNODE_PRODUCT'] || Misc.uuid();
global.module = env['QNODE_MODULE'] || pkg.name;
global.profile = ENV;

let workFolderBase;
if (global.isLinux || global.isMac) workFolderBase = '/data';
else workFolderBase = Os.tmpdir();

global.workFolder = Path.join(workFolderBase, global.product, global.profile, global.module);
Mkdirp.sync(global.workFolder);

console.log(JSON.stringify({
    isLinux: global.isLinux,
    isMac: global.isMac,
    product: global.product,
    module: global.module,
    workFolder: global.workFolder,
    profile: global.profile,
    
    isLocal: global.isLocal,
    isDev: global.isDev,
    isTest: global.isTest,
    isUat: global.isUat,
    isProd: global.isProd
}, null, 4));



export default class Config {

    private object:any;

    
    loadSpecificWithProfile(base:string, ext:string, profile:string) {
        const fullPath = base + (profile ? ('.' + profile) : ext);

        let content:string;
        try {
            content = Fs.readFileSync(fullPath, FILE_READ_OPTIONS);
        } catch (e) {
            return undefined;
        }

        const isJavascript = ('.js' === ext);
        if (isJavascript) {
            try {
                return eval(content);
            } catch (e) {
                console.error('error occurred during evaluate js file: ' + fullPath);
                throw e;
            }
        }

        try {
            return Yaml.load(content, YAML_LOAD_OPTIONS);
        } catch (e) {
            console.error('error occurred during parse YAML/JSON file: ' + fullPath);
            throw e;
        }
    }

    
    
    loadSpecific(base:string, ext:string, profile:string) {
        let r = this.loadSpecificWithProfile(base, ext, undefined);
        let profiled = this.loadSpecificWithProfile(base, ext, profile);

        if (!r && !profiled) return undefined;

        _.merge(r || {}, profiled || {});

        return r;
    }

    
    
    normalize(file:any) {
        let r;

        if ('string' === typeof file) {
            const p = Path.parse(file);
            r = { dir: p.dir, name: p.name, ext: p.ext };
        } else {
            r = _.cloneDeep(file);
        }

        const ext = r.ext;
        if (ext) r.ext = (ext.indexOf('.') === 0) ? ext : `.${ext}`;

        const n = r.name;
        if (!n) throw new Error('file name is required');
        if (!n.indexOf('.')) throw new Error(`file name "${n}" should NOT contain extension`);

        if (!r.dir) r.dir = process.cwd();

        r.base = Path.normalize(Path.join(r.dir, n));

        r.profile = r.profile || global.profile;

        return r;
    }

    
    
    is(fullPath:string, name:string) {
        const p = Path.parse(fullPath);
        const ext = p.ext;

        if (p.name !== name) return false;
        if ('.yml' !== ext && '.yaml' !== ext && '.json' !== ext && '.js' !== ext) return false;

        return true;
    }


    /**
     * Read a configuration file. 
     * 
     * Support format: yaml, json, js.
     * Support extension: .yml, .yaml, .json, .js
     * 
     * @param {*} file 1) if it is a string, I will think it a full path
     *                 2) if it is a object, I will think it is structured as:
     *                    {
     *                        dir: '',  // directory name. optional, working dir by default
     *                        name: '', // file name, without ext. must.
     *                        ext: '', // force to be with this extension. optional.
     *                    }
     * @param defaultConfig default config if file not exists. optional
     */
    _load(file:any, defaultConfig:any) {

        const f = this.normalize(file);
        const b:string = f.base;
        const p:string = f.profile;
        const ext = f.ext;

        if (ext) {
            const p = b + ext;
            let r = this.loadSpecific(b, '.js', p);
            if (r) return r;

            if (defaultConfig) return defaultConfig;

            throw new Error('file not found: ' + p);
        }

        let r = this.loadSpecific(b, '.yml', p);
        if (r) return r;

        r = this.loadSpecific(b, '.yaml', p);
        if (r) return r;

        r = this.loadSpecific(b, '.json', p);
        if (r) return r;

        r = this.loadSpecific(b, '.js', p);
        if (r) return r;

        if (defaultConfig) return defaultConfig;

        throw new Error(`file not found: ${b}[.profile].yml( or .yaml/.json/.js)`);

    }


    constructor( public name:string, public dir:string, defaultConfig:any = {} ) {
        const r = this.object = this._load({dir, name}, defaultConfig);
        
        r.dump = this.dump.bind(this);
    
        return r;
    }


    dump() {
        
        const r = {
            name: this.name, 
            object: this.object, 
            dir:this.dir
        };

        return Yaml.dump(r, YAML_DUMP_OPTIONS);
    }

}
