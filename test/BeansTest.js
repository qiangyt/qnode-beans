/* eslint no-undef: 'off' */

const SRC = '../src';
const Beans = require(`${SRC}/Beans`);

const mockRequire = require('mock-require');
const mockFs = require('mock-fs');
const mockFsObjects = {
    "/": {
        'c': {
            'github': {
                'TestApp': {
                    "package.json": "",
                    "node_modules": {},
                    "src": {
                        "index.js": ""
                    }
                }
            },
        }
    }
}

// SpiedBean1 mocks a regular bean module
class SpiedBean1 {

    constructor() {
        this.initCounter = 0;
    }

    init() {
        this.initCounter++;
    }
}

mockRequire('Bean1', SpiedBean1);


// SpiedBean2 mocks a bean module which create another bean dynamicaly during init()
class SpiedBean2 {

    constructor() {
        this.initCounter = 0;
    }

    init() {
        this.bean3 = this._beans.create('Bean3');
        this.initCounter++;
    }
}

mockRequire('Bean2', SpiedBean2);


// SpiedBean3 mocks the bean module who has no init()
class SpiedBean3 {

    constructor() {
        this.initCounter = 0;
    }

}

mockRequire('Bean3', SpiedBean3);

describe("Bean test suite: ", function() {

    beforeAll(function() {
        mockFs(mockFsObjects, { createCwd: false, createTmp: false });
    });

    afterAll(function() {
        mockFs.restore();
    });

    it("resolveBaseDir(): take main path", function() {
        const d = Beans.resolveBaseDir('/c/github/TestApp/src/index.js');
        expect(d).toBe('/c/github/TestApp');
    });

    it("resolveBaseDir(): take default", function() {
        const d = Beans.resolveBaseDir();
        expect(d).toBeTruthy(d.indexOf('node_modules') < 0);
    });

    it("create(): happy", function() {
        const cfg = { x: 'y' };
        const beans = new Beans({ baseDir: '' });
        beans.prepare('bean1', cfg);
        const b = beans.create('Bean1', 'bean1');

        expect(b instanceof SpiedBean1).toBeTruthy();
        expect(b._name).toBe('bean1');
        expect(b._logger).toBeDefined();
        expect(b._module).toEqual(SpiedBean1);
        expect(b._config.x).toEqual('y');
        expect(b._beans).toEqual(beans);
        expect(beans.all.bean1).toEqual(b);
        expect(beans.get('bean1')).toEqual(b);
    });

    it("create(): auto-assign name", function() {
        const beans = new Beans({ baseDir: '' });
        const b = beans.create('Bean2');

        expect(b instanceof SpiedBean2).toBeTruthy();
        expect(b._name).toBe('Bean2');
        expect(beans.get('Bean2')).toEqual(b);
    });

    it("create(): duplicated", function() {
        const beans = new Beans({ baseDir: '' });
        beans.create('Bean1');

        try {
            beans.create('Bean1');
            fail('exception is expected to raise');
        } catch (e) {
            expect(e).toBeDefined();
        }
    });

    it("prepare(): happy", function() {
        const beans = new Beans({ baseDir: '' });

        const cfg = { x: 'y' };
        beans.prepare('Bean1', cfg);
        beans.create('Bean1');
        beans.init();

        const b = beans.load('Bean1');
        expect(b._config.x).toBe('y');
    });

    it("prepare(): fail", function() {
        const cfg = { x: 'y' };
        const beans = new Beans({ baseDir: '' });
        beans.create('Bean1');

        try {
            beans.prepare('Bean1', cfg);
            fail('exception is expected to raise');
        } catch (e) {
            expect(e).toBeDefined();
        }
    });

    it("prepare(): merge", function() {
        const beans = new Beans({ baseDir: '' });

        const cfg1 = { x1: 'y1' };
        beans.prepare('Bean1', cfg1);

        const cfg2 = { x1: 'y2', x2: 'y3' };
        beans.prepare('Bean1', cfg2);

        beans.create('Bean1');
        beans.init();
        const b = beans.load('Bean1');
        expect(b._config.x1).toBe('y2');
        expect(b._config.x2).toBe('y3');
    });

    it("load(): not found", function() {
        const beans = new Beans({ baseDir: '' });
        try {
            beans.load('beanX');
            fail('exception is expected to raise');
        } catch (e) {
            expect(e).toBeDefined();
        }
    });

    it("load(): found", function() {
        const beans = new Beans({ baseDir: '' });
        beans.create('Bean1');
        const b = beans.load('Bean1');
        expect(b._name).toBe('Bean1');
    });

    it("get(): not found", function() {
        const beans = new Beans({ baseDir: '' });
        const b = beans.get('beanx');
        expect(b).toBeUndefined();
    });

    it("get(): found", function() {
        const beans = new Beans({ baseDir: '' });
        beans.create('Bean1');
        const b = beans.get('Bean1');
        expect(b._name).toBe('Bean1');
    });

    it("init(): happy", function() {
        const beans = new Beans({ baseDir: '' });
        beans.create('Bean1');
        beans.create('Bean2');
        beans.init();

        const b1 = beans.get('Bean1');
        expect(b1.initCounter).toBe(1);

        const b2 = beans.get('Bean2');
        expect(b2.initCounter).toBe(1);

        const b3 = beans.get('Bean3');
        expect(b3.initCounter).toBe(0);
    });

    it("dummy: just for coverage", function() {
        Beans.all();
    });

});