var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function validate_store(store, name) {
        if (!store || typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, callback) {
        const unsub = store.subscribe(callback);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function get_store_value(store) {
        let value;
        subscribe(store, _ => value = _)();
        return value;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if (typeof $$scope.dirty === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, value = ret) => {
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, detail));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    const UrlParser = (urlString, namedUrl = "") => {
      const urlBase = new URL(urlString);

      /**
       * Wrapper for URL.host
       *
       **/
      function host() {
        return urlBase.host;
      }

      /**
       * Wrapper for URL.hostname
       *
       **/
      function hostname() {
        return urlBase.hostname;
      }

      /**
       * Returns an object with all the named params and their values
       *
       **/
      function namedParams() {
        const allPathName = pathNames();
        const allNamedParamsKeys = namedParamsWithIndex();

        return allNamedParamsKeys.reduce((values, paramKey) => {
          values[paramKey.value] = allPathName[paramKey.index];
          return values;
        }, {});
      }

      /**
       * Returns an array with all the named param keys
       *
       **/
      function namedParamsKeys() {
        const allNamedParamsKeys = namedParamsWithIndex();

        return allNamedParamsKeys.reduce((values, paramKey) => {
          values.push(paramKey.value);
          return values;
        }, []);
      }

      /**
       * Returns an array with all the named param values
       *
       **/
      function namedParamsValues() {
        const allPathName = pathNames();
        const allNamedParamsKeys = namedParamsWithIndex();

        return allNamedParamsKeys.reduce((values, paramKey) => {
          values.push(allPathName[paramKey.index]);
          return values;
        }, []);
      }

      /**
       * Returns an array with all named param ids and their position in the path
       * Private
       **/
      function namedParamsWithIndex() {
        const namedUrlParams = getPathNames(namedUrl);

        return namedUrlParams.reduce((validParams, param, index) => {
          if (param[0] === ":") {
            validParams.push({ value: param.slice(1), index });
          }
          return validParams;
        }, []);
      }

      /**
       * Wrapper for URL.port
       *
       **/
      function port() {
        return urlBase.port;
      }

      /**
       * Wrapper for URL.pathname
       *
       **/
      function pathname() {
        return urlBase.pathname;
      }

      /**
       * Wrapper for URL.protocol
       *
       **/
      function protocol() {
        return urlBase.protocol;
      }

      /**
       * Wrapper for URL.search
       *
       **/
      function search() {
        return urlBase.search;
      }

      /**
       * Returns an object with all query params and their values
       *
       **/
      function queryParams() {
        const params = {};
        urlBase.searchParams.forEach((value, key) => {
          params[key] = value;
        });

        return params;
      }

      /**
       * Returns an array with all the query param keys
       *
       **/
      function queryParamsKeys() {
        const params = [];
        urlBase.searchParams.forEach((_value, key) => {
          params.push(key);
        });

        return params;
      }

      /**
       * Returns an array with all the query param values
       *
       **/
      function queryParamsValues() {
        const params = [];
        urlBase.searchParams.forEach(value => {
          params.push(value);
        });

        return params;
      }

      /**
       * Returns an array with all the elements of a pathname
       *
       **/
      function pathNames() {
        return getPathNames(urlBase.pathname);
      }

      /**
       * Returns an array with all the parts of a pathname
       * Private method
       **/
      function getPathNames(pathName) {
        if (pathName === "/" || pathName.trim().length === 0) return [pathName];
        if (pathName.slice(-1) === "/") {
          pathName = pathName.slice(0, -1);
        }
        if (pathName[0] === "/") {
          pathName = pathName.slice(1);
        }

        return pathName.split("/");
      }

      return Object.freeze({
        host: host(),
        hostname: hostname(),
        namedParams: namedParams(),
        namedParamsKeys: namedParamsKeys(),
        namedParamsValues: namedParamsValues(),
        pathNames: pathNames(),
        port: port(),
        pathname: pathname(),
        protocol: protocol(),
        search: search(),
        queryParams: queryParams(),
        queryParamsKeys: queryParamsKeys(),
        queryParamsValues: queryParamsValues()
      });
    };

    var url_parser = { UrlParser };

    const UrlParser$1 = url_parser.UrlParser;

    var urlParamsParser = {
      UrlParser: UrlParser$1
    };

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe,
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }
    function derived(stores, fn, initial_value) {
        const single = !Array.isArray(stores);
        const stores_array = single
            ? [stores]
            : stores;
        const auto = fn.length < 2;
        return readable(initial_value, (set) => {
            let inited = false;
            const values = [];
            let pending = 0;
            let cleanup = noop;
            const sync = () => {
                if (pending) {
                    return;
                }
                cleanup();
                const result = fn(single ? values[0] : values, set);
                if (auto) {
                    set(result);
                }
                else {
                    cleanup = is_function(result) ? result : noop;
                }
            };
            const unsubscribers = stores_array.map((store, i) => store.subscribe((value) => {
                values[i] = value;
                pending &= ~(1 << i);
                if (inited) {
                    sync();
                }
            }, () => {
                pending |= (1 << i);
            }));
            inited = true;
            sync();
            return function stop() {
                run_all(unsubscribers);
                cleanup();
            };
        });
    }

    var store = /*#__PURE__*/Object.freeze({
        __proto__: null,
        derived: derived,
        readable: readable,
        writable: writable,
        get: get_store_value
    });

    function getCjsExportFromNamespace (n) {
    	return n && n['default'] || n;
    }

    var require$$0 = getCjsExportFromNamespace(store);

    const writable$1 = require$$0.writable;

    const router = writable$1({});

    function set(route) {
      router.set(route);
    }

    function remove() {
      router.set({});
    }

    const activeRoute = {
      subscribe: router.subscribe,
      set,
      remove
    };

    var store$1 = { activeRoute };
    var store_1 = store$1.activeRoute;

    /**
     * Returns true if object has any nested routes empty
     * @param routeObject
     **/
    function anyEmptyNestedRoutes(routeObject) {
      let result = false;
      if (Object.keys(routeObject).length === 0) {
        return true
      }

      if (routeObject.childRoute && Object.keys(routeObject.childRoute).length === 0) {
        result = true;
      } else if (routeObject.childRoute) {
        result = anyEmptyNestedRoutes(routeObject.childRoute);
      }

      return result
    }

    /**
     * Updates the base route path when route.name has a nested inside like /admin/teams
     * @param basePath string
     * @param pathNames array
     * @param route object
     **/
    function compareRoutes(basePath, pathNames, route) {
      if (basePath === '/' || basePath.trim().length === 0) return basePath
      let basePathResult = basePath;
      let routeName = route.name;
      if (routeName[0] === '/') {
        routeName = routeName.slice(1);
      }
      if (basePathResult[0] === '/') {
        basePathResult = basePathResult.slice(1);
      }

      if (!route.childRoute) {
        let routeNames = routeName.split(':')[0];
        if (routeNames.slice(-1) === '/') {
          routeNames = routeNames.slice(0, -1);
        }
        routeNames = routeNames.split('/');
        routeNames.shift();
        routeNames.forEach(() => {
          const currentPathName = pathNames[0];
          if (currentPathName && route.name.includes(`${basePathResult}/${currentPathName}`)) {
            basePathResult += `/${pathNames.shift()}`;
          } else {
            return basePathResult
          }
        });
        return basePathResult
      } else {
        return basePath
      }
    }

    /**
     * Return all the consecutive named param (placeholders) of a pathname
     * @param pathname
     **/
    function getNamedParams(pathName = '') {
      if (pathName.trim().length === '') return []

      const namedUrlParams = getPathNames(pathName);
      return namedUrlParams.reduce((validParams, param, index) => {
        if (param[0] === ':') {
          validParams.push(param.slice(1));
        }
        return validParams
      }, [])
    }

    /**
     * Split a pathname based on /
     * @param pathName
     * Private method
     **/
    function getPathNames(pathName) {
      if (pathName === '/' || pathName.trim().length === 0) return [pathName]
      if (pathName.slice(-1) === '/') {
        pathName = pathName.slice(0, -1);
      }
      if (pathName[0] === '/') {
        pathName = pathName.slice(1);
      }

      return pathName.split('/')
    }

    /**
     * Return the first part of a pathname until the first named param
     * @param name
     **/
    function nameToPath(name = '') {
      let routeName;
      if (name === '/' || name.trim().length === 0) return name
      if (name[0] === '/') {
        name = name.slice(1);
      }

      routeName = name.split(':')[0];
      if (routeName.slice(-1) === '/') {
        routeName = routeName.slice(0, -1);
      }

      return routeName.toLowerCase()
    }

    /**
     * Return the path name including query params
     * @param name
     **/
    function pathWithSearch(currentRoute) {
      let queryParams = [];
      if (currentRoute.queryParams) {
        for (let [key, value] of Object.entries(currentRoute.queryParams)) {
          queryParams.push(`${key}=${value}`);
        }
      }
      if (queryParams.length > 0) {
        return `${currentRoute.path}?${queryParams.join('&')}`
      } else {
        return currentRoute.path
      }
    }

    var utils = {
      anyEmptyNestedRoutes,
      compareRoutes,
      getNamedParams,
      getPathNames,
      nameToPath,
      pathWithSearch
    };

    const { UrlParser: UrlParser$2 } = urlParamsParser;
    const { activeRoute: activeRoute$1 } = store$1;
    const { anyEmptyNestedRoutes: anyEmptyNestedRoutes$1, compareRoutes: compareRoutes$1, getNamedParams: getNamedParams$1, nameToPath: nameToPath$1, pathWithSearch: pathWithSearch$1 } = utils;

    const NotFoundPage = '/404.html';
    let userDefinedRoutes = [];
    let routerOptions = {};
    let currentActiveRoute = '';

    /**
     * Object exposes one single property: activeRoute
     * @param routes  Array of routes
     * @param currentUrl current url
     * @param options configuration options
     **/
    function SpaRouter(routes, currentUrl, options = {}) {
      let redirectTo = '';
      routerOptions = options;
      if (typeof currentUrl === 'undefined' || currentUrl === '') {
        currentUrl = document.location.href;
      }

      if (currentUrl.trim().length > 1 && currentUrl.slice(-1) === '/') {
        currentUrl = currentUrl.slice(0, -1);
      }

      const urlParser = UrlParser$2(currentUrl);
      let routeNamedParams = {};
      userDefinedRoutes = routes;

      function findActiveRoute() {
        redirectTo = '';
        let searchActiveRoute = searchActiveRoutes(routes, '', urlParser.pathNames);

        if (!searchActiveRoute || anyEmptyNestedRoutes$1(searchActiveRoute)) {
          if (typeof window !== 'undefined') {
            forceRedirect(NotFoundPage);
          } else {
            searchActiveRoute = { name: '404', component: '', path: '404' };
          }
        } else {
          searchActiveRoute.path = urlParser.pathname;
        }

        return searchActiveRoute
      }

      /**
       * Redirect current route to another
       * @param destinationUrl
       **/
      function forceRedirect(destinationUrl) {
        if (typeof window !== 'undefined') {
          currentActiveRoute = destinationUrl;
          if (destinationUrl === NotFoundPage) {
            window.location = destinationUrl;
          } else {
            navigateTo(destinationUrl);
          }
        }

        return destinationUrl
      }

      function gaTracking(newPage) {
        if (typeof ga !== 'undefined') {
          ga('set', 'page', newPage);
          ga('send', 'pageview');
        }
      }

      function generate() {
        const currentRoute = findActiveRoute();

        if (currentRoute.redirectTo) {
          return forceRedirect(redirectTo)
        }
        currentActiveRoute = currentRoute.path;
        activeRoute$1.set(currentRoute);

        pushActiveRoute(currentRoute);

        return currentRoute
      }

      /**
       * Updates the browser pathname and history with the active route.
       * @param currentRoute
       **/
      function pushActiveRoute(currentRoute) {
        if (typeof window !== 'undefined') {
          const pathAndSearch = pathWithSearch$1(currentRoute);
          window.history.pushState({ page: pathAndSearch }, '', pathAndSearch);
          if (routerOptions.gaPageviews) {
            gaTracking(pathAndSearch);
          }
        }
      }

      /**
       * Gets an array of routes and the browser pathname and return the active route
       * @param routes
       * @param basePath
       * @param pathNames
       **/
      function searchActiveRoutes(routes, basePath, pathNames) {
        let currentRoute = {};
        let basePathName = pathNames.shift().toLowerCase();

        routes.forEach(function(route) {
          basePathName = compareRoutes$1(basePathName, pathNames, route);

          if (basePathName === nameToPath$1(route.name)) {
            let namedPath = `${basePath}/${route.name}`;
            let routePath = `${basePath}/${nameToPath$1(route.name)}`;
            if (routePath === '//') {
              routePath = '/';
            }

            if (route.redirectTo && route.redirectTo.length > 0) {
              redirectTo = route.redirectTo;
            }

            if (route.onlyIf && route.onlyIf.guard) {
              if (!route.onlyIf.guard()) {
                let destinationUrl = '/';
                if (route.onlyIf.redirect && route.onlyIf.redirect.length > 0) {
                  destinationUrl = route.onlyIf.redirect;
                }
                redirectTo = destinationUrl;
              }
            }

            const namedParams = getNamedParams$1(route.name);
            if (namedParams && namedParams.length > 0) {
              namedParams.forEach(function() {
                if (pathNames.length > 0) {
                  routePath += `/${pathNames.shift()}`;
                }
              });
            }

            if (currentRoute.name !== routePath) {
              const parsedParams = UrlParser$2(`https://fake.com${urlParser.pathname}`, namedPath).namedParams;
              routeNamedParams = { ...routeNamedParams, ...parsedParams };
              currentRoute = {
                name: routePath,
                component: route.component,
                layout: route.layout,
                queryParams: urlParser.queryParams,
                namedParams: routeNamedParams
              };
            }

            if (route.nestedRoutes && route.nestedRoutes.length > 0 && pathNames.length > 0) {
              currentRoute.childRoute = searchActiveRoutes(route.nestedRoutes, routePath, pathNames);
            } else if (route.nestedRoutes && route.nestedRoutes.length > 0 && pathNames.length === 0) {
              const indexRoute = searchActiveRoutes(route.nestedRoutes, routePath, ['index']);
              if (indexRoute && Object.keys(indexRoute).length > 0) {
                currentRoute.childRoute = indexRoute;
              }
            }
          }
        });

        if (redirectTo) {
          currentRoute['redirectTo'] = redirectTo;
        }

        return currentRoute
      }

      return Object.freeze({
        activeRoute: generate()
      })
    }

    /**
     * Updates the current active route and updates the browser pathname
     * @param pathName
     **/
    function navigateTo(pathName) {
      if (pathName.trim().length > 1 && pathName[0] === '/') {
        pathName = pathName.slice(1);
      }

      const activeRoute = SpaRouter(userDefinedRoutes, 'http://fake.com/' + pathName, routerOptions).activeRoute;

      return activeRoute
    }

    /**
     * Returns true if pathName is current active route
     * @param pathName
     **/
    function routeIsActive(queryPath, includePath = false) {
      if (queryPath[0] !== '/') {
        queryPath = '/' + queryPath;
      }

      let pathName = UrlParser$2(`http://fake.com${queryPath}`).pathname;
      if (pathName.slice(-1) === '/') {
        pathName = pathName.slice(0, -1);
      }

      let activeRoute = currentActiveRoute || pathName;
      if (activeRoute.slice(-1) === '/') {
        activeRoute = activeRoute.slice(0, -1);
      }

      if (includePath) {
        return activeRoute.includes(pathName)
      } else {
        return activeRoute === pathName
      }
    }

    if (typeof window !== 'undefined') {
      // Avoid full page reload on local routes
      window.addEventListener('click', event => {
        if (event.target.pathname && event.target.hostname === window.location.hostname && event.target.localName === 'a') {
          event.preventDefault();
          // event.stopPropagation()
          navigateTo(event.target.pathname + event.target.search);
        }
      });

      window.onpopstate = function(_event) {
        navigateTo(window.location.pathname + window.location.search);
      };
    }

    var router$1 = { SpaRouter, navigateTo, routeIsActive };
    var router_1 = router$1.SpaRouter;
    var router_2 = router$1.navigateTo;
    var router_3 = router$1.routeIsActive;

    /* node_modules\svelte-router-spa\src\components\route.svelte generated by Svelte v3.16.5 */

    // (10:34) 
    function create_if_block_2(ctx) {
    	let current;

    	const route = new Route({
    			props: {
    				currentRoute: /*currentRoute*/ ctx[0].childRoute,
    				params: /*params*/ ctx[1]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(route.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(route, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const route_changes = {};
    			if (dirty & /*currentRoute*/ 1) route_changes.currentRoute = /*currentRoute*/ ctx[0].childRoute;
    			if (dirty & /*params*/ 2) route_changes.params = /*params*/ ctx[1];
    			route.$set(route_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(route.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(route.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(route, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(10:34) ",
    		ctx
    	});

    	return block;
    }

    // (8:33) 
    function create_if_block_1(ctx) {
    	let switch_instance_anchor;
    	let current;
    	var switch_value = /*currentRoute*/ ctx[0].component;

    	function switch_props(ctx) {
    		return {
    			props: {
    				currentRoute: {
    					.../*currentRoute*/ ctx[0],
    					component: ""
    				},
    				params: /*params*/ ctx[1]
    			},
    			$$inline: true
    		};
    	}

    	if (switch_value) {
    		var switch_instance = new switch_value(switch_props(ctx));
    	}

    	const block = {
    		c: function create() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert_dev(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const switch_instance_changes = {};

    			if (dirty & /*currentRoute*/ 1) switch_instance_changes.currentRoute = {
    				.../*currentRoute*/ ctx[0],
    				component: ""
    			};

    			if (dirty & /*params*/ 2) switch_instance_changes.params = /*params*/ ctx[1];

    			if (switch_value !== (switch_value = /*currentRoute*/ ctx[0].component)) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props(ctx));
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(8:33) ",
    		ctx
    	});

    	return block;
    }

    // (6:0) {#if currentRoute.layout}
    function create_if_block(ctx) {
    	let switch_instance_anchor;
    	let current;
    	var switch_value = /*currentRoute*/ ctx[0].layout;

    	function switch_props(ctx) {
    		return {
    			props: {
    				currentRoute: { .../*currentRoute*/ ctx[0], layout: "" },
    				params: /*params*/ ctx[1]
    			},
    			$$inline: true
    		};
    	}

    	if (switch_value) {
    		var switch_instance = new switch_value(switch_props(ctx));
    	}

    	const block = {
    		c: function create() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert_dev(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const switch_instance_changes = {};
    			if (dirty & /*currentRoute*/ 1) switch_instance_changes.currentRoute = { .../*currentRoute*/ ctx[0], layout: "" };
    			if (dirty & /*params*/ 2) switch_instance_changes.params = /*params*/ ctx[1];

    			if (switch_value !== (switch_value = /*currentRoute*/ ctx[0].layout)) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props(ctx));
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(6:0) {#if currentRoute.layout}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block, create_if_block_1, create_if_block_2];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*currentRoute*/ ctx[0].layout) return 0;
    		if (/*currentRoute*/ ctx[0].component) return 1;
    		if (/*currentRoute*/ ctx[0].childRoute) return 2;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(target, anchor);
    			}

    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(ctx, dirty);
    				}
    			} else {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					}

    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				} else {
    					if_block = null;
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d(detaching);
    			}

    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { currentRoute = {} } = $$props;
    	let { params = {} } = $$props;
    	const writable_props = ["currentRoute", "params"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Route> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("currentRoute" in $$props) $$invalidate(0, currentRoute = $$props.currentRoute);
    		if ("params" in $$props) $$invalidate(1, params = $$props.params);
    	};

    	$$self.$capture_state = () => {
    		return { currentRoute, params };
    	};

    	$$self.$inject_state = $$props => {
    		if ("currentRoute" in $$props) $$invalidate(0, currentRoute = $$props.currentRoute);
    		if ("params" in $$props) $$invalidate(1, params = $$props.params);
    	};

    	return [currentRoute, params];
    }

    class Route extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { currentRoute: 0, params: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Route",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get currentRoute() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set currentRoute(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get params() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set params(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var route = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Route
    });

    /* node_modules\svelte-router-spa\src\components\router.svelte generated by Svelte v3.16.5 */

    function create_fragment$1(ctx) {
    	let current;

    	const route = new Route({
    			props: { currentRoute: /*$activeRoute*/ ctx[0] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(route.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(route, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const route_changes = {};
    			if (dirty & /*$activeRoute*/ 1) route_changes.currentRoute = /*$activeRoute*/ ctx[0];
    			route.$set(route_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(route.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(route.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(route, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $activeRoute;
    	validate_store(store_1, "activeRoute");
    	component_subscribe($$self, store_1, $$value => $$invalidate(0, $activeRoute = $$value));
    	let { routes = [] } = $$props;
    	let { options = {} } = $$props;

    	onMount(function () {
    		router_1(routes, document.location.href, options).activeRoute;
    	});

    	const writable_props = ["routes", "options"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Router> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("routes" in $$props) $$invalidate(1, routes = $$props.routes);
    		if ("options" in $$props) $$invalidate(2, options = $$props.options);
    	};

    	$$self.$capture_state = () => {
    		return { routes, options, $activeRoute };
    	};

    	$$self.$inject_state = $$props => {
    		if ("routes" in $$props) $$invalidate(1, routes = $$props.routes);
    		if ("options" in $$props) $$invalidate(2, options = $$props.options);
    		if ("$activeRoute" in $$props) store_1.set($activeRoute = $$props.$activeRoute);
    	};

    	return [$activeRoute, routes, options];
    }

    class Router extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { routes: 1, options: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Router",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get routes() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set routes(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get options() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set options(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var router$2 = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Router
    });

    /* node_modules\svelte-router-spa\src\components\navigate.svelte generated by Svelte v3.16.5 */
    const file = "node_modules\\svelte-router-spa\\src\\components\\navigate.svelte";

    function create_fragment$2(ctx) {
    	let a;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);

    	const block = {
    		c: function create() {
    			a = element("a");
    			if (default_slot) default_slot.c();
    			attr_dev(a, "href", /*to*/ ctx[0]);
    			attr_dev(a, "title", /*title*/ ctx[1]);
    			attr_dev(a, "class", /*styles*/ ctx[2]);
    			toggle_class(a, "active", router_3(/*to*/ ctx[0]));
    			add_location(a, file, 13, 0, 255);
    			dispose = listen_dev(a, "click", /*navigate*/ ctx[3], false, false, false);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);

    			if (default_slot) {
    				default_slot.m(a, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 16) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[4], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[4], dirty, null));
    			}

    			if (!current || dirty & /*to*/ 1) {
    				attr_dev(a, "href", /*to*/ ctx[0]);
    			}

    			if (!current || dirty & /*title*/ 2) {
    				attr_dev(a, "title", /*title*/ ctx[1]);
    			}

    			if (!current || dirty & /*styles*/ 4) {
    				attr_dev(a, "class", /*styles*/ ctx[2]);
    			}

    			if (dirty & /*styles, routeIsActive, to*/ 5) {
    				toggle_class(a, "active", router_3(/*to*/ ctx[0]));
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    			if (default_slot) default_slot.d(detaching);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { to = "/" } = $$props;
    	let { title = "" } = $$props;
    	let { styles = "" } = $$props;

    	function navigate(event) {
    		event.preventDefault();
    		event.stopPropagation();
    		router_2(to);
    	}

    	const writable_props = ["to", "title", "styles"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Navigate> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ("to" in $$props) $$invalidate(0, to = $$props.to);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("styles" in $$props) $$invalidate(2, styles = $$props.styles);
    		if ("$$scope" in $$props) $$invalidate(4, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => {
    		return { to, title, styles };
    	};

    	$$self.$inject_state = $$props => {
    		if ("to" in $$props) $$invalidate(0, to = $$props.to);
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("styles" in $$props) $$invalidate(2, styles = $$props.styles);
    	};

    	return [to, title, styles, navigate, $$scope, $$slots];
    }

    class Navigate extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { to: 0, title: 1, styles: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Navigate",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get to() {
    		throw new Error("<Navigate>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set to(value) {
    		throw new Error("<Navigate>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get title() {
    		throw new Error("<Navigate>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<Navigate>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get styles() {
    		throw new Error("<Navigate>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set styles(value) {
    		throw new Error("<Navigate>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var navigate = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Navigate
    });

    var Route$1 = getCjsExportFromNamespace(route);

    var Router$1 = getCjsExportFromNamespace(router$2);

    var Navigate$1 = getCjsExportFromNamespace(navigate);

    const SpaRouter$1 = router$1.SpaRouter;
    const navigateTo$1 = router$1.navigateTo;
    const routeIsActive$1 = router$1.routeIsActive;




    var src = {
      SpaRouter: SpaRouter$1,
      navigateTo: navigateTo$1,
      routeIsActive: routeIsActive$1,
      Route: Route$1,
      Router: Router$1,
      Navigate: Navigate$1
    };
    var src_2 = src.navigateTo;
    var src_5 = src.Router;

    const state = writable({
        todolist : [
            { no:1, todo:"Buy Laptop Computer", desc:"Macbook 16 inch(A-shop)" , done:false },
            { no:2, todo:"Study ES6", desc:"especially about Spread Operator and Arrow Function", done:false },
            { no:3, todo:"Study Vue 3", desc:"about Composition API, Vuex and Vue-router", done:true },
            { no:4, todo:"Study React", desc:"about Hook, Redux and Context API", done:false },
        ]
    });

    let addTodo = (todoitem) => { 
        state.update((draft)=> {
            draft.todolist.push({ ...todoitem, no: new Date().getTime() });
            return draft;
        });
    };

    let deleteTodo = (no) => {
        state.update((draft)=> {
            let index = draft.todolist.findIndex((item)=>item.no===no);
            draft.todolist.splice(index,1);
            return draft;
        });
    };

    let toggleDone = (no) => {
        state.update((draft)=> {
            let index = draft.todolist.findIndex((item)=>item.no===no);
            draft.todolist[index].done = !draft.todolist[index].done;
            return draft;
        });
    };

    let updateTodo = (todoitem) => {
        state.update((draft)=> {
            let index = draft.todolist.findIndex((item)=> item.no === todoitem.no);
            draft.todolist[index] = { ...todoitem };
            return draft;
        });
    };

    /* src\components\AddTodo.svelte generated by Svelte v3.16.5 */
    const file$1 = "src\\components\\AddTodo.svelte";

    function create_fragment$3(ctx) {
    	let div5;
    	let div4;
    	let div3;
    	let div0;
    	let button0;
    	let span;
    	let t1;
    	let h4;
    	let t3;
    	let div1;
    	let t4;
    	let input;
    	let br;
    	let t5;
    	let textarea;
    	let t6;
    	let div2;
    	let button1;
    	let t8;
    	let button2;
    	let dispose;

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div4 = element("div");
    			div3 = element("div");
    			div0 = element("div");
    			button0 = element("button");
    			span = element("span");
    			span.textContent = "×";
    			t1 = space();
    			h4 = element("h4");
    			h4.textContent = "Add Todo!!";
    			t3 = space();
    			div1 = element("div");
    			t4 = text("Todo : \r\n        ");
    			input = element("input");
    			br = element("br");
    			t5 = text("\r\n        Description : \r\n        ");
    			textarea = element("textarea");
    			t6 = space();
    			div2 = element("div");
    			button1 = element("button");
    			button1.textContent = "Add";
    			t8 = space();
    			button2 = element("button");
    			button2.textContent = "Cancel";
    			attr_dev(span, "aria-hidden", "true");
    			add_location(span, file$1, 21, 109, 661);
    			attr_dev(button0, "type", "button");
    			attr_dev(button0, "class", "close");
    			attr_dev(button0, "data-dismiss", "modal");
    			attr_dev(button0, "aria-label", "Close");
    			add_location(button0, file$1, 21, 8, 560);
    			attr_dev(h4, "class", "modal-title");
    			add_location(h4, file$1, 22, 8, 719);
    			attr_dev(div0, "class", "modal-header");
    			add_location(div0, file$1, 20, 6, 524);
    			attr_dev(input, "id", "msg");
    			attr_dev(input, "type", "text");
    			attr_dev(input, "class", "form-control");
    			attr_dev(input, "name", "msg");
    			attr_dev(input, "placeholder", "type todo!!");
    			add_location(input, file$1, 26, 8, 831);
    			add_location(br, file$1, 27, 65, 958);
    			attr_dev(textarea, "class", "form-control");
    			attr_dev(textarea, "rows", "3");
    			add_location(textarea, file$1, 29, 8, 997);
    			attr_dev(div1, "class", "modal-body");
    			add_location(div1, file$1, 24, 6, 780);
    			attr_dev(button1, "type", "button");
    			attr_dev(button1, "class", "btn btn-default");
    			add_location(button1, file$1, 32, 8, 1134);
    			attr_dev(button2, "type", "button");
    			attr_dev(button2, "class", "btn btn-primary");
    			attr_dev(button2, "data-dismiss", "modal");
    			add_location(button2, file$1, 33, 8, 1228);
    			attr_dev(div2, "class", "modal-footer");
    			add_location(div2, file$1, 31, 6, 1098);
    			attr_dev(div3, "class", "modal-content");
    			add_location(div3, file$1, 19, 4, 489);
    			attr_dev(div4, "class", "modal-dialog modal-lg");
    			attr_dev(div4, "role", "document");
    			add_location(div4, file$1, 18, 2, 432);
    			attr_dev(div5, "class", "centered-modal fade in");
    			attr_dev(div5, "tabindex", "-1");
    			attr_dev(div5, "role", "dialog");
    			attr_dev(div5, "aria-labelledby", "myLargeModalLabel");
    			add_location(div5, file$1, 17, 0, 328);

    			dispose = [
    				listen_dev(button0, "click", /*cancelHandler*/ ctx[2], false, false, false),
    				listen_dev(input, "input", /*input_input_handler*/ ctx[3]),
    				listen_dev(textarea, "input", /*textarea_input_handler*/ ctx[4]),
    				listen_dev(button1, "click", /*addTodoHandler*/ ctx[1], false, false, false),
    				listen_dev(button2, "click", /*cancelHandler*/ ctx[2], false, false, false)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div4);
    			append_dev(div4, div3);
    			append_dev(div3, div0);
    			append_dev(div0, button0);
    			append_dev(button0, span);
    			append_dev(div0, t1);
    			append_dev(div0, h4);
    			append_dev(div3, t3);
    			append_dev(div3, div1);
    			append_dev(div1, t4);
    			append_dev(div1, input);
    			set_input_value(input, /*todoitem*/ ctx[0].todo);
    			append_dev(div1, br);
    			append_dev(div1, t5);
    			append_dev(div1, textarea);
    			set_input_value(textarea, /*todoitem*/ ctx[0].desc);
    			append_dev(div3, t6);
    			append_dev(div3, div2);
    			append_dev(div2, button1);
    			append_dev(div2, t8);
    			append_dev(div2, button2);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*todoitem*/ 1 && input.value !== /*todoitem*/ ctx[0].todo) {
    				set_input_value(input, /*todoitem*/ ctx[0].todo);
    			}

    			if (dirty & /*todoitem*/ 1) {
    				set_input_value(textarea, /*todoitem*/ ctx[0].desc);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let todoitem = { no: "", todo: "", desc: "", done: false };

    	const addTodoHandler = () => {
    		addTodo(todoitem);
    		src_2("/");
    	};

    	const cancelHandler = () => {
    		src_2("/");
    	};

    	function input_input_handler() {
    		todoitem.todo = this.value;
    		$$invalidate(0, todoitem);
    	}

    	function textarea_input_handler() {
    		todoitem.desc = this.value;
    		$$invalidate(0, todoitem);
    	}

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("todoitem" in $$props) $$invalidate(0, todoitem = $$props.todoitem);
    	};

    	return [
    		todoitem,
    		addTodoHandler,
    		cancelHandler,
    		input_input_handler,
    		textarea_input_handler
    	];
    }

    class AddTodo extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "AddTodo",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    /* src\components\UpdateTodo.svelte generated by Svelte v3.16.5 */
    const file$2 = "src\\components\\UpdateTodo.svelte";

    function create_fragment$4(ctx) {
    	let div5;
    	let div4;
    	let div3;
    	let div0;
    	let button0;
    	let span;
    	let t1;
    	let h4;
    	let t3;
    	let div1;
    	let t4;
    	let input0;
    	let br0;
    	let t5;
    	let input1;
    	let br1;
    	let t6;
    	let textarea;
    	let t7;
    	let input2;
    	let t8;
    	let div2;
    	let button1;
    	let t10;
    	let button2;
    	let dispose;

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div4 = element("div");
    			div3 = element("div");
    			div0 = element("div");
    			button0 = element("button");
    			span = element("span");
    			span.textContent = "×";
    			t1 = space();
    			h4 = element("h4");
    			h4.textContent = "Edit Todo --> Update";
    			t3 = space();
    			div1 = element("div");
    			t4 = text("No : \r\n        ");
    			input0 = element("input");
    			br0 = element("br");
    			t5 = text("\r\n        Todo : \r\n        ");
    			input1 = element("input");
    			br1 = element("br");
    			t6 = text("\r\n        Description : \r\n        ");
    			textarea = element("textarea");
    			t7 = text("\r\n        Done : ");
    			input2 = element("input");
    			t8 = space();
    			div2 = element("div");
    			button1 = element("button");
    			button1.textContent = "Update";
    			t10 = space();
    			button2 = element("button");
    			button2.textContent = "Cancel";
    			attr_dev(span, "aria-hidden", "true");
    			add_location(span, file$2, 25, 109, 774);
    			attr_dev(button0, "type", "button");
    			attr_dev(button0, "class", "close");
    			attr_dev(button0, "data-dismiss", "modal");
    			attr_dev(button0, "aria-label", "Close");
    			add_location(button0, file$2, 25, 8, 673);
    			attr_dev(h4, "class", "modal-title");
    			add_location(h4, file$2, 26, 8, 832);
    			attr_dev(div0, "class", "modal-header");
    			add_location(div0, file$2, 24, 6, 637);
    			attr_dev(input0, "id", "no");
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "class", "form-control");
    			attr_dev(input0, "name", "no");
    			input0.disabled = true;
    			add_location(input0, file$2, 30, 8, 952);
    			add_location(br0, file$2, 30, 100, 1044);
    			attr_dev(input1, "id", "todo");
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "class", "form-control");
    			attr_dev(input1, "name", "msg");
    			attr_dev(input1, "placeholder", "type todo!!");
    			add_location(input1, file$2, 32, 8, 1076);
    			add_location(br1, file$2, 33, 65, 1204);
    			attr_dev(textarea, "class", "form-control");
    			attr_dev(textarea, "rows", "3");
    			add_location(textarea, file$2, 35, 8, 1243);
    			attr_dev(input2, "type", "checkbox");
    			add_location(input2, file$2, 36, 15, 1338);
    			attr_dev(div1, "class", "modal-body");
    			add_location(div1, file$2, 28, 6, 903);
    			attr_dev(button1, "type", "button");
    			attr_dev(button1, "class", "btn btn-default");
    			add_location(button1, file$2, 39, 8, 1460);
    			attr_dev(button2, "type", "button");
    			attr_dev(button2, "class", "btn btn-primary");
    			attr_dev(button2, "data-dismiss", "modal");
    			add_location(button2, file$2, 40, 8, 1560);
    			attr_dev(div2, "class", "modal-footer");
    			add_location(div2, file$2, 38, 6, 1424);
    			attr_dev(div3, "class", "modal-content");
    			add_location(div3, file$2, 23, 4, 602);
    			attr_dev(div4, "class", "modal-dialog modal-lg");
    			attr_dev(div4, "role", "document");
    			add_location(div4, file$2, 22, 2, 545);
    			attr_dev(div5, "class", "centered-modal fade in");
    			attr_dev(div5, "tabindex", "0");
    			attr_dev(div5, "role", "dialog");
    			add_location(div5, file$2, 21, 0, 478);

    			dispose = [
    				listen_dev(button0, "click", /*cancelHandler*/ ctx[2], false, false, false),
    				listen_dev(input0, "input", /*input0_input_handler*/ ctx[5]),
    				listen_dev(input1, "input", /*input1_input_handler*/ ctx[6]),
    				listen_dev(textarea, "input", /*textarea_input_handler*/ ctx[7]),
    				listen_dev(input2, "change", /*input2_change_handler*/ ctx[8]),
    				listen_dev(button1, "click", /*updateTodoHandler*/ ctx[1], false, false, false),
    				listen_dev(button2, "click", /*cancelHandler*/ ctx[2], false, false, false)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div4);
    			append_dev(div4, div3);
    			append_dev(div3, div0);
    			append_dev(div0, button0);
    			append_dev(button0, span);
    			append_dev(div0, t1);
    			append_dev(div0, h4);
    			append_dev(div3, t3);
    			append_dev(div3, div1);
    			append_dev(div1, t4);
    			append_dev(div1, input0);
    			set_input_value(input0, /*todoitem*/ ctx[0].no);
    			append_dev(div1, br0);
    			append_dev(div1, t5);
    			append_dev(div1, input1);
    			set_input_value(input1, /*todoitem*/ ctx[0].todo);
    			append_dev(div1, br1);
    			append_dev(div1, t6);
    			append_dev(div1, textarea);
    			set_input_value(textarea, /*todoitem*/ ctx[0].desc);
    			append_dev(div1, t7);
    			append_dev(div1, input2);
    			input2.checked = /*todoitem*/ ctx[0].done;
    			append_dev(div3, t8);
    			append_dev(div3, div2);
    			append_dev(div2, button1);
    			append_dev(div2, t10);
    			append_dev(div2, button2);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*todoitem*/ 1 && input0.value !== /*todoitem*/ ctx[0].no) {
    				set_input_value(input0, /*todoitem*/ ctx[0].no);
    			}

    			if (dirty & /*todoitem*/ 1 && input1.value !== /*todoitem*/ ctx[0].todo) {
    				set_input_value(input1, /*todoitem*/ ctx[0].todo);
    			}

    			if (dirty & /*todoitem*/ 1) {
    				set_input_value(textarea, /*todoitem*/ ctx[0].desc);
    			}

    			if (dirty & /*todoitem*/ 1) {
    				input2.checked = /*todoitem*/ ctx[0].done;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let $state;
    	validate_store(state, "state");
    	component_subscribe($$self, state, $$value => $$invalidate(4, $state = $$value));
    	let { currentRoute } = $$props;
    	let todoitem = $state.todolist.find(item => item.no === parseInt(currentRoute.namedParams.no, 10));
    	if (!todoitem) src_2("/");

    	const updateTodoHandler = () => {
    		updateTodo(todoitem);
    		src_2("/");
    	};

    	const cancelHandler = () => src_2("/");
    	const writable_props = ["currentRoute"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<UpdateTodo> was created with unknown prop '${key}'`);
    	});

    	function input0_input_handler() {
    		todoitem.no = this.value;
    		$$invalidate(0, todoitem);
    	}

    	function input1_input_handler() {
    		todoitem.todo = this.value;
    		$$invalidate(0, todoitem);
    	}

    	function textarea_input_handler() {
    		todoitem.desc = this.value;
    		$$invalidate(0, todoitem);
    	}

    	function input2_change_handler() {
    		todoitem.done = this.checked;
    		$$invalidate(0, todoitem);
    	}

    	$$self.$set = $$props => {
    		if ("currentRoute" in $$props) $$invalidate(3, currentRoute = $$props.currentRoute);
    	};

    	$$self.$capture_state = () => {
    		return { currentRoute, todoitem, $state };
    	};

    	$$self.$inject_state = $$props => {
    		if ("currentRoute" in $$props) $$invalidate(3, currentRoute = $$props.currentRoute);
    		if ("todoitem" in $$props) $$invalidate(0, todoitem = $$props.todoitem);
    		if ("$state" in $$props) state.set($state = $$props.$state);
    	};

    	return [
    		todoitem,
    		updateTodoHandler,
    		cancelHandler,
    		currentRoute,
    		$state,
    		input0_input_handler,
    		input1_input_handler,
    		textarea_input_handler,
    		input2_change_handler
    	];
    }

    class UpdateTodo extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { currentRoute: 3 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "UpdateTodo",
    			options,
    			id: create_fragment$4.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*currentRoute*/ ctx[3] === undefined && !("currentRoute" in props)) {
    			console.warn("<UpdateTodo> was created without expected prop 'currentRoute'");
    		}
    	}

    	get currentRoute() {
    		throw new Error("<UpdateTodo>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set currentRoute(value) {
    		throw new Error("<UpdateTodo>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\TodoItem.svelte generated by Svelte v3.16.5 */
    const file$3 = "src\\components\\TodoItem.svelte";

    // (28:8) {#if item.done}
    function create_if_block$1(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("(Done)");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(28:8) {#if item.done}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let li;
    	let span0;
    	let t0_value = /*item*/ ctx[0].todo + "";
    	let t0;
    	let t1;
    	let span0_class_value;
    	let t2;
    	let span1;
    	let t4;
    	let span2;
    	let li_title_value;
    	let dispose;
    	let if_block = /*item*/ ctx[0].done && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			li = element("li");
    			span0 = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			if (if_block) if_block.c();
    			t2 = space();
    			span1 = element("span");
    			span1.textContent = "Delete";
    			t4 = space();
    			span2 = element("span");
    			span2.textContent = "Edit";
    			attr_dev(span0, "class", span0_class_value = /*item*/ ctx[0].done ? "todo-done pointer" : "pointer");
    			add_location(span0, file$3, 24, 4, 510);
    			attr_dev(span1, "class", "pull-right badge pointer");
    			add_location(span1, file$3, 31, 4, 702);
    			attr_dev(span2, "class", "pull-right badge pointer");
    			add_location(span2, file$3, 32, 4, 785);
    			attr_dev(li, "class", /*itemClassName*/ ctx[1]);
    			attr_dev(li, "title", li_title_value = "description : " + /*item*/ ctx[0].desc);
    			add_location(li, file$3, 23, 0, 441);

    			dispose = [
    				listen_dev(span0, "click", /*toggleHandler*/ ctx[2], false, false, false),
    				listen_dev(span1, "click", /*deleteHandler*/ ctx[3], false, false, false),
    				listen_dev(span2, "click", /*editTodo*/ ctx[4], false, false, false)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, span0);
    			append_dev(span0, t0);
    			append_dev(span0, t1);
    			if (if_block) if_block.m(span0, null);
    			append_dev(li, t2);
    			append_dev(li, span1);
    			append_dev(li, t4);
    			append_dev(li, span2);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*item*/ 1 && t0_value !== (t0_value = /*item*/ ctx[0].todo + "")) set_data_dev(t0, t0_value);

    			if (/*item*/ ctx[0].done) {
    				if (!if_block) {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					if_block.m(span0, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*item*/ 1 && span0_class_value !== (span0_class_value = /*item*/ ctx[0].done ? "todo-done pointer" : "pointer")) {
    				attr_dev(span0, "class", span0_class_value);
    			}

    			if (dirty & /*itemClassName*/ 2) {
    				attr_dev(li, "class", /*itemClassName*/ ctx[1]);
    			}

    			if (dirty & /*item*/ 1 && li_title_value !== (li_title_value = "description : " + /*item*/ ctx[0].desc)) {
    				attr_dev(li, "title", li_title_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			if (if_block) if_block.d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { item } = $$props, { callbacks } = $$props;

    	const toggleHandler = () => {
    		callbacks.toggleDone(item.no);
    	};

    	const deleteHandler = () => {
    		callbacks.deleteTodo(item.no);
    	};

    	const editTodo = () => {
    		src_2(`update/${item.no}`);
    	};

    	let itemClassName;
    	const writable_props = ["item", "callbacks"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<TodoItem> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("item" in $$props) $$invalidate(0, item = $$props.item);
    		if ("callbacks" in $$props) $$invalidate(5, callbacks = $$props.callbacks);
    	};

    	$$self.$capture_state = () => {
    		return { item, callbacks, itemClassName };
    	};

    	$$self.$inject_state = $$props => {
    		if ("item" in $$props) $$invalidate(0, item = $$props.item);
    		if ("callbacks" in $$props) $$invalidate(5, callbacks = $$props.callbacks);
    		if ("itemClassName" in $$props) $$invalidate(1, itemClassName = $$props.itemClassName);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*item*/ 1) {
    			 {
    				$$invalidate(1, itemClassName = item.done
    				? "list-group-item list-group-item-success"
    				: "list-group-item");
    			}
    		}
    	};

    	return [item, itemClassName, toggleHandler, deleteHandler, editTodo, callbacks];
    }

    class TodoItem extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { item: 0, callbacks: 5 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TodoItem",
    			options,
    			id: create_fragment$5.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*item*/ ctx[0] === undefined && !("item" in props)) {
    			console.warn("<TodoItem> was created without expected prop 'item'");
    		}

    		if (/*callbacks*/ ctx[5] === undefined && !("callbacks" in props)) {
    			console.warn("<TodoItem> was created without expected prop 'callbacks'");
    		}
    	}

    	get item() {
    		throw new Error("<TodoItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set item(value) {
    		throw new Error("<TodoItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get callbacks() {
    		throw new Error("<TodoItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set callbacks(value) {
    		throw new Error("<TodoItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\TodoList.svelte generated by Svelte v3.16.5 */
    const file$4 = "src\\components\\TodoList.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    // (27:8) {#each $state.todolist as item (item.no)}
    function create_each_block(key_1, ctx) {
    	let first;
    	let current;

    	const todoitem = new TodoItem({
    			props: {
    				item: /*item*/ ctx[3],
    				callbacks: /*callbacks*/ ctx[1]
    			},
    			$$inline: true
    		});

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			create_component(todoitem.$$.fragment);
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);
    			mount_component(todoitem, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const todoitem_changes = {};
    			if (dirty & /*$state*/ 1) todoitem_changes.item = /*item*/ ctx[3];
    			todoitem.$set(todoitem_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(todoitem.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(todoitem.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(first);
    			destroy_component(todoitem, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(27:8) {#each $state.todolist as item (item.no)}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let div5;
    	let div1;
    	let div0;
    	let t1;
    	let button;
    	let t3;
    	let div4;
    	let div3;
    	let div2;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let dispose;
    	let each_value = /*$state*/ ctx[0].todolist;
    	const get_key = ctx => /*item*/ ctx[3].no;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			div0.textContent = ":: Todolist App";
    			t1 = space();
    			button = element("button");
    			button.textContent = "Add Todo";
    			t3 = space();
    			div4 = element("div");
    			div3 = element("div");
    			div2 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div0, "class", "title");
    			add_location(div0, file$4, 18, 8, 362);
    			attr_dev(div1, "class", "well");
    			add_location(div1, file$4, 17, 4, 334);
    			attr_dev(button, "class", "btn btn-primary");
    			add_location(button, file$4, 22, 4, 444);
    			attr_dev(div2, "class", "row");
    			add_location(div2, file$4, 25, 8, 610);
    			attr_dev(div3, "class", "panel-body");
    			add_location(div3, file$4, 24, 4, 576);
    			attr_dev(div4, "class", "panel panel-default panel-borderless");
    			add_location(div4, file$4, 23, 4, 520);
    			attr_dev(div5, "class", "container");
    			add_location(div5, file$4, 16, 0, 305);
    			dispose = listen_dev(button, "click", /*goAddTodo*/ ctx[2], false, false, false);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div1);
    			append_dev(div1, div0);
    			append_dev(div5, t1);
    			append_dev(div5, button);
    			append_dev(div5, t3);
    			append_dev(div5, div4);
    			append_dev(div4, div3);
    			append_dev(div3, div2);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div2, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const each_value = /*$state*/ ctx[0].todolist;
    			group_outros();
    			each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div2, outro_and_destroy_block, create_each_block, null, get_each_context);
    			check_outros();
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let $state;
    	validate_store(state, "state");
    	component_subscribe($$self, state, $$value => $$invalidate(0, $state = $$value));
    	let callbacks = { deleteTodo, toggleDone };

    	let goAddTodo = () => {
    		src_2("add");
    	};

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("callbacks" in $$props) $$invalidate(1, callbacks = $$props.callbacks);
    		if ("goAddTodo" in $$props) $$invalidate(2, goAddTodo = $$props.goAddTodo);
    		if ("$state" in $$props) state.set($state = $$props.$state);
    	};

    	return [$state, callbacks, goAddTodo];
    }

    class TodoList extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TodoList",
    			options,
    			id: create_fragment$6.name
    		});
    	}
    }

    const routes = [
      { name: '/', component: TodoList },
      { name: 'update/:no', component: UpdateTodo },
      { name: 'add', component:AddTodo },
    ];

    /* src\AppContainer.svelte generated by Svelte v3.16.5 */
    const file$5 = "src\\AppContainer.svelte";

    function create_fragment$7(ctx) {
    	let div1;
    	let div0;
    	let current;
    	const router = new src_5({ props: { routes }, $$inline: true });

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			create_component(router.$$.fragment);
    			attr_dev(div0, "class", "container");
    			add_location(div0, file$5, 7, 2, 119);
    			attr_dev(div1, "id", "root");
    			add_location(div1, file$5, 6, 0, 100);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			mount_component(router, div0, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_component(router);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    class AppContainer extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, null, create_fragment$7, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "AppContainer",
    			options,
    			id: create_fragment$7.name
    		});
    	}
    }

    const app = new AppContainer({
      target: document.getElementById("root")
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
